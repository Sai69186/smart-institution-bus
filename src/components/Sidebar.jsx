import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import {
  LayoutDashboard, Lock, User, Users, Map, Brain, Compass,
  MapPin, Bus, UserCheck, Bell, FileText,
  Sliders, MessageSquare, History,
  TrendingUp, RefreshCw, BarChart2, ShieldAlert, Fuel, Zap,
  ChevronDown, ChevronUp, LogOut, Navigation, Activity,
  ClipboardList, QrCode, Settings, Building2
} from 'lucide-react';

// ─── NAV DEFINITIONS PER ROLE ───────────────────────────────────────────────

const SUPER_ADMIN_NAV = [
  {
    title: 'Platform',
    items: [
      { id: 'super-admin-dashboard', label: 'Institutions',   icon: Building2 },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'settings', label: 'My Settings', icon: Settings },
    ]
  }
];

const INSTITUTION_ADMIN_NAV = [
  {
    title: 'Management',
    items: [
      { id: 'institution-admin-dashboard', label: 'Fleet & Students', icon: Building2 },
      { id: 'dashboard',                   label: 'Overview Dashboard', icon: LayoutDashboard },
    ]
  },
  {
    title: 'Route & Fleet',
    items: [
      { id: 'route-optimization',  label: 'Route Optimization',  icon: Compass },
      { id: 'boarding-point-mgmt', label: 'Boarding Points',      icon: MapPin },
      { id: 'smart-allocation',    label: 'Smart Allocation',     icon: RefreshCw },
      { id: 'bus-mgmt',            label: 'Bus Management',       icon: Bus },
    ]
  },
  {
    title: 'Operations',
    items: [
      { id: 'live-tracking',        label: 'Live Tracking',         icon: Map },
      { id: 'student-management',   label: 'Students',              icon: Users },
      { id: 'attendance-verification', label: 'Attendance',         icon: UserCheck },
      { id: 'notifications-alerts', label: 'Notifications',         icon: Bell },
      { id: 'emergency-mgmt',       label: 'Emergency SOS',         icon: ShieldAlert },
      { id: 'reports',              label: 'Reports',               icon: FileText },
      { id: 'feedback-review',      label: 'Feedback',              icon: MessageSquare },
      { id: 'admin-panel',          label: 'Admin Panel',           icon: Sliders },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'settings', label: 'My Settings', icon: Settings },
    ]
  }
];

const ADMIN_NAV = [
  {
    title: 'Dashboards',
    items: [
      { id: 'dashboard',              label: 'Overview Dashboard',       icon: LayoutDashboard },
    ]
  },
  {
    title: 'Students & Tracking',
    items: [
      { id: 'student-management',     label: 'Student Management',       icon: Users },
      { id: 'live-tracking',          label: 'Live Fleet Tracking',      icon: Map },
    ]
  },
  {
    title: 'AI Predictions',
    items: [
      { id: 'predictive-boarding',    label: 'Boarding Estimation',      icon: Brain },
      { id: 'ai-analytics',           label: 'AI Analytics',             icon: BarChart2 },
      { id: 'prediction-history',     label: 'Prediction History',       icon: History },
      { id: 'traffic-prediction',     label: 'Traffic Prediction',       icon: Zap },
    ]
  },
  {
    title: 'Route & Fleet',
    items: [
      { id: 'route-optimization',     label: 'Route Optimization',       icon: Compass },
      { id: 'boarding-point-mgmt',    label: 'Boarding Point Mgmt',      icon: MapPin },
      { id: 'bus-mgmt',               label: 'Bus Management',           icon: Bus },
      { id: 'smart-allocation',       label: 'Smart Allocation',         icon: RefreshCw },
      { id: 'fuel-efficiency',        label: 'Fuel Efficiency',          icon: Fuel },
    ]
  },
  {
    title: 'Administration',
    items: [
      { id: 'realtime-analytics',     label: 'Real-Time Analytics',      icon: Activity },
      { id: 'notifications-alerts',   label: 'Notifications & Alerts',   icon: Bell },
      { id: 'feedback-review',        label: 'Feedback & Complaints',    icon: MessageSquare },
      { id: 'reports',                label: 'Reports Portal',            icon: FileText },
      { id: 'admin-panel',            label: 'Admin Control Panel',      icon: Sliders },
      { id: 'emergency-mgmt',         label: 'Emergency SOS Mgmt',       icon: ShieldAlert },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'settings',               label: 'My Settings',              icon: Settings },
    ]
  }
];

const STUDENT_NAV = [
  {
    title: 'My Dashboard',
    items: [
      { id: 'student-dashboard',          label: 'My Home',                  icon: LayoutDashboard },
    ]
  },
  {
    title: 'My Bus',
    items: [
      { id: 'student-live-tracking',      label: 'Live Bus Tracker',         icon: Navigation },
    ]
  },
  {
    title: 'My Profile',
    items: [
      { id: 'student-profile-view',       label: 'My Profile & Info',        icon: User },
      { id: 'student-boarding-prediction',label: 'My Boarding Prediction',   icon: Brain },
      { id: 'student-history',            label: 'My Boarding History',      icon: History },
    ]
  },
  {
    title: 'Communication',
    items: [
      { id: 'student-notifications',      label: 'Notifications',            icon: Bell },
      { id: 'student-feedback',           label: 'Feedback & Complaints',    icon: MessageSquare },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'settings',                   label: 'My Settings',              icon: Settings },
    ]
  }
];

