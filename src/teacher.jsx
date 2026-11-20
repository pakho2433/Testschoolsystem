import React, { useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Gift, Minus, Plus,
  Printer, QrCode, ScanLine, Star, Users,
} from 'lucide-react';
import { categories } from './domain.js';
import { operationId } from './api.js';
import {
  Avatar, categoryIcons, Dialog, formatPoints, formatWeekday, LedgerRows, messageFor,
  MobileQRHint, Notice, PageHeading, QRCard, sameSchoolDay, SectionLink,
} from './ui.jsx';

function Metric({ icon: Icon, color, value, label, page }) {
  return <a href={`#/${page}`} className="metric panel">
    <span className={`icon-tile ${color}`}><Icon size={23} /></span>
    <span className="metric-info"><span>{label}</span><strong>{formatPoints(value)}</strong></span>
    <ChevronRight className="metric-arrow" size={18} />
  </a>;
}

export function TeacherHome({ view, openScanner, showQR }) {
  const todayPoints = view.ledger.filter(item =>
    item.kind === 'adjustment' && item.delta > 0 && sameSchoolDay(item.at, view.serverNow)
  ).reduce((total, item) => total + item.delta, 0);
  const pending = view.bookings.filter(booking => booking.status === 'reserved').length;

  return <>
    <PageHeading
      title={`你好，${view.user.name}！`}
      description="在這裡記錄學生的表現、查閱積分和處理領取預約。"
      action={<span className="date-chip"><CalendarDays size={17} /> {formatWeekday(view.serverNow)}</span>}
    />
    <section className="scan-hero" aria-labelledby="scan-heading">
      <div className="hero-art" aria-hidden="true" />
      <div className="hero-copy">
        <h2 id="scan-heading">掃碼記分</h2>
        <p>掃描學生專屬 QR Code，<br className="desktop-break" />直接開啟加減分表格。</p>
        <button className="button button--white" onClick={openScanner}><ScanLine size={21} /> 開啟掃描器 <ArrowRight size={17} className="hero-arrow" /></button>
      </div>
    </section>

    <div className="metrics">
      <Metric icon={Users} color="blue" value={view.students.length} label="測試學生" page="qr" />
      <Metric icon={Star} color="lemon" value={todayPoints} label="今日加分" page="history" />
      <Metric icon={Gift} color="lavender" value={pending} label="待領取禮物" page="bookings" />
    </div>

    <div className="dashboard-grid">
      <section className="panel dashboard-panel">
        <div className="panel-heading"><h2>學生一覽</h2><SectionLink page="qr">查看 QR Code</SectionLink></div>
        <ul className="student-list">
          {view.students.map(student => <li className="student-row" key={student.id}>
            <a className="student-profile" href={`#/scan/${student.code}`}>
              <Avatar person={student} />
              <div><strong>{student.name}</strong><span>{student.className} 班 · {student.seat} 號</span></div>
            </a>
            <span className="point-pill"><Star size={14} /> {formatPoints(student.points)} <small>分</small></span>
            <button className="icon-button student-qr-button" aria-label={`${student.name}的 QR Code`} onClick={() => showQR(student.id)}><QrCode size={19} /></button>
          </li>)}
        </ul>
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-heading"><h2>最近積分活動</h2><SectionLink page="history">查看紀錄</SectionLink></div>
        <LedgerRows items={view.ledger.slice(0, 3)} people={view.students} compact />
      </section>
    </div>
  </>;
}

export function QrPage({ view, openScanner }) {
  return <>
    <PageHeading
      title="學生 QR Code"
      description="下載或列印學生專屬 QR Code，再用手機相機掃描。"
      action={<div className="heading-actions">
        <button className="button button--secondary" onClick={() => window.print()}><Printer size={18} /> 列印</button>
        <button className="button button--primary" onClick={openScanner}><ScanLine size={19} /> 掃描</button>
      </div>}
    />
    <MobileQRHint base={view.qrBase} />
    <div className="qr-grid qr-print-grid">
      {view.students.map(student => <QRCard key={student.id} student={student} base={view.qrBase} showScan />)}
    </div>
  </>;
}

export function QrModal({ view, student, onClose }) {
  return <Dialog title="學生專屬 QR Code" onClose={onClose} className="qr-dialog">
    <QRCard student={student} base={view.qrBase} showScan />
    <MobileQRHint base={view.qrBase} />
  </Dialog>;
}

