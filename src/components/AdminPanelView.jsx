import React, { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Sliders, Settings, ShieldCheck, Database, Key,
  Bus, UserCheck, UserX, Loader, RefreshCw, Satellite,
  MessageSquare, Star, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, User
} from 'lucide-react';

const TABS = [
  { key: 'drivers',   label: '🚌 Driver Assignment' },
  { key: 'feedbacks', label: '💬 Feedback & Complaints' },
  { key: 'ai',        label: '🤖 AI Calibration' },
  { key: 'telemetry', label: '📡 Telemetry' },
  { key: 'security',  label: '🔐 Security' },
];

const AdminPanelView = ({ initialTab = 'drivers' }) => {
  const {
    buses, fetchBuses, triggerToast, currentUser,
    assignDriverToBus, unassignDriverFromBus,
    fetchUnassignedDrivers, fetchAllDrivers,
    allFeedbacks, feedbacksLoading, fetchAllFeedbacks, updateFeedbackStatus
  } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState(initialTab);

  // ── Driver assignment state ───────────────────────────────────────────────
  const [allDrivers,        setAllDrivers]        = useState([]);
  const [unassignedDrivers, setUnassignedDrivers] = useState([]);
  const [loadingDrivers,    setLoadingDrivers]    = useState(false);
  const [assigning,         setAssigning]         = useState(null);
  const [assignMap,         setAssignMap]         = useState({});

  // ── Settings state ────────────────────────────────────────────────────────
  const [allowDriverEdits, setAllowDriverEdits] = useState(false);
  const [allowMfaForce,    setAllowMfaForce]    = useState(true);
  const [aiThreshold,      setAiThreshold]      = useState(1.5);
  const [gpsInterval,      setGpsInterval]      = useState(5);

  // ── Feedback state ─────────────────────────────────────────────────────────
  const [fbFilter,       setFbFilter]       = useState('All');
  const [fbSearch,       setFbSearch]       = useState('');
  const [expandedFb,     setExpandedFb]     = useState(null);
  const [noteMap,        setNoteMap]        = useState({});
  const [resolvingId,    setResolvingId]    = useState(null);

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

  useEffect(() => {
    if (activeTab === 'drivers') loadDrivers();
    if (activeTab === 'feedbacks') fetchAllFeedbacks();
  }, [activeTab, loadDrivers, fetchAllFeedbacks]);

  const handleAssign = async (busNumber) => {
    const driverId = assignMap[busNumber];
    if (!driverId) { triggerToast('Select a driver first.', 'warning'); return; }
    setAssigning(busNumber);
    const result = await assignDriverToBus(busNumber, driverId);
    if (result.success) {
      triggerToast(result.message, 'success');
      setAssignMap(prev => { const n = {...prev}; delete n[busNumber]; return n; });
      await loadDrivers();
      await fetchBuses();
    } else {
      triggerToast(result.message || 'Assignment failed.', 'danger');
    }
    setAssigning(null);
  };

  const handleUnassign = async (busNumber, driverName) => {
    if (!window.confirm(`Remove ${driverName} from ${busNumber}?`)) return;
    const result = await unassignDriverFromBus(busNumber);
    if (result.success) {
      triggerToast(`${driverName} unassigned from ${busNumber}.`, 'info');
      await loadDrivers();
      await fetchBuses();
    }
  };

  // ── Buses split by assignment status ─────────────────────────────────────
  const assignedBuses   = buses.filter(b => b.driver && b.driver !== 'Unassigned');
  const unassignedBuses = buses.filter(b => !b.driver || b.driver === 'Unassigned');

  // ── Feedback helpers ───────────────────────────────────────────────────────
  const handleFbStatus = async (id, status) => {
    setResolvingId(id);
    await updateFeedbackStatus(id, status, noteMap[id] || '');
    setResolvingId(null);
    setExpandedFb(null);
  };

  const fbCounts = {
    All:         allFeedbacks.length,
    Open:        allFeedbacks.filter(f => f.status === 'Open').length,
    'In Progress': allFeedbacks.filter(f => f.status === 'In Progress').length,
    Resolved:    allFeedbacks.filter(f => f.status === 'Resolved').length,
  };

  const filteredFb = allFeedbacks.filter(f => {
    const matchStatus = fbFilter === 'All' || f.status === fbFilter;
    const q = fbSearch.toLowerCase();
    const matchSearch = !q ||
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.message.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Buses',      value: buses.length,          color: 'var(--primary)', icon: <Bus size={20} /> },
          { label: 'Drivers Assigned', value: assignedBuses.length,  color: 'var(--emerald)', icon: <UserCheck size={20} /> },
          { label: 'Buses Awaiting',   value: unassignedBuses.length,color: 'var(--amber)',   icon: <UserX size={20} /> },
          { label: 'GPS Active Now',   value: buses.filter(b => b.gpsLat).length, color: 'var(--cyan)', icon: <Satellite size={20} /> },
        ].map(s => (
          <div key={s.label} className="glass-card stats-card" style={{ borderTop: `3px solid ${s.color}`, padding: 18 }}>
            <div className="stats-info">
              <h4>{s.label}</h4>
              <h2 style={{ color: s.color, fontSize: '1.8rem' }}>{s.value}</h2>
            </div>
            <div style={{ background: `${s.color}18`, color: s.color, width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${s.color}33` }}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--bg-tertiary)', padding: 4, borderRadius: 14, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 11, cursor: 'pointer',
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem',
              transition: 'all 0.2s ease',
              background: activeTab === t.key ? 'linear-gradient(135deg, var(--primary), var(--violet))' : 'transparent',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
              boxShadow: activeTab === t.key ? '0 4px 14px var(--primary-glow)' : 'none'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ Tab: Driver Assignment ══ */}
      {activeTab === 'drivers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Unassigned buses — need a driver */}
          <div className="glass-card" style={{ borderTop: '3px solid var(--amber)' }}>
            <div className="glass-card-header">
              <h3 className="glass-card-title"><UserX size={18} style={{ color: 'var(--amber)' }} /> Buses Awaiting Driver</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {unassignedDrivers.length} unassigned driver{unassignedDrivers.length !== 1 ? 's' : ''} available
                </span>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                  onClick={() => { loadDrivers(); fetchBuses(); }}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </div>

            {loadingDrivers ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)' }}>
                <Loader size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
                Loading…
              </div>
            ) : unassignedBuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--emerald)', fontSize: '0.88rem', fontWeight: 600 }}>
                ✅ All buses have assigned drivers!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {unassignedBuses.map(bus => (
                  <div key={bus.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 13,
                    background: 'var(--amber-soft)', border: '1px solid var(--amber-glow)',
                    gap: 12, flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                      <div style={{ background: 'var(--amber)', color: '#fff', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bus size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--amber)' }}>{bus.number}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bus.route}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      {unassignedDrivers.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No drivers available</span>
                      ) : (
                        <>
                          <select
                            className="form-input"
                            style={{ padding: '6px 10px', fontSize: '0.78rem', width: 180 }}
                            value={assignMap[bus.number] || ''}
                            onChange={e => setAssignMap(prev => ({ ...prev, [bus.number]: e.target.value }))}
                          >
                            <option value="">— Select Driver —</option>
                            {unassignedDrivers.map(d => (
                              <option key={d._id} value={d._id}>{d.name}</option>
                            ))}
                          </select>
                          <button
                            className="btn btn-emerald"
                            style={{ padding: '7px 16px', fontSize: '0.78rem' }}
                            onClick={() => handleAssign(bus.number)}
                            disabled={assigning === bus.number || !assignMap[bus.number]}
                          >
                            {assigning === bus.number
                              ? <><Loader size={13} className="animate-spin" /> Assigning…</>
                              : <><UserCheck size={13} /> Assign</>
                            }
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned buses */}
          <div className="glass-card" style={{ borderTop: '3px solid var(--emerald)' }}>
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
              <UserCheck size={18} style={{ color: 'var(--emerald)' }} /> Assigned Buses
            </h3>
            {assignedBuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                No buses assigned yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {assignedBuses.map(bus => (
                  <div key={bus.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 13,
                    background: 'var(--emerald-soft)', border: '1px solid var(--emerald-glow)',
                    gap: 12, flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ background: 'var(--emerald)', color: '#fff', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bus size={18} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--emerald)' }}>{bus.number}</span>
                          {bus.gpsLat && (
                            <span className="badge badge-active" style={{ fontSize: '0.58rem' }}>
                              <Satellite size={8} /> GPS Live
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          👤 {bus.driver} &nbsp;·&nbsp; {bus.route}
                        </div>
                        {/* Starting point */}
                        {bus.startingPoint && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            🚌 Starts at: <strong>{bus.startingPoint}</strong>
                          </div>
                        )}
                        {bus.gpsLat && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--cyan)', marginTop: 2 }}>
                            📍 {bus.gpsLat.toFixed(4)}°N, {bus.gpsLng.toFixed(4)}°E · {bus.speed} km/h · Next: {bus.nextStop} in {bus.eta}m
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${bus.status === 'On Route' ? 'badge-active' : bus.status === 'Delayed' ? 'badge-warning' : bus.status === 'Emergency' ? 'badge-danger' : 'badge-info'}`}
                        style={{ fontSize: '0.62rem' }}>
                        {bus.status}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.72rem', color: 'var(--rose)', borderColor: 'var(--rose-glow)' }}
                        onClick={() => handleUnassign(bus.number, bus.driver)}
                        title="Unassign driver"
                      >
                        <UserX size={13} /> Unassign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══ Tab: Feedback & Complaints ══ */}
      {activeTab === 'feedbacks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { label: 'Total',       value: fbCounts.All,           color: 'var(--primary)' },
              { label: 'Open',        value: fbCounts.Open,          color: 'var(--rose)'    },
              { label: 'In Progress', value: fbCounts['In Progress'],color: 'var(--amber)'   },
              { label: 'Resolved',    value: fbCounts.Resolved,      color: 'var(--emerald)' },
            ].map(s => (
              <div key={s.label} className="glass-card" style={{ padding: '14px 18px', borderTop: `3px solid ${s.color}`, cursor: 'pointer' }}
                onClick={() => setFbFilter(s.label === 'Total' ? 'All' : s.label)}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.8px' }}>{s.label}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)', marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="glass-card" style={{ padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <MessageSquare size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, category or message…"
              value={fbSearch}
              onChange={e => setFbSearch(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Open', 'In Progress', 'Resolved'].map(f => (
                <button key={f}
                  onClick={() => setFbFilter(f)}
                  style={{
                    padding: '5px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontSize: '0.74rem', fontWeight: 700,
                    background: fbFilter === f
                      ? f === 'Open' ? 'var(--rose)' : f === 'In Progress' ? 'var(--amber)' : f === 'Resolved' ? 'var(--emerald)' : 'var(--primary)'
                      : 'var(--bg-tertiary)',
                    color: fbFilter === f ? '#fff' : 'var(--text-muted)',
                  }}>
                  {f}
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }}
              onClick={fetchAllFeedbacks} disabled={feedbacksLoading}>
              <RefreshCw size={12} className={feedbacksLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {/* Feedback list */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {feedbacksLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader size={26} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px', opacity: 0.4 }} />
                Loading feedback…
              </div>
            ) : filteredFb.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <MessageSquare size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
                {allFeedbacks.length === 0 ? 'No feedback submitted yet.' : 'No results match your filter.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredFb.map((f, idx) => {
                  const isOpen = expandedFb === f._id;
                  const statusColor = f.status === 'Resolved' ? 'var(--emerald)' : f.status === 'In Progress' ? 'var(--amber)' : 'var(--rose)';
                  const StatusIcon = f.status === 'Resolved' ? CheckCircle : f.status === 'In Progress' ? Clock : AlertCircle;
                  return (
                    <div key={f._id} style={{
                      borderBottom: idx < filteredFb.length - 1 ? '1px solid var(--card-border)' : 'none',
                    }}>
                      {/* Row header */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer',
                          background: isOpen ? 'var(--primary-soft)' : 'transparent',
                          transition: 'background 0.15s' }}
                        onClick={() => setExpandedFb(isOpen ? null : f._id)}
                      >
                        {/* Avatar */}
                        <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                          background: `linear-gradient(135deg, ${statusColor}, var(--violet))`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>
                          {f.name?.charAt(0)}
                        </div>

                        {/* Name + category */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {f.name}
                            <span style={{ fontSize: '0.64rem', padding: '2px 7px', borderRadius: 20,
                              background: f.userRole === 'driver' ? 'var(--cyan-soft)' : 'var(--primary-soft)',
                              color: f.userRole === 'driver' ? 'var(--cyan)' : 'var(--primary)',
                              fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {f.userRole || 'student'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {f.category} · {f.date}
                          </div>
                        </div>

                        {/* Stars */}
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          {[1,2,3,4,5].map(v => (
                            <Star key={v} size={11}
                              fill={v <= f.rating ? 'var(--amber)' : 'none'}
                              stroke={v <= f.rating ? 'var(--amber)' : 'var(--text-muted)'} />
                          ))}
                        </div>

                        {/* Status badge */}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: '0.68rem', fontWeight: 800, color: statusColor, flexShrink: 0 }}>
                          <StatusIcon size={12} /> {f.status}
                        </span>

                        {isOpen ? <ChevronUp size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                : <ChevronDown size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div style={{ padding: '0 20px 18px 20px', background: 'var(--primary-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* Message */}
                          <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 10,
                            border: '1px solid var(--card-border)', fontSize: '0.82rem',
                            color: 'var(--text-primary)', lineHeight: 1.6 }}>
                            "{f.message}"
                          </div>

                          {/* Existing admin note */}
                          {f.adminNote && (
                            <div style={{ padding: 10, background: 'var(--emerald-soft)', borderRadius: 8,
                              border: '1px solid var(--emerald-glow)', fontSize: '0.76rem', color: 'var(--emerald)' }}>
                              📝 Admin note: {f.adminNote}
                            </div>
                          )}

                          {/* Admin note input */}
                          <textarea
                            className="form-input"
                            rows={2}
                            placeholder="Add a note for this ticket (optional)…"
                            value={noteMap[f._id] || ''}
                            onChange={e => setNoteMap(prev => ({ ...prev, [f._id]: e.target.value }))}
                            style={{ resize: 'none', fontSize: '0.78rem' }}
                          />

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {f.status !== 'In Progress' && (
                              <button className="btn btn-secondary"
                                style={{ fontSize: '0.76rem', color: 'var(--amber)', borderColor: 'var(--amber-glow)' }}
                                disabled={resolvingId === f._id}
                                onClick={() => handleFbStatus(f._id, 'In Progress')}>
                                <Clock size={13} /> Mark In Progress
                              </button>
                            )}
                            {f.status !== 'Resolved' && (
                              <button className="btn btn-emerald"
                                style={{ fontSize: '0.76rem' }}
                                disabled={resolvingId === f._id}
                                onClick={() => handleFbStatus(f._id, 'Resolved')}>
                                {resolvingId === f._id
                                  ? <><Loader size={12} className="animate-spin" /> Saving…</>
                                  : <><CheckCircle size={13} /> Mark Resolved</>}
                              </button>
                            )}
                            {f.status !== 'Open' && (
                              <button className="btn btn-secondary"
                                style={{ fontSize: '0.76rem', color: 'var(--rose)', borderColor: 'var(--rose-glow)' }}
                                disabled={resolvingId === f._id}
                                onClick={() => handleFbStatus(f._id, 'Open')}>
                                <AlertCircle size={13} /> Reopen
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Tab: AI Calibration ══ */}
      {activeTab === 'ai' && (
        <div className="grid-responsive">
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Settings style={{ color: 'var(--primary)' }} size={20} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>AI Model Calibration</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Variance Threshold Alert</label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{aiThreshold} mins</span>
                </div>
                <input type="range" min="0.5" max="5" step="0.1" value={aiThreshold}
                  onChange={e => setAiThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Flag predictions that deviate from actual boarding by this threshold.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Auto-retraining Period</label>
                <select className="form-input" defaultValue="weekly">
                  <option value="daily">Every 24 Hours (High compute)</option>
                  <option value="weekly">Weekly (Recommended)</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Telemetry ══ */}
      {activeTab === 'telemetry' && (
        <div className="grid-responsive">
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Database style={{ color: 'var(--cyan)' }} size={20} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>Telemetry Settings</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label className="form-label">GPS Sync Interval</label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--cyan)' }}>{gpsInterval}s</span>
                </div>
                <input type="range" min="1" max="30" step="1" value={gpsInterval}
                  onChange={e => setGpsInterval(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--cyan)' }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>How often driver device pushes GPS to server. Lower = more accurate, more data.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Offline Timeout Alert</label>
                <select className="form-input" defaultValue="30">
                  <option value="15">15 Seconds</option>
                  <option value="30">30 Seconds</option>
                  <option value="60">60 Seconds</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Security ══ */}
      {activeTab === 'security' && (
        <div className="grid-responsive">
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Key style={{ color: 'var(--emerald)' }} size={20} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>Security Policies</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input type="checkbox" checked={allowDriverEdits}
                  onChange={e => setAllowDriverEdits(e.target.checked)}
                  style={{ accentColor: 'var(--emerald)' }} />
                <span>Allow Drivers to report route deviations</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input type="checkbox" checked={allowMfaForce}
                  onChange={e => setAllowMfaForce(e.target.checked)}
                  style={{ accentColor: 'var(--emerald)' }} />
                <span>Enforce mandatory MFA for administrators</span>
              </label>
              <div style={{ marginTop: 16, padding: 12, background: 'var(--emerald-soft)', borderRadius: 10, border: '1px solid var(--emerald-glow)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <ShieldCheck size={16} style={{ color: 'var(--emerald)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>System security integrity verified.</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanelView;
