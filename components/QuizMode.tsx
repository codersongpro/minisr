import React, { useState, useRef, useEffect } from 'react';
import { TestData, UserAnswers } from '../types';
import { ChevronRight, ChevronLeft, Check, FileText, Volume2, StopCircle, Loader2, HelpCircle, PauseCircle, Save } from 'lucide-react';
import { generateSpeech } from '../services/geminiClient';

interface QuizModeProps {
  data: TestData;
  initialAnswers?: UserAnswers;
  initialStep?: number;
  onComplete: (answers: UserAnswers) => void;
  onPrintMode: () => void;
  onPauseAndSave: (answers: UserAnswers, currentStep: number) => void;
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
  data, 
  initialAnswers = {}, 
  initialStep = 0,
  onComplete, 
  onPrintMode,
  onPauseAndSave
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [answers, setAnswers] = useState<UserAnswers>(initialAnswers);
  const [showHint, setShowHint] = useState(false);
  
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

  const totalQuestions = allQuestions.length;
  const progress = ((currentStep + 1) / totalQuestions) * 100;
  
  const currentQuestion = allQuestions[currentStep];

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

  const handleAnswer = (optionIndex: number) => {
    const updatedAnswers = {
      ...answers,
      [currentQuestion.id]: optionIndex
    };
    setAnswers(updatedAnswers);
    // Auto sync progress
    onPauseAndSave(updatedAnswers, currentStep);
  };

  const nextQuestion = () => {
    stopAudio();
    if (currentStep < totalQuestions - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onPauseAndSave(answers, nextStep);
    } else {
      onComplete(answers);
    }
  };

  const prevQuestion = () => {
    stopAudio();
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onPauseAndSave(answers, prevStep);
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
            <button
              onClick={() => onPauseAndSave(answers, currentStep)}
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
            <h4 className="text-2xl font-serif font-bold text-black mb-4">
              {readingQuestion.passageTitle}
            </h4>
            <div className="prose prose-lg text-black leading-loose font-serif max-w-none">
              {readingQuestion.passageContent.split('\n').map((para: string, idx: number) => (
                <p key={idx} className="mb-4 text-2xl text-black text-justify">{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Question Panel */}
        <div className={`${isReadingSection ? 'md:col-span-6' : 'md:col-span-8 md:col-start-3'} flex flex-col`}>
          <div className="bg-white p-8 rounded-2xl shadow-lg border-t-4 border-black flex-grow">
            <div className="flex items-center justify-between mb-4">
               <span className={`inline-block px-3 py-1 text-sm font-bold rounded-full ${isListeningSection ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-black'}`}>
                {currentQuestion.type}
              </span>
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                {currentQuestion.domain}
              </span>
            </div>
            
            {/* Listening Audio Control */}
            {isListeningSection && currentQuestion.script && (
              <div className="mb-8 p-6 bg-blue-50 rounded-xl border-2 border-blue-100 flex flex-col items-center justify-center text-center">
                <p className="text-blue-900 font-bold mb-4 text-lg">Click to listen to the passage (Native Audio)</p>
                <button
                  onClick={() => handlePlayGeminiAudio(currentQuestion.script!)}
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
            <h2 
              className="text-xl md:text-2xl font-bold text-black mb-6 leading-snug"
              dangerouslySetInnerHTML={{ __html: currentQuestion.question }} 
            />

            {/* Practice Hint Accordion (Matching Star Reading Practice sheets format) */}
            {currentQuestion.hint && (
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
                    <span className="font-bold text-amber-950 mr-1">힌트:</span> {currentQuestion.hint}
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
                    ${answers[currentQuestion.id] === idx 
                      ? 'border-black bg-gray-100 text-black' 
                      : 'border-gray-300 hover:border-black hover:bg-white text-black'
                    }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 mr-5 flex items-center justify-center flex-shrink-0
                    ${answers[currentQuestion.id] === idx 
                      ? 'border-black bg-black' 
                      : 'border-gray-400 group-hover:border-black'
                    }`}
                  >
                    {answers[currentQuestion.id] === idx && <Check className="w-5 h-5 text-white" />}
                  </div>
                  <span className="text-xl font-medium text-black">{option}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer controls */}
          <div className="mt-6 flex justify-between items-center flex-wrap gap-4">
            <button
              onClick={onPrintMode}
              className="text-black underline text-sm md:text-base hover:text-gray-700 font-bold"
            >
              PDF로 저장 / 프린트 모드로 보기
            </button>
            
            <div className="flex gap-4">
              <button
                onClick={prevQuestion}
                disabled={currentStep === 0}
                className="bg-white hover:bg-gray-100 text-black border-2 border-black font-bold py-3.5 px-6 rounded-xl shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center text-lg"
              >
                <ChevronLeft className="w-6 h-6 mr-1" />
                <span>이전</span>
              </button>

              <button
                onClick={nextQuestion}
                disabled={answers[currentQuestion.id] === undefined}
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
