import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { 
  Bell, Sun, CloudRain, CloudSnow, Moon, ShieldAlert, 
  Settings2, User, ChevronDown, CheckSquare, Calendar, CloudLightning
} from 'lucide-react';

const Header = ({ currentView }) => {
  const { 
    currentUser, setCurrentUser, theme, setTheme, 
    weather, setWeather, weatherSource, academicPeriod, setAcademicPeriod,
    alerts, sosActive, triggerSOS, triggerToast,
    students, getStudentAlerts,
    readAlertIds, markAllAlertsRead,
    socketConnected
  } = useContext(AppContext);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const isStudent = currentUser?.role === 'student';
  const myStudent = isStudent
    ? students.find(s =>
        s.studentId === currentUser?.studentId ||
        s.email     === currentUser?.email
      )
    : null;
  const headerAlerts = isStudent ? getStudentAlerts(alerts, myStudent) : alerts;
  const unreadCount  = headerAlerts.filter(a => !readAlertIds.has(a.id)).length;

  const getPageTitle = () => {
    const titleMap = {
      'login':                      'Login & Authentication',
      // Admin
      'dashboard':                  'Operational Overview Dashboard',
      'student-management':         'Student Management',
      'live-tracking':              'Real-Time GPS Fleet Tracking',
      'predictive-boarding':        'Predictive Student Boarding Estimation',
      'route-optimization':         'AI Dynamic Route Optimization',
      'boarding-point-mgmt':        'Boarding Point & Stop Allocation',
      'bus-mgmt':                   'Fleet & Bus Management',
      'driver-ops':                 'Driver Operations — Admin View',
      'attendance-verification':    'Verification Gate (RFID / QR)',
      'realtime-analytics':         'Real-Time Utilization Analytics',
      'ai-analytics':               'AI Prediction Model Evaluation',
      'notifications-alerts':       'Notification & Broadcast Logs',
      'reports':                    'Administrative Reports & Exports',
      'admin-panel':                'System Control & Parameters',
      'feedback-complaint':         'Feedback & Services Complaint Logs',
      'emergency-mgmt':             'SOS Dispatch & Emergency Control',
      'prediction-history':         'Historical Prediction Records',
      'demand-forecasting':         'Capacity Demand Forecasting',
      'smart-allocation':           'Smart Fleet Routing Allocation',
      'traffic-prediction':         'Predictive Traffic Heatmaps',
      'fuel-efficiency':            'Fuel Consumption Analytics',
      // Super Admin portal
      'super-admin-dashboard':      'Platform — Institutions Overview',
      // Institution Admin portal
      'institution-admin-dashboard':'Institution Management',
      // Student portal
      'student-dashboard':          'My Transit Dashboard',
      'student-live-tracking':      'My Bus — Live Tracker',
      'student-profile-view':       'My Profile & Transit Info',
      'student-boarding-prediction':'My AI Boarding Prediction',
      'student-history':            'My Boarding History',
      'student-notifications':      'My Notifications',
      'student-feedback':           'Submit Feedback',
      // Driver portal
      'driver-dashboard':           'Driver Home Dashboard',
      'driver-interface':           'Stop Checklist & Operations',
      'driver-boarding':            'Board Students — Scan',
      'driver-tracking':            'My Route Map',
      'driver-emergency':           'Emergency SOS Panel',
      'driver-notifications':       'My Notifications',
      'driver-feedback':            'Submit Feedback',
      'settings':                   'My Account Settings',
    };
    return titleMap[currentView] || 'Campus Transit AI';
  };

  const handleSosClick = () => {
    if (sosActive) {
      triggerToast("An active SOS emergency is already being dispatched.", "warning");
    } else {
      const reason = prompt("Enter emergency description (e.g. Engine Breakdown, Route Blockage, Accident):", "Mechanical Breakdown");
      if (reason) {
        triggerSOS(1, reason); // Simulate SOS for Bus 101
      }
    }
  };

  const cycleWeather = () => {
    const conditions = ['Sunny', 'Rainy', 'Foggy'];
    const nextIdx = (conditions.indexOf(weather) + 1) % conditions.length;
    setWeather(conditions[nextIdx]);
    triggerToast(`Weather condition updated to ${conditions[nextIdx]}. AI predictions recalculated!`, 'info');
  };

  const cycleAcademic = () => {
    const periods = ['Regular Semester', 'Exam Week', 'Holidays'];
    const nextIdx = (periods.indexOf(academicPeriod) + 1) % periods.length;
    setAcademicPeriod(periods[nextIdx]);
    triggerToast(`Schedule context changed to ${periods[nextIdx]}. Boarding loads adjusted!`, 'info');
  };

  return (
    <header className="main-header">
      <div className="header-left">
        <h1 className="header-title" style={{
          background: 'linear-gradient(90deg, var(--text-primary) 0%, var(--primary) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
        }}>{getPageTitle()}</h1>
      </div>

      <div className="header-right">
        {/* Environment Factors Toggles */}
        {currentUser && !isStudent && (
          <>
            {/* Weather — admins can toggle manually, driver sees auto-detected read-only */}
            {['admin', 'super_admin', 'institution_admin'].includes(currentUser.role) ? (
              <div className="theme-pill" onClick={cycleWeather} title="Toggle Weather — affects AI predictions">
                {weather === 'Sunny' && <Sun size={14} className="text-amber" />}
                {weather === 'Rainy' && <CloudRain size={14} className="text-cyan" />}
                {weather === 'Foggy' && <CloudLightning size={14} className="text-primary" />}
                <span style={{ fontSize: '0.75rem' }}>{weather}</span>
              </div>
            ) : (
              /* Driver: read-only auto weather */
              <div className="theme-pill" style={{ cursor: 'default', opacity: 0.9 }}
                title={weatherSource === 'gps' ? 'Auto-detected from your GPS location' : 'Weather updates automatically when GPS is active'}>
                {weather === 'Sunny' && <Sun size={14} className="text-amber" />}
                {weather === 'Rainy' && <CloudRain size={14} className="text-cyan" />}
                {weather === 'Foggy' && <CloudLightning size={14} className="text-primary" />}
                <span style={{ fontSize: '0.75rem' }}>{weather}</span>
                <span style={{ fontSize: '0.58rem', color: weatherSource === 'gps' ? 'var(--emerald)' : 'var(--text-muted)', fontWeight: 700, marginLeft: 2 }}>
                  {weatherSource === 'gps' ? '📡' : '—'}
                </span>
              </div>
            )}

            <div className="theme-pill" onClick={cycleAcademic} title="Toggle Academic Calendar (Affects AI demand)">
              <Calendar size={14} className="text-emerald" />
              <span style={{ fontSize: '0.75rem' }}>{academicPeriod}</span>
            </div>

            {/* Emergency SOS Button */}
            <button 
              className={`btn ${sosActive ? 'btn-rose' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', border: '1px solid var(--rose)' }}
              onClick={handleSosClick}
            >
              <ShieldAlert size={14} className={sosActive ? 'animate-pulse' : 'text-rose'} />
              <span>SOS Panic</span>
            </button>
          </>
        )}

        {currentUser && isStudent && (
          <div className="theme-pill" title="Current weather affecting your bus ETA">
            {weather === 'Sunny' && <Sun size={14} className="text-amber" />}
            {weather === 'Rainy' && <CloudRain size={14} className="text-cyan" />}
            {weather === 'Foggy' && <CloudLightning size={14} className="text-primary" />}
            <span style={{ fontSize: '0.75rem' }}>{weather}</span>
          </div>
        )}

        {/* Real-time connection status dot */}
        {currentUser && (
          <div
            title={socketConnected ? 'Real-time connected' : 'Real-time disconnected — using fallback polling'}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
              borderRadius: '12px', background: 'var(--surface-2)', fontSize: '0.68rem',
              color: socketConnected ? 'var(--emerald)' : 'var(--rose)', fontWeight: 600,
              cursor: 'default', userSelect: 'none' }}
          >
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: socketConnected ? 'var(--emerald)' : 'var(--rose)',
              display: 'inline-block',
              boxShadow: socketConnected ? '0 0 6px var(--emerald)' : '0 0 6px var(--rose)',
              animation: socketConnected ? 'pulse 2s infinite' : 'none'
            }} />
            {socketConnected ? 'Live' : 'Offline'}
          </div>
        )}

        {/* Theme Toggle */}
        <div 
          className="theme-pill" 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Light/Dark Theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </div>

        {/* Notifications Icon & Panel */}
        {currentUser && (
          <div style={{ position: 'relative' }}>
            <div 
              className="theme-pill"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserDropdown(false);
                // Mark all as read when opening the panel
                if (!showNotifications) markAllAlertsRead();
              }}
              style={{ position: 'relative' }}
            >
              <Bell size={14} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'var(--rose)', color: 'white',
                  borderRadius: '50%', width: '17px', height: '17px',
                  fontSize: '0.62rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 'bold'
                }}>
                  {unreadCount}
                </span>
              )}
            </div>

            {showNotifications && (
              <div className="notification-panel" style={{
                position: 'fixed',
                top: 'var(--header-height)',
                right: '16px',
                zIndex: 9999,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                    🔔 Dispatch Alerts
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.7rem', background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '99px', fontWeight: 700 }}>
                      {headerAlerts.length}
                    </span>
                    <span
                      style={{ fontSize: '0.75rem', color: 'var(--rose)', cursor: 'pointer', fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--rose-glow)' }}
                      onClick={() => setShowNotifications(false)}
                    >
                      ✕
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {headerAlerts.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                      No active notifications.
                    </div>
                  ) : (
                    headerAlerts.slice(0, 6).map(alert => {
                      const colorMap = {
                        danger:  { bg: 'var(--rose-soft)',    border: 'var(--rose)'    },
                        warning: { bg: 'var(--amber-soft)',   border: 'var(--amber)'   },
                        success: { bg: 'var(--emerald-soft)', border: 'var(--emerald)' },
                        info:    { bg: 'var(--cyan-soft)',    border: 'var(--cyan)'    },
                      };
                      const c = colorMap[alert.type] || colorMap.info;
                      const isRead = readAlertIds.has(alert.id);
                      return (
                        <div key={alert.id} style={{
                          fontSize: '0.78rem',
                          padding: '10px 12px',
                          borderRadius: '11px',
                          background: isRead ? 'var(--bg-tertiary)' : c.bg,
                          borderLeft: `3px solid ${c.border}`,
                          opacity: isRead ? 0.65 : 1,
                          transition: 'opacity 0.2s ease',
                        }}>
                          <div style={{ fontWeight: isRead ? 400 : 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                            {alert.message}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.64rem', marginTop: '4px' }}>
                            {alert.time}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User profile dropdown */}
        {currentUser ? (
          <div style={{ position: 'relative' }}>
            <div 
              className="profile-pill"
              onClick={() => {
                setShowUserDropdown(!showUserDropdown);
                setShowNotifications(false);
              }}
            >
              <div className="profile-avatar">
                {currentUser.name.charAt(0)}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{currentUser.name}</span>
              <ChevronDown size={12} className="text-secondary" />
            </div>

            {showUserDropdown && (
              <div className="user-dropdown" style={{
                position: 'fixed',
                top: 'var(--header-height)',
                right: '16px',
                zIndex: 9999,
              }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '6px 12px', borderBottom: '1px solid var(--card-border)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.6px' }}>
                  Role: {currentUser.role}
                </div>
                <div 
                  className="nav-item" 
                  style={{ padding: '10px 12px', fontSize: '0.82rem', marginTop: '4px', borderRadius: '10px' }}
                  onClick={() => { setCurrentUser(null); setShowUserDropdown(false); }}
                >
                  <User size={14} />
                  <span>Sign Out</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>System Locked</span>
        )}
      </div>
    </header>
  );
};

export default Header;
