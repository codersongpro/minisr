# SR TEST 문제 유형 레퍼런스 (QUICK GUIDE 기준)

문항 생성 AI는 `services/srQuestionTypes.ts`의 `SR_QUESTION_TYPES`를 프롬프트에 넣어 아래 유형과 같은 결로 문항을 만듭니다.
유형을 추가·수정할 때는 **그 파일만** 고치면 됩니다. (이 문서는 사람이 읽는 요약본)

| # | PART | 유형 | 어떤 문제? | 풀이법 | 연결 skill / 사용처 |
|---|------|------|-----------|--------|-------------------|
| 01 | WORD CLUES | Vocabulary 어휘 | 밑줄 친 단어와 뜻이 같은 말 고르기 | 단어 앞뒤 읽기 → 보기를 문장에 넣어 보기 | Synonyms / 어휘 |
| 02 | WORD CLUES | Context Clue 문맥 단서 | 앞뒤 문장으로 빈칸·낯선 단어 뜻 추측 | 사건 확인 → 원인·결과 연결 → 자연스러운 답 | Context Clues / 어휘 |
| 03 | READ THE TEXT | Main Idea 중심 내용 | 글 전체의 큰 생각 찾기 | 첫 문장·반복 내용 → 모든 예시를 묶는 답 | Main Idea / 지문 |
| 04 | READ THE TEXT | Detail 세부 정보 | 직접 쓰여 있는 사실 찾기 | who/what/when 확인 → 같은 내용 찾기 | Key Details / 지문 |
| 05 | CONNECT THE CLUES | Inference 추론 | 단서로 알 수 있는 것 찾기 | 단서 2개 이상 연결 → 근거 없는 보기 제외 | Inference / 지문 |
| 06 | CONNECT THE CLUES | Pronoun 대명사 | he/she/it/they가 가리키는 대상 | 원래 이름으로 바꿔 넣어 확인 | Pronoun Reference / 지문 |
| 07 | FOLLOW THE RULE | Sequence 사건 순서 | first/then/finally 순서 파악 | 순서 단어 표시 → before/after 확인 | Sequence / 지문 |
| 08 | FOLLOW THE RULE | Grammar 문법 | 시간 표현에 맞는 동사 형태 | 시간 표현 → 주어 → 동사 모양 | 오답 쌍둥이 문항에서만 참고 |
| 09 | FINISH STRONG | Sentence Completion 문장 완성 | 이유·결과에 맞게 문장 끝 완성 | 빈칸 앞뒤 이유 찾기 → 문법·의미 검사 | Cause and Effect / 지문 |
| 10 | FINISH STRONG | Writing 글의 흐름 | 문단 주제에 어울리는 문장 | 공통 주제 확인 → 흐름·문법 맞는 답 | Concluding Sentence / 지문 |

## 적용 위치
- 어휘 문항 생성(`buildVocabPrompt`): 01·02
- 지문 문항 생성(`buildReadingPrompt`): 03~07, 09, 10
- 오답 쌍둥이 문항(`buildTwinPrompt`): 01~10 전체
- 08 Grammar는 실제 Star Reading에 없는 유형이라 본 시험 문항에는 넣지 않습니다.