export function AdjustPage({ view, student, perform, openScanner }) {
  const [mode, setMode] = useState('add');
  const [category, selectCategory] = useState('academic');
  const [reason, selectReason] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lastRequest = useRef(null);

  const isAdding = mode === 'add';
  const amount = Number(points);
  const validPoints = Number.isSafeInteger(amount) && amount > 0;
  const delta = isAdding ? amount : -amount;
  const newBalance = student.points + delta;

  function chooseMode(direction) {
    if (mode === direction) return;
    setMode(direction);
    selectReason('');
    setError('');
  }

  function chooseCategory(group) {
    if (category === group) return;
    selectCategory(group);
    selectReason('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!reason || !validPoints) {
      setError('請選擇原因，並輸入大於 0 的整數分數。');
      return;
    }
    const payload = { studentId: student.id, category, reason, delta, note };
    const key = JSON.stringify(payload);
    if (lastRequest.current?.key !== key) lastRequest.current = { key, id: operationId() };
    setSaving(true);
    setError('');
    try {
      const label = isAdding ? '加' : '減';
      await perform('adjust', { ...payload, operationId: lastRequest.current.id },
        `已為${student.name}${label} ${formatPoints(amount)} 分。`);
      lastRequest.current = null;
      setNote('');
      setPoints('');
      selectReason('');
    } catch (problem) {
      setError(messageFor(problem));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <a href="#/home" className="back-link"><ArrowLeft size={17} /> 返回總覽</a>
    <PageHeading title="記錄積分" description="選擇類別和原因，再輸入這次加減的分數。" />
    <div className="adjust-grid">
      <form className="panel adjust-form" onSubmit={submit}>
        <div className="adjust-mode" aria-label="記分方式">
          <button type="button" aria-pressed={isAdding} className={isAdding ? 'mode-add is-active' : ''} onClick={() => chooseMode('add')}><Plus size={19} /> 加分</button>
          <button type="button" aria-pressed={!isAdding} className={!isAdding ? 'mode-subtract is-active' : ''} onClick={() => chooseMode('subtract')}><Minus size={19} /> 減分</button>
        </div>
        <fieldset>
          <legend>類別</legend>
          <div className="category-options">
            {Object.entries(categories).map(([key, group]) => {
              const Icon = categoryIcons[key];
              return <button type="button" key={key} aria-pressed={category === key} onClick={() => chooseCategory(key)}><Icon size={19} /> {group.label}</button>;
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>{isAdding ? '加分原因' : '減分原因'}</legend>
          <div className="reason-options">
            {categories[category][mode].map(value =>
              <button type="button" key={value} aria-pressed={reason === value} onClick={() => selectReason(value)}>{value}</button>
            )}
          </div>
        </fieldset>

        <div className="point-field">
          <label htmlFor="points">分數</label>
          <div className="point-entry">
            <span aria-hidden="true" className={isAdding ? 'positive' : 'negative'}>{isAdding ? '+' : '−'}</span>
            <input id="points" type="number" min="1" step="1" inputMode="numeric" placeholder="輸入分數" value={points} required onChange={event => setPoints(event.target.value)} />
            <span className="muted">分</span>
          </div>
          <div className="quick-points" aria-label="快捷分數">
            {[1, 3, 5, 10].map(value => <button type="button" key={value} onClick={() => setPoints(String(value))}>{isAdding ? '+' : '−'}{value}</button>)}
          </div>
        </div>
        <label className="field" htmlFor="point-note">備註 <span className="muted">（選填）</span>
          <textarea id="point-note" rows="2" value={note} maxLength={160} placeholder="記下這次記分的情況" onChange={event => setNote(event.target.value)} />
        </label>

        {error && <Notice>{error}</Notice>}
        <button type="submit" className={`button button--primary submit-adjust${isAdding ? '' : ' button--deduct'}`} disabled={saving}>
          {saving ? '儲存中…' : isAdding ? '確認加分' : '確認減分'}
        </button>
      </form>
      <div className="adjust-side">
        <section className="panel student-summary">
          <div className="student-profile">
            <Avatar person={student} large />
            <div><strong>{student.name}</strong><span>{student.className} 班 · {student.seat} 號</span></div>
          </div>
          <div className="student-current"><span>目前積分</span><strong><Star size={20} /> {formatPoints(student.points)} <small>分</small></strong></div>
          {validPoints && Number.isSafeInteger(newBalance) &&
            <div className="student-current student-projected"><span>提交後</span><strong>{formatPoints(newBalance)} <small>分</small></strong></div>}
        </section>
        <button className="button button--secondary scan-next" onClick={openScanner}><ScanLine size={20} /> 掃描下一位學生</button>
        <section className="panel dashboard-panel student-recent">
          <div className="panel-heading"><h2>最近積分紀錄</h2></div>
          <LedgerRows items={view.ledger.filter(item => item.studentId === student.id).slice(0, 3)} />
        </section>
      </div>
    </div>
  </>;
}
