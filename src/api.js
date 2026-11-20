import { AppError, applyAction, demoAccount, getView, seedState } from './domain.js';

export const browserDemo = import.meta.env.MODE === 'static' || import.meta.env.DEV;

async function request(path, body) {
  const url = new URL(`api/${path}`, new URL('./', window.location.href));
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new AppError(result.message, response.status);
  return result;
}

const sharedApi = {
  view: () => request('session'),
  login: (id, pin) => request('login', { id, pin }),
  logout: () => request('logout', {}),
  action: (action, payload) => request(`actions/${action}`, payload),
};

let dbPromise;

function openDemoDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('star-school-demo', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('school');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function demoView(user, action, payload) {
  if (!user) return null;
  const db = await openDemoDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('school', 'readwrite');
    const store = transaction.objectStore('school');
    const read = store.get('state');
    let view;

    read.onsuccess = () => {
      try {
        const state = read.result ?? seedState();
        if (action) applyAction(state, user, action, payload);
        if (action || !read.result) store.put(state, 'state');
        view = getView(state, user);
      } catch (error) {
        reject(error);
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(view);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new AppError('暫時未能讀寫測試資料。'));
  });
}

const demoSessionKey = 'star-school-demo-account';

function demoUser() {
  const stored = localStorage.getItem(demoSessionKey);
  const id = stored ?? (location.hash === '' ? 'teacher' : 'guest');
  if (!stored && id === 'teacher') localStorage.setItem(demoSessionKey, id);
  return demoAccount(id, id === 'teacher' ? '2468' : `13${id.slice(-2)}`);
}

const demoApi = {
  view: () => demoView(demoUser()),
  login: (id, pin) => {
    const user = demoAccount(id, pin);
    if (!user) throw new AppError('帳戶或 PIN 不正確。', 401);
    localStorage.setItem(demoSessionKey, user.id);
    return demoView(user);
  },
  logout: async () => { localStorage.setItem(demoSessionKey, 'guest'); },
  action: (action, payload) => {
    const user = demoUser();
    if (!user) throw new AppError('請先選擇測試身份。', 401);
    return demoView(user, action, payload);
  },
};

export const api = browserDemo ? demoApi : sharedApi;

export function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
