
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { TestData, Question, ReadingSection, VocabWord, PassageItemSpec } from "../types";
import { DOMAIN_SKILLS, SR_DOMAINS, clozeLengthFor, getBlueprint, normalizeTestData, optionCountFor, passageWordsFor } from "./srBlueprint.js";
import type { TestLength } from "./srBlueprint.js";
import { VOCAB_POOL_SIZE, createAdaptiveState } from "./adaptiveEngine.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-3-flash-preview';

const ALL_SKILLS = Object.values(DOMAIN_SKILLS).flat();

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.INTEGER },
    type: { type: Type.STRING, enum: ["VOCAB", "GRAMMAR", "READING", "LISTENING"] },
    domain: {
      type: Type.STRING,
      enum: [...Object.values(SR_DOMAINS), "Listening Comprehension"],
      description: "The official Star Reading domain this item measures."
    },
    skill: {
      type: Type.STRING,
      description: `The Star Reading skill within the domain, e.g. ${ALL_SKILLS.slice(0, 12).join(', ')}`
    },
    question: { type: Type.STRING },
    hint: { type: Type.STRING, description: "Short English hint for practice, e.g., 'Think about what water does to the soil.' or 'Look for the word that describes a color.'" },
    script: { type: Type.STRING, description: "Only for listening type: the audio script" },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    correctAnswer: { type: Type.INTEGER },
    difficulty: { type: Type.NUMBER, description: "Target Grade Equivalent of this item" },
    explanation: {
      type: Type.STRING,
      description: "Growth-oriented coaching in Korean. Instead of just giving the answer, provide questions that encourage thinking (e.g., '주인공은 왜 이런 선택을 했을까?', '이 단어가 이 문맥에서는 어떤 느낌이야?')."
    },
  },
  required: ["id", "type", "domain", "skill", "question", "hint", "options", "correctAnswer", "difficulty", "explanation"],
};

const vocabWordSchema = {
  type: Type.OBJECT,
  properties: {
    word: { type: Type.STRING },
    meaning: { type: Type.STRING, description: "Meaning in Korean" },
    definition: { type: Type.STRING, description: "Definition in English" },
    example: { type: Type.STRING },
  },
  required: ["word", "meaning", "definition", "example"],
};

const readingSectionSchema = {
  type: Type.OBJECT,
  properties: {
    passageTitle: { type: Type.STRING, description: "Title for informational articles/poems; empty string for story excerpts." },
    passageContent: { type: Type.STRING },
    questions: { type: Type.ARRAY, items: questionSchema },
  },
  required: ["passageTitle", "passageContent", "questions"],
};

const fullTestSchema = {
  type: Type.OBJECT,
  properties: {
    srLevel: { type: Type.STRING },
    vocabulary: { type: Type.ARRAY, items: questionSchema },
    grammar: { type: Type.ARRAY, items: questionSchema },
    reading: { type: Type.ARRAY, items: readingSectionSchema },
    listening: { type: Type.ARRAY, items: questionSchema },
    keyVocabulary: { type: Type.ARRAY, items: vocabWordSchema },
  },
  required: ["srLevel", "vocabulary", "grammar", "reading", "listening", "keyVocabulary"],
};

const vocabPartSchema = {
  type: Type.OBJECT,
  properties: {
    vocabulary: { type: Type.ARRAY, items: questionSchema },
    listening: { type: Type.ARRAY, items: questionSchema },
    keyVocabulary: { type: Type.ARRAY, items: vocabWordSchema },
  },
  required: ["vocabulary", "listening", "keyVocabulary"],
};

const readingPartSchema = {
  type: Type.OBJECT,
  properties: {
    reading: { type: Type.ARRAY, items: readingSectionSchema },
    keyVocabulary: { type: Type.ARRAY, items: vocabWordSchema },
  },
  required: ["reading", "keyVocabulary"],
};

