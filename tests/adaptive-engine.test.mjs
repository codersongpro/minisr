import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addVocabPool, shouldRefreshVocab, vocabRefreshDifficulties, administerNext, addPassagePool, createAdaptiveState, estimateAbility, estimateFromTest,
  nextPassageSpecs, plannedTotal, probCorrect, shouldPrefetchPassages, totalQuestionCount,
} from '../services/adaptiveEngine.js';

let nextId = 1000;
const item = (difficulty, domain = 'Word Knowledge and Skills', type = 'VOCAB') => ({
  id: nextId++, type, domain, question: 'A _____ day.', options: ['a', 'b', 'c', 'd'], correctAnswer: 0, explanation: '', difficulty,
});
const vocabPool = (start) => Array.from({ length: 16 }, (_, i) => item(Math.round((start - 2 + (4 * i) / 15) * 10) / 10));
const passagesFor = (specs) => specs.map(s => ({ passageTitle: '', passageContent: 'Text', questions: [item(s.difficulty, s.domain, 'READING')] }));

const emptyTest = (start, length = 'full') => ({
  srLevel: String(start), vocabulary: [], grammar: [], reading: [], listening: [], keyVocabulary: [],
  adaptive: createAdaptiveState(start, length, vocabPool(start)),
});

// 실제 능력 trueLevel인 가상 학생이 확률적으로 답하는 시뮬레이션
const simulate = (start, trueLevel, seed) => {
  let rand = seed;
  const random = () => ((rand = (rand * 16807) % 2147483647) / 2147483647);
  let data = emptyTest(start);
  const answers = {};
  for (let guard = 0; guard < 100; guard++) {
    if (shouldRefreshVocab(data)) {
      data = addVocabPool(data, vocabRefreshDifficulties(data, answers).map(d => item(d)), []);
    }
    if (shouldPrefetchPassages(data)) {
      const specs = nextPassageSpecs(data, answers);
      data = addPassagePool(data, passagesFor(specs), [], true);
    }
    const r = administerNext(data, answers);
    if (r.kind === 'done') break;
    if (r.kind === 'need-passages') {
      const specs = nextPassageSpecs(data, answers);
      data = addPassagePool(data, passagesFor(specs), [], data.adaptive.stagesRequested < data.adaptive.stageSizes.length);
      continue;
    }
    data = r.data;
    const q = [...data.vocabulary, ...data.reading.flatMap(s => s.questions)].at(-1);
    answers[q.id] = random() < probCorrect(trueLevel, q.difficulty, q.options.length) ? q.correctAnswer : 1;
  }
  return { data, answers };
};

test('full adaptive test administers 10 vocabulary + 24 passage items with the blueprint quotas', () => {
  const { data } = simulate(3.0, 3.0, 7);
  assert.equal(data.vocabulary.length, 10);
  assert.equal(data.reading.length, 24);
  for (const { domain, count } of data.adaptive.passageQuota) {
    assert.equal(data.reading.filter(s => s.questions[0].domain === domain).length, count);
  }
  assert.equal(plannedTotal(data.adaptive), 34);
  assert.equal(totalQuestionCount(data), 34);
});

test('question ids stay unique across separately generated pools', () => {
  const { data } = simulate(4.0, 4.0, 11);
  const ids = [...data.vocabulary, ...data.reading.flatMap(s => s.questions)].map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('estimate moves toward the true level from a wrong starting point', () => {
  for (const [start, truth] of [[3.0, 5.0], [5.0, 3.0]]) {
    const estimates = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => {
      const { data, answers } = simulate(start, truth, seed * 977);
      return estimateFromTest(data, answers).level;
    });
    const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    assert.ok(Math.abs(mean - truth) < Math.abs(start - truth) / 2, `start ${start}, truth ${truth}, mean estimate ${mean}`);
  }
});

test('first item starts slightly below the starting level', () => {
  const r = administerNext(emptyTest(4.0), {});
  assert.equal(r.kind, 'added');
  assert.ok(r.data.vocabulary[0].difficulty <= 4.0);
});

test('ability estimate rises with correct answers and falls with wrong ones', () => {
  const items = [3, 3.5, 4, 4.5].map(d => ({ difficulty: d, optionCount: 4 }));
  const high = estimateAbility(items.map(i => ({ ...i, correct: true })), 3.5).theta;
  const low = estimateAbility(items.map(i => ({ ...i, correct: false })), 3.5).theta;
  assert.ok(high > 3.5 && low < 3.5);
});

test('vocabulary keeps getting harder for a strong student after the pool refresh', () => {
  const { data } = simulate(3.0, 9.0, 5);
  const vocab = data.vocabulary.map(q => q.difficulty);
  assert.ok(Math.max(...vocab.slice(5)) > 5.0, `vocab difficulties ${vocab.join(", ")}`);
});
