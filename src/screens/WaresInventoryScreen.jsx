import React from 'react';
import PageHeader from '../components/PageHeader';

// A placeholder until Wares Inventory is built. Kept under repair from Manage
// Logins so nobody but admins reaches it; this is what admins see meanwhile.
export default function WaresInventoryScreen() {
  return (
    <div style={{ padding: '40px max(22px, min(48px, 4vw)) 60px' }}>
      <PageHeader title="Wares Inventory" subtitle="Plates, glasses and smallwares for each location." />
      <p className="hub-empty" style={{ maxWidth: 760 }}>Coming soon. Counts for each location will live here.</p>
    </div>
  );
}
