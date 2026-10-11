import React, { useState, useEffect } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuizMode } from './components/QuizMode';
import { PrintLayout } from './components/PrintLayout';
import { ResultsView } from './components/ResultsView';
import { VocabWorksheet } from './components/VocabWorksheet';
import { HistoryView } from './components/HistoryView';
import { generateSRTest, generateTwinTest } from './services/geminiClient';
import { TestData, UserAnswers, TestSession } from './types';
import type { TestLength } from './services/srBlueprint';
import { administerNext, totalQuestionCount } from './services/adaptiveEngine';
import { initAuthListener, testFirestoreConnection } from './services/firebase';
import { saveTestSession, fetchUserTestSessions, removeTestSession } from './services/storageService';
import { History, BookOpen, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';

enum AppMode {
  WELCOME,
  QUIZ,
  RESULTS,
  PRINT,
  VOCAB_WORKSHEET,
  HISTORY
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.WELCOME);
  const [loading, setLoading] = useState(false);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [isTwinMode, setIsTwinMode] = useState(false);

  // Persistence & Session State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [user, setUser] = useState<User | null>(null);

  // Initialize Auth & Firestore Listener on mount
  useEffect(() => {
    testFirestoreConnection();
    const unsubscribe = initAuthListener(async (authUser) => {
      setUser(authUser);
      if (authUser) {
        const userSessions = await fetchUserTestSessions();
        setSessions(userSessions);
      }
    });

    // Also load local sessions immediately
    fetchUserTestSessions().then(setSessions);

    return () => unsubscribe();
  }, []);

  const refreshSessions = async () => {
    const updated = await fetchUserTestSessions();
    setSessions(updated);
  };

  const handleStart = async (srLevel: string, includeListening: boolean, testLength: TestLength, timed: boolean, extendedTime: boolean) => {
    setLoading(true);
    setError(null);
    setIsTwinMode(false);
    try {
      const generated: TestData = { ...(await generateSRTest(srLevel, includeListening, testLength)), timed, extendedTime };
      // 적응형 시험: 시작 레벨에 맞춰 첫 문항을 고른다.
      const first = administerNext(generated, {});
      const data = first.kind === 'added' ? first.data : generated;
      setTestData(data);
      setUserAnswers({});
      setCurrentStep(0);

      // Create new TestSession
      const newSessionId = 'sr_' + Date.now();
      setCurrentSessionId(newSessionId);

      const newSession: TestSession = {
        id: newSessionId,
        userId: user?.uid || 'guest',
        srLevel,
        status: 'IN_PROGRESS',
        currentStep: 0,
        score: 0,
        totalQuestions: totalQuestionCount(data),
        correctCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        testData: data,
        userAnswers: {},
        isTwinMode: false
      };

      await saveTestSession(newSession);
      await refreshSessions();

      setMode(AppMode.QUIZ);
    } catch (err) {
      setError("AI 서비스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseAndSave = async (answers: UserAnswers, step: number, latestData?: TestData) => {
    setUserAnswers(answers);
    setCurrentStep(step);
    if (latestData) setTestData(latestData);
    const current = latestData || testData;

    if (currentSessionId && current) {
      const existingSession = sessions.find(s => s.id === currentSessionId);
      const updatedSession: TestSession = {
        id: currentSessionId,
        userId: user?.uid || 'guest',
        srLevel: current.srLevel,
        status: 'IN_PROGRESS',
        currentStep: step,
        score: existingSession?.score || 0,
        totalQuestions: totalQuestionCount(current),
        correctCount: existingSession?.correctCount || 0,
        createdAt: existingSession?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        testData: current,
        userAnswers: answers,
        isTwinMode
      };

      await saveTestSession(updatedSession);
      await refreshSessions();
    }
  };

  const handleQuizComplete = async (answers: UserAnswers, finalData?: TestData) => {
    setUserAnswers(answers);
    if (finalData) setTestData(finalData);
    const current = finalData || testData;

    if (!current) {
      setMode(AppMode.RESULTS);
      return;
    }

    const allQuestions = [
      ...current.vocabulary, 
      ...current.grammar, 
      ...current.reading.flatMap(r => r.questions),
      ...(current.listening || [])
    ];

    const correctCount = allQuestions.filter(q => answers[q.id] === q.correctAnswer).length;
    const totalQuestions = allQuestions.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const sessionId = currentSessionId || ('sr_' + Date.now());
    const existingSession = sessions.find(s => s.id === sessionId);

    const completedSession: TestSession = {
      id: sessionId,
      userId: user?.uid || 'guest',
      srLevel: current.srLevel,
      status: 'COMPLETED',
      currentStep: totalQuestions - 1,
      score,
      totalQuestions,
      correctCount,
      createdAt: existingSession?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      testData: current,
      userAnswers: answers,
      isTwinMode
    };

    await saveTestSession(completedSession);
    await refreshSessions();

    setMode(AppMode.RESULTS);
  };

  const handleResumeSession = (session: TestSession) => {
    setTestData(session.testData);
    setUserAnswers(session.userAnswers || {});
    setCurrentSessionId(session.id);
    setCurrentStep(session.currentStep || 0);
    setIsTwinMode(!!session.isTwinMode);
    
    if (session.status === 'COMPLETED') {
      setMode(AppMode.RESULTS);
    } else {
      setMode(AppMode.QUIZ);
    }
  };

  const handleStartTwinQuiz = async () => {
    if (!testData) return;
    
    const allQuestions = [
      ...testData.vocabulary, 
      ...testData.grammar, 
      ...testData.reading.flatMap(r => r.questions),
      ...(testData.listening || [])
    ];
    const wrongQuestions = allQuestions.filter(q => userAnswers[q.id] !== q.correctAnswer);

    if (wrongQuestions.length === 0) {
      alert("틀린 문제가 없어 쌍둥이 문제를 생성할 수 없습니다.");
      return;
    }

    setLoading(true); 
    try {
      const twinData = await generateTwinTest(wrongQuestions, testData.srLevel);
      setTestData(twinData);
      setUserAnswers({});
      setIsTwinMode(true);
      setCurrentStep(0);

      const newTwinSessionId = 'sr_twin_' + Date.now();
      setCurrentSessionId(newTwinSessionId);

      const newSession: TestSession = {
        id: newTwinSessionId,
        userId: user?.uid || 'guest',
        srLevel: testData.srLevel,
        status: 'IN_PROGRESS',
        currentStep: 0,
        score: 0,
        totalQuestions: totalQuestionCount(twinData),
        correctCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        testData: twinData,
        userAnswers: {},
        isTwinMode: true
      };

      await saveTestSession(newSession);
      await refreshSessions();

      setMode(AppMode.QUIZ);
    } catch (err) {
      setError("쌍둥이 문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    await removeTestSession(sessionId);
    await refreshSessions();
  };

  const handleRestart = () => {
    setTestData(null);
    setUserAnswers({});
    setCurrentSessionId(null);
    setCurrentStep(0);
    setIsTwinMode(false);
    setMode(AppMode.WELCOME);
  };

  const inProgressSession = sessions.find(s => s.status === 'IN_PROGRESS');

  // Render Logic for Print & Worksheet
  if (mode === AppMode.PRINT && testData) {
    return <PrintLayout data={testData} onBack={() => setMode(Object.keys(userAnswers).length > 0 ? AppMode.RESULTS : AppMode.QUIZ)} />;
  }

  if (mode === AppMode.VOCAB_WORKSHEET && testData) {
    return <VocabWorksheet data={testData} onBack={() => setMode(AppMode.RESULTS)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 no-print shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <button 
            onClick={handleRestart}
            className="flex items-center space-x-2 text-left focus:outline-none"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-xl ${isTwinMode ? 'bg-blue-600' : 'bg-black'}`}>
              S
            </div>
            <span className="font-extrabold text-lg text-gray-900 flex items-center">
              Mini SR Test {isTwinMode && <span className="text-blue-600 text-xs ml-2 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">(Twin Mode)</span>}
            </span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                refreshSessions();
                setMode(AppMode.HISTORY);
              }}
              className={`flex items-center space-x-1.5 text-xs md:text-sm font-bold px-3 py-1.5 rounded-lg border transition-all ${mode === AppMode.HISTORY ? 'bg-black text-white border-black' : 'bg-gray-100 text-black border-gray-300 hover:bg-gray-200'}`}
            >
              <History className="w-4 h-4" />
              <span>기록 및 오답 ({sessions.length})</span>
            </button>

            {mode !== AppMode.WELCOME && (
               <button 
                onClick={handleRestart} 
                className="text-xs md:text-sm text-gray-600 hover:text-black font-bold px-2 py-1 rounded hover:bg-gray-100"
               >
                 처음으로
               </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4 md:p-6 flex-grow w-full">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-center border border-red-200 font-medium">
            {error}
          </div>
        )}

        {mode === AppMode.WELCOME && (
          <WelcomeScreen 
            onStart={handleStart} 
            onOpenHistory={() => setMode(AppMode.HISTORY)}
            onResumeSession={handleResumeSession}
            inProgressSession={inProgressSession}
            isLoading={loading} 
          />
        )}

        {mode === AppMode.HISTORY && (
          <HistoryView
            sessions={sessions}
            onResumeSession={handleResumeSession}
            onViewResults={(s) => {
              handleResumeSession(s);
              setMode(AppMode.RESULTS);
            }}
            onPrintSession={(s) => {
              handleResumeSession(s);
              setMode(AppMode.PRINT);
            }}
            onDeleteSession={handleDeleteSession}
            onNewTest={handleRestart}
            onSynced={refreshSessions}
          />
        )}

        {mode === AppMode.QUIZ && testData && (
          <QuizMode 
            data={testData} 
            initialAnswers={userAnswers}
            initialStep={currentStep}
            onComplete={handleQuizComplete}
            onPrintMode={() => setMode(AppMode.PRINT)} 
            onPauseAndSave={handlePauseAndSave}
          />
        )}

        {mode === AppMode.RESULTS && testData && (
          <ResultsView 
            data={testData} 
            answers={userAnswers} 
            onRestart={handleRestart}
            onPrint={() => setMode(AppMode.PRINT)}
            onPrintVocab={() => setMode(AppMode.VOCAB_WORKSHEET)}
            onCreateTwinQuiz={handleStartTwinQuiz}
            isCreatingTwin={loading}
          />
        )}
      </main>
      
      <footer className="mt-auto py-8 text-center text-gray-500 text-sm bg-gray-100 border-t border-gray-200 no-print">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-4 space-y-1">
            <p className="font-medium text-gray-700">Developed by 송동석 / Teacher, Data Analytics, App Developer</p>
            <p className="text-gray-500">협업 및 피드백: dungst.me@gmail.com</p>
          </div>
          <p className="font-bold text-gray-400">2026. Mini SR test</p>
          <p className="text-xs mt-2 opacity-60">AI-generated content may vary. Use for practice only.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
