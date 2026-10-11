import React from 'react';
import { parseMarkup } from '../services/markup';

// 문항·지문의 <u>, <b>, <i>, <br>만 서식으로 보여 주고 나머지 태그는 숨긴다.
export const RichText: React.FC<{ text: string | undefined | null }> = ({ text }) => (
  <>
    {parseMarkup(text).map((segment, i) => {
      if (segment.lineBreak) return <br key={i} />;
      let node: React.ReactNode = segment.text;
      if (segment.underline) node = <u>{node}</u>;
      if (segment.bold) node = <strong>{node}</strong>;
      if (segment.italic) node = <em>{node}</em>;
      return <React.Fragment key={i}>{node}</React.Fragment>;
    })}
  </>
);
