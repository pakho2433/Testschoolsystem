export const teacher = { id: 'teacher', role: 'teacher', name: '王老師', initial: '王' };

export const students = [
  { id: 's001', name: '陳小明', initial: '明', className: '3A', seat: '12', color: 'blue', points: 85, code: '897893aeb906b11c4d6c3e21' },
  { id: 's002', name: '李心晴', initial: '晴', className: '3A', seat: '08', color: 'rose', points: 62, code: '25e72acf005a4d093806cb3b' },
  { id: 's003', name: '張宇軒', initial: '軒', className: '3B', seat: '15', color: 'mint', points: 38, code: 'ab952c82fcd4d4d48d5be374' },
];

export const categories = {
  academic: { label: '學科', add: ['積極參與', '學業表現優異', '顯著進步', '準時交功課'], subtract: ['欠交功課', '遲交功課', '未帶學習用品'] },
  behaviour: { label: '行為', add: ['樂於助人', '友善待人', '團隊合作', '守規自律'], subtract: ['擾亂課堂秩序', '不尊重他人', '違反校規'] },
  activity: { label: '活動', add: ['參與課外活動', '活動表現良好', '獲得獎項'], subtract: ['缺席活動', '活動遲到', '違反活動規則'] },
};

const gifts = [
  { id: 'stickers', name: '鼓勵貼紙組', description: '一組繽紛貼紙，為手冊添點色彩。', cost: 25, quantity: 8 },
  { id: 'pens', name: '彩色筆套裝', description: '6 色彩色筆，適合繪畫和做筆記。', cost: 50, quantity: 5 },
  { id: 'notebook', name: '星星筆記簿', description: '一本星星封面的筆記簿。', cost: 80, quantity: 3 },
];

export const schoolZone = 'Asia/Hong_Kong';
export const pickupLocation = '學校圖書館';

const schoolDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: schoolZone, year: 'numeric', month: '2-digit', day: '2-digit',
});

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function seedState(now = Date.now()) {
  const sample = [
    ['s001', 'academic', '積極參與', 7, 1],
    ['s002', 'academic', '遲交功課', -3, 3],
    ['s003', 'behaviour', '友善待人', 3, 5],
    ['s002', 'activity', '參與課外活動', 5, 26],
    ['s001', 'behaviour', '樂於助人', 3, 28],
  ];
  return {
    students: students.map(student => ({ ...student })),
    ledger: sample.map(([studentId, category, reason, delta, hours], index) => ({
      id: `sample-${index}`, studentId, category, reason, delta, note: '', teacherId: teacher.id,
      kind: 'adjustment', at: new Date(now - hours * 3_600_000).toISOString(),
    })),
    bookings: [],
  };
}

export function studentIdentity(id) {
  const student = students.find(item => item.id === id);
  if (!student) return null;
  return { id, role: 'student', name: student.name, initial: student.initial, color: student.color };
}

export function pickupSlots(now = Date.now()) {
  const parts = Object.fromEntries(schoolDate.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const slots = [];
  const day = 86_400_000;
  for (let offset = 0; slots.length < 12; offset += 1) {
    const date = new Date(today + offset * day);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const dateKey = date.toISOString().slice(0, 10);
    for (const [start, end] of [['12:45', '13:00'], ['15:30', '15:45']]) {
      const startsAt = `${dateKey}T${start}:00+08:00`;
      if (Date.parse(startsAt) > now) {
        slots.push({ id: `${dateKey}-${start}`, date: dateKey, start, end, startsAt });
      }
    }
  }
  return slots;
}

function stockFor(state, gift) {
  const reserved = state.bookings.filter(item => item.rewardId === gift.id && item.status !== 'cancelled');
  return gift.quantity - reserved.length;
}

export function getView(state, user, now = Date.now()) {
  const isTeacher = user.role === 'teacher';
  const visibleStudents = isTeacher ? state.students : state.students.filter(student => student.id === user.id);
  return {
    user,
    students: visibleStudents,
    ledger: isTeacher ? state.ledger : state.ledger.filter(item => item.studentId === user.id),
    bookings: isTeacher ? state.bookings : state.bookings.filter(item => item.studentId === user.id),
    gifts: gifts.map(gift => ({ ...gift, stock: stockFor(state, gift) })),
    slots: pickupSlots(now),
    serverNow: new Date(now).toISOString(),
  };
}

function requireRole(user, role) {
  if (user.role !== role) throw new AppError('此身份沒有權限執行這個操作。', 403);
}

function findStudent(state, id) {
  const student = state.students.find(item => item.id === id);
  if (!student) throw new AppError('找不到學生。', 404);
  return student;
}

function requireOperationId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) {
    throw new AppError('提交編號無效，請重新開啟表格。');
  }
}

