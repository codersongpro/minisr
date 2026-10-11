import { TestData, Question } from '../types';
import type { TestLength } from './srBlueprint';

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI 요청에 실패했습니다.');
  return payload as T;
}

export const generateSRTest = (srLevel: string, includeListening = false, testLength: TestLength = 'full') =>
  request<TestData>({ action: 'generate', srLevel, includeListening, testLength });

export const generateTwinTest = (wrongQuestions: Question[], srLevel: string) =>
  request<TestData>({ action: 'twin', wrongQuestions, srLevel });

export const generateSpeech = async (text: string): Promise<string> => {
  const result = await request<{ audio: string }>({ action: 'speech', text });
  return result.audio;
};
