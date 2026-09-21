import React from 'react';

// A placeholder until Wares Inventory is built. Kept under repair from Manage
// Logins so nobody but admins reaches it; this is what admins see meanwhile.
export default function WaresInventoryScreen() {
  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: 30, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.6, margin: '0 0 6px' }}>
        Wares Inventory
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
        Being built. Switch this page under repair in Manage Logins so only admins see it.
      </p>
    </div>
  );
}
