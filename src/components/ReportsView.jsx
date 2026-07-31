import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { FileText, Download, RefreshCw } from 'lucide-react';

const ReportsView = () => {
  const {
    fetchAttendanceSummary, fetchRoutePerformance,
    fetchFeedbackSummary,   fetchAIModelStats,
    triggerToast,
  } = useContext(AppContext);

  const [reportType,  setReportType]  = useState('attendance');
  const [loading,     setLoading]     = useState(false);
  const [reportData,  setReportData]  = useState(null);
  const [exporting,   setExporting]   = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setReportData(null);
    let data = null;
    if (reportType === 'attendance')    data = await fetchAttendanceSummary();
    else if (reportType === 'route')    data = await fetchRoutePerformance(30);
    else if (reportType === 'feedback') data = await fetchFeedbackSummary();
    else if (reportType === 'ai')       data = await fetchAIModelStats();
    setReportData(data);
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, [reportType]);

  // CSV export of current report data
  const handleExport = () => {
    if (!reportData) { triggerToast('No data to export.', 'warning'); return; }
    setExporting(true);
    try {
      const json = JSON.stringify(reportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${reportType}_report_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast('Report downloaded.', 'success');
    } catch { triggerToast('Export failed.', 'danger'); }
    setExporting(false);
  };

  const renderAttendance = (d) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Students', val: d.totals?.totalStudents ?? '—', color: 'var(--primary)' },
          { label: 'Boarded',        val: d.totals?.boarded       ?? '—', color: 'var(--emerald)' },
          { label: 'Absent',         val: d.totals?.absent        ?? '—', color: 'var(--rose)'    },
          { label: 'Waiting',        val: d.totals?.waiting       ?? '—', color: 'var(--amber)'   },
        ].map(s => (
          <div key={s.label} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)', marginTop: 4 }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div className="table-container">
        <table className="custom-table">
          <thead><tr><th>Bus</th><th>Boarded</th><th>Absent</th></tr></thead>
          <tbody>
            {(d.perBus || []).map(b => (
              <tr key={b.busNumber}>
                <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{b.busNumber}</td>
                <td style={{ color: 'var(--emerald)', fontWeight: 700 }}>{b.boarded}</td>
                <td style={{ color: 'var(--rose)' }}>{b.absent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderRoute = (d) => (
    <div className="table-container">
      <table className="custom-table">
        <thead><tr><th>Bus</th><th>Route</th><th>Avg Delay</th><th>On-Time %</th><th>Trips</th></tr></thead>
        <tbody>
          {(d.performance || []).map(p => (
            <tr key={p.busNumber}>
              <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{p.busNumber}</td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.route}</td>
              <td style={{ color: p.avgErrorMins > 2 ? 'var(--rose)' : 'var(--emerald)', fontWeight: 700 }}>
                +{p.avgErrorMins} min
              </td>
              <td>
                <span className={`badge ${p.onTimeRate >= 90 ? 'badge-active' : p.onTimeRate >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                  {p.onTimeRate}%
                </span>
              </td>
              <td>{p.tripCount}</td>
            </tr>
          ))}
          {(!d.performance || d.performance.length === 0) && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No prediction data yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderFeedback = (d) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total',      val: d.overall?.total      ?? 0, color: 'var(--primary)' },
          { label: 'Avg Rating', val: `${d.overall?.avgRating ?? 0}★`, color: 'var(--amber)'   },
          { label: 'Open',       val: d.overall?.open        ?? 0, color: 'var(--rose)'    },
          { label: 'Resolved',   val: d.overall?.resolved    ?? 0, color: 'var(--emerald)' },
        ].map(s => (
          <div key={s.label} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)', marginTop: 4 }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div className="table-container">
        <table className="custom-table">
          <thead><tr><th>Category</th><th>Count</th><th>Avg Rating</th></tr></thead>
          <tbody>
            {(d.byCategory || []).map(c => (
              <tr key={c.category}>
                <td style={{ fontWeight: 600 }}>{c.category}</td>
                <td>{c.count}</td>
                <td style={{ color: 'var(--amber)' }}>{c.avgRating}★</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderAI = (d) => (
    <div className="table-container">
      <table className="custom-table">
        <thead><tr><th>Model</th><th>MAE</th><th>Accuracy</th><th>Train Time</th></tr></thead>
        <tbody>
          {(Array.isArray(d) ? d : []).map(m => (
            <tr key={m.model}>
              <td style={{ fontWeight: 700 }}>{m.model}</td>
              <td style={{ color: 'var(--cyan)' }}>{m.mae} mins</td>
              <td style={{ color: 'var(--emerald)', fontWeight: 700 }}>{m.accuracy}%</td>
              <td style={{ color: 'var(--text-muted)' }}>{m.train_time_s}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const titles = {
    attendance: 'Attendance Summary Report',
    route:      'Route Performance Report (Last 30 Days)',
    feedback:   'Feedback & Complaints Report',
    ai:         'AI Model Accuracy Report',
  };

  return (
    <div className="two-col-grid">

      {/* Config panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="glass-card">
          <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
            <FileText size={18} /> Generate Report
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Report Category</label>
              <select className="form-input" value={reportType} onChange={e => setReportType(e.target.value)}>
                <option value="attendance">Daily Attendance Summary</option>
                <option value="route">Route Performance (30 days)</option>
                <option value="feedback">Feedback & Complaints</option>
                <option value="ai">AI Model Accuracy</option>
              </select>
            </div>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={loadReport} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading...' : 'Refresh Report'}
            </button>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleExport} disabled={exporting || !reportData}>
              <Download size={14} />
              {exporting ? 'Exporting...' : 'Download as JSON'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 className="glass-card-title" style={{ marginBottom: 4 }}>{titles[reportType]}</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Live data from database
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
            Loading report data...
          </div>
        )}

        {!loading && !reportData && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No data available yet. Ensure the backend is running and data exists.
          </div>
        )}

        {!loading && reportData && reportType === 'attendance' && renderAttendance(reportData)}
        {!loading && reportData && reportType === 'route'      && renderRoute(reportData)}
        {!loading && reportData && reportType === 'feedback'   && renderFeedback(reportData)}
        {!loading && reportData && reportType === 'ai'         && renderAI(reportData)}
      </div>
    </div>
  );
};

export default ReportsView;
