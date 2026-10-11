import React, { useState, useMemo } from 'react';
import { TestData, UserAnswers, Question, ReadingSection, TIMED_OUT_ANSWER } from '../types';
import { estimateFromTest } from '../services/adaptiveEngine';
import { RefreshCw, Printer, CheckCircle, XCircle, Download, ChevronRight, ChevronLeft, Volume2, Sparkles, Filter, Loader2, Headphones, TrendingUp, AlertTriangle, Award, Target, BookOpen, Brain } from 'lucide-react';

interface ResultsViewProps {
  data: TestData;
  answers: UserAnswers;
  onRestart: () => void;
  onPrint: () => void;
  onPrintVocab: () => void;
  onCreateTwinQuiz: () => void;
  isCreatingTwin?: boolean;
}

interface DomainAnalysis {
  domain: string;
  type: string;
  total: number;
  correct: number;
  percentage: number;
  coachingTip: string;
}

// Domain-specific coaching tips mapped by keyword
const getDomainCoachingTip = (domain: string, type: string, percentage: number): string => {
  const d = domain.toLowerCase();
  
  if (percentage >= 80) {
    return "해당 영역의 이해도가 매우 뛰어납니다! 현재의 독서 감각을 잘 유지해주세요.";
  }

  if (d.includes('comprehension strategies')) {
    return "중심 내용·세부 정보·원인과 결과를 지문에서 근거 문장으로 확인하고, 행간의 의미를 추론하는 연습이 필요합니다.";
  }
  if (d.includes('literary')) {
    return "인물의 말과 행동에서 성격·동기를 찾고, 사건 흐름과 주제(교훈)를 정리하며 읽어보세요.";
  }
  if (d.includes('argument')) {
    return "사실과 의견을 구분하고, 글쓴이의 주장을 뒷받침하는 이유·근거를 찾아 표시하며 읽어보세요.";
  }
  if (d.includes('word knowledge')) {
    return "빈칸 앞뒤의 단서(정의·예시·반대말)로 단어를 고르고, 접두사·접미사로 뜻을 조립하는 연습을 하세요.";
  }
  if (d.includes('inference') || d.includes('추론')) {
    return "지문에 직접 나오지 않는 행간의 의미와 복선을 연결해보는 연습이 필요합니다.";
  }
  if (d.includes('author') || d.includes('craft') || d.includes('표현')) {
    return "작가가 분위기나 주제 전달을 위해 사용한 비유법, 수사적 장치를 유심히 살펴보세요.";
  }
  if (d.includes('character') || d.includes('성격') || d.includes('인물')) {
    return "인물의 대사와 행동 묘사 속에서 성격과 행동 동기를 찾는 유추 훈련을 추천합니다.";
  }
  if (d.includes('genre') || d.includes('장르')) {
    return "픽션, 논픽션, 우화 등 글의 구조적 특징과 목적을 파악하는 구분을 다져보세요.";
  }
  if (d.includes('morphology') || d.includes('어원') || d.includes('접두')) {
    return "접두사/접미사와 어근을 분해하여 단어의 의미를 조립하는 어휘력을 보완하세요.";
  }
  if (d.includes('vocab') || d.includes('context') || type === 'VOCAB') {
    return "단순 사전적 정의보다 문장 전체 문맥 속에서 단어가 가지는 느낌과 유의어를 파악하세요.";
  }
  if (type === 'GRAMMAR') {
    return "문장 구조와 시제, 표준 문법 규칙을 다양한 예문으로 반복 학습해보세요.";
  }
  if (type === 'LISTENING') {
    return "원어민 오디오 스크립트의 핵심 키워드를 놓치지 않고 경청하는 집중력이 요구됩니다.";
  }
  return "해당 유형의 문제를 다시 차근차근 풀며 오답 해설을 주의 깊게 읽어보세요.";
};