// List of diverse themes to force the AI to pick vocabulary from different semantic fields
const VOCAB_THEMES = [
  "Nature, Biology, and Environment",
  "Technology, Innovation, and Future",
  "History, Ancient Civilizations, and Culture",
  "Emotions, Personality, and Relationships",
  "Arts, Literature, and Creativity",
  "Adventure, Exploration, and Travel",
  "Science, Space, and Physics",
  "Society, Community, and Civics",
  "Abstract Concepts, Logic, and Philosophy"
];

// Updated list focusing ONLY on US and Korean names (Romanized)
const CHARACTER_NAMES = [
  // US Popular Names (Modern & Classic)
  "Noah", "Emma", "Liam", "Olivia", "Ethan", "Ava", "Mason", "Sophia",
  "James", "Charlotte", "Benjamin", "Amelia", "Lucas", "Harper", "Henry",
  "Evelyn", "Alexander", "Abigail", "Michael", "Emily", "Daniel", "Madison",
  "Jack", "Grace", "Samuel", "Lily", "David", "Chloe", "Joseph", "Ella",
  "Matthew", "Scarlett", "Jackson", "Victoria", "Sebastian", "Aria",

  // Korean Names (Romanized, easy to read in English context)
  "Minji", "Junho", "Seojun", "Haeun", "Doyun", "Jiwoo",
  "Hyunwoo", "Yeeun", "Siwoo", "Soah", "Minjun", "Jiyoung",
  "Sumin", "Dojin", "Yerin", "Jiho", "Subin", "Taeyoon"
];

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const getRandomNames = (count: number) => shuffle(CHARACTER_NAMES).slice(0, count);

// Helper to shuffle options and update correct answer index
const randomizeQuestionOptions = (question: Question) => {
  const currentOptions = [...question.options];
  // Guard clause if options are empty or invalid
  if (!currentOptions || currentOptions.length === 0) return;

  const correctOptionText = currentOptions[question.correctAnswer];

  // Fisher-Yates shuffle
  for (let i = currentOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentOptions[i], currentOptions[j]] = [currentOptions[j], currentOptions[i]];
  }

  // Update question with shuffled options
  question.options = currentOptions;
  // Find new index of the correct answer
  const newCorrectIndex = currentOptions.indexOf(correctOptionText);
  // Fallback if something went wrong (shouldn't happen), keep original
  if (newCorrectIndex !== -1) {
    question.correctAnswer = newCorrectIndex;
  }
};

const randomizeTestData = (data: TestData): TestData => {
  // Deep copy/modification is fine here as we just parsed it
  data.vocabulary.forEach(randomizeQuestionOptions);
  data.grammar.forEach(randomizeQuestionOptions);
  data.reading.forEach(section => {
    section.questions.forEach(randomizeQuestionOptions);
  });
  if (data.listening) {
    data.listening.forEach(randomizeQuestionOptions);
  }
  return data;
};

const callGemini = async <T,>(prompt: string, responseSchema: object): Promise<T> => {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 1.0,
    }
  });
  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as T;
};

export const generateSpeech = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error("No audio data returned");
    }
    return audioData;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};

// Star Reading 문항 공통 규칙: 실제 시험 화면처럼 담백한 문항, 정답 1개, 섞어도 성립하는 선택지.
const srItemRules = (calibration: string) => `
**STAR READING ITEM STYLE (CRITICAL — imitate the real Renaissance Star Reading test):**
- Write ORIGINAL items. Never copy real Star Reading items.
- Neutral, concise test language. No emojis, no exclamation-heavy or cute wording, no "Hey kids!".
- Number of answer options: 3 for items below GE 2.0 (kindergarten/first-grade level), otherwise 4 — exactly as Star Reading does. EXACTLY ONE defensible correct answer.
- Distractors must be plausible to a student who misread or partly understood, similar in length and grammatical form to the key. A careful reader must be able to rule each one out.
- NEVER use "All of the above", "None of the above", "Both A and B", or option letters inside option text (options are shuffled later).
- Avoid giving away the answer by repeating a rare word from the question only in the correct option.
- HTML allowed in 'question' only: <u>word</u> to mark a target word. Nothing else.
- **Difficulty calibration:** ${calibration}
- Difficulty comes from vocabulary level, sentence complexity, text length, and the depth of reasoning required — NOT from tricky wording.
- 'hint': one short English practice hint that points to a clue without revealing the answer.
- 'explanation': growth-oriented, question-based coaching in KOREAN. Do NOT just state the answer; guide thinking (e.g., "문장에서 힌트가 되는 단어를 찾아볼까?", "주인공은 왜 이런 선택을 했을까?").
`;

