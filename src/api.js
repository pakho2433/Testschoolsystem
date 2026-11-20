import { AppError } from './domain.js';

async function request(path, body) {
  const url = new URL(`api/${path}`, new URL('./', window.location.href));
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new AppError(result.message, response.status);
  return result;
}

export const api = {
  view: () => request('session'),
  login: credentials => request('login', credentials),
  logout: () => request('logout', {}),
  action: (action, payload) => request(`actions/${action}`, payload),
};

export function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
