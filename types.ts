
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

