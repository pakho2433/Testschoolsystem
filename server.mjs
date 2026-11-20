import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AppError, applyAction, getView, seedState } from './src/domain.js';
import { createLogin, hashPassword } from './server/auth.js';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const sessionCookie = 'star_school_session';
const sessionDuration = 8 * 60 * 60 * 1000;

export function createApp({
  dataFile = resolve(appDirectory, 'data/state.json'),
  teacherUsername,
  teacherPasswordHash,
  publicAppUrl = '',
} = {}) {
  mkdirSync(dirname(dataFile), { recursive: true });
  const writeState = state => {
    const tempFile = `${dataFile}.${process.pid}.tmp`;
    writeFileSync(tempFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tempFile, dataFile);
  };
  let state = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : seedState();
  if (!existsSync(dataFile)) writeState(state);

  const app = express();
  const login = createLogin({ teacherUsername, teacherPasswordHash });
  const sessions = new Map();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  function cookieOptions(req) {
    return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' };
  }

  function sessionKey(req) {
    const match = /(?:^|;\s*)star_school_session=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie') || '');
    return match?.[1];
  }

  function activeUser(req) {
    const key = sessionKey(req);
    const session = sessions.get(key);
    if (!session) return null;
    if (session.validUntil > Date.now()) return session.user;
    sessions.delete(key);
    return null;
  }

  const view = user => ({ ...getView(state, user), qrBase: publicAppUrl });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.is('application/json')) {
      throw new AppError('請使用系統表格提交資料。', 415);
    }
    next();
  }, express.json({ limit: '12kb' }));

  app.get('/api/session', (req, res) => {
    const user = activeUser(req);
    res.json(user ? view(user) : null);
  });

  app.post('/api/login', async (req, res) => {
    const user = await login(req.body || {});
    for (const [key, session] of sessions) {
      if (session.validUntil <= Date.now()) sessions.delete(key);
    }
    sessions.delete(sessionKey(req));
    const key = randomBytes(32).toString('hex');
    sessions.set(key, { user, validUntil: Date.now() + sessionDuration });
    res.cookie(sessionCookie, key, { ...cookieOptions(req), maxAge: sessionDuration });
    res.json(view(user));
  });

  app.post('/api/logout', (req, res) => {
    sessions.delete(sessionKey(req));
    res.clearCookie(sessionCookie, cookieOptions(req));
    res.json(null);
  });

  app.post('/api/actions/:action', (req, res) => {
    const user = activeUser(req);
    if (!user) throw new AppError('請先登入系統。', 401);
    const nextState = structuredClone(state);
    applyAction(nextState, user, req.params.action, req.body || {});
    writeState(nextState);
    state = nextState;
    res.json(view(user));
  });

  app.use('/api', (req, res) => res.status(404).json({ message: '找不到這項操作。' }));
  app.use(express.static(join(appDirectory, 'dist')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AppError) return res.status(error.status).json({ message: error.message });
    if (error.status === 400) return res.status(400).json({ message: '提交資料格式錯誤。' });
    if (error.status === 413) return res.status(413).json({ message: '提交資料太長。' });
    console.error(error);
    return res.status(500).json({ message: '暫時未能處理，請再試一次。' });
  });

  return app;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const envPath = join(appDirectory, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  const port = Number(process.env.PORT || 4173);
  const publicAppUrl = process.env.PUBLIC_APP_URL || '';
  const passwordHash = process.env.TEACHER_PASSWORD_HASH ||
    (process.env.TEACHER_PASSWORD ? await hashPassword(process.env.TEACHER_PASSWORD) : '');
  const app = createApp({
    dataFile: process.env.DATA_FILE ? resolve(process.env.DATA_FILE) : undefined,
    teacherUsername: process.env.TEACHER_USERNAME,
    teacherPasswordHash: passwordHash,
    publicAppUrl,
  });
  app.listen(port, '0.0.0.0', () => {
    console.log(`星點校園：http://localhost:${port}`);
    if (publicAppUrl) console.log(`QR Code 網址：${publicAppUrl}`);
    for (const connection of Object.values(networkInterfaces()).flat()) {
      if (connection.family === 'IPv4' && !connection.internal) {
        console.log(`同一網絡測試：http://${connection.address}:${port}`);
      }
    }
  });
}
