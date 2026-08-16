import React, { useState, useContext } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { AppContext } from '../context/AppContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Shown automatically when currentUser.mustChangePassword === true.
 * Forces the user to set a new password before accessing any other view.
 */
const ChangePasswordView = () => {
  const { currentUser, setCurrentUser, triggerToast } = useContext(AppContext);

  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (next.length < 6) {
      triggerToast('New password must be at least 6 characters.', 'warning');
      return;
    }
    if (next !== confirm) {
      triggerToast('Passwords do not match.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/change_password`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();

      if (!res.ok) {
        triggerToast(data.message || 'Password change failed.', 'danger');
        setLoading(false);
        return;
      }

      // Clear the mustChangePassword flag in local session
      setCurrentUser(prev => ({ ...prev, mustChangePassword: false }));
      setDone(true);
      triggerToast('Password updated successfully!', 'success');
    } catch {
      triggerToast('Cannot reach server.', 'danger');
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh',
      }}>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle size={56} style={{ color: 'var(--emerald)', marginBottom: 16 }} />
          <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Password Updated</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            You can now access your dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh',
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 420 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            background: 'var(--amber-soft, #fef3c7)',
            width: 44, height: 44, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--amber, #f59e0b)',
          }}>
            <Lock size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>
              Change Your Password
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Your account requires a new password before you can continue.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Current password */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Current (Temporary) Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                required
                value={current}
                onChange={e => setCurrent(e.target.value)}
                placeholder="Enter your temporary password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">New Password</label>
            <input
              className="form-input"
              type={showPw ? 'text' : 'password'}
              required
              minLength={6}
              value={next}
              onChange={e => setNext(e.target.value)}
              placeholder="Min. 6 characters"
            />
          </div>

          {/* Confirm */}
          <div style={{ marginBottom: 22 }}>
            <label className="form-label">Confirm New Password</label>
            <input
              className="form-input"
              type={showPw ? 'text' : 'password'}
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
            />
            {confirm && next && confirm !== next && (
              <div style={{ fontSize: '0.75rem', color: 'var(--rose)', marginTop: 4 }}>
                Passwords do not match
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px' }}
            disabled={loading || (confirm && next && confirm !== next)}
          >
            {loading ? 'Updating…' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordView;

