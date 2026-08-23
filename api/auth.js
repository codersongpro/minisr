import {
  createSessionToken,
  getClearCookieHeader,
  getCookieHeader,
  hasValidSession,
  isSameOrigin,
  passwordsMatch,
} from './_auth.js';

function json(res, status, body, headers = {}) {
  res.status(status).setHeader('Content-Type', 'application/json');
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, { authenticated: await hasValidSession(req) });
  }

  if (req.method === 'DELETE') {
    return json(res, 200, { authenticated: false }, { 'Set-Cookie': getClearCookieHeader(true) });
  }

  if (req.method !== 'POST' || !isSameOrigin(req)) {
    return json(res, 405, { error: '요청을 처리할 수 없습니다.' });
  }

  const configuredPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!configuredPassword || !sessionSecret) {
    return json(res, 503, { error: '서버 환경변수가 설정되지 않았습니다.' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!passwordsMatch(password, configuredPassword)) {
    return json(res, 401, { error: '비밀번호가 올바르지 않습니다.' });
  }

  const token = await createSessionToken(sessionSecret);
  return json(res, 200, { authenticated: true }, { 'Set-Cookie': getCookieHeader(token, true) });
}