const PER_ITEM_CALIBRATION = `Each item below has its own TARGET Grade Equivalent (GE). Write every item so that a typical US student reading exactly at that GE answers it correctly about 60-70% of the time, and set the item's 'difficulty' field to that target GE. Items are used in a computer-adaptive test, so accurate calibration matters more than anything else.`;

const namingRules = (names: string[], allowSpecialNames: boolean) => `
**NAMES & SUBJECTS:**
- Use proper names in only about 30-40% of items. Otherwise use subjects like "the scientist", "a hungry bear", "the old bridge", "the storm".
${allowSpecialNames
  ? `- You MAY use AT MOST ONE of Joy (boy), Jian (girl), Yuna (girl) in AT MOST ONE item.`
  : `- Do NOT use the names Joy, Jian, or Yuna.`}
- Other names: ${names.join(', ')}. Do NOT use the name "Leo".
`;

const buildVocabPrompt = (startLevel: number, difficulties: number[], theme: string, names: string[], keyVocabCount: number, includeListening: boolean) => {
  // 약 70%는 빈칸(cloze) 문항, 나머지는 유의어·반의어·단어 구성 문항
  const specs = difficulties.map((d, i) => {
    const cloze = d < 2 || i % 10 < 7;
    return `- Item ${i + 1}: target GE ${d.toFixed(1)}, ${optionCountFor(d)} options, format: ${cloze ? `CLOZE (${clozeLengthFor(d)})` : 'WORD SKILL (synonym, antonym, multiple-meaning word, or prefix/suffix/root)'}`;
  }).join('\n');
  return `
You are an assessment writer who builds items in the exact format of the Renaissance Star Reading test (US K-12).
Request time: ${new Date().toISOString()}

Create an item pool for the **Word Knowledge and Skills** section (Star Reading items 1-10 are "vocabulary-in-context" items). The student's starting level is about GE ${startLevel.toFixed(1)}.
Semantic field for word choice: **${theme}** (vary the words; avoid the most common "textbook" words for each level).

**ITEMS TO WRITE (exactly these, in this order):**
${specs}

**FORMAT:**
- type: "VOCAB", domain: "${SR_DOMAINS.WORD}".
- CLOZE items: 'question' is the sentence(s) with exactly one blank written as "_____" (five underscores). Do NOT add an instruction line such as "Which word best completes the sentence?" — the app shows it. skill: "Vocabulary in Context" or "Context Clues".
  - All options are single words (or a 2-word phrasal verb) of the SAME part of speech and SAME form (tense/number), so every option is grammatically possible and only the meaning decides.
  - The sentence must contain a context clue (definition, example, contrast, cause/effect) that makes exactly one option correct. The target word itself is at the item's GE.
- WORD SKILL items: a context sentence containing the target word in <u></u>, then the question on the same line, e.g.
  - "Which word means the same as <u>X</u>?" / "Which word means the opposite of <u>X</u>?"
  - "In which sentence does <u>X</u> mean the same as in the sentence above?" (only GE 3+)
  - "The prefix <u>un-</u> in <u>unwrap</u> means —" (only GE 2+)
- skill must be one of: ${DOMAIN_SKILLS[SR_DOMAINS.WORD].join(', ')}.
${srItemRules(PER_ITEM_CALIBRATION)}
${namingRules(names, true)}
${includeListening ? `
**LISTENING (extra practice — not part of the real Star Reading test):**
- Also create EXACTLY 2 items in 'listening': type "LISTENING", domain "Listening Comprehension", skill "Key Details" or "Inference", difficulty ${startLevel.toFixed(1)}.
- 'script': 3-4 sentences of narration or dialogue at GE ${startLevel.toFixed(1)}. 'question' answerable only by listening to the script.
` : `- 'listening' must be an empty array.`}

**KEY VOCABULARY:** Return EXACTLY ${keyVocabCount} words in 'keyVocabulary', chosen from the correct answers and context sentences above. For each: Korean meaning, concise English definition suitable for the level, one English example sentence (different from the test item).
`;
};

