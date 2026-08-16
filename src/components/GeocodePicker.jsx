/**
 * GeocodePicker.jsx
 * 
 * Reusable address → coordinates picker with Nominatim geocoding + Leaflet preview.
 * 
 * Usage:
 *   <GeocodePicker
 *     label="Stop Address"
 *     placeholder="e.g. Benz Circle, Vijayawada"
 *     initialLat={16.5062}
 *     initialLng={80.648}
 *     onConfirm={({ lat, lng, name }) => ...}
 *   />
 */

import React, { useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, MapPin, CheckCircle, Loader } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Inner component — handles drag-to-correct on the map
const DraggableMarker = ({ position, onMove }) => {
  const markerRef = useRef(null);

  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      draggable
      ref={markerRef}
      eventHandlers={{
        dragend() {
          const m = markerRef.current;
          if (m) {
            const pos = m.getLatLng();
            onMove(pos.lat, pos.lng);
          }
        },
      }}
    />
  );
};

const GeocodePicker = ({
  label       = 'Address',
  placeholder = 'Enter address, landmark, or area name',
  initialLat  = null,
  initialLng  = null,
  token       = null,        // JWT token for the geocode API
  onConfirm   = () => {},    // called with { lat, lng, displayName }
  onCancel    = () => {},
}) => {
  const [query,       setQuery]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [pickedLat,   setPickedLat]   = useState(initialLat);
  const [pickedLng,   setPickedLng]   = useState(initialLng);
  const [displayName, setDisplayName] = useState('');
  const [confirmed,   setConfirmed]   = useState(false);

  const mapCenter = pickedLat && pickedLng
    ? [pickedLat, pickedLng]
    : [16.5449, 80.6400]; // AP default center

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res  = await fetch(
        `${API}/geocode?q=${encodeURIComponent(query.trim() + ', Andhra Pradesh, India')}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Address not found. Try adding city/district name.');
        return;
      }
      setPickedLat(data.lat);
      setPickedLng(data.lng);
      setDisplayName(data.displayName);
      setConfirmed(false);
    } catch {
      setError('Cannot reach geocoding service. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [query, token]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
  };

  const handleConfirm = () => {
    if (!pickedLat || !pickedLng) return;
    setConfirmed(true);
    onConfirm({ lat: pickedLat, lng: pickedLng, displayName });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {label && (
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
      )}

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          value={query}
          onChange={e => { setQuery(e.target.value); setConfirmed(false); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '8px 14px', flexShrink: 0 }}
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading
            ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : <Search size={16} />}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: '0.78rem', color: 'var(--rose)', padding: '6px 10px',
          background: 'var(--rose-soft)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Map preview */}
      {pickedLat && pickedLng && (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <MapContainer
            key={`${pickedLat}-${pickedLng}`}
            center={mapCenter}
            zoom={15}
            style={{ height: 220, width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DraggableMarker
              position={[pickedLat, pickedLng]}
              onMove={(lat, lng) => {
                setPickedLat(lat);
                setPickedLng(lng);
                setConfirmed(false);
              }}
            />
          </MapContainer>

          <div style={{
            padding: '8px 12px', background: 'var(--bg-secondary)',
            fontSize: '0.75rem', color: 'var(--text-muted)',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <MapPin size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {pickedLat.toFixed(6)}°N, {pickedLng.toFixed(6)}°E
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                Drag pin to fine-tune · Click map to move
              </span>
            </div>
            {displayName && (
              <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coordinates display + confirm */}
      {pickedLat && pickedLng && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Latitude</label>
              <input
                className="form-input"
                type="number"
                step="any"
                value={pickedLat.toFixed(6)}
                onChange={e => { setPickedLat(parseFloat(e.target.value)); setConfirmed(false); }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Longitude</label>
              <input
                className="form-input"
                type="number"
                step="any"
                value={pickedLng.toFixed(6)}
                onChange={e => { setPickedLng(parseFloat(e.target.value)); setConfirmed(false); }}
              />
            </div>
          </div>
          <button
            type="button"
            className={`btn ${confirmed ? 'btn-emerald' : 'btn-primary'}`}
            style={{ alignSelf: 'flex-end', padding: '10px 16px', flexShrink: 0 }}
            onClick={handleConfirm}
          >
            <CheckCircle size={15} />
            {confirmed ? 'Confirmed' : 'Use This'}
          </button>
        </div>
      )}

      {!pickedLat && !pickedLng && !loading && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px 0' }}>
          Type an address above and press Enter or click 🔍 to geocode it.
        </div>
      )}
    </div>
  );
};

export default GeocodePicker;
