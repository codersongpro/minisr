import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMarkup, stripMarkup } from '../services/markup.js';
import { normalizeTestData } from '../services/srBlueprint.js';

test('stripMarkup removes underline and other tags from options', () => {
  assert.equal(stripMarkup('<u>happy</u>'), 'happy');
  assert.equal(stripMarkup('< u >quick</ u>'), 'quick');
  assert.equal(stripMarkup('&lt;u&gt;calm&lt;/u&gt;'), 'calm');
  assert.equal(stripMarkup('<b>bold</b> and <span class="x">plain</span>'), 'bold and plain');
  assert.equal(stripMarkup('Tom &amp; Jerry'), 'Tom & Jerry');
});

test('parseMarkup keeps underline as formatting and drops unknown tags', () => {
  assert.deepEqual(parseMarkup('The <u>rapid</u> river<br><script>x</script>'), [
    { text: 'The ' },
    { text: 'rapid', underline: true },
    { text: ' river' },
    { text: '', lineBreak: true },
    { text: 'x' },
  ]);
});

test('normalizeTestData strips tags from generated options but keeps the correct answer', () => {
  const data = normalizeTestData({
    srLevel: '3.0', grammar: [], listening: [], keyVocabulary: [{ word: '<u>brisk</u>', meaning: '', definition: '', example: '' }],
    vocabulary: [{ id: 1, type: 'VOCAB', domain: 'd', question: 'A <u>brisk</u> walk.', options: ['<u>quick</u>', 'slow', 'sad', 'loud'], correctAnswer: 0, explanation: '' }],
    reading: [],
  });
  assert.deepEqual(data.vocabulary[0].options, ['quick', 'slow', 'sad', 'loud']);
  assert.equal(data.vocabulary[0].question, 'A <u>brisk</u> walk.');
  assert.equal(data.keyVocabulary[0].word, 'brisk');
});
