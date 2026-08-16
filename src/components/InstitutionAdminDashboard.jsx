import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  Bus, Users, MapPin, Plus, Trash2, Edit3, RefreshCw,
  Upload, Download, CheckCircle, AlertTriangle, Settings,
  BarChart2, Route, UserPlus
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import GeocodePicker from './GeocodePicker';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ─── tab components ──────────────────────────────────────────────────────────

const BusTab = ({ token, institutionId, triggerToast }) => {
  const [buses, setBuses]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editBus, setEditBus]   = useState(null);
  const [form, setForm]         = useState({
    busNumber:'', route:'', capacity:40, stopSequence:'', startingPoint:'',
    startingLat: null, startingLng: null,
  });

  const hdr = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

  const fetchBuses = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/buses`, { headers: hdr });
      const data = await res.json();
      if (res.ok) setBuses(data);
    } catch { /* keep */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBuses(); }, []);

  const openCreate = () => {
    setEditBus(null);
    setForm({ busNumber:'', route:'', capacity:40, stopSequence:'', startingPoint:'',
               startingLat: null, startingLng: null });
    setShowForm(true);
  };

  const openEdit = (bus) => {
    setEditBus(bus);
    setForm({
      busNumber:     bus.busNumber,
      route:         bus.route || '',
      capacity:      bus.capacity || 40,
      stopSequence:  (bus.stopSequence || []).join(', '),
      startingPoint: bus.startingPoint || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const stops = form.stopSequence
      ? form.stopSequence.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const body = {
      busNumber:     form.busNumber,
      route:         form.route,
      capacity:      Number(form.capacity),
      stopSequence:  stops,
      startingPoint: form.startingPoint || stops[0] || '',
      startingLat:   form.startingLat || null,
      startingLng:   form.startingLng || null,
    };

    try {
      const url    = editBus ? `${API}/buses/${editBus.busNumber}` : `${API}/buses`;
      const method = editBus ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: hdr, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(editBus ? 'Bus updated.' : 'Bus created.', 'success');
      setShowForm(false);
      fetchBuses();
    } catch { triggerToast('Server error.', 'danger'); }
  };

  const deleteBus = async (busNumber) => {
    if (!window.confirm(`Delete bus ${busNumber}?`)) return;
    try {
      const res  = await fetch(`${API}/buses/${busNumber}`, { method:'DELETE', headers: hdr });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(data.message, 'success');
      fetchBuses();
    } catch { triggerToast('Server error.', 'danger'); }
  };

  const optimizeBus = async (busNumber) => {
    try {
      const res  = await fetch(`${API}/buses/${busNumber}/optimize`, { method:'POST', headers: hdr });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(`Route optimized! Saved ${((data.before?.length || 0))} stops in best order.`, 'success');
      fetchBuses();
    } catch { triggerToast('Optimization failed.', 'danger'); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>
          Fleet — <span style={{ color:'var(--cyan)' }}>{buses.length} buses</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={fetchBuses} disabled={loading}>
            <RefreshCw size={14} style={{ marginRight:5 }} />Refresh
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={14} style={{ marginRight:5 }} />Add Bus
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
      ) : buses.length === 0 ? (
        <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
          No buses yet. Add your first bus to get started.
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
          {buses.map(bus => (
            <div key={bus._id} className="glass-card" style={{ padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--cyan)' }}>{bus.busNumber}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:2 }}>
                    {bus.route || 'No route set'}
                  </div>
                </div>
                <span style={{
                  background: bus.status === 'On Route' ? 'var(--emerald-soft)' : 'var(--bg-tertiary)',
                  color: bus.status === 'On Route' ? 'var(--emerald)' : 'var(--text-muted)',
                  padding:'2px 8px', borderRadius:99, fontSize:'0.7rem', fontWeight:700,
                }}>
                  {bus.status}
                </span>
              </div>

              <div style={{ display:'flex', gap:16, margin:'10px 0', fontSize:'0.8rem', color:'var(--text-muted)' }}>
                <span><Bus size={12} style={{ marginRight:3 }} />{bus.occupied || 0}/{bus.capacity} seats</span>
                <span><MapPin size={12} style={{ marginRight:3 }} />{(bus.stopSequence || []).length} stops</span>
              </div>

              {(bus.stopSequence || []).length > 0 && (
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:10,
                  background:'var(--bg-secondary)', padding:'4px 8px', borderRadius:6 }}>
                  {bus.stopSequence.slice(0, 3).join(' → ')}
                  {bus.stopSequence.length > 3 ? ` → +${bus.stopSequence.length - 3} more` : ''}
                </div>
              )}

              <div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary" style={{ flex:1, padding:'5px 8px', fontSize:'0.75rem' }}
                  onClick={() => openEdit(bus)}>
                  <Edit3 size={12} style={{ marginRight:4 }} />Edit
                </button>
                <button className="btn btn-secondary" style={{ flex:1, padding:'5px 8px', fontSize:'0.75rem' }}
                  onClick={() => optimizeBus(bus.busNumber)}
                  title="Run nearest-neighbor + 2-opt to optimize stop order">
                  <Route size={12} style={{ marginRight:4 }} />Optimize
                </button>
                <button onClick={() => deleteBus(bus.busNumber)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--rose)', padding:'5px 8px' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Bus Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="glass-card" style={{ width:'100%', maxWidth:500 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <h3 style={{ margin:0, fontWeight:800 }}>{editBus ? 'Edit Bus' : 'Add New Bus'}</h3>
              <button onClick={() => setShowForm(false)}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color:'var(--text-muted)' }}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div>
                  <label className="form-label">Bus Number *</label>
                  <input className="form-input" required value={form.busNumber}
                    disabled={!!editBus}
                    onChange={e => setForm(f => ({ ...f, busNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Capacity</label>
                  <input className="form-input" type="number" min={1} max={100} value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Route Name</label>
                  <input className="form-input" value={form.route}
                    onChange={e => setForm(f => ({ ...f, route: e.target.value }))} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">
                    Stops (comma-separated, first = start, last = campus)
                  </label>
                  <textarea className="form-input" rows={3} value={form.stopSequence}
                    placeholder="Stop A, Stop B, Stop C, Campus"
                    onChange={e => setForm(f => ({ ...f, stopSequence: e.target.value }))} />
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:3 }}>
                    The optimizer will reorder these for shortest distance when you click "Optimize".
                  </div>
                </div>
                {/* Geocode starting point */}
                <div style={{ gridColumn:'1/-1' }}>
                  <GeocodePicker
                    label="Geocode Starting Stop (optional — pins accurate location on map)"
                    placeholder={form.stopSequence
                      ? form.stopSequence.split(',')[0].trim() + ', Andhra Pradesh'
                      : 'First stop name, City, Andhra Pradesh'}
                    token={token}
                    initialLat={form.startingLat}
                    initialLng={form.startingLng}
                    onConfirm={({ lat, lng, displayName }) => {
                      const firstStop = form.stopSequence
                        ? form.stopSequence.split(',')[0].trim()
                        : displayName;
                      setForm(f => ({
                        ...f,
                        startingLat:   lat,
                        startingLng:   lng,
                        startingPoint: firstStop || f.startingPoint,
                      }));
                    }}
                  />
                  {form.startingLat && (
                    <div style={{ fontSize:'0.72rem', color:'var(--emerald)', marginTop:4 }}>
                      ✓ Starting point geocoded: {form.startingLat.toFixed(5)}°N, {form.startingLng.toFixed(5)}°E
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editBus ? 'Save Changes' : 'Create Bus'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Students tab ─────────────────────────────────────────────────────────────
const StudentsTab = ({ token, institutionId, triggerToast }) => {
  const [students, setStudents]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [genLogins, setGenLogins] = useState(false);
  const [form, setForm]           = useState({
    studentId:'', name:'', email:'', phone:'', department:'', year:'1st Year',
    pickupPoint:'', assignedBus:'', generateLogin: false,
  });
  const fileRef = useRef();

  const hdr = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/students`, { headers: { Authorization:`Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setStudents(data);
    } catch { /* keep */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStudents(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res  = await fetch(`${API}/students`, {
        method:'POST', headers: hdr,
        body: JSON.stringify({ ...form, generateLogin: form.generateLogin }),
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      if (data.userCreated) {
        triggerToast(`Student created! Login: ${data.userCreated.email} / ${data.userCreated.tempPassword}`, 'success');
      } else {
        triggerToast('Student created.', 'success');
      }
      setShowForm(false);
      fetchStudents();
    } catch { triggerToast('Server error.', 'danger'); }
  };

  const deleteStudent = async (studentId) => {
    if (!window.confirm(`Delete student ${studentId}?`)) return;
    try {
      const res  = await fetch(`${API}/students/${studentId}`, { method:'DELETE', headers: hdr });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(data.message, 'success');
      fetchStudents();
    } catch { triggerToast('Server error.', 'danger'); }
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('generateLogins', genLogins ? 'true' : 'false');
    try {
      const res  = await fetch(`${API}/students/upload_csv`, {
        method:'POST', headers: { Authorization:`Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(
        `Imported ${data.imported}, skipped ${data.skipped}${data.loginsCreated ? `, ${data.loginsCreated} logins created` : ''}.`,
        'success'
      );
      fetchStudents();
    } catch { triggerToast('Upload failed.', 'danger'); }
    e.target.value = '';
  };

  const bulkGenLogins = async () => {
    try {
      const res  = await fetch(`${API}/students/bulk_generate_logins`, { method:'POST', headers: hdr });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return; }
      triggerToast(`${data.created} login accounts created, ${data.skipped} already existed.`, 'success');
    } catch { triggerToast('Server error.', 'danger'); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontWeight:700, fontSize:'1rem' }}>
          Students — <span style={{ color:'var(--violet)' }}>{students.length} enrolled</span>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <label className="btn btn-secondary" style={{ cursor:'pointer', marginBottom:0 }}>
            <Upload size={14} style={{ marginRight:5 }} />CSV Import
            <input type="file" accept=".csv" ref={fileRef} onChange={handleCSV} style={{ display:'none' }} />
          </label>
          <button className="btn btn-secondary" onClick={bulkGenLogins}>
            <UserPlus size={14} style={{ marginRight:5 }} />Generate All Logins
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} style={{ marginRight:5 }} />Add Student
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--border)' }}>
                {['ID','Name','Department','Year','Pickup Stop','Assigned Bus','Action'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', fontWeight:700,
                    color:'var(--text-muted)', fontSize:'0.73rem', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s._id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'8px 10px', fontWeight:700, color:'var(--cyan)' }}>{s.studentId}</td>
                  <td style={{ padding:'8px 10px' }}>{s.name}</td>
                  <td style={{ padding:'8px 10px', color:'var(--text-muted)' }}>{s.department}</td>
                  <td style={{ padding:'8px 10px', color:'var(--text-muted)' }}>{s.year}</td>
                  <td style={{ padding:'8px 10px', color:'var(--text-muted)' }}>{s.pickupPoint || '—'}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <span style={{ color: s.assignedBus ? 'var(--emerald)' : 'var(--text-muted)', fontWeight: s.assignedBus ? 700 : 400 }}>
                      {s.assignedBus || 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 10px' }}>
                    <button onClick={() => deleteStudent(s.studentId)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--rose)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
                  No students yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Student Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="glass-card" style={{ width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <h3 style={{ margin:0, fontWeight:800 }}>Add Student</h3>
              <button onClick={() => setShowForm(false)}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color:'var(--text-muted)' }}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div>
                  <label className="form-label">Student ID *</label>
                  <input className="form-input" required value={form.studentId}
                    onChange={e => setForm(f=>({...f, studentId:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" required value={form.name}
                    onChange={e => setForm(f=>({...f, name:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" required value={form.email}
                    onChange={e => setForm(f=>({...f, email:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone}
                    onChange={e => setForm(f=>({...f, phone:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Department *</label>
                  <input className="form-input" required value={form.department}
                    onChange={e => setForm(f=>({...f, department:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Year *</label>
                  <select className="form-input" value={form.year}
                    onChange={e => setForm(f=>({...f, year:e.target.value}))}>
                    {['1st Year','2nd Year','3rd Year','4th Year'].map(y => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Pickup Stop</label>
                  <input className="form-input" value={form.pickupPoint}
                    onChange={e => setForm(f=>({...f, pickupPoint:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">Assigned Bus</label>
                  <input className="form-input" value={form.assignedBus}
                    onChange={e => setForm(f=>({...f, assignedBus:e.target.value}))} />
                </div>
                <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" id="genLogin" checked={form.generateLogin}
                    onChange={e => setForm(f=>({...f, generateLogin:e.target.checked}))} />
                  <label htmlFor="genLogin" style={{ cursor:'pointer', fontSize:'0.85rem' }}>
                    Auto-generate login account (temp password: studentId@transit)
                  </label>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Student</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const InstitutionAdminDashboard = ({ setCurrentView }) => {
  const { currentUser, triggerToast } = useContext(AppContext);
  const token         = currentUser?.token;
  const institutionId = currentUser?.institutionId;

  const [tab, setTab]           = useState('buses');
  const [institution, setInst]  = useState(null);

  const hdr = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

  useEffect(() => {
    if (institutionId) {
      fetch(`${API}/institutions/${institutionId}`, { headers: hdr })
        .then(r => r.json())
        .then(d => setInst(d))
        .catch(() => {});
    }
  }, [institutionId]);

  const TABS = [
    { id:'buses',    label:'Fleet / Buses', icon: <Bus size={15} /> },
    { id:'students', label:'Students',       icon: <Users size={15} /> },
  ];

  return (
    <div className="view-container">
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:'1.4rem', fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>
          <Settings size={22} style={{ color:'var(--violet)' }} />
          {institution?.name || 'Institution Admin'} — Management
        </h2>
        {institution && (
          <p style={{ margin:'4px 0 0', color:'var(--text-muted)', fontSize:'0.85rem' }}>
            {institution.city}{institution.state ? `, ${institution.state}` : ''} ·{' '}
            {institution.busCount ?? 0} buses · {institution.studentCount ?? 0} students
          </p>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid var(--border)', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background:'none', border:'none', cursor:'pointer',
              padding:'8px 18px', fontWeight: tab===t.id ? 800 : 500,
              color: tab===t.id ? 'var(--violet)' : 'var(--text-muted)',
              borderBottom: tab===t.id ? '2px solid var(--violet)' : '2px solid transparent',
              display:'flex', alignItems:'center', gap:6, fontSize:'0.88rem', marginBottom:'-2px',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'buses' && (
        <BusTab token={token} institutionId={institutionId} triggerToast={triggerToast} />
      )}
      {tab === 'students' && (
        <StudentsTab token={token} institutionId={institutionId} triggerToast={triggerToast} />
      )}
    </div>
  );
};

export default InstitutionAdminDashboard;

