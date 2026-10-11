# Vercel 배포 준비

1. Vercel에서 **Add New → Project**를 선택하고 `codersongpro/minisr`를 가져옵니다.
2. Framework Preset은 **Vite**, Build Command는 `npm run build`, Output Directory는 `dist`로 확인합니다. 자동 감지된 값이 같으면 그대로 둡니다.
3. Project Settings → Environment Variables에 다음 값을 **Production**과 **Preview**에 각각 등록합니다.
   - `GEMINI_API_KEY`: Gemini API 키
   - `APP_PASSWORD`: 16자 이상으로 만든 별도의 강력한 비밀번호
   - `SESSION_SECRET`: 비밀번호와 다른 길고 무작위인 문자열
   - `ADMIN_PASSWORD`: 관리자 로그인(동기화 코드)용 비밀번호. `APP_PASSWORD`와 다른 값으로 정합니다.
   - `FIREBASE_SERVICE_ACCOUNT_KEY`: 기기 간 동기화 코드용 Firebase 서비스 계정 키(JSON 전체). Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성**으로 받은 파일 내용을 그대로 붙여 넣습니다.
4. Vercel Firewall에서 `/api/auth`, `/api/gemini`, `/api/sync` 요청에 속도 제한 규칙을 설정합니다. 동기화 코드는 4자리라 `/api/sync`는 서버에서도 IP당 시간당 시도 횟수를 제한하지만, Firewall 규칙을 함께 두는 것이 안전합니다. 로그인 시도와 Gemini API 사용량을 분리해 제한합니다.
5. Preview 배포에서 로그인과 문제 생성이 동작하는지 확인한 뒤 Production으로 배포합니다.

`GEMINI_API_KEY`는 브라우저 코드에 포함되지 않으며 `/api/gemini` 서버 함수에서만 사용됩니다. `.env`, `.env.local`, `node_modules`, `dist`, Vercel 연결 정보는 저장소에 포함하지 않습니다.

## 기기 간 기록 동기화 (관리자 전용)

- 일반 사용자는 지금처럼 입장 비밀번호만 입력합니다. 기록은 각 기기에 저장되며 동기화 코드는 필요 없습니다.
- 관리자는 입장 화면의 **관리자 로그인 (동기화 코드)**에서 `ADMIN_PASSWORD`와 4자리 코드를 입력합니다. 같은 코드로 로그인한 기기들은 같은 Firebase 계정(`sync_코드`)으로 기록을 함께 봅니다. 처음 쓰는 코드는 자동으로 만들어집니다.
- 관리자 로그인 시 그 기기에서 이전에 풀었던 기록(동기화 기능 도입 전 기록 포함)이 코드 계정으로 옮겨집니다.
- 로그인 토큰은 `/api/sync` 서버 함수만 발급하며, 관리자 비밀번호 확인 후에만 발급합니다. IP당 시간당 10회까지 시도할 수 있습니다.
- 서비스 계정 키는 Firestore 보안 규칙을 우회하는 관리자 권한이므로 Vercel 환경변수에만 두고 저장소나 브라우저 코드에 넣지 않습니다.