export const ResultsView: React.FC<ResultsViewProps> = ({ 
  data, 
  answers, 
  onRestart, 
  onPrint, 
  onPrintVocab,
  onCreateTwinQuiz,
  isCreatingTwin = false
}) => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'review' | 'vocab'>('analysis');
  const [vocabIndex, setVocabIndex] = useState(0);
  const [showOnlyWrong, setShowOnlyWrong] = useState(false);
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('ALL');

  const readingQuestions = data.reading.flatMap(r => r.questions);
  // 오답 노트에서 지문을 다시 볼 수 있도록 문항 id → 지문 매핑
  const passageByQuestionId = new Map<number, ReadingSection>(
    data.reading.flatMap(r => r.questions.map(q => [q.id, r] as [number, ReadingSection]))
  );
  const listeningQuestions = data.listening || [];
  
  const allQuestions: Question[] = [
    ...data.vocabulary, 
    ...data.grammar, 
    ...readingQuestions,
    ...listeningQuestions
  ];
  
  const totalQuestions = allQuestions.length;
  
  const correctCount = allQuestions.reduce((acc, q) => {
    return acc + (answers[q.id] === q.correctAnswer ? 1 : 0);
  }, 0);

  const incorrectCount = totalQuestions - correctCount;
  const percentage = Math.round((correctCount / totalQuestions) * 100);

  // Group performance by Type and Domain
  const { domainStats, typeStats, strengths, weaknesses } = useMemo(() => {
    const domainMap = new Map<string, { domain: string; type: string; total: number; correct: number }>();
    const typeMap = new Map<string, { type: string; total: number; correct: number }>();

    allQuestions.forEach(q => {
      const dKey = q.domain || q.type;
      const tKey = q.type;

      // Domain aggregation
      const dExisting = domainMap.get(dKey) || { domain: dKey, type: q.type, total: 0, correct: 0 };
      dExisting.total += 1;
      if (answers[q.id] === q.correctAnswer) dExisting.correct += 1;
      domainMap.set(dKey, dExisting);

      // Type aggregation
      const tExisting = typeMap.get(tKey) || { type: tKey, total: 0, correct: 0 };
      tExisting.total += 1;
      if (answers[q.id] === q.correctAnswer) tExisting.correct += 1;
      typeMap.set(tKey, tExisting);
    });

    const dList: DomainAnalysis[] = Array.from(domainMap.values()).map(s => {
      const pct = Math.round((s.correct / s.total) * 100);
      return {
        ...s,
        percentage: pct,
        coachingTip: getDomainCoachingTip(s.domain, s.type, pct)
      };
    }).sort((a, b) => b.percentage - a.percentage);

    const tList = Array.from(typeMap.values()).map(s => ({
      ...s,
      percentage: Math.round((s.correct / s.total) * 100)
    }));

    const str = dList.filter(s => s.percentage >= 75);
    const weak = dList.filter(s => s.percentage < 75);

    return { domainStats: dList, typeStats: tList, strengths: str, weaknesses: weak };
  }, [allQuestions, answers]);

  const nextVocab = () => setVocabIndex((prev) => (prev + 1) % data.keyVocabulary.length);
  const prevVocab = () => setVocabIndex((prev) => (prev - 1 + data.keyVocabulary.length) % data.keyVocabulary.length);

  const speakWord = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const filteredQuestions = allQuestions.filter(q => {
    if (showOnlyWrong && answers[q.id] === q.correctAnswer) return false;
    if (selectedDomainFilter !== 'ALL' && (q.domain || q.type) !== selectedDomainFilter) return false;
    return true;
  });

  const getGradeComment = (pct: number) => {
    if (pct >= 90) return { title: "Super Star Reader!", desc: "모든 영역에서 균형 잡힌 뛰어난 독해력과 어휘력을 보여주고 있습니다." };
    if (pct >= 75) return { title: "Great Reading Potential!", desc: "전반적으로 우수한 성취도입니다. 일부 약점 영역만 보완하면 상위 레벨 도약이 가능합니다." };
    if (pct >= 50) return { title: "Developing Reader", desc: "기본적인 내용 파악은 양호하지만, 문맥 추론 및 어휘 응용 훈련이 더 요구됩니다." };
    return { title: "Needs Practice & Review", desc: "어휘 기초 다지기와 핵심 지문 차근차근 읽기 연습을 꾸준히 이어가보세요!" };
  };

  const gradeInfo = getGradeComment(percentage);
  // 적응형 시험에서만 의미 있는 추정 레벨 (난이도가 다른 문항을 풀었으므로 정답률보다 이 값이 핵심)
  const estimate = data.adaptive ? estimateFromTest(data, answers) : null;
  const headline = estimate ? (() => {
    const diff = estimate.level - data.adaptive!.startLevel;
    if (diff >= 0.5) return { title: "Above the Starting Level!", desc: "시작 레벨보다 높은 수준의 문제까지 해결했습니다. 한 단계 높은 책에 도전해 보세요." };
    if (diff > -0.5) return { title: "Right on Level", desc: "시작 레벨과 비슷한 수준으로 측정되었습니다. 약점 영역을 보완하면 다음 단계로 올라갈 수 있습니다." };
    return { title: "Building Up", desc: "시작 레벨보다 조금 낮게 측정되었습니다. 추정 지수 근처 수준의 책으로 기초를 다져보세요." };
  })() : gradeInfo;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 border border-black">
        {/* Top Banner Score Display */}
        <div className="bg-black p-8 text-white text-center relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-widest bg-gray-800 text-gray-200 px-3 py-1 rounded-full mb-3 inline-block border border-gray-700">
              SR Level {data.srLevel} Assessment Result
            </span>
            {estimate ? (
              <>
                <div className="text-xs font-bold text-gray-300 mt-1">추정 SR 지수 (Grade Equivalent)</div>
                <div className="text-6xl font-extrabold my-2">{estimate.level.toFixed(1)}</div>
                <p className="text-sm text-gray-300 mb-2">
                  추정 범위 {estimate.low.toFixed(1)} ~ {estimate.high.toFixed(1)} · 시작 레벨 {data.adaptive!.startLevel.toFixed(1)} · 정답률 {percentage}%
                </p>
                <p className="text-[11px] text-gray-400 max-w-lg mx-auto mb-3">
                  AI가 만든 문항의 예상 난이도로 계산한 참고용 추정치입니다. Renaissance 공식 척도점수(SS)나 GE와 같지 않습니다.
                  적응형 시험은 정답률이 50~70% 안팎이 되도록 난이도가 맞춰지므로 정답률보다 추정 지수를 보세요.
                </p>
              </>
            ) : (
              <div className="text-6xl font-extrabold my-2">{percentage}%</div>
            )}
            <p className="text-lg font-bold text-gray-200 mb-1">{headline.title}</p>
            <p className="text-sm opacity-80 max-w-lg mx-auto">{headline.desc}</p>
            <div className="mt-4 text-xs font-medium text-gray-400">
              총 {totalQuestions}문항 중 <span className="text-green-400 font-bold">{correctCount}개 정답</span> / <span className="text-red-400 font-bold">{incorrectCount}개 오답</span>
            </div>
          </div>
        </div>
        
        {/* Tab Selection */}
        <div className="p-3 bg-gray-100 border-b border-gray-300 flex justify-center space-x-2 flex-wrap gap-2">
          <button 
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center ${activeTab === 'analysis' ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'}`}
          >
            <Brain className="w-4 h-4 mr-1.5" />
            유형별 강약점 분석
          </button>

          <button 
            onClick={() => setActiveTab('review')}
            className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center ${activeTab === 'review' ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'}`}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            오답 노트 & 문제 풀이 ({incorrectCount})
          </button>

          <button 
            onClick={() => setActiveTab('vocab')}
            className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center ${activeTab === 'vocab' ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'}`}
          >
            <BookOpen className="w-4 h-4 mr-1.5" />
            핵심 어휘 단어장 ({data.keyVocabulary.length})
          </button>
        </div>

        <div className="p-6 md:p-8">
          {/* TAB 1: DIAGNOSTIC STRENGTH & WEAKNESS ANALYSIS */}
          {activeTab === 'analysis' && (
            <div className="space-y-8">
              {/* Strengths & Weaknesses Highlight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Strength Card */}
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-emerald-200">
                    <Award className="w-6 h-6 text-emerald-700" />
                    <h3 className="font-extrabold text-lg text-emerald-950">강점 영역 (Strengths)</h3>
                  </div>

                  {strengths.length === 0 ? (
                    <p className="text-sm text-emerald-800 italic">
                      아직 강점으로 분류된 높은 정답률 영역이 없습니다. 오답 노트로 약점을 먼저 다져보세요!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {strengths.map((s, idx) => (
                        <div key={idx} className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-black text-sm">{s.domain}</span>
                            <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                              {s.correct}/{s.total} ({s.percentage}%)
                            </span>
                          </div>
                          <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                            {s.coachingTip}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weakness Card */}
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-amber-200">
                    <AlertTriangle className="w-6 h-6 text-amber-700" />
                    <h3 className="font-extrabold text-lg text-amber-950">보완 필요 영역 (Weaknesses)</h3>
                  </div>

                  {weaknesses.length === 0 ? (
                    <div className="bg-white p-4 rounded-xl border border-amber-200 text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-bold text-amber-950 text-sm">약점 영역이 없습니다!</p>
                      <p className="text-xs text-amber-800 mt-1">모든 문제 영역을 훌륭하게 소화하고 있습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {weaknesses.map((s, idx) => (
                        <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-black text-sm">{s.domain}</span>
                            <span className="text-xs font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                              {s.correct}/{s.total} ({s.percentage}%)
                            </span>
                          </div>
                          <p className="text-xs text-amber-900 leading-relaxed font-medium">
                            💡 <span className="font-bold">학습 조언:</span> {s.coachingTip}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Full Domain Progress Breakdown */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-300">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-extrabold text-black flex items-center">
                      <Target className="w-5 h-5 mr-2 text-black" />
                      세부 영역별 정답률 분석
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">클릭하면 해당 영역 문제만 모아볼 수 있습니다.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {domainStats.map((stat, idx) => (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedDomainFilter(stat.domain);
                        setActiveTab('review');
                      }}
                      className="bg-white p-4 rounded-xl border border-gray-200 hover:border-black transition-all cursor-pointer shadow-sm group"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-black text-white">
                            {stat.type}
                          </span>
                          <span className="font-bold text-black text-sm group-hover:underline">
                            {stat.domain}
                          </span>
                        </div>
                        <span className="text-sm font-extrabold text-black">
                          {stat.correct} / {stat.total}개 ({stat.percentage}%)
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-3 transition-all duration-500 rounded-full ${
                            stat.percentage >= 80 ? 'bg-emerald-500' : stat.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${stat.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Action Footer */}
              <div className="flex flex-wrap justify-center gap-4 pt-4 border-t border-gray-200">
                {incorrectCount > 0 && (
                  <button 
                    onClick={onCreateTwinQuiz}
                    disabled={isCreatingTwin}
                    className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg text-sm"
                  >
                    {isCreatingTwin ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    약점 보완용 쌍둥이 문제 풀어보기
                  </button>
                )}

                <button 
                  onClick={() => setActiveTab('review')}
                  className="flex items-center px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-xl font-bold transition-all shadow-md text-sm"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  전체 오답노트 확인하기
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: REVIEW & ANSWERS */}
          {activeTab === 'review' && (
            <>
              {/* Action Bar */}
              <div className="flex flex-wrap justify-between items-center gap-3 mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                  <span className="text-xs font-bold text-gray-500">영역 필터:</span>
                  <select
                    value={selectedDomainFilter}
                    onChange={(e) => setSelectedDomainFilter(e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-black text-xs font-bold rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-black outline-none"
                  >
                    <option value="ALL">전체 영역 ({allQuestions.length}문항)</option>
                    {domainStats.map(s => (
                      <option key={s.domain} value={s.domain}>{s.domain} ({s.correct}/{s.total})</option>
                    ))}
                  </select>

                  <button 
                    onClick={() => setShowOnlyWrong(!showOnlyWrong)}
                    className={`flex items-center text-xs font-bold px-3 py-1.5 rounded-lg transition-all border ${showOnlyWrong ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-300'}`}
                  >
                    <Filter className="w-3.5 h-3.5 mr-1" />
                    {showOnlyWrong ? '틀린 문제만 보는 중' : '전체 보기'}
                  </button>
                </div>

                <div className="flex space-x-2">
                  {incorrectCount > 0 && (
                    <button 
                      onClick={onCreateTwinQuiz}
                      disabled={isCreatingTwin}
                      className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-bold transition-colors shadow-md disabled:opacity-70"
                    >
                      {isCreatingTwin ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      쌍둥이 문제 생성
                    </button>
                  )}
                  <button 
                    onClick={onPrint}
                    className="flex items-center px-3 py-1.5 bg-black hover:bg-gray-800 text-white text-xs rounded-lg font-bold transition-colors shadow-md"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    인쇄/PDF
                  </button>
                </div>
              </div>
              
              {/* Question List */}
              <div className="space-y-6">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-gray-200">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p className="font-bold text-black text-base">선택한 조건에 해당하는 문제가 없습니다.</p>
                    <button 
                      onClick={() => { setSelectedDomainFilter('ALL'); setShowOnlyWrong(false); }}
                      className="mt-3 text-xs text-blue-600 font-bold underline"
                    >
                      필터 초기화하기
                    </button>
                  </div>
                ) : (
                  filteredQuestions.map((q) => {
                    const isCorrect = answers[q.id] === q.correctAnswer;
                    const originalIndex = allQuestions.findIndex(aq => aq.id === q.id);

                    return (
                      <div key={q.id} className={`p-5 rounded-2xl border-2 transition-all ${isCorrect ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-start mb-3">
                          <span className="font-extrabold text-black mr-3 text-lg">{originalIndex + 1}.</span>
                          <div className="flex-grow">
                            <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
                              <span className="text-xs font-extrabold bg-black text-white px-2 py-0.5 rounded">
                                {q.type}
                              </span>
                              <span className="text-xs font-bold bg-gray-200 text-gray-800 px-2 py-0.5 rounded">
                                {q.domain}
                              </span>
                              {q.skill && (
                                <span className="text-xs font-bold bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded">
                                  {q.skill}
                                </span>
                              )}
                              {q.type === 'LISTENING' && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                                  <Headphones className="w-3 h-3 mr-1" /> Listening
                                </span>
                              )}
                            </div>
                            {passageByQuestionId.has(q.id) && (
                              <details className="mb-2 text-sm">
                                <summary className="cursor-pointer font-bold text-gray-600">지문 다시 보기</summary>
                                <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200 font-serif text-gray-900 leading-relaxed">
                                  {passageByQuestionId.get(q.id)!.passageTitle && (
                                    <p className="font-bold mb-1">{passageByQuestionId.get(q.id)!.passageTitle}</p>
                                  )}
                                  {passageByQuestionId.get(q.id)!.passageContent.split('\n').map((para, i) => (
                                    <p key={i} className="mb-2">{para}</p>
                                  ))}
                                </div>
                              </details>
                            )}
                            <p className="font-bold text-black text-base md:text-lg leading-snug" dangerouslySetInnerHTML={{ __html: q.question }} />
                            
                            {q.type === 'LISTENING' && q.script && (
                              <div className="mt-2 p-3 bg-white rounded-lg text-sm text-gray-800 italic border-l-4 border-blue-400 shadow-sm">
                                <span className="font-bold not-italic text-blue-900 block text-xs uppercase mb-1">Listening Script:</span>
                                "{q.script}"
                                <button 
                                  onClick={() => speakWord(q.script!)}
                                  className="ml-2 inline-block align-middle text-blue-600 hover:text-blue-800"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {isCorrect ? (
                            <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0 ml-2" />
                          ) : (
                            <XCircle className="w-7 h-7 text-red-600 flex-shrink-0 ml-2" />
                          )}
                        </div>
                        
                        <div className="ml-8 text-sm space-y-2 pt-2 border-t border-gray-200">
                          <div className="flex items-center text-black">
                            <span className="w-24 font-bold text-gray-600">선택한 답:</span>
                            <span className={`${!isCorrect ? 'text-red-600 font-extrabold underline' : 'text-black font-bold'}`}>
                              {answers[q.id] === TIMED_OUT_ANSWER ? '시간 초과' : q.options[answers[q.id]] !== undefined ? q.options[answers[q.id]] : '미응답'}
                            </span>
                          </div>
                          {!isCorrect && (
                            <div className="flex items-center text-black">
                              <span className="w-24 font-bold text-green-700">정답:</span>
                              <span className="text-green-700 font-bold">{q.options[q.correctAnswer]}</span>
                            </div>
                          )}

                          {/* Pedagogical Growth Coaching Explanation */}
                          <div className="mt-3 p-3 bg-white rounded-xl border border-gray-300 text-black">
                            <span className="font-extrabold text-xs bg-black text-white px-2 py-0.5 rounded mr-2 uppercase">
                              생각하며 읽는 질문형 코칭
                            </span>
                            <p className="mt-1.5 text-sm leading-relaxed text-gray-800 font-medium">
                              {q.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* TAB 3: KEY VOCABULARY FLASHCARDS */}
          {activeTab === 'vocab' && (
            <div className="text-center">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-black">Key Vocabulary Flashcards</h3>
                <button 
                  onClick={onPrintVocab}
                  className="flex items-center px-4 py-2 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg text-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  어휘 연습지(쓰기용) 다운로드
                </button>
              </div>

              {/* Flashcard Component */}
              <div className="max-w-md mx-auto bg-gray-50 border-2 border-black rounded-2xl p-8 shadow-inner relative min-h-[350px] flex flex-col justify-center">
                <div className="absolute top-4 left-4 text-xs font-bold text-gray-400">
                  {vocabIndex + 1} / {data.keyVocabulary.length}
                </div>
                
                <div className="flex items-center justify-center gap-3 mb-2">
                  <h4 className="text-4xl font-extrabold text-black">{data.keyVocabulary[vocabIndex].word}</h4>
                  <button 
                    onClick={() => speakWord(data.keyVocabulary[vocabIndex].word)}
                    className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                    title="Listen to pronunciation"
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                </div>
                
                <p className="text-sm text-gray-500 mb-4 font-medium italic">{data.keyVocabulary[vocabIndex].definition}</p>
                <p className="text-xl text-gray-900 mb-6 font-bold">{data.keyVocabulary[vocabIndex].meaning}</p>

                <div className="text-left bg-white p-4 rounded-xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Example Sentence</p>
                  <p className="text-black italic">"{data.keyVocabulary[vocabIndex].example}"</p>
                </div>
              </div>

              <div className="flex justify-center mt-8 space-x-6">
                <button onClick={prevVocab} className="p-3 bg-white border-2 border-black rounded-full hover:bg-gray-100 transition-all">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={nextVocab} className="p-3 bg-white border-2 border-black rounded-full hover:bg-gray-100 transition-all">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.keyVocabulary.map((v, i) => (
                  <div 
                    key={i} 
                    className={`p-3.5 border rounded-xl text-left transition-all cursor-pointer flex justify-between items-center ${
                      vocabIndex === i ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:border-black'
                    }`} 
                    onClick={() => setVocabIndex(i)}
                  >
                    <div className="overflow-hidden">
                      <p className="font-bold text-sm">{v.word}</p>
                      <p className={`text-xs truncate ${vocabIndex === i ? 'text-gray-300' : 'text-gray-600'}`}>{v.meaning}</p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(v.word);
                      }}
                      className={`p-1 flex-shrink-0 ml-2 ${vocabIndex === i ? 'text-white' : 'text-gray-400 hover:text-blue-600'}`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
