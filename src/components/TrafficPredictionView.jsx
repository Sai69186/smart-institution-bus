import React, { useState, useContext } from 'react';
import { AppContext, STOP_COORDS } from '../context/AppContext';
import { Zap, AlertTriangle, Map } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Traffic congestion zones mapped to real Vignan LARA area stop coordinates
const CONGESTION_ZONES = [
  {
    stop:    'Mangalagiri Bypass',
    level:   'Heavy',
    color:   '#ef4444',
    radius:  600,   // meters
    opacity: 0.35,
    delay:   '+12 mins',
    index:   84,
  },
  {
    stop:    'VLITS Main Gate',
    level:   'Moderate',
    color:   '#f59e0b',
    radius:  400,
    opacity: 0.28,
    delay:   '+5 mins',
    index:   52,
  },
  {
    stop:    'Pedaparupudi Junction',
    level:   'Light',
    color:   '#10b981',
    radius:  300,
    opacity: 0.22,
    delay:   '+2 mins',
    index:   21,
  },
  {
    stop:    'Guntur Highway Gate',
    level:   'Moderate',
    color:   '#f59e0b',
    radius:  380,
    opacity: 0.25,
    delay:   '+4 mins',
    index:   47,
  },
];

// Route polylines on real map
const ROUTE_LINES = [
  { name: 'Route A', color: '#6366f1', stops: ['Vadlamudi Bus Stand','Guntur Highway Gate','VLITS Main Gate','Vignan LARA — Main Campus'] },
  { name: 'Route B', color: '#06b6d4', stops: ['Tenali Road Stop','Pedaparupudi Junction','Chebrolu Cross Roads','Vignan LARA — Main Campus'] },
  { name: 'Route C', color: '#10b981', stops: ['Kollipara Village Stop','Mangalagiri Bypass','Hostel Block — VLITS','Vignan LARA — Main Campus'] },
];

const TrafficPredictionView = () => {
  const { weather } = useContext(AppContext);
  const [selectedZone, setSelectedZone] = useState(CONGESTION_ZONES[0]);

  const weatherMultiplier = weather === 'Rainy' ? 1.4 : weather === 'Foggy' ? 1.7 : 1.0;
  const adjustedIndex = Math.min(99, Math.round(selectedZone.index * weatherMultiplier));

  return (
    <div className="two-col-grid">

      {/* ── Real Leaflet heatmap ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <Map size={18} /> AI Congestion Heatmap
          </h3>
          <span className="badge badge-danger">Live Sync</span>
        </div>

        <div style={{ height: 380, borderRadius: 14, overflow: 'hidden', marginTop: 14, border: '1px solid var(--card-border)' }}>
          <MapContainer
            center={[16.2380, 80.5560]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Route lines */}
            {ROUTE_LINES.map(route => {
              const path = route.stops
                .map(s => STOP_COORDS[s])
                .filter(Boolean)
                .map(c => [c.lat, c.lng]);
              return path.length > 1 ? (
                <Polyline key={route.name} positions={path}
                  pathOptions={{ color: route.color, weight: 4, opacity: 0.5, dashArray: '6 3' }}>
                  <Tooltip sticky>{route.name}</Tooltip>
                </Polyline>
              ) : null;
            })}

            {/* Congestion heat circles */}
            {CONGESTION_ZONES.map(zone => {
              const coord = STOP_COORDS[zone.stop];
              if (!coord) return null;
              const adjRadius = zone.radius * weatherMultiplier;
              return (
                <CircleMarker
                  key={zone.stop}
                  center={[coord.lat, coord.lng]}
                  radius={zone.level === 'Heavy' ? 32 : zone.level === 'Moderate' ? 22 : 14}
                  pathOptions={{
                    color:       zone.color,
                    fillColor:   zone.color,
                    fillOpacity: zone.opacity * weatherMultiplier,
                    weight:      2,
                    opacity:     0.7,
                  }}
                  eventHandlers={{ click: () => setSelectedZone(zone) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {zone.level === 'Heavy' ? '🔴' : zone.level === 'Moderate' ? '🟡' : '🟢'} {zone.stop}
                      </div>
                      <div style={{ fontSize: '0.78rem' }}>
                        Congestion: <strong style={{ color: zone.color }}>{zone.level}</strong>
                      </div>
                      <div style={{ fontSize: '0.78rem' }}>
                        Delay risk: <strong>{zone.delay}</strong>
                      </div>
                      <div style={{ fontSize: '0.78rem' }}>
                        Index: <strong>{Math.round(zone.index * weatherMultiplier)}%</strong>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Campus terminus */}
            {STOP_COORDS['Vignan LARA — Main Campus'] && (
              <CircleMarker
                center={[STOP_COORDS['Vignan LARA — Main Campus'].lat, STOP_COORDS['Vignan LARA — Main Campus'].lng]}
                radius={10}
                pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.9, weight: 2 }}
              >
                <Tooltip permanent>🏫 Vignan LARA</Tooltip>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {[['Heavy','#ef4444'],['Moderate','#f59e0b'],['Light','#10b981']].map(([lvl, col]) => (
            <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: col }} />
              <span style={{ color: 'var(--text-secondary)' }}>{lvl}</span>
            </div>
          ))}
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Click any zone for details
          </span>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Selected zone alert */}
        <div className="glass-card" style={{ borderLeft: '4px solid var(--rose)', background: 'var(--rose-soft)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <AlertTriangle size={18} style={{ color: 'var(--rose)' }} className="animate-pulse" />
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Selected Congestion Zone</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
            {[
              ['Zone',           selectedZone.stop],
              ['Level',          selectedZone.level],
              ['Congestion Index', `${adjustedIndex}%`],
              ['Delay Risk',     selectedZone.delay],
              ['Weather Factor', `×${weatherMultiplier.toFixed(1)} (${weather})`],
            ].map(([k, v]) => (
              <div key={k} className="detail-row">
                <span className="detail-label">{k}</span>
                <span className="detail-value"
                  style={{ color: k === 'Level' ? (selectedZone.level === 'Heavy' ? 'var(--rose)' : selectedZone.level === 'Moderate' ? 'var(--amber)' : 'var(--emerald)') : 'inherit' }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* All zones table */}
        <div className="glass-card">
          <h3 className="glass-card-title" style={{ marginBottom: 14 }}>
            <Zap size={16} /> All Monitored Zones
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CONGESTION_ZONES.map(zone => {
              const adj = Math.min(99, Math.round(zone.index * weatherMultiplier));
              return (
                <div key={zone.stop}
                  onClick={() => setSelectedZone(zone)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 11, cursor: 'pointer',
                    background: selectedZone.stop === zone.stop ? `${zone.color}18` : 'var(--bg-tertiary)',
                    border: `1px solid ${selectedZone.stop === zone.stop ? zone.color + '55' : 'var(--card-border)'}`,
                    transition: 'all 0.18s ease'
                  }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{zone.stop}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{zone.delay} delay risk</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: zone.color }}>{adj}%</div>
                    <div style={{ fontSize: '0.65rem', color: zone.color }}>{zone.level}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System feeds */}
        <div className="glass-card">
          <h3 className="glass-card-title" style={{ marginBottom: 12 }}>Data Sources</h3>
          {[
            ['Historical Traffic DB', 'Connected',  'var(--emerald)'],
            ['Real-Time Weather Feed','Active',      'var(--cyan)'   ],
            ['GPS Position Stream',   'Live',        'var(--primary)'],
          ].map(([src, status, col]) => (
            <div key={src} className="detail-row">
              <span className="detail-label">{src}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: col }}>{status}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default TrafficPredictionView;
