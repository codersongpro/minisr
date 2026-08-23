
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TestData, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.INTEGER },
    type: { type: Type.STRING, enum: ["VOCAB", "GRAMMAR", "READING", "LISTENING"] },
    domain: { 
      type: Type.STRING, 
      description: "The specific SR domain (e.g., 'Vocabulary in Context', 'Genre Identification', 'Author's Craft', 'Inference', 'Character Analysis', 'Morphology', 'Synonyms/Antonyms', 'Parts of Speech')" 
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
  required: ["id", "type", "domain", "question", "hint", "options", "correctAnswer", "explanation"],
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

const getRandomNames = (count: number) => {
  const shuffled = [...CHARACTER_NAMES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

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

export const generateSRTest = async (srLevel: string, includeListening: boolean = false): Promise<TestData> => {
  const timestamp = new Date().toISOString();
  // Select a random theme for this generation to ensure variety
  const randomTheme = VOCAB_THEMES[Math.floor(Math.random() * VOCAB_THEMES.length)];
  const suggestedNames = getRandomNames(5);
  
  const prompt = `
    You are an expert US elementary education specialist and reading coach for the Renaissance Star Reading (SR) test.
    Create a **COMPLETELY UNIQUE, NEW, and NEVER-BEFORE-SEEN** "Mini SR Test" for a student with an **SR Level of ${srLevel}**.
    
    Current Request Time: ${timestamp}
    **SELECTED VOCABULARY THEME: ${randomTheme}** 
    (Focus on this theme to ensure the vocabulary is different from previous generations, but maintain the SR level difficulty)

    **1. QUESTION GENERATION RULES (CRITICAL):**
    Ensure the following specific SR question types are included across the test:
    * **Vocabulary in Context:** Do not just ask for dictionary definitions. Ask students to infer the meaning of a word based on its context within a sentence or passage.
    * **Genre:** Include questions that ask the student to identify the genre (Fiction, Non-fiction, Fable, etc.) based on the characteristics of the passage.
    * **Author's Craft:** Include questions about literary devices (metaphors, personification, etc.) or the author's purpose/tone.
    * **Inference (High Difficulty):** Include challenging questions that require logical deduction of information NOT explicitly stated in the text.
    * **Character Analysis:** Include questions that ask students to infer a character's traits based on their actions or dialogue.
    * **Morphology:** Include questions that require analyzing prefixes, suffixes, or root words to determine a word's meaning.

    **2. COACHING & EXPLANATION RULES (GROWTH MINDSET):**
    * For the 'explanation' field of each question, **DO NOT simply give the direct answer.**
    * Provide **growth-oriented, question-based coaching in Korean** to help the student think.
    * Examples: "주인공은 왜 이런 선택을 했을까?", "이 단어가 이 문맥에서는 어떤 느낌이야?", "문장에서 힌트가 되는 단어를 찾아볼까?"

    **3. TOPIC DIVERSITY & ENGAGEMENT**
    - Generate unique passages and questions.
    - Topics: Biographies, Science, History, Fables, or Adventure.
    
    **4. SUBJECT VARIETY:**
    - **Do NOT start every question with a person's name.**
    - Use proper names (people) in only about **30-40%** of the questions.
    - For the rest, use diverse subjects such as:
      * **Professions:** "The scientist", "The brave firefighter", "A musician".
      * **Animals:** "The clever fox", "A hungry bear", "The birds".
      * **Inanimate Objects/Nature:** "The old house", "The storm", "A bright star", "The heavy box".
      * **Abstract Concepts:** "His decision", "The solution", "Kindness".
    
    **5. NAMING RULES (When names ARE used):**
    - **Joy (Boy), Jian (Girl), Yuna (Girl)**.
    - **RULE:** Select **EXACTLY ONE** character from this list to appear in the **ENTIRE TEST** (only if needed).
    - If chosen, they must appear in **ONLY ONE** question or passage maximum.
    - For other questions requiring names, use diverse US/Korean names like: **${suggestedNames.join(', ')}**.
    - Do NOT use the name "Leo".

    **6. STRICT SR LEVEL ADHERENCE**
    - Strictly follow complexity and word counts for level ${srLevel}.

    **7. TEST STRUCTURE & VOLUME**
    - Part 1: Word Knowledge & Morphology (10 Qs)
    - Part 2: Author's Craft & Genre (6 Qs)
    - Part 3: Reading Comprehension (2 Passages, 3 Qs each - Must include Inference and Character Analysis)
    ${includeListening ? `- **Part 4: Listening (2 Qs)**
      - Generate 2 listening comprehension questions.
      - For each, provide a 'script' (3-4 sentences of dialogue or narration appropriate for the level) and a 'question'.
      - The 'question' should be answerable by listening to the 'script'.` : ''}

    **8. KEY VOCABULARY FOR PRACTICE**
    - Select **15 key words** from the passages and questions you generated.
    - **CRITICAL:** Do NOT use the most common "textbook" words for this level. Choose high-utility but *varied* academic words related to the theme "${randomTheme}".
    - Avoid repeating the same words if this prompt is run multiple times.
    - For each word, provide:
      - Meaning in Korean.
      - **Definition in English (concise, suitable for level).**
      - One example sentence in English.

    **Output Rules:**
    - JSON format strictly following the schema.
    - English content for questions/passages.
    - Korean Explanations and Meanings.
  `;

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

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      srLevel: { type: Type.STRING },
      vocabulary: { type: Type.ARRAY, items: questionSchema },
      grammar: { type: Type.ARRAY, items: questionSchema },
      reading: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            passageTitle: { type: Type.STRING },
            passageContent: { type: Type.STRING },
            questions: { type: Type.ARRAY, items: questionSchema },
          },
          required: ["passageTitle", "passageContent", "questions"],
        }
      },
      listening: { type: Type.ARRAY, items: questionSchema },
      keyVocabulary: { type: Type.ARRAY, items: vocabWordSchema },
    },
    required: ["srLevel", "vocabulary", "grammar", "reading", "listening", "keyVocabulary"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 1.0, 
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text) as TestData;
    // Apply client-side randomization to ensure answers aren't biased
    return randomizeTestData(data);
  } catch (error) {
    console.error("Error generating test:", error);
    throw error;
  }
};

