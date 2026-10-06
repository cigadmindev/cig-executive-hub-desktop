import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accessLevel } from '../data/accessMatrix';
import { brands } from '../data/mockData';

// The amber bar shown while an admin is seeing the Hub as someone else.
export default function ViewAsBar() {
  const { viewAs, stopViewAs } = useAuth();
  const navigate = useNavigate();
  if (!viewAs) return null;
  const wide = ['all', 'brands'].includes(accessLevel(viewAs, 'where'));
  const where = wide
    ? 'every restaurant'
    : (viewAs.permissions?.brandIds ?? [])
        .map((b) => {
          const brand = brands.find((x) => x.id === b);
          const only = viewAs.permissions?.locationsByBrand?.[b];
          const locs = Array.isArray(only) && only.length ? only.map((id) => brand?.locations?.find((l) => l.id === id)?.name ?? id).join(' & ') : 'all locations';
          return (brand?.name ?? b) + ' · ' + locs;
        })
        .join(', ') || 'no restaurants';
  return (
    <div style={styles.bar}>
      <span style={{ flex: 1 }}>
        <strong>Viewing as {viewAs.name}</strong> · {viewAs.job ?? 'no job'} · {where} · read-only
      </span>
      <button
        style={styles.button}
        onClick={() => {
          stopViewAs();
          navigate('/admin/users');
        }}
      >
        Back to my view
      </button>
    </div>
  );
}

const styles = {
  bar: { position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#3A2A0E', border: '1px solid #6B4E12', color: '#E8B93B', borderRadius: 10, padding: '10px 14px', margin: '12px 16px 0', fontSize: 14 },
  button: { background: '#E8B93B', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
};
