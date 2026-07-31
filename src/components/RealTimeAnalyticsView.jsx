import React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { BarChart3, TrendingUp, PieChart } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const RealTimeAnalyticsView = () => {
  // Chart 1: Peak Travel Periods (Student boarding load hourly)
  const peakPeriodsData = {
    labels: ['07:00 AM', '07:20 AM', '07:40 AM', '08:00 AM', '08:20 AM', '08:40 AM'],
    datasets: [
      {
        label: 'Passenger Boarding Density',
        data: [25, 62, 110, 85, 40, 15],
        backgroundColor: 'rgba(99, 102, 241, 0.65)',
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 4
      }
    ]
  };

  // Chart 2: Route Efficiency Rating (based on timing accuracy)
  const routeEfficiencyData = {
    labels: ['Route A', 'Route B', 'Route C', 'Backup Route'],
    datasets: [
      {
        label: 'Efficiency Index (%)',
        data: [94, 88, 72, 98],
        backgroundColor: [
          'rgba(16, 185, 129, 0.65)', // Emerald
          'rgba(6, 182, 212, 0.65)',  // Cyan
          'rgba(245, 158, 11, 0.65)',  // Amber
          'rgba(99, 102, 241, 0.65)'   // Indigo
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Overview stats cards */}
      <div className="dashboard-grid">
        <div className="glass-card stats-card">
          <div className="stats-info">
            <h4>Avg Fleet Delay</h4>
            <h2>+2.4 Mins</h2>
          </div>
          <div className="stats-icon amber-light">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="glass-card stats-card">
          <div className="stats-info">
            <h4>Peak Hour Volume</h4>
            <h2>110/min</h2>
          </div>
          <div className="stats-icon primary-light">
            <BarChart3 size={20} />
          </div>
        </div>

        <div className="glass-card stats-card">
          <div className="stats-info">
            <h4>Route A Load Factor</h4>
            <h2>92.4%</h2>
          </div>
          <div className="stats-icon emerald-light">
            <PieChart size={20} />
          </div>
        </div>

        <div className="glass-card stats-card">
          <div className="stats-info">
            <h4>Active Fleet Ratio</h4>
            <h2>82.1%</h2>
          </div>
          <div className="stats-icon cyan-light">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Two Column Grid containing charts */}
      <div className="two-col-grid">
        
        {/* Peak hour load */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
          <h3 className="glass-card-title">Peak Hour Boarding Load</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Hourly boarding distributions</p>
          <div style={{ flex: 1 }}>
            <Bar data={peakPeriodsData} options={options} />
          </div>
        </div>

        {/* Route Efficiency */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
          <h3 className="glass-card-title">Route Efficiency Ratings</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Calculated timing precision indexes</p>
          <div style={{ flex: 1 }}>
            <Bar data={routeEfficiencyData} options={options} />
          </div>
        </div>

      </div>

    </div>
  );
};

export default RealTimeAnalyticsView;
