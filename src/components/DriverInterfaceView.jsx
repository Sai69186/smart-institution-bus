import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { Sliders, AlertTriangle, MapPin, Satellite } from 'lucide-react';

const DriverInterfaceView = ({ myBusOnly = false }) => {
  const {
    buses, triggerSOS, addAlert, triggerToast,
    currentUser, toggleChecklistItem, updateBusStatus
  } = useContext(AppContext);

  // Driver: lock to their own bus; admin: can switch between all buses
  const myBus = buses.find(b =>
    b.driverId?.toString() === currentUser?.id?.toString() ||
    b.number === currentUser?.busNumber
  );

  const defaultBusId = myBusOnly ? myBus?.id : (myBus?.id || buses[0]?.id);
  const [selectedBusId, setSelectedBusId] = useState(defaultBusId);
  const driverBus = myBusOnly
    ? myBus
    : (buses.find(b => b.id === selectedBusId) || buses[0]);

  const handleToggle = async (idx) => {
    if (!driverBus) return;
    const current = driverBus.driverChecklist[idx]?.done;
    if (myBusOnly) {
      await toggleChecklistItem(idx, !current);
    } else {
      // Admin view — optimistic local update only
      addAlert(`Admin toggled checklist item for ${driverBus.number}.`, 'info');
    }
  };

  const handleReportDelay = async (mins) => {
    if (!driverBus) return;
    if (myBusOnly) {
      await updateBusStatus({ delayMins: mins });
    } else {
      addAlert(`${driverBus.number} reported a delay of +${mins} mins.`, 'warning');
    }
    triggerToast(`+${mins} min delay reported for ${driverBus?.number}.`, 'warning');
  };

  const handleBreakdown = () => {
    const reason = prompt('Enter breakdown details:', 'Engine overheating');
    if (reason && driverBus) triggerSOS(driverBus.id, reason);
  };

  if (!driverBus) return (
    <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>
        No bus data available. Make sure buses are seeded in the database.
      </p>
    </div>
  );

  const checklistDone  = (driverBus.driverChecklist || []).filter(c => c.done).length;
  const checklistTotal = (driverBus.driverChecklist || []).length;
  const progressPct    = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div className="two-col-grid">

      {/* ── Left: Checklist ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Admin bus switcher */}
        {!myBusOnly && (
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Switch Driver Terminal:</span>
            <select
              className="form-input"
              value={selectedBusId || ''}
              onChange={e => setSelectedBusId(e.target.value)}
              style={{ width: 220 }}
            >
              {buses.map(b => (
                <option key={b.id} value={b.id}>{b.driver} — {b.number}</option>
              ))}
            </select>
          </div>
        )}

        {/* Progress bar */}
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Route Completion</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>{progressPct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`, height: '100%',
              background: 'linear-gradient(90deg, var(--primary), var(--cyan))',
              borderRadius: 99, transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}>
            {checklistDone} / {checklistTotal} tasks complete
          </div>
        </div>

        {/* Checklist */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h3 className="glass-card-title">
              <MapPin size={18} style={{ color: 'var(--primary)' }} />
              Stop Verification Checklist
            </h3>
            <span className="badge badge-primary" style={{ fontSize: '0.68rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {driverBus.route}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Tick off each stop as students board. Updates save to the server in real time.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(driverBus.driverChecklist || []).map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleToggle(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', borderRadius: 11, cursor: 'pointer',
                  background: item.done ? 'var(--emerald-soft)' : 'var(--bg-tertiary)',
                  border: `1px solid ${item.done ? 'var(--emerald-glow)' : 'var(--card-border)'}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--emerald)', cursor: 'pointer', width: 15, height: 15 }}
                />
                <span style={{
                  fontSize: '0.82rem', flex: 1,
                  color: item.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                  textDecoration: item.done ? 'line-through' : 'none'
                }}>
                  {item.task}
                </span>
                {item.done && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--emerald)', fontWeight: 700 }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Actions + Diagnostics ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div className="glass-card">
          <h3 className="glass-card-title"><Sliders size={16} /> Driver Action Panel</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Report status changes — updates dispatch console and student ETAs instantly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid var(--card-border)', borderRadius: 11, padding: 14 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--amber)', marginBottom: 10 }}>
                ⚠ Report Traffic Delay
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[5, 10, 15].map(mins => (
                  <button
                    key={mins}
                    className="btn btn-secondary"
                    style={{ flex: 1, border: '1px solid var(--amber)', color: 'var(--amber)' }}
                    onClick={() => handleReportDelay(mins)}
                    disabled={driverBus.status === 'Emergency'}
                  >
                    +{mins} Min
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn btn-rose"
              style={{ width: '100%', padding: 12, fontSize: '0.82rem' }}
              onClick={handleBreakdown}
              disabled={driverBus.status === 'Emergency'}
            >
              <AlertTriangle size={16} /> Emergency SOS / Breakdown
            </button>
          </div>
        </div>

        {/* Live diagnostics */}
        <div className="glass-card">
          <h3 className="glass-card-title"><Satellite size={16} /> Live Diagnostics</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
            {[
              { label: 'Bus Number',  value: driverBus.number },
              { label: 'Driver',      value: driverBus.driver || 'Unassigned' },
              { label: 'Route',       value: driverBus.route  || '—' },
              { label: 'Fuel',        value: `${driverBus.fuel}%` },
              { label: 'Speed',       value: `${driverBus.speed} km/h` },
              { label: 'Next Stop',   value: driverBus.nextStop || '—' },
              { label: 'ETA to Next', value: `${driverBus.eta} min` },
              { label: 'GPS Lat',     value: driverBus.gpsLat ? driverBus.gpsLat.toFixed(5) : 'No GPS yet' },
              { label: 'GPS Lng',     value: driverBus.gpsLng ? driverBus.gpsLng.toFixed(5) : 'No GPS yet' },
            ].map(row => (
              <div key={row.label} className="detail-row">
                <span className="detail-label">{row.label}</span>
                <span className="detail-value">{row.value}</span>
              </div>
            ))}
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className={`badge ${
                driverBus.status === 'On Route'  ? 'badge-active'  :
                driverBus.status === 'Delayed'   ? 'badge-warning' :
                driverBus.status === 'Emergency' ? 'badge-danger'  : 'badge-info'
              }`}>
                {driverBus.status}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DriverInterfaceView;