const buildReadingPrompt = (specs: PassageItemSpec[], startLevel: number, topics: string[], names: string[], keyVocabCount: number) => {
  const informational = startLevel < 3 ? 40 : startLevel < 6 ? 50 : 60;
  const list = specs.map((spec, i) =>
    `- Item ${i + 1}: domain "${spec.domain}", target GE ${spec.difficulty.toFixed(1)}, ${optionCountFor(spec.difficulty)} options, passage ${passageWordsFor(spec.difficulty)}; skill from: ${DOMAIN_SKILLS[spec.domain].join(', ')}`
  ).join('\n');
  return `
You are an assessment writer who builds items in the exact format of the Renaissance Star Reading test (US K-12).
Request time: ${new Date().toISOString()}

Create passage-based items for a computer-adaptive Star Reading-style test.

**ITEMS TO WRITE (exactly these, in this order):**
${list}

**FORMAT (CRITICAL — Star Reading uses short, independent passages):**
- Each item is ONE entry in 'reading' with its OWN short passage and EXACTLY ONE question (questions array length = 1). Never reuse a passage.
- Passage length follows each item's spec. Paragraphs separated by "\\n".
- Passages read like authentic excerpts: a scene from a story, a paragraph from a science/social-studies article, a biography snippet, a short poem, a letter, an ad, a how-to. About ${informational}% informational (non-fiction), the rest literary (fiction, folktale/fable, poem).
- passageTitle: a short title for informational articles and poems; empty string "" for story excerpts.
- type: "READING". All topics must be different from each other. Draw topics from: ${topics.join('; ')}.
- Each question must be answerable from its passage alone. Inference items must require reasoning across sentences, not a single-sentence lookup.
- Vary the skills within each domain.

**TYPICAL STAR READING QUESTION STEMS (adapt, don't copy word-for-word):**
- "What is this passage mostly about?" / "Which sentence best tells the main idea of the passage?"
- "Why did the town build a new bridge?" / "What happened right after Mia opened the box?"
- "Based on the passage, what will most likely happen next?" / "What can the reader tell about the fox?"
- "Which word best describes Sam in this passage?" / "How does Ana feel at the end of the story?"
- "What lesson does this story teach?" / "This passage is most likely from —" (genre)
- "The author wrote this passage mostly to —" / "Why does the author compare the clouds to cotton?"
- "Which sentence from the passage is an opinion?" / "Which detail best supports the author's claim that ...?"
- "In the passage, the word <u>X</u> means —"
- "Comparing Texts" items (only when target GE is 4.0 or higher): put two very short texts in one passage labeled "Passage 1" and "Passage 2".
- "${SR_DOMAINS.ARGUMENT}" items below GE 3.0: keep simple (fact vs. opinion, which reason supports what a writer thinks). At GE 3.0+: the passage contains a clear claim with reasons/evidence (short persuasive letter, review, or opinion paragraph).
${srItemRules(PER_ITEM_CALIBRATION)}
${namingRules(names, false)}

**KEY VOCABULARY:** Return EXACTLY ${keyVocabCount} academic words that appear in your passages. For each: Korean meaning, concise English definition suitable for the level, one English example sentence (different from the passage).
`;
};