export const generateTwinTest = async (wrongQuestions: Question[], srLevel: string): Promise<TestData> => {
  // Minimize the context sent to API to avoid token limits, just send question text and domain
  const minimalQuestions = wrongQuestions.map(q => ({
    type: q.type,
    domain: q.domain,
    questionText: q.question,
    script: q.script // Include script if it's a listening question
  }));
  
  const suggestedNames = getRandomNames(3);

  const prompt = `
    You are an expert US elementary education specialist and reading coach.
    The student answered the following questions incorrectly on an SR Level ${srLevel} test.
    Create a "Twin Questions" review set. 
    
    For each incorrect question provided below, create a **NEW, SIMILAR question** that tests the exact same skill or concept but with different content/context.

    **Instructions:**
    1. **Vocabulary/Grammar:** Create a new question testing the same word relationship, context clue, morphology, or grammatical rule but in a new sentence.
    2. **Reading:** Create a **SHORT paragraph (3-4 sentences)** for each reading question and ask a similar type of question (Inference, Character Analysis, Genre, etc.).
    3. **Listening:** If the incorrect question has a 'script', create a NEW short script and a corresponding question.
    4. **Subject Variety:** 
       - Do NOT use proper names (people) for every question.
       - Use professions, animals, objects.
       - Use names in only about 40% of questions.
    5. **Naming Rules (When names ARE used):** 
       - **Joy (Boy/He), Jian (Girl/She), Yuna (Girl/She)**.
       - Use ONLY ONE of these in the entire twin set if possible.
       - Primarily use diverse names like: ${suggestedNames.join(', ')}.
    6. **COACHING & EXPLANATION RULES (GROWTH MINDSET):**
       - For the 'explanation' field of each question, **DO NOT simply give the direct answer.**
       - Provide **growth-oriented, question-based coaching in Korean** to help the student think.
       - Examples: "주인공은 왜 이런 선택을 했을까?", "이 단어가 이 문맥에서는 어떤 느낌이야?", "문장에서 힌트가 되는 단어를 찾아볼까?"

    **Input Questions:**
    ${JSON.stringify(minimalQuestions)}

    **Output Structure:**
    Return a TestData object.
    - Put new Vocabulary twins in the 'vocabulary' array.
    - Put new Grammar twins in the 'grammar' array.
    - Put new Reading twins in the 'reading' array.
    - Put new Listening twins in the 'listening' array (if any).
    - Provide 5 key vocabulary words from these new questions.
    - Include English definition, Korean meaning, and example sentence for each word.
  `;

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

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      srLevel: { type: Type.STRING },
      vocabulary: { type: Type.ARRAY, items: questionSchema },
      grammar: { type: Type.ARRAY, items: questionSchema },
      reading: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            passageTitle: { type: Type.STRING },
            passageContent: { type: Type.STRING },
            questions: { type: Type.ARRAY, items: questionSchema },
          },
          required: ["passageTitle", "passageContent", "questions"],
        }
      },
      listening: { type: Type.ARRAY, items: questionSchema },
      keyVocabulary: { type: Type.ARRAY, items: vocabWordSchema },
    },
    required: ["srLevel", "vocabulary", "grammar", "reading", "listening", "keyVocabulary"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 1.0, 
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text) as TestData;
    // Ensure SR level is passed through
    data.srLevel = srLevel;
    // Apply client-side randomization
    return randomizeTestData(data);
  } catch (error) {
    console.error("Error generating twin test:", error);
    throw error;
  }
};