function changePoints(student, delta) {
  const next = student.points + delta;
  if (!Number.isSafeInteger(next)) throw new AppError('積分總額超出可記錄範圍。');
  student.points = next;
}

function adjust(state, user, input, now) {
  requireRole(user, 'teacher');
  const { operationId, studentId, category, reason, delta } = input;
  requireOperationId(operationId);
  const student = findStudent(state, studentId);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const group = typeof category === 'string' && Object.hasOwn(categories, category) ? categories[category] : null;
  const direction = delta > 0 ? 'add' : 'subtract';
  if (!Number.isSafeInteger(delta) || delta === 0) throw new AppError('請輸入大於 0 的整數分數。');
  if (!group?.[direction].includes(reason)) throw new AppError('請選擇適用於這次加減分的原因。');
  if (note.length > 160) throw new AppError('備註最多 160 個字。');

  const existing = state.ledger.find(item => item.id === operationId);
  if (existing) {
    if (existing.kind === 'adjustment' && existing.studentId === studentId && existing.category === category &&
        existing.reason === reason && existing.delta === delta && existing.note === note) return;
    throw new AppError('這個提交編號已使用。', 409);
  }

  changePoints(student, delta);
  state.ledger.unshift({
    id: operationId, studentId, category, reason, delta, note, teacherId: user.id,
    kind: 'adjustment', at: new Date(now).toISOString(),
  });
}

function reserve(state, user, input, now) {
  requireRole(user, 'student');
  const { operationId, rewardId, slotId } = input;
  requireOperationId(operationId);
  const student = findStudent(state, user.id);
  const existing = state.bookings.find(item => item.id === operationId);
  if (existing) {
    if (existing.studentId === user.id && existing.rewardId === rewardId && existing.slot.id === slotId) return;
    throw new AppError('這個提交編號已使用。', 409);
  }
  if (state.ledger.some(item => item.id === operationId)) throw new AppError('這個提交編號已使用。', 409);

  const gift = gifts.find(item => item.id === rewardId);
  const slot = pickupSlots(now).find(item => item.id === slotId);
  if (!gift) throw new AppError('找不到禮物。', 404);
  if (!slot) throw new AppError('這個時段已過期，請選擇另一個時段。', 409);
  if (student.points < gift.cost) throw new AppError('積分不足，未能兌換這份禮物。', 409);
  if (stockFor(state, gift) <= 0) throw new AppError('這份禮物已換完。', 409);
  if (state.bookings.some(item => item.studentId === user.id && item.slot.id === slotId && item.status === 'reserved')) {
    throw new AppError('你已預約這個時段，請選擇另一個時段。', 409);
  }

  const at = new Date(now).toISOString();
  changePoints(student, -gift.cost);
  state.bookings.unshift({
    id: operationId, studentId: user.id, rewardId, giftName: gift.name, cost: gift.cost, slot, status: 'reserved', at,
  });
  state.ledger.unshift({
    id: operationId, studentId: user.id, reason: `兌換${gift.name}`, delta: -gift.cost,
    kind: 'redemption', at,
  });
}

function updateBooking(state, user, input, now, status) {
  requireRole(user, status === 'collected' ? 'teacher' : 'student');
  const booking = state.bookings.find(item => item.id === input.bookingId);
  if (!booking || (user.role === 'student' && user.id !== booking.studentId)) {
    throw new AppError('找不到預約。', 404);
  }
  if (booking.status === status) return;
  if (booking.status !== 'reserved') throw new AppError('這項預約已處理。', 409);

  const at = new Date(now).toISOString();
  if (status === 'cancelled') {
    if (Date.parse(booking.slot.startsAt) <= now) throw new AppError('領取時段已開始，請聯絡老師。', 409);
    changePoints(findStudent(state, user.id), booking.cost);
    state.ledger.unshift({
      id: `${booking.id}-refund`, studentId: user.id, reason: `取消兌換${booking.giftName}`,
      delta: booking.cost, kind: 'refund', at,
    });
  }
  booking.status = status;
  booking.updatedAt = at;
}

export function applyAction(state, user, action, input = {}, now = Date.now()) {
  switch (action) {
    case 'adjust': return adjust(state, user, input, now);
    case 'reserve': return reserve(state, user, input, now);
    case 'collect': return updateBooking(state, user, input, now, 'collected');
    case 'cancel': return updateBooking(state, user, input, now, 'cancelled');
    default: throw new AppError('找不到這項操作。', 404);
  }
}

export function codeFrom(value) {
  const input = value.trim();
  if (/^[a-f0-9]{24}$/i.test(input)) return input.toLowerCase();
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const match = /^#\/scan\/([a-f0-9]{24})$/i.exec(url.hash);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}
