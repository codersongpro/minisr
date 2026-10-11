import test from 'node:test';
import assert from 'node:assert/strict';

import { getBlueprint, getTimeLimits, normalizeTestData, splitComprehension } from '../services/srBlueprint.ts';

const total = (items) => items.reduce((sum, item) => sum + item.count, 0);

test('full test mirrors Star Reading: 10 word-knowledge + 24 passage items', () => {
  for (const level of ['1.0', '3.5', '7.2']) {
    const bp = getBlueprint(level, 'full');
    assert.equal(bp.vocabCount, 10);
    assert.equal(total(bp.comprehension), 24);
  }
});

test('mini test is roughly half the size', () => {
  const bp = getBlueprint('4.0', 'mini');
  assert.equal(bp.vocabCount, 5);
  assert.equal(total(bp.comprehension), 12);
});

test('time limits follow K-2 vs grade 3+ split', () => {
  assert.deepEqual(getTimeLimits('2.9'), { vocabSeconds: 60, passageSeconds: 120 });
  assert.deepEqual(getTimeLimits('3.0'), { vocabSeconds: 45, passageSeconds: 90 });
});

test('splitComprehension keeps totals and balances buckets', () => {
  const plan = getBlueprint('2.0', 'full').comprehension;
  const parts = splitComprehension(plan, 3);
  assert.equal(parts.flat().reduce((s, p) => s + p.count, 0), 24);
  for (const part of parts) assert.ok(Math.abs(total(part) - 8) <= 1);
  for (const { domain, count } of plan) {
    assert.equal(parts.flat().filter((p) => p.domain === domain).reduce((s, p) => s + p.count, 0), count);
  }
});

test('normalizeTestData drops broken items and renumbers ids', () => {
  const q = (id, extra = {}) => ({ id, type: 'VOCAB', domain: 'd', question: 'A _____ day.', options: ['a', 'b', 'c', 'd'], correctAnswer: 1, explanation: '', ...extra });
  const data = normalizeTestData({
    srLevel: '3.0',
    vocabulary: [q(1), q(1), q(2, { correctAnswer: 7 }), q(3, { options: ['a', 'a', 'b', 'c'] })],
    grammar: [],
    reading: [
      { passageTitle: '', passageContent: 'Text', questions: [q(1, { type: 'READING' })] },
      { passageTitle: 'Empty', passageContent: '', questions: [q(5, { type: 'READING' })] },
    ],
    listening: [],
    keyVocabulary: [{ word: 'Rapid', meaning: '', definition: '', example: '' }, { word: 'rapid', meaning: '', definition: '', example: '' }],
  });
  assert.deepEqual(data.vocabulary.map((x) => x.id), [1, 2]);
  assert.equal(data.reading.length, 1);
  assert.equal(data.reading[0].questions[0].id, 3);
  assert.equal(data.keyVocabulary.length, 1);
});
