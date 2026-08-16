import React, { useContext } from 'react';
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend 
} from 'chart.js';
import { Fuel, Leaf, Award, Sliders } from 'lucide-react';
import { AppContext } from '../context/AppContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const FuelEfficiencyView = () => {
  const { buses } = useContext(AppContext);

  // Use live bus data, fallback to empty if not loaded yet
  const busLabels = buses.length > 0
    ? buses.map(b => b.number)
    : ['VL-A01', 'VL-A02', 'VL-B01', 'VL-C01'];

  // Fuel level from live bus state (% remaining); compute relative consumption
  // Lower fuel % on same route = higher consumption rate (estimated)
  const fuelLevels = buses.length > 0
    ? buses.map(b => b.fuel ?? 100)
    : [82, 75, 56, 90];

  // Color code: < 30% = red warning, < 50% = amber, else green
  const barColors = fuelLevels.map(f =>
    f < 30 ? 'rgba(239,68,68,0.7)' :
    f < 50 ? 'rgba(245,158,11,0.7)' :
             'rgba(99,102,241,0.65)'
  );

  // Fleet stats derived from live data
  const avgFuel      = buses.length > 0
    ? (buses.reduce((s, b) => s + (b.fuel ?? 100), 0) / buses.length).toFixed(1)
    : '—';
  const lowFuelCount = buses.filter(b => (b.fuel ?? 100) < 30).length;
  const totalOccupied = buses.reduce((s, b) => s + b.occupied, 0);

  const fuelData = {
    labels: busLabels,
    datasets: [{
      label: 'Fuel Level (%)',
      data:  fuelLevels,
      backgroundColor: barColors,
      borderWidth: 0,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: 0, max: 100,
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#64748b', callback: v => `${v}%` },
      },
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b' } },
    },
  };

  return (
    <div className="two-col-grid">
      
      {/* Fuel chart */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title">Fleet Fuel Levels</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Live % remaining · {lowFuelCount > 0 ? `⚠ ${lowFuelCount} bus(es) critical` : '✅ Fleet healthy'}
          </span>
        </div>
        <div style={{ flex: 1, marginTop: '16px' }}>
          <Bar data={fuelData} options={options} />
        </div>
      </div>

      {/* Fuel efficiency telemetry and AI hints */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Telematics stats */}
        <div className="glass-card">
          <h3 className="glass-card-title">
            <Fuel size={18} />
            <span>Fleet Fuel Telemetry</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <div className="detail-row">
              <span className="detail-label">Average Fuel Level</span>
              <span className="detail-value" style={{ color: Number(avgFuel) < 50 ? 'var(--amber)' : 'var(--emerald)' }}>{avgFuel}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Buses Below 30%</span>
              <span className="detail-value" style={{ color: lowFuelCount > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                {lowFuelCount > 0 ? `${lowFuelCount} — Refuel urgently` : 'None'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Total Passengers Now</span>
              <span className="detail-value">{totalOccupied} students on board</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Active Buses</span>
              <span className="detail-value">{buses.filter(b => b.status === 'On Route').length} / {buses.length}</span>
            </div>
          </div>
        </div>

        {/* AI carbon suggestions */}
        <div className="glass-card" style={{ borderLeft: '4px solid var(--emerald)', background: 'rgba(16, 185, 129, 0.04)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Leaf className="text-emerald animate-pulse" size={18} />
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>AI Fuel Conservation Tips</span>
          </div>
          <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '16px', margin: '8px 0 0 0', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: '1.4' }}>
            <li>Buses with fuel below 30% should be dispatched last to minimize breakdown risk on route.</li>
            <li>Turn off engine if waiting at a stop exceeds 3 minutes to reduce idle fuel consumption.</li>
            {lowFuelCount > 0 && (
              <li style={{ color: 'var(--rose)', fontWeight: 600 }}>
                ⚠ {lowFuelCount} bus(es) need immediate refueling before next dispatch.
              </li>
            )}
          </ul>
        </div>

      </div>

    </div>
  );
};

export default FuelEfficiencyView;
