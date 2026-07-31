import React, { useMemo, useEffect } from 'react';
import { STOP_COORDS } from '../context/AppContext';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { minsToTime } from '../utils/studentHelpers';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const busIcon = (color = '#06b6d4') => L.divIcon({
  className: '',
  html: `<div style="width:40px;height:40px;border-radius:50%;background:${color};
    border:3px solid #fff;display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 12px rgba(0,0,0,0.35);font-size:18px;">🚌</div>`,
  iconSize: [40, 40], iconAnchor: [20, 20]
});

const stopIcon = (isMyStop) => L.divIcon({
  className: '',
  html: `<div style="width:${isMyStop ? 18 : 12}px;height:${isMyStop ? 18 : 12}px;border-radius:50%;
    background:${isMyStop ? '#6366f1' : '#10b981'};border:2.5px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize:   [isMyStop ? 18 : 12, isMyStop ? 18 : 12],
  iconAnchor: [isMyStop ? 9 : 6,   isMyStop ? 9 : 6]
});

const AutoPan = ({ center }) => {
  const map = useMap();
  useEffect(() => { map.panTo(center, { animate: true, duration: 0.8 }); }, [center[0], center[1]]);
  return null;
};

const StudentBusMap = ({ myBus, myStudent, stopETAs }) => {
  // Use real GPS if available, otherwise always center on Vignan LARA campus
  const busLatLng = useMemo(() => {
    if (myBus?.gpsLat && myBus?.gpsLng) return [myBus.gpsLat, myBus.gpsLng];
    return [16.2345, 80.5613]; // Vignan LARA — Main Campus (default)
  }, [myBus?.gpsLat, myBus?.gpsLng]);

  // Route path from real GPS stop coordinates
  const routePath = useMemo(() =>
    (myBus?.stopSequence || [])
      .map(name => STOP_COORDS[name])
      .filter(Boolean)
      .map(c => [c.lat, c.lng])
  , [myBus?.stopSequence]);

  const busColor = myBus?.status === 'Delayed' ? '#f59e0b'
    : myBus?.status === 'Emergency' ? '#ef4444' : '#06b6d4';

  return (
    <MapContainer
      center={busLatLng}
      zoom={14}
      style={{ width: '100%', height: '100%', borderRadius: 14, zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <AutoPan center={busLatLng} />

      {/* Route polyline */}
      {routePath.length > 1 && (
        <Polyline positions={routePath}
          pathOptions={{ color: '#6366f1', weight: 5, opacity: 0.8 }} />
      )}

      {/* Stop markers */}
      {(myBus?.stopSequence || []).map((stopName, i) => {
        const coord    = STOP_COORDS[stopName];
        if (!coord) return null;
        const isMyStop = stopName === myStudent?.boardingStop;
        const isLast   = i === myBus.stopSequence.length - 1;
        const etaMins  = stopETAs?.[stopName];
        return (
          <Marker key={i} position={[coord.lat, coord.lng]} icon={stopIcon(isMyStop || isLast)}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
                  {isLast ? '🏁' : isMyStop ? '⭐' : '📍'} {stopName}
                </div>
                {isMyStop && <div style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.75rem', marginBottom: 4 }}>Your Boarding Stop</div>}
                {isLast  && <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem', marginBottom: 4 }}>Final — Vignan LARA</div>}
                {etaMins !== undefined
                  ? <><div style={{ fontSize: '0.78rem' }}>🕐 Bus in <strong>{etaMins} min</strong></div>
                       <div style={{ fontSize: '0.78rem', color: '#6366f1' }}>~{minsToTime(etaMins)}</div></>
                  : <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>✓ Already passed</div>
                }
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Live bus marker */}
      <Marker position={busLatLng} icon={busIcon(busColor)}>
        <Popup>
          <div style={{ fontFamily: 'Inter, sans-serif' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>🚌 {myBus?.number}</div>
            <div style={{ fontSize: '0.78rem' }}>Status: <strong>{myBus?.status}</strong></div>
            <div style={{ fontSize: '0.78rem' }}>Speed: <strong>{myBus?.speed} km/h</strong></div>
            <div style={{ fontSize: '0.78rem' }}>Next: <strong>{myBus?.nextStop}</strong></div>
            <div style={{ fontSize: '0.78rem' }}>Driver: <strong>{myBus?.driver}</strong></div>
            {myBus?.gpsLat && <div style={{ fontSize: '0.72rem', color: '#06b6d4', marginTop: 4 }}>📡 Live GPS</div>}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default StudentBusMap;
