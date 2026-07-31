import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { RefreshCw, CheckCircle, Cpu, Eye, AlertTriangle } from 'lucide-react';

const SmartAllocationView = () => {
  const { previewAllocation, runAllocation, triggerToast } = useContext(AppContext);

  const [isLoading,  setIsLoading]  = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [plan,       setPlan]       = useState(null);   // last computed plan
  const [saved,      setSaved]      = useState(false);  // whether plan was committed to DB

  // ── Preview: compute without saving ─────────────────────────────────────
  const handlePreview = async () => {
    setIsPreviewing(true);
    setSaved(false);
    const result = await previewAllocation();
    setIsPreviewing(false);
    if (!result) {
      triggerToast('Could not reach server. Is the backend running?', 'danger');
      return;
    }
    setPlan(result);
    triggerToast(
      `Preview: ${result.summary.allocatedCount} students allocatable across ${result.summary.busesUsed} buses.`,
      'info'
    );
  };

  // ── Run: compute + persist to DB ─────────────────────────────────────────
  const handleRun = async () => {
    setIsLoading(true);
    const result = await runAllocation();   // triggerToast is called inside runAllocation
    setIsLoading(false);
    if (!result) return;
    setPlan(result);
    setSaved(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header actions ── */}
      <div className="two-col-grid">

        {/* Algorithm description */}
        <div className="glass-card">
          <h3 className="glass-card-title">
            <Cpu size={18} /> AI Allocation Engine
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Assigns every student (by pickup point) to the best-fit bus using a two-pass algorithm:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.78rem' }}>
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
              <strong>Pass 1 — Route Match:</strong> students whose pickup point is already in a bus's stopSequence are assigned to that bus first.
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
              <strong>Pass 2 — Nearest Bus:</strong> remaining students are assigned to the closest bus (Haversine) that has available capacity.
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
              <strong>Overflow:</strong> students unassignable (all buses full) are flagged separately so admin can act.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={handlePreview}
              disabled={isPreviewing || isLoading}
            >
              <Eye size={14} className={isPreviewing ? 'animate-spin' : ''} />
              {isPreviewing ? 'Previewing…' : 'Preview Plan'}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleRun}
              disabled={isLoading || isPreviewing}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Allocating…' : 'Run & Save'}
            </button>
          </div>
        </div>

        {/* Summary card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 className="glass-card-title">Allocation Summary</h3>
          {!plan ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Run preview or allocation to see results.
            </div>
          ) : (
            <>
              {[
                { label: 'Total Students',   value: plan.summary.totalStudents,    color: 'var(--text-primary)' },
                { label: 'Allocated',        value: plan.summary.allocatedCount,   color: 'var(--emerald)'      },
                { label: 'Unallocated',      value: plan.summary.unallocatedCount, color: plan.summary.unallocatedCount > 0 ? 'var(--rose)' : 'var(--text-muted)' },
                { label: 'Buses Used',       value: plan.summary.busesUsed,        color: 'var(--cyan)'         },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: s.color }}>{s.value}</span>
                </div>
              ))}
              {saved && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', marginTop: 4 }}>
                  <CheckCircle size={15} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--emerald)', fontWeight: 600 }}>
                    Plan saved — student records updated in DB.
                  </span>
                </div>
              )}
              {!saved && plan && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--bg-tertiary)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Preview only — click "Run &amp; Save" to commit.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Per-bus breakdown table ── */}
      {plan && (
        <div className="glass-card">
          <div className="glass-card-header">
            <h3 className="glass-card-title">Fleet Allocation Plan — Per Bus</h3>
            <span className={`badge ${saved ? 'badge-active' : 'badge-warning'}`}>
              {saved ? 'Saved ✓' : 'Preview'}
            </span>
          </div>
          <div className="table-container" style={{ marginTop: 16 }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Bus</th>
                  <th>Route</th>
                  <th>Assigned Students</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {plan.perBus.map((b, i) => {
                  const count    = b.students.length;
                  const capacity = b.capacity || 50;
                  const pct      = Math.round((count / capacity) * 100);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{b.busNumber}</td>
                      <td style={{ fontSize: '0.78rem' }}>{b.route || '—'}</td>
                      <td>
                        {count === 0
                          ? <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None</span>
                          : (
                            <div style={{ fontSize: '0.75rem' }}>
                              {b.students.slice(0, 3).map(s => s.name).join(', ')}
                              {count > 3 && <span style={{ color: 'var(--text-muted)' }}> +{count - 3} more</span>}
                            </div>
                          )
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%', borderRadius: 99,
                              background: pct > 90 ? 'var(--rose)' : pct > 70 ? 'var(--amber)' : 'linear-gradient(90deg,var(--primary),var(--cyan))',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {count}/{capacity} ({pct}%)
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Unallocated students warning ── */}
      {plan && plan.unallocated.length > 0 && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--rose)', background: 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <AlertTriangle size={16} style={{ color: 'var(--rose)' }} />
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--rose)' }}>
              {plan.unallocated.length} Student{plan.unallocated.length > 1 ? 's' : ''} Could Not Be Allocated
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.unallocated.map((u, i) => (
              <div key={i} style={{ fontSize: '0.76rem', display: 'flex', gap: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 80 }}>{u.studentId}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{u.name}</span>
                <span style={{ color: 'var(--rose)', marginLeft: 'auto' }}>{u.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default SmartAllocationView;
