import React, { useState } from 'react';
import { TestSession } from '../types';
import { Clock, Star, Play, CheckCircle, Trash2, Calendar, FileText, ArrowUpDown, Filter, Award, RotateCcw } from 'lucide-react';

interface HistoryViewProps {
  sessions: TestSession[];
  onResumeSession: (session: TestSession) => void;
  onViewResults: (session: TestSession) => void;
  onPrintSession: (session: TestSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewTest: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  onResumeSession,
  onViewResults,
  onPrintSession,
  onDeleteSession,
  onNewTest
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [srLevelFilter, setSrLevelFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'LEVEL_DESC' | 'SCORE_DESC'>('DATE_DESC');

  // Unique SR levels available in sessions
  const availableLevels = Array.from(new Set(sessions.map(s => s.srLevel))).sort((a: string, b: string) => parseFloat(a) - parseFloat(b));

  // Filter logic
  const filteredSessions = sessions.filter(session => {
    if (statusFilter !== 'ALL' && session.status !== statusFilter) return false;
    if (srLevelFilter !== 'ALL' && session.srLevel !== srLevelFilter) return false;
    return true;
  });

  // Sort logic
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (sortBy === 'DATE_DESC') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sortBy === 'DATE_ASC') {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    if (sortBy === 'LEVEL_DESC') {
      return parseFloat(b.srLevel) - parseFloat(a.srLevel);
    }
    if (sortBy === 'SCORE_DESC') {
      return b.score - a.score;
    }
    return 0;
  });

  const completedCount = sessions.filter(s => s.status === 'COMPLETED').length;
  const inProgressCount = sessions.filter(s => s.status === 'IN_PROGRESS').length;
  const avgScore = completedCount > 0 
    ? Math.round(sessions.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + s.score, 0) / completedCount)
    : 0;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-xl text-blue-800">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">완료된 테스트</p>
            <p className="text-2xl font-extrabold text-black">{completedCount} <span className="text-sm font-normal text-gray-500">회</span></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="bg-amber-100 p-3 rounded-xl text-amber-800">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">진행 중인 테스트</p>
            <p className="text-2xl font-extrabold text-black">{inProgressCount} <span className="text-sm font-normal text-gray-500">개</span></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-xl text-emerald-800">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">평균 정답률</p>
            <p className="text-2xl font-extrabold text-black">{avgScore}%</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Filter & Sort */}
      <div className="bg-white p-6 rounded-2xl shadow-md border border-black mb-8">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4 border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-black flex items-center">
            <Calendar className="w-6 h-6 mr-2 text-black" />
            테스트 기록 및 오답 노트
          </h2>
          <button
            onClick={onNewTest}
            className="bg-black hover:bg-gray-800 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center text-sm"
          >
            <span>새 테스트 시작</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${statusFilter === 'ALL' ? 'bg-black text-white' : 'text-gray-600 hover:text-black'}`}
            >
              전체 ({sessions.length})
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${statusFilter === 'IN_PROGRESS' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:text-black'}`}
            >
              진행 중 ({inProgressCount})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${statusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-black'}`}
            >
              완료됨 ({completedCount})
            </button>
          </div>

          <div className="flex items-center space-x-3 flex-wrap gap-2">
            {/* SR Level Filter */}
            <div className="flex items-center space-x-1.5 text-sm font-bold text-gray-700">
              <Filter className="w-4 h-4 text-gray-500" />
              <span>SR 지수:</span>
              <select
                value={srLevelFilter}
                onChange={(e) => setSrLevelFilter(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-black text-sm font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-black outline-none"
              >
                <option value="ALL">전체 Level</option>
                {availableLevels.map(lvl => (
                  <option key={lvl} value={lvl}>SR {lvl}</option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center space-x-1.5 text-sm font-bold text-gray-700">
              <ArrowUpDown className="w-4 h-4 text-gray-500" />
              <span>정렬:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-gray-50 border border-gray-300 text-black text-sm font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-black outline-none"
              >
                <option value="DATE_DESC">날짜 (최신순)</option>
                <option value="DATE_ASC">날짜 (오래된순)</option>
                <option value="LEVEL_DESC">SR 지수 (높은순)</option>
                <option value="SCORE_DESC">정답률 (높은순)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Session Cards List */}
      {sortedSessions.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-300 text-center text-gray-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40 text-black" />
          <p className="text-lg font-bold text-black mb-2">저장된 테스트 기록이 없습니다.</p>
          <p className="text-sm text-gray-500 mb-6">목표 SR 지수를 설정하고 첫 레벨 테스트를 시작해보세요!</p>
          <button
            onClick={onNewTest}
            className="bg-black hover:bg-gray-800 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md inline-flex items-center"
          >
            <Star className="w-4 h-4 mr-2" />
            <span>첫 테스트 생성하기</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedSessions.map((session) => {
            const isInProgress = session.status === 'IN_PROGRESS';
            const answeredCount = Object.keys(session.userAnswers || {}).length;

            return (
              <div 
                key={session.id}
                className="bg-white p-6 rounded-2xl border border-gray-300 hover:border-black transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center space-x-3 flex-wrap gap-2">
                    <span className="bg-black text-white text-sm font-extrabold px-3 py-1 rounded-lg">
                      SR {session.srLevel}
                    </span>

                    {session.isTwinMode && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">
                        쌍둥이 문제
                      </span>
                    )}

                    {isInProgress ? (
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold px-2.5 py-1 rounded-md flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1 text-amber-700 animate-pulse" />
                        진행 중 (진행률: {session.currentStep + 1}/{session.totalQuestions})
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold px-2.5 py-1 rounded-md flex items-center">
                        <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                        완료됨 — {session.score}% ({session.correctCount}/{session.totalQuestions} 문제)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center text-xs text-gray-500 space-x-4 pt-1">
                    <span className="flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      마지막 저장: {formatDate(session.updatedAt)}
                    </span>
                    <span>•</span>
                    <span>풀이 응답: {answeredCount}개 완료</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 flex-wrap gap-2 pt-2 md:pt-0">
                  {isInProgress ? (
                    <button
                      onClick={() => onResumeSession(session)}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors flex items-center shadow-md"
                    >
                      <Play className="w-4 h-4 mr-1.5 fill-current" />
                      <span>이어서 풀기</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onViewResults(session)}
                        className="bg-black hover:bg-gray-800 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors flex items-center shadow-md"
                      >
                        <FileText className="w-4 h-4 mr-1.5" />
                        <span>결과 및 오답노트</span>
                      </button>
                      <button
                        onClick={() => onPrintSession(session)}
                        className="bg-gray-100 hover:bg-gray-200 text-black border border-gray-300 font-bold px-3 py-2 rounded-xl text-sm transition-colors flex items-center"
                        title="시험지 인쇄"
                      >
                        <span>인쇄/PDF</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      if (window.confirm("이 테스트 기록을 정말 삭제하시겠습니까?")) {
                        onDeleteSession(session.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    title="기록 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
