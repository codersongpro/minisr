
export interface Question {
  id: number;
  type: 'VOCAB' | 'GRAMMAR' | 'READING' | 'LISTENING';
  domain: string; // e.g., "Word Knowledge and Skills", "Analyzing Literary Text", "Listening Comprehension", "Contextual Vocabulary", "Genre Identification", "Author's Craft", "Inference", "Character Analysis", "Morphology"
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
}

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

