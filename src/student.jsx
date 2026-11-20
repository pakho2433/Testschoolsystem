import React, { useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Clock, Gift, MapPin, Star, X } from 'lucide-react';
import { operationId } from './api.js';
import { pickupLocation } from './domain.js';
import {
  Dialog, Empty, formatPoints, formatWeekday, MobileQRHint, Notice, PageHeading,
  QRCard, SectionLink, slotText,
} from './ui.jsx';

export function StudentGifts({ view, perform }) {
  const [rewardId, selectReward] = useState(null);
  const student = view.students[0];
  const gift = view.gifts.find(item => item.id === rewardId);

  return <>
    <PageHeading
      title="禮物兌換"
      description={`${student.name}，選一份喜歡的禮物，再預約領取時間。`}
      action={<a href="#/bookings" className="button button--secondary"><CalendarDays size={18} /> 我的預約</a>}
    />
    <section className="balance-banner" aria-label="可用積分">
      <div><span>可用積分</span><strong>{formatPoints(student.points)} <small>分</small></strong></div>
      <span className="balance-star" aria-hidden="true"><Star size={52} fill="currentColor" strokeWidth={1.1} /></span>
    </section>

    <div className="section-heading"><h2>可兌換禮物</h2><SectionLink page="history">查看積分紀錄</SectionLink></div>
    <div className="gifts-grid">
      {view.gifts.map(item => {
        const canRedeem = item.stock > 0 && student.points >= item.cost;
        return <article className="panel gift-card" key={item.id}>
          <div className={`gift-art gift-art--${item.id}`} aria-hidden="true" />
          <div className="gift-content">
            <div className="gift-meta">
              <span className="point-pill"><Star size={15} /> {formatPoints(item.cost)} 分</span>
              <span>{item.stock > 0 ? `餘下 ${item.stock} 份` : '已換完'}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <button className={`button ${canRedeem ? 'button--primary' : 'button--secondary'}`} disabled={!canRedeem} onClick={() => selectReward(item.id)}>
              {canRedeem ? <>兌換並預約 <ArrowRight size={17} /></> : item.stock <= 0 ? '已換完' : '積分不足'}
            </button>
          </div>
        </article>;
      })}
    </div>
    {gift && <ReserveDialog key={gift.id} view={view} gift={gift} onClose={() => selectReward(null)} perform={perform} />}
  </>;
}