// 적응형 시험 시작: 어휘 문항 풀(시작 레벨 ±2 GE에 고르게 분포)과 듣기 문항을 생성한다.
// 지문 문항은 학생의 응답으로 능력을 추정한 뒤 generatePassageItems로 단계별로 생성한다.
export const generateSRTest = async (srLevel: string, includeListening: boolean = false, testLength: TestLength = 'full'): Promise<TestData> => {
  const startLevel = Number(srLevel);
  const poolSize = VOCAB_POOL_SIZE[testLength];
  const difficulties = shuffle(Array.from({ length: poolSize }, (_, i) =>
    Math.round(Math.min(12.9, Math.max(0.5, startLevel - 2 + (4 * i) / (poolSize - 1))) * 10) / 10
  ));
  const [theme] = shuffle(VOCAB_THEMES);

  try {
    const part = await callGemini<{ vocabulary: Question[]; listening: Question[]; keyVocabulary: VocabWord[] }>(
      buildVocabPrompt(startLevel, difficulties, theme, getRandomNames(5), 5, includeListening),
      vocabPartSchema,
    );
    // 모델이 difficulty를 빠뜨려도 요청한 목표 난이도를 순서대로 채운다.
    const vocabPool = (part.vocabulary || []).map((q, i) => ({ ...q, difficulty: typeof q.difficulty === 'number' ? q.difficulty : difficulties[i] ?? startLevel }));

    const normalized = normalizeTestData(randomizeTestData({
      srLevel,
      vocabulary: vocabPool,
      grammar: [],
      reading: [],
      listening: includeListening ? (part.listening || []).slice(0, 2) : [],
      keyVocabulary: part.keyVocabulary || [],
    }));
    if (normalized.vocabulary.length === 0) throw new Error("Generated vocabulary pool is empty");

    return {
      ...normalized,
      vocabulary: [],
      adaptive: createAdaptiveState(startLevel, testLength, normalized.vocabulary),
    };
  } catch (error) {
    console.error("Error generating test:", error);
    throw error;
  }
};

// 어휘 문항 보충: 처음 몇 문항으로 추정한 능력에 맞춘 난이도로 남은 어휘 자리를 채울 문항을 만든다.
export const generateVocabItems = async (difficulties: number[], startLevel: number): Promise<{ vocabulary: Question[]; keyVocabulary: VocabWord[] }> => {
  const [theme] = shuffle(VOCAB_THEMES);
  try {
    const part = await callGemini<{ vocabulary: Question[]; listening: Question[]; keyVocabulary: VocabWord[] }>(
      buildVocabPrompt(startLevel, difficulties, theme, getRandomNames(5), 3, false),
      vocabPartSchema,
    );
    const vocabulary = (part.vocabulary || []).map((q, i) => ({ ...q, type: 'VOCAB' as const, difficulty: typeof q.difficulty === 'number' ? q.difficulty : difficulties[i] ?? startLevel }));
    const normalized = normalizeTestData(randomizeTestData({
      srLevel: String(startLevel), vocabulary, grammar: [], reading: [], listening: [], keyVocabulary: part.keyVocabulary || [],
    }));
    return { vocabulary: normalized.vocabulary, keyVocabulary: normalized.keyVocabulary };
  } catch (error) {
    console.error("Error generating vocabulary items:", error);
    throw error;
  }
};

// 지문 문항 풀 생성. 응답 시간을 줄이려고 클라이언트가 사양을 나눠 병렬로 호출한다.
export const generatePassageItems = async (specs: PassageItemSpec[], startLevel: number): Promise<{ reading: ReadingSection[]; keyVocabulary: VocabWord[] }> => {
  const themes = shuffle(VOCAB_THEMES).slice(0, 2);
  try {
    const part = await callGemini<{ reading: ReadingSection[]; keyVocabulary: VocabWord[] }>(
      buildReadingPrompt(specs, startLevel, themes, getRandomNames(5), 2),
      readingPartSchema,
    );
    const reading = (part.reading || []).map((s, i) => ({
      ...s,
      questions: (s.questions || []).slice(0, 1).map(q => ({
        ...q,
        type: 'READING' as const,
        difficulty: typeof q.difficulty === 'number' ? q.difficulty : specs[i]?.difficulty ?? startLevel,
      })),
    }));
    const normalized = normalizeTestData(randomizeTestData({
      srLevel: String(startLevel), vocabulary: [], grammar: [], reading, listening: [], keyVocabulary: part.keyVocabulary || [],
    }));
    return { reading: normalized.reading, keyVocabulary: normalized.keyVocabulary };
  } catch (error) {
    console.error("Error generating passages:", error);
    throw error;
  }
};

