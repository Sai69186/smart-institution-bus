import React, { useContext, useState, useMemo, useEffect } from 'react';
import { AppContext, getMyStudent } from '../context/AppContext';
import { History, Search, RefreshCw, Calendar } from 'lucide-react';
import { computeHistoryStats } from '../utils/studentHelpers';

const PredictionHistoryView = ({ studentOnly = false }) => {
  const {
    predictionHistory,   // local fallback
    currentUser, students,
    fetchPredictionHistory, fetchAdminPredictionHistory,
  } = useContext(AppContext);

  const [searchTerm,  setSearchTerm]  = useState('');
  const [filterDate,  setFilterDate]  = useState('');
  const [dbHistory,   setDbHistory]   = useState([]);
  const [loading,     setLoading]     = useState(true);

  const myStudent = getMyStudent(students, currentUser);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (studentOnly && myStudent?.studentId) {
        const result = await fetchPredictionHistory(myStudent.studentId);
        setDbHistory(result || []);
      } else if (!studentOnly) {
        const result = await fetchAdminPredictionHistory({ limit: 50 });
        setDbHistory(result?.history || []);
      }
      setLoading(false);
    };
    load();
  }, [myStudent?.studentId, studentOnly]);

  // Use DB data if available, else fall back to local context state
  const baseHistory = dbHistory.length > 0
    ? dbHistory
    : (studentOnly && myStudent
        ? predictionHistory.filter(l => l.student === myStudent.name)
        : predictionHistory);

  const filteredHistory = baseHistory.filter(log => {
    const name   = log.student || log.studentName || '';
    const stop   = log.stop   || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          stop.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = filterDate ? log.date === filterDate : true;
    return matchesSearch && matchesDate;
  });

  const stats = useMemo(() => computeHistoryStats(filteredHistory), [filteredHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {studentOnly && myStudent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--cyan)' }}>
            <div className="stats-info">
              <h4>Total Trips Logged</h4>
              <h2 style={{ color: 'var(--cyan)', fontSize: '1.5rem' }}>{stats.totalTrips}</h2>
            </div>
            <div className="stats-icon cyan-light"><BarChart2 size={22} /></div>
          </div>
          <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--emerald)' }}>
            <div className="stats-info">
              <h4>On-Time Rate</h4>
              <h2 style={{ color: 'var(--emerald)', fontSize: '1.5rem' }}>{stats.onTimeRate}%</h2>
            </div>
            <div className="stats-icon emerald-light"><Target size={22} /></div>
          </div>
          <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--primary)' }}>
            <div className="stats-info">
              <h4>Avg Deviation</h4>
              <h2 style={{ color: 'var(--primary)', fontSize: '1.3rem' }}>{stats.avgDelayLabel}</h2>
            </div>
            <div className="stats-icon primary-light"><TrendingUp size={22} /></div>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '16px 24px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Search size={18} className="text-secondary" />
          <input
            type="text"
            className="form-input"
            placeholder={studentOnly ? 'Search by stop name...' : 'Search by student or stop name...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 260 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Calendar size={18} className="text-secondary" />
          <input
            type="date"
            className="form-input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ width: 180 }}
          />
          {(searchTerm || filterDate) && (
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              onClick={() => { setSearchTerm(''); setFilterDate(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <History size={18} />
            <span>{studentOnly ? 'My Boarding History' : 'AI Predictor Audits'}</span>
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{filteredHistory.length} logs</span>
        </div>

        <div className="table-container" style={{ marginTop: 16 }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Log Date</th>
                {!studentOnly && <th>Student Commuter</th>}
                <th>Boarding Point</th>
                <th>Predicted Boarding</th>
                <th>Actual Boarding</th>
                <th>Deviation Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={studentOnly ? 5 : 6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    No audit records found matching filters.
                  </td>
                </tr>
              ) : (
                filteredHistory.map(log => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    {!studentOnly && <td style={{ fontWeight: 'bold' }}>{log.student}</td>}
                    <td>{log.stop}</td>
                    <td style={{ color: 'var(--cyan)' }}>{log.predicted}</td>
                    <td>{log.actual}</td>
                    <td>
                      <span className={`badge ${log.err.includes('-') || log.err === '0 mins' ? 'badge-active' : 'badge-warning'}`}>
                        {log.err}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PredictionHistoryView;
