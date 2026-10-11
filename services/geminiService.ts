
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TestData, Question, ReadingSection, VocabWord } from "../types";
import { DOMAIN_SKILLS, SR_DOMAINS, TestLength, getBlueprint, normalizeTestData, splitComprehension } from "./srBlueprint";

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
    explanation: {
      type: Type.STRING,
      description: "Growth-oriented coaching in Korean. Instead of just giving the answer, provide questions that encourage thinking (e.g., '주인공은 왜 이런 선택을 했을까?', '이 단어가 이 문맥에서는 어떤 느낌이야?')."
    },
  },
  required: ["id", "type", "domain", "skill", "question", "hint", "options", "correctAnswer", "explanation"],
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
const srItemRules = (srLevel: string) => `
**STAR READING ITEM STYLE (CRITICAL — imitate the real Renaissance Star Reading test):**
- Write ORIGINAL items. Never copy real Star Reading items.
- Neutral, concise test language. No emojis, no exclamation-heavy or cute wording, no "Hey kids!".
- Every item has EXACTLY 4 answer options and EXACTLY ONE defensible correct answer.
- Distractors must be plausible to a student who misread or partly understood, similar in length and grammatical form to the key. A careful reader must be able to rule each one out.
- NEVER use "All of the above", "None of the above", "Both A and B", or option letters inside option text (options are shuffled later).
- Avoid giving away the answer by repeating a rare word from the question only in the correct option.
- HTML allowed in 'question' only: <u>word</u> to mark a target word. Nothing else.
- **Difficulty calibration (adaptive-test style):** target Grade Equivalent ${srLevel}. About 20% of items slightly easier (${srLevel} minus 0.5–1.0), 60% right at ${srLevel}, 20% slightly harder (${srLevel} plus 0.5–1.0). Mix the order — do NOT sort by difficulty.
- Vocabulary, sentence length, and concepts must match a US student reading at GE ${srLevel}.
- 'hint': one short English practice hint that points to a clue without revealing the answer.
- 'explanation': growth-oriented, question-based coaching in KOREAN. Do NOT just state the answer; guide thinking (e.g., "문장에서 힌트가 되는 단어를 찾아볼까?", "주인공은 왜 이런 선택을 했을까?").
`;

const namingRules = (names: string[], allowSpecialNames: boolean) => `
**NAMES & SUBJECTS:**
- Use proper names in only about 30-40% of items. Otherwise use subjects like "the scientist", "a hungry bear", "the old bridge", "the storm".
${allowSpecialNames
  ? `- You MAY use AT MOST ONE of Joy (boy), Jian (girl), Yuna (girl) in AT MOST ONE item.`
  : `- Do NOT use the names Joy, Jian, or Yuna.`}
- Other names: ${names.join(', ')}. Do NOT use the name "Leo".
`;

const buildVocabPrompt = (srLevel: string, count: number, clozeSentences: string, theme: string, names: string[], keyVocabCount: number, includeListening: boolean) => `
You are an assessment writer who builds practice items in the exact format of the Renaissance Star Reading test (US K-12).
Request time: ${new Date().toISOString()}

Create the **Word Knowledge and Skills** section: EXACTLY ${count} items for a student at Star Reading Grade Equivalent (GE) **${srLevel}**.
Semantic field for word choice: **${theme}** (vary the words; avoid the most common "textbook" words for this level).

**FORMAT (Star Reading "vocabulary-in-context" items):**
- type: "VOCAB", domain: "${SR_DOMAINS.WORD}".
- At least ${Math.ceil(count * 0.7)} items are CLOZE items: 'question' is ${clozeSentences} with exactly one blank written as "_____" (five underscores). Do NOT add an instruction line such as "Which word best completes the sentence?" — the app shows it. skill: "Vocabulary in Context" or "Context Clues".
  - All 4 options are single words (or a 2-word phrasal verb) of the SAME part of speech and SAME form (tense/number), so every option is grammatically possible and only the meaning decides.
  - The sentence must contain a context clue (definition, example, contrast, cause/effect) that makes exactly one option correct.
- The remaining items test other Word Knowledge skills, still inside a sentence, with the target word in <u></u>:
  - Synonyms: "Which word means the same as <u>X</u>?" / Antonyms: "Which word means the opposite of <u>X</u>?"
  - Multiple-Meaning Words: "In which sentence does <u>X</u> mean the same as in the sentence above?" (only GE 3+)
  - Prefixes/Suffixes or Root Words: "The prefix <u>un-</u> in <u>unwrap</u> means —" style (only GE 2+)
  - Write the context sentence first, then the question, on one line.
- skill must be one of: ${DOMAIN_SKILLS[SR_DOMAINS.WORD].join(', ')}.
${srItemRules(srLevel)}
${namingRules(names, false)}
${includeListening ? `
**LISTENING (extra practice — not part of the real Star Reading test):**
- Also create EXACTLY 2 items in 'listening': type "LISTENING", domain "Listening Comprehension", skill "Key Details" or "Inference".
- 'script': 3-4 sentences of narration or dialogue at GE ${srLevel}. 'question' answerable only by listening to the script.
` : `- 'listening' must be an empty array.`}

**KEY VOCABULARY:** Return EXACTLY ${keyVocabCount} words in 'keyVocabulary', chosen from the correct answers and context sentences above. For each: Korean meaning, concise English definition suitable for the level, one English example sentence (different from the test item).
`;

