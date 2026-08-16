import React, { useState, useContext, useEffect, Suspense, lazy } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { AppProvider, AppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';

// ── Eager imports — always needed on first render ─────────────────────────────
import AuthView from './components/AuthView';

// ── Lazy imports — code-split per view, loaded on first navigation ────────────
// Each lazy() call creates a separate JS chunk in the build.
const DashboardView             = lazy(() => import('./components/DashboardView'));
const StudentDashboardView      = lazy(() => import('./components/StudentDashboardView'));
const DriverDashboardView       = lazy(() => import('./components/DriverDashboardView'));
const StudentManagementView     = lazy(() => import('./components/StudentManagementView'));
const StudentProfileView        = lazy(() => import('./components/StudentProfileView'));
const LiveTrackingView          = lazy(() => import('./components/LiveTrackingView'));
const PredictiveBoardingView    = lazy(() => import('./components/PredictiveBoardingView'));
const RouteOptimizationView     = lazy(() => import('./components/RouteOptimizationView'));
const BoardingPointView         = lazy(() => import('./components/BoardingPointView'));
const BusManagementView         = lazy(() => import('./components/BusManagementView'));
const DriverInterfaceView       = lazy(() => import('./components/DriverInterfaceView'));
const AttendanceVerificationView= lazy(() => import('./components/AttendanceVerificationView'));
const RealTimeAnalyticsView     = lazy(() => import('./components/RealTimeAnalyticsView'));
const AIPredictionAnalyticsView = lazy(() => import('./components/AIPredictionAnalyticsView'));
const NotificationsAlertsView   = lazy(() => import('./components/NotificationsAlertsView'));
const ReportsView               = lazy(() => import('./components/ReportsView'));
const AdminPanelView            = lazy(() => import('./components/AdminPanelView'));
const FeedbackView              = lazy(() => import('./components/FeedbackView'));
const EmergencyView             = lazy(() => import('./components/EmergencyView'));
const PredictionHistoryView     = lazy(() => import('./components/PredictionHistoryView'));
const SmartAllocationView       = lazy(() => import('./components/SmartAllocationView'));
const TrafficPredictionView     = lazy(() => import('./components/TrafficPredictionView'));
const FuelEfficiencyView        = lazy(() => import('./components/FuelEfficiencyView'));
const SettingsView              = lazy(() => import('./components/SettingsView'));
const SuperAdminDashboard       = lazy(() => import('./components/SuperAdminDashboard'));
const InstitutionAdminDashboard = lazy(() => import('./components/InstitutionAdminDashboard'));
const ChangePasswordView        = lazy(() => import('./components/ChangePasswordView'));

// Minimal inline fallback shown while a lazy chunk is loading
const ViewLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '60vh', flexDirection: 'column', gap: 12,
    color: 'var(--text-muted)',
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      border: '3px solid var(--primary)',
      borderTopColor: 'transparent',
      animation: 'spin 0.7s linear infinite',
    }} />
    <span style={{ fontSize: '0.82rem' }}>Loading...</span>
  </div>
);

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
      if (currentUser.role === 'super_admin')             setCurrentView('super-admin-dashboard');
      else if (currentUser.role === 'admin')             setCurrentView('dashboard');
      else if (currentUser.role === 'institution_admin') setCurrentView('institution-admin-dashboard');
      else if (currentUser.role === 'student')          setCurrentView('student-dashboard');
      else if (currentUser.role === 'driver')           setCurrentView('driver-dashboard');
      else                                               setCurrentView('dashboard');
    }
  }, [currentUser]);

  const renderActiveView = () => {
    // ── Force password change if flagged (e.g. institution_admin first login) ──
    if (currentUser && currentUser.mustChangePassword && currentView !== 'login') {
      return <ChangePasswordView />;
    }

    const role = currentUser?.role;

    // ── Role guard helper — redirects unauthorised access back to role home ──
    const guard = (allowedRoles, fallbackView = null) => {
      if (!currentUser) { setCurrentView('login'); return true; }
      if (!allowedRoles.includes(role)) {
        const home = role === 'super_admin'       ? 'super-admin-dashboard'
                   : role === 'institution_admin' ? 'institution-admin-dashboard'
                   : role === 'admin'             ? 'dashboard'
                   : role === 'student'           ? 'student-dashboard'
                   : role === 'driver'            ? 'driver-dashboard'
                   : 'login';
        setCurrentView(fallbackView || home);
        return true;  // blocked
      }
      return false;   // allowed
    };

    const ADMIN_ROLES   = ['super_admin', 'institution_admin', 'admin'];
    const SUPER_ONLY    = ['super_admin'];
    const INST_ADMIN    = ['institution_admin'];
    const DRIVER_ROLES  = ['driver'];
    const STUDENT_ROLES = ['student'];
    const ALL_AUTH      = ['super_admin', 'institution_admin', 'admin', 'student', 'driver'];

    switch (currentView) {
      case 'login':                 return <AuthView setCurrentView={setCurrentView} />;

      // ── SUPER ADMIN views ──────────────────────────────────────
      case 'super-admin-dashboard':
        if (guard(SUPER_ONLY)) return null;
        return <SuperAdminDashboard setCurrentView={setCurrentView} />;

      // ── INSTITUTION ADMIN views ────────────────────────────────
      case 'institution-admin-dashboard':
        if (guard(INST_ADMIN)) return null;
        return <InstitutionAdminDashboard setCurrentView={setCurrentView} />;

      // ── ADMIN views ────────────────────────────────────────────
      case 'dashboard':
        if (guard(ADMIN_ROLES)) return null;
        return <DashboardView setCurrentView={setCurrentView} />;
      case 'student-profile':
        if (guard(ADMIN_ROLES)) return null;
        return <StudentProfileView setCurrentView={setCurrentView} />;
      case 'student-management':
        if (guard(ADMIN_ROLES)) return null;
        return <StudentManagementView setCurrentView={setCurrentView} />;
      case 'live-tracking':
        if (guard(ADMIN_ROLES)) return null;
        return <LiveTrackingView />;
      case 'predictive-boarding':
        if (guard(ADMIN_ROLES)) return null;
        return <PredictiveBoardingView />;
      case 'route-optimization':
        if (guard(ADMIN_ROLES)) return null;
        return <RouteOptimizationView />;
      case 'boarding-point-mgmt':
        if (guard(ADMIN_ROLES)) return null;
        return <BoardingPointView />;
      case 'bus-mgmt':
        if (guard(ADMIN_ROLES)) return null;
        return <BusManagementView />;
      case 'driver-ops':
        if (guard(ADMIN_ROLES)) return null;
        return <DriverInterfaceView />;
      case 'attendance-verification':
        if (guard(ADMIN_ROLES)) return null;
        return <AttendanceVerificationView />;
      case 'realtime-analytics':
        if (guard(ADMIN_ROLES)) return null;
        return <RealTimeAnalyticsView />;
      case 'ai-analytics':
        if (guard(ADMIN_ROLES)) return null;
        return <AIPredictionAnalyticsView />;
      case 'notifications-alerts':
        if (guard(ADMIN_ROLES)) return null;
        return <NotificationsAlertsView />;
      case 'feedback-review':
        if (guard(ADMIN_ROLES)) return null;
        return <AdminPanelView initialTab="feedbacks" />;
      case 'reports':
        if (guard(ADMIN_ROLES)) return null;
        return <ReportsView />;
      case 'admin-panel':
        if (guard(ADMIN_ROLES)) return null;
        return <AdminPanelView />;
      case 'emergency-mgmt':
        if (guard(ADMIN_ROLES)) return null;
        return <EmergencyView />;
      case 'prediction-history':
        if (guard(ADMIN_ROLES)) return null;
        return <PredictionHistoryView />;
      case 'smart-allocation':
        if (guard(ADMIN_ROLES)) return null;
        return <SmartAllocationView />;
      case 'traffic-prediction':
        if (guard(ADMIN_ROLES)) return null;
        return <TrafficPredictionView />;
      case 'fuel-efficiency':
        if (guard(ADMIN_ROLES)) return null;
        return <FuelEfficiencyView />;

      // ── STUDENT views ──────────────────────────────────────────
      case 'student-dashboard':
        if (guard(STUDENT_ROLES)) return null;
        return <StudentDashboardView setCurrentView={setCurrentView} />;
      case 'student-live-tracking':
        if (guard(STUDENT_ROLES)) return null;
        return <LiveTrackingView studentOnly />;
      case 'student-profile-view':
        if (guard(STUDENT_ROLES)) return null;
        return <StudentProfileView myProfileOnly />;
      case 'student-boarding-prediction':
        if (guard(STUDENT_ROLES)) return null;
        return <PredictiveBoardingView studentOnly />;
      case 'student-history':
        if (guard(STUDENT_ROLES)) return null;
        return <PredictionHistoryView studentOnly />;
      case 'student-notifications':
        if (guard(STUDENT_ROLES)) return null;
        return <NotificationsAlertsView readOnly studentOnly />;
      case 'student-feedback':
        if (guard(STUDENT_ROLES)) return null;
        return <FeedbackView studentOnly />;

      // ── DRIVER views ────────────────────────────────────────────
      case 'driver-dashboard':
        if (guard(DRIVER_ROLES)) return null;
        return <DriverDashboardView setCurrentView={setCurrentView} />;
      case 'driver-interface':
        if (guard(DRIVER_ROLES)) return null;
        return <DriverInterfaceView myBusOnly />;
      case 'driver-boarding':
        if (guard(DRIVER_ROLES)) return null;
        return <AttendanceVerificationView />;
      case 'driver-tracking':
        if (guard(DRIVER_ROLES)) return null;
        return <LiveTrackingView driverOnly />;
      case 'driver-emergency':
        if (guard(DRIVER_ROLES)) return null;
        return <EmergencyView />;
      case 'driver-notifications':
        if (guard(DRIVER_ROLES)) return null;
        return <NotificationsAlertsView readOnly />;
      case 'driver-feedback':
        if (guard(DRIVER_ROLES)) return null;
        return <FeedbackView />;

      // ── SHARED views (all authenticated roles) ─────────────────
      case 'settings':
        if (guard(ALL_AUTH)) return null;
        return <SettingsView setCurrentView={setCurrentView} />;

      default:
        return <AuthView setCurrentView={setCurrentView} />;
    }
  };

  return (
    <div className="app-container">
      {/* Offline / back-online banner — fixed top */}
      <OfflineBanner />

      {/* Sidebar Navigation */}
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main Content Area */}
      <div className="main-viewport">
        {/* Top Header bar */}
        <Header currentView={currentView} />

        {/* Selected Page View */}
        <div className="content-area">
          <ErrorBoundary key={currentView}>
            <Suspense fallback={<ViewLoader />}>
              {renderActiveView()}
            </Suspense>
          </ErrorBoundary>
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
