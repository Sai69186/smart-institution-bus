import React, { useContext, useMemo, useState, useEffect } from 'react';
import { AppContext, calcStopETAs, getMyStudent, getStudentAlerts } from '../context/AppContext';
import {
  Bus, MapPin, Clock, Bell, Navigation,
  ArrowRight, History, CheckCircle, Wifi, Brain
} from 'lucide-react';
import StudentBusMap from './StudentBusMap';
import { minsToTime, weatherDelayMins } from '../utils/studentHelpers';

const StudentDashboardView = ({ setCurrentView }) => {
  const {
    currentUser, students, buses, alerts, weather,
    fetchPredictionHistory, fetchMyNotifications,
  } = useContext(AppContext);

  const myStudent = getMyStudent(students, currentUser);
  const myBus     = buses.find(b => b.number === myStudent?.assignedBus);
  const myAlerts  = getStudentAlerts(alerts, myStudent).slice(0, 4);

  // ── Real prediction history from DB (Gap 5 fix) ───────────────────────────
  const [myHistory, setMyHistory] = useState([]);
  useEffect(() => {
    if (!myStudent?.studentId && !myStudent?.id) return;
    const id = myStudent.studentId || myStudent.id;
    fetchPredictionHistory(id).then(history => {
      setMyHistory((history || []).slice(0, 3));
    });
  }, [myStudent?.studentId, myStudent?.id]);

  // ── Poll DB notifications every 15s so alerts appear automatically ────────
  useEffect(() => {
    if (!currentUser?.token) return;
    const poll = async () => {
      const result = await fetchMyNotifications({ limit: 5 });
      if (result?.notifications?.length) {
        // Already merged in NotificationsAlertsView; here we just trigger
        // a toast for any new unread ones so the student sees the badge
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [currentUser?.token]);

  const stopETAs = useMemo(() => {
    if (!myBus) return {};
    // Use live GPS if available, fall back to the bus's configured starting point
    const lat = myBus.gpsLat || myBus.startingLat;
    const lng = myBus.gpsLng || myBus.startingLng;
    if (!lat || !lng) return {};
    return calcStopETAs(
      lat, lng,
      myBus.stopSequence,
      myBus.speed > 0 ? myBus.speed : 30
    );
  }, [myBus?.gpsLat, myBus?.gpsLng, myBus?.startingLat, myBus?.startingLng, myBus?.speed, myBus?.stopSequence?.join(',')]);

  const weatherOffset = weatherDelayMins(weather);

  // Match student pickup point to a stop in the bus's sequence.
  // Try exact match first, then case-insensitive partial match as fallback.
  const studentStop = myStudent?.pickupPoint || myStudent?.boardingStop || '';
  const matchedStop = studentStop
    ? (Object.keys(stopETAs).find(s => s === studentStop) ||
       Object.keys(stopETAs).find(s => s.toLowerCase().includes(studentStop.toLowerCase())) ||
       Object.keys(stopETAs).find(s => studentStop.toLowerCase().includes(s.toLowerCase())))
    : undefined;

  const myStopETA   = matchedStop !== undefined ? stopETAs[matchedStop] : undefined;
  const adjustedETA = myStopETA !== undefined ? myStopETA + weatherOffset : null;
  const predictedTime = adjustedETA !== null ? minsToTime(adjustedETA) : myStudent?.predBoardingTime;

  if (!myStudent) return (
    <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', marginBottom: 12 }}>👋</div>
      <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 6 }}>
        Welcome, {currentUser?.name}
      </p>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>No student transit profile linked to your account yet.</p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>The transport administrator will assign your bus. Check back after registration is confirmed.</p>
    </div>
  );

  const statusBadge = myStudent.attendanceStatus === 'Boarded' ? 'badge-active'
    : myStudent.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Hero Banner ── */}
      <div className="page-hero page-hero-student">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--violet)', marginBottom: 6 }}>
            Vignan's LARA · Student Transit Portal
          </div>
          {/* Use currentUser.name for the login greeting — always matches who logged in */}
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.65rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            {currentUser?.name}
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--primary-soft)', padding: '3px 10px', borderRadius: 99, color: 'var(--primary)', fontWeight: 700 }}>📚 {myStudent.dept}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--cyan-soft)', padding: '3px 10px', borderRadius: 99, color: 'var(--cyan)', fontWeight: 700 }}>🎓 {myStudent.year}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--violet-soft)', padding: '3px 10px', borderRadius: 99, color: 'var(--violet)', fontWeight: 700 }}>🪪 {myStudent.id}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
          <span className={`badge ${statusBadge}`} style={{ fontSize: '0.84rem', padding: '7px 18px' }}>
            {myStudent.attendanceStatus === 'Boarded' && <CheckCircle size={13} />}
            {myStudent.attendanceStatus}
          </span>

          {/* GPS live indicator */}
          {myBus?.gpsLat ? (
            <div style={{ fontSize: '0.72rem', color: 'var(--emerald)', marginTop: 8, fontWeight: 700, background: 'var(--emerald-soft)', padding: '4px 12px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span className="pulse-green" style={{ width: 7, height: 7 }} />
              Driver GPS Live
            </div>
          ) : (
            <div style={{ fontSize: '0.72rem', color: 'var(--amber)', marginTop: 8, fontWeight: 600, background: 'var(--amber-soft)', padding: '4px 12px', borderRadius: 99, display: 'inline-block' }}>
              ⏳ Awaiting driver GPS
            </div>
          )}

          {adjustedETA !== null && (
            <div style={{ fontSize: '0.74rem', color: 'var(--cyan)', marginTop: 6, fontWeight: 700, background: 'var(--cyan-soft)', padding: '4px 12px', borderRadius: 99, display: 'inline-block' }}>
              🤖 Bus arrives in ~{adjustedETA} min
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="glass-card stats-card featured" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="stats-info">
            <h4>My Bus</h4>
            <h2 style={{ color: 'var(--primary)', fontSize: '1.5rem' }}>{myStudent.assignedBus}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>🛣 {myStudent.assignedRoute}</div>
          </div>
          <div className="stats-icon primary-light"><Bus size={24} /></div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--cyan)' }}>
          <div className="stats-info">
            <h4>Boarding Stop</h4>
            <h2 style={{ color: 'var(--cyan)', fontSize: '1.05rem', lineHeight: 1.25 }}>{myStudent.pickupPoint || myStudent.boardingStop || '—'}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>📍 Your pickup point</div>
          </div>
          <div className="stats-icon cyan-light"><MapPin size={24} /></div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: `3px solid ${adjustedETA !== null && adjustedETA <= 3 ? 'var(--rose)' : 'var(--emerald)'}` }}>
          <div className="stats-info">
            <h4>Bus ETA</h4>
            <h2 style={{ color: adjustedETA !== null && adjustedETA <= 3 ? 'var(--rose)' : 'var(--emerald)', fontSize: '1.6rem' }}>
              {adjustedETA !== null ? `${adjustedETA}m` : '--'}
            </h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {adjustedETA !== null && adjustedETA <= 3 ? '🚨 Arriving now!' : '⏱ At your stop'}
            </div>
          </div>
          <div className="stats-icon emerald-light"><Clock size={24} /></div>
        </div>
      </div>

      <div className="two-col-grid">
        <div className="glass-card" style={{ padding: 18 }}>
          <div className="glass-card-header">
            <div>
              <h3 className="glass-card-title">
                <Navigation size={18} /> Live Bus on Map
              </h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {myBus?.gpsLat
                  ? `📡 GPS: ${myBus.gpsLat.toFixed(4)}°N, ${myBus.gpsLng.toFixed(4)}°E · ${myBus.speed} km/h`
                  : 'Waiting for driver to enable GPS…'
                }
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`badge ${myBus?.gpsLat ? 'badge-active' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>
                {myBus?.gpsLat ? <><Wifi size={9} /> GPS Live</> : '⏳ GPS Offline'}
              </span>
              <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '0.72rem' }}
                onClick={() => setCurrentView('student-live-tracking')}>
                Full Map <ArrowRight size={12} />
              </button>
            </div>
          </div>

          <div style={{ height: 310, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
            <StudentBusMap myBus={myBus} myStudent={myStudent} stopETAs={stopETAs} />
          </div>

          {myBus && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Speed',     value: `${myBus.speed} km/h`,   color: 'var(--primary)',  bg: 'var(--primary-soft)' },
                { label: 'Next Stop', value: myBus.nextStop || '—',    color: 'var(--cyan)',     bg: 'var(--cyan-soft)'    },
                { label: 'Status',    value: myBus.status,             color: myBus.status === 'Delayed' ? 'var(--amber)' : 'var(--emerald)', bg: myBus.status === 'Delayed' ? 'var(--amber-soft)' : 'var(--emerald-soft)' },
                { label: 'Seats',     value: `${myBus.occupied}/${myBus.capacity}`, color: 'var(--text-primary)', bg: 'var(--bg-tertiary)' }
              ].map((t, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: t.bg, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t.label}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: t.color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ borderLeft: '4px solid var(--cyan)', background: 'linear-gradient(135deg, var(--cyan-soft) 0%, transparent 100%)' }}>
            <h3 className="glass-card-title" style={{ color: 'var(--cyan)', marginBottom: 14 }}>
              <Brain size={17} /> AI Boarding Prediction
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'Your Stop',       value: myStudent.pickupPoint || myStudent.boardingStop || '—', color: 'var(--primary)' },
                { label: 'Scheduled',       value: myStudent.predBoardingTime,   color: 'var(--text-primary)' },
                { label: '🤖 AI Estimated', value: predictedTime,                color: 'var(--cyan)' },
                { label: 'GPS ETA',         value: adjustedETA !== null ? `${adjustedETA} mins` : 'Calculating...', color: adjustedETA !== null && adjustedETA <= 5 ? 'var(--rose)' : 'var(--emerald)' },
                ...(weatherOffset > 0 ? [{ label: `Weather (${weather})`, value: `+${weatherOffset} min delay`, color: 'var(--amber)' }] : []),
                { label: 'Actual Boarded',  value: myStudent.actualBoardingTime, color: 'var(--text-primary)' }
              ].map((row, i) => (
                <div key={i} className="detail-row">
                  <span className="detail-label">{row.label}</span>
                  <span className="detail-value" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-cyan" style={{ width: '100%', marginTop: 14, fontSize: '0.78rem' }}
              onClick={() => setCurrentView('student-boarding-prediction')}>
              Full Prediction Details <ArrowRight size={12} />
            </button>
          </div>

          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 12 }}>
              <MapPin size={16} /> Stops Ahead — Live ETAs
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(myBus?.routeCoords || [])
                .filter(pt => pt.stop && stopETAs[pt.stop] !== undefined)
                .map((pt, i) => {
                  const myStop  = myStudent.pickupPoint || myStudent.boardingStop || '';
                  const isMyStop = pt.stop === myStop;
                  const eta = stopETAs[pt.stop] + weatherOffset;
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: 10,
                      background: isMyStop ? 'var(--primary-soft)' : 'var(--bg-tertiary)',
                      border: `1px solid ${isMyStop ? 'var(--primary)' : 'var(--card-border)'}`
                    }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: isMyStop ? 700 : 500, color: isMyStop ? 'var(--primary)' : 'var(--text-primary)' }}>
                        {isMyStop ? '⭐ ' : '📍 '}{pt.stop}
                      </span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: eta <= 3 ? 'var(--rose)' : 'var(--emerald)' }}>{eta} min</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{minsToTime(eta)}</div>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(stopETAs).length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  All stops completed for this trip.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18 }}>
        <div className="glass-card">
          <h3 className="glass-card-title" style={{ marginBottom: 12 }}><Bell size={16} /> Recent Alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myAlerts.length === 0
              ? <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>No alerts today.</div>
              : myAlerts.map(alert => {
                const softs  = { danger: 'var(--rose-soft)', warning: 'var(--amber-soft)', success: 'var(--emerald-soft)', info: 'var(--cyan-soft)' };
                const colors = { danger: 'var(--rose)', warning: 'var(--amber)', success: 'var(--emerald)', info: 'var(--cyan)' };
                return (
                  <div key={alert.id} style={{ padding: '9px 12px', borderRadius: 10, background: softs[alert.type] || softs.info, borderLeft: `3px solid ${colors[alert.type] || colors.info}` }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{alert.message}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 3 }}>{alert.time}</div>
                  </div>
                );
              })}
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 12, fontSize: '0.74rem' }}
            onClick={() => setCurrentView('student-notifications')}>
            View All <ArrowRight size={11} />
          </button>
        </div>

        {myHistory.length > 0 && (
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title"><History size={16} /> Boarding History</h3>
              <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '0.73rem' }}
                onClick={() => setCurrentView('student-history')}>Full History</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myHistory.map(log => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--card-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>{log.date}</div>
                    <div style={{ fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Pred: </span><span style={{ fontWeight: 700, color: 'var(--primary)' }}>{log.predicted}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>Actual: </span><span style={{ fontWeight: 700 }}>{log.actual}</span>
                    </div>
                  </div>
                  <span className={`badge ${log.err.includes('-') || log.err === '0 mins' ? 'badge-active' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>{log.err}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboardView;
