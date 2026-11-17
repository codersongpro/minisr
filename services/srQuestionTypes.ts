// SR TEST QUICK GUIDE(종이 안내서 2~6쪽)의 10가지 문제 유형 레퍼런스.
// 문항 생성 프롬프트에 "유형 정의 + 풀이법 + 예시 문항"으로 들어가 AI가 같은 결의 문항을 만들도록 돕는다.
// 유형을 추가·수정하려면 아래 SR_QUESTION_TYPES 배열만 고치면 된다.
import { SR_DOMAINS } from './srBlueprint.js';

export type SrSection = 'word' | 'passage' | 'grammar';

export interface SrQuestionType {
  no: number;
  part: string;       // 안내서의 PART 이름
  name: string;       // 영문 유형명
  nameKo: string;     // 한글 유형명
  section: SrSection; // 어느 생성 프롬프트에서 쓰는지
  domain: string;     // Star Reading 영역
  skill: string;      // DOMAIN_SKILLS 중 대응 기술
  what: string;       // 어떤 문제? (학생용 설명)
  howTo: string;      // 풀이법 (학생용 설명)
  writerRule: string; // 출제자(AI)용 규칙
  example: { passage: string; question: string; options: string[]; answer: number }; // answer: 0부터 시작
}

export const SR_QUESTION_TYPES: SrQuestionType[] = [
  {
    no: 1, part: 'WORD CLUES', name: 'Vocabulary', nameKo: '어휘', section: 'word',
    domain: SR_DOMAINS.WORD, skill: 'Synonyms',
    what: '밑줄 친 단어와 뜻이 같은 말을 고르기',
    howTo: '단어 앞뒤를 읽고 → 보기의 단어로 바꾸어 문장에 넣어 보기',
    writerRule: 'The next sentence gives a clear clue to the target word (size, amount, comparison). Every option can be swapped into the sentence; only one keeps the meaning.',
    example: { passage: 'The baby was tiny. It could fit in one hand.', question: 'What does "tiny" mean?', options: ['very noisy', 'very small', 'very fast', 'very old'], answer: 1 },
  },
  {
    no: 2, part: 'WORD CLUES', name: 'Context Clue', nameKo: '문맥 단서', section: 'word',
    domain: SR_DOMAINS.WORD, skill: 'Context Clues',
    what: '앞뒤 문장을 단서로 빈칸이나 낯선 단어 뜻 추측하기',
    howTo: '앞뒤의 사건 확인 → 원인과 결과 연결 → 가장 자연스러운 답 찾기',
    writerRule: 'Earlier sentences set up a cause; the blank is the result. Include the opposite of the answer as a distractor (wet vs. dry).',
    example: { passage: 'Tom forgot his umbrella. It rained all the way home. His jacket was completely _____.', question: 'Which word best completes the sentence?', options: ['warm', 'clean', 'dry', 'wet'], answer: 3 },
  },
  {
    no: 3, part: 'READ THE TEXT', name: 'Main Idea', nameKo: '중심 내용', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Main Idea',
    what: '글 전체가 말하려는 한 가지 큰 생각 찾기',
    howTo: '첫 문장과 반복되는 내용 확인 → 모든 예시를 묶는 답 선택',
    writerRule: 'The passage gives 3+ examples that share one umbrella idea that is NOT stated word-for-word. Distractors reuse a single surface detail (bag, shopping).',
    example: { passage: 'Lisa brings her own shopping bag. She recycles paper and plastic. She also saves water every day.', question: 'What is the main idea?', options: ['Lisa helps protect the environment.', 'Lisa likes going shopping.', 'Lisa wants to buy a new bag.', 'Lisa enjoys playing outside.'], answer: 0 },
  },
  {
    no: 4, part: 'READ THE TEXT', name: 'Detail', nameKo: '세부 정보', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Key Details',
    what: '글에 직접 쓰여 있는 사실을 찾기',
    howTo: '질문 속 who / what / when 등 먼저 확인 → 같은 내용 찾기',
    writerRule: 'The answer is stated in the passage. Distractors change one feature of the fact (number, subject, kind of thing).',
    example: { passage: 'David went to the library after school. He borrowed two science books for his project.', question: 'What did David borrow?', options: ['A math notebook', 'Three storybooks', 'Two science books', 'A history book'], answer: 2 },
  },
  {
    no: 5, part: 'CONNECT THE CLUES', name: 'Inference', nameKo: '추론', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Inference',
    what: '글에는 직접 없지만 단서로 알 수 있는 것 찾기',
    howTo: '단서 두 개 이상 연결 → 지나친 상상이나 근거 없는 보기 제외',
    writerRule: 'The answer is never stated; it needs 2+ clues combined. Distractors are the opposite of the clues or have no support in the text.',
    example: { passage: 'Mina checked the weather report. She packed a raincoat and put an umbrella in her school bag.', question: 'What can we infer?', options: ['It will be very hot.', 'Mina is going swimming.', 'It may rain soon.', 'Mina lost her school bag.'], answer: 2 },
  },
  {
    no: 6, part: 'CONNECT THE CLUES', name: 'Pronoun', nameKo: '대명사', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Pronoun Reference',
    what: 'he / she / it / they 가 가리키는 대상 찾기',
    howTo: '대명사를 원래 이름으로 바꾸기 → 문장이 자연스러운지 확인',
    writerRule: 'Mark the pronoun with <u></u> in the passage and the question. All other nouns from the passage appear as distractors.',
    example: { passage: 'Jenny found a puppy near the park. She took <u>it</u> home.', question: 'What does "it" refer to?', options: ['Jenny', 'the puppy', 'the park', 'home'], answer: 1 },
  },
  {
    no: 7, part: 'FOLLOW THE RULE', name: 'Sequence', nameKo: '사건 순서', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Sequence',
    what: 'first / next / then / finally 등 순서 파악하기',
    howTo: '순서 단어 표시 → 질문의 before / after 확인',
    writerRule: 'Use signal words (first, then, next, finally). Ask what happened before/after a step; the distractors include the event from the wrong position.',
    example: { passage: 'First, Ben looked in the garden. Then, he checked his bag. Finally, he found his key in his jacket pocket.', question: 'What did Ben do after looking in the garden?', options: ['He opened the door.', 'He found the key.', 'He went to school.', 'He checked his bag.'], answer: 3 },
  },
  {
    no: 8, part: 'FOLLOW THE RULE', name: 'Grammar', nameKo: '문법', section: 'grammar',
    domain: SR_DOMAINS.WORD, skill: 'Vocabulary in Context',
    what: '시간 표현과 문장 구조에 맞는 형태 찾기',
    howTo: '시간 표현 → 주어 → 동사 모양 순서로 확인',
    writerRule: 'A time expression (yesterday, every day, now) decides the verb form. Options are four forms of ONE verb (-ed, base, -ing, -s).',
    example: { passage: 'Yesterday, Mia _____ her grandmother.', question: 'Choose the correct verb.', options: ['visited', 'visit', 'visiting', 'visits'], answer: 0 },
  },
  {
    no: 9, part: 'FINISH STRONG', name: 'Sentence Completion', nameKo: '문장 완성', section: 'passage',
    domain: SR_DOMAINS.COMPREHENSION, skill: 'Cause and Effect',
    what: '글의 이유·결과에 맞게 문장 끝 완성하기',
    howTo: '빈칸 앞뒤에서 이유 찾기 → 문법과 의미 둘 다 검사',
    writerRule: 'The question is an unfinished sentence with "because/so" + "_____". All options fit grammatically; only one matches the reason in the passage.',
    example: { passage: 'Lily was tired after soccer practice. She drank some water and sat on a bench.', question: 'Lily sat on a bench because she _____.', options: ['wanted to run more', 'lost her shoes', 'needed to rest', 'wanted to buy a book'], answer: 2 },
  },
  {
    no: 10, part: 'FINISH STRONG', name: 'Writing', nameKo: '글의 흐름', section: 'passage',
    domain: SR_DOMAINS.CRAFT, skill: 'Concluding Sentence',
    what: '문단의 주제에 어울리는 문장 찾기',
    howTo: '앞 문장들의 공통 주제 확인 → 흐름에 맞고 문법도 맞는 답 선택',
    writerRule: 'Ask for the best concluding (or next) sentence. Distractors are correct sentences that are off-topic for the paragraph.',
    example: { passage: 'I love taking care of my garden. I water the flowers and make sure the plants get sunlight.', question: 'Which is the best concluding sentence?', options: ['I enjoy helping my garden grow.', 'My brother plays basketball.', 'School starts at nine.', 'I lost my pencil yesterday.'], answer: 0 },
  },
];

export const questionTypesFor = (section: SrSection) => SR_QUESTION_TYPES.filter((t) => t.section === section);

// 프롬프트에 넣을 레퍼런스 블록. 예시는 "형식 참고용"이며 그대로 베끼지 않게 지시한다.
export const questionTypeReference = (sections: SrSection[]) => {
  const types = SR_QUESTION_TYPES.filter((t) => sections.includes(t.section));
  const blocks = types.map((t) => {
    const opts = t.example.options.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join('  ');
    return `[${t.name} — skill "${t.skill}"] ${t.writerRule}
  Example: ${t.example.passage} / Q: ${t.example.question} / ${opts} → ${String.fromCharCode(65 + t.example.answer)}`;
  }).join('\n');
  return `
**SR QUESTION TYPE REFERENCE (from the teacher's SR Quick Guide — match these patterns; NEVER copy the example text, names, or topics):**
${blocks}
- Scale passage length, vocabulary, and distractor subtlety to each item's target GE; the examples above are GE ~1-2.
- In each item's Korean 'explanation', coach with that type's solving strategy (e.g., 대명사를 원래 이름으로 바꿔 넣어 보기).`;
};
