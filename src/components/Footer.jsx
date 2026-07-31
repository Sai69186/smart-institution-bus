import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { Activity, ShieldAlert, Heart, Info, CloudRain, Sun, CloudLightning } from 'lucide-react';

const Footer = ({ currentView }) => {
  const { weather, alerts, sosActive } = useContext(AppContext);

  // Compute a dynamic delay index based on weather to inform students & staff
  const getDelayIndex = () => {
    if (weather === 'Rainy') return { label: 'Moderate Delays (+5m)', type: 'warning' };
    if (weather === 'Foggy') return { label: 'Severe Delays (+9m)', type: 'danger' };
    return { label: 'Optimal Commute Timings', type: 'success' };
  };

  const delayInfo = getDelayIndex();

  return (
    <footer className="main-footer" style={{ 
      height: '54px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      padding: '0 32px', 
      fontSize: '0.72rem',
      color: 'var(--text-secondary)',
      flexShrink: 0
    }}>
      {/* Left Pane: System Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="pulse-green" style={{ width: '8px', height: '8px' }}></span>
          <span style={{ fontWeight: 600 }}>AI Transit Node: Active</span>
        </div>
        <div style={{ height: '12px', width: '1px', background: 'var(--card-border)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {weather === 'Sunny' && <Sun size={12} className="text-amber" />}
          {weather === 'Rainy' && <CloudRain size={12} className="text-cyan" />}
          {weather === 'Foggy' && <CloudLightning size={12} className="text-primary" />}
          <span>Delay Index: <strong style={{ 
            color: delayInfo.type === 'success' ? 'var(--emerald)' : 
                   delayInfo.type === 'warning' ? 'var(--amber)' : 'var(--rose)' 
          }}>{delayInfo.label}</strong></span>
        </div>
      </div>

      {/* Middle Pane: SOS Emergency Indicator */}
      {sosActive && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.08)', 
          border: '1px solid rgba(239, 68, 68, 0.15)',
          padding: '4px 10px', 
          borderRadius: '99px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px',
          color: 'var(--rose)',
          fontWeight: 'bold',
          animation: 'pulse-emergency-banner 2s infinite'
        }}>
          <ShieldAlert size={12} />
          <span>Active SOS Dispatch In Progress</span>
        </div>
      )}

      {/* Right Pane: Links & Credits */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>Institutional Transit Services</span>
        <div style={{ height: '12px', width: '1px', background: 'var(--card-border)' }}></div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          Made with <Heart size={10} style={{ color: 'var(--rose)', fill: 'var(--rose)' }} /> for Students & Staff
        </span>
      </div>

      <style>{`
        .dark-mode .main-footer {
          background: rgba(8, 11, 17, 0.4) !important;
        }
        @keyframes pulse-emergency-banner {
          0% { opacity: 0.8; }
          50% { opacity: 1; transform: scale(1.02); }
          100% { opacity: 0.8; }
        }
      `}</style>
    </footer>
  );
};

export default Footer;
