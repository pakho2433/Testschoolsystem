import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';
import { hashPassword } from '../server/auth.js';
import { pickupSlots } from '../src/domain.js';

const teacherCredentials = { id: 'teacher', username: 'test-teacher', password: 'teacher-test-only' };
const teacherPasswordHash = await hashPassword(teacherCredentials.password);

async function setup(t, dataFile) {
  const server = createApp({ dataFile, teacherUsername: teacherCredentials.username, teacherPasswordHash })
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;

  return async (route, { cookie, body, status = 200 } = {}) => {
    const headers = cookie ? { Cookie: cookie } : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      headers, method: body === undefined ? 'GET' : 'POST', body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, status, `${route}: ${JSON.stringify(result)}`);
    return { result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
}

test('老師記分後，學生可使用同一餘額兌換禮物並預約', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'star-school-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'state.json');
  const request = await setup(t, dataFile);

  assert.equal((await request('session')).result, null);
  await request('login', { body: { id: 'teacher', pin: '1301' }, status: 401 });
  await request('login', { body: { ...teacherCredentials, password: 'incorrect' }, status: 401 });
  const staff = await request('login', { body: teacherCredentials });
  assert.ok(staff.cookie);
  const child = await request('login', { body: { id: 's001', pin: '1301' } });
  const other = await request('login', { body: { id: 's002', pin: '1302' } });
  const third = await request('login', { body: { id: 's003', pin: '1303' } });
  const [student] = child.result.students;
  assert.equal(staff.result.students.length, 3);
  assert.equal(new Set(staff.result.students.map(item => item.code)).size, 3);
  assert.deepEqual(child.result.students.map(item => item.id), ['s001']);
  assert.deepEqual(third.result.students.map(item => item.id), ['s003']);

  const award = { operationId: 'a'.repeat(32), studentId: student.id, category: 'academic', reason: '顯著進步', delta: 17 };
  await request('actions/adjust', { body: award, status: 401 });
  await request('actions/adjust', { cookie: child.cookie, body: award, status: 403 });
  const adjust = (body, status) => request('actions/adjust', { cookie: staff.cookie, body, status });
  await Promise.all([adjust(award), adjust(award)]);
  await adjust({ ...award, delta: -4, operationId: 'b'.repeat(32) }, 400);
  await adjust({ ...award, category: 'activity', reason: '活動遲到', delta: -4, operationId: 'b'.repeat(32) });

  const updated = (await request('session', { cookie: child.cookie })).result;
  assert.equal(updated.students[0].points, student.points + 13);
  const [slot] = updated.slots;
  const gift = updated.gifts[0];
  const booking = { operationId: 'c'.repeat(32), rewardId: gift.id, slotId: slot.id };
  const reserve = body => request('actions/reserve', { cookie: child.cookie, body });
  await request('actions/reserve', { cookie: child.cookie, body: { ...booking, slotId: 'expired' }, status: 409 });
  const { result: booked } = await reserve(booking);
  const repeated = await reserve(booking);
  assert.equal(booked.students[0].points, updated.students[0].points - gift.cost);
  assert.equal(booked.gifts[0].stock, gift.stock - 1);
  assert.equal(booked.bookings[0].slot.id, slot.id);
  assert.equal(repeated.result.bookings.length, 1);
  assert.equal(repeated.result.students[0].points, booked.students[0].points);
  assert.equal((await request('session', { cookie: other.cookie })).result.bookings.length, 0);
  assert.equal((await request('session', { cookie: staff.cookie })).result.bookings[0].status, 'reserved');

  const changeBooking = { bookingId: booking.operationId };
  await request('actions/cancel', { cookie: other.cookie, body: changeBooking, status: 404 });
  await request('actions/collect', { cookie: child.cookie, body: changeBooking, status: 403 });
  const cancel = () => request('actions/cancel', { cookie: child.cookie, body: changeBooking });
  await cancel();
  const { result: refunded } = await cancel();
  assert.equal(refunded.students[0].points, updated.students[0].points);
  assert.equal(refunded.gifts[0].stock, gift.stock);

  const nextBooking = { ...booking, operationId: 'd'.repeat(32) };
  await reserve(nextBooking);
  await request('actions/collect', { cookie: staff.cookie, body: { bookingId: nextBooking.operationId } });
  await request('logout', { cookie: staff.cookie, body: {} });
  assert.equal((await request('session', { cookie: staff.cookie })).result, null);
  const reopened = await setup(t, dataFile);
  const { result: saved } = await reopened('login', { body: { id: 's001', pin: '1301' } });
  assert.equal(saved.bookings[0].status, 'collected');
  assert.equal(saved.students[0].points, updated.students[0].points - gift.cost);
});

test('領取時段以香港時間計算，只包含未開始的平日時段', () => {
  const slots = pickupSlots(Date.parse('2026-11-20T07:30:00.000Z'));
  assert.equal(slots[0].startsAt, '2026-11-23T12:45:00+08:00');
  assert.ok(slots.every(slot => ![0, 6].includes(new Date(`${slot.date}T00:00:00Z`).getUTCDay())));
});