function ReserveDialog({ view, gift, onClose, perform }) {
  const [date, setDate] = useState(view.slots[0]?.date || '');
  const [slotId, setSlotId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lastRequest = useRef(null);
  const used = new Set(view.bookings.filter(item => item.status === 'reserved').map(item => item.slot.id));
  const dates = [...new Map(view.slots.map(slot => [slot.date, formatWeekday(slot.startsAt)]))];
  const chosenDate = dates.some(([value]) => value === date) ? date : dates[0]?.[0];
  const choices = view.slots.filter(slot => slot.date === chosenDate);
  const chosen = choices.find(slot => slot.id === slotId && !used.has(slot.id));
  const canRedeem = view.students[0].points >= gift.cost && gift.stock > 0;

  async function submit(event) {
    event.preventDefault();
    if (!chosen || saving || !canRedeem) return;
    if (lastRequest.current?.slotId !== slotId) lastRequest.current = { slotId, id: operationId() };
    setSaving(true);
    setError('');
    try {
      await perform('reserve', { rewardId: gift.id, slotId, operationId: lastRequest.current.id }, '兌換成功，領取時間已預約。');
      onClose();
      location.hash = '/bookings';
    } catch (problem) {
      setError(messageFor(problem));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog title="預約領取禮物" onClose={() => { if (!saving) onClose(); }}>
    <div className="reserve-summary"><span className="icon-tile lavender"><Gift size={22} /></span>
      <strong>{gift.name}</strong><span className="point-pill"><Star size={15} /> {formatPoints(gift.cost)} 分</span>
    </div>
    <form className="reserve-form" onSubmit={submit}>
      <label className="field" htmlFor="pickup-date">
        領取日期
        <select id="pickup-date" value={chosenDate || ''} onChange={event => { setDate(event.target.value); setSlotId(''); }}>
          {dates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>領取時段（香港時間）</legend>
        <div className="time-options">
          {choices.map(slot => <button type="button" key={slot.id} aria-pressed={slotId === slot.id} disabled={used.has(slot.id)} onClick={() => setSlotId(slot.id)}>
            <Clock size={17} /> {slot.start}–{slot.end}{used.has(slot.id) ? '（已預約）' : ''}
          </button>)}
        </div>
      </fieldset>
      <div className="pickup-location"><MapPin size={18} /> {pickupLocation}</div>
      {error && <Notice>{error}</Notice>}
      {!canRedeem && <Notice>積分不足或禮物已換完。</Notice>}
      <button type="submit" className="button button--primary" disabled={!chosen || !canRedeem || saving}>
        {saving ? '預約中…' : `確認預約 · 使用 ${formatPoints(gift.cost)} 分`}
      </button>
    </form>
  </Dialog>;
}

const statusLabels = { reserved: '待領取', collected: '已領取', cancelled: '已取消' };

export function BookingsPage({ view, perform }) {
  const isTeacher = view.user.role === 'teacher';
  const [selected, selectBooking] = useState(null);
  const booking = view.bookings.find(item => item.id === selected);
  const ordered = [...view.bookings].sort((a, b) => {
    const pendingOrder = Number(b.status === 'reserved') - Number(a.status === 'reserved');
    return pendingOrder || Date.parse(a.slot.startsAt) - Date.parse(b.slot.startsAt);
  });

  return <>
    <PageHeading title={isTeacher ? '領取預約' : '我的預約'}
      description={isTeacher ? '查閱學生的領取時間，並在派發禮物後確認領取。' : '查看換領時間，並到學校圖書館領取禮物。'}
      action={!isTeacher && <a href="#/gifts" className="button button--secondary"><Gift size={17} /> 返回禮物兌換</a>}
    />
    {ordered.length === 0 ? <section className="panel"><Empty icon={CalendarDays} title="暫時沒有預約"
      description={isTeacher ? '學生兌換禮物後，預約會在這裡顯示。' : '兌換禮物時可以選擇領取日期和時間。'} /></section> :
      <ul className="bookings-list">
        {ordered.map(item => {
          const student = view.students.find(person => person.id === item.studentId);
          const canUpdate = item.status === 'reserved' && (isTeacher || Date.parse(item.slot.startsAt) > Date.parse(view.serverNow));
          return <li className="panel booking-card" key={item.id}>
            <span className="icon-tile lavender"><Gift size={24} /></span>
            <div className="booking-main">
              <div><strong>{item.giftName}</strong> <span className={`badge badge--${item.status}`}>{statusLabels[item.status]}</span></div>
              {isTeacher && <span>{student.name} · {student.className} 班</span>}
              <div className="booking-details"><CalendarDays size={16} /> {slotText(item.slot)} <span>（香港時間）</span></div>
              <div className="booking-details"><MapPin size={16} /> {pickupLocation}</div>
            </div>
            {canUpdate && <button className="button button--secondary" onClick={() => selectBooking(item.id)}>
              {isTeacher ? <><Check size={17} /> 確認已領取</> : <><X size={17} /> 取消預約</>}
            </button>}
          </li>;
        })}
      </ul>}
    {booking && <BookingDialog key={booking.id} booking={booking} isTeacher={isTeacher} onClose={() => selectBooking(null)} perform={perform} />}
  </>;
}

function BookingDialog({ booking, isTeacher, onClose, perform }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await perform(isTeacher ? 'collect' : 'cancel', { bookingId: booking.id },
        isTeacher ? '已確認領取禮物。' : `預約已取消，已退回 ${formatPoints(booking.cost)} 分。`);
      onClose();
    } catch (problem) {
      setError(messageFor(problem));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog title={isTeacher ? '確認已領取' : '取消領取預約'}
    description={isTeacher ? `已派發這份禮物：${booking.giftName}？` : `取消後會退回 ${formatPoints(booking.cost)} 分，並釋出這份禮物。`}
    onClose={() => { if (!saving) onClose(); }}>
    {error && <Notice>{error}</Notice>}
    <div className="dialog-actions">
      <button className="button button--secondary" disabled={saving} onClick={onClose}>返回</button>
      <button className="button button--primary" disabled={saving} onClick={submit}>{isTeacher ? '確認已領取' : '確認取消'}</button>
    </div>
  </Dialog>;
}

export function StudentQR({ view }) {
  return <>
    <PageHeading title="我的 QR Code" description="把這個 QR Code 出示給老師，方便老師掃碼記分。" />
    <MobileQRHint base={view.qrBase} />
    <div className="single-qr"><QRCard student={view.students[0]} base={view.qrBase} /></div>
  </>;
}
