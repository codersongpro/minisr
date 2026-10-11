import type { PassageItemSpec, ReadingSection, VocabWord } from '../types';
import { generatePassageItems } from './geminiClient';
import { chunkSpecs } from './adaptiveEngine';

const SPECS_PER_REQUEST = 6;

// 지문 문항 풀을 여러 요청으로 나눠 병렬 생성한다. 일부만 실패하면 성공한 문항만 쓴다.
export const fetchPassagePool = async (specs: PassageItemSpec[], startLevel: number) => {
  const results = await Promise.allSettled(
    chunkSpecs(specs, SPECS_PER_REQUEST).map(chunk => generatePassageItems(chunk, String(startLevel)))
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<{ reading: ReadingSection[]; keyVocabulary: VocabWord[] }> => r.status === 'fulfilled');
  const sections = ok.flatMap(r => r.value.reading);
  if (sections.length === 0) throw new Error('지문 문제를 준비하지 못했습니다.');
  return { sections, keyVocabulary: ok.flatMap(r => r.value.keyVocabulary) };
};
