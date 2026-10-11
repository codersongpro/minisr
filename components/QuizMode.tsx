import React, { useState, useRef, useEffect } from 'react';
import { RichText } from './RichText';
import { stripMarkup } from '../services/markup';
import { TestData, UserAnswers, TIMED_OUT_ANSWER } from '../types';
import { ChevronRight, ChevronLeft, Check, FileText, Volume2, StopCircle, Loader2, HelpCircle, PauseCircle, Clock } from 'lucide-react';
import { generateSpeech } from '../services/geminiClient';
import { getTimeLimits } from '../services/srBlueprint';
import { addPassagePool, addVocabPool, administerNext, nextPassageSpecs, shouldPrefetchPassages, shouldRefreshVocab, stripPools, totalQuestionCount, vocabRefreshDifficulties } from '../services/adaptiveEngine';
import { generateVocabItems } from '../services/geminiClient';
import { fetchPassagePool } from '../services/adaptivePool';

// 실제 Star Reading은 남은 시간이 15초일 때 경고를 띄운다.
const TIME_WARNING_SECONDS = 15;

interface QuizModeProps {
  data: TestData;
  initialAnswers?: UserAnswers;
  initialStep?: number;
  onComplete: (answers: UserAnswers, data: TestData) => void;
  onPrintMode: () => void;
  onPauseAndSave: (answers: UserAnswers, currentStep: number, data: TestData) => void;
}

