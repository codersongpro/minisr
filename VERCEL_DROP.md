# Vercel 배포 준비

1. Vercel에서 **Add New → Project**를 선택하고 `codersongpro/minisr`를 가져옵니다.
2. Framework Preset은 **Vite**, Build Command는 `npm run build`, Output Directory는 `dist`로 확인합니다. 자동 감지된 값이 같으면 그대로 둡니다.
3. Project Settings → Environment Variables에 다음 값을 **Production**과 **Preview**에 각각 등록합니다.
   - `GEMINI_API_KEY`: Gemini API 키
   - `APP_PASSWORD`: 16자 이상으로 만든 별도의 강력한 비밀번호
   - `SESSION_SECRET`: 비밀번호와 다른 길고 무작위인 문자열
4. Vercel Firewall에서 `/api/auth`와 `/api/gemini` 요청에 속도 제한 규칙을 설정합니다. 로그인 시도와 Gemini API 사용량을 분리해 제한합니다.
5. Preview 배포에서 로그인과 문제 생성이 동작하는지 확인한 뒤 Production으로 배포합니다.

`GEMINI_API_KEY`는 브라우저 코드에 포함되지 않으며 `/api/gemini` 서버 함수에서만 사용됩니다. `.env`, `.env.local`, `node_modules`, `dist`, Vercel 연결 정보는 저장소에 포함하지 않습니다.
