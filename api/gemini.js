import { hasValidSession, isSameOrigin } from './_auth.js';
import { generateSRTest, generateSpeech, generateTwinTest } from '../services/geminiService.ts';

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
