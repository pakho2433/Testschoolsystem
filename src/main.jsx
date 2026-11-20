import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Gift, History,
  LayoutDashboard, LogOut, QrCode, ScanLine, UserRound, X,
} from 'lucide-react';
import { api } from './api.js';
import { students, teacher } from './domain.js';
import { Scanner } from './scanner.jsx';
import { BookingsPage, StudentGifts, StudentQR } from './student.jsx';
import { AdjustPage, QrModal, QrPage, TeacherHome } from './teacher.jsx';
import { Avatar, Brand, LedgerPage, messageFor, Notice, PageHeading } from './ui.jsx';
import './styles.css';

const teacherNav = [
  ['home', '總覽', LayoutDashboard],
  ['qr', '學生 QR Code', QrCode],
  ['history', '積分紀錄', History],
  ['bookings', '領取預約', CalendarDays],
];
const studentNav = [
  ['gifts', '禮物兌換', Gift],
  ['bookings', '我的預約', CalendarDays],
  ['history', '積分紀錄', History],
  ['qr', '我的 QR Code', QrCode],
];

function getRoute() {
  return location.hash.replace(/^#\/?/, '');
}

function Login({ scanned, login, initialError, retry }) {
  const [id, chooseId] = useState(teacher.id);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const profile = scanned ? teacher.id : id;
  const isTeacher = profile === teacher.id;

  function choose(value) {
    chooseId(value);
    setPin('');
    setPassword('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await login(isTeacher ? { id: profile, username, password } : { id: profile, pin: pin.trim() });
    } catch (problem) {
      setError(messageFor(problem));
    } finally {
      setPending(false);
    }
  }

  return <div className="login-layout">
    <aside className="login-aside">
      <Brand />
      <div className="login-art" aria-hidden="true" />
      <div className="login-aside-copy"><h2>學生獎勵系統</h2><p>用 QR Code 記錄積分，兌換喜歡的禮物。</p></div>
    </aside>
    <main className="login-main">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><Brand /></div>
        {scanned && <a className="back-link" href="#/"><ArrowLeft size={17} /> 返回首頁</a>}
        <PageHeading title={scanned ? '老師登入' : '登入星點校園'}
          description={scanned ? '登入後，會直接開啟這位學生的加減分表格。' : '選擇老師或學生帳戶，登入後即可使用。'} />
        {initialError && <Notice>{initialError} <button className="text-button" onClick={retry}>重試</button></Notice>}
        <form className="login-form" onSubmit={submit}>
          {!scanned && <fieldset className="profile-options" disabled={pending}>
            <legend className="sr-only">測試帳戶</legend>
            {[teacher, ...students].map(person =>
              <button key={person.id} type="button" className="profile-option" aria-pressed={person.id === profile} onClick={() => choose(person.id)}>
                <Avatar person={person} />
                <span><strong>{person.name}</strong><span>{person.id === teacher.id ? '測試老師' : `${person.className} 班 · ${person.seat} 號`}</span></span>
                <span className="radio-mark" aria-hidden="true" />
              </button>
            )}
          </fieldset>}
          {isTeacher ? <>
            <label className="field" htmlFor="login-username">
              老師帳號
              <input id="login-username" name="username" type="text" autoComplete="username" autoCapitalize="none"
                spellCheck={false} maxLength={128} required value={username} onChange={event => setUsername(event.target.value)}
                placeholder="輸入老師帳號" />
            </label>
            <label className="field" htmlFor="login-password">
              密碼
              <input id="login-password" name="password" type="password" autoComplete="current-password" maxLength={128}
                required value={password} onChange={event => setPassword(event.target.value)} placeholder="輸入密碼" />
            </label>
          </> : <label className="field" htmlFor="login-pin">
            測試 PIN
            <input id="login-pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={32} required
              value={pin} onChange={event => setPin(event.target.value)} placeholder="輸入此帳戶的 PIN" />
          </label>}
          {error && <Notice>{error}</Notice>}
          <button className="button button--primary login-submit" disabled={pending} type="submit">
            {pending ? '登入中…' : '登入'} <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </main>
  </div>;
}

function NavLinks({ items, active }) {
  return items.map(([route, label, Icon]) => <a key={route} href={`#/${route}`}
    className={route === active ? 'nav-link is-active' : 'nav-link'} aria-current={route === active ? 'page' : undefined}>
    <Icon size={21} /> <span>{label}</span>
  </a>);
}

function Workspace({ view, active, page, switchIdentity, children }) {
  const isTeacher = view.user.role === 'teacher';
  const items = isTeacher ? teacherNav : studentNav;
  const home = isTeacher ? 'home' : 'gifts';
  const pageTitle = page.startsWith('scan/') ? '記錄積分' : items.find(([route]) => route === active)?.[1];

  return <div className="workspace">
    <aside className="sidebar">
      <a href={`#/${home}`} className="brand-link" aria-label="星點校園首頁"><Brand /></a>
      <nav className="side-nav" aria-label="主選單"><NavLinks items={items} active={active} /></nav>
      <div className="sidebar-bottom">
        <div className="profile-summary">
          <Avatar person={view.user} />
          <span><strong>{view.user.name}</strong><span>{isTeacher ? '老師帳戶' : '學生帳戶'}</span></span>
          <button className="icon-button" onClick={switchIdentity}><LogOut size={16} /> 切換身份</button>
        </div>
      </div>
    </aside>
    <div className="workspace-body">
      <header className="topbar">
        <div className="breadcrumb"><span>{isTeacher ? '老師工作台' : '學生專區'}</span><ChevronRight size={16} /><span>{pageTitle}</span></div>
        <a href={`#/${home}`} className="topbar-brand" aria-label="星點校園首頁"><Brand /></a>
        <div className="topbar-actions">
          <span className="mode-pill" title="使用測試帳戶"><span />測試模式</span>
          <button className="icon-button mobile-switch" onClick={switchIdentity}><LogOut size={16} /> 切換身份</button>
        </div>
      </header>
      <main id="main-content" className="main-content">{children}</main>
    </div>
    <nav className="mobile-nav" aria-label="主選單"><NavLinks items={items} active={active} /></nav>
  </div>;
}

function App() {
  const [route, setRoute] = useState(getRoute);
  const [view, setView] = useState(undefined);
  const [initialError, setInitialError] = useState('');
  const [scanner, showScanner] = useState(false);
  const [qrId, showQR] = useState(null);
  const [toast, setToast] = useState('');
  const requestVersion = useRef(0);
  const changing = useRef(false);
  const toastTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (changing.current) return;
    const version = ++requestVersion.current;
    try {
      const latest = await api.view();
      if (version !== requestVersion.current) return;
      setView(latest);
      setInitialError('');
    } catch (error) {
      if (version !== requestVersion.current) return;
      setView(current => current === undefined ? null : current);
      setInitialError(messageFor(error));
    }
  }, []);

  useEffect(() => {
    refresh();
    const changePage = () => {
      setRoute(getRoute());
      showQR(null);
      showScanner(false);
      window.scrollTo(0, 0);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('hashchange', changePage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, 15_000);
    return () => {
      window.removeEventListener('hashchange', changePage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
      clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }

  async function update(promise) {
    changing.current = true;
    requestVersion.current += 1;
    try {
      const next = await promise();
      setView(next ?? null);
      setInitialError('');
      return next;
    } finally {
      changing.current = false;
    }
  }

  async function perform(action, payload, message) {
    try {
      await update(() => api.action(action, payload));
      notify(message);
    } catch (error) {
      if (error.status === 401) await refresh();
      throw error;
    }
  }

  async function signOut(keepScan) {
    try {
      await update(() => api.logout());
      if (!keepScan) location.hash = '/';
      showScanner(false);
      showQR(null);
      setToast('');
    } catch (error) {
      notify(messageFor(error));
    }
  }

  const scanRoute = route.startsWith('scan/');
  if (view === undefined) return <main className="loading"><Brand /><p role="status">正在載入…</p></main>;
  if (!view) return <Login key={String(scanRoute)} scanned={scanRoute} login={credentials => update(() => api.login(credentials))}
    initialError={initialError} retry={refresh} />;

  const isTeacher = view.user.role === 'teacher';
  const home = isTeacher ? 'home' : 'gifts';
  const nav = isTeacher ? teacherNav : studentNav;
  const active = nav.some(([page]) => page === route) ? route : home;
  const selected = isTeacher && scanRoute ? view.students.find(student => student.code === route.slice(5).toLowerCase()) : null;
  const qrStudent = view.students.find(student => student.id === qrId);

  function matchScan(code) {
    const student = view.students.find(person => person.code === code);
    if (!student) return '找不到這個 QR Code 對應的測試學生。';
    showScanner(false);
    location.hash = `/scan/${student.code}`;
    return null;
  }

  let content;
  if (selected) {
    content = <AdjustPage key={selected.id} view={view} student={selected} perform={perform} openScanner={() => showScanner(true)} />;
  } else if (scanRoute) {
    content = <>
      <PageHeading title={isTeacher ? '找不到學生 QR Code' : '老師記分專用'} />
      <section className="panel missing-panel">
        <Notice>{isTeacher ? '這個 QR Code 未能對應到測試學生。' : '老師登入後，即可為這個 QR Code 所屬的學生記分。'}</Notice>
        {isTeacher
          ? <button className="button button--primary" onClick={() => showScanner(true)}><ScanLine size={19} /> 掃描 QR Code</button>
          : <button className="button button--primary" onClick={() => signOut(true)}><UserRound size={18} /> 切換至老師登入</button>}
        <a className="button button--secondary" href={`#/${home}`}>返回首頁</a>
      </section>
    </>;
  } else if (active === 'history') {
    content = <LedgerPage key={view.user.id} view={view} />;
  } else if (active === 'bookings') {
    content = <BookingsPage key={view.user.id} view={view} perform={perform} />;
  } else if (active === 'qr') {
    content = isTeacher ? <QrPage view={view} openScanner={() => showScanner(true)} /> : <StudentQR view={view} />;
  } else {
    content = isTeacher ? <TeacherHome view={view} openScanner={() => showScanner(true)} showQR={showQR} /> :
      <StudentGifts key={view.user.id} view={view} perform={perform} />;
  }

  return <Workspace view={view} active={active} page={route} switchIdentity={() => signOut(false)}>
    {content}
    {scanner && isTeacher && <Scanner onClose={() => showScanner(false)} onScan={matchScan} />}
    {qrStudent && isTeacher && <QrModal view={view} student={qrStudent} onClose={() => showQR(null)} />}
    {toast && <div className="toast" role="status">
      <CheckCircle2 size={21} /><span>{toast}</span>
      <button className="icon-button" aria-label="關閉提示" onClick={() => setToast('')}><X size={17} /></button>
    </div>}
  </Workspace>;
}

createRoot(document.getElementById('root')).render(<App />);
