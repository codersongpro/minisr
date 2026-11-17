import test from 'node:test';
import assert from 'node:assert/strict';

import { SR_QUESTION_TYPES, questionTypeReference, questionTypesFor } from '../services/srQuestionTypes.js';
import { DOMAIN_SKILLS } from '../services/srBlueprint.js';

test('quick guide has 10 numbered types with valid examples', () => {
  assert.deepEqual(SR_QUESTION_TYPES.map((t) => t.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const t of SR_QUESTION_TYPES) {
    assert.equal(t.example.options.length, 4, t.name);
    assert.ok(t.example.answer >= 0 && t.example.answer < 4, t.name);
    assert.ok(DOMAIN_SKILLS[t.domain]?.includes(t.skill), `${t.name}: ${t.skill} not in ${t.domain}`);
  }
});

test('reference block only includes requested sections', () => {
  assert.equal(questionTypesFor('word').length, 2);
  const passage = questionTypeReference(['passage']);
  assert.match(passage, /Main Idea/);
  assert.match(passage, /Concluding Sentence/);
  assert.doesNotMatch(passage, /\[Vocabulary/);
  assert.doesNotMatch(passage, /\[Grammar/);
});
