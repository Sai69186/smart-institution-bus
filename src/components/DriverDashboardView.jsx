import React, { useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AppContext, calcStopETAs } from '../context/AppContext';
import {
  Bus, Fuel, Navigation, Clock, Users, CheckCircle,
  AlertTriangle, ShieldAlert, ArrowRight, MapPin, Activity,
  WifiOff, Satellite
} from 'lucide-react';
import FleetMap from './FleetMap';

const API = 'http://localhost:5000/api';

const DriverDashboardView = ({ setCurrentView }) => {
  const {
    currentUser, buses,
    triggerSOS, addAlert,
    pushDriverGPS, updateBusStatus, toggleChecklistItem,
    triggerToast, weather, weatherSource
  } = useContext(AppContext);

  // Find this driver's bus by driverId OR busNumber stored in currentUser
  const myBus = buses.find(b =>
    b.driverId?.toString() === currentUser?.id?.toString() ||
    b.number === currentUser?.busNumber
  );

  // ── Fetch assigned students from DB (not from stale mock state) ───────────
  const [myStudents, setMyStudents] = useState([]);

  const fetchAssignedStudents = useCallback(async () => {
    if (!currentUser?.token || !myBus?.number) return;
    try {
      const res = await fetch(`${API}/students`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return;
      const all = await res.json();
      setMyStudents(all.filter(s => s.assignedBus === myBus.number));
    } catch { /* keep existing */ }
  }, [currentUser?.token, myBus?.number]);

  // Load on mount and whenever bus number changes
  useEffect(() => { fetchAssignedStudents(); }, [fetchAssignedStudents]);

  // Poll every 15s so changes from admin allocation appear automatically
  useEffect(() => {
    if (!currentUser?.token || !myBus?.number) return;
    const id = setInterval(fetchAssignedStudents, 15000);
    return () => clearInterval(id);
  }, [currentUser?.token, myBus?.number, fetchAssignedStudents]);

  const boardedCount  = myStudents.filter(s => s.attendanceStatus === 'Boarded').length;
  const waitingCount  = myStudents.filter(s => s.attendanceStatus === 'Waiting').length;
  const checklistDone = (myBus?.driverChecklist || []).filter(c => c.done).length;
  const checklistTotal= (myBus?.driverChecklist || []).length;

  // GPS state
  const [gpsStatus,  setGpsStatus]  = useState('idle'); // idle | tracking | denied | error
  const [lastGps,    setLastGps]    = useState(null);
  const [stopETAs,   setStopETAs]   = useState({});
  const gpsWatchRef = useRef(null);

  // ── Start watching device GPS and push to server ──────────────────────────
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) {
      triggerToast('GPS not supported on this device.', 'warning');
      setGpsStatus('error');
      return;
    }
    setGpsStatus('tracking');
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, speed: rawSpeed } = pos.coords;
        const speedKmh = rawSpeed != null ? Math.round(rawSpeed * 3.6) : (myBus?.speed || 0);
        setLastGps({ lat, lng, speedKmh, ts: new Date() });

        const result = await pushDriverGPS({ lat, lng, speed: speedKmh });
        if (result?.stopETAs) setStopETAs(result.stopETAs);
      },
      (err) => {
        if (err.code === 1) setGpsStatus('denied');
        else setGpsStatus('error');
        triggerToast('GPS error: ' + err.message, 'warning');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, [pushDriverGPS, myBus?.speed, triggerToast]);

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current != null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    setGpsStatus('idle');
  }, []);

  // Auto-start GPS when driver dashboard mounts
  useEffect(() => {
    startGPS();
    return () => stopGPS();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuickDelay = async (mins) => {
    await updateBusStatus({ delayMins: mins });
    triggerToast(`${myBus?.number} — +${mins} min delay reported.`, 'warning');
  };

  const handleSOS = () => {
    const reason = prompt('State your emergency:', 'Breakdown / Medical emergency');
    if (reason && myBus) triggerSOS(myBus.id, reason);
  };

  // ── No bus assigned yet ───────────────────────────────────────────────────
  if (!myBus) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="page-hero page-hero-driver">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--cyan)', marginBottom: 6 }}>
            🚌 Driver Terminal
          </div>
          <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 900 }}>{currentUser?.name}</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            No bus is currently assigned to your account.
          </p>
        </div>
      </div>
      <div className="glass-card" style={{ textAlign: 'center', padding: 48 }}>
        <Bus size={48} style={{ color: 'var(--text-muted)', marginBottom: 16, display: 'block', margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 8 }}>
          Your account is not linked to any bus.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Please contact the transport administrator to assign bus <strong>{currentUser?.busNumber || '—'}</strong> to your profile.
        </p>
      </div>
    </div>
  );

  const nextStopETA = stopETAs[myBus.nextStop] ?? myBus.eta;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* ── Hero Banner ── */}
      <div className="page-hero page-hero-driver">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--cyan)', marginBottom: 6 }}>
            🚌 Driver Terminal
          </div>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 900 }}>{currentUser?.name}</h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ background: 'var(--cyan-soft)', padding: '3px 10px', borderRadius: 99, color: 'var(--cyan)', fontWeight: 700 }}>
              🚍 {myBus.number}
            </span>
            <span style={{ background: 'var(--primary-soft)', padding: '3px 10px', borderRadius: 99, color: 'var(--primary)', fontWeight: 700 }}>
              {myBus.route}
            </span>
            {/* Auto-detected weather chip */}
            <span style={{
              background: weather === 'Rainy' ? 'var(--cyan-soft)' : weather === 'Foggy' ? 'var(--violet-soft)' : 'var(--amber-soft)',
              padding: '3px 10px', borderRadius: 99,
              color: weather === 'Rainy' ? 'var(--cyan)' : weather === 'Foggy' ? 'var(--violet)' : 'var(--amber)',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5
            }}>
              {weather === 'Sunny' ? '☀️' : weather === 'Rainy' ? '🌧️' : '🌫️'} {weather}
              <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>
                {weatherSource === 'gps' ? '📡 Auto' : '—'}
              </span>
            </span>
            {/* GPS status pill */}
            <span style={{
              background: gpsStatus === 'tracking' ? 'var(--emerald-soft)' : 'var(--amber-soft)',
              padding: '3px 10px', borderRadius: 99,
              color: gpsStatus === 'tracking' ? 'var(--emerald)' : 'var(--amber)',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5
            }}>
              {gpsStatus === 'tracking' ? <Satellite size={11} /> : <WifiOff size={11} />}
              {gpsStatus === 'tracking' ? 'GPS Live' : gpsStatus === 'denied' ? 'GPS Denied' : 'GPS Off'}
            </span>
          </div>
          {lastGps && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}>
              📍 {lastGps.lat.toFixed(5)}°N, {lastGps.lng.toFixed(5)}°E · Updated {new Date(lastGps.ts).toLocaleTimeString()}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <span className={`badge ${myBus.status === 'On Route' ? 'badge-active' : myBus.status === 'Delayed' ? 'badge-warning' : myBus.status === 'Emergency' ? 'badge-danger' : 'badge-info'}`}
            style={{ fontSize: '0.84rem', padding: '7px 18px' }}>
            {myBus.status}
          </span>
          {gpsStatus !== 'tracking' && (
            <button className="btn btn-emerald" style={{ padding: '6px 14px', fontSize: '0.76rem' }} onClick={startGPS}>
              <Satellite size={13} /> Start GPS
            </button>
          )}
          {gpsStatus === 'tracking' && (
            <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.76rem' }} onClick={stopGPS}>
              <WifiOff size={13} /> Stop GPS
            </button>
          )}
        </div>
      </div>

      {/* ── 4 Stats ── */}
      <div className="dashboard-grid">
        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--cyan)' }}>
          <div className="stats-info">
            <h4>Passengers</h4>
            <h2 style={{ color: 'var(--cyan)' }}>{myBus.occupied}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/{myBus.capacity}</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>👥 On board now</div>
          </div>
          <div className="stats-icon cyan-light"><Users size={22} /></div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: `3px solid ${myBus.fuel < 30 ? 'var(--rose)' : myBus.fuel < 50 ? 'var(--amber)' : 'var(--emerald)'}` }}>
          <div className="stats-info">
            <h4>Fuel Level</h4>
            <h2 style={{ color: myBus.fuel < 30 ? 'var(--rose)' : myBus.fuel < 50 ? 'var(--amber)' : 'var(--emerald)' }}>{myBus.fuel}<span style={{ fontSize: '1.2rem' }}>%</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{myBus.fuel < 30 ? '🚨 Refuel urgently' : myBus.fuel < 50 ? '⚠ Refuel soon' : '✅ Sufficient'}</div>
          </div>
          <div className="stats-icon" style={{ background: myBus.fuel < 50 ? 'var(--amber-soft)' : 'var(--emerald-soft)', color: myBus.fuel < 50 ? 'var(--amber)' : 'var(--emerald)', width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${myBus.fuel < 50 ? 'var(--amber-glow)' : 'var(--emerald-glow)'}` }}>
            <Fuel size={22} />
          </div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="stats-info">
            <h4>Checklist</h4>
            <h2 style={{ color: 'var(--primary)' }}>{checklistDone}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/{checklistTotal}</span></h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>✅ Tasks done</div>
          </div>
          <div className="stats-icon primary-light"><CheckCircle size={22} /></div>
        </div>

        <div className="glass-card stats-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stats-info">
            <h4>Waiting</h4>
            <h2 style={{ color: waitingCount > 0 ? 'var(--amber)' : 'var(--emerald)' }}>{waitingCount}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>⏳ Students at stops</div>
          </div>
          <div className="stats-icon amber-light"><Clock size={22} /></div>
        </div>
      </div>

      {/* ── Map + Actions ── */}
      <div className="two-col-grid">

        {/* Mini map */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title"><Navigation size={18} /> My Route — Live GPS</h3>
            <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.75rem' }}
              onClick={() => setCurrentView('driver-tracking')}>
              Full Map <ArrowRight size={13} />
            </button>
          </div>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border)', height: 280 }}>
            <FleetMap
              buses={buses}
              selectedBusId={myBus.id}
              height="280px"
              zoom={14}
              singleBus
            />
          </div>

          {/* Stop ETAs */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.8px', marginBottom: 8 }}>
              Live ETAs to Remaining Stops
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
              {(myBus.stopSequence || []).map(stop => {
                const eta = stopETAs[stop];
                const isNext = stop === myBus.nextStop;
                return (
                  <div key={stop} style={{
                    padding: '7px 10px', borderRadius: 10,
                    background: isNext ? 'var(--cyan-soft)' : 'var(--bg-tertiary)',
                    border: `1px solid ${isNext ? 'var(--cyan)' : 'var(--card-border)'}`,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isNext ? 'var(--cyan)' : 'var(--text-primary)', marginTop: 2 }}>
                      {eta != null ? `${eta}m` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Speed chip */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1, padding: '8px', borderRadius: 10, background: 'var(--emerald-soft)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Speed</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--emerald)', marginTop: 2 }}>{lastGps?.speedKmh ?? myBus.speed} km/h</div>
            </div>
            <div style={{ flex: 1, padding: '8px', borderRadius: 10, background: 'var(--primary-soft)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Next Stop ETA</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>{nextStopETA} min</div>
            </div>
          </div>
        </div>

        {/* Actions + Passengers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div className="glass-card">
            <h3 className="glass-card-title"><Activity size={16} /> Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => setCurrentView('driver-interface')}>
                <MapPin size={15} /> Stop Checklist
              </button>
              <button className="btn btn-cyan" style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => setCurrentView('driver-boarding')}>
                <Users size={15} /> Scan Student Boarding
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, border: '1px solid var(--amber)', color: 'var(--amber)', fontSize: '0.78rem' }}
                  onClick={() => handleQuickDelay(5)} disabled={myBus.status === 'Emergency'}>
                  +5 Min Delay
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, border: '1px solid var(--amber)', color: 'var(--amber)', fontSize: '0.78rem' }}
                  onClick={() => handleQuickDelay(15)} disabled={myBus.status === 'Emergency'}>
                  +15 Min Delay
                </button>
              </div>
              <button className="btn btn-rose" style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={handleSOS} disabled={myBus.status === 'Emergency'}>
                <ShieldAlert size={15} /> {myBus.status === 'Emergency' ? 'SOS Active — Dispatched' : 'Emergency SOS'}
              </button>
            </div>
          </div>

          <div className="glass-card">
            <h3 className="glass-card-title"><Users size={16} /> Passenger Summary</h3>
            {myStudents.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No students assigned to this bus yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
                {myStudents.slice(0, 6).map(s => (
                  <div key={s.id || s._id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 10,
                    background: s.attendanceStatus === 'Boarded' ? 'var(--emerald-soft)' : s.attendanceStatus === 'Waiting' ? 'var(--amber-soft)' : 'var(--rose-soft)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {s.pickupPoint || s.boardingStop}
                        {stopETAs[s.pickupPoint || s.boardingStop] != null
                          ? ` · ETA ${stopETAs[s.pickupPoint || s.boardingStop]}m` : ''}
                      </div>
                    </div>
                    <span className={`badge ${s.attendanceStatus === 'Boarded' ? 'badge-active' : s.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger'}`}
                      style={{ fontSize: '0.62rem' }}>
                      {s.attendanceStatus}
                    </span>
                  </div>
                ))}
                {myStudents.length > 6 && (
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: 4 }}>
                    +{myStudents.length - 6} more students
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DriverDashboardView;
