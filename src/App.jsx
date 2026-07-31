import React, { useState, useContext, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { AppProvider, AppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// View Imports
import AuthView from './components/AuthView';
import DashboardView from './components/DashboardView';
import StudentDashboardView from './components/StudentDashboardView';
import DriverDashboardView from './components/DriverDashboardView';
import StudentManagementView from './components/StudentManagementView';
import StudentProfileView from './components/StudentProfileView';
import LiveTrackingView from './components/LiveTrackingView';
import PredictiveBoardingView from './components/PredictiveBoardingView';
import RouteOptimizationView from './components/RouteOptimizationView';
import BoardingPointView from './components/BoardingPointView';
import BusManagementView from './components/BusManagementView';
import DriverInterfaceView from './components/DriverInterfaceView';
import AttendanceVerificationView from './components/AttendanceVerificationView';
import RealTimeAnalyticsView from './components/RealTimeAnalyticsView';
import AIPredictionAnalyticsView from './components/AIPredictionAnalyticsView';
import NotificationsAlertsView from './components/NotificationsAlertsView';
import ReportsView from './components/ReportsView';
import AdminPanelView from './components/AdminPanelView';
import FeedbackView from './components/FeedbackView';
import EmergencyView from './components/EmergencyView';
import PredictionHistoryView from './components/PredictionHistoryView';
import SmartAllocationView from './components/SmartAllocationView';
import TrafficPredictionView from './components/TrafficPredictionView';
import FuelEfficiencyView from './components/FuelEfficiencyView';
import SettingsView from './components/SettingsView';

// Main content dispatcher
const AppContent = () => {
  const [currentView, setCurrentView] = useState('login');
  const { theme, currentUser, toasts, dismissToast } = useContext(AppContext);

  // Sync current theme class with body element
  useEffect(() => {
    const bodyClass = document.body.classList;
    if (theme === 'dark') {
      bodyClass.add('dark-mode');
    } else {
      bodyClass.remove('dark-mode');
    }
  }, [theme]);

  // Force redirection to login view if user session is empty
  // On login, redirect to the role's home
  useEffect(() => {
    if (!currentUser) {
      setCurrentView('login');
    } else if (currentView === 'login') {
      // Redirect to role home after login
      if (currentUser.role === 'student') setCurrentView('student-dashboard');
      else if (currentUser.role === 'driver') setCurrentView('driver-dashboard');
      else setCurrentView('dashboard');
    }
  }, [currentUser]);

  const renderActiveView = () => {
    // ── ADMIN: full access ──────────────────────────────────────
    switch (currentView) {
      case 'login':                 return <AuthView setCurrentView={setCurrentView} />;

      // Admin views
      case 'dashboard':             return <DashboardView setCurrentView={setCurrentView} />;
      case 'student-profile':       return <StudentProfileView setCurrentView={setCurrentView} />;
      case 'student-management':    return <StudentManagementView setCurrentView={setCurrentView} />;
      case 'live-tracking':         return <LiveTrackingView />;
      case 'predictive-boarding':   return <PredictiveBoardingView />;
      case 'route-optimization':    return <RouteOptimizationView />;
      case 'boarding-point-mgmt':   return <BoardingPointView />;
      case 'bus-mgmt':              return <BusManagementView />;
      case 'driver-interface':      return <DriverInterfaceView />;
      case 'attendance-verification': return <AttendanceVerificationView />;
      case 'realtime-analytics':    return <RealTimeAnalyticsView />;
      case 'ai-analytics':          return <AIPredictionAnalyticsView />;
      case 'notifications-alerts':  return <NotificationsAlertsView />;
      case 'feedback-review':       return <AdminPanelView initialTab="feedbacks" />;
      case 'reports':               return <ReportsView />;
      case 'admin-panel':           return <AdminPanelView />;
      case 'emergency-mgmt':        return <EmergencyView />;
      case 'prediction-history':    return <PredictionHistoryView />;
      case 'smart-allocation':      return <SmartAllocationView />;
      case 'traffic-prediction':    return <TrafficPredictionView />;
      case 'fuel-efficiency':       return <FuelEfficiencyView />;

      // ── STUDENT views ──────────────────────────────────────────
      case 'student-dashboard':           return <StudentDashboardView setCurrentView={setCurrentView} />;
      case 'student-live-tracking':       return <LiveTrackingView studentOnly />;
      case 'student-profile-view':        return <StudentProfileView myProfileOnly />;
      case 'student-boarding-prediction': return <PredictiveBoardingView studentOnly />;
      case 'student-history':             return <PredictionHistoryView studentOnly />;
      case 'student-notifications':       return <NotificationsAlertsView readOnly studentOnly />;
      case 'student-feedback':            return <FeedbackView studentOnly />;

      // ── DRIVER views ────────────────────────────────────────────
      case 'driver-dashboard':  return <DriverDashboardView setCurrentView={setCurrentView} />;
      case 'driver-interface':  return <DriverInterfaceView myBusOnly />;
      case 'driver-boarding':   return <AttendanceVerificationView />;
      case 'driver-tracking':   return <LiveTrackingView driverOnly />;
      case 'driver-emergency':  return <EmergencyView />;
      case 'driver-notifications': return <NotificationsAlertsView readOnly />;
      case 'driver-feedback':   return <FeedbackView />;
      case 'settings':          return <SettingsView setCurrentView={setCurrentView} />;

      default:                  return <AuthView setCurrentView={setCurrentView} />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main Content Area */}
      <div className="main-viewport">
        {/* Top Header bar */}
        <Header currentView={currentView} />

        {/* Selected Page View */}
        <div className="content-area">
          {renderActiveView()}
        </div>
      </div>

      {/* Global Toast Alert Overlay — auto-dismissing */}
      <div className="toast-container">
        {toasts.map(toast => {
          const icons = {
            success: <CheckCircle size={18} style={{ color: 'var(--emerald)', flexShrink: 0 }} />,
            warning: <AlertTriangle size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />,
            danger:  <XCircle size={18} style={{ color: 'var(--rose)', flexShrink: 0 }} />,
            info:    <Info size={18} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
          };
          const colors = {
            success: 'var(--emerald)',
            warning: 'var(--amber)',
            danger:  'var(--rose)',
            info:    'var(--cyan)'
          };
          return (
            <div key={toast.id} className={`toast toast-${toast.type === 'danger' ? 'danger' : toast.type === 'warning' ? 'warning' : toast.type === 'success' ? 'success' : 'info'} toast-animate`}>
              {icons[toast.type] || icons.info}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '2px', color: colors[toast.type] || colors.info, letterSpacing: '0.5px' }}>
                  {toast.type === 'danger' ? '🚨 Emergency' : toast.type === 'warning' ? '⚠ Warning' : toast.type === 'success' ? '✓ Success' : 'ℹ Info'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{toast.message}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '4px' }}>{toast.time}</div>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0, borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                title="Dismiss"
              >
                <X size={14} />
              </button>
              {/* Auto-dismiss progress bar */}
              <div className="toast-progress" style={{ '--toast-color': colors[toast.type] || colors.info }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
