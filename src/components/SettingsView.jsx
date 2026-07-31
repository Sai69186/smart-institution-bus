import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import {
  User, Mail, Phone, Lock, Save, Eye, EyeOff,
  ShieldCheck, Palette, Bell, LogOut, CheckCircle
} from 'lucide-react';

const SettingsView = ({ setCurrentView }) => {
  const { currentUser, updateUserProfile, setCurrentUser, theme, setTheme, triggerToast, saveNotificationPrefs } = useContext(AppContext);

  // Profile fields — pre-filled from current user
  const [name, setName]         = useState(currentUser?.name || '');
  const [email, setEmail]       = useState(currentUser?.email || '');
  const [phone, setPhone]       = useState(currentUser?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [saved, setSaved]       = useState(false);

  // Notification prefs (UI only — demo)
  const [notifBoarding, setNotifBoarding] = useState(true);
  const [notifDelay,    setNotifDelay]    = useState(true);
  const [notifSOS,      setNotifSOS]      = useState(true);
  const [notifAI,       setNotifAI]       = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPwd) {
      triggerToast('Passwords do not match.', 'danger');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      triggerToast('Password must be at least 6 characters.', 'warning');
      return;
    }
    await updateUserProfile({
      name,
      email,
      phone,
      password: newPassword || undefined
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
  };

  const roleColor = {
    admin:   'var(--primary)',
    student: 'var(--cyan)',
    driver:  'var(--emerald)'
  }[currentUser?.role] || 'var(--primary)';

  const roleSoft = {
    admin:   'var(--primary-soft)',
    student: 'var(--cyan-soft)',
    driver:  'var(--emerald-soft)'
  }[currentUser?.role] || 'var(--primary-soft)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div className="glass-card" style={{
        padding: '22px 28px',
        background: `linear-gradient(135deg, ${roleSoft} 0%, transparent 100%)`,
        borderLeft: `4px solid ${roleColor}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${roleColor} 0%, var(--violet) 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)', boxShadow: `0 4px 16px ${roleSoft}` }}>
            {currentUser?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.3rem' }}>{currentUser?.name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              <span style={{ background: roleSoft, color: roleColor, padding: '2px 10px', borderRadius: 99, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>
                {currentUser?.role}
              </span>
              <span style={{ marginLeft: 8 }}>{currentUser?.email}</span>
            </div>
          </div>
        </div>
        <button className="btn btn-secondary" style={{ color: 'var(--rose)', border: '1px solid var(--rose-glow)', fontSize: '0.8rem' }}
          onClick={handleLogout}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22 }}>

        {/* ── Profile Form ── */}
        <div className="glass-card">
          <h3 className="glass-card-title" style={{ marginBottom: 20 }}>
            <User size={18} /> Edit Profile
          </h3>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <User size={15} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="text" className="form-input" value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ paddingLeft: 38 }} placeholder="Your full name" />
              </div>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="email" className="form-input" value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ paddingLeft: 38 }} placeholder="your@email.edu" />
              </div>
            </div>

            {/* Phone */}
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Phone size={15} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="tel" className="form-input" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{ paddingLeft: 38 }} placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--card-border)', margin: '4px 0' }} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
              Change Password (optional)
            </div>

            {/* New Password */}
            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type={showPwd ? 'text' : 'password'} className="form-input"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  style={{ paddingLeft: 38, paddingRight: 38 }} placeholder="Leave blank to keep current" />
                <span onClick={() => setShowPwd(p => !p)}
                  style={{ position: 'absolute', right: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </span>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="password" className="form-input"
                  value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  style={{ paddingLeft: 38 }} placeholder="Repeat new password" />
              </div>
              {confirmPwd && newPassword && (
                <div style={{ fontSize: '0.72rem', marginTop: 4, color: newPassword === confirmPwd ? 'var(--emerald)' : 'var(--rose)' }}>
                  {newPassword === confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}>
              {saved
                ? <><CheckCircle size={15} /> Saved!</>
                : <><Save size={15} /> Save Changes</>
              }
            </button>
          </form>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Appearance */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
              <Palette size={18} /> Appearance
            </h3>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: 'Light', value: 'light', bg: '#f0f4ff', border: '#c7d2fe', text: '#0f172a' },
                { label: 'Dark',  value: 'dark',  bg: '#0c1120', border: '#6366f1', text: '#f1f5f9' }
              ].map(opt => (
                <div key={opt.value} onClick={() => setTheme(opt.value)}
                  style={{
                    flex: 1, padding: '14px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                    background: opt.bg, border: `2px solid ${theme === opt.value ? 'var(--primary)' : opt.border}`,
                    boxShadow: theme === opt.value ? '0 0 0 3px var(--primary-glow)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: opt.value === 'dark' ? '#6366f1' : '#4f46e5', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Palette size={16} color="#fff" />
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: opt.text }}>{opt.label}</div>
                  {theme === opt.value && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: 4, fontWeight: 700 }}>Active</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
              <Bell size={18} /> Notifications
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Boarding alerts',    value: notifBoarding, set: setNotifBoarding, color: 'var(--emerald)' },
                { label: 'Delay warnings',     value: notifDelay,    set: setNotifDelay,    color: 'var(--amber)'   },
                { label: 'Emergency SOS',      value: notifSOS,      set: setNotifSOS,      color: 'var(--rose)'    },
                { label: 'AI prediction updates', value: notifAI,   set: setNotifAI,       color: 'var(--cyan)'    }
              ].map((n, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 12px', borderRadius: 10, background: n.value ? `${n.color}10` : 'transparent', border: `1px solid ${n.value ? n.color + '30' : 'var(--card-border)'}`, transition: 'all 0.2s' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{n.label}</span>
                  <div onClick={() => n.set(v => !v)} style={{
                    width: 38, height: 20, borderRadius: 99,
                    background: n.value ? n.color : 'var(--bg-tertiary)',
                    position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                    border: `1px solid ${n.value ? n.color : 'var(--card-border)'}`
                  }}>
                    <div style={{
                      position: 'absolute', top: 2,
                      left: n.value ? 18 : 2,
                      width: 14, height: 14, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s ease',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </label>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 14, fontSize: '0.78rem' }}
              onClick={() => saveNotificationPrefs({
                boarding: notifBoarding,
                delay: notifDelay,
                sos: notifSOS,
                ai: notifAI
              })}>
              <Save size={14} /> Save Preferences
            </button>
          </div>

          {/* Account info */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 14 }}>
              <ShieldCheck size={18} /> Account Info
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'Role',        value: currentUser?.role?.charAt(0).toUpperCase() + currentUser?.role?.slice(1) },
                { label: 'Account ID',  value: `#${currentUser?.id}` },
                ...(currentUser?.studentId ? [{ label: 'Student ID', value: currentUser.studentId }] : []),
                { label: 'Status',      value: 'Active' },
              ].map((row, i) => (
                <div key={i} className="detail-row">
                  <span className="detail-label">{row.label}</span>
                  <span className="detail-value" style={{ color: row.label === 'Status' ? 'var(--emerald)' : undefined }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsView;
