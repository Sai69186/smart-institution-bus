import React from 'react';
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend 
} from 'chart.js';
import { Fuel, Leaf, Award, Sliders } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const FuelEfficiencyView = () => {
  // Chart: Fuel consumption per Bus (Liters/100km)
  const fuelData = {
    labels: ['BUS-101', 'BUS-204', 'BUS-309', 'BUS-402'],
    datasets: [
      {
        label: 'Fuel Consumption (Liters/100km)',
        data: [18.2, 19.5, 24.8, 15.0], // BUS-309 is highest because of delays & engine idling!
        backgroundColor: [
          'rgba(99, 102, 241, 0.65)',
          'rgba(99, 102, 241, 0.65)',
          'rgba(239, 68, 68, 0.65)', // Red alert for heavy fuel consumption
          'rgba(16, 185, 129, 0.65)'  // Standby/Efficient
        ],
        borderWidth: 0
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b' } },
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b' } }
    }
  };

  return (
    <div className="two-col-grid">
      
      {/* Fuel chart */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title">Fleet Fuel Consumption</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Liters per 100 Kilometers</span>
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
            <span>Telemetry Diagnostics</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <div className="detail-row">
              <span className="detail-label">Total Fleet Idle Time</span>
              <span className="detail-value" style={{ color: 'var(--amber)' }}>42 Mins/day</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Avg Fuel Efficiency</span>
              <span className="detail-value">19.3 L/100km</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Carbon Offset Goal</span>
              <span className="detail-value" style={{ color: 'var(--emerald)' }}>Met (84%)</span>
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
            <li>Merging stop **Science Block** into **Library Crossing** is estimated to save **4.2 Liters** daily.</li>
            <li>Instruct driver of **BUS-309** to turn off engine if waiting duration at West Gate exceeds **3 minutes** (idle fuel loss warning).</li>
          </ul>
        </div>

      </div>

    </div>
  );
};

export default FuelEfficiencyView;