const TWIN_CHUNK_SIZE = 8;

const buildTwinPrompt = (wrongQuestions: Question[], srLevel: string, names: string[], allowSpecialNames: boolean, keyVocabCount: number) => {
  // Minimize the context sent to API to avoid token limits, just send question text and domain
  const minimalQuestions = wrongQuestions.map(q => ({
    type: q.type,
    domain: q.domain,
    skill: q.skill,
    questionText: q.question,
    script: q.script // Include script if it's a listening question
  }));

  const { passageWords, clozeSentences } = getBlueprint(srLevel);

  return `
You are an assessment writer who builds practice items in the exact format of the Renaissance Star Reading test (US K-12).
The student answered the following items incorrectly on a Star Reading-style test at Grade Equivalent ${srLevel}.
Create a "Twin Questions" review set: for EACH input item, create ONE NEW item that tests the exact same skill with different content.

**FORMAT RULES:**
1. Word Knowledge items (type VOCAB, domain "${SR_DOMAINS.WORD}"): put them in 'vocabulary'. Cloze items use ${clozeSentences} with one blank "_____" and 4 same-part-of-speech word options; no instruction line. Synonym/antonym/word-part items mark the target word with <u></u>.
2. Passage-based items (type READING, or any input of type GRAMMAR): put each in 'reading' as its OWN short passage (${passageWords}) with EXACTLY ONE question, keeping the same domain and skill. passageTitle: short title for informational texts, "" for story excerpts.
3. Listening items: put them in 'listening' with a NEW 3-4 sentence 'script' and a matching question.
4. 'grammar' must be an empty array.
${srItemRules(`target Grade Equivalent ${srLevel} for every item; set each item's 'difficulty' field to ${srLevel}.`)}
${namingRules(names, allowSpecialNames)}

**Input Items:**
${JSON.stringify(minimalQuestions)}

**KEY VOCABULARY:** Return EXACTLY ${keyVocabCount} words from your new items, each with Korean meaning, English definition, and an English example sentence.
Set srLevel to "${srLevel}".
`;
};

export const generateTwinTest = async (wrongQuestions: Question[], srLevel: string): Promise<TestData> => {
  const chunks: Question[][] = [];
  for (let i = 0; i < wrongQuestions.length; i += TWIN_CHUNK_SIZE) {
    chunks.push(wrongQuestions.slice(i, i + TWIN_CHUNK_SIZE));
  }
  const names = getRandomNames(3 * chunks.length);
  const keyVocabCount = Math.max(2, Math.ceil(5 / chunks.length));

  try {
    const results = await Promise.all(chunks.map((chunk, i) =>
      callGemini<TestData>(buildTwinPrompt(chunk, srLevel, names.slice(i * 3, i * 3 + 3), i === 0, keyVocabCount), fullTestSchema)
    ));

    const data: TestData = {
      srLevel,
      vocabulary: results.flatMap(r => r.vocabulary || []),
      // 모델이 지시를 어기고 grammar에 넣은 문항도 버리지 않는다.
      grammar: results.flatMap(r => r.grammar || []),
      reading: results.flatMap(r => r.reading || []),
      listening: results.flatMap(r => r.listening || []),
      keyVocabulary: results.flatMap(r => r.keyVocabulary || []).slice(0, 5),
    };

    return normalizeTestData(randomizeTestData(data));
  } catch (error) {
    console.error("Error generating twin test:", error);
    throw error;
  }
};
