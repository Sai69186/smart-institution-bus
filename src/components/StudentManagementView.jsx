import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Users, Plus, Trash2, Edit2, Save, X,
  Upload, Search, RefreshCw, Bus, UserCheck,
  Eye, Phone, MapPin, Calendar, User, ChevronRight
} from 'lucide-react';

const API = 'http://localhost:5000/api';

const EMPTY_FORM = {
  studentId: '', name: '', email: '', phone: '',
  department: '', year: '1st Year', address: '',
  pickupPoint: '', assignedBus: '', assignedRoute: ''
};

// ── Student Detail Panel — defined OUTSIDE parent to avoid remount flicker ──
const DetailPanel = ({ s, buses, busPickMap, setBusPickMap, assigningId,
  handleQuickAssignBus, handleUnassignBus, handleEdit, handleDelete, onClose, setCurrentView }) => {
  const assignedBus = buses.find(b => b.number === s.assignedBus);
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
      background: 'var(--bg-secondary)', borderLeft: '1px solid var(--card-border)',
      zIndex: 999, display: 'flex', flexDirection: 'column',
      boxShadow: '-12px 0 48px rgba(0,0,0,0.18)',
      animation: 'dropdown-in 0.22s cubic-bezier(0.16,1,0.3,1) both'
    }}>
      {/* Panel header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-border)', background: 'linear-gradient(135deg, var(--primary-soft), transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, var(--primary), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: '1.2rem', boxShadow: '0 4px 14px var(--primary-glow)' }}>
            {s.name?.charAt(0)}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1rem' }}>{s.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.studentId}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }}>
          <X size={18} />
        </button>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Status badge */}
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={`badge ${s.attendanceStatus === 'Boarded' ? 'badge-active' : s.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger'}`}>
            {s.attendanceStatus}
          </span>
          {s.assignedBus && <span className="badge badge-info"><Bus size={9} /> {s.assignedBus}</span>}
        </div>

        {/* Personal details */}
        <div className="glass-card" style={{ padding: 16 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 12 }}>Personal Info</div>
          {[
            { icon: <User size={13} />,     label: 'Full Name',    value: s.name },
            { icon: <User size={13} />,     label: 'Student ID',   value: s.studentId },
            { icon: <Phone size={13} />,    label: 'Phone',        value: s.phone || '—' },
            { icon: <User size={13} />,     label: 'Email',        value: s.email },
            { icon: <Calendar size={13} />, label: 'Department',   value: s.department },
            { icon: <Calendar size={13} />, label: 'Year',         value: s.year },
            { icon: <MapPin size={13} />,   label: 'Address',      value: s.address || '—' },
          ].map(row => (
            <div key={row.label} className="detail-row" style={{ padding: '8px 0' }}>
              <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{row.icon} {row.label}</span>
              <span className="detail-value" style={{ fontSize: '0.82rem', maxWidth: 200, textAlign: 'right', wordBreak: 'break-word' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Transit details */}
        <div className="glass-card" style={{ padding: 16, borderTop: '2px solid var(--cyan)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 12 }}>Transit Assignment</div>
          {[
            { label: 'Pickup Stop',    value: s.pickupPoint || '—',   color: 'var(--primary)' },
            { label: 'Assigned Bus',   value: s.assignedBus || 'Not assigned', color: s.assignedBus ? 'var(--emerald)' : 'var(--amber)' },
            { label: 'Assigned Route', value: s.assignedRoute || '—', color: 'var(--cyan)' },
            { label: 'Driver',         value: assignedBus?.driver || '—', color: 'var(--text-primary)' },
            { label: 'Bus Status',     value: assignedBus?.status || '—', color: 'var(--text-secondary)' },
          ].map(row => (
            <div key={row.label} className="detail-row" style={{ padding: '8px 0' }}>
              <span className="detail-label">{row.label}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: row.color, textAlign: 'right' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Bus assign inline in panel */}
        <div className="glass-card" style={{ padding: 16, borderTop: '2px solid var(--amber)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 12 }}>Assign / Change Bus</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-input" style={{ flex: 1 }}
              value={busPickMap[s.studentId] || ''}
              onChange={e => setBusPickMap(prev => ({ ...prev, [s.studentId]: e.target.value }))}>
              <option value="">— Select Bus —</option>
              {buses.filter(b => b.driver && b.driver !== 'Unassigned').map(b => (
                <option key={b.id} value={b.number}>{b.number} · {b.driver}</option>
              ))}
            </select>
            <button className="btn btn-emerald" style={{ padding: '8px 14px', fontSize: '0.78rem' }}
              onClick={() => handleQuickAssignBus(s.studentId)}
              disabled={assigningId === s.studentId || !busPickMap[s.studentId]}>
              <UserCheck size={14} /> Assign
            </button>
          </div>
          {s.assignedBus && (
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: '0.74rem', color: 'var(--rose)', borderColor: 'var(--rose-glow)' }}
              onClick={() => handleUnassignBus(s.studentId, s.name)}>
              ✕ Remove Bus Assignment
            </button>
          )}
        </div>
      </div>

      {/* Panel footer actions */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {setCurrentView && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.8rem' }}
            onClick={() => { onClose(); setCurrentView('student-profile'); }}
          >
            <User size={14} /> View Full Profile
          </button>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1, color: 'var(--amber)', fontSize: '0.8rem' }} onClick={() => handleEdit(s)}>
            <Edit2 size={14} /> Edit
          </button>
          <button className="btn btn-secondary" style={{ flex: 1, color: 'var(--rose)', fontSize: '0.8rem' }} onClick={() => handleDelete(s.studentId, s.name)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const StudentManagementView = ({ setCurrentView }) => {
  const { currentUser, triggerToast, buses } = useContext(AppContext);
  const token = currentUser?.token;

  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [csvLoading,  setCsvLoading]  = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [busPickMap,  setBusPickMap]  = useState({});
  const [viewStudent, setViewStudent] = useState(null); // student detail panel
  const fileRef = useRef();

  const fetchStudents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch(`${API}/students`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setStudents(data);
        // Keep detail panel in sync with latest data
        setViewStudent(prev => {
          if (!prev) return null;
          const updated = data.find(s => s.studentId === prev.studentId);
          return updated || prev;
        });
      } else triggerToast(data.message, 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    finally  { if (!silent) setLoading(false); }
  }, [token]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleQuickAssignBus = async (studentId) => {
    const busNumber = busPickMap[studentId];
    if (!busNumber) { triggerToast('Select a bus first.', 'warning'); return; }
    const bus = buses.find(b => b.number === busNumber);
    setAssigningId(studentId);
    try {
      const res = await fetch(`${API}/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignedBus: busNumber, assignedRoute: bus?.route || '' })
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(`Bus ${busNumber} assigned.`, 'success');
        setBusPickMap(prev => { const n = {...prev}; delete n[studentId]; return n; });
        fetchStudents(true);
      } else triggerToast(data.message, 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    finally { setAssigningId(null); }
  };

  const handleUnassignBus = async (studentId, name) => {
    if (!window.confirm(`Remove bus assignment from ${name}?`)) return;
    try {
      const res = await fetch(`${API}/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignedBus: '', assignedRoute: '' })
      });
      if (res.ok) { triggerToast(`Bus removed from ${name}.`, 'info'); fetchStudents(true); }
    } catch { triggerToast('Cannot reach server.', 'danger'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.studentId || !form.name || !form.email || !form.department || !form.year) {
      triggerToast('Student ID, name, email, department and year are required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const isEdit = Boolean(editingId);
      const res = await fetch(isEdit ? `${API}/students/${editingId}` : `${API}/students`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(isEdit ? 'Student updated.' : 'Student added.', 'success');
        setShowForm(false); setEditingId(null); setForm(EMPTY_FORM);
        fetchStudents(true);
      } else triggerToast(data.message, 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (studentId, name) => {
    if (!window.confirm(`Delete student ${name}?`)) return;
    try {
      const res = await fetch(`${API}/students/${studentId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) { triggerToast(`${name} removed.`, 'info'); fetchStudents(true); if (viewStudent?.studentId === studentId) setViewStudent(null); }
      else triggerToast(data.message, 'danger');
    } catch { triggerToast('Cannot reach server.', 'danger'); }
  };

  const handleEdit = (s) => {
    setForm({ studentId: s.studentId, name: s.name, email: s.email, phone: s.phone,
      department: s.department, year: s.year, address: s.address,
      pickupPoint: s.pickupPoint, assignedBus: s.assignedBus, assignedRoute: s.assignedRoute });
    setEditingId(s.studentId); setShowForm(true); setViewStudent(null);
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setCsvLoading(true);
    const formData = new FormData(); formData.append('file', file);
    try {
      const res  = await fetch(`${API}/students/upload_csv`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      });
      const data = await res.json();
      if (res.ok) { triggerToast(`Imported ${data.imported} students.`, 'success'); fetchStudents(true); }
      else triggerToast(data.message, 'danger');
    } catch { triggerToast('CSV upload failed.', 'danger'); }
    finally { setCsvLoading(false); fileRef.current.value = ''; }
  };

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const field = (label, key, type = 'text', options = null) => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      {options ? (
        <select className="form-input" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="form-input" value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={label} />
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Detail slide panel */}
      {viewStudent && (
        <DetailPanel
          s={viewStudent}
          buses={buses}
          busPickMap={busPickMap}
          setBusPickMap={setBusPickMap}
          assigningId={assigningId}
          handleQuickAssignBus={handleQuickAssignBus}
          handleUnassignBus={handleUnassignBus}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
          onClose={() => setViewStudent(null)}
          setCurrentView={setCurrentView}
        />
      )}

      {/* Header */}
      <div className="glass-card" style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800 }}>
            <Users size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            Student Management
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {students.length} registered · {students.filter(s => s.assignedBus).length} bus-assigned · Vignan's LARA
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSV} />
          <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => fileRef.current.click()} disabled={csvLoading}>
            <Upload size={14} />{csvLoading ? 'Uploading...' : 'Import CSV'}
          </button>
          <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={fetchStudents} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" style={{ fontSize: '0.78rem' }}
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setViewStudent(null); }}>
            <Plus size={14} /> Add Student
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total',       value: students.length,                                              color: 'var(--primary)' },
          { label: 'Bus Assigned',value: students.filter(s => s.assignedBus).length,                  color: 'var(--emerald)' },
          { label: 'Unassigned',  value: students.filter(s => !s.assignedBus).length,                 color: 'var(--amber)'   },
          { label: 'Boarded',     value: students.filter(s => s.attendanceStatus === 'Boarded').length,color: 'var(--cyan)'    },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: '14px 18px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.8px' }}>{s.label}</div>
            <div style={{ fontSize: '1.9rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)', marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* CSV hint */}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 10, padding: '8px 14px', border: '1px solid var(--card-border)' }}>
        📄 CSV: <code>studentId, name, email, phone, department, year, address, pickupPoint, assignedBus, assignedRoute</code>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="glass-card" style={{ borderLeft: `4px solid ${editingId ? 'var(--amber)' : 'var(--primary)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="glass-card-title">
              {editingId ? <><Edit2 size={16} /> Edit — {editingId}</> : <><Plus size={16} /> Add New Student</>}
            </h3>
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }}
              onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>
              <X size={14} />
            </button>
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {field('Student ID *', 'studentId')}
              {field('Full Name *',  'name')}
              {field('Email *',      'email', 'email')}
              {field('Phone',        'phone', 'tel')}
              {field('Department *', 'department')}
              {field('Year *', 'year', 'text', ['1st Year','2nd Year','3rd Year','4th Year'])}
              {field('Home Address', 'address')}
              {field('Pickup Point', 'pickupPoint')}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={14} />{saving ? 'Saving...' : editingId ? 'Update' : 'Save Student'}
              </button>
              <button type="button" className="btn btn-secondary"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input type="text" className="form-input"
          placeholder="Search by name, student ID or department..."
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        {search && <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.74rem' }} onClick={() => setSearch('')}>Clear</button>}
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', flexShrink: 0 }}>{filtered.length} results</span>
      </div>

      {/* Student list — names only with View button */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="animate-spin" style={{ opacity: 0.4, marginBottom: 12 }} />
            <div>Loading students from database...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{students.length === 0 ? 'No students yet' : 'No results found'}</div>
            <div style={{ fontSize: '0.78rem' }}>{students.length === 0 ? 'Add a student or upload CSV.' : 'Try a different search.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((s, idx) => (
              <div key={s._id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 20px',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--card-border)' : 'none',
                background: viewStudent?.studentId === s.studentId ? 'var(--primary-soft)' : 'transparent',
                transition: 'background 0.15s ease',
                cursor: 'pointer'
              }}
                onMouseEnter={e => { if (viewStudent?.studentId !== s.studentId) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={e => { if (viewStudent?.studentId !== s.studentId) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `linear-gradient(135deg, ${s.assignedBus ? 'var(--primary)' : 'var(--text-muted)'}, ${s.assignedBus ? 'var(--violet)' : '#94a3b8'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1rem' }}>
                  {s.name?.charAt(0)}
                </div>

                {/* Name + ID */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{s.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {s.studentId} · {s.department} · {s.year}
                  </div>
                </div>

                {/* Bus badge */}
                <div style={{ flexShrink: 0 }}>
                  {s.assignedBus
                    ? <span className="badge badge-active" style={{ fontSize: '0.65rem' }}><Bus size={9} /> {s.assignedBus}</span>
                    : <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>No bus</span>
                  }
                </div>

                {/* Status badge */}
                <span className={`badge ${s.attendanceStatus === 'Boarded' ? 'badge-active' : s.attendanceStatus === 'Waiting' ? 'badge-warning' : 'badge-danger'}`}
                  style={{ fontSize: '0.62rem', flexShrink: 0 }}>
                  {s.attendanceStatus}
                </span>

                {/* View Details button */}
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.76rem', flexShrink: 0,
                    background: viewStudent?.studentId === s.studentId ? 'var(--primary)' : '',
                    color:      viewStudent?.studentId === s.studentId ? '#fff' : '',
                    borderColor: viewStudent?.studentId === s.studentId ? 'var(--primary)' : '' }}
                  onClick={() => setViewStudent(viewStudent?.studentId === s.studentId ? null : s)}
                >
                  <Eye size={13} /> {viewStudent?.studentId === s.studentId ? 'Close' : 'View'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default StudentManagementView;
