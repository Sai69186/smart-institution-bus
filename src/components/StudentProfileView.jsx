import React, { useContext, useState, useMemo } from 'react';
import { AppContext, getMyStudent } from '../context/AppContext';
import { User, Phone, MapPin, Bus, Calendar, History, Brain, Search, Save, QrCode, ArrowLeft } from 'lucide-react';
import { computeHistoryStats, BOARDING_STOPS, DEPT_OPTIONS, YEAR_OPTIONS } from '../utils/studentHelpers';
const StudentProfileView = ({ myProfileOnly = false, setCurrentView }) => {
  const {
    students, predictionHistory, currentUser, buses,
    updateStudentProfile, boardingStopsFromDB, suggestBoardingStop
  } = useContext(AppContext);

  const availableStops = boardingStopsFromDB.length > 0 ? boardingStopsFromDB : BOARDING_STOPS;

  const defaultId = myProfileOnly && currentUser?.studentId
    ? currentUser.studentId
    : students[0]?.id || '';

  const [selectedStudentId, setSelectedStudentId] = useState(defaultId);
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDept, setEditDept] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStop,       setEditStop]       = useState('');
  const [editCustomStop, setEditCustomStop] = useState('');
  const isCustomEditStop = editStop === '__other__';
  const [saving, setSaving] = useState(false);

  const currentStudent = students.find(s => s.id === selectedStudentId);
  const myBus = currentStudent ? buses.find(b => b.number === currentStudent.assignedBus) : null;

  const filteredStudents = myProfileOnly
    ? students.filter(s => s.id === currentUser?.studentId)
    : students.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase())
      );

  const studentHistory = predictionHistory.filter(h => h.student === currentStudent?.name);
  const stats = useMemo(() => computeHistoryStats(studentHistory), [studentHistory]);

  const startEditing = () => {
    if (!currentStudent) return;
    setEditDept(currentStudent.dept);
    setEditYear(currentStudent.year);
    setEditPhone(currentStudent.phone);
    setEditStop(currentStudent.boardingStop);
    setEditing(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    const finalStop = isCustomEditStop ? editCustomStop.trim() : editStop;
    if (isCustomEditStop && finalStop) await suggestBoardingStop(finalStop);
    const ok = await updateStudentProfile({
      dept: editDept,
      year: editYear,
      phone: editPhone,
      boardingStop: finalStop
    });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (myProfileOnly && !getMyStudent(students, currentUser)) {
    return (
      <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading your profile...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Back to Student Management — only shown when navigated from admin portal */}
      {!myProfileOnly && setCurrentView && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10 }}
            onClick={() => setCurrentView('student-management')}
          >
            <ArrowLeft size={15} /> Back to Student Management
          </button>
        </div>
      )}

      {!myProfileOnly && (
        <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Search size={18} className="text-secondary" />
            <input
              type="text"
              className="form-input"
              placeholder="Search student by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: 250 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Select Profile:</span>
            <select
              className="form-input"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              style={{ minWidth: 200 }}
            >
              {filteredStudents.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {currentStudent ? (
        <div className="two-col-grid">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, borderBottom: '1px solid var(--card-border)', paddingBottom: 16 }}>
                <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <User size={32} />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--font-heading)' }}>{currentStudent.name}</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {currentStudent.id} | {currentStudent.dept}</span>
                </div>
                {myProfileOnly && !editing && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={startEditing}>
                    Edit Profile
                  </button>
                )}
              </div>

              {editing && myProfileOnly ? (
                <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-input" value={editDept} onChange={e => setEditDept(e.target.value)}>
                      {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Year of Study</label>
                    <select className="form-input" value={editYear} onChange={e => setEditYear(e.target.value)}>
                      {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input type="tel" className="form-input" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Boarding Stop</label>
                    <select
                      className="form-input"
                      value={editStop}
                      onChange={e => { setEditStop(e.target.value); setEditCustomStop(''); }}
                    >
                      <option value="">— Select your boarding stop —</option>
                      {availableStops.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__other__">Other — type my stop name</option>
                    </select>
                    {isCustomEditStop && (
                      <input
                        type="text"
                        className="form-input"
                        style={{ marginTop: 8 }}
                        placeholder="Type your boarding stop name..."
                        value={editCustomStop}
                        onChange={e => setEditCustomStop(e.target.value)}
                      />
                    )}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {isCustomEditStop
                        ? '⚠ Your stop will be submitted for admin review.'
                        : 'Changing stop reassigns your bus and route automatically.'
                      }
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="detail-row">
                    <span className="detail-label"><Calendar size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Year of Study</span>
                    <span className="detail-value">{currentStudent.year}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label"><Phone size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Contact Phone</span>
                    <span className="detail-value">{currentStudent.phone}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label"><MapPin size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Boarding Stop</span>
                    <span className="detail-value">{currentStudent.boardingStop}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label"><Bus size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Assigned Bus & Route</span>
                    <span className="detail-value">{currentStudent.assignedBus} ({currentStudent.assignedRoute})</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label"><History size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Today's Boarding Status</span>
                    <span className="detail-value">
                      <span className={`badge ${currentStudent.attendanceStatus === 'Boarded' ? 'badge-active' : currentStudent.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger'}`}>
                        {currentStudent.attendanceStatus}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {myProfileOnly && (
              <div className="glass-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <h3 className="glass-card-title"><QrCode size={18} /> Boarding Pass ID</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Show this ID to the driver for QR/RFID boarding verification.
                </p>
                <div style={{
                  padding: 20, borderRadius: 12, background: 'var(--bg-tertiary)',
                  textAlign: 'center', fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 800,
                  letterSpacing: 4, color: 'var(--primary)', border: '2px dashed var(--primary)'
                }}>
                  {currentStudent.id}
                </div>
              </div>
            )}

            {myBus && myProfileOnly && (
              <div className="glass-card" style={{ borderLeft: '4px solid var(--emerald)' }}>
                <h3 className="glass-card-title"><Bus size={18} /> Live Bus Status</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <div className="detail-row">
                    <span className="detail-label">Bus</span>
                    <span className="detail-value">{myBus.number} · {myBus.status}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Driver</span>
                    <span className="detail-value">{myBus.driver}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Next Stop</span>
                    <span className="detail-value" style={{ color: 'var(--cyan)' }}>{myBus.nextStop} ({myBus.eta} min)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-card" style={{ borderLeft: '4px solid var(--cyan)' }}>
              <h3 className="glass-card-title" style={{ color: 'var(--cyan)' }}>
                <Brain size={18} />
                <span>AI Prediction Insights</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Typical Boarding</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--cyan)', marginTop: 4 }}>{currentStudent.predBoardingTime}</div>
                </div>
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Avg Delay Dev.</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--cyan)', marginTop: 4 }}>{stats.avgDelayLabel}</div>
                </div>
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>On-Time Rate</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--cyan)', marginTop: 4 }}>{stats.onTimeRate}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 className="glass-card-title">
              <History size={18} />
              <span>Historical Boarding Pattern</span>
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Chronological logs of predicted vs actual boarding times
            </p>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {studentHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No historical records found for this student.
                </div>
              ) : (
                studentHistory.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    style={{
                      padding: 12, borderRadius: 10,
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid var(--card-border)',
                      display: 'flex', flexDirection: 'column', gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{log.date}</span>
                      <span style={{ fontSize: '0.75rem', color: log.err.includes('-') || log.err === '0 mins' ? 'var(--emerald)' : 'var(--amber)', fontWeight: 'semibold' }}>
                        {log.err}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{log.stop}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Predicted: </span>
                        <span style={{ fontWeight: 'bold', color: 'var(--cyan)' }}>{log.predicted}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Actual: </span>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{log.actual}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>No student matching query found.</p>
        </div>
      )}
    </div>
  );
};

export default StudentProfileView;
