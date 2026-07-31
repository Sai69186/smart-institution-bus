import React, { useContext, useState, useMemo } from 'react';
import { AppContext, calcStopETAs, getMyStudent } from '../context/AppContext';
import { Bus, Navigation, Fuel, User, Clock, ShieldAlert, MapPin, Wifi } from 'lucide-react';
import StudentBusMap from './StudentBusMap';
import FleetMap from './FleetMap';
import { minsToTime, weatherDelayMins } from '../utils/studentHelpers';

const LiveTrackingView = ({ studentOnly = false, driverOnly = false }) => {
  const { buses, triggerSOS, currentUser, students, weather } = useContext(AppContext);

  const myStudent = studentOnly ? getMyStudent(students, currentUser) : null;
  const myBusFromStudent = myStudent ? buses.find(b => b.number === myStudent.assignedBus) : null;

  const defaultBus = driverOnly
    ? buses.find(b => b.driverId?.toString() === currentUser?.id?.toString() || b.number === currentUser?.busNumber)
    : studentOnly && myBusFromStudent
      ? myBusFromStudent
      : buses[0];

  const [selectedBusId, setSelectedBusId] = useState(defaultBus?.id);

  // Keep selection in sync if buses load after mount
  useMemo(() => {
    if (!selectedBusId && defaultBus?.id) setSelectedBusId(defaultBus.id);
  }, [defaultBus?.id]);

  const selectedBus = buses.find(b => b.id === selectedBusId) || buses[0];

  const stopETAs = useMemo(() => {
    if (!selectedBus?.gpsLat || !selectedBus?.gpsLng) return {};
    return calcStopETAs(
      selectedBus.gpsLat, selectedBus.gpsLng,
      selectedBus.stopSequence,
      selectedBus.speed || 30
    );
  }, [selectedBus?.gpsLat, selectedBus?.gpsLng, selectedBus?.speed]);

  const weatherOffset = weatherDelayMins(weather);
  const myStopETA = myStudent && stopETAs[myStudent.boardingStop] !== undefined
    ? stopETAs[myStudent.boardingStop] + weatherOffset
    : null;

  if (studentOnly && !myStudent) {
    return (
      <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Complete your student profile to track your assigned bus.</p>
      </div>
    );
  }

  return (
    <div className="two-col-grid">

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass-card" style={{ padding: 16 }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title">
              {studentOnly ? 'My Bus — Live Map' : 'Live Dispatch Tracking Map'}
            </h3>
            <span className="badge badge-active"><span className="pulse-green"></span>GPS Live</span>
          </div>

          {studentOnly ? (
            <div style={{ height: 440, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              <StudentBusMap
                myBus={selectedBus}
                myStudent={myStudent}
                stopETAs={stopETAs}
                height={440}
                zoom={13}
              />
            </div>
          ) : (
            <div style={{ height: 440, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              <FleetMap
                buses={buses}
                selectedBusId={selectedBusId}
                onSelectBus={setSelectedBusId}
                height="440px"
                zoom={13}
                singleBus={driverOnly}
              />
            </div>
          )}
        </div>

        {studentOnly && myStopETA !== null && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--cyan)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <MapPin size={18} style={{ color: 'var(--cyan)' }} />
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>Your Stop ETA</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: myStopETA <= 3 ? 'var(--rose)' : 'var(--emerald)' }}>
              {myStopETA} min
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {myStudent.boardingStop} · Arrives ~{minsToTime(myStopETA)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {!studentOnly && !driverOnly && (
          <div className="glass-card">
            <h3 className="glass-card-title">Select Active Vehicle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {buses.map(b => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBusId(b.id)}
                  style={{
                    padding: 12, borderRadius: 10,
                    background: b.id === selectedBusId ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255,255,255,0.01)',
                    border: `1px solid ${b.id === selectedBusId ? 'var(--cyan)' : 'var(--card-border)'}`,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{b.number}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{b.route}</div>
                  </div>
                  <span className={`badge ${
                    b.status === 'On Route' ? 'badge-active' :
                    b.status === 'Delayed' ? 'badge-warning' :
                    b.status === 'Emergency' ? 'badge-danger' : 'badge-info'
                  }`}>{b.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {studentOnly && selectedBus && (
          <div className="glass-card">
            <h3 className="glass-card-title"><Wifi size={16} /> Assigned Route Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Bus', value: myStudent.assignedBus },
                { label: 'Route', value: myStudent.assignedRoute },
                { label: 'Boarding Stop', value: myStudent.boardingStop },
                { label: 'Driver', value: selectedBus.driver }
              ].map(row => (
                <div key={row.label} className="detail-row">
                  <span className="detail-label">{row.label}</span>
                  <span className="detail-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedBus && (
          <div className="glass-card" style={{ borderLeft: `4px solid ${selectedBus.status === 'Emergency' ? 'var(--rose)' : 'var(--cyan)'}` }}>
            <h3 className="glass-card-title">
              <Bus size={18} />
              <span>Telematics: {selectedBus.number}</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <div className="detail-row">
                <span className="detail-label"><User size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Driver</span>
                <span className="detail-value">{selectedBus.driver}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Navigation size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Speed</span>
                <span className="detail-value">{selectedBus.speed} km/h</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Fuel size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Fuel</span>
                <span className="detail-value" style={{ color: selectedBus.fuel < 50 ? 'var(--amber)' : 'var(--emerald)' }}>{selectedBus.fuel}%</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Clock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Next Stop</span>
                <span className="detail-value" style={{ color: 'var(--cyan)' }}>{selectedBus.nextStop} ({selectedBus.eta} mins)</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Occupancy</span>
                <span className="detail-value">{selectedBus.occupied} / {selectedBus.capacity}</span>
              </div>
            </div>

            {!studentOnly && selectedBus.status !== 'Emergency' && selectedBus.status !== 'Standby' && (
              <button
                className="btn btn-rose"
                style={{ width: '100%', marginTop: 16, fontSize: '0.8rem' }}
                onClick={() => {
                  const reason = prompt('State emergency reason for SOS trigger:', 'Engine heating warning');
                  if (reason) triggerSOS(selectedBus.id, reason);
                }}
              >
                <ShieldAlert size={14} />
                <span>Simulate SOS Breakdown</span>
              </button>
            )}
          </div>
        )}

        {studentOnly && selectedBus && (
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 12 }}><MapPin size={16} /> Upcoming Stops</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(selectedBus.routeCoords || [])
                .filter(pt => pt.stop && stopETAs[pt.stop] !== undefined)
                .map((pt, i) => {
                  const isMyStop = pt.stop === myStudent?.boardingStop;
                  const eta = stopETAs[pt.stop] + weatherOffset;
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10,
                      background: isMyStop ? 'var(--primary-soft)' : 'var(--bg-tertiary)',
                      border: `1px solid ${isMyStop ? 'var(--primary)' : 'var(--card-border)'}`
                    }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: isMyStop ? 700 : 500, color: isMyStop ? 'var(--primary)' : 'var(--text-primary)' }}>
                        {isMyStop ? '⭐ ' : ''}{pt.stop}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: eta <= 3 ? 'var(--rose)' : 'var(--emerald)' }}>{eta} min</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveTrackingView;
