import { hasValidSession, isSameOrigin } from './_auth.js';
import { generatePassageItems, generateSRTest, generateSpeech, generateTwinTest, generateVocabItems } from '../services/geminiService.js';
import { SR_DOMAINS } from '../services/srBlueprint.js';

const PASSAGE_DOMAINS = new Set(Object.values(SR_DOMAINS));
const MAX_PASSAGE_SPECS = 8;
const MAX_VOCAB_ITEMS = 10;
const validDifficulty = (d) => typeof d === 'number' && Number.isFinite(d) && d >= 0 && d <= 13;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function validLevel(value) {
  const number = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 12 && String(value).length <= 5;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' || !isSameOrigin(req)) return json(res, 405, { error: '요청을 처리할 수 없습니다.' });
  if (!(await hasValidSession(req))) return json(res, 401, { error: '인증이 필요합니다.' });
  if (!process.env.GEMINI_API_KEY) return json(res, 503, { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });

  const body = req.body || {};
  try {
    if (body.action === 'generate') {
      const testLength = body.testLength ?? 'full';
      if (!validLevel(body.srLevel) || typeof body.includeListening !== 'boolean' || !['full', 'mini'].includes(testLength)) {
        return json(res, 400, { error: '문제 생성 요청이 올바르지 않습니다.' });
      }
      return json(res, 200, await generateSRTest(String(body.srLevel), body.includeListening, testLength));
    }

    if (body.action === 'vocab') {
      const list = body.difficulties;
      const valid = validLevel(body.srLevel) && Array.isArray(list) && list.length > 0 && list.length <= MAX_VOCAB_ITEMS && list.every(validDifficulty);
      if (!valid) return json(res, 400, { error: '어휘 문제 요청이 올바르지 않습니다.' });
      return json(res, 200, await generateVocabItems(list, Number(body.srLevel)));
    }

    if (body.action === 'passages') {
      const specs = body.specs;
      const valid = validLevel(body.srLevel) && Array.isArray(specs) && specs.length > 0 && specs.length <= MAX_PASSAGE_SPECS &&
        specs.every(s => s && PASSAGE_DOMAINS.has(s.domain) && validDifficulty(s.difficulty));
      if (!valid) return json(res, 400, { error: '지문 문제 요청이 올바르지 않습니다.' });
      const clean = specs.map(s => ({ domain: s.domain, difficulty: s.difficulty }));
      return json(res, 200, await generatePassageItems(clean, Number(body.srLevel)));
    }

    if (body.action === 'twin') {
      if (!validLevel(body.srLevel) || !Array.isArray(body.wrongQuestions) || body.wrongQuestions.length > 50) {
        return json(res, 400, { error: '쌍둥이 문제 요청이 올바르지 않습니다.' });
      }
      return json(res, 200, await generateTwinTest(body.wrongQuestions, String(body.srLevel)));
    }

    if (body.action === 'speech') {
      if (typeof body.text !== 'string' || body.text.length === 0 || body.text.length > 2_000) {
        return json(res, 400, { error: '음성 생성 요청이 올바르지 않습니다.' });
      }
      return json(res, 200, { audio: await generateSpeech(body.text) });
    }

    return json(res, 400, { error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    console.error('Gemini request failed:', error instanceof Error ? error.message : String(error));
    return json(res, 500, { error: 'AI 요청에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
