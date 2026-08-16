import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { io as socketIO } from 'socket.io-client';
import { getStudentAlerts } from '../utils/studentHelpers';
import { apiFetch } from '../utils/apiFetch';

export { getMyStudent, getStudentAlerts, minsToTime, computeHistoryStats, weatherDelayMins } from '../utils/studentHelpers';

export const AppContext = createContext();

const API         = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL  = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// ── Geo constants — Vignan LARA bounding box ─────────────────────────────────
const CANVAS_W = 800, CANVAS_H = 480;
const GEO_TOP_LEFT     = { lat: 16.2500, lng: 80.5400 };
const GEO_BOTTOM_RIGHT = { lat: 16.2200, lng: 80.5800 };

export const canvasToLatLng = (x, y) => ({
  lat: GEO_TOP_LEFT.lat + (y / CANVAS_H) * (GEO_BOTTOM_RIGHT.lat - GEO_TOP_LEFT.lat),
  lng: GEO_TOP_LEFT.lng + (x / CANVAS_W) * (GEO_BOTTOM_RIGHT.lng - GEO_TOP_LEFT.lng)
});

export const latLngToCanvas = (lat, lng) => ({
  x: Math.round(((lng - GEO_TOP_LEFT.lng) / (GEO_BOTTOM_RIGHT.lng - GEO_TOP_LEFT.lng)) * CANVAS_W),
  y: Math.round(((lat - GEO_TOP_LEFT.lat) / (GEO_BOTTOM_RIGHT.lat - GEO_TOP_LEFT.lat)) * CANVAS_H)
});

export const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sin2 = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
};

// Known stop GPS coordinates — matches server/routes/buses.js
export const STOP_COORDS = {
  'Vadlamudi Bus Stand':       { lat: 16.2472, lng: 80.5418 },
  'Guntur Highway Gate':       { lat: 16.2420, lng: 80.5510 },
  'VLITS Main Gate':           { lat: 16.2365, lng: 80.5590 },
  'Tenali Road Stop':          { lat: 16.2488, lng: 80.5762 },
  'Pedaparupudi Junction':     { lat: 16.2440, lng: 80.5670 },
  'Chebrolu Cross Roads':      { lat: 16.2390, lng: 80.5640 },
  'Kollipara Village Stop':    { lat: 16.2318, lng: 80.5428 },
  'Mangalagiri Bypass':        { lat: 16.2350, lng: 80.5530 },
  'Hostel Block — VLITS':      { lat: 16.2355, lng: 80.5600 },
  'Vignan LARA — Main Campus': { lat: 16.2345, lng: 80.5613 },
  'Amaravati Capital Stop':    { lat: 16.2610, lng: 80.5230 },
  'Undavalli Junction':        { lat: 16.2510, lng: 80.5340 },
  'Tadepalli Gate':            { lat: 16.2455, lng: 80.5420 },
  'Guntur RTC Complex':        { lat: 16.3070, lng: 80.4370 },
  'Brodipet Stop':             { lat: 16.2890, lng: 80.4780 },
  'Nallapadu Gate':            { lat: 16.2680, lng: 80.5050 },
};

// ETA calculation from lat/lng using stop sequence
// Accepts optional extraCoords map (DB stop coords) to supplement static STOP_COORDS
export const calcStopETAs = (busLat, busLng, stopSequence, speedKmh = 30, extraCoords = {}) => {
  if (!busLat || !busLng || !stopSequence?.length) return {};
  const busPos = { lat: busLat, lng: busLng };
  const etas = {};
  let distKm = 0, prev = busPos;
  for (const stopName of stopSequence) {
    const coord = extraCoords[stopName] || STOP_COORDS[stopName];
    if (!coord) continue;
    distKm += haversineKm(prev, coord);
    etas[stopName] = Math.max(0, Math.round((distKm / speedKmh) * 60));
    prev = coord;
  }
  return etas;
};

// Legacy canvas-based ETA (kept for StudentBusMap compatibility)
export const calcStopETAsCanvas = (busX, busY, coordIndex, routeCoords, speedKmh = 30) => {
  const busPos = canvasToLatLng(busX, busY);
  const etas = {};
  let distKm = 0, prev = busPos;
  for (let i = coordIndex; i < routeCoords.length; i++) {
    const pt = routeCoords[i];
    const ptPos = canvasToLatLng(pt.x, pt.y);
    distKm += haversineKm(prev, ptPos);
    if (pt.stop) etas[pt.stop] = Math.round((distKm / speedKmh) * 60);
    prev = ptPos;
  }
  return etas;
};

// Build routeCoords array from stopSequence for canvas rendering
export const buildRouteCoords = (stopSequence) =>
  (stopSequence || []).map(name => {
    const coord = STOP_COORDS[name];
    if (!coord) return { x: 400, y: 240, stop: name };
    return latLngToCanvas(coord.lat, coord.lng);
  }).map((pt, i) => ({ ...pt, stop: stopSequence[i] }));

// Normalise a DB bus document → frontend bus object
const normaliseBus = (b) => ({
  id:            b._id || b.id,
  number:        b.busNumber,
  driver:        b.driverName || 'Unassigned',
  driverId:      b.driverId,
  capacity:      b.capacity || 50,
  occupied:      b.occupied || 0,
  status:        b.status   || 'Standby',
  route:         b.route    || '',
  stopSequence:  b.stopSequence || [],
  remainingStops: b.remainingStops || b.stopSequence || [],
  startingPoint: b.startingPoint || (b.stopSequence?.[0] || ''),
  startingLat:   b.startingLat,
  startingLng:   b.startingLng,
  routeCoords:   buildRouteCoords(b.stopSequence),
  coordIndex:    b.coordIndex  || 0,
  x:             b.canvasX     || 400,
  y:             b.canvasY     || 240,
  gpsLat:        b.gpsLat,
  gpsLng:        b.gpsLng,
  gpsUpdatedAt:  b.gpsUpdatedAt,
  speed:         b.speed        || 0,
  fuel:          b.fuel         || 100,
  nextStop:      b.nextStop     || (b.stopSequence?.[0] || ''),
  eta:           b.etaToNextStop || 0,
  driverChecklist: (b.driverChecklist || []).map(c => ({ task: c.task, done: c.done }))
});

