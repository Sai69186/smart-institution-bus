import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { 
  Bus, Users, AlertTriangle, Play, CheckCircle, Flame, ArrowRight
} from 'lucide-react';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler 
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
);

const DashboardView = ({ setCurrentView }) => {
  const { buses, students, alerts, weather, academicPeriod, fetchOccupancyTrend, fetchAttendanceStats } = useContext(AppContext);

  const [chartData,    setChartData]    = useState({ labels: ['07:00 AM','07:15 AM','07:30 AM','07:45 AM','08:00 AM','08:15 AM','08:30 AM'], actual: [0,0,0,0,0,0,0], predicted: [15,30,52,78,65,34,12] });
  const [liveStats,    setLiveStats]    = useState(null);

  useEffect(() => {
    const load = async () => {
      const [trend, stats] = await Promise.all([
        fetchOccupancyTrend(),
        fetchAttendanceStats(),
      ]);
      if (trend) setChartData({ labels: trend.labels, actual: trend.actual, predicted: trend.predicted });
      if (stats) setLiveStats(stats);
    };
    load();
  }, []);

  // Compute live stats from context buses
  const activeBuses  = buses.filter(b => b.status === 'On Route' || b.status === 'Delayed').length;
  const delayedBuses = buses.filter(b => b.status === 'Delayed').length;
  let totalCapacity = 0, totalOccupied = 0;
  buses.forEach(b => {
    if (b.status === 'On Route' || b.status === 'Delayed') {
      totalCapacity += b.capacity;
      totalOccupied += b.occupied;
    }
  });
  const occupancyPercent = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  // Use live DB counts if available, else fallback to context state
  const boardedCount     = liveStats?.totals?.boarded    ?? students.filter(s => s.attendanceStatus === 'Boarded').length;
  const predictedBoarding = liveStats?.totals?.totalStudents ?? students.length;

  const hourlyData = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'Predicted Boarding (AI Models)',
        data: chartData.predicted,
        fill: true,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.05)',
        tension: 0.4,
        borderWidth: 2,
      },
      {
        label: 'Actual Boarded (Scans)',
        data: chartData.actual,
        fill: true,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
        tension: 0.4,
        borderWidth: 2,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
      },
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Hero Banner ── */}
      <div className="page-hero page-hero-admin">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--primary), var(--violet))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px var(--primary-glow)'
          }}>
            <Flame size={26} color="#fff" className="animate-pulse" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--primary)', marginBottom: 4 }}>
              AI Optimization Active
            </div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              Operational Overview Dashboard
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Weather: <strong style={{ color: 'var(--cyan)' }}>{weather}</strong> &nbsp;·&nbsp;
              Period: <strong style={{ color: 'var(--primary)' }}>{academicPeriod}</strong> &nbsp;·&nbsp;
              Wait times dynamically minimized
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '10px 20px', fontSize: '0.82rem', flexShrink: 0, position: 'relative', zIndex: 1 }}
          onClick={() => setCurrentView('predictive-boarding')}
        >
          <span>Model Settings</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Grid of four Stats Widgets */}
      <div className="dashboard-grid">
        
        <div className="glass-card stats-card featured" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="stats-info">
            <h4>Active Buses</h4>
            <h2 style={{ color: 'var(--primary)' }}>{activeBuses} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {buses.length}</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>🚌 Fleet on road now</div>
          </div>
          <div className="stats-icon primary-light">
            <Bus size={24} />
          </div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--cyan)' }}>
          <div className="stats-info">
            <h4>Fleet Occupancy</h4>
            <h2 style={{ color: 'var(--cyan)' }}>{occupancyPercent}<span style={{ fontSize: '1.2rem' }}>%</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>👥 {totalOccupied} / {totalCapacity} seats</div>
          </div>
          <div className="stats-icon cyan-light">
            <Users size={24} />
          </div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--emerald)' }}>
          <div className="stats-info">
            <h4>AI Boarded</h4>
            <h2 style={{ color: 'var(--emerald)' }}>{boardedCount} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {predictedBoarding}</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>✅ Prediction accuracy live</div>
          </div>
          <div className="stats-icon emerald-light">
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: `3px solid ${delayedBuses > 0 ? 'var(--rose)' : 'var(--emerald)'}` }}>
          <div className="stats-info">
            <h4>Delayed Buses</h4>
            <h2 style={{ color: delayedBuses > 0 ? 'var(--rose)' : 'var(--emerald)' }}>{delayedBuses}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{delayedBuses === 0 ? '🟢 All routes on time' : '🔴 Require attention'}</div>
          </div>
          <div className="stats-icon" style={{ background: delayedBuses > 0 ? 'var(--rose-soft)' : 'var(--emerald-soft)', color: delayedBuses > 0 ? 'var(--rose)' : 'var(--emerald)', width: 56, height: 56, borderRadius: 16, boxShadow: `0 6px 18px ${delayedBuses > 0 ? 'var(--rose-glow)' : 'var(--emerald-glow)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} />
          </div>
        </div>

      </div>

      {/* Two Column Grid */}
      <div className="two-col-grid">
        
        {/* Boarding Activity Chart */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--primary)' }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title">
              <span style={{ background: 'var(--primary-soft)', padding: '6px 8px', borderRadius: 10, display: 'flex' }}>
                <Play size={16} style={{ color: 'var(--primary)' }} />
              </span>
              Daily Boarding Load Profile
            </h3>
            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 99 }}>Real-Time vs AI Estimation</span>
          </div>
          <div style={{ flex: 1, minHeight: '300px' }}>
            <Line data={hourlyData} options={chartOptions} />
          </div>
        </div>

        {/* Live System Alerts Feed */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--rose)' }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title">
              <span style={{ background: 'var(--rose-soft)', padding: '6px 8px', borderRadius: 10, display: 'flex' }}>
                <AlertTriangle size={16} style={{ color: 'var(--rose)' }} />
              </span>
              Dispatch Alerts
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 99 }}>
              <span className="pulse-green" style={{ width: 6, height: 6 }}></span> Live
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '320px', paddingRight: '4px' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No alerts logged today.</div>
            ) : (
              alerts.map(alert => {
                const colors = { danger: 'var(--rose)', warning: 'var(--amber)', success: 'var(--emerald)', info: 'var(--cyan)' };
                const softs  = { danger: 'var(--rose-soft)', warning: 'var(--amber-soft)', success: 'var(--emerald-soft)', info: 'var(--cyan-soft)' };
                const c = colors[alert.type] || colors.info;
                const s = softs[alert.type] || softs.info;
                return (
                  <div key={alert.id} style={{
                    padding: '11px 14px', borderRadius: '13px',
                    background: s, borderLeft: `3px solid ${c}`,
                    display: 'flex', flexDirection: 'column', gap: '4px',
                    transition: 'transform 0.15s ease',
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: c, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {alert.type.toUpperCase()} ALERT
                      </span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{alert.time}</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>{alert.message}</p>
                  </div>
                );
              })
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '16px' }}
            onClick={() => setCurrentView('notifications-alerts')}
          >
            <span>View All Notifications</span>
            <ArrowRight size={13} />
          </button>
        </div>

      </div>

      {/* Fleet Live Quick-status */}
      <div className="glass-card" style={{ borderTop: '2px solid var(--cyan)' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <span style={{ background: 'var(--cyan-soft)', padding: '6px 8px', borderRadius: 10, display: 'flex' }}>
              <Bus size={16} style={{ color: 'var(--cyan)' }} />
            </span>
            Live Fleet Route Summary
          </h3>
          <button 
            className="btn btn-cyan" 
            style={{ padding: '7px 16px', fontSize: '0.77rem' }}
            onClick={() => setCurrentView('live-tracking')}
          >
            🗺 Tracking Map
          </button>
        </div>
        
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Bus No.</th>
                <th>Assigned Route</th>
                <th>Driver</th>
                <th>Occupancy</th>
                <th>Next Scheduled Stop</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(bus => (
                <tr key={bus.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--cyan)' }}>{bus.number}</td>
                  <td>{bus.route}</td>
                  <td>{bus.driver}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '72px', height: '7px', background: 'var(--bg-tertiary)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.round((bus.occupied / bus.capacity) * 100)}%`, 
                          height: '100%', 
                          background: `linear-gradient(90deg, var(--primary), var(--cyan))`,
                          borderRadius: '99px',
                          transition: 'width 0.4s ease'
                        }}></div>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{bus.occupied}/{bus.capacity}</span>
                    </div>
                  </td>
                  <td>{bus.nextStop} (ETA: {bus.eta}m)</td>
                  <td>
                    <span className={`badge ${
                      bus.status === 'On Route' ? 'badge-active' :
                      bus.status === 'Delayed' ? 'badge-warning' :
                      bus.status === 'Emergency' ? 'badge-danger' : 'badge-info'
                    }`}>
                      {bus.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default DashboardView;
