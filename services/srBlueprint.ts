// Star Reading 실제 시험 구조를 흉내 내기 위한 문항 설계표(blueprint)와 검증 도우미.
// 실제 Star Reading: 34문항 컴퓨터 적응형 시험, 앞 10문항은 Word Knowledge and Skills(빈칸 어휘),
// 나머지 24문항은 짧은 지문 1개 + 문항 1개 구조로 4개 이해 영역에 걸쳐 출제된다.
import type { Question, TestData } from '../types';

export type TestLength = 'full' | 'mini';

export const SR_DOMAINS = {
  WORD: 'Word Knowledge and Skills',
  COMPREHENSION: 'Comprehension Strategies and Constructing Meaning',
  LITERARY: 'Analyzing Literary Text',
  CRAFT: "Understanding Author's Craft",
  ARGUMENT: 'Analyzing Argument and Evaluating Text',
} as const;

export const DOMAIN_SKILLS: Record<string, string[]> = {
  [SR_DOMAINS.WORD]: [
    'Vocabulary in Context', 'Synonyms', 'Antonyms', 'Multiple-Meaning Words',
    'Prefixes/Suffixes', 'Root Words', 'Context Clues',
  ],
  [SR_DOMAINS.COMPREHENSION]: [
    'Main Idea', 'Key Details', 'Inference', 'Cause and Effect', 'Sequence',
    'Summarizing', 'Drawing Conclusions', 'Making Predictions',
  ],
  [SR_DOMAINS.LITERARY]: [
    'Character Traits', 'Character Motivation', 'Plot', 'Setting', 'Theme',
    'Point of View', 'Genre',
  ],
  [SR_DOMAINS.CRAFT]: [
    "Author's Purpose", 'Word Choice/Tone', 'Figurative Language', 'Text Structure',
    'Text Features',
  ],
  [SR_DOMAINS.ARGUMENT]: [
    'Fact and Opinion', 'Claims and Evidence', 'Supporting Reasons', 'Comparing Texts',
  ],
};

export interface Blueprint {
  vocabCount: number;
  comprehension: { domain: string; count: number }[];
  informationalRatio: number; // 지문 중 논픽션 비율
  passageWords: string;
  clozeSentences: string;
  timeLimits: { vocabSeconds: number; passageSeconds: number };
}

const parseLevel = (srLevel: string) => {
  const n = Number(srLevel);
  return Number.isFinite(n) ? n : 3;
};

// 실제 Star Reading(34문항판)의 문항당 제한시간: K-2는 어휘 60초/지문 120초, 3학년 이상은 45초/90초.
// 연장 시간(편의 제공) 설정: K-2는 180초/270초, 3학년 이상은 135초/270초.
export const getTimeLimits = (srLevel: string, extended = false) => {
  const early = parseLevel(srLevel) < 3;
  if (extended) return early ? { vocabSeconds: 180, passageSeconds: 270 } : { vocabSeconds: 135, passageSeconds: 270 };
  return early ? { vocabSeconds: 60, passageSeconds: 120 } : { vocabSeconds: 45, passageSeconds: 90 };
};

// Star Reading 기술 매뉴얼: K-1 수준 문항은 선택지 3개, 2학년 수준 이상은 4개.
export const optionCountFor = (difficulty: number) => (difficulty < 2 ? 3 : 4);

export const passageWordsFor = (level: number) => {
  if (level < 1.5) return '15-35 words (2-3 very short, decodable sentences)';
  if (level < 3) return '35-70 words';
  if (level < 5) return '70-130 words';
  if (level < 8) return '110-180 words';
  return '150-250 words';
};

export const clozeLengthFor = (level: number) => {
  if (level < 1.5) return 'ONE short sentence (5-9 words)';
  if (level < 3) return 'ONE sentence (8-14 words)';
  if (level < 5) return 'ONE or TWO sentences (12-25 words total)';
  if (level < 8) return 'TWO sentences (20-35 words total)';
  return 'TWO or THREE sentences (25-45 words total) with academic vocabulary';
};

