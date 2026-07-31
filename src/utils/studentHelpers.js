// Format ETA minutes → "HH:MM AM/PM" from now
export const minsToTime = (mins) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Weather delay offset in minutes
export const weatherDelayMins = (weather) => {
  if (weather === 'Rainy') return 5;
  if (weather === 'Foggy') return 9;
  return 0;
};

// Get student record for the logged-in user
// Matches by studentId, email, or _id — never falls back to wrong student
export const getMyStudent = (students, currentUser) => {
  if (!currentUser || !students?.length) return null;
  return (
    students.find(s => s.id      === currentUser.studentId) ||
    students.find(s => s._id     === currentUser.studentId) ||
    students.find(s => s.studentId === currentUser.studentId) ||
    students.find(s => s.email   === currentUser.email) ||
    null   // never fall back to students[0]
  );
};

// Get alerts relevant to a student (currently returns all; filtered in Week 3 notifications module)
// eslint-disable-next-line no-unused-vars
export const getStudentAlerts = (alerts, _myStudent) => alerts || [];

// Compute basic history stats from prediction logs
// Returns all keys used by StudentProfileView: avgDelayLabel, onTimeRate, avgError, onTime, total
export const computeHistoryStats = (history) => {
  if (!history.length) {
    return { avgError: 0, avgDelayLabel: '0 min', onTime: 0, onTimeRate: 100, total: 0 };
  }

  const total  = history.length;
  const onTime = history.filter(l => l.err === '0 mins' || l.err.includes('-')).length;

  const errors = history.map(l => {
    const n = parseFloat(l.err);
    return isNaN(n) ? 0 : Math.abs(n);
  });

  const avgError     = (errors.reduce((a, b) => a + b, 0) / total).toFixed(1);
  const avgDelayLabel = `${avgError} min`;
  const onTimeRate    = Math.round((onTime / total) * 100);

  return { avgError, avgDelayLabel, onTime, onTimeRate, total };
};

/**
 * Single source of truth for a student's predicted boarding time.
 *
 * Priority order:
 *  1. Live AI result (eta_time string from Python service)
 *  2. GPS-based ETA from bus live position + optional historical adjustment
 *  3. Scheduled time with local weather/academic offset (pure offline fallback)
 *
 * @param {object} opts
 * @param {object} opts.bus              — normalised bus object from AppContext
 * @param {object} opts.student          — student record
 * @param {string} opts.weather          — 'Sunny' | 'Rainy' | 'Foggy'
 * @param {string} opts.academicPeriod   — e.g. 'Regular Semester'
 * @param {string} opts.dayOfWeek        — e.g. 'Monday'
 * @param {string|null} opts.aiEtaTime   — eta_time from predictBoarding API, if available
 * @param {number} opts.adjustmentMins   — historical correction from /predictions/adjustment
 * @param {Function} opts.calcStopETAs   — calcStopETAs from AppContext (GPS-based)
 * @returns {{ time: string, source: 'ai'|'gps'|'scheduled', gpsEtaMins: number|null }}
 */
export const getPredictedBoardingTime = ({
  bus,
  student,
  weather,
  academicPeriod,
  dayOfWeek,
  aiEtaTime = null,
  adjustmentMins = 0,
  calcStopETAs = null,
}) => {
  // 1. AI result available
  if (aiEtaTime && aiEtaTime !== '--:--') {
    // Apply historical adjustment if non-zero
    if (adjustmentMins !== 0 && calcStopETAs) {
      const [timePart, period] = aiEtaTime.split(' ');
      let [h, m] = timePart.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      const total = h * 60 + m + adjustmentMins;
      const fh    = Math.floor(total / 60) % 24;
      const fm    = total % 60;
      const ap    = fh >= 12 ? 'PM' : 'AM';
      const dh    = fh % 12 === 0 ? 12 : fh % 12;
      return {
        time: `${dh}:${fm < 10 ? '0' + fm : fm} ${ap}`,
        source: 'ai',
        gpsEtaMins: null,
      };
    }
    return { time: aiEtaTime, source: 'ai', gpsEtaMins: null };
  }

  // 2. GPS-based ETA using live bus position
  if (bus?.gpsLat && bus?.gpsLng && bus?.stopSequence?.length && calcStopETAs) {
    const stop = student.boardingStop || student.pickupPoint;
    const etas = calcStopETAs(bus.gpsLat, bus.gpsLng, bus.stopSequence, bus.speed > 0 ? bus.speed : 30);
    const etaMins = etas[stop];
    if (etaMins !== undefined) {
      const delay = weatherDelayMins(weather) + (adjustmentMins || 0);
      const totalMins = etaMins + delay;
      return { time: minsToTime(totalMins), source: 'gps', gpsEtaMins: totalMins };
    }
  }

  // 3. Offline fallback: scheduled time + weather/academic offset
  const base = student.predBoardingTime;
  if (!base || base === '--:--') return { time: '--:--', source: 'scheduled', gpsEtaMins: null };

  const [timePart, period] = base.split(' ');
  let [h, m] = timePart.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  let total = h * 60 + m + weatherDelayMins(weather) + (adjustmentMins || 0);
  if (academicPeriod === 'Exam Week') total -= 3;
  if (dayOfWeek === 'Monday') total += 2;
  const fh = Math.floor(total / 60) % 24;
  const fm = total % 60;
  const ap = fh >= 12 ? 'PM' : 'AM';
  const dh = fh % 12 === 0 ? 12 : fh % 12;
  return {
    time: `${dh}:${fm < 10 ? '0' + fm : fm} ${ap}`,
    source: 'scheduled',
    gpsEtaMins: null,
  };
};

// Vignan's LARA boarding stop options
export const BOARDING_STOPS = [
  'Vadlamudi Bus Stand',
  'Guntur Highway Gate',
  'VLITS Main Gate',
  'Tenali Road Stop',
  'Pedaparupudi Junction',
  'Chebrolu Cross Roads',
  'Kollipara Village Stop',
  'Mangalagiri Bypass',
  'Hostel Block — VLITS'
];

// Department options
export const DEPT_OPTIONS = [
  'Computer Science',
  'Electronics',
  'Mechanical Eng',
  'Information Tech',
  'Civil Eng',
  'Bio-Technology',
  'Electrical Eng',
  'Chemical Eng',
  'MBA'
];

// Year options
export const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