const buildReadingPrompt = (srLevel: string, plan: { domain: string; count: number }[], passageWords: string, informationalRatio: number, topics: string[], names: string[], allowSpecialNames: boolean, keyVocabCount: number) => {
  const total = plan.reduce((sum, p) => sum + p.count, 0);
  const level = Number(srLevel);
  return `
You are an assessment writer who builds practice items in the exact format of the Renaissance Star Reading test (US K-12).
Request time: ${new Date().toISOString()}

Create EXACTLY ${total} **passage-based items** for a student at Star Reading Grade Equivalent (GE) **${srLevel}**.

**FORMAT (CRITICAL — Star Reading uses short, independent passages):**
- Each item is ONE entry in 'reading' with its OWN short passage and EXACTLY ONE question (questions array length = 1). Never reuse a passage.
- Passage length: ${passageWords}. Paragraphs separated by "\\n".
- Passages read like authentic excerpts: a scene from a story, a paragraph from a science/social-studies article, a biography snippet, a short poem, a letter, an ad, a how-to. About ${Math.round(informationalRatio * 100)}% informational (non-fiction), the rest literary (fiction, folktale/fable, poem).
- passageTitle: a short title for informational articles and poems; empty string "" for story excerpts.
- type: "READING". All topics must be different from each other. Draw topics from: ${topics.join('; ')}.
- Each question must be answerable from its passage alone. Inference items must require reasoning across sentences, not a single-sentence lookup.

**DOMAIN DISTRIBUTION (exact counts):**
${plan.map(p => `- ${p.count} items — domain "${p.domain}"; skill from: ${DOMAIN_SKILLS[p.domain].join(', ')}`).join('\n')}
Vary the skills within each domain.

**TYPICAL STAR READING QUESTION STEMS (adapt, don't copy word-for-word):**
- "What is this passage mostly about?" / "Which sentence best tells the main idea of the passage?"
- "Why did the town build a new bridge?" / "What happened right after Mia opened the box?"
- "Based on the passage, what will most likely happen next?" / "What can the reader tell about the fox?"
- "Which word best describes Sam in this passage?" / "How does Ana feel at the end of the story?"
- "What lesson does this story teach?" / "This passage is most likely from —" (genre)
- "The author wrote this passage mostly to —" / "Why does the author compare the clouds to cotton?"
- "Which sentence from the passage is an opinion?" / "Which detail best supports the author's claim that ...?"
- "In the passage, the word <u>X</u> means —"
${level >= 4 ? `- For "Comparing Texts" you may put two very short texts in one passage labeled "Passage 1" and "Passage 2".` : `- Do NOT use "Comparing Texts" items at this level.`}
${level < 3 ? `- At this level keep "${SR_DOMAINS.ARGUMENT}" items simple: fact vs. opinion, or which reason supports what a character/writer thinks.` : `- "${SR_DOMAINS.ARGUMENT}" passages should contain a clear claim with reasons/evidence (e.g., a short persuasive letter, review, or opinion paragraph).`}
${srItemRules(srLevel)}
${namingRules(names, allowSpecialNames)}

**KEY VOCABULARY:** Return EXACTLY ${keyVocabCount} academic words that appear in your passages. For each: Korean meaning, concise English definition suitable for the level, one English example sentence (different from the passage).
`;
};

export const generateSRTest = async (srLevel: string, includeListening: boolean = false, testLength: TestLength = 'full'): Promise<TestData> => {
  const blueprint = getBlueprint(srLevel, testLength);
  // 지문형 문항은 여러 호출로 나눠 병렬 생성해 응답 시간을 줄인다.
  const readingParts = splitComprehension(blueprint.comprehension, testLength === 'full' ? 3 : 2);
  const themes = shuffle(VOCAB_THEMES);
  const names = getRandomNames(5 * (readingParts.length + 1));
  const namesFor = (i: number) => names.slice(i * 5, i * 5 + 5);
  const keyVocabTotal = 15;
  const vocabKeyCount = 6;
  const readingKeyCount = Math.ceil((keyVocabTotal - vocabKeyCount) / readingParts.length);

  try {
    const [vocabPart, ...readingResults] = await Promise.all([
      callGemini<{ vocabulary: Question[]; listening: Question[]; keyVocabulary: VocabWord[] }>(
        buildVocabPrompt(srLevel, blueprint.vocabCount, blueprint.clozeSentences, themes[0], namesFor(0), vocabKeyCount, includeListening),
        vocabPartSchema,
      ),
      ...readingParts.map((plan, i) => {
        const topicThemes = [themes[(i * 2 + 1) % themes.length], themes[(i * 2 + 2) % themes.length]];
        return callGemini<{ reading: ReadingSection[]; keyVocabulary: VocabWord[] }>(
          buildReadingPrompt(srLevel, plan, blueprint.passageWords, blueprint.informationalRatio, topicThemes, namesFor(i + 1), i === 0, readingKeyCount),
          readingPartSchema,
        );
      }),
    ]);

    // 실제 시험처럼 이해 영역이 섞여 나오도록 지문 문항 순서를 섞는다.
    const reading = shuffle(readingResults.flatMap(r => (r.reading || []).map(s => ({ ...s, questions: (s.questions || []).slice(0, 1) }))));

    const data: TestData = {
      srLevel,
      vocabulary: vocabPart.vocabulary || [],
      grammar: [],
      reading,
      listening: includeListening ? (vocabPart.listening || []).slice(0, 2) : [],
      keyVocabulary: [...(vocabPart.keyVocabulary || []), ...readingResults.flatMap(r => r.keyVocabulary || [])].slice(0, keyVocabTotal),
    };

    const normalized = normalizeTestData(randomizeTestData(data));
    if (normalized.vocabulary.length === 0 || normalized.reading.length === 0) {
      throw new Error("Generated test is missing sections");
    }
    return normalized;
  } catch (error) {
    console.error("Error generating test:", error);
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
${srItemRules(srLevel)}
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
