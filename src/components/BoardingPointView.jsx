import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { MapPin, Plus, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
import GeocodePicker from './GeocodePicker';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const BoardingPointView = () => {
  const { currentUser, triggerToast, fetchBoardingStops } = useContext(AppContext);

  const [stops,   setStops]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newLat,  setNewLat]  = useState('');
  const [newLng,  setNewLng]  = useState('');
  const [saving,  setSaving]  = useState(false);

  const token    = currentUser?.token;
  const isAdmin  = ['admin', 'institution_admin', 'super_admin'].includes(currentUser?.role);

  // ── Fetch stops from DB ───────────────────────────────────────────────────
  const loadStops = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/boarding_stops`);
      const data = await res.json();
      if (res.ok) setStops(Array.isArray(data) ? data : []);
      else triggerToast('Failed to load stops.', 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    setLoading(false);
  };

  useEffect(() => { loadStops(); }, []);

  // ── Add stop ──────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) { triggerToast('Stop name is required.', 'warning'); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API}/boarding_stops`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          name: newName.trim(),
          lat:  newLat ? parseFloat(newLat) : null,
          lng:  newLng ? parseFloat(newLng) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(`Stop "${newName}" added.`, 'success');
        setNewName(''); setNewLat(''); setNewLng('');
        loadStops();
        fetchBoardingStops(); // refresh signup dropdown
      } else {
        triggerToast(data.message, 'danger');
      }
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    setSaving(false);
  };

  // ── Delete stop ───────────────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete stop "${name}"?`)) return;
    try {
      const res  = await fetch(`${API}/boarding_stops/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(data.message, 'info');
        loadStops();
        fetchBoardingStops();
      } else {
        triggerToast(data.message, 'danger');
      }
    } catch { triggerToast('Cannot reach server.', 'danger'); }
  };

  // ── Toggle active/inactive ────────────────────────────────────────────────
  const handleToggle = async (stop) => {
    try {
      const res = await fetch(`${API}/boarding_stops/${stop._id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ isActive: !stop.isActive }),
      });
      if (res.ok) { loadStops(); fetchBoardingStops(); }
      else triggerToast('Update failed.', 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
  };

  return (
    <div className="two-col-grid">

      {/* ── Stop list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="glass-card">
          <div className="glass-card-header">
            <h3 className="glass-card-title">
              <MapPin size={18} /> Campus Boarding Points
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {stops.filter(s => s.isActive).length} active
              </span>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                onClick={loadStops} disabled={loading}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px', opacity: 0.4 }} />
              Loading stops...
            </div>
          ) : (
            <div className="table-container" style={{ marginTop: 14 }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Stop Name</th>
                    <th>Students</th>
                    <th>GPS</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {stops.map(stop => (
                    <tr key={stop._id}>
                      <td style={{ fontWeight: 700 }}>{stop.name}</td>
                      <td>
                        <span className={`badge ${stop.studentCount > 10 ? 'badge-primary' : 'badge-warning'}`}>
                          {stop.studentCount}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {stop.lat ? `${stop.lat.toFixed(3)}°N` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${stop.isActive ? 'badge-active' : 'badge-info'}`}
                          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                          onClick={() => isAdmin && handleToggle(stop)}>
                          {stop.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="btn btn-secondary"
                            style={{ padding: '5px 8px', color: 'var(--rose)' }}
                            onClick={() => handleDelete(stop._id, stop.name)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {stops.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                        No stops yet. Add one using the form.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add stop form ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {isAdmin && (
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16 }}>
              <Plus size={18} /> Add New Stop
            </h3>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Stop Name *</label>
                <input type="text" className="form-input"
                  placeholder="e.g. Vijayawada Bus Stand"
                  value={newName} onChange={e => setNewName(e.target.value)} />
              </div>

              {/* Geocode picker — search address → pins on map → drag to correct */}
              <GeocodePicker
                label="Geocode Location (search address to pin on map)"
                placeholder={newName ? `${newName}, Andhra Pradesh` : 'Search address or landmark...'}
                token={token}
                initialLat={newLat ? parseFloat(newLat) : null}
                initialLng={newLng ? parseFloat(newLng) : null}
                onConfirm={({ lat, lng }) => {
                  setNewLat(String(lat));
                  setNewLng(String(lng));
                }}
              />

              {/* Manual override fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Latitude</label>
                  <input type="number" step="any" className="form-input"
                    placeholder="16.2472"
                    value={newLat} onChange={e => setNewLat(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Longitude</label>
                  <input type="number" step="any" className="form-input"
                    placeholder="80.5418"
                    value={newLng} onChange={e => setNewLng(e.target.value)} />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Plus size={14} /> {saving ? 'Adding...' : 'Add Stop Point'}
              </button>
            </form>
          </div>
        )}

        {/* Summary card */}
        <div className="glass-card" style={{ borderLeft: '4px solid var(--emerald)' }}>
          <h3 className="glass-card-title" style={{ color: 'var(--emerald)', marginBottom: 14 }}>
            <CheckCircle size={18} /> Stop Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Total Stops',    value: stops.length,                               color: 'var(--primary)' },
              { label: 'Active',         value: stops.filter(s => s.isActive).length,       color: 'var(--emerald)' },
              { label: 'Inactive',       value: stops.filter(s => !s.isActive).length,      color: 'var(--amber)'   },
              { label: 'GPS Mapped',     value: stops.filter(s => s.lat).length,            color: 'var(--cyan)'    },
              { label: 'Total Students', value: stops.reduce((a, s) => a + (s.studentCount || 0), 0), color: 'var(--violet)' },
            ].map(r => (
              <div key={r.label} className="detail-row">
                <span className="detail-label">{r.label}</span>
                <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardingPointView;
