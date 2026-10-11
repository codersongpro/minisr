import React, { useState } from 'react';
import { BookOpen, Star, Loader2, Headphones, History, Play, Timer } from 'lucide-react';
import { TestSession } from '../types';
import { TestLength, getTimeLimits } from '../services/srBlueprint';

interface WelcomeScreenProps {
  onStart: (srLevel: string, includeListening: boolean, testLength: TestLength, timed: boolean, extendedTime: boolean) => void;
  onOpenHistory: () => void;
  onResumeSession?: (session: TestSession) => void;
  inProgressSession?: TestSession | null;
  isLoading: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
  onStart, 
  onOpenHistory, 
  onResumeSession, 
  inProgressSession, 
  isLoading 
}) => {
  const [level, setLevel] = useState('3.0');
  const [includeListening, setIncludeListening] = useState(false);
  const [testLength, setTestLength] = useState<TestLength>('full');
  const [timed, setTimed] = useState(true);
  const [extendedTime, setExtendedTime] = useState(false);
  const limits = getTimeLimits(level, extendedTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (level && !isLoading) {
      onStart(level, includeListening, testLength, timed, timed && extendedTime);
    }
  };

  const choiceClass = (active: boolean) =>
    `flex-1 p-3 rounded-xl border-2 text-left transition-colors ${active ? 'border-black bg-gray-100' : 'border-gray-200 bg-white hover:border-gray-400'}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      {/* Banner for resuming an in-progress session */}
      {inProgressSession && onResumeSession && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl max-w-md w-full mb-6 flex items-center justify-between shadow-md">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded">진행 중</span>
              <span className="font-bold text-amber-950 text-sm">SR {inProgressSession.srLevel} 테스트</span>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              이전에 풀던 문제가 있습니다! (진행률: {inProgressSession.currentStep + 1}/{inProgressSession.totalQuestions})
            </p>
          </div>
          <button
            onClick={() => onResumeSession(inProgressSession)}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center shadow-sm shrink-0"
          >
            <Play className="w-3.5 h-3.5 mr-1 fill-current" />
            <span>이어풀기</span>
          </button>
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-black">
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 p-4 rounded-full">
            <BookOpen className="w-12 h-12 text-black" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-black mb-2">Mini SR Test</h1>
        <p className="text-black mb-6">
          집에서 풀어보는 맞춤형 리딩 레벨 테스트
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-left">
            <label htmlFor="srLevel" className="block text-sm font-medium text-black mb-2">
              시작 SR 지수 (최근 SR 점수 또는 현재 학년, 예: 2.5, 4.1)
            </label>
            <div className="relative">
              <Star className="absolute left-3 top-3 w-5 h-5 text-gray-400 z-10" />
              <input
                id="srLevel"
                type="number"
                step="0.1"
                min="0.0"
                max="12.0"
                placeholder="3.0"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-black text-white border border-black rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600 transition-all outline-none text-lg placeholder-gray-500"
                required
              />
            </div>
            <p className="text-xs text-black mt-2 ml-1">
              * 아이의 현재 수준이나 목표 수준을 입력해주세요.
            </p>
          </div>

          <div className="text-left">
            <span className="block text-sm font-medium text-black mb-2">문항 수</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTestLength('full')} className={choiceClass(testLength === 'full')}>
                <span className="block font-bold text-sm text-black">실전 34문항</span>
                <span className="block text-xs text-gray-600 mt-0.5">실제 SR과 같은 구성 (어휘 10 + 지문 24)</span>
              </button>
              <button type="button" onClick={() => setTestLength('mini')} className={choiceClass(testLength === 'mini')}>
                <span className="block font-bold text-sm text-black">미니 17문항</span>
                <span className="block text-xs text-gray-600 mt-0.5">같은 비율의 절반 구성 (어휘 5 + 지문 12)</span>
              </button>
            </div>
          </div>

          <div className="text-left">
            <span className="block text-sm font-medium text-black mb-2">풀이 방식</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTimed(true)} className={choiceClass(timed)}>
                <span className="flex items-center font-bold text-sm text-black"><Timer className="w-4 h-4 mr-1" />실전 모드</span>
                <span className="block text-xs text-gray-600 mt-0.5">문항별 제한시간 (어휘 {limits.vocabSeconds}초 / 지문 {limits.passageSeconds}초), 이전 문제·힌트 없음</span>
              </button>
              <button type="button" onClick={() => setTimed(false)} className={choiceClass(!timed)}>
                <span className="block font-bold text-sm text-black">연습 모드</span>
                <span className="block text-xs text-gray-600 mt-0.5">시간 제한 없음, 힌트 보기·이전 문제 이동 가능</span>
              </button>
            </div>
          </div>

          {timed && (
            <label className="flex items-start text-left text-xs text-gray-700 cursor-pointer -mt-3">
              <input type="checkbox" checked={extendedTime} onChange={(e) => setExtendedTime(e.target.checked)} className="mt-0.5 mr-2" />
              <span><span className="font-bold text-black">연장 시간 적용</span> — 실제 SR의 편의 제공 설정과 같은 시간 (학교에서 연장 시간을 받는 경우)</span>
            </label>
          )}

          <div className="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setIncludeListening(!includeListening)}>
            <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors ${includeListening ? 'bg-black border-black' : 'border-gray-400 bg-white'}`}>
              {includeListening && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
            </div>
            <div className="flex items-center select-none">
              <Headphones className="w-5 h-5 text-black mr-2" />
              <span className="text-black font-bold text-sm">Listening(듣기) 문제 포함 <span className="font-normal text-gray-600">(실제 SR에는 없는 추가 연습)</span></span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg text-lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>문제 생성 중...</span>
              </>
            ) : (
              <span>테스트 시작하기</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={onOpenHistory}
            className="w-full bg-gray-100 hover:bg-gray-200 text-black font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2 text-sm border border-gray-300"
          >
            <History className="w-4 h-4 text-black" />
            <span>이전 테스트 기록 및 오답 모아보기</span>
          </button>
        </div>
      </div>
      
      <div className="mt-6 text-center text-black text-sm max-w-sm font-medium">
        <p>실제 Star Reading처럼 적응형으로 출제됩니다. 맞히면 더 어려운 문제, 틀리면 더 쉬운 문제가 나오고, 끝나면 추정 SR 지수를 알려드립니다. 입력한 레벨은 시작점으로만 쓰입니다. (듣기 선택 시 +2문제)</p>
      </div>
    </div>
  );
};
