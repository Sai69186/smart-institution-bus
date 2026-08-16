import React, { useState, useEffect, useContext } from 'react';
import {
  Building2, Plus, Users, Bus, CheckCircle, XCircle,
  RefreshCw, Settings, Trash2, Edit3, Eye, AlertTriangle
} from 'lucide-react';
import { AppContext } from '../context/AppContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const SuperAdminDashboard = ({ setCurrentView }) => {
  const { currentUser, triggerToast } = useContext(AppContext);
  const token = currentUser?.token;

  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [editInst, setEditInst]         = useState(null);   // for status toggle

  const [form, setForm] = useState({
    name: '', address: '', city: '', state: '',
    contactEmail: '', contactPhone: '',
    campusLat: '', campusLng: '', campusName: 'Main Campus',
    adminName: '', adminEmail: '', adminPassword: '',
  });

  const authHdr = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchInstitutions = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/institutions`, {
        headers: { Authorization: `Bearer ${currentUser?.token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) setInstitutions(data);
      else triggerToast(data.message || 'Could not load institutions.', 'danger');
    } catch (err) { triggerToast(`Network error: ${err.message}`, 'danger'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInstitutions(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...form,
        campusLat: form.campusLat ? parseFloat(form.campusLat) : null,
        campusLng: form.campusLng ? parseFloat(form.campusLng) : null,
      };

      const res  = await fetch(`${API}/institutions`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${currentUser?.token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        triggerToast(data.message || `Error ${res.status}: could not create institution.`, 'danger');
        return;
      }

      triggerToast(
        `Institution "${data.institution.name}" created! Admin: ${data.admin.email}`,
        'success'
      );
      setShowForm(false);
      setForm({
        name:'', address:'', city:'', state:'',
        contactEmail:'', contactPhone:'',
        campusLat:'', campusLng:'', campusName:'Main Campus',
        adminName:'', adminEmail:'', adminPassword:'',
      });
      fetchInstitutions();
    } catch (err) {
      triggerToast(`Network error: ${err.message}`, 'danger');
    }
  };

  const toggleStatus = async (inst) => {
    const newStatus = inst.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`${API}/institutions/${inst._id}/status`, {
        method:  'PUT',
        headers: { Authorization: `Bearer ${currentUser?.token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message || 'Could not update status.', 'danger'); return; }
      triggerToast(`${inst.name} is now ${newStatus}.`, 'success');
      fetchInstitutions();
    } catch (err) { triggerToast(`Network error: ${err.message}`, 'danger'); }
  };

  const deleteInst = async (inst) => {
    if (!window.confirm(`Delete "${inst.name}"? This cannot be undone.`)) return;
    try {
      const res  = await fetch(`${API}/institutions/${inst._id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${currentUser?.token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message || 'Could not delete.', 'danger'); return; }
      triggerToast(data.message, 'success');
      fetchInstitutions();
    } catch (err) { triggerToast(`Network error: ${err.message}`, 'danger'); }
  };

  const statusBadge = (status) => {
    const map = { active:'var(--emerald)', suspended:'var(--rose)', inactive:'var(--text-muted)' };
    return (
      <span style={{
        background: `${map[status]}22`, color: map[status],
        padding: '2px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:'1.4rem', fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>
            <Building2 size={22} style={{ color:'var(--violet)' }} />
            Super Admin — Institutions
          </h2>
          <p style={{ margin:'4px 0 0', color:'var(--text-muted)', fontSize:'0.85rem' }}>
            Manage all registered institutions on the platform
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" onClick={fetchInstitutions} disabled={loading}>
            <RefreshCw size={15} style={{ marginRight:6 }} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} style={{ marginRight:6 }} />
            Add Institution
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
        {[
          { label:'Total',     value: institutions.length,                          color:'var(--violet)' },
          { label:'Active',    value: institutions.filter(i=>i.status==='active').length,    color:'var(--emerald)' },
          { label:'Suspended', value: institutions.filter(i=>i.status==='suspended').length, color:'var(--rose)' },
          { label:'Total Buses',
            value: institutions.reduce((s,i)=>s+(i.busCount||0),0), color:'var(--cyan)' },
        ].map(card => (
          <div key={card.label} className="glass-card" style={{
            borderTop:`3px solid ${card.color}`, padding:'16px 20px',
          }}>
            <div style={{ fontSize:'1.6rem', fontWeight:800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:2 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Institution list */}
      <div className="glass-card">
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading…</div>
        ) : institutions.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
            No institutions yet. Click "Add Institution" to create one.
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {['Institution','City','Buses','Students','Admins','Status','Actions'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontWeight:700,
                      color:'var(--text-muted)', fontSize:'0.75rem', textTransform:'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {institutions.map(inst => (
                  <tr key={inst._id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:700 }}>{inst.name}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{inst.contactEmail}</div>
                    </td>
                    <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{inst.city || '—'}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontWeight:700, color:'var(--cyan)' }}>{inst.busCount ?? 0}</span>
                    </td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontWeight:700, color:'var(--violet)' }}>{inst.studentCount ?? 0}</span>
                    </td>
                    <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{inst.adminCount ?? 0}</td>
                    <td style={{ padding:'10px 12px' }}>{statusBadge(inst.status)}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          title={inst.status === 'active' ? 'Suspend' : 'Activate'}
                          onClick={() => toggleStatus(inst)}
                          style={{ background:'none', border:'none', cursor:'pointer',
                            color: inst.status==='active' ? 'var(--rose)' : 'var(--emerald)', padding:4 }}
                        >
                          {inst.status === 'active'
                            ? <XCircle size={16} />
                            : <CheckCircle size={16} />}
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteInst(inst)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--rose)', padding:4 }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Institution Modal */}
      {showForm && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
        }}>
          <div className="glass-card" style={{ width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ margin:0, fontWeight:800 }}>Add New Institution</h3>
              <button onClick={() => setShowForm(false)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:22 }}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Institution Name *</label>
                  <input className="form-input" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Address</label>
                  <input className="form-input" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">City</label>
                  <input className="form-input" value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">State</label>
                  <input className="form-input" value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Contact Email</label>
                  <input className="form-input" type="email" value={form.contactEmail}
                    onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Contact Phone</label>
                  <input className="form-input" value={form.contactPhone}
                    onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Campus Lat</label>
                  <input className="form-input" type="number" step="any" value={form.campusLat}
                    onChange={e => setForm(f => ({ ...f, campusLat: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Campus Lng</label>
                  <input className="form-input" type="number" step="any" value={form.campusLng}
                    onChange={e => setForm(f => ({ ...f, campusLng: e.target.value }))} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Campus Name</label>
                  <input className="form-input" value={form.campusName}
                    onChange={e => setForm(f => ({ ...f, campusName: e.target.value }))} />
                </div>
              </div>

              <div style={{ borderTop:'1px solid var(--border)', paddingTop:16, marginBottom:16 }}>
                <p style={{ margin:'0 0 12px', fontWeight:700, fontSize:'0.85rem' }}>
                  Institution Admin Account
                </p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Admin Name *</label>
                    <input className="form-input" required value={form.adminName}
                      onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Admin Email *</label>
                    <input className="form-input" type="email" required value={form.adminEmail}
                      onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Temp Password *</label>
                    <input className="form-input" required value={form.adminPassword}
                      onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Institution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;


