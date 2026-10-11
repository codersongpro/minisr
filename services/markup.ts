// AI가 문항에 붙이는 간단한 HTML(<u>, <b> 등)을 안전하게 다루기 위한 도우미.
// 허용한 서식만 남기고, 나머지 태그는 지운다. 화면에는 HTML을 직접 넣지 않는다.

export interface MarkupSegment {
  text: string;
  underline?: boolean;
  bold?: boolean;
  italic?: boolean;
  lineBreak?: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decodeEntities = (text: string) => text.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => ENTITIES[name]);

const TAG = /<\s*(\/?)\s*([a-z]+)[^>]*>/gi;
const STYLE: Record<string, keyof Pick<MarkupSegment, 'underline' | 'bold' | 'italic'>> = {
  u: 'underline', ins: 'underline', b: 'bold', strong: 'bold', i: 'italic', em: 'italic',
};

export const parseMarkup = (input: string | undefined | null): MarkupSegment[] => {
  const text = decodeEntities(String(input ?? ''));
  const segments: MarkupSegment[] = [];
  const active = { underline: 0, bold: 0, italic: 0 };
  let last = 0;
  const push = (chunk: string) => {
    if (!chunk) return;
    segments.push({
      text: chunk,
      ...(active.underline > 0 && { underline: true }),
      ...(active.bold > 0 && { bold: true }),
      ...(active.italic > 0 && { italic: true }),
    });
  };
  for (const match of text.matchAll(TAG)) {
    push(text.slice(last, match.index));
    last = match.index! + match[0].length;
    const closing = match[1] === '/';
    const name = match[2].toLowerCase();
    if (name === 'br') {
      segments.push({ text: '', lineBreak: true });
    } else if (STYLE[name]) {
      const key = STYLE[name];
      active[key] = Math.max(0, active[key] + (closing ? -1 : 1));
    }
    // 그 밖의 태그는 내용만 남기고 지운다.
  }
  push(text.slice(last));
  return segments;
};

// 선택지처럼 서식이 필요 없는 곳에 쓰는 순수 텍스트
export const stripMarkup = (input: string | undefined | null) =>
  parseMarkup(input).map(s => (s.lineBreak ? ' ' : s.text)).join('').replace(/\s+/g, ' ').trim();
