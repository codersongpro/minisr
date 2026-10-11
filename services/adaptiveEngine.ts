// Star Reading처럼 학생의 응답에 따라 다음 문항 난이도를 고르는 적응형 엔진.
// 문항 난이도와 학생 능력을 같은 Grade Equivalent(GE) 척도에 두고,
// 추측 확률을 반영한 로지스틱(IRT) 모형과 EAP 추정으로 능력을 계산한다.
import type { AdaptiveState, PassageItemSpec, Question, ReadingSection, TestData, UserAnswers, VocabWord } from '../types';
import { getBlueprint } from './srBlueprint.ts';
import type { TestLength } from './srBlueprint.ts';

const SLOPE = 1.2; // GE 1단계 차이당 로지트 변화
const PRIOR_SD = 1.5;
const MIN_GE = 0;
const MAX_GE = 12.9;
const PREFETCH_BUFFER = 3; // 남은 문항이 이 수 이하가 되면 다음 지문 풀을 미리 요청
const STAGE_SIZE: Record<TestLength, number> = { full: 6, mini: 4 }; // 지문 풀 한 번에 담당할 출제 문항 수

export const VOCAB_POOL_SIZE: Record<TestLength, number> = { full: 16, mini: 10 };

const clampGE = (x: number) => Math.min(MAX_GE, Math.max(MIN_GE, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

export const probCorrect = (theta: number, difficulty: number, optionCount: number) => {
  const guess = 1 / Math.max(2, optionCount);
  return guess + (1 - guess) / (1 + Math.exp(-SLOPE * (theta - difficulty)));
};

export interface ItemResponse {
  difficulty: number;
  optionCount: number;
  correct: boolean;
}

export const estimateAbility = (responses: ItemResponse[], prior: number) => {
  let weightSum = 0;
  let mean = 0;
  let second = 0;
  for (let theta = MIN_GE; theta <= MAX_GE + 1e-9; theta += 0.05) {
    let logW = -((theta - prior) ** 2) / (2 * PRIOR_SD ** 2);
    for (const r of responses) {
      const p = probCorrect(theta, r.difficulty, r.optionCount);
      logW += Math.log(r.correct ? p : 1 - p);
    }
    const w = Math.exp(logW);
    weightSum += w;
    mean += w * theta;
    second += w * theta * theta;
  }
  const theta = mean / weightSum;
  const sem = Math.sqrt(Math.max(0, second / weightSum - theta * theta));
  return { theta: clampGE(theta), sem };
};

// 출제된 SR 문항(어휘 + 지문, 듣기 제외)의 응답
export const collectResponses = (data: TestData, answers: UserAnswers): ItemResponse[] =>
  [...data.vocabulary, ...data.grammar, ...data.reading.flatMap(s => s.questions)]
    .filter(q => typeof q.difficulty === 'number' && answers[q.id] !== undefined)
    .map(q => ({ difficulty: q.difficulty!, optionCount: q.options.length, correct: answers[q.id] === q.correctAnswer }));

export const estimateFromTest = (data: TestData, answers: UserAnswers) => {
  const prior = data.adaptive?.startLevel ?? Number(data.srLevel);
  const responses = collectResponses(data, answers);
  if (responses.length === 0) return null;
  const { theta, sem } = estimateAbility(responses, Number.isFinite(prior) ? prior : 3);
  return { level: round1(theta), low: round1(clampGE(theta - sem)), high: round1(clampGE(theta + sem)), itemCount: responses.length };
};

export const createAdaptiveState = (startLevel: number, length: TestLength, vocabPool: Question[]): AdaptiveState => {
  const blueprint = getBlueprint(String(startLevel), length);
  const total = blueprint.comprehension.reduce((sum, d) => sum + d.count, 0);
  // 지문 풀을 작은 단계로 나눠, 단계마다 그때까지의 응답으로 추정한 능력에 맞춰 생성한다.
  const stageSizes: number[] = [];
  for (let left = total; left > 0; left -= STAGE_SIZE[length]) stageSizes.push(Math.min(STAGE_SIZE[length], left));
  return {
    startLevel,
    vocabTarget: blueprint.vocabCount,
    passageQuota: blueprint.comprehension,
    stageSizes,
    stagesRequested: 0,
    vocabPool,
    passagePool: [],
  };
};

export const plannedTotal = (state: AdaptiveState) =>
  state.vocabTarget + state.passageQuota.reduce((sum, d) => sum + d.count, 0);

const remainingQuota = (data: TestData, state: AdaptiveState) => {
  const used = new Map<string, number>();
  data.reading.forEach(s => s.questions.forEach(q => used.set(q.domain, (used.get(q.domain) || 0) + 1)));
  return state.passageQuota.map(d => ({ domain: d.domain, count: Math.max(0, d.count - (used.get(d.domain) || 0)) }));
};

// 출제할 자리마다 추정 능력보다 조금 쉬운 문항과 조금 어려운 문항을 한 쌍씩 만들어,
// 직전 응답에 따라 둘 중 맞는 쪽을 고를 수 있게 한다.
const PAIR_OFFSET = 0.6;

const specsFor = (plan: { domain: string; count: number }[], theta: number): PassageItemSpec[] =>
  plan.flatMap(({ domain, count }) =>
    Array.from({ length: count }, () => [
      { domain, difficulty: round1(clampGE(theta - PAIR_OFFSET)) },
      { domain, difficulty: round1(clampGE(theta + PAIR_OFFSET)) },
    ]).flat()
  );

// 이번에 요청할 지문 풀의 문항 사양. 계획된 단계를 다 썼으면 남은 할당량만큼 보충한다.
export const nextPassageSpecs = (data: TestData, answers: UserAnswers): PassageItemSpec[] => {
  const state = data.adaptive!;
  const theta = estimateFromTest(data, answers)?.level ?? state.startLevel;
  const remaining = remainingQuota(data, state);
  if (state.stagesRequested >= state.stageSizes.length) {
    return specsFor(remaining.filter(d => d.count > 0), theta);
  }
  // 이번 단계 문항 수만큼, 남은 할당량이 많은 영역부터 고르게 배정한다.
  let size = state.stageSizes[state.stagesRequested];
  const plan = remaining.map(d => ({ domain: d.domain, count: 0 }));
  const left = remaining.map(d => d.count);
  while (size > 0 && left.some(c => c > 0)) {
    const i = left.indexOf(Math.max(...left));
    plan[i].count += 1;
    left[i] -= 1;
    size -= 1;
  }
  return specsFor(plan.filter(d => d.count > 0), theta);
};

// 어휘 문항 몇 개로 능력을 가늠한 뒤, 남은 어휘 자리에 맞춰 쉬운/어려운 문항 쌍을 보충한다.
// (처음 풀은 시작 레벨 ±2 범위라 실제 수준이 크게 다르면 금방 바닥나기 때문)
const VOCAB_REFRESH_AFTER = 3;

export const shouldRefreshVocab = (data: TestData) => {
  const state = data.adaptive;
  return !!state && !state.vocabRefreshed && data.vocabulary.length >= VOCAB_REFRESH_AFTER && data.vocabulary.length < state.vocabTarget - 1;
};

export const vocabRefreshDifficulties = (data: TestData, answers: UserAnswers): number[] => {
  const state = data.adaptive!;
  const theta = estimateFromTest(data, answers)?.level ?? state.startLevel;
  const slots = state.vocabTarget - data.vocabulary.length;
  // 응답이 적어 추정이 불확실하므로 θ±0.6, ±1.2, ±1.8 … 로 넓게 퍼뜨린다.
  return Array.from({ length: slots }, (_, i) => round1(clampGE(theta + (i % 2 === 0 ? -1 : 1) * PAIR_OFFSET * (1 + Math.floor(i / 2)))));
};

export const addVocabPool = (data: TestData, items: Question[], keyVocabulary: VocabWord[]): TestData => {
  const state = data.adaptive!;
  let nextId = maxQuestionId(data) + 1;
  const merged = mergeKeyVocabulary(data, keyVocabulary);
  return {
    ...merged,
    adaptive: { ...state, vocabRefreshed: true, vocabPool: [...state.vocabPool, ...items.map(q => ({ ...q, id: nextId++ }))] },
  };
};

// 지금 다음 지문 풀을 미리 요청해야 하는지
export const shouldPrefetchPassages = (data: TestData) => {
  const state = data.adaptive;
  if (!state || state.stagesRequested >= state.stageSizes.length) return false;
  if (state.stagesRequested === 0) return state.vocabTarget - data.vocabulary.length <= 4;
  const covered = state.stageSizes.slice(0, state.stagesRequested).reduce((a, b) => a + b, 0);
  return covered - data.reading.length <= PREFETCH_BUFFER;
};

const maxQuestionId = (data: TestData) => Math.max(0, ...[
  ...data.vocabulary, ...data.grammar, ...data.listening,
  ...data.reading.flatMap(s => s.questions),
  ...(data.adaptive?.vocabPool || []),
  ...(data.adaptive?.passagePool || []).flatMap(s => s.questions),
].map(q => q.id));

const mergeKeyVocabulary = (data: TestData, words: VocabWord[]): TestData => {
  const known = new Set(data.keyVocabulary.map(w => w.word.trim().toLowerCase()));
  const fresh = words.filter(w => {
    const key = w.word?.trim().toLowerCase();
    if (!key || known.has(key)) return false;
    known.add(key);
    return true;
  });
  return { ...data, keyVocabulary: [...data.keyVocabulary, ...fresh].slice(0, 15) };
};

// 새로 받은 지문 풀을 추가한다. 따로 생성된 풀끼리 id가 겹치지 않도록 이어서 번호를 매긴다.
export const addPassagePool = (data: TestData, sections: ReadingSection[], keyVocabulary: VocabWord[], countsAsStage: boolean): TestData => {
  const state = data.adaptive!;
  let nextId = maxQuestionId(data) + 1;
  const renumbered = sections.map(s => ({ ...s, questions: s.questions.map(q => ({ ...q, id: nextId++ })) }));
  return {
    ...mergeKeyVocabulary(data, keyVocabulary),
    adaptive: {
      ...state,
      stagesRequested: countsAsStage ? Math.min(state.stageSizes.length, state.stagesRequested + 1) : state.stagesRequested,
      passagePool: [...state.passagePool, ...renumbered],
    },
  };
};

const pickClosest = <T,>(items: T[], difficultyOf: (item: T) => number, target: number): number => {
  let best = -1;
  let bestGap = Infinity;
  items.forEach((item, i) => {
    // 같은 거리면 무작위로 골라 매번 같은 순서가 되지 않게 한다.
    const gap = Math.abs(difficultyOf(item) - target) + Math.random() * 0.05;
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
};

export type NextItemResult =
  | { kind: 'added'; data: TestData }
  | { kind: 'need-passages' }
  | { kind: 'done' };

// 응답을 바탕으로 다음 문항을 풀에서 골라 출제 목록 끝에 붙인다.
export const administerNext = (data: TestData, answers: UserAnswers): NextItemResult => {
  const state = data.adaptive;
  if (!state) return { kind: 'done' };
  const estimate = estimateFromTest(data, answers);
  // 첫 문항은 실제 시험처럼 시작 레벨보다 약간 쉬운 문항으로 시작한다.
  const theta = estimate ? estimate.level : state.startLevel - 0.3;

  if (data.vocabulary.length < state.vocabTarget && state.vocabPool.length > 0) {
    const i = pickClosest(state.vocabPool, q => q.difficulty ?? state.startLevel, theta);
    const item = state.vocabPool[i];
    return {
      kind: 'added',
      data: {
        ...data,
        vocabulary: [...data.vocabulary, item],
        adaptive: { ...state, vocabPool: state.vocabPool.filter((_, j) => j !== i) },
      },
    };
  }

  const remaining = remainingQuota(data, state);
  if (remaining.every(d => d.count === 0)) return { kind: 'done' };

  const open = new Set(remaining.filter(d => d.count > 0).map(d => d.domain));
  let candidates = state.passagePool.map((s, i) => ({ s, i })).filter(({ s }) => open.has(s.questions[0]?.domain));
  if (candidates.length === 0) {
    // 계획한 풀을 다 받았는데도 해당 영역 문항이 없으면 다른 영역 문항으로라도 채운다.
    if (state.stagesRequested < state.stageSizes.length || state.passagePool.length === 0) return { kind: 'need-passages' };
    candidates = state.passagePool.map((s, i) => ({ s, i }));
  }
  const pick = candidates[pickClosest(candidates, ({ s }) => s.questions[0].difficulty ?? theta, theta)];
  return {
    kind: 'added',
    data: {
      ...data,
      reading: [...data.reading, pick.s],
      adaptive: { ...state, passagePool: state.passagePool.filter((_, j) => j !== pick.i) },
    },
  };
};

// 진행률 표시에 쓰는 전체 문항 수 (적응형은 계획된 문항 수 기준)
export const totalQuestionCount = (data: TestData) =>
  data.adaptive
    ? plannedTotal(data.adaptive) + data.listening.length
    : data.vocabulary.length + data.grammar.length + data.reading.reduce((n, s) => n + s.questions.length, 0) + data.listening.length;

// 시험이 끝나면 남은 문항 풀은 저장할 필요가 없다.
export const stripPools = (data: TestData): TestData =>
  data.adaptive ? { ...data, adaptive: { ...data.adaptive, vocabPool: [], passagePool: [] } } : data;

export const chunkSpecs = (specs: PassageItemSpec[], size: number): PassageItemSpec[][] => {
  const chunks: PassageItemSpec[][] = [];
  for (let i = 0; i < specs.length; i += size) chunks.push(specs.slice(i, i + size));
  return chunks;
};
