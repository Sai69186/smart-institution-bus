import React from 'react';

/**
 * Reusable skeleton loader shapes.
 * All use the .skeleton CSS class for the shimmer animation.
 *
 * Available exports:
 *   SkeletonText      — a single shimmer text line
 *   SkeletonCard      — card shell with configurable inner rows
 *   SkeletonStatCard  — matches the .stat-card shape in the dashboard
 *   SkeletonBusCard   — matches bus fleet card shape
 *   SkeletonTable     — shimmer table with n rows
 *   SkeletonDashboard — full dashboard skeleton (4 stat cards + chart placeholder)
 */

export const SkeletonText = ({ width = '100%', height = 14, style = {} }) => (
  <div
    className="skeleton"
    style={{ width, height: `${height}px`, borderRadius: 6, ...style }}
  />
);

export const SkeletonStatCard = () => (
  <div className="skeleton-card" style={{ minWidth: 0, flex: 1 }}>
    <div className="skeleton-row">
      <div className="skeleton skeleton-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonText width="55%" height={12} />
        <SkeletonText width="40%" height={24} />
      </div>
    </div>
    <SkeletonText width="70%" height={11} />
  </div>
);

export const SkeletonBusCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-row" style={{ marginBottom: 4 }}>
      <div className="skeleton skeleton-circle" style={{ width: 32, height: 32, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <SkeletonText width="50%" height={14} />
      </div>
      <div className="skeleton skeleton-badge" />
    </div>
    <SkeletonText height={11} />
    <SkeletonText width="80%" height={11} />
    <div className="skeleton-row" style={{ marginTop: 4 }}>
      <SkeletonText width="45%" height={11} />
      <SkeletonText width="45%" height={11} />
    </div>
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {/* Header row */}
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '8px 0' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonText key={i} width="60%" height={12} />
      ))}
    </div>
    {/* Data rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={r}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          padding: '10px 0',
          borderTop: '1px solid var(--border)',
        }}
      >
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonText key={c} width={c === 0 ? '80%' : '60%'} height={13} />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonDashboard = () => (
  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
    {/* 4 stat cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      <SkeletonStatCard />
      <SkeletonStatCard />
      <SkeletonStatCard />
      <SkeletonStatCard />
    </div>
    {/* Chart placeholder */}
    <div className="skeleton-card" style={{ height: 220 }}>
      <SkeletonText width="30%" height={16} style={{ marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 160, width: '100%', borderRadius: 8 }} />
    </div>
    {/* Bus rows */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      <SkeletonBusCard />
      <SkeletonBusCard />
      <SkeletonBusCard />
    </div>
  </div>
);

/**
 * Generic skeleton card — use for any list/grid of cards.
 * @param {number} count  — number of cards to show
 * @param {string} layout — 'grid' | 'list'
 */
const SkeletonCardList = ({ count = 4, layout = 'grid' }) => (
  <div style={{
    display: layout === 'grid'
      ? 'grid'
      : 'flex',
    gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fill, minmax(260px, 1fr))' : undefined,
    flexDirection: layout === 'list' ? 'column' : undefined,
    gap: 14,
    padding: '16px 0',
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonBusCard key={i} />
    ))}
  </div>
);

export default SkeletonCardList;
