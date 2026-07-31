import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import {
  ShieldCheck, Lock, Mail, ArrowRight, Compass,
  UserPlus, LogIn, User, Phone, Eye, EyeOff, Loader, Bus
} from 'lucide-react';
import { BOARDING_STOPS, DEPT_OPTIONS, YEAR_OPTIONS } from '../utils/studentHelpers';
import campusBusHero from '../assets/campus_bus_hero.png';
const AuthView = ({ setCurrentView }) => {
  const { setCurrentUser, triggerToast, loginUser, registerUser, fetchAvailableBuses,
          boardingStopsFromDB, fetchBoardingStops, suggestBoardingStop } = useContext(AppContext);

  const [tab, setTab] = useState('login');

  // ── LOGIN state ──
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPwd,  setShowLoginPwd]  = useState(false);
  const [enableMfa,     setEnableMfa]     = useState(false);
  const [showMfaStep,   setShowMfaStep]   = useState(false);
  const [mfaCode,       setMfaCode]       = useState('');
  const [loginLoading,  setLoginLoading]  = useState(false);

  // ── SIGNUP state ──
  const [signupName,     setSignupName]     = useState('');
  const [signupEmail,    setSignupEmail]    = useState('');
  const [signupPhone,    setSignupPhone]    = useState('');
  const [signupRole,     setSignupRole]     = useState('student');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm,  setSignupConfirm]  = useState('');
  const [showSignupPwd,  setShowSignupPwd]  = useState(false);
  const [signupLoading,  setSignupLoading]  = useState(false);
  const [signupDept,       setSignupDept]       = useState('Computer Science');
  const [signupYear,       setSignupYear]       = useState('1st Year');
  const [signupStop,       setSignupStop]       = useState('');
  const [signupCustomStop, setSignupCustomStop] = useState(''); // when "Other" is selected

  // Fetch live boarding stops from DB when signup tab is shown
  useEffect(() => { fetchBoardingStops(); }, []);

  // Merge DB stops with static fallback
  const availableStops = boardingStopsFromDB.length > 0 ? boardingStopsFromDB : BOARDING_STOPS;
  const isCustomStop   = signupStop === '__other__';

  // Fetch available buses when driver role is selected
  // Removed — bus assignment is now done by admin after driver registers

  const redirectByRole = (role) => {
    if (role === 'driver')       setCurrentView('driver-dashboard');
    else if (role === 'student') setCurrentView('student-dashboard');
    else                         setCurrentView('dashboard');
  };

  // ── LOGIN via MongoDB API ──
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      triggerToast('Please fill in all fields.', 'warning');
      return;
    }

    if (enableMfa && !showMfaStep) {
      setShowMfaStep(true);
      triggerToast('MFA code sent. (Demo: 123456)', 'info');
      return;
    }
    if (enableMfa && showMfaStep && mfaCode !== '123456') {
      triggerToast('Invalid MFA code. Demo code: 123456', 'danger');
      return;
    }

    setLoginLoading(true);
    const result = await loginUser({ email: loginEmail, password: loginPassword });
    setLoginLoading(false);

    if (!result.success) {
      triggerToast(result.message, 'danger');
      return;
    }

    // result.user.name is the ACTUAL name stored in MongoDB
    const userPayload = { ...result.user, token: result.token };
    setCurrentUser(userPayload);
    triggerToast(`Welcome back, ${result.user.name}!`, 'success');
    redirectByRole(result.user.role);
  };

  // ── QUICK demo login (still uses API) ──
  const handleQuickLogin = async (role) => {
    const creds = {
      admin:   { email: 'admin@institution.edu',    password: 'admin123'   },
      student: { email: 'rahul.kumar@student.edu',  password: 'student123' },
      driver:  { email: 'vikram.singh@transit.edu', password: 'driver123'  }
    };
    setLoginLoading(true);
    const result = await loginUser(creds[role]);
    setLoginLoading(false);

    if (!result.success) {
      // Fallback: seed demo accounts if they don't exist yet
      triggerToast('Seeding demo account...', 'info');
      const demoNames = { admin: 'Admin (Principal Office)', student: 'Rahul Kumar', driver: 'Vikram Singh' };
      const phones    = { admin: '+91 99000 00001', student: '+91 98765 43210', driver: '+91 97000 10001' };
      const studentIds = { admin: null, student: 'STU001', driver: null };
      const busIds     = { admin: null, student: null,     driver: 1    };

      await registerUser({
        name: demoNames[role], email: creds[role].email,
        password: creds[role].password, phone: phones[role], role
      });

      const retry = await loginUser(creds[role]);
      if (!retry.success) { triggerToast(retry.message, 'danger'); return; }

      const userPayload = { ...retry.user, token: retry.token };
      setCurrentUser(userPayload);
      triggerToast(`Demo login as ${retry.user.name}.`, 'success');
      redirectByRole(retry.user.role);
      return;
    }

    const userPayload = { ...result.user, token: result.token };
    setCurrentUser(userPayload);
    triggerToast(`Demo login as ${result.user.name}.`, 'success');
    redirectByRole(result.user.role);
  };

  // ── SIGNUP via MongoDB API ──
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupName || !signupEmail || !signupPassword || !signupConfirm) {
      triggerToast('Please fill in all required fields.', 'warning');
      return;
    }
    if (signupPassword !== signupConfirm) {
      triggerToast('Passwords do not match.', 'danger');
      return;
    }
    if (signupPassword.length < 6) {
      triggerToast('Password must be at least 6 characters.', 'warning');
      return;
    }

    setSignupLoading(true);
    const finalStop = isCustomStop ? signupCustomStop.trim() : signupStop;

    if (signupRole === 'student' && !finalStop) {
      triggerToast('Please select or enter your boarding stop.', 'warning');
      setSignupLoading(false);
      return;
    }

    // If student typed a custom stop, suggest it to admin
    if (signupRole === 'student' && isCustomStop && finalStop) {
      await suggestBoardingStop(finalStop);
    }

    const result = await registerUser({
      name: signupName, email: signupEmail,
      phone: signupPhone, password: signupPassword, role: signupRole,
      dept: signupRole === 'student' ? signupDept : undefined,
      year: signupRole === 'student' ? signupYear : undefined,
      boardingStop: signupRole === 'student' ? finalStop : undefined,
    });
    setSignupLoading(false);

    if (!result.success) {
      triggerToast(result.message, 'danger');
      return;
    }

    triggerToast(
      signupRole === 'driver'
        ? `Account created! Ask your admin to assign a bus to your account, ${signupName}.`
        : `Account created! Sign in, ${signupName}.`,
      'success'
    );
    setLoginEmail(signupEmail);
    setLoginPassword(signupPassword);
    setTab('login');
  };

  // ── Icon input helper ──
  const iconInput = (icon, value, setter, type = 'text', placeholder = '', toggleFn = null, show = false) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
        {icon}
      </span>
      <input
        type={toggleFn ? (show ? 'text' : 'password') : type}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={e => setter(e.target.value)}
        style={{ paddingLeft: 40, paddingRight: toggleFn ? 40 : 14, width: '100%', boxSizing: 'border-box' }}
      />
      {toggleFn && (
        <span onClick={toggleFn}
          style={{ position: 'absolute', right: 12, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </span>
      )}
    </div>
  );

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', width: '100%', padding: '16px',
      boxSizing: 'border-box',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(124,58,237,0.04) 100%)'
    }}>
      <div style={{
        display: 'flex', width: '100%', maxWidth: '980px',
        minHeight: '600px', borderRadius: 28, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(99,102,241,0.22), 0 8px 32px rgba(0,0,0,0.12)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'blur(40px)'
      }}>

        {/* ── Left Banner ── */}
        <div className="login-banner" style={{ minWidth: 340 }}>
          {/* Floating orbs */}
          <div style={{ position: 'absolute', top: '30%', left: '15%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(245,158,11,0.20) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(35px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 160, height: 160, background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(28px)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ background: 'linear-gradient(135deg, var(--primary), var(--violet))', borderRadius: 14, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px var(--primary-glow)', flexShrink: 0 }}>
                <Compass size={24} color="#fff" className="animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: '1.05rem', background: 'linear-gradient(135deg, var(--primary), var(--cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Campus Transit AI</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Vignan's LARA Institute · Vadlamudi</div>
              </div>
            </div>

            <h2 style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 22, fontFamily: 'var(--font-heading)', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
              Smarter Commuting,<br/>
              <span style={{ background: 'linear-gradient(90deg, var(--primary), var(--cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Powered by AI
              </span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', marginTop: 10, lineHeight: 1.65 }}>
              Real-time GPS tracking, AI-predicted boarding times and Dijkstra route optimization — all in one platform.
            </p>

            {/* Live stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
              {[
                { icon: '🚌', label: 'Active Buses',   value: '50+' },
                { icon: '👥', label: 'Students Served', value: '2000+' },
                { icon: '📍', label: 'Boarding Stops',  value: '15' },
                { icon: '⚡', label: 'AI Accuracy',     value: '94%' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 14, padding: '10px 14px' }}>
                  <div style={{ fontSize: '1.1rem' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginTop: 2 }}>{s.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 18 }}>
              {['🤖 AI Boarding Prediction','🗺 Live GPS Maps','📊 Fleet Analytics','🔔 Instant Alerts'].map(f => (
                <span key={f} style={{ background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.28)', padding: '5px 12px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{f}</span>
              ))}
            </div>
          </div>

          {/* Hero image */}
          <div style={{ position: 'relative', margin: '18px 0', height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={campusBusHero} alt="Smart Campus Bus"
              style={{ maxHeight: '100%', maxWidth: '88%', objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.18))', transition: 'transform 0.35s ease' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05) translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
            />
          </div>

          {/* Footer note */}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)', padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.8rem' }}>🔒</span>
            © 2026 Institution Transit · XGBoost + Dijkstra Pathfinder
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{
          width: '100%', maxWidth: 420, padding: '36px 38px',
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          borderLeft: '1px solid var(--card-border)',
          background: 'var(--bg-secondary)',
          overflowY: 'auto'
        }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border)', marginBottom: 24, background: 'var(--bg-tertiary)', padding: 3, gap: 3 }}>
            {[{ key: 'login', label: 'Sign In', icon: <LogIn size={15} /> },
              { key: 'signup', label: 'Sign Up', icon: <UserPlus size={15} /> }
            ].map(t => (
              <button key={t.key}
                onClick={() => { setTab(t.key); setShowMfaStep(false); }}
                style={{
                  flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem',
                  borderRadius: 11,
                  transition: 'all 0.22s ease',
                  background: tab === t.key ? 'linear-gradient(135deg, var(--primary), var(--violet))' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--text-muted)',
                  boxShadow: tab === t.key ? '0 4px 14px var(--primary-glow)' : 'none'
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ══ LOGIN ══ */}
          {tab === 'login' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--primary-glow)', width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Secure Login</h3>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Enter your registered credentials</span>
                </div>
              </div>

              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {!showMfaStep ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      {iconInput(<Mail size={15} />, loginEmail, setLoginEmail, 'email', 'your@institution.edu')}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Password</label>
                      {iconInput(<Lock size={15} />, loginPassword, setLoginPassword, 'password', 'Your password', () => setShowLoginPwd(p => !p), showLoginPwd)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" id="mfa" checked={enableMfa}
                        onChange={e => setEnableMfa(e.target.checked)}
                        style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} />
                      <label htmlFor="mfa" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                        Enable MFA (demo code: 123456)
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="form-group">
                    <label className="form-label">6-Digit MFA Code</label>
                    <input type="text" className="form-input"
                      placeholder="Enter code (123456)"
                      value={mfaCode} onChange={e => setMfaCode(e.target.value)}
                      maxLength={6}
                      style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '1.3rem', fontWeight: 700 }} />
                    <span style={{ fontSize: '0.73rem', color: 'var(--primary)', cursor: 'pointer', marginTop: 4 }}
                      onClick={() => setShowMfaStep(false)}>← Back</span>
                  </div>
                )}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loginLoading}>
                  {loginLoading
                    ? <><Loader size={15} className="animate-spin" /> Verifying...</>
                    : <><span>{showMfaStep ? 'Verify & Login' : 'Sign In'}</span><ArrowRight size={15} /></>
                  }
                </button>
              </form>

              <div style={{ margin: '18px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ height: 1, background: 'var(--card-border)', flex: 1 }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Quick Demo</span>
                <div style={{ height: 1, background: 'var(--card-border)', flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { r: 'admin',   label: 'Admin',   color: 'var(--primary)', bg: 'var(--primary-soft)' },
                  { r: 'student', label: 'Student',  color: 'var(--cyan)',    bg: 'var(--cyan-soft)'    },
                  { r: 'driver',  label: 'Driver',   color: 'var(--emerald)', bg: 'var(--emerald-soft)' }
                ].map(({ r, label, color, bg }) => (
                  <button key={r} 
                    style={{ flex: 1, padding: '8px', fontSize: '0.76rem', borderRadius: 10, border: `1.5px solid ${color}33`, cursor: 'pointer', background: bg, color, fontWeight: 800, fontFamily: 'var(--font-heading)', transition: 'all 0.18s ease' }}
                    disabled={loginLoading}
                    onClick={() => handleQuickLogin(r)}
                    onMouseEnter={e => { e.currentTarget.style.background = color; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = bg; e.currentTarget.style.color = color; }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ══ SIGNUP ══ */}
          {tab === 'signup' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--cyan-soft)', width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cyan)' }}>
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Create Account</h3>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Register your institutional access</span>
                </div>
              </div>

              <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  {iconInput(<User size={15} />, signupName, setSignupName, 'text', 'e.g. Priya Sharma')}
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  {iconInput(<Mail size={15} />, signupEmail, setSignupEmail, 'email', 'you@institution.edu')}
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  {iconInput(<Phone size={15} />, signupPhone, setSignupPhone, 'tel', '+91 XXXXX XXXXX')}
                </div>
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-input" value={signupRole} onChange={e => setSignupRole(e.target.value)}>
                    <option value="student">Student</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Transport Administrator</option>
                  </select>
                </div>

                {signupRole === 'driver' && (
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--cyan-soft)', border: '1px solid var(--cyan-glow)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Bus size={18} style={{ color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--cyan)', marginBottom: 3 }}>
                        Bus assignment done by Admin
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Register your account here. The transport administrator will assign your bus from the Admin Panel after your account is created.
                      </div>
                    </div>
                  </div>
                )}

                {signupRole === 'student' && (
                  <>
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--primary-soft)', border: '1px solid var(--primary-glow)', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 2 }}>
                      <Bus size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--primary)' }}>Bus assigned by Admin.</strong> Select your boarding stop below — the administrator will assign your bus after registration.
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Department</label>
                        <select className="form-input" value={signupDept} onChange={e => setSignupDept(e.target.value)}>
                          {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Year</label>
                        <select className="form-input" value={signupYear} onChange={e => setSignupYear(e.target.value)}>
                          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Boarding Stop</label>
                      <select
                        className="form-input"
                        value={signupStop}
                        onChange={e => { setSignupStop(e.target.value); setSignupCustomStop(''); }}
                      >
                        <option value="">— Select your boarding stop —</option>
                        {availableStops.map(s => <option key={s} value={s}>{s}</option>)}
                        <option value="__other__">Other — type my stop name</option>
                      </select>

                      {/* Custom stop input — shown when "Other" is selected */}
                      {isCustomStop && (
                        <input
                          type="text"
                          className="form-input"
                          style={{ marginTop: 8 }}
                          placeholder="Type your boarding stop name..."
                          value={signupCustomStop}
                          onChange={e => setSignupCustomStop(e.target.value)}
                        />
                      )}

                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {isCustomStop
                          ? '⚠ Your stop will be submitted for admin review. Bus is assigned after confirmation.'
                          : 'Your bus and route are assigned based on this stop.'
                        }
                      </div>
                    </div>
                  </>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Password *</label>
                    {iconInput(<Lock size={15} />, signupPassword, setSignupPassword, 'password', 'Min 6 chars', () => setShowSignupPwd(p => !p), showSignupPwd)}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Confirm *</label>
                    {iconInput(<Lock size={15} />, signupConfirm, setSignupConfirm, 'password', 'Repeat')}
                  </div>
                </div>
                {signupConfirm && (
                  <div style={{ fontSize: '0.72rem', marginTop: -2,
                    color: signupPassword === signupConfirm ? 'var(--emerald)' : 'var(--rose)' }}>
                    {signupPassword === signupConfirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </div>
                )}
                <button type="submit" className="btn btn-cyan" style={{ width: '100%', marginTop: 6 }} disabled={signupLoading}>
                  {signupLoading
                    ? <><Loader size={15} className="animate-spin" /> Creating...</>
                    : <><UserPlus size={15} /><span>Create My Account</span></>
                  }
                </button>
              </form>

              <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Already have an account?{' '}
                <span style={{ color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setTab('login')}>Sign In</span>
              </div>
            </>
          )}

        </div>
      </div>
      <style>{`@media (max-width: 768px) { .login-banner { display: none !important; } }`}</style>
    </div>
  );
};

export default AuthView;
