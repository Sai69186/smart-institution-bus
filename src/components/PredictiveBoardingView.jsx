import React, { useContext, useState, useMemo, useEffect } from 'react';
import { AppContext, getMyStudent, calcStopETAs } from '../context/AppContext';
import { Brain, Layers, Sliders, Clock, MapPin, Cloud, Calendar, RefreshCw } from 'lucide-react';
import { weatherDelayMins, minsToTime, getPredictedBoardingTime } from '../utils/studentHelpers';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const PredictiveBoardingView = ({ studentOnly = false }) => {
  const {
    students, weather, setWeather, weatherSource, academicPeriod, setAcademicPeriod,
    triggerToast, currentUser, buses, predictBoarding, fetchAIModelStats,
    fetchPredictionAdjustment,
  } = useContext(AppContext);

  const [activeModel, setActiveModel] = useState('XGBoost');
  const [dayOfWeek,   setDayOfWeek]   = useState(
    new Date().toLocaleDateString('en-US', { weekday: 'long' })
  );
  const [predictions,  setPredictions]  = useState({});
  const [adjustments,  setAdjustments]  = useState({});
  const [loading,      setLoading]      = useState(false);

  // Admin mode: fetch all students from DB (context students array is empty for admin)
  const [dbStudents,     setDbStudents]     = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (studentOnly) return; // student gets their profile from context
    const fetchStudents = async () => {
      if (!currentUser?.token) return;
      setStudentsLoading(true);
      try {
        const res  = await fetch(`${API}/students`, {
          headers: { Authorization: `Bearer ${currentUser.token}` }
        });
        if (res.ok) setDbStudents(await res.json());
      } catch { /* keep empty */ }
      finally { setStudentsLoading(false); }
    };
    fetchStudents();
  }, [currentUser?.token, studentOnly]);

  // Real model stats from Python service; fallback to hardcoded values
  const [modelStats, setModelStats] = useState({
    'XGBoost':           { accuracy: '96.4%', mae: '0.72 mins', trainingTime: '5.7s'  },
    'LSTM':              { accuracy: '91.0%', mae: '1.8 mins',  trainingTime: '—'     },
    'Random Forest':     { accuracy: '96.3%', mae: '0.74 mins', trainingTime: '27s'   },
    'Gradient Boosting': { accuracy: '96.4%', mae: '0.72 mins', trainingTime: '18.9s' },
  });

  // Load real model stats once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stats = await fetchAIModelStats();
      if (cancelled || !stats || !Array.isArray(stats)) return;
      const map = {};
      stats.forEach(s => {
        map[s.model] = {
          accuracy:     `${s.accuracy}%`,
          mae:          `${s.mae} mins`,
          trainingTime: `${s.train_time_s}s`,
        };
      });
      setModelStats(prev => ({ ...prev, ...map }));
    })();
    return () => { cancelled = true; };
  }, [fetchAIModelStats]);

  const myStudent = studentOnly ? getMyStudent(students, currentUser) : null;

  // Admin mode uses DB students; student mode uses context students (own profile)
  const visibleStudents = studentOnly && myStudent
    ? [myStudent]
    : studentOnly
      ? students.filter(s => s.id === currentUser?.studentId)
      : dbStudents;

  // GPS-based ETAs for the student's own bus (student view only)
  const myBus = myStudent ? buses.find(b => b.number === myStudent.assignedBus) : null;
  const stopETAs = useMemo(() => {
    if (!myBus) return {};
    // Use real GPS lat/lng + named stop sequence (not canvas coords)
    if (myBus.gpsLat && myBus.gpsLng && myBus.stopSequence?.length) {
      return calcStopETAs(myBus.gpsLat, myBus.gpsLng, myBus.stopSequence, myBus.speed > 0 ? myBus.speed : 30);
    }
    return {};
  }, [myBus?.gpsLat, myBus?.gpsLng, myBus?.stopSequence, myBus?.speed]);

  const myStop  = myStudent?.boardingStop || myStudent?.pickupPoint;
  const rawGpsEta = myStop !== undefined && stopETAs[myStop] !== undefined ? stopETAs[myStop] : null;
  const gpsEta  = rawGpsEta !== null
    ? rawGpsEta + weatherDelayMins(weather) + (adjustments[myStop] || 0)
    : null;

  // ── Run predictions for all visible students ──────────────────────────────
  const runPredictions = async () => {
    setLoading(true);
    const newPreds = {};
    const newAdj   = {};

    for (const student of visibleStudents) {
      const stop  = student.boardingStop || student.pickupPoint;
      const myBusForStudent = buses.find(b => b.number === student.assignedBus);

      // Fetch historical adjustment for this stop (current weather)
      if (stop && !newAdj[stop]) {
        const adj = await fetchPredictionAdjustment(stop, { days: 14, weather });
        newAdj[stop] = adj?.adjustmentMins || 0;
      }

      // Call AI prediction
      const result = await predictBoarding({
        model:           activeModel,
        stop,
        busNumber:       student.assignedBus,
        weather,
        academic_period: academicPeriod,
        day_of_week:     dayOfWeek,
        occupancy:       myBusForStudent?.occupied || 0,
      });
      if (result) newPreds[student.id || student._id] = result;
    }

    setPredictions(newPreds);
    setAdjustments(newAdj);
    setLoading(false);
    triggerToast(`Predictions computed for ${Object.keys(newPreds).length} students.`, 'success');
  };

  if (studentOnly && !myStudent) {
    return (
      <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>No student profile found. Please log in as a student.</p>
      </div>
    );
  }

  const currentStats = modelStats[activeModel] || modelStats['XGBoost'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Admin only: model + environment controls ── */}
      {!studentOnly && (
        <div className="grid-responsive">

          {/* Model selection */}
          <div className="glass-card">
            <h3 className="glass-card-title">
              <Layers size={18} />
              <span>AI Prediction Engine</span>
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Choose algorithmic model to run regressors
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {['XGBoost', 'LSTM', 'Random Forest', 'Gradient Boosting'].map(model => (
                <button
                  key={model}
                  onClick={() => {
                    setActiveModel(model);
                    triggerToast(`AI predictor switched to ${model}.`, 'success');
                  }}
                  className={`btn ${activeModel === model ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px', fontSize: '0.75rem' }}
                >
                  {model}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', padding: '10px' }}>
              <div className="detail-row" style={{ fontSize: '0.75rem' }}>
                <span className="detail-label">Model Accuracy</span>
                <span className="detail-value" style={{ color: 'var(--emerald)' }}>{currentStats.accuracy}</span>
              </div>
              <div className="detail-row" style={{ fontSize: '0.75rem' }}>
                <span className="detail-label">Mean Absolute Error (MAE)</span>
                <span className="detail-value">{currentStats.mae}</span>
              </div>
              <div className="detail-row" style={{ fontSize: '0.75rem' }}>
                <span className="detail-label">Model Retraining Cost</span>
                <span className="detail-value">{currentStats.trainingTime}</span>
              </div>
            </div>
          </div>

          {/* Environment parameters */}
          <div className="glass-card">
            <h3 className="glass-card-title">
              <Sliders size={18} />
              <span>AI Environment Parameters</span>
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Adjust input vectors for prediction modeling
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Weather Condition</label>
                {['admin','institution_admin','super_admin'].includes(currentUser?.role) ? (
                  <select className="form-input" value={weather} onChange={e => setWeather(e.target.value)}>
                    <option value="Sunny">Sunny (Dry pavement)</option>
                    <option value="Rainy">Rainy (Slower speeds, high delay)</option>
                    <option value="Foggy">Foggy (Reduced visibility, low speed)</option>
                  </select>
                ) : (
                  <div style={{ padding: '10px 14px', borderRadius: 11, background: 'var(--bg-tertiary)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>
                      {weather === 'Sunny' ? '☀️' : weather === 'Rainy' ? '🌧️' : '🌫️'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{weather}</div>
                      <div style={{ fontSize: '0.65rem', color: weatherSource === 'gps' ? 'var(--emerald)' : 'var(--text-muted)' }}>
                        {weatherSource === 'gps' ? '📡 Auto-detected from GPS location' : '⏳ Updates when GPS is active'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Academic Calendar Context</label>
                <select className="form-input" value={academicPeriod} onChange={e => setAcademicPeriod(e.target.value)}>
                  <option value="Regular Semester">Regular Semester (Standard demand)</option>
                  <option value="Exam Week">Exam Week (Peak early boarding)</option>
                  <option value="Holidays">Holidays (Low demand, schedule shifts)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Day of Week Vector</label>
                <select className="form-input" value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Student only: info banner + ETA cards ── */}
      {studentOnly && myStudent && (
        <>
          <div className="glass-card" style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(99,102,241,0.05) 100%)',
            borderLeft: '4px solid var(--cyan)',
            display: 'flex', alignItems: 'center', gap: 14
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--cyan-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Brain size={22} style={{ color: 'var(--cyan)' }} className="animate-pulse" />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                Your AI Boarding Prediction
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Powered by {activeModel} · Weather: {weather} · {academicPeriod}
              </div>
            </div>
          </div>

          {/* 4 time cards */}
          {(() => {
            const aiResult = predictions[myStudent.id || myStudent._id];
            const unified  = getPredictedBoardingTime({
              bus:           myBus,
              student:       myStudent,
              weather,
              academicPeriod,
              dayOfWeek,
              aiEtaTime:     aiResult?.eta_time || null,
              adjustmentMins: adjustments[myStop] || 0,
              calcStopETAs,
            });
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {[
                  { icon: Clock, label: 'Scheduled',   value: myStudent.predBoardingTime,                                                   color: 'var(--text-primary)' },
                  { icon: Brain, label: 'AI Estimated', value: unified.time,                                                                   color: 'var(--cyan)'         },
                  { icon: MapPin, label: 'GPS ETA',     value: gpsEta !== null ? `${gpsEta} min · ${minsToTime(gpsEta)}` : 'Calculating…',    color: gpsEta !== null && gpsEta <= 5 ? 'var(--rose)' : 'var(--emerald)' },
                  { icon: Clock, label: 'Actual',       value: myStudent.actualBoardingTime,                                                  color: 'var(--text-primary)' },
                ].map((card, i) => (
                  <div key={i} className="glass-card" style={{ padding: 16, textAlign: 'center', borderTop: `3px solid ${card.color}` }}>
                    <card.icon size={18} style={{ color: card.color, marginBottom: 8 }} />
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: card.color, marginTop: 6 }}>{card.value}</div>
                    {card.label === 'AI Estimated' && unified.source && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        source: {unified.source}{adjustments[myStop] ? ` · adj ${adjustments[myStop] > 0 ? '+' : ''}${adjustments[myStop]}m` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Factors panel */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 12 }}>Factors Affecting Your Prediction</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                <Cloud size={16} style={{ color: 'var(--amber)', marginBottom: 6 }} />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Weather</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{weather}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--amber)', marginTop: 4 }}>
                  {weatherDelayMins(weather) > 0 ? `+${weatherDelayMins(weather)} min delay` : 'No delay impact'}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                <Calendar size={16} style={{ color: 'var(--emerald)', marginBottom: 6 }} />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Academic Period</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{academicPeriod}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                <MapPin size={16} style={{ color: 'var(--primary)', marginBottom: 6 }} />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Your Stop</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{myStop || '—'}</div>
                {adjustments[myStop] !== undefined && adjustments[myStop] !== 0 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--cyan)', marginTop: 2 }}>
                    Historical adj: {adjustments[myStop] > 0 ? '+' : ''}{adjustments[myStop]} min
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Prediction table (all roles) ── */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <Brain size={18} className="text-cyan animate-pulse" />
            <span>{studentOnly ? 'My Predicted Boarding Time' : 'Predicted Boarding Estimations'}</span>
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge badge-info">{activeModel}</span>
            {!studentOnly && (
              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                onClick={runPredictions} disabled={loading}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Running…' : 'Run Predictions'}
              </button>
            )}
          </div>
        </div>

        <div className="table-container">
          {studentsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px', opacity: 0.4 }} />
              Loading students...
            </div>
          ) : visibleStudents.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {studentOnly ? 'No student profile linked.' : 'No students found. Add students in Student Management first.'}
            </div>
          ) : (
          <table className="custom-table">
            <thead>
              <tr>
                {!studentOnly && <th>Student ID</th>}
                <th>Student Name</th>
                <th>Boarding Point</th>
                <th>Scheduled</th>
                <th>AI Estimated</th>
                <th>Actual</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map(s => {
                const stop     = s.boardingStop || s.pickupPoint;
                const busFors  = buses.find(b => b.number === s.assignedBus);
                const aiResult = predictions[s.id || s._id];
                const unified  = getPredictedBoardingTime({
                  bus:            busFors,
                  student:        s,
                  weather,
                  academicPeriod,
                  dayOfWeek,
                  aiEtaTime:      aiResult?.eta_time || null,
                  adjustmentMins: adjustments[stop] || 0,
                  calcStopETAs,
                });
                return (
                  <tr key={s.id || s._id}>
                    {!studentOnly && <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{s.id || s.studentId}</td>}
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{stop || '—'}</td>
                    <td>{s.predBoardingTime}</td>
                    <td style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                      {unified.time}
                      {unified.source === 'gps' && <span style={{ fontSize: '0.65rem', color: 'var(--emerald)', marginLeft: 4 }}>📡</span>}
                      {unified.source === 'ai'  && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', marginLeft: 4 }}>🤖</span>}
                    </td>
                    <td>{s.actualBoardingTime}</td>
                    <td>
                      <span className={`badge ${
                        s.attendanceStatus === 'Boarded' ? 'badge-active' :
                        s.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {s.attendanceStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>

    </div>
  );
};

export default PredictiveBoardingView;
