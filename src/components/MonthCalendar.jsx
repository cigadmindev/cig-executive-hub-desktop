import React, { useState } from 'react';

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const RING_SIZE = 44;
const RING_STROKE = 2.5;

function dayKey(year, month, day) {
  return `${year}-${month}-${day}`;
}

function ColorRing({ colors }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference / colors.length;
  const gap = 2;

  return (
    <svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', top: 0, left: 0 }}>
      {colors.map((color, i) => (
        <circle
          key={i}
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${segmentLength - gap} ${circumference - segmentLength + gap}`}
          strokeDashoffset={-(i * segmentLength)}
          fill="none"
        />
      ))}
    </svg>
  );
}

// markersByDay: { 'YYYY-M-D': [{ date, color }] }
export default function MonthCalendar({ markersByDay, selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [...Array(firstDayOfMonth).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <span style={styles.monthLabel}>{viewDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <div style={styles.navGroup}>
          <button style={styles.navButton} onClick={() => setViewDate(new Date(year, month - 1, 1))}>
            ‹
          </button>
          <button style={styles.navButton} onClick={() => setViewDate(new Date())}>
            <span style={styles.todayDot} />
          </button>
          <button style={styles.navButton} onClick={() => setViewDate(new Date(year, month + 1, 1))}>
            ›
          </button>
        </div>
      </div>

      <div style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} style={styles.weekdayLabel}>
            {label}
          </span>
        ))}
      </div>

      <div style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} style={styles.cell} />;

          const key = dayKey(year, month, day);
          const markers = markersByDay[key] ?? [];
          const uniqueColors = [...new Set(markers.map((m) => m.color))];
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const isSelected =
            !!selectedDate &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === day;

          return (
            <button key={key} style={styles.cell} onClick={() => onSelectDate(new Date(year, month, day))}>
              <div style={styles.dayCircleWrap}>
                {uniqueColors.length > 3 ? <ColorRing colors={uniqueColors} /> : null}
                <div
                  style={{
                    ...styles.dayCircle,
                    ...(isSelected ? styles.dayCircleSelected : {}),
                    ...(isToday && !isSelected ? styles.dayCircleToday : {}),
                  }}
                >
                  {day}
                </div>
              </div>
              {uniqueColors.length > 0 && uniqueColors.length <= 3 ? (
                <div style={styles.dotsRow}>
                  {uniqueColors.map((color, i) => (
                    <span key={i} style={{ ...styles.marker, background: color }} />
                  ))}
                </div>
              ) : (
                <div style={styles.dotsRow} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    padding: 22,
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
  },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  monthLabel: { fontSize: 17, fontWeight: 700, letterSpacing: -0.2 },
  navGroup: { display: 'flex', alignItems: 'center', gap: 4 },
  navButton: {
    width: 28,
    height: 28,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: { width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 },
  weekdayLabel: { textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 0',
    margin: 0,
    border: 'none',
    background: 'none',
  },
  dayCircleWrap: { width: RING_SIZE, height: RING_SIZE, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  dayCircleToday: { border: '1.5px solid var(--text-secondary)' },
  dayCircleSelected: { background: 'var(--text-primary)', color: 'var(--bg-window)', fontWeight: 700 },
  dotsRow: { display: 'flex', gap: 3, marginTop: 4, height: 6 },
  marker: { width: 5, height: 5, borderRadius: 3 },
};
