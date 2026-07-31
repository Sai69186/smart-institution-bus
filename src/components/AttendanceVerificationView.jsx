import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { QrCode, CreditCard, Scan, CheckCircle, Clock, Search } from 'lucide-react';

const AttendanceVerificationView = () => {
  const { students, boardStudent } = useContext(AppContext);
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [activeTab, setActiveTab] = useState('qr'); // qr, rfid, face
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const currentStudent = students.find(s => s.id === selectedStudentId);

  const executeSimulation = (method) => {
    if (!currentStudent) return;
    setIsScanning(true);
    setScanResult(null);

    setTimeout(() => {
      setIsScanning(false);
      boardStudent(selectedStudentId);
      setScanResult({
        name: currentStudent.name,
        bus: currentStudent.assignedBus,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        method: method
      });
    }, 1500);
  };

  return (
    <div className="two-col-grid">
      
      {/* Simulation controllers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Selector card */}
        <div className="glass-card">
          <h3 className="glass-card-title">Select Student to Board</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Select profile to simulate boarding scan sequence</p>
          
          <div className="form-group">
            <label className="form-label">Student Profile</label>
            <select 
              className="form-input" 
              value={selectedStudentId}
              onChange={(e) => { setSelectedStudentId(e.target.value); setScanResult(null); }}
              style={{ width: '100%' }}
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.id}) - {s.attendanceStatus}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Verification Methods Accordion */}
        <div className="glass-card">
          <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', marginBottom: '20px' }}>
            <button 
              className={`btn`} 
              style={{ flex: 1, padding: '10px 0', borderBottom: activeTab === 'qr' ? '2px solid var(--primary)' : 'none', color: activeTab === 'qr' ? 'var(--text-primary)' : 'var(--text-muted)', background: 'transparent' }}
              onClick={() => { setActiveTab('qr'); setScanResult(null); }}
            >
              <QrCode size={14} style={{ display: 'inline', marginRight: '6px' }} />
              <span style={{ fontSize: '0.8rem' }}>QR Code</span>
            </button>
            <button 
              className={`btn`}
              style={{ flex: 1, padding: '10px 0', borderBottom: activeTab === 'rfid' ? '2px solid var(--primary)' : 'none', color: activeTab === 'rfid' ? 'var(--text-primary)' : 'var(--text-muted)', background: 'transparent' }}
              onClick={() => { setActiveTab('rfid'); setScanResult(null); }}
            >
              <CreditCard size={14} style={{ display: 'inline', marginRight: '6px' }} />
              <span style={{ fontSize: '0.8rem' }}>RFID Tap</span>
            </button>
            <button 
              className={`btn`}
              style={{ flex: 1, padding: '10px 0', borderBottom: activeTab === 'face' ? '2px solid var(--primary)' : 'none', color: activeTab === 'face' ? 'var(--text-primary)' : 'var(--text-muted)', background: 'transparent' }}
              onClick={() => { setActiveTab('face'); setScanResult(null); }}
            >
              <Scan size={14} style={{ display: 'inline', marginRight: '6px' }} />
              <span style={{ fontSize: '0.8rem' }}>Face Detect</span>
            </button>
          </div>

          <div style={{ padding: '10px 0' }}>
            {activeTab === 'qr' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: '#0e1220', padding: '16px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                  <QrCode size={120} className="text-secondary" style={{ opacity: isScanning ? 0.3 : 1 }} />
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={() => executeSimulation('QR Scan')}
                  disabled={isScanning || currentStudent?.attendanceStatus === 'Boarded'}
                >
                  {isScanning ? 'Reading QR Matrix...' : 'Simulate QR Scan'}
                </button>
              </div>
            )}

            {activeTab === 'rfid' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '220px', height: '140px', background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)', borderRadius: '12px', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>STUDENT RFID SMARTCARD</span>
                    <CreditCard size={16} className="text-primary" />
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '20px' }}>TAP CARD ON BUS NFC READER</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{currentStudent?.name}</div>
                    <div style={{ fontSize: '0.65rem' }}>{currentStudent?.id}</div>
                  </div>
                </div>
                <button 
                  className="btn btn-cyan" 
                  onClick={() => executeSimulation('RFID Tap')}
                  disabled={isScanning || currentStudent?.attendanceStatus === 'Boarded'}
                >
                  {isScanning ? 'Detecting RFID Signal...' : 'Simulate RFID Tap'}
                </button>
              </div>
            )}

            {activeTab === 'face' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: '240px', height: '180px', background: '#02040a', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scan size={80} className="text-secondary" style={{ opacity: 0.1 }} />
                  {/* Face recognition overlay scan line */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    background: 'var(--primary)',
                    boxShadow: '0 0 8px var(--primary)',
                    animation: 'scan-line 2.5s infinite linear'
                  }}></div>
                  <style>{`
                    @keyframes scan-line {
                      0% { top: 0% }
                      50% { top: 100% }
                      100% { top: 0% }
                    }
                  `}</style>
                  {isScanning && (
                    <div style={{ position: 'absolute', padding: '8px', background: 'rgba(99,102,241,0.2)', border: '1px solid var(--primary)', borderRadius: '6px', fontSize: '0.7rem' }}>
                      Mapping Face Vectors...
                    </div>
                  )}
                  {scanResult && !isScanning && (
                    <div style={{ position: 'absolute', padding: '8px', background: 'rgba(16,185,129,0.2)', border: '1px solid var(--emerald)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--emerald)' }}>
                      Match: 99.4%
                    </div>
                  )}
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ border: '1px solid var(--primary)' }}
                  onClick={() => executeSimulation('Face Recognition')}
                  disabled={isScanning || currentStudent?.attendanceStatus === 'Boarded'}
                >
                  {isScanning ? 'Analyzing Biometrics...' : 'Simulate Face Scan'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Verification Logs / History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Scan Result Dialog */}
        {scanResult && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--emerald)', background: 'rgba(16, 185, 129, 0.04)' }}>
            <h3 className="glass-card-title" style={{ color: 'var(--emerald)' }}>
              <CheckCircle size={18} />
              <span>Boarding Confirmed</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', fontSize: '0.8rem' }}>
              <div className="detail-row">
                <span className="detail-label">Passenger Name</span>
                <span className="detail-value">{scanResult.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Vehicle Boarded</span>
                <span className="detail-value">{scanResult.bus}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Timestamp</span>
                <span className="detail-value">{scanResult.time}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Verification Mode</span>
                <span className="detail-value">{scanResult.method}</span>
              </div>
            </div>
          </div>
        )}

        {/* Boarded Students logs */}
        <div className="glass-card">
          <h3 className="glass-card-title">Verification Logs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', maxHeight: '320px', overflowY: 'auto' }}>
            {students.filter(s => s.attendanceStatus === 'Boarded').length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No boardings verified yet today.
              </div>
            ) : (
              students.filter(s => s.attendanceStatus === 'Boarded').map(student => (
                <div 
                  key={student.id}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--card-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'bold' }}>{student.name}</span>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Bus: {student.assignedBus}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>Verified</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{student.actualBoardingTime}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default AttendanceVerificationView;
