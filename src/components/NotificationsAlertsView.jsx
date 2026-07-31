import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext, getStudentAlerts, getMyStudent } from '../context/AppContext';
import { Bell, Send, CheckCheck, Trash2, RefreshCw, Megaphone } from 'lucide-react';

const NotificationsAlertsView = ({ readOnly = false, studentOnly = false }) => {
  const {
    currentUser, alerts, setAlerts, triggerToast, students,
    readAlertIds, markAllAlertsRead, clearAllAlerts, dismissAlert,
    fetchMyNotifications, markAllNotificationsRead, broadcastNotification,
  } = useContext(AppContext);

  const [dbNotifs,      setDbNotifs]      = useState([]);
  const [dbLoading,     setDbLoading]     = useState(false);
  const [broadcastMsg,  setBroadcastMsg]  = useState('');
  const [targetGroup,   setTargetGroup]   = useState('all');
  const [alertType,     setAlertType]     = useState('info');
  const [sending,       setSending]       = useState(false);

  const isAdmin   = currentUser?.role === 'admin';
  const myStudent = (studentOnly || currentUser?.role === 'student')
    ? getMyStudent(students, currentUser)
    : null;

  // Load DB notifications for the current user
  const loadNotifications = async () => {
    if (!currentUser?.token) return;
    setDbLoading(true);
    const result = await fetchMyNotifications({ limit: 30 });
    setDbNotifs(result?.notifications || []);
    setDbLoading(false);
  };

  useEffect(() => {
    loadNotifications();
    markAllAlertsRead();
  }, [currentUser?.id]);

  // Poll for new notifications every 15 seconds while this view is open
  useEffect(() => {
    if (!currentUser?.token) return;
    const id = setInterval(async () => {
      const result = await fetchMyNotifications({ limit: 30 });
      if (result?.notifications) setDbNotifs(result.notifications);
    }, 15000);
    return () => clearInterval(id);
  }, [currentUser?.token]);

  // Merge DB notifications with local alerts (de-duplicate by id)
  const dbIds = new Set(dbNotifs.map(n => n._id));
  const localAlerts = useMemo(() => {
    const base = studentOnly || currentUser?.role === 'student'
      ? getStudentAlerts(alerts, myStudent)
      : alerts;
    return base.filter(a => !dbIds.has(a.id));
  }, [alerts, myStudent, studentOnly, dbIds]);

  const allNotifications = [
    ...dbNotifs.map(n => ({
      id:      n._id,
      message: n.message,
      type:    n.type,
      time:    new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead:  n.isRead,
      fromDB:  true,
    })),
    ...localAlerts.map(a => ({ ...a, fromDB: false })),
  ];

  const unreadCount = allNotifications.filter(n => !n.isRead && !readAlertIds.has(n.id)).length;

  const handleMarkAllRead = async () => {
    markAllAlertsRead();
    await markAllNotificationsRead();
    setDbNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    triggerToast('All notifications marked as read.', 'success');
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) { triggerToast('Message is required.', 'warning'); return; }
    setSending(true);

    // Persist to DB via API
    const ok = await broadcastNotification({
      message:       broadcastMsg,
      type:          alertType,
      recipientRole: targetGroup,
    });

    if (ok) {
      // Also show in local alerts feed
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setAlerts(prev => [{ id: Date.now(), message: `[Broadcast → ${targetGroup}]: ${broadcastMsg}`, type: alertType, time }, ...prev.slice(0, 19)]);
      setBroadcastMsg('');
    }
    setSending(false);
  };

  const colorMap = {
    danger:  { bg: 'var(--rose-soft)',    border: 'var(--rose)'    },
    warning: { bg: 'var(--amber-soft)',   border: 'var(--amber)'   },
    success: { bg: 'var(--emerald-soft)', border: 'var(--emerald)' },
    info:    { bg: 'var(--cyan-soft)',    border: 'var(--cyan)'    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Header stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Total',   value: allNotifications.length,  color: 'var(--primary)'  },
          { label: 'Unread',  value: unreadCount,              color: 'var(--rose)'     },
          { label: 'Today',   value: allNotifications.filter(n => {
              const today = new Date().toISOString().split('T')[0];
              return n.time && new Date().toLocaleDateString() === new Date().toLocaleDateString();
            }).length,                                          color: 'var(--emerald)'  },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: '14px 18px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.8px' }}>{s.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)', marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="two-col-grid">

        {/* ── Notification feed ── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title"><Bell size={18} /> Notifications</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }}
                onClick={loadNotifications} disabled={dbLoading}>
                <RefreshCw size={12} className={dbLoading ? 'animate-spin' : ''} />
              </button>
              <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }}
                onClick={handleMarkAllRead}>
                <CheckCheck size={12} /> Mark all read
              </button>
              {isAdmin && (
                <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem', color: 'var(--rose)' }}
                  onClick={clearAllAlerts}>
                  <Trash2 size={12} /> Clear local
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 480 }}>
            {allNotifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No notifications.
              </div>
            ) : (
              allNotifications.map(notif => {
                const c      = colorMap[notif.type] || colorMap.info;
                const isRead = notif.isRead || readAlertIds.has(notif.id);
                return (
                  <div key={notif.id} style={{
                    padding: '11px 14px', borderRadius: 12,
                    background: isRead ? 'var(--bg-tertiary)' : c.bg,
                    borderLeft: `3px solid ${c.border}`,
                    opacity: isRead ? 0.7 : 1,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    transition: 'opacity 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, flex: 1 }}>{notif.message}</span>
                      {!readOnly && !isRead && (
                        <button onClick={() => dismissAlert(notif.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}>
                          ✕
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{notif.time}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Broadcast panel (admin only) ── */}
        {isAdmin && !readOnly && (
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
              <Megaphone size={18} /> Broadcast Notification
            </h3>
            <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Recipient Group</label>
                <select className="form-input" value={targetGroup} onChange={e => setTargetGroup(e.target.value)}>
                  <option value="all">All Users</option>
                  <option value="student">Students Only</option>
                  <option value="driver">Drivers Only</option>
                  <option value="admin">Admins Only</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alert Type</label>
                <select className="form-input" value={alertType} onChange={e => setAlertType(e.target.value)}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="danger">Emergency</option>
                  <option value="success">Success</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Message *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Type broadcast message..."
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={sending}>
                <Send size={14} /> {sending ? 'Sending...' : 'Broadcast Now'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsAlertsView;
