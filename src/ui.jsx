import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpen, CalendarDays, CircleAlert, Download, Gift,
  HeartHandshake, QrCode, ScanLine, Sparkles, Star, Trophy, X,
} from 'lucide-react';
import { categories, schoolZone } from './domain.js';

export const categoryIcons = { academic: BookOpen, behaviour: HeartHandshake, activity: Trophy };

const schoolTime = new Intl.DateTimeFormat('zh-HK', {
  timeZone: schoolZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const schoolWeekday = new Intl.DateTimeFormat('zh-HK', {
  timeZone: schoolZone, month: 'long', day: 'numeric', weekday: 'long',
});
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: schoolZone, dateStyle: 'short' });
const numberFormat = new Intl.NumberFormat('zh-HK');

export function formatPoints(points) {
  return numberFormat.format(points);
}

export function formatDateTime(date) {
  return schoolTime.format(new Date(date));
}

export function formatWeekday(date) {
  return schoolWeekday.format(new Date(date));
}

export function sameSchoolDay(first, second) {
  return dayKey.format(new Date(first)) === dayKey.format(new Date(second));
}

export function slotText(slot) {
  return `${formatWeekday(slot.startsAt)} · ${slot.start}–${slot.end}`;
}

export function messageFor(error) {
  return error.status ? error.message : '暫時未能連線，請再試一次。';
}

export function Brand() {
  return <div className="brand">
    <span className="brand-mark"><Star size={23} fill="currentColor" strokeWidth={1.5} /></span>
    <span>星點校園</span>
  </div>;
}

export function Avatar({ person, large = false }) {
  return <span className={`avatar avatar--${person.color || 'gold'}${large ? ' avatar--large' : ''}`} aria-hidden="true">
    {person.initial}
  </span>;
}

export function PageHeading({ title, description, action }) {
  return <div className="page-heading">
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {action}
  </div>;
}

export function Notice({ children }) {
  return <div className="notice" role="alert"><CircleAlert size={18} /> <div>{children}</div></div>;
}

export function Empty({ icon: Icon = Sparkles, title, description }) {
  return <div className="empty">
    <span className="icon-tile"><Icon size={22} /></span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
  </div>;
}

export function Dialog({ title, description, onClose, children, className = '' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  const titleId = React.useId();
  return <dialog
    ref={dialog}
    className={`dialog ${className}`}
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="dialog-content">
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button className="icon-button close-button" type="button" aria-label="關閉" onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

export function LedgerRows({ items, people, compact = false }) {
  if (items.length === 0) return <Empty title="暫時沒有積分紀錄" description="記分或兌換後，這裡就會顯示紀錄。" />;
  return <ul className="ledger-list">
    {items.map(item => {
      const student = people?.find(person => person.id === item.studentId);
      const isReward = item.kind !== 'adjustment';
      const Icon = isReward ? Gift : item.delta > 0 ? ArrowUp : ArrowDown;
      const signed = item.delta > 0 ? `+${formatPoints(item.delta)}` : `−${formatPoints(-item.delta)}`;
      return <li key={item.id} className="ledger-row">
        <span className={`icon-tile ledger-icon ${isReward ? 'lavender' : item.delta > 0 ? 'mint' : 'rose'}`}><Icon size={18} /></span>
        <div className="ledger-text">
          <strong>{compact && student ? student.name : item.reason}</strong>
          <span>{[compact ? item.reason : student?.name, isReward ? '禮物兌換' : categories[item.category]?.label, formatDateTime(item.at)].filter(Boolean).join(' · ')}</span>
          {!compact && item.note && <span className="ledger-note">{item.note}</span>}
        </div>
        <b className={item.delta > 0 ? 'positive' : 'negative'}>{signed} <small>分</small></b>
      </li>;
    })}
  </ul>;
}

export function LedgerPage({ view }) {
  const [person, selectPerson] = useState('');
  const [filter, setFilter] = useState('all');
  const items = view.ledger.filter(item => {
    if (person && person !== item.studentId) return false;
    if (filter === 'all') return true;
    if (filter === 'redeem') return item.kind !== 'adjustment';
    return item.kind === 'adjustment' && (filter === 'add' ? item.delta > 0 : item.delta < 0);
  });

  return <>
    <PageHeading title="積分紀錄" description="查閱加分、減分和兌換禮物的紀錄。" />
    <section className="panel filters-panel">
      <div className="filter-bar">
        <div className="filter-tabs" aria-label="紀錄類型">
          {[['all', '全部'], ['add', '加分'], ['subtract', '減分'], ['redeem', '兌換']].map(([value, label]) =>
            <button className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>
          )}
        </div>
        {view.user.role === 'teacher' && <select aria-label="選擇學生" value={person} onChange={event => selectPerson(event.target.value)}>
          <option value="">所有學生</option>
          {view.students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>}
      </div>
      <LedgerRows items={items} people={view.user.role === 'teacher' ? view.students : undefined} />
    </section>
  </>;
}

export function QRCard({ student, base, showScan }) {
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  const link = new URL(base || './', location.href);
  link.hash = `/scan/${student.code}`;
  const url = link.href;

  useEffect(() => {
    let active = true;
    setFailed(false);
    QRCode.toDataURL(url, { width: 512, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#142d55', light: '#ffffff' } })
      .then(value => { if (active) setImage(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [url]);

  return <div className="qr-card">
    <div className="qr-identity">
      <Avatar person={student} />
      <div><strong>{student.name}</strong><span>{student.className} 班 · {student.seat} 號</span></div>
    </div>
    {failed ? <Notice>未能產生 QR Code，請重新載入頁面。</Notice> :
      <div className="qr-image">
        {image ? <img src={image} alt={`${student.name}的 QR Code`} width="192" height="192" /> : <QrCode size={52} aria-label="正在產生 QR Code" />}
      </div>}
    <div className="qr-card-actions">
      {image && <a className="button button--secondary" href={image} download={`${student.name}-QR.png`}><Download size={17} /> 下載</a>}
      {showScan && <a className="button button--subtle" href={url}><ScanLine size={17} /> 測試掃碼</a>}
    </div>
  </div>;
}

export function SectionLink({ page, children }) {
  return <a className="section-link" href={`#/${page}`}>{children} <ArrowRight size={16} /></a>;
}

export function MobileQRHint({ base }) {
  if (base || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return null;
  return <p className="helper qr-hint">用手機測試時，請在同一 Wi-Fi 的裝置開啟程式列出的網絡網址，再下載 QR Code。</p>;
}
