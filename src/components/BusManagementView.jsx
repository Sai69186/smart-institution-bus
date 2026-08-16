import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Bus, Plus, Wrench, UserCheck, UserX, RefreshCw,
  Satellite, Loader, MapPin, Navigation, Edit2, CheckCircle
} from 'lucide-react';
import SkeletonCardList from './SkeletonLoader';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ROUTE_OPTIONS = [
  {
    label: 'Route A — Vadlamudi → Vignan LARA',
    stops: ['Vadlamudi Bus Stand','Guntur Highway Gate','VLITS Main Gate','Vignan LARA — Main Campus']
  },
  {
    label: 'Route B — Tenali Road → Vignan LARA',
    stops: ['Tenali Road Stop','Pedaparupudi Junction','Chebrolu Cross Roads','Vignan LARA — Main Campus']
  },
  {
    label: 'Route C — Kollipara → Vignan LARA',
    stops: ['Kollipara Village Stop','Mangalagiri Bypass','Hostel Block — VLITS','Vignan LARA — Main Campus']
  },
  {
    label: 'Route D — Amaravati → Vignan LARA',
    stops: ['Amaravati Capital Stop','Undavalli Junction','Tadepalli Gate','Vignan LARA — Main Campus']
  },
  {
    label: 'Route E — Guntur City → Vignan LARA',
    stops: ['Guntur RTC Complex','Brodipet Stop','Nallapadu Gate','Vignan LARA — Main Campus']
  },
];