// Helpers for PCM Decoding
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const QuizMode: React.FC<QuizModeProps> = ({ 
  data: initialData, 
  initialAnswers = {}, 
  initialStep = 0,
  onComplete, 
  onPrintMode,
  onPauseAndSave
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [answers, setAnswers] = useState<UserAnswers>(initialAnswers);
  const [showHint, setShowHint] = useState(false);

  // 적응형 시험은 풀이 중에 다음 문항이 추가되므로 시험 데이터를 컴포넌트 안에서 관리한다.
  const [data, setData] = useState<TestData>(initialData);
  const dataRef = useRef(data);
  const commitData = (next: TestData) => {
    dataRef.current = next;
    setData(next);
  };
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const advancingRef = useRef(false);
  const poolRequestRef = useRef<Promise<void> | null>(null);
  const vocabRequestRef = useRef<Promise<void> | null>(null);
  
  // Audio State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Flatten reading questions and attach passage info
  const readingQuestions = data.reading.flatMap(section => 
    section.questions.map(q => ({
      ...q,
      passageTitle: section.passageTitle,
      passageContent: section.passageContent
    }))
  );

  const listeningQuestions = data.listening || [];

  // Combine all questions
  const allQuestions = [
    ...data.vocabulary,
    ...data.grammar,
    ...readingQuestions,
    ...listeningQuestions
  ];

  const totalQuestions = Math.max(allQuestions.length, totalQuestionCount(data));
  const progress = ((currentStep + 1) / totalQuestions) * 100;
  
  const currentQuestion = allQuestions[currentStep];

  // 실전 모드: 문항별 제한시간 (어휘 문항과 지문 문항의 시간이 다르다)
  const timed = !!data.timed;
  const limits = getTimeLimits(data.srLevel, !!data.extendedTime);
  const timeLimit = currentQuestion.type === 'VOCAB' ? limits.vocabSeconds : limits.passageSeconds;
  const [timeLeft, setTimeLeft] = useState(timeLimit);

  useEffect(() => {
    if (!timed) return;
    setTimeLeft(timeLimit);
    // 다음 문제를 준비하는 동안에는 시간이 흐르지 않는다.
    const timer = setInterval(() => setTimeLeft(s => (preparingRef.current ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(timer);
  }, [currentStep, timed]);

  useEffect(() => {
    if (!timed || timeLeft > 0) return;
    // 시간이 끝나면 고른 답이 있으면 그대로, 없으면 미응답(오답)으로 넘어간다.
    const finalAnswers = answers[currentQuestion.id] === undefined
      ? { ...answers, [currentQuestion.id]: TIMED_OUT_ANSWER }
      : answers;
    setAnswers(finalAnswers);
    nextQuestion(finalAnswers);
  }, [timeLeft]);

  // Initialize Audio Context on mount
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    
    return () => {
      stopAudio();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Reset hint view when step changes
  useEffect(() => {
    setShowHint(false);
  }, [currentStep]);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore
      }
      sourceNodeRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoadingAudio(false);
  };

  // 학생 응답으로 능력을 추정해 다음 지문 문항 풀을 요청한다 (이미 요청 중이면 그 요청을 기다린다).
  const requestPassagePool = (currentAnswers: UserAnswers) => {
    if (poolRequestRef.current) return poolRequestRef.current;
    const base = dataRef.current;
    const state = base.adaptive!;
    const countsAsStage = state.stagesRequested < state.stageSizes.length;
    const request = fetchPassagePool(nextPassageSpecs(base, currentAnswers), state.startLevel)
      .then(({ sections, keyVocabulary }) => {
        commitData(addPassagePool(dataRef.current, sections, keyVocabulary, countsAsStage));
      })
      .finally(() => { poolRequestRef.current = null; });
    poolRequestRef.current = request;
    return request;
  };

  const prefetchIfNeeded = (current: TestData, currentAnswers: UserAnswers) => {
    if (shouldRefreshVocab(current) && !vocabRequestRef.current) {
      const state = current.adaptive!;
      // 보충에 실패해도 처음 받은 어휘 풀로 계속 진행할 수 있다.
      vocabRequestRef.current = generateVocabItems(vocabRefreshDifficulties(current, currentAnswers), String(state.startLevel))
        .then(({ vocabulary, keyVocabulary }) => commitData(addVocabPool(dataRef.current, vocabulary, keyVocabulary)))
        .catch(() => {})
        .finally(() => { vocabRequestRef.current = null; });
    }
    if (shouldPrefetchPassages(current)) {
      // 실패해도 다음 문항이 필요할 때 다시 요청한다.
      requestPassagePool(currentAnswers).catch(() => {});
    }
  };

  useEffect(() => {
    prefetchIfNeeded(dataRef.current, answers);
  }, []);

  const setPreparingState = (value: boolean) => {
    preparingRef.current = value;
    setPreparing(value);
  };

  const handleAnswer = (optionIndex: number) => {
    const updatedAnswers = {
      ...answers,
      [currentQuestion.id]: optionIndex
    };
    setAnswers(updatedAnswers);
    // Auto sync progress
    onPauseAndSave(updatedAnswers, currentStep, dataRef.current);
  };

  const nextQuestion = async (currentAnswers: UserAnswers = answers) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    stopAudio();
    setPrepareError(null);
    try {
      let next = dataRef.current;
      const administered = next.vocabulary.length + next.grammar.length + next.reading.reduce((n, s) => n + s.questions.length, 0);
      // 적응형: 마지막으로 출제된 문항까지 풀었으면 응답을 반영해 다음 문항을 고른다.
      if (next.adaptive && currentStep + 1 >= administered) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const result = administerNext(next, currentAnswers);
          if (result.kind === 'added') { next = result.data; break; }
          if (result.kind === 'done') break;
          setPreparingState(true);
          await requestPassagePool(currentAnswers);
          next = dataRef.current;
        }
        commitData(next);
      }

      const flatCount = next.vocabulary.length + next.grammar.length + next.reading.reduce((n, s) => n + s.questions.length, 0) + next.listening.length;
      if (currentStep < flatCount - 1) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        onPauseAndSave(currentAnswers, nextStep, next);
        if (next.adaptive) prefetchIfNeeded(next, currentAnswers);
      } else {
        onComplete(currentAnswers, stripPools(next));
      }
    } catch (error) {
      console.error('Failed to prepare next question:', error);
      setPrepareError('다음 문제를 준비하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setPreparingState(false);
      advancingRef.current = false;
    }
  };

  const prevQuestion = () => {
    stopAudio();
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onPauseAndSave(answers, prevStep, dataRef.current);
    }
  };

  const handlePlayGeminiAudio = async (text: string) => {
    if (isSpeaking) {
      stopAudio();
      return;
    }

    if (!audioContextRef.current) {
      alert("Audio not supported in this browser.");
      return;
    }

    setIsLoadingAudio(true);

    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const base64Audio = await generateSpeech(text);
      const pcmBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(
        pcmBytes,
        audioContextRef.current,
        24000,
        1
      );

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setIsSpeaking(false);
        sourceNodeRef.current = null;
      };

      sourceNodeRef.current = source;
      source.start();
      setIsSpeaking(true);

    } catch (error) {
      console.error("Audio playback error:", error);
      alert("오디오를 재생하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const isReadingSection = currentQuestion.type === 'READING';
  const isListeningSection = currentQuestion.type === 'LISTENING';
  
  const readingQuestion = isReadingSection ? (currentQuestion as any) : null;
  const isCloze = currentQuestion.question.includes('___');
  const selectedAnswer = answers[currentQuestion.id];
  const hasAnswer = selectedAnswer !== undefined && selectedAnswer !== TIMED_OUT_ANSWER;

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Top Header Controls & Progress */}
      <div className="mb-6 sticky top-0 bg-gray-50 pt-4 pb-3 z-10 border-b border-gray-200">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <div className="flex items-center space-x-3">
            <span className="text-base font-bold bg-black text-white px-3 py-1 rounded-lg">
              SR {data.srLevel}
            </span>
            <span className="text-sm font-semibold text-gray-600">
              Question {currentStep + 1} of {totalQuestions}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {timed && (
              <span
                className={`flex items-center text-sm font-bold px-3 py-1.5 rounded-lg border tabular-nums ${timeLeft <= TIME_WARNING_SECONDS ? 'bg-red-50 text-red-700 border-red-300 animate-pulse' : 'bg-white text-black border-gray-300'}`}
                title="문항별 제한시간이 지나면 다음 문제로 넘어갑니다."
              >
                <Clock className="w-4 h-4 mr-1" />
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            )}
            <button
              onClick={() => onPauseAndSave(answers, currentStep, dataRef.current)}
              className="flex items-center text-xs md:text-sm font-bold bg-white text-black border border-black hover:bg-gray-100 px-3 py-1.5 rounded-lg shadow-sm transition-all"
              title="현재 답변 및 진행 상태를 저장하고 홈으로 돌아갑니다."
            >
              <PauseCircle className="w-4 h-4 mr-1 text-black" />
              <span>일시정지 / 나중에 이어풀기</span>
            </button>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-black h-2.5 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Reading Passage Panel */}
        {isReadingSection && readingQuestion && (
          <div className="md:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-300 h-fit">
            <div className="flex items-center space-x-2 mb-4 pb-4 border-b border-gray-200">
              <FileText className="w-6 h-6 text-black" />
              <h3 className="font-bold text-xl text-black">Reading Passage</h3>
            </div>
            {readingQuestion.passageTitle && (
              <h4 className="text-2xl font-serif font-bold text-black mb-4">
                {readingQuestion.passageTitle}
              </h4>
            )}
            <div className="prose prose-lg text-black leading-loose font-serif max-w-none">
              {readingQuestion.passageContent.split('\n').map((para: string, idx: number) => (
                <p key={idx} className="mb-4 text-2xl text-black text-justify"><RichText text={para} /></p>
              ))}
            </div>
          </div>
        )}

        {/* Question Panel */}
        <div className={`${isReadingSection ? 'md:col-span-6' : 'md:col-span-8 md:col-start-3'} flex flex-col`}>
          <div className="bg-white p-8 rounded-2xl shadow-lg border-t-4 border-black flex-grow">
            {!timed && (
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
               <span className={`inline-block px-3 py-1 text-sm font-bold rounded-full ${isListeningSection ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-black'}`}>
                {currentQuestion.type}
              </span>
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wide text-right">
                {currentQuestion.domain}{currentQuestion.skill ? ` · ${currentQuestion.skill}` : ''}
              </span>
            </div>
            )}
            
            {/* Listening Audio Control */}
            {isListeningSection && currentQuestion.script && (
              <div className="mb-8 p-6 bg-blue-50 rounded-xl border-2 border-blue-100 flex flex-col items-center justify-center text-center">
                <p className="text-blue-900 font-bold mb-4 text-lg">Click to listen to the passage (Native Audio)</p>
                <button
                  onClick={() => handlePlayGeminiAudio(stripMarkup(currentQuestion.script))}
                  disabled={isLoadingAudio}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg 
                    ${isSpeaking 
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                      : 'bg-blue-600 hover:bg-blue-700'
                    }
                    ${isLoadingAudio ? 'opacity-75 cursor-not-allowed' : ''}
                  `}
                >
                  {isLoadingAudio ? (
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  ) : isSpeaking ? (
                    <StopCircle className="w-10 h-10 text-white" />
                  ) : (
                    <Volume2 className="w-10 h-10 text-white" />
                  )}
                </button>
                <p className="mt-3 text-sm text-blue-700 font-medium">
                  {isLoadingAudio ? "Loading audio..." : isSpeaking ? "Playing..." : "Tap to Play"}
                </p>
              </div>
            )}

            {/* Question Text */}
            {isCloze && (
              <p className="text-sm font-bold text-gray-600 mb-3">Choose the word that best completes the sentence.</p>
            )}
            <h2 
              className="text-xl md:text-2xl font-bold text-black mb-6 leading-snug"><RichText text={currentQuestion.question} /></h2>

            {/* Practice Hint Accordion (Matching Star Reading Practice sheets format) */}
            {currentQuestion.hint && !timed && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setShowHint(!showHint)}
                  className="flex items-center text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-300 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-black" />
                  <span>{showHint ? "힌트 접기" : "힌트 보기 (English Hint)"}</span>
                </button>

                {showHint && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 font-medium animate-fadeIn">
                    <span className="font-bold text-amber-950 mr-1">힌트:</span> <RichText text={currentQuestion.hint} />
                  </div>
                )}
              </div>
            )}

            {/* Answer Options */}
            <div className="space-y-4">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 flex items-center group
                    ${selectedAnswer === idx 
                      ? 'border-black bg-gray-100 text-black' 
                      : 'border-gray-300 hover:border-black hover:bg-white text-black'
                    }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 mr-5 flex items-center justify-center flex-shrink-0
                    ${selectedAnswer === idx 
                      ? 'border-black bg-black' 
                      : 'border-gray-400 group-hover:border-black'
                    }`}
                  >
                    {selectedAnswer === idx && <Check className="w-5 h-5 text-white" />}
                  </div>
                  <span className="text-xl font-medium text-black">{stripMarkup(option)}</span>
                </button>
              ))}
            </div>
          </div>

          {(preparing || prepareError) && (
            <div className={`mt-4 p-3 rounded-xl border text-sm font-bold flex items-center justify-between gap-3 ${prepareError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>
              {prepareError ? (
                <>
                  <span>{prepareError}</span>
                  <button onClick={() => nextQuestion()} className="shrink-0 bg-black text-white px-3 py-1.5 rounded-lg">다시 시도</button>
                </>
              ) : (
                <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" />응답에 맞춰 다음 문제를 준비하고 있어요...</span>
              )}
            </div>
          )}

          {/* Footer controls */}
          <div className="mt-6 flex justify-between items-center flex-wrap gap-4">
            <button
              onClick={onPrintMode}
              className="text-black underline text-sm md:text-base hover:text-gray-700 font-bold"
            >
              PDF로 저장 / 프린트 모드로 보기
            </button>
            
            <div className="flex gap-4">
              {!timed && (
              <button
                onClick={prevQuestion}
                disabled={currentStep === 0}
                className="bg-white hover:bg-gray-100 text-black border-2 border-black font-bold py-3.5 px-6 rounded-xl shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center text-lg"
              >
                <ChevronLeft className="w-6 h-6 mr-1" />
                <span>이전</span>
              </button>
              )}

              <button
                onClick={() => nextQuestion()}
                disabled={!hasAnswer || preparing}
                className="bg-black hover:bg-gray-800 text-white font-bold py-3.5 px-8 md:px-10 rounded-xl shadow-lg disabled:opacity-50 disabled:shadow-none transition-all flex items-center text-lg"
              >
                <span>{currentStep === totalQuestions - 1 ? '결과 제출하기' : '다음 문제'}</span>
                <ChevronRight className="w-6 h-6 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
