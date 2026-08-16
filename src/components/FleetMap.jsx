/**
 * FleetMap — Leaflet-based real map for admin fleet tracking & driver mini-map.
 * Shows all buses (or a single bus) on OpenStreetMap tiles with live positions.
 */
import React, { useEffect, useMemo, useState, useRef, useCallback, useContext } from 'react';
import L from 'leaflet';
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, useMap, CircleMarker
} from 'react-leaflet';
import { STOP_COORDS, AppContext } from '../context/AppContext';
import 'leaflet/dist/leaflet.css';

// ── OSRM public demo server (swap for self-hosted in production) ──────────────
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Fetch road-snapped route from OSRM.
 * waypoints: [[lat,lng], [lat,lng], ...]
 * Returns array of [lat,lng] pairs forming the road path, or null on failure.
 */
async function fetchOSRMPath(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  try {
    // OSRM expects lng,lat order
    const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    // Convert GeoJSON [lng,lat] → Leaflet [lat,lng]
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;  // OSRM unavailable — fall back to straight lines
  }
}

// ── Fix Leaflet default icon paths broken by Vite ────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Custom bus marker ─────────────────────────────────────────────────────────
const makeBusIcon = (label, color, isSelected) => L.divIcon({
  className: '',
  html: `
    <div style="
      width:${isSelected ? 44 : 36}px;
      height:${isSelected ? 44 : 36}px;
      border-radius:50%;
      background:${color};
      border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 12px rgba(0,0,0,0.4),0 0 0 ${isSelected ? '6px' : '0'} ${color}55;
      font-size:${isSelected ? 20 : 16}px;
      transition:all 0.3s;
    ">🚌</div>
    <div style="
      position:absolute;top:${isSelected ? 46 : 38}px;left:50%;
      transform:translateX(-50%);
      background:${color};color:#fff;
      padding:2px 7px;border-radius:99px;
      font-size:10px;font-weight:800;white-space:nowrap;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
    ">${label}</div>`,
  iconSize:   [isSelected ? 44 : 36, isSelected ? 44 : 36],
  iconAnchor: [isSelected ? 22 : 18, isSelected ? 22 : 18],
});

