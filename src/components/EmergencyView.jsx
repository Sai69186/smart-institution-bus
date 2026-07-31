import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { ShieldAlert, AlertOctagon, CheckCircle, RefreshCw } from 'lucide-react';

const EmergencyView = () => {
  const {
    currentUser, buses, triggerToast,
    triggerSOSApi, fetchActiveEmergencies, resolveEmergency,
    // local state fallback for non-admin / driver views
    sosMessages, resolveSOS, triggerSOS,
  } = useContext(AppContext);

  const [dbEmergencies, setDbEmergencies]   = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [resolvingId,    setResolvingId]    = useState(null);
  const [resolution,     setResolution]    = useState('');

  const isAdmin  = currentUser?.role === 'admin';
  const isDriver = currentUser?.role === 'driver';

  // Fetch DB emergencies for admin view
  const loadEmergencies = async () => {
    if (!isAdmin) return;
    setLoading(true);
    const result = await fetchActiveEmergencies();
    setDbEmergencies(result?.emergencies || []);
    setLoading(false);
  };

  useEffect(() => { loadEmergencies(); }, [currentUser?.role]);

  const standbyBuses = buses.filter(b => b.status === 'Standby');

  // Driver triggers SOS via real API
  const handleDriverSOS = async () => {
    const reason = prompt('State your emergency:', 'Breakdown / Medical emergency');
    if (!reason) return;
    const result = await triggerSOSApi({ reason });
    if (result) {
      triggerToast(`🚨 SOS dispatched: ${reason}`, 'danger');
      // also update local state for immediate UI feedback
      triggerSOS(buses.find(b => b.driverId?.toString() === currentUser?.id)?.id, reason);
    }
  };

  // Admin resolves via real API
  const handleResolve = async (emergencyId) => {
    setResolvingId(emergencyId);
    const ok = await resolveEmergency(emergencyId, resolution);
    if (ok) {
      setResolution('');
      loadEmergencies();
    }
    setResolvingId(null);
  };

  // Admin simulates SOS (for demo)
  const handleSimulateSOS = async () => {
    const reason = prompt('Enter simulated distress signal:', 'Transmission Failure');
    if (!reason) return;
    const result = await triggerSOSApi({ reason });
    if (result) {
      triggerToast(`🚨 Simulated SOS: ${reason}`, 'danger');
      loadEmergencies();
    }
  };

  return (
    <div className="two-col-grid">

      {/* ── Active Emergencies ── */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', borderLeft: '4px solid var(--rose)' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title" style={{ color: 'var(--rose)' }}>
            <AlertOctagon size={18} /> Active Incident Response
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-danger">Emergency Channel</span>
            {isAdmin && (
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                onClick={loadEmergencies} disabled={loading}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16, flex: 1 }}>

          {/* Driver SOS button */}
          {isDriver && (
            <button className="btn btn-rose" style={{ width: '100%' }} onClick={handleDriverSOS}>
              <ShieldAlert size={16} /> Trigger Emergency SOS
            </button>
          )}

          {/* Admin — DB emergencies */}
          {isAdmin && !loading && dbEmergencies.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <ShieldAlert size={40} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No active emergencies.</span>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={handleSimulateSOS}>
                Simulate Driver Panic Trigger
              </button>
            </div>
          )}

          {isAdmin && dbEmergencies.map(sos => (
            <div key={sos._id} style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.15)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, color: 'var(--rose)' }}>🚨 {sos.busNumber}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Driver: {sos.driverName}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Reason: "{sos.reason}"</div>
              {sos.location?.lat && (
                <div style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>
                  📍 {sos.location.lat.toFixed(4)}°N, {sos.location.lng.toFixed(4)}°E
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Resolution note (optional)..."
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  style={{ fontSize: '0.78rem' }}
                />
                <button className="btn btn-emerald" style={{ fontSize: '0.75rem' }}
                  onClick={() => handleResolve(sos._id)}
                  disabled={resolvingId === sos._id}>
                  <CheckCircle size={14} />
                  {resolvingId === sos._id ? 'Resolving...' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          ))}

          {/* Local SOS messages (driver/non-admin) */}
          {!isAdmin && sosMessages.filter(s => s.status === 'Active').map(sos => (
            <div key={sos.id} style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--rose)' }}>{sos.busNumber}</div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>{sos.reason}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{sos.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Resolution Log ── */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 className="glass-card-title">SOS Resolutions Log</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Incident resolution archives
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', maxHeight: 420 }}>
          {sosMessages.filter(s => s.status === 'Resolved').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No historical incident logs archived.
            </div>
          ) : (
            sosMessages.filter(s => s.status === 'Resolved').map(sos => (
              <div key={sos.id} style={{
                padding: 12, borderRadius: 10,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--card-border)',
                fontSize: '0.8rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ fontWeight: 700 }}>{sos.busNumber}</span>
                  <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>Resolved</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                  "{sos.reason}"
                </div>
                {sos.resolvedWith && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Backup: <strong>{sos.resolvedWith}</strong>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default EmergencyView;
