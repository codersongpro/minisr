
export interface Question {
  id: number;
  type: 'VOCAB' | 'GRAMMAR' | 'READING' | 'LISTENING';
  domain: string; // e.g., "Word Knowledge and Skills", "Analyzing Literary Text", "Listening Comprehension", "Contextual Vocabulary", "Genre Identification", "Author's Craft", "Inference", "Character Analysis", "Morphology"
  skill?: string; // Star Reading 세부 기능 (e.g., "Main Idea", "Character Traits", "Prefixes/Suffixes")
  question: string;
  hint?: string; // English hint for practice (e.g. "Think about what water does to the soil.")
  script?: string; // The text to be spoken for listening questions
  options: string[];
  correctAnswer: number; // Index 0-3
  explanation: string;
  difficulty?: number; // 문항 목표 난이도 (Grade Equivalent), 적응형 선택과 레벨 추정에 사용
}

export interface VocabWord {
  word: string;
  meaning: string;
  definition: string; // English definition
  example: string;
}

export interface ReadingSection {
  passageTitle: string;
  passageContent: string;
  questions: Question[];
}

export interface TestData {
  srLevel: string;
  vocabulary: Question[];
  grammar: Question[];
  reading: ReadingSection[];
  listening: Question[];
  keyVocabulary: VocabWord[];
  timed?: boolean; // 실전 모드: 문항별 제한시간, 이전 문제로 돌아가기·힌트 없음
  extendedTime?: boolean; // 연장 시간 (Star Reading 편의 제공 설정)
  adaptive?: AdaptiveState; // 적응형 시험: 아직 출제되지 않은 문항 풀과 진행 계획
}

export interface PassageItemSpec {
  domain: string;
  difficulty: number;
}

export interface AdaptiveState {
  startLevel: number;
  vocabTarget: number; // 앞부분 어휘 문항 수 (실전 10)
  passageQuota: { domain: string; count: number }[]; // 지문 문항 영역별 출제 수 (실전 합계 24)
  stageSizes: number[]; // 지문 문항을 몇 개씩 나눠 풀(pool)을 생성할지
  stagesRequested: number; // 지금까지 요청한 지문 풀 단계 수
  vocabRefreshed?: boolean; // 어휘 풀을 추정 능력에 맞춰 한 번 보충했는지
  vocabPool: Question[];
  passagePool: ReadingSection[];
}

// -1은 실전 모드에서 제한시간이 지나 자동으로 넘어간 문항(오답 처리)
export const TIMED_OUT_ANSWER = -1;

export interface UserAnswers {
  [questionId: number]: number;
}

export interface TestSession {
  id: string;
  userId: string;
  srLevel: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  currentStep: number;
  score: number;
  totalQuestions: number;
  correctCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  testData: TestData;
  userAnswers: UserAnswers;
  isTwinMode?: boolean;
}