const DRIVER_NAV = [
  {
    title: 'My Dashboard',
    items: [
      { id: 'driver-dashboard',       label: 'Driver Home',              icon: LayoutDashboard },
    ]
  },
  {
    title: 'Operations',
    items: [
      { id: 'driver-interface',       label: 'Stop Checklist',           icon: ClipboardList },
      { id: 'driver-boarding',        label: 'Board Students (Scan)',    icon: QrCode },
      { id: 'driver-tracking',        label: 'My Route Map',             icon: Navigation },
    ]
  },
  {
    title: 'Safety',
    items: [
      { id: 'driver-emergency',       label: 'Emergency SOS',            icon: ShieldAlert },
    ]
  },
  {
    title: 'Communication',
    items: [
      { id: 'driver-notifications',   label: 'Notifications',            icon: Bell },
      { id: 'driver-feedback',        label: 'Submit Feedback',          icon: MessageSquare },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'settings',               label: 'My Settings',              icon: Settings },
    ]
  }
];

// ─── SIDEBAR COMPONENT ───────────────────────────────────────────────────────

const Sidebar = ({ currentView, setCurrentView }) => {
  const { currentUser, setCurrentUser, sosActive } = useContext(AppContext);

  const role = currentUser?.role || 'guest';
  const navConfig =
    role === 'super_admin'        ? SUPER_ADMIN_NAV :
    role === 'admin'              ? ADMIN_NAV :
    role === 'institution_admin'  ? INSTITUTION_ADMIN_NAV :
    role === 'student'            ? STUDENT_NAV :
    role === 'driver'             ? DRIVER_NAV :
    [];

  const [collapsed, setCollapsed] = useState({});
  const toggle = (title) => setCollapsed(prev => ({ ...prev, [title]: !prev[title] }));

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
  };

  const roleMeta = {
    super_admin:       { label: 'Super Admin',        color: 'var(--rose)',    bg: 'var(--rose-soft, #fee2e2)'    },
    admin:             { label: 'Super Admin',         color: 'var(--rose)',    bg: 'var(--rose-soft, #fee2e2)'    },
    institution_admin: { label: 'Institution Admin',  color: 'var(--violet)',  bg: 'var(--violet-soft, #ede9fe)'  },
    student:           { label: 'Student',            color: 'var(--cyan)',    bg: 'var(--cyan-soft)'             },
    driver:            { label: 'Driver',             color: 'var(--emerald)', bg: 'var(--emerald-soft)'          },
    guest:             { label: 'Guest',              color: 'var(--text-muted)', bg: 'transparent'              },
  };
  const meta = roleMeta[role] || roleMeta.guest;

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          background: `linear-gradient(135deg, ${meta.color} 0%, var(--violet) 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 6px 18px ${meta.bg}`,
          transition: 'transform 0.2s ease',
        }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08) rotate(-5deg)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
        >
          <Bus size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-logo-text">Campus Transit AI</div>
          {currentUser && (
            <div style={{
              fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '1px', color: meta.color, marginTop: '2px'
            }}>
              {meta.label} Portal
            </div>
          )}
        </div>
        {sosActive && (
          <span className="pulse-red" style={{ width: 10, height: 10, flexShrink: 0 }} />
        )}
      </div>

      {/* Login link if not logged in */}
      {!currentUser && (
        <nav className="sidebar-nav">
          <div className="nav-category">
            <div className="nav-category-items">
              <div
                className={`nav-item ${currentView === 'login' ? 'active' : ''}`}
                onClick={() => setCurrentView('login')}
              >
                <Lock size={16} />
                <span>Login & Authentication</span>
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Role-specific nav */}
      {currentUser && (
        <nav className="sidebar-nav">
          {navConfig.map(section => (
            <div key={section.title} className="nav-category">
              <div
                className="nav-category-header"
                onClick={() => toggle(section.title)}
              >
                <span>{section.title}</span>
                {collapsed[section.title] ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </div>

              {!collapsed[section.title] && (
                <div className="nav-category-items">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => setCurrentView(item.id)}
                      >
                        <Icon size={15} />
                        <span>{item.label}</span>
                        {/* SOS badge on emergency items */}
                        {sosActive && (item.id === 'emergency-mgmt' || item.id === 'driver-emergency') && (
                          <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--rose)', flexShrink: 0 }} className="pulse-red" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* User info + Logout */}
      {currentUser && (
        <div style={{ padding: '14px 14px', borderTop: '1px solid var(--card-border)', background: `linear-gradient(135deg, ${meta.bg} 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${meta.color}, var(--violet))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.9rem', boxShadow: `0 4px 12px ${meta.bg}` }}>
              {currentUser.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div style={{ fontSize: '0.62rem', color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{meta.label}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: '7px 10px', fontSize: '0.74rem', border: `1px solid ${meta.color}33`, color: meta.color, borderRadius: 10 }}
              onClick={() => setCurrentView('settings')}
            >
              <Settings size={13} /> Settings
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: '7px 10px', fontSize: '0.74rem', border: '1px solid var(--rose-glow)', color: 'var(--rose)', borderRadius: 10 }}
              onClick={handleLogout}
            >
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
