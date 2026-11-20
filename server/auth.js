import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, studentIdentity, teacher } from '../src/domain.js';

const deriveKey = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 32);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export function createLogin({ teacherUsername = '', teacherPasswordHash = '' }) {
  const username = teacherUsername.trim().toLowerCase();
  const credential = /^scrypt:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(teacherPasswordHash);

  return async function login({ id, username: suppliedUsername, password, pin }) {
    if (id !== teacher.id) {
      const student = studentIdentity(id);
      if (student && pin === `13${id.slice(-2)}`) return student;
      throw new AppError('學生帳戶或 PIN 不正確。', 401);
    }

    if (!username || !credential) throw new AppError('老師帳戶尚未設定，請聯絡管理員。', 503);
    if (typeof suppliedUsername === 'string' && suppliedUsername.trim().toLowerCase() === username &&
        typeof password === 'string' && password.length > 0 && password.length <= 128) {
      const [, salt, expectedHash] = credential;
      const attemptedHash = await deriveKey(password, salt, 32);
      if (timingSafeEqual(attemptedHash, Buffer.from(expectedHash, 'hex'))) return teacher;
    }
    throw new AppError('老師帳號或密碼不正確。', 401);
  };
}