const BusManagementView = () => {
  const {
    buses, fetchBuses, triggerToast, currentUser,
    assignDriverToBus, unassignDriverFromBus,
    fetchUnassignedDrivers, fetchAllDrivers,
    setBusStartingPoint, busesLoading
  } = useContext(AppContext);

  const [allDrivers,        setAllDrivers]        = useState([]);
  const [unassignedDrivers, setUnassignedDrivers] = useState([]);
  const [loadingDrivers,    setLoadingDrivers]    = useState(false);
  const [assigning,         setAssigning]         = useState(null);
  const [assignMap,         setAssignMap]         = useState({});

  // Starting point edit state
  const [editingStartId,  setEditingStartId]  = useState(null); // busNumber being edited
  const [startPickMap,    setStartPickMap]    = useState({});   // busNumber → selected stop
  const [savingStart,     setSavingStart]     = useState(null);

  // Add-bus form
  const [newBusNum,  setNewBusNum]  = useState('');
  const [newRoute,   setNewRoute]   = useState(ROUTE_OPTIONS[0].label);
  const [newCap,     setNewCap]     = useState(50);
  const [addingBus,  setAddingBus]  = useState(false);

  const loadDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    const [all, unassigned] = await Promise.all([
      fetchAllDrivers(),
      fetchUnassignedDrivers()
    ]);
    setAllDrivers(all);
    setUnassignedDrivers(unassigned);
    setLoadingDrivers(false);
  }, [fetchAllDrivers, fetchUnassignedDrivers]);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  // ── Create bus ──────────────────────────────────────────────────────────
  const handleAddBus = async (e) => {
    e.preventDefault();
    if (!newBusNum.trim()) { triggerToast('Bus number is required.', 'warning'); return; }
    setAddingBus(true);
    try {
      const routeObj = ROUTE_OPTIONS.find(r => r.label === newRoute);
      const res = await fetch(`${API}/buses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({
          busNumber:     newBusNum.trim().toUpperCase(),
          route:         newRoute,
          capacity:      parseInt(newCap),
          stopSequence:  routeObj?.stops || [],
          startingPoint: routeObj?.stops[0] || ''
        })
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(`Bus ${data.busNumber} added — starting point: ${data.startingPoint || data.stopSequence?.[0]}.`, 'success');
      setNewBusNum('');
      await fetchBuses();
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    finally  { setAddingBus(false); }
  };

  // ── Assign driver ────────────────────────────────────────────────────────
  const handleAssign = async (busNumber) => {
    const driverId = assignMap[busNumber];
    if (!driverId) { triggerToast('Select a driver first.', 'warning'); return; }
    setAssigning(busNumber);
    const result = await assignDriverToBus(busNumber, driverId);
    if (result.success) {
      triggerToast(result.message, 'success');
      setAssignMap(prev => { const n = {...prev}; delete n[busNumber]; return n; });
      await Promise.all([loadDrivers(), fetchBuses()]);
    } else {
      triggerToast(result.message || 'Assignment failed.', 'danger');
    }
    setAssigning(null);
  };

  // ── Unassign driver ──────────────────────────────────────────────────────
  const handleUnassign = async (busNumber, driverName) => {
    if (!window.confirm(`Remove ${driverName} from ${busNumber}?`)) return;
    const result = await unassignDriverFromBus(busNumber);
    if (result.success) {
      triggerToast(`Driver removed from ${busNumber}.`, 'info');
      await Promise.all([loadDrivers(), fetchBuses()]);
    } else { triggerToast('Unassign failed.', 'danger'); }
  };

  // ── Set starting point ───────────────────────────────────────────────────
  const handleSetStartingPoint = async (busNumber) => {
    const stop = startPickMap[busNumber];
    if (!stop) { triggerToast('Select a starting stop.', 'warning'); return; }
    setSavingStart(busNumber);
    const result = await setBusStartingPoint(busNumber, stop);
    if (result.success) {
      triggerToast(result.message, 'success');
      setEditingStartId(null);
      setStartPickMap(prev => { const n = {...prev}; delete n[busNumber]; return n; });
    } else { triggerToast(result.message || 'Failed.', 'danger'); }
    setSavingStart(null);
  };

  // ── Maintenance toggle ───────────────────────────────────────────────────
  const handleMaintenance = async (busNumber, currentStatus) => {
    const nextStatus = currentStatus === 'Maintenance' ? 'Standby' : 'Maintenance';
    try {
      await fetch(`${API}/buses/${busNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ status: nextStatus })
      });
      triggerToast(`${busNumber} → ${nextStatus}`, 'info');
      fetchBuses();
    } catch { triggerToast('Update failed.', 'danger'); }
  };

  const assignedBuses   = buses.filter(b => b.driver && b.driver !== 'Unassigned');
  const unassignedBuses = buses.filter(b => !b.driver || b.driver === 'Unassigned');

  if (busesLoading && buses.length === 0) return <SkeletonCardList count={6} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Stats ── */}
      <div className="dashboard-grid">
        {[
          { label: 'Total Buses',     value: buses.length,                               color: 'var(--primary)',  icon: <Bus size={22} /> },
          { label: 'Driver Assigned', value: assignedBuses.length,                       color: 'var(--emerald)', icon: <UserCheck size={22} /> },
          { label: 'Awaiting Driver', value: unassignedBuses.length,                     color: 'var(--amber)',   icon: <UserX size={22} /> },
          { label: 'GPS Active',      value: buses.filter(b => b.gpsLat).length,         color: 'var(--cyan)',    icon: <Satellite size={22} /> },
        ].map(s => (
          <div key={s.label} className="glass-card stats-card" style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="stats-info"><h4>{s.label}</h4><h2 style={{ color: s.color }}>{s.value}</h2></div>
            <div className="stats-icon" style={{ background: `${s.color}18`, color: s.color, width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${s.color}33` }}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="two-col-grid">

        {/* ── Left: Fleet Table ── */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)' }}>
            <h3 className="glass-card-title" style={{ margin: 0 }}><Bus size={18} /> Fleet Inventory</h3>
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '0.74rem' }}
              onClick={() => { fetchBuses(); loadDrivers(); }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Bus No.</th>
                  <th>Starting Point</th>
                  <th>Driver</th>
                  <th>GPS</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {buses.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No buses registered yet.</td></tr>
                )}
                {buses.map(bus => {
                  // Get stops from live bus data (DB stopSequence takes priority over static routes)
                  const stops = bus.stopSequence?.length > 0
                    ? bus.stopSequence
                    : ROUTE_OPTIONS.find(r => r.label === bus.route)?.stops || [];
                  const isEditingStart = editingStartId === bus.number;

                  return (
                    <tr key={bus.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.85rem' }}>{bus.number}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bus.route}</div>
                      </td>

                      {/* Starting Point cell */}
                      <td>
                        {isEditingStart ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select
                              className="form-input"
                              style={{ padding: '4px 6px', fontSize: '0.7rem', width: 140, height: 28 }}
                              value={startPickMap[bus.number] || bus.startingPoint || ''}
                              onChange={e => setStartPickMap(prev => ({ ...prev, [bus.number]: e.target.value }))}
                            >
                              <option value="">— Select Stop —</option>
                              {stops.filter(s => s !== 'Vignan LARA — Main Campus').map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <button className="btn btn-emerald" style={{ padding: '4px 7px', fontSize: '0.68rem' }}
                              onClick={() => handleSetStartingPoint(bus.number)}
                              disabled={savingStart === bus.number}>
                              {savingStart === bus.number ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '4px 7px', fontSize: '0.68rem' }}
                              onClick={() => setEditingStartId(null)}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <div>
                              {bus.startingPoint ? (
                                <div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={10} /> {bus.startingPoint}
                                  </div>
                                  {bus.startingLat && (
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                      {bus.startingLat.toFixed(4)}°N
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: 'var(--amber)', fontWeight: 600 }}>Not set</span>
                              )}
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: '0.62rem', color: 'var(--primary)' }}
                              onClick={() => { setEditingStartId(bus.number); setStartPickMap(prev => ({ ...prev, [bus.number]: bus.startingPoint || '' })); }}
                              title="Edit starting point">
                              <Edit2 size={10} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Driver */}
                      <td>
                        {bus.driver && bus.driver !== 'Unassigned' ? (
                          <span style={{ color: 'var(--emerald)', fontWeight: 700, fontSize: '0.8rem' }}>✓ {bus.driver}</span>
                        ) : (
                          <div>
                            <div style={{ color: 'var(--amber)', fontSize: '0.74rem', fontWeight: 600, marginBottom: 4 }}>Unassigned</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <select
                                className="form-input"
                                style={{ padding: '3px 5px', fontSize: '0.68rem', width: 120, height: 26 }}
                                value={assignMap[bus.number] || ''}
                                onChange={e => setAssignMap(prev => ({ ...prev, [bus.number]: e.target.value }))}
                              >
                                <option value="">Select driver</option>
                                {unassignedDrivers.map(d => (
                                  <option key={d._id} value={d._id}>{d.name}</option>
                                ))}
                              </select>
                              <button className="btn btn-emerald" style={{ padding: '3px 6px', fontSize: '0.66rem' }}
                                onClick={() => handleAssign(bus.number)}
                                disabled={assigning === bus.number || !assignMap[bus.number]}>
                                {assigning === bus.number ? <Loader size={10} className="animate-spin" /> : <UserCheck size={10} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* GPS */}
                      <td>
                        {bus.gpsLat ? (
                          <div>
                            <span className="badge badge-active" style={{ fontSize: '0.58rem' }}><Satellite size={8} /> Live</span>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {bus.speed} km/h
                            </div>
                          </div>
                        ) : (
                          <span className="badge badge-info" style={{ fontSize: '0.58rem' }}>Off</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge ${
                          bus.status === 'On Route'    ? 'badge-active'  :
                          bus.status === 'Delayed'     ? 'badge-warning' :
                          bus.status === 'Emergency'   ? 'badge-danger'  :
                          bus.status === 'Maintenance' ? 'badge-primary' : 'badge-info'
                        }`} style={{ fontSize: '0.6rem' }}>
                          {bus.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {bus.driver && bus.driver !== 'Unassigned' && (
                            <button className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.68rem', color: 'var(--rose)', borderColor: 'var(--rose-glow)' }}
                              onClick={() => handleUnassign(bus.number, bus.driver)} title="Remove driver">
                              <UserX size={12} />
                            </button>
                          )}
                          <button className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                            onClick={() => handleMaintenance(bus.number, bus.status)} title="Toggle maintenance">
                            <Wrench size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right: Add Bus + Drivers ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Add Bus form */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}><Plus size={16} /> Register New Bus</h3>
            <form onSubmit={handleAddBus} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Bus Number *</label>
                <input className="form-input" placeholder="e.g. VL-F01" value={newBusNum}
                  onChange={e => setNewBusNum(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Route</label>
                <select className="form-input" value={newRoute} onChange={e => setNewRoute(e.target.value)}>
                  {ROUTE_OPTIONS.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Seat Capacity</label>
                <input className="form-input" type="number" min={10} max={80} value={newCap}
                  onChange={e => setNewCap(e.target.value)} />
              </div>
              {/* Show auto-derived starting point */}
              <div style={{ padding: '10px 14px', borderRadius: 11, background: 'var(--primary-soft)', border: '1px solid var(--primary-glow)', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700 }}>
                  <Navigation size={13} /> Starting Point
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                  {ROUTE_OPTIONS.find(r => r.label === newRoute)?.stops[0] || '—'}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Auto-set from first stop of selected route. Can be changed after creation.
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={addingBus} style={{ width: '100%' }}>
                {addingBus ? <><Loader size={14} className="animate-spin" /> Adding...</> : <><Plus size={14} /> Add to Fleet</>}
              </button>
            </form>
          </div>

          {/* Registered drivers */}
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title"><UserCheck size={16} /> Registered Drivers</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {loadingDrivers ? 'Loading…' : `${allDrivers.length} total`}
              </span>
            </div>
            {loadingDrivers ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
                <Loader size={20} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
              </div>
            ) : allDrivers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                No drivers registered yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {allDrivers.map(d => {
                  const assignedBus = buses.find(b => b.driverId?.toString() === d._id?.toString());
                  return (
                    <div key={d._id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 12,
                      background: assignedBus ? 'var(--emerald-soft)' : 'var(--amber-soft)',
                      border: `1px solid ${assignedBus ? 'var(--emerald-glow)' : 'var(--amber-glow)'}`
                    }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{d.email}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {assignedBus ? (
                          <div>
                            <span className="badge badge-active" style={{ fontSize: '0.62rem' }}>
                              <Bus size={9} /> {assignedBus.number}
                            </span>
                            {assignedBus.startingPoint && (
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                📍 {assignedBus.startingPoint}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '0.62rem' }}>No Bus</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusManagementView;