export const getBlueprint = (srLevel: string, length: TestLength = 'full'): Blueprint => {
  const level = parseLevel(srLevel);

  // 학년이 올라갈수록 문학·사실 이해 비중이 줄고 작가의 기법·논증 평가 비중이 늘어난다.
  // [이해 전략, 문학 분석, 작가의 기법, 논증 평가] — 실전 24문항 / 미니 12문항
  const mini = length === 'mini';
  let split: [number, number, number, number];
  if (level < 3) split = mini ? [6, 3, 2, 1] : [11, 7, 4, 2];
  else if (level < 6) split = mini ? [5, 3, 2, 2] : [9, 6, 5, 4];
  else split = mini ? [4, 3, 3, 2] : [8, 5, 6, 5];

  const passageWords = passageWordsFor(level);
  const clozeSentences = clozeLengthFor(level);

  return {
    vocabCount: mini ? 5 : 10,
    comprehension: [
      { domain: SR_DOMAINS.COMPREHENSION, count: split[0] },
      { domain: SR_DOMAINS.LITERARY, count: split[1] },
      { domain: SR_DOMAINS.CRAFT, count: split[2] },
      { domain: SR_DOMAINS.ARGUMENT, count: split[3] },
    ],
    informationalRatio: level < 3 ? 0.4 : level < 6 ? 0.5 : 0.6,
    passageWords,
    clozeSentences,
    timeLimits: getTimeLimits(srLevel),
  };
};

// 지문형 문항 배분을 병렬 호출 수만큼 나눈다 (각 영역을 고르게 분배).
export const splitComprehension = (
  items: { domain: string; count: number }[],
  parts: number,
): { domain: string; count: number }[][] => {
  const buckets = Array.from({ length: parts }, () => [] as { domain: string; count: number }[]);
  items.forEach(({ domain, count }, i) => {
    for (let p = 0; p < parts; p++) {
      // 나머지는 영역마다 다른 버킷에 돌려가며 배정해 버킷 크기를 맞춘다.
      const share = Math.floor(count / parts) + (((p - i) % parts + parts) % parts < count % parts ? 1 : 0);
      if (share > 0) buckets[p].push({ domain, count: share });
    }
  });
  return buckets;
};

const isValidQuestion = (q: Question | undefined): q is Question =>
  !!q &&
  typeof q.question === 'string' && q.question.trim().length > 0 &&
  Array.isArray(q.options) && q.options.length >= 2 &&
  q.options.every((o) => typeof o === 'string' && o.trim().length > 0) &&
  new Set(q.options.map((o) => o.trim().toLowerCase())).size === q.options.length &&
  Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < q.options.length;

// 깨진 문항을 걸러내고, 병렬 생성으로 겹칠 수 있는 id를 1부터 다시 매긴다.
export const normalizeTestData = (data: TestData): TestData => {
  let nextId = 1;
  const fix = (q: Question): Question => ({ ...q, id: nextId++ });

  const vocabulary = (data.vocabulary || []).filter(isValidQuestion).map(fix);
  const grammar = (data.grammar || []).filter(isValidQuestion).map(fix);
  const reading = (data.reading || [])
    .map((s) => ({ ...s, passageTitle: s.passageTitle || '', questions: (s.questions || []).filter(isValidQuestion) }))
    .filter((s) => typeof s.passageContent === 'string' && s.passageContent.trim().length > 0 && s.questions.length > 0)
    .map((s) => ({ ...s, questions: s.questions.map(fix) }));
  const listening = (data.listening || []).filter(isValidQuestion).map(fix);

  const seen = new Set<string>();
  const keyVocabulary = (data.keyVocabulary || []).filter((w) => {
    const key = w?.word?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ...data, vocabulary, grammar, reading, listening, keyVocabulary };
};