export const AppProvider = ({ children }) => {
  // Theme state
  const [theme, setTheme] = useState('light');
  
  // Auth state — currentUser includes: { id, role, name, email, phone, studentId?, busId?, token }
  const [currentUser, setCurrentUser] = useState(() => {
    // Restore session from localStorage on page reload
    try {
      const saved = localStorage.getItem('transitUser');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Persist / clear session
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('transitUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('transitUser');
    }
  }, [currentUser]);

  // ── Startup: expire stale tokens, proactively refresh tokens near expiry ──
  useEffect(() => {
    if (!currentUser?.token) return;

    // Decode exp without verifying signature (client-side check only)
    const decodeExp = (t) => {
      try { return JSON.parse(atob(t.split('.')[1])).exp; } catch { return 0; }
    };
    const exp = decodeExp(currentUser.token);
    const msRemaining = exp * 1000 - Date.now();

    // Already expired — log out immediately
    if (msRemaining <= 0) {
      setCurrentUser(null);
      return;
    }

    // Within 24h of expiry — refresh in background
    if (msRemaining < 24 * 60 * 60 * 1000) {
      fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.token) setCurrentUser(u => ({ ...u, token: data.token }));
        })
        .catch(() => {});
    }

    // Schedule auto-logout 30s before token expires (safety net)
    const logoutIn = Math.max(0, msRemaining - 30_000);
    const timer = setTimeout(() => setCurrentUser(null), logoutIn);
    return () => clearTimeout(timer);
  }, [currentUser?.token]);

  const [studentFeedbacks, setStudentFeedbacks] = useState([]);

  // ── API: Register new user ──
  const registerUser = async ({ name, email, password, phone, role, dept, year, boardingStop, busNumber, institutionId }) => {
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone, role, dept, year, boardingStop, busNumber, institutionId })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message || 'Registration failed.' };
      return { success: true };
    } catch {
      return { success: false, message: 'Cannot reach server. Is the backend running?' };
    }
  };

  // ── API: Fetch public institutions list (for signup dropdown) ──
  const fetchPublicInstitutions = async () => {
    try {
      const res = await fetch(`${API}/institutions/public`);
      if (!res.ok) return [];
      return await res.json(); // [{ _id, name, city }]
    } catch { return []; }
  };

  // ── API: Login ──
  const loginUser = async ({ email, password }) => {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message || 'Login failed.' };
      return { success: true, user: data.user, token: data.token };
    } catch {
      return { success: false, message: 'Cannot reach server. Is the backend running?' };
    }
  };

  // ── API: Request MFA OTP ──
  const requestOTP = async (email) => {
    try {
      const res = await fetch(`${API}/auth/request_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      return { success: true, message: data.message, devCode: data.devCode };
    } catch {
      return { success: false, message: 'Cannot reach server.' };
    }
  };

  // ── API: Verify MFA OTP ──
  const verifyOTP = async (email, code) => {
    try {
      const res = await fetch(`${API}/auth/verify_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      return { success: true };
    } catch {
      return { success: false, message: 'Cannot reach server.' };
    }
  };

  // ── API: Fetch & merge student transit profile ──
  const fetchStudentProfile = useCallback(async (user) => {
    if (!user?.token || user.role !== 'student') return null;
    try {
      const res = await fetch(`${API}/students/me`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (!res.ok) return null;

      const raw = data.student;

      // Normalise DB field names → frontend field names used across all views
      const profile = {
        ...raw,
        id:           raw._id?.toString() || raw.id,
        dept:         raw.department  || raw.dept || '',
        boardingStop: raw.pickupPoint || raw.boardingStop || '',
        assignedBus:  raw.assignedBus  || '',
        assignedRoute: raw.assignedRoute || '',
        predBoardingTime:   raw.predBoardingTime   || '--:--',
        actualBoardingTime: raw.actualBoardingTime || '--:--',
        attendanceStatus:   raw.attendanceStatus   || 'Waiting',
      };

      setStudents(prev => {
        // Match by _id, id, studentId, or email — whichever lands first
        const idx = prev.findIndex(s =>
          s.id        === profile.id ||
          s._id       === profile.id ||
          s.studentId === profile.studentId ||
          s.email     === profile.email
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...profile };
          return next;
        }
        return [profile, ...prev];
      });

      const profileId = profile.id || profile._id;
      if (profileId && user.studentId !== profileId) {
        setCurrentUser(prev => prev ? { ...prev, studentId: profileId } : prev);
      }

      return profile;
    } catch {
      return null;
    }
  }, []);

  // ── API: Update student transit profile ──
  const updateStudentProfile = async ({ dept, year, phone, boardingStop }) => {
    try {
      const res = await fetch(`${API}/students/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser?.token}`
        },
        body: JSON.stringify({ dept, year, phone, boardingStop })
      });
      const data = await res.json();
      if (!res.ok) {
        triggerToast(data.message || 'Update failed.', 'danger');
        return false;
      }

      const profile = data.student;
      setStudents(prev => {
        const idx = prev.findIndex(s => s.id === profile.id || s.id === profile._id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...profile };
          return next;
        }
        return [...prev, profile];
      });
      triggerToast('Transit profile updated!', 'success');
      return true;
    } catch {
      triggerToast('Cannot reach server.', 'danger');
      return false;
    }
  };

  // ── API: Load student's feedback history ──
  const fetchStudentFeedbacks = useCallback(async (user) => {
    if (!user?.token || user.role !== 'student') return;
    try {
      const res = await fetch(`${API}/students/me/feedbacks`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (!res.ok) return;

      setStudentFeedbacks(data.feedbacks || []);
    } catch { /* keep local state */ }
  }, []);

  // ── API: Save notification preferences ──
  const saveNotificationPrefs = async (prefs) => {
    if (currentUser?.role !== 'student' || !currentUser?.token) {
      triggerToast('Notification preferences saved.', 'success');
      return true;
    }
    try {
      const res = await fetch(`${API}/students/me/notifications`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token}`
        },
        body: JSON.stringify(prefs)
      });
      if (!res.ok) {
        triggerToast('Failed to save preferences.', 'danger');
        return false;
      }
      triggerToast('Notification preferences saved.', 'success');
      return true;
    } catch {
      triggerToast('Cannot reach server.', 'danger');
      return false;
    }
  };

  // Sync student profile & feedbacks when student logs in
  useEffect(() => {
    if (currentUser?.role === 'student' && currentUser?.token) {
      fetchStudentProfile(currentUser);
      fetchStudentFeedbacks(currentUser);
    } else {
      setStudentFeedbacks([]);
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.token, fetchStudentProfile, fetchStudentFeedbacks]);

  // ── API: Update profile ──
  const updateUserProfile = async ({ name, email, phone, password }) => {
    try {
      const res = await fetch(`${API}/auth/update_profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.token}`
        },
        body: JSON.stringify({ name, email, phone, password })
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message || 'Update failed.', 'danger'); return; }
      // Update currentUser with new values from DB
      setCurrentUser(prev => ({ ...prev, ...data.user }));
      triggerToast('Profile updated successfully!', 'success');
    } catch {
      triggerToast('Cannot reach server.', 'danger');
    }
  };

  // Live weather & academic state (controls AI prediction behavior)
  const [weather, setWeather] = useState('Sunny');
  const [weatherSource, setWeatherSource] = useState('manual'); // 'manual' | 'gps'
  const [academicPeriod, setAcademicPeriod] = useState('Regular Semester');

  // ── Auto-fetch real weather from Open-Meteo based on GPS coords ─────────────
  // Called every time the driver pushes GPS. No API key required.
  const fetchWeatherFromGPS = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=weather_code,wind_speed_10m,precipitation&timezone=auto`
      );
      if (!res.ok) return;
      const data = await res.json();
      const code = data.current?.weather_code ?? 0;
      const precip = data.current?.precipitation ?? 0;

      // WMO weather code → our 3-state model
      // 0-1 = clear, 2-3 = partly cloudy → Sunny
      // 45,48 = fog → Foggy
      // 51-67, 80-82 = rain/drizzle → Rainy
      // 71-77, 85-86 = snow → Rainy (treated as heavy delay)
      // 95-99 = thunderstorm → Rainy
      let condition = 'Sunny';
      if (code === 45 || code === 48) condition = 'Foggy';
      else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || precip > 0.2) condition = 'Rainy';
      else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) condition = 'Rainy';
      else if (code >= 95) condition = 'Rainy';

      setWeather(condition);
      setWeatherSource('gps');
    } catch {
      // silently keep existing weather state
    }
  };

  // Emergency SOS state
  const [sosActive, setSosActive]   = useState(false);
  const [sosMessages, setSosMessages] = useState([]);

  // Socket.io connection status — shown in Header
  const [socketConnected, setSocketConnected] = useState(false);

  // ── Real buses — fetched from MongoDB via /api/buses ────────────────────────
  const [buses, setBuses] = useState([]);
  const [busesLoading, setBusesLoading] = useState(false);

  const fetchBuses = useCallback(async () => {
    if (!currentUser?.token) return;
    setBusesLoading(true);
    try {
      const res  = await apiFetch('/buses', {
        user: currentUser, setCurrentUser
      });
      if (!res.ok) return;
      const data = await res.json();
      setBuses(data.map(normaliseBus));
    } catch { /* keep existing state */ }
    finally { setBusesLoading(false); }
  }, [currentUser?.token]);

  // Fetch buses on login (initial full load)
  useEffect(() => {
    if (currentUser?.token) fetchBuses();
    else setBuses([]);
  }, [currentUser?.token, fetchBuses]);

  // ── Real-time bus updates via Socket.io ───────────────────────────────────
  // Replaces the old 10-second polling interval.
  // Server emits bus:gps_update and bus:status_update whenever a driver pushes.
  useEffect(() => {
    if (!currentUser?.token || !currentUser?.institutionId) return;

    const socket = socketIO(SOCKET_URL, {
      transports:        ['websocket', 'polling'],
      auth:              { token: currentUser.token },
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    // Join institution room so we only receive our own data
    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join_institution', currentUser.institutionId);
    });

    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', () => setSocketConnected(false));

    // Patch a single bus in state with the GPS update — no full re-fetch needed
    socket.on('bus:gps_update', (update) => {
      setBuses(prev => prev.map(b =>
        b.number === update.busNumber
          ? {
              ...b,
              gpsLat:        update.gpsLat,
              gpsLng:        update.gpsLng,
              speed:         update.speed,
              fuel:          update.fuel   ?? b.fuel,
              status:        update.status,
              nextStop:      update.nextStop,
              eta:           update.etaToNextStop,
              remainingStops: update.remainingStops || b.remainingStops,
            }
          : b
      ));
    });

    // Patch status/delay change
    socket.on('bus:status_update', (update) => {
      setBuses(prev => prev.map(b =>
        b.number === update.busNumber
          ? { ...b, status: update.status, eta: update.etaToNextStop }
          : b
      ));
    });

    // Real-time notification — append to alerts so Header badge + Notifications view update instantly
    socket.on('notification:new', (notif) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const alert = {
        id:      notif._id || Date.now(),
        message: notif.message,
        type:    notif.type || 'info',
        time,
      };
      // Add to persistent alert log (deduplicate by id)
      setAlerts(prev => {
        if (prev.some(a => a.id === alert.id)) return prev;
        return [alert, ...prev.slice(0, 19)];
      });
      // Also show as auto-dismiss toast
      setToasts(prev => [...prev, { ...alert }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== alert.id));
      }, 5000);
    });

    // Real-time attendance — update student status and bus occupied count instantly
    socket.on('attendance:boarded', (data) => {
      // Update the student's status in context (student portal sees it immediately)
      setStudents(prev => prev.map(s =>
        (s.studentId === data.studentId || s.id === data.studentId)
          ? { ...s, attendanceStatus: 'Boarded', actualBoardingTime: data.time }
          : s
      ));
      // Update bus occupied count
      setBuses(prev => prev.map(b =>
        b.number === data.busNumber
          ? { ...b, occupied: data.occupied }
          : b
      ));
    });

    // Real-time SOS — immediately mark the affected bus as Emergency in state
    socket.on('emergency:sos', (data) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // Update bus status in state
      setBuses(prev => prev.map(b =>
        b.number === data.busNumber ? { ...b, status: 'Emergency', speed: 0 } : b
      ));
      // Add high-priority alert
      const sosAlert = {
        id:      data._id || Date.now(),
        message: `🚨 SOS: ${data.busNumber} — ${data.reason}`,
        type:    'danger',
        time,
      };
      setAlerts(prev => {
        if (prev.some(a => a.id === sosAlert.id)) return prev;
        return [sosAlert, ...prev.slice(0, 19)];
      });
      setToasts(prev => [...prev, { ...sosAlert }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== sosAlert.id));
      }, 8000); // SOS toasts stay longer
    });

    socket.on('connect_error', () => {
      // Silent — fallback poll keeps data fresh if WebSocket fails
    });

    // Fallback: poll every 30s instead of 10s (WebSocket covers real-time)
    const fallbackId = setInterval(fetchBuses, 30000);

    return () => {
      socket.disconnect();
      clearInterval(fallbackId);
    };
  }, [currentUser?.token, currentUser?.institutionId, fetchBuses]);

  // ── Admin: fetch all drivers (for bus assignment panel) ─────────────────────
  const fetchAllDrivers = useCallback(async () => {
    if (!currentUser?.token) return [];
    try {
      const res = await fetch(`${API}/auth/drivers`, {
        headers: { Authorization: `Bearer ${currentUser.token}` }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }, [currentUser?.token]);

  // ── Admin: fetch unassigned drivers ──────────────────────────────────────────
  const fetchUnassignedDrivers = useCallback(async () => {
    if (!currentUser?.token) return [];
    try {
      const res = await fetch(`${API}/buses/unassigned_drivers`, {
        headers: { Authorization: `Bearer ${currentUser.token}` }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }, [currentUser?.token]);

  // ── Admin: assign driver to bus ───────────────────────────────────────────────
  const assignDriverToBus = useCallback(async (busNumber, driverId) => {
    if (!currentUser?.token) return { success: false };
    try {
      const res = await fetch(`${API}/buses/${busNumber}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ driverId })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      // Refresh buses list
      await fetchBuses();
      return { success: true, message: data.message };
    } catch { return { success: false, message: 'Server error.' }; }
  }, [currentUser?.token, fetchBuses]);

  // ── Admin: unassign driver from bus ──────────────────────────────────────
  const unassignDriverFromBus = useCallback(async (busNumber) => {
    if (!currentUser?.token) return { success: false };
    try {
      const res = await fetch(`${API}/buses/${busNumber}/unassign`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${currentUser.token}` }
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      await fetchBuses();
      return { success: true };
    } catch { return { success: false }; }
  }, [currentUser?.token, fetchBuses]);

  // ── Admin: set bus starting point ────────────────────────────────────────
  const setBusStartingPoint = useCallback(async (busNumber, startingPoint) => {
    if (!currentUser?.token) return { success: false };
    try {
      const res = await fetch(`${API}/buses/${busNumber}/starting-point`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ startingPoint })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      await fetchBuses();
      return { success: true, message: data.message };
    } catch { return { success: false, message: 'Server error.' }; }
  }, [currentUser?.token, fetchBuses]);
  // Called by DriverDashboardView on a timer using browser Geolocation API
  const pushDriverGPS = useCallback(async ({ lat, lng, speed, fuel }) => {
    if (!currentUser?.token || currentUser.role !== 'driver') return null;
    try {
      const res  = await apiFetch('/buses/me/gps', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lat, lng, speed: speed || 0, fuel }),
        user: currentUser, setCurrentUser
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Update the bus in local state immediately
      setBuses(prev => prev.map(b =>
        b.number === data.bus.busNumber ? normaliseBus(data.bus) : b
      ));
      // Auto-update weather from driver's real GPS location (no API key needed)
      fetchWeatherFromGPS(lat, lng);
      return data; // { bus, stopETAs }
    } catch { return null; }
  }, [currentUser?.token, currentUser?.role]);

  // ── Driver status / delay update ─────────────────────────────────────────────
  const updateBusStatus = useCallback(async ({ status, delayMins }) => {
    if (!currentUser?.token || currentUser.role !== 'driver') return;
    try {
      const res  = await fetch(`${API}/buses/me/status`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ status, delayMins })
      });
      if (!res.ok) return;
      const updated = await res.json();
      setBuses(prev => prev.map(b =>
        b.number === updated.busNumber ? normaliseBus(updated) : b
      ));
      if (delayMins) addAlert(`${updated.busNumber} reported a +${delayMins} min delay.`, 'warning');
    } catch { /* keep local */ }
  }, [currentUser?.token, currentUser?.role]);

  // ── Driver checklist toggle ──────────────────────────────────────────────────
  const toggleChecklistItem = useCallback(async (taskIndex, done) => {
    if (!currentUser?.token || currentUser.role !== 'driver') return;
    try {
      const res  = await fetch(`${API}/buses/me/checklist`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ taskIndex, done })
      });
      if (!res.ok) return;
      const updated = await res.json();
      setBuses(prev => prev.map(b =>
        b.number === updated.busNumber ? normaliseBus(updated) : b
      ));
    } catch {
      // Optimistic fallback — update local state anyway
      setBuses(prev => prev.map(b => {
        if (b.driverId?.toString() !== currentUser.id?.toString()) return b;
        const cl = [...b.driverChecklist];
        if (cl[taskIndex]) cl[taskIndex] = { ...cl[taskIndex], done };
        return { ...b, driverChecklist: cl };
      }));
    }
  }, [currentUser?.token, currentUser?.role, currentUser?.id]);

  // ── Fetch available (unassigned) buses for driver signup ──────────────────
  const fetchAvailableBuses = async () => {
    try {
      const res  = await fetch(`${API}/buses/available`);
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  };

  // 2. Students state — starts empty, populated from DB on login
  // - Admin views fetch directly via GET /api/students (StudentManagementView)
  // - Student role gets their own profile merged in via fetchStudentProfile
  // - Driver views use attendance API, not this array
  const [students, setStudents] = useState([]);

  // 3. Boarding Point Management State — Vignan's LARA campus stops
  const [boardingStops, setBoardingStops] = useState([
    { id: 'BST01', name: 'Vadlamudi Bus Stand',       studentCount: 15, avgPickupTime: '07:33 AM', x: 60,         y: 60,         suggestMerge: false },
    { id: 'BST02', name: 'Guntur Highway Gate',        studentCount: 8,  avgPickupTime: '07:46 AM', x: 300,        y: 140,        suggestMerge: false },
    { id: 'BST03', name: 'VLITS Main Gate',            studentCount: 18, avgPickupTime: '07:59 AM', x: 530,        y: 230,        suggestMerge: false },
    { id: 'BST04', name: 'Tenali Road Stop',           studentCount: 12, avgPickupTime: '07:40 AM', x: 740,        y: 50,         suggestMerge: false },
    { id: 'BST05', name: 'Pedaparupudi Junction',      studentCount: 3,  avgPickupTime: '07:54 AM', x: 640,        y: 155,        suggestMerge: true, mergeWith: 'VLITS Main Gate' },
    { id: 'BST06', name: 'Chebrolu Cross Roads',       studentCount: 14, avgPickupTime: '08:11 AM', x: 610,        y: 250,        suggestMerge: false },
    { id: 'BST07', name: 'Kollipara Village Stop',     studentCount: 22, avgPickupTime: '07:47 AM', x: 60,         y: 400,        suggestMerge: false },
    { id: 'BST08', name: 'Mangalagiri Bypass',         studentCount: 19, avgPickupTime: '08:03 AM', x: 300,        y: 310,        suggestMerge: false },
    { id: 'BST09', name: 'Hostel Block — VLITS',       studentCount: 2,  avgPickupTime: '08:15 AM', x: 540,        y: 230,        suggestMerge: true, mergeWith: 'Vignan LARA — Main Campus' },
    { id: 'BST10', name: 'Vignan LARA — Main Campus',  studentCount: 0,  avgPickupTime: '08:25 AM', x: 680,        y: 320,        suggestMerge: false }
  ]);

  // 4. Alerts state — starts empty, populated by real events
  const [alerts, setAlerts] = useState([]);

  // Track which alert IDs have been read
  const [readAlertIds, setReadAlertIds] = useState(new Set());

  const markAllAlertsRead = () => {
    setReadAlertIds(prev => {
      const next = new Set(prev);
      alerts.forEach(a => next.add(a.id));
      return next;
    });
  };

  const clearAllAlerts = () => {
    setAlerts([]);
    setReadAlertIds(new Set());
  };

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    setReadAlertIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // 5. Prediction History — aligned to VLITS boarding stops
  const [predictionHistory, setPredictionHistory] = useState([
    { id: 1, date: '2026-06-15', student: 'Rahul Kumar',   stop: 'Vadlamudi Bus Stand',    predicted: '07:32 AM', actual: '07:34 AM', err: '+2 mins' },
    { id: 2, date: '2026-06-15', student: 'Priya Patel',   stop: 'Tenali Road Stop',       predicted: '07:40 AM', actual: '07:39 AM', err: '-1 min'  },
    { id: 3, date: '2026-06-15', student: 'Neha Das',      stop: 'Guntur Highway Gate',    predicted: '07:45 AM', actual: '07:48 AM', err: '+3 mins' },
    { id: 4, date: '2026-06-14', student: 'Rahul Kumar',   stop: 'Vadlamudi Bus Stand',    predicted: '07:35 AM', actual: '07:35 AM', err: '0 mins'  },
    { id: 5, date: '2026-06-14', student: 'Priya Patel',   stop: 'Tenali Road Stop',       predicted: '07:42 AM', actual: '07:44 AM', err: '+2 mins' },
    { id: 6, date: '2026-06-13', student: 'Rahul Kumar',   stop: 'Vadlamudi Bus Stand',    predicted: '07:33 AM', actual: '07:31 AM', err: '-2 mins' },
    { id: 7, date: '2026-06-12', student: 'Rahul Kumar',   stop: 'Vadlamudi Bus Stand',    predicted: '07:34 AM', actual: '07:36 AM', err: '+2 mins' },
    { id: 8, date: '2026-06-11', student: 'Kiran Shah',    stop: 'Kollipara Village Stop', predicted: '07:48 AM', actual: '--:--',    err: 'Absent'  }
  ]);

  // 6. Feedbacks & Complaints State
  const [feedbacks, setFeedbacks] = useState([
    { id: 1, name: 'Amit Roy', category: 'Delay issues', message: 'Route B was delayed by 15 mins yesterday.', rating: 3, status: 'In Progress', date: '2026-06-15' },
    { id: 2, name: 'Ananya Sen', category: 'Bus condition', message: 'Air conditioner in BUS-309 is not cooling properly.', rating: 2, status: 'Open', date: '2026-06-16' },
    { id: 3, name: 'Sana Khan', category: 'Driver behavior', message: 'Driver Vikram Singh is extremely punctual and polite.', rating: 5, status: 'Resolved', date: '2026-06-14' }
  ]);

  // Active toast queue (separate from alert log, auto-dismissed)
  const [toasts, setToasts] = useState([]);

  // Toast notifier — adds to persistent alert log AND to auto-dismiss toast queue
  // Deduplicates identical messages within a 2-second window
  const recentToastRef = React.useRef({});
  const triggerToast = (message, type = 'info') => {
    const dedupeKey = `${type}::${message}`;
    const now = Date.now();
    if (recentToastRef.current[dedupeKey] && now - recentToastRef.current[dedupeKey] < 2000) {
      return; // suppress duplicate within 2s
    }
    recentToastRef.current[dedupeKey] = now;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = now + Math.random();
    const newAlert = { id, message, type, time };

    // Persistent alert log (for Notifications view)
    setAlerts(prev => [newAlert, ...prev.slice(0, 19)]);

    // Auto-dismiss toast queue
    setToasts(prev => [...prev, { id, message, type, time }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Add Feedback helper — persists to API for students AND drivers via /api/feedbacks
  const addFeedback = async (feedback) => {
    const entry = {
      id: Date.now(),
      name: feedback.name || currentUser?.name || 'Anonymous',
      category: feedback.category,
      message: feedback.message,
      rating: feedback.rating,
      status: 'Open',
      date: new Date().toISOString().split('T')[0]
    };

    if (currentUser?.token) {
      try {
        const res = await fetch(`${API}/feedbacks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentUser.token}`
          },
          body: JSON.stringify({
            name: currentUser.name,
            category: feedback.category,
            rating: feedback.rating,
            message: feedback.message
          })
        });
        const data = await res.json();
        if (res.ok) {
          // Also keep in student's own history for the student view
          if (currentUser.role === 'student') {
            setStudentFeedbacks(prev => [data.feedback, ...prev]);
          }
          triggerToast('Feedback submitted successfully. Thank you!', 'success');
          return;
        }
      } catch { /* fall through to local */ }
    }

    setFeedbacks(prev => [entry, ...prev]);
    triggerToast('Feedback submitted successfully. Thank you!', 'success');
  };

  // ── Admin: fetch all feedbacks from all users ─────────────────────────────
  const [allFeedbacks, setAllFeedbacks] = useState([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);

  const fetchAllFeedbacks = useCallback(async () => {
    const adminRoles = ['admin', 'institution_admin', 'super_admin'];
    if (!currentUser?.token || !adminRoles.includes(currentUser.role)) return;
    setFeedbacksLoading(true);
    try {
      const res = await fetch(`${API}/feedbacks`, {
        headers: { Authorization: `Bearer ${currentUser.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setAllFeedbacks(data);
    } catch { /* keep existing */ }
    finally { setFeedbacksLoading(false); }
  }, [currentUser?.token, currentUser?.role]);

  // Auto-fetch when admin logs in
  useEffect(() => {
    const adminRoles = ['admin', 'institution_admin', 'super_admin'];
    if (adminRoles.includes(currentUser?.role) && currentUser?.token) {
      fetchAllFeedbacks();
    } else {
      setAllFeedbacks([]);
    }
  }, [currentUser?.role, currentUser?.token, fetchAllFeedbacks]);

  // ── Admin: update feedback status / add note ──────────────────────────────
  const updateFeedbackStatus = useCallback(async (feedbackId, status, adminNote = '') => {
    if (!currentUser?.token) return false;
    try {
      const res = await fetch(`${API}/feedbacks/${feedbackId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token}`
        },
        body: JSON.stringify({ status, adminNote })
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return false; }
      setAllFeedbacks(prev =>
        prev.map(f => f._id === feedbackId ? data.feedback : f)
      );
      triggerToast(`Feedback marked as "${status}".`, 'success');
      return true;
    } catch { triggerToast('Cannot reach server.', 'danger'); return false; }
  }, [currentUser?.token]);

  // Resolve Alert helper
  const addAlert = (message, type) => {
    triggerToast(message, type);
  };

  // QR Code / RFID Student board scanner — calls real API, falls back to local state
  const boardStudent = async (studentId, stop = '', method = 'manual') => {
    // ── Try real API first ──────────────────────────────────────────────────
    if (currentUser?.token) {
      try {
        const res = await fetch(`${API}/attendance/board`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
          body:    JSON.stringify({ studentId, stop, method }),
        });
        const data = await res.json();

        if (res.status === 409) {
          triggerToast(`${data.message}`, 'warning');
          return false;
        }
        if (!res.ok) {
          triggerToast(data.message || 'Boarding failed.', 'danger');
          return false;
        }

        // Update local student state to reflect boarded status
        const timeString = data.attendance?.boardingTime ||
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        setStudents(prev => prev.map(s =>
          s.studentId === studentId || s.id === studentId
            ? { ...s, attendanceStatus: 'Boarded', actualBoardingTime: timeString }
            : s
        ));

        // Refresh buses so occupied count is in sync
        fetchBuses();

        triggerToast(data.message, 'success');
        return true;
      } catch {
        // Fall through to local fallback
      }
    }

    // ── Local-only fallback (no server / offline) ───────────────────────────
    setStudents(prev => prev.map(student => {
      if (student.id !== studentId && student.studentId !== studentId) return student;
      if (student.attendanceStatus === 'Boarded') {
        triggerToast(`${student.name} is already boarded!`, 'warning');
        return student;
      }
      const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      triggerToast(`${student.name} boarded ${student.assignedBus} at ${student.boardingStop || stop}!`, 'success');
      setBuses(prev => prev.map(bus =>
        bus.number === student.assignedBus
          ? { ...bus, occupied: Math.min(bus.capacity, bus.occupied + 1) }
          : bus
      ));
      return { ...student, attendanceStatus: 'Boarded', actualBoardingTime: timeString };
    }));
    return true;
  };

  // ── API: fetch attendance stats (dashboard cards) ─────────────────────────
  const fetchAttendanceStats = useCallback(async (date = '') => {
    if (!currentUser?.token) return null;
    try {
      const query = date ? `?date=${date}` : '';
      const res   = await fetch(`${API}/attendance/stats${query}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json(); // { date, totals, perBus }
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch today's attendance for a specific bus (driver view) ─────────
  const fetchBusAttendance = useCallback(async (busNumber) => {
    if (!currentUser?.token) return [];
    try {
      const res = await fetch(`${API}/attendance/bus/${busNumber}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }, [currentUser?.token]);

  // ── API: fetch a student's attendance history ──────────────────────────────
  const fetchStudentAttendance = useCallback(async (studentId) => {
    if (!currentUser?.token) return [];
    try {
      const res = await fetch(`${API}/attendance/student/${studentId}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }, [currentUser?.token]);

  // ── API: mark a student absent ────────────────────────────────────────────
  const markStudentAbsent = useCallback(async (studentId) => {
    if (!currentUser?.token) return false;
    try {
      const res = await fetch(`${API}/attendance/${studentId}/absent`, {
        method:  'PUT',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return false; }

      setStudents(prev => prev.map(s =>
        s.studentId === studentId || s.id === studentId
          ? { ...s, attendanceStatus: 'Absent', actualBoardingTime: '--:--' }
          : s
      ));
      fetchBuses();
      triggerToast(data.message, 'info');
      return true;
    } catch { triggerToast('Cannot reach server.', 'danger'); return false; }
  }, [currentUser?.token, fetchBuses]);

  // Emergency SOS Activation trigger
  const triggerSOS = (busId, reason) => {
    const bus = buses.find(b => b.id === busId);
    if (!bus) return;
    
    setBuses(prev => prev.map(b => b.id === busId ? { ...b, status: 'Emergency', speed: 0 } : b));
    setSosActive(true);
    
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const emergencyMsg = {
      id: Date.now(),
      busNumber: bus.number,
      driver: bus.driver,
      reason,
      time: timeString,
      status: 'Active'
    };
    
    setSosMessages(prev => [emergencyMsg, ...prev]);
    triggerToast(`🚨 SOS: ${bus.number} reports ${reason}! Dispatching backup...`, 'danger');
  };

  // Emergency Resolution (allocating backup bus)
  const resolveSOS = (sosId, backupBusId) => {
    const sos = sosMessages.find(s => s.id === sosId);
    const backupBus = buses.find(b => b.id === backupBusId);
    if (!sos || !backupBus) return;

    // Allocate backup bus
    setBuses(prev => prev.map(b => {
      if (b.id === backupBusId) {
        return {
          ...b,
          status: 'On Route',
          route: `Backup - Rerouted to rescue ${sos.busNumber}`,
          occupied: 30 // Rescue passenger count
        };
      }
      if (b.number === sos.busNumber) {
        return { ...b, status: 'Towed' };
      }
      return b;
    }));

    setSosMessages(prev => prev.map(s => s.id === sosId ? { ...s, status: 'Resolved', resolvedWith: backupBus.number } : s));
    
    // Check if any active SOS messages left
    const activeLeft = sosMessages.some(s => s.id !== sosId && s.status === 'Active');
    if (!activeLeft) setSosActive(false);

    triggerToast(`Rescue bus ${backupBus.number} successfully allocated for ${sos.busNumber}.`, 'success');
  };

  // ── AI: predict boarding time ─────────────────────────────────────────────
  // GPS (bus_lat, bus_lng, speed_kmh) is auto-resolved server-side from the live Bus doc
  // Caller only needs to pass: model, stop, weather, academic_period, day_of_week
  const predictBoarding = useCallback(async ({
    model = 'XGBoost', stop, busNumber,
    weather: w, academic_period, day_of_week, occupancy
  }) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/ai/predict/boarding`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({
          model,
          stop,
          busNumber,
          weather:         w || weather,
          academic_period: academic_period || academicPeriod,
          day_of_week:     day_of_week || new Date().toLocaleDateString('en-US', { weekday: 'long' }),
          occupancy,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token, weather, academicPeriod]);

  // ── AI: predict for ALL stops on a bus route (uses live GPS automatically) ──
  const predictAllStops = useCallback(async ({ model = 'XGBoost', busNumber }) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/ai/predict/all-stops`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({
          model,
          busNumber,
          weather:         weather,
          academic_period: academicPeriod,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token, weather, academicPeriod]);

  // ── AI: optimize route (GPS auto-resolved from bus doc) ───────────────────
  const optimizeRoute = useCallback(async ({
    algorithm = 'NN2opt', stops, start, start_name, traffic_avoidance = false, busNumber
  }) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/ai/optimize/route`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({
          algorithm,
          stops,
          start,            // legacy string (still supported)
          start_name,       // new: name of starting stop
          busNumber,
          traffic_avoidance,
          weather,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token, weather]);

  // ── AI: fetch model stats ─────────────────────────────────────────────────
  const fetchAIModelStats = useCallback(async () => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/ai/models/stats`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token]);

  // ── AI: trigger retraining (admin) ───────────────────────────────────────
  const retrainAIModels = useCallback(async () => {
    if (!currentUser?.token) return false;
    try {
      const res = await fetch(`${API}/ai/models/retrain`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.error || 'Retrain failed.', 'danger'); return false; }
      triggerToast(data.message, 'success');
      return true;
    } catch { triggerToast('AI service unavailable.', 'danger'); return false; }
  }, [currentUser?.token]);

  // ── Allocation: preview (dry-run) ────────────────────────────────────────
  const previewAllocation = useCallback(async () => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/allocation/preview`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json(); // { allocated, unallocated, perBus, summary, saved: false }
    } catch { return null; }
  }, [currentUser?.token]);

  // ── Allocation: run + save ────────────────────────────────────────────────
  const runAllocation = useCallback(async () => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/allocation/run`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message || 'Allocation failed.', 'danger'); return null; }
      triggerToast(`Allocated ${data.summary?.allocatedCount || 0} students to buses.`, 'success');

      // Refresh buses for all admin roles
      const adminRoles = ['admin', 'institution_admin', 'super_admin'];
      if (adminRoles.includes(currentUser.role)) fetchBuses();

      // If a student is logged in, re-fetch their profile so assignedBus
      // updates immediately in the portal without requiring a page reload
      if (currentUser.role === 'student') {
        await fetchStudentProfile(currentUser);
      }

      return data;
    } catch { triggerToast('Cannot reach server.', 'danger'); return null; }
  }, [currentUser?.token, currentUser?.role, fetchBuses, fetchStudentProfile]);

  // ── Prediction: historical adjustment for a stop ─────────────────────────
  const fetchPredictionAdjustment = useCallback(async (stop, { days = 14, weather: w = '' } = {}) => {
    if (!currentUser?.token || !stop) return { adjustmentMins: 0, sampleCount: 0 };
    try {
      const params = new URLSearchParams({ days });
      if (w) params.set('weather', w);
      const res = await fetch(
        `${API}/predictions/adjustment/${encodeURIComponent(stop)}?${params}`,
        { headers: { Authorization: `Bearer ${currentUser.token}` } }
      );
      if (!res.ok) return { adjustmentMins: 0, sampleCount: 0 };
      return await res.json(); // { stop, days, adjustmentMins, sampleCount, weather }
    } catch { return { adjustmentMins: 0, sampleCount: 0 }; }
  }, [currentUser?.token]);
  const [boardingStopsFromDB, setBoardingStopsFromDB] = useState([]);
  // Dynamic stop coords from DB — keyed by stop name, each { lat, lng }
  const [dbStopCoords, setDbStopCoords] = useState({});

  const fetchBoardingStops = useCallback(async () => {
    try {
      const res = await fetch(`${API}/boarding_stops`);
      if (!res.ok) return;
      const data = await res.json();
      // Save names (for dropdowns)
      setBoardingStopsFromDB(data.map(s => s.name));
      // Save coords keyed by name (for maps) — only for stops that have GPS data
      const coords = {};
      data.forEach(s => {
        if (s.lat && s.lng) coords[s.name] = { lat: s.lat, lng: s.lng };
      });
      setDbStopCoords(coords);
    } catch { /* keep empty — AuthView falls back to static list */ }
  }, []);

  // Fetch stops when app loads (needed during signup — no token yet)
  useEffect(() => { fetchBoardingStops(); }, [fetchBoardingStops]);

  // ── API: suggest a new boarding stop (student typed one not in list) ──────
  const suggestBoardingStop = async (name) => {
    try {
      const res = await fetch(`${API}/boarding_stops/suggest`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      return { success: true, existing: data.existing, message: data.message };
    } catch { return { success: false, message: 'Cannot reach server.' }; }
  };
  const logPrediction = useCallback(async ({ studentId, predictedTime, actualTime, stop, busNumber, weather, academicPeriod }) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/predictions/log`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ studentId, predictedTime, actualTime, stop, busNumber, weather, academicPeriod }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.log;
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch a student's prediction history from DB ─────────────────────
  const fetchPredictionHistory = useCallback(async (studentId) => {
    if (!currentUser?.token || !studentId) return [];
    try {
      const res = await fetch(`${API}/predictions/student/${studentId}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.history || [];
    } catch { return []; }
  }, [currentUser?.token]);

  // ── API: fetch prediction accuracy stats ──────────────────────────────────
  const fetchPredictionAccuracy = useCallback(async (days = 30) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/predictions/accuracy?days=${days}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch admin prediction history (paginated) ───────────────────────
  const fetchAdminPredictionHistory = useCallback(async ({ date = '', busNumber = '', limit = 30, skip = 0 } = {}) => {
    if (!currentUser?.token) return { history: [], total: 0 };
    try {
      const params = new URLSearchParams({ limit, skip });
      if (date)      params.set('date', date);
      if (busNumber) params.set('busNumber', busNumber);
      const res = await fetch(`${API}/predictions/history?${params}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return { history: [], total: 0 };
      return await res.json();
    } catch { return { history: [], total: 0 }; }
  }, [currentUser?.token]);

  // ── API: fetch attendance summary report ──────────────────────────────────
  const fetchAttendanceSummary = useCallback(async (date = '') => {
    if (!currentUser?.token) return null;
    try {
      const query = date ? `?date=${date}` : '';
      const res = await fetch(`${API}/reports/attendance_summary${query}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch route performance report ───────────────────────────────────
  const fetchRoutePerformance = useCallback(async (days = 30) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/reports/route_performance?days=${days}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch occupancy trend data for dashboard chart ───────────────────
  const fetchOccupancyTrend = useCallback(async (date = '') => {
    if (!currentUser?.token) return null;
    try {
      const query = date ? `?date=${date}` : '';
      const res = await fetch(`${API}/reports/occupancy_trend${query}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json(); // { date, labels, actual, predicted }
    } catch { return null; }
  }, [currentUser?.token]);

  // ── API: fetch feedback summary report ────────────────────────────────────
  const fetchFeedbackSummary = useCallback(async () => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/reports/feedback_summary`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [currentUser?.token]);
  const fetchMyNotifications = useCallback(async ({ limit = 20, skip = 0, unread = false } = {}) => {
    if (!currentUser?.token) return { notifications: [], unreadCount: 0 };
    try {
      const params = new URLSearchParams({ limit, skip, ...(unread ? { unread: 'true' } : {}) });
      const res = await fetch(`${API}/notifications/me?${params}`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return await res.json(); // { notifications, total, unreadCount }
    } catch { return { notifications: [], unreadCount: 0 }; }
  }, [currentUser?.token]);

  // ── API: mark a single notification as read ───────────────────────────────
  const markNotificationRead = useCallback(async (notifId) => {
    if (!currentUser?.token) return;
    try {
      await fetch(`${API}/notifications/${notifId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
    } catch { /* silent */ }
  }, [currentUser?.token]);

  // ── API: mark all notifications as read ───────────────────────────────────
  const markAllNotificationsRead = useCallback(async () => {
    if (!currentUser?.token) return;
    try {
      await fetch(`${API}/notifications/read_all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
    } catch { /* silent */ }
  }, [currentUser?.token]);

  // ── API: admin broadcast notification ─────────────────────────────────────
  const broadcastNotification = useCallback(async ({ message, type = 'info', recipientRole = 'all', relatedBus = '' }) => {
    if (!currentUser?.token) return false;
    try {
      const res = await fetch(`${API}/notifications/broadcast`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ message, type, recipientRole, relatedBus }),
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return false; }
      triggerToast('Notification broadcast sent.', 'success');
      return true;
    } catch { triggerToast('Cannot reach server.', 'danger'); return false; }
  }, [currentUser?.token]);

  // ── API: trigger SOS (driver) ─────────────────────────────────────────────
  const triggerSOSApi = useCallback(async ({ reason, lat, lng }) => {
    if (!currentUser?.token) return null;
    try {
      const res = await fetch(`${API}/emergency/sos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ reason, lat, lng }),
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return null; }
      return data.emergency;
    } catch { triggerToast('Cannot reach server.', 'danger'); return null; }
  }, [currentUser?.token]);

  // ── API: fetch active emergencies ─────────────────────────────────────────
  const fetchActiveEmergencies = useCallback(async () => {
    if (!currentUser?.token) return { count: 0, emergencies: [] };
    try {
      const res = await fetch(`${API}/emergency/active`, {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      if (!res.ok) return { count: 0, emergencies: [] };
      return await res.json();
    } catch { return { count: 0, emergencies: [] }; }
  }, [currentUser?.token]);

  // ── API: resolve an emergency (admin) ────────────────────────────────────
  const resolveEmergency = useCallback(async (emergencyId, resolution = '') => {
    if (!currentUser?.token) return false;
    try {
      const res = await fetch(`${API}/emergency/${emergencyId}/resolve`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body:    JSON.stringify({ resolution }),
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.message, 'danger'); return false; }
      triggerToast('Emergency resolved.', 'success');
      await fetchBuses(); // refresh bus statuses
      return true;
    } catch { triggerToast('Cannot reach server.', 'danger'); return false; }
  }, [currentUser?.token, fetchBuses]);

  return (
    <AppContext.Provider value={{
      theme,
      setTheme,
      currentUser,
      setCurrentUser,
      loginUser,
      registerUser,
      fetchPublicInstitutions,
      requestOTP,
      verifyOTP,
      updateUserProfile,
      fetchStudentProfile,
      updateStudentProfile,
      fetchStudentFeedbacks,
      saveNotificationPrefs,
      studentFeedbacks,
      getStudentAlerts,
      weather,
      setWeather,
      weatherSource,
      academicPeriod,
      setAcademicPeriod,
      buses,
      setBuses,
      busesLoading,
      fetchBuses,
      pushDriverGPS,
      updateBusStatus,
      toggleChecklistItem,
      fetchAvailableBuses,
      fetchUnassignedDrivers,
      fetchAllDrivers,
      assignDriverToBus,
      unassignDriverFromBus,
      setBusStartingPoint,
      students,
      setStudents,
      boardingStops,
      setBoardingStops,
      alerts,
      setAlerts,
      readAlertIds,
      markAllAlertsRead,
      clearAllAlerts,
      dismissAlert,
      predictionHistory,
      setPredictionHistory,
      feedbacks,
      setFeedbacks,
      addFeedback,
      allFeedbacks,
      feedbacksLoading,
      fetchAllFeedbacks,
      updateFeedbackStatus,
      addAlert,
      boardStudent,
      fetchAttendanceStats,
      fetchBusAttendance,
      fetchStudentAttendance,
      markStudentAbsent,
      fetchMyNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      broadcastNotification,
      triggerSOSApi,
      fetchActiveEmergencies,
      resolveEmergency,
      logPrediction,
      fetchPredictionHistory,
      fetchPredictionAccuracy,
      fetchAdminPredictionHistory,
      fetchAttendanceSummary,
      fetchRoutePerformance,
      fetchOccupancyTrend,
      fetchFeedbackSummary,
      boardingStopsFromDB,
      dbStopCoords,
      fetchBoardingStops,
      suggestBoardingStop,
      predictBoarding,
      predictAllStops,
      optimizeRoute,
      fetchAIModelStats,
      retrainAIModels,
      previewAllocation,
      runAllocation,
      fetchPredictionAdjustment,
      sosActive,
      sosMessages,
      triggerSOS,
      resolveSOS,
      triggerToast,
      toasts,
      dismissToast,
      socketConnected
    }}>
      {children}
    </AppContext.Provider>
  );
};