// ── Stop pin marker ────────────────────────────────────────────────────────────
const makeStopIcon = (isHighlighted) => L.divIcon({
  className: '',
  html: `<div style="
    width:${isHighlighted ? 18 : 12}px;height:${isHighlighted ? 18 : 12}px;
    border-radius:50%;
    background:${isHighlighted ? '#6366f1' : '#10b981'};
    border:2.5px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize:   [isHighlighted ? 18 : 12, isHighlighted ? 18 : 12],
  iconAnchor: [isHighlighted ? 9  :  6, isHighlighted ? 9  :  6],
});

// ── Auto-pan to keep selected bus in view ─────────────────────────────────────
const AutoPan = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.panTo(center, { animate: true, duration: 0.6 });
  }, [center?.[0], center?.[1]]);
  return null;
};

// ── Bus colour by status ───────────────────────────────────────────────────────
const busColor = (status) => {
  if (status === 'Emergency') return '#ef4444';
  if (status === 'Delayed')   return '#f59e0b';
  if (status === 'On Route')  return '#06b6d4';
  return '#6366f1';
};

// ── Route colours per route name ─────────────────────────────────────────────
const ROUTE_COLORS = [
  '#6366f1','#06b6d4','#10b981','#f59e0b','#ec4899'
];

/**
 * Props:
 *   buses         — array of bus objects from AppContext
 *   selectedBusId — currently selected bus id
 *   onSelectBus   — (id) => void
 *   highlightStop — stop name to highlight (student's boarding stop)
 *   height        — CSS height string (default '440px')
 *   zoom          — initial zoom (default 13)
 *   singleBus     — if true, only renders selectedBus (driver mini-map mode)
 */
const FleetMap = ({
  buses = [],
  selectedBusId,
  onSelectBus,
  highlightStop,
  height = '440px',
  zoom = 13,
  singleBus = false,
}) => {
  // Merge DB coords (admin-configured) over static STOP_COORDS fallback
  const { dbStopCoords = {} } = useContext(AppContext);
  const resolveCoord = useCallback((name) =>
    dbStopCoords[name] || STOP_COORDS[name] || null
  , [dbStopCoords]);
  const visibleBuses = singleBus
    ? buses.filter(b => b.id === selectedBusId)
    : buses;

  const selectedBus = buses.find(b => b.id === selectedBusId) || buses[0];

  // Road-snapped paths per bus id — fetched from OSRM, fall back to straight lines
  const [osrmPaths,     setOsrmPaths]     = useState({});   // busId → [[lat,lng]]
  const lastFetchRef    = useRef({});  // busId → { lat, lng, ts } — for throttling
  const THROTTLE_METERS = 50;   // only re-fetch if bus moved > 50m
  const THROTTLE_MS     = 15000; // or if > 15s since last fetch

  // Haversine in meters (inline — no import needed)
  const distMeters = (a, b) => {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const sin2 = Math.sin(dLat/2)**2 +
      Math.cos(a[0]*Math.PI/180) * Math.cos(b[0]*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.asin(Math.sqrt(sin2));
  };

  // Build route polyline:
  // When bus has live GPS + remainingStops → draw from driver position through remaining stops only
  // When no GPS yet → draw full planned route from stop coords
  const buildRoutePath = (bus) => {
    const hasLiveGPS = bus.gpsLat && bus.gpsLng;

    const stops = hasLiveGPS && bus.remainingStops?.length > 0
      ? bus.remainingStops
      : bus.stopSequence || [];

    const path = [];
    if (hasLiveGPS) {
      path.push([bus.gpsLat, bus.gpsLng]);
    } else if (bus.startingLat && bus.startingLng) {
      path.push([bus.startingLat, bus.startingLng]);
    }
    stops.forEach(name => {
      const coord = resolveCoord(name);
      if (coord) {
        const last = path[path.length - 1];
        if (!last || last[0] !== coord.lat || last[1] !== coord.lng) {
          path.push([coord.lat, coord.lng]);
        }
      }
    });
    return path;
  };

  // Fetch OSRM road path for a single bus (throttled)
  const fetchRoadPath = useCallback(async (bus, straightPath) => {
    if (!bus?.gpsLat || !bus?.gpsLng || straightPath.length < 2) return;

    const busId  = bus.id;
    const now    = Date.now();
    const last   = lastFetchRef.current[busId];
    const curPos = [bus.gpsLat, bus.gpsLng];

    if (last) {
      const moved = distMeters([last.lat, last.lng], curPos);
      const aged  = now - last.ts;
      if (moved < THROTTLE_METERS && aged < THROTTLE_MS) return;
    }

    lastFetchRef.current[busId] = { lat: bus.gpsLat, lng: bus.gpsLng, ts: now };

    const roadPath = await fetchOSRMPath(straightPath);
    if (roadPath) {
      setOsrmPaths(prev => ({ ...prev, [busId]: roadPath }));
    }
  }, []);

  // Trigger OSRM fetch whenever selected bus GPS changes
  useEffect(() => {
    if (!selectedBus) return;
    const straight = buildRoutePath(selectedBus);
    fetchRoadPath(selectedBus, straight);
  }, [selectedBus?.gpsLat, selectedBus?.gpsLng, selectedBus?.remainingStops?.length]);

  // Map center — follow selected bus live GPS, else first known stop, else AP default
  const center = useMemo(() => {
    if (selectedBus?.gpsLat && selectedBus?.gpsLng)
      return [selectedBus.gpsLat, selectedBus.gpsLng];
    if (selectedBus?.stopSequence?.length) {
      const first = resolveCoord(selectedBus.stopSequence[0]);
      if (first) return [first.lat, first.lng];
    }
    return [16.2345, 80.5613];
  }, [selectedBus?.gpsLat, selectedBus?.gpsLng, resolveCoord]);

  return (
    <div style={{ width: '100%', height, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
        zoomControl
      >
        {/* ── Tile layers ── */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Auto-follow selected bus */}
        <AutoPan center={center} />

        {/* ── Per-bus: route line + stops + bus marker ── */}
        {visibleBuses.map((bus, busIdx) => {
          const routePath  = buildRoutePath(bus);
          const isSelected = bus.id === selectedBusId;
          const color      = ROUTE_COLORS[busIdx % ROUTE_COLORS.length];

          // Bus position: real GPS if available, else first stop
          const busPos = bus.gpsLat && bus.gpsLng
            ? [bus.gpsLat, bus.gpsLng]
            : (routePath[0] || [16.2345, 80.5613]);

          return (
            <React.Fragment key={bus.id}>
              {/* Route polyline — road-snapped if OSRM path available, else straight lines */}
              {routePath.length > 1 && (() => {
                // Use road-snapped path for selected bus, straight lines for others
                const drawPath = (isSelected && osrmPaths[bus.id])
                  ? osrmPaths[bus.id]
                  : routePath;
                return (
                  <Polyline
                    positions={drawPath}
                    pathOptions={{
                      color:     isSelected ? busColor(bus.status) : color,
                      weight:    isSelected ? 5 : 2,
                      opacity:   isSelected ? 0.85 : 0.35,
                      dashArray: isSelected ? null : '6 4',
                    }}
                  />
                );
              })()}

              {/* Stop markers — dim passed stops, highlight remaining */}
              {(bus.stopSequence || []).map((stopName, i) => {
                const coord = resolveCoord(stopName);
                if (!coord) return null;
                const isHighlighted = stopName === highlightStop;
                const isLast        = i === bus.stopSequence.length - 1;
                const isPassed      = bus.gpsLat && bus.remainingStops?.length > 0
                  && !bus.remainingStops.includes(stopName) && !isLast;
                return (
                  <Marker
                    key={`${bus.id}-stop-${i}`}
                    position={[coord.lat, coord.lng]}
                    icon={isPassed
                      ? L.divIcon({
                          className: '',
                          html: `<div style="width:10px;height:10px;border-radius:50%;background:#94a3b8;border:2px solid #fff;opacity:0.5"></div>`,
                          iconSize: [10,10], iconAnchor: [5,5],
                        })
                      : makeStopIcon(isHighlighted || isLast)
                    }
                    opacity={isPassed ? 0.4 : 1}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          {isLast ? '🏁' : isPassed ? '✓' : isHighlighted ? '⭐' : '📍'} {stopName}
                        </div>
                        {isPassed && (
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>
                            Already passed
                          </div>
                        )}
                        {isHighlighted && !isPassed && (
                          <div style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700 }}>
                            Your boarding stop
                          </div>
                        )}
                        {isLast && (
                          <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 700 }}>
                            Final destination
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                          Bus: {bus.number}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Live bus marker */}
              <Marker
                position={busPos}
                icon={makeBusIcon(bus.number, busColor(bus.status), isSelected)}
                eventHandlers={{ click: () => onSelectBus && onSelectBus(bus.id) }}
              >
                <Popup>
                  <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 180 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>
                      🚌 {bus.number}
                    </div>
                    <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse', width: '100%' }}>
                      {[
                        ['Driver',    bus.driver || 'Unassigned'],
                        ['Status',    bus.status],
                        ['Speed',     `${bus.speed} km/h`],
                        ['Next Stop', bus.nextStop || '—'],
                        ['ETA',       `${bus.eta} min`],
                        ['Seats',     `${bus.occupied}/${bus.capacity}`],
                        ['Fuel',      `${bus.fuel}%`],
                      ].map(([k, v]) => (
                        <tr key={k}>
                          <td style={{ color: '#64748b', paddingRight: 8, paddingBottom: 2 }}>{k}</td>
                          <td style={{ fontWeight: 600 }}>{v}</td>
                        </tr>
                      ))}
                    </table>
                    {bus.gpsLat && (
                      <div style={{ fontSize: '0.68rem', color: '#06b6d4', marginTop: 6 }}>
                        📡 GPS: {bus.gpsLat.toFixed(4)}°N, {bus.gpsLng.toFixed(4)}°E
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>

              {/* Pulsing ring for Emergency buses */}
              {bus.status === 'Emergency' && (
                <CircleMarker
                  center={busPos}
                  radius={22}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12, weight: 2 }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Campus terminus marker — uses last stop of selected bus, not hardcoded */}
        {(() => {
          if (!selectedBus?.stopSequence?.length) return null;
          const lastStop = selectedBus.stopSequence[selectedBus.stopSequence.length - 1];
          const coord = resolveCoord(lastStop);
          if (!coord) return null;
          return (
            <Marker
              position={[coord.lat, coord.lng]}
              icon={L.divIcon({
                className: '',
                html: `<div style="font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🏫</div>`,
                iconSize: [30, 30], iconAnchor: [15, 15]
              })}
            >
              <Popup>
                <div style={{ fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  🏁 {lastStop}<br/>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Final destination</span>
                </div>
              </Popup>
            </Marker>
          );
        })()}
      </MapContainer>
    </div>
  );
};

export default FleetMap;
