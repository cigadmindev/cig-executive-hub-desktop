import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { nike } from '../theme/nike';

// What to do when something happens at a restaurant.
//
// The same everywhere, so it lives here rather than in each location's
// folders. Written to be read on a phone by someone standing in the middle of
// it - short steps, no preamble, the most important thing first.
//
// Where a situation needs a vendor, it links to that location's Operational
// POC rather than copying numbers here, which would go stale.
const SITUATIONS = [
  {
    key: 'robbery',
    title: 'Robbery, with or without a gun',
    steps: [
      'Concede to any and all demands. Stay as calm as you can.',
      'The safety of your guests and staff is the only thing that matters. You are not here to protect the business.',
      'Once it is over, call 911 and local security if applicable.',
      'Make camera footage available. Attend to your staff.',
      'Any guests who choose to stay for police interviews may do so.',
      'Call your direct supervisor immediately after 911.',
    ],
  },
  {
    key: 'fire',
    title: 'Kitchen fire, any size',
    steps: [
      'Use fire extinguishers as needed.',
      'Clear the kitchen. Keep staff safe.',
      'Call 911 or the fire department, and security if applicable.',
      'Assess damage and inform guests as needed.',
      'Decide whether to close, depending on the degree of fire and whether the Ansul system deployed.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'hood',
    title: 'Hood fans go off',
    needsVendor: 'the hood repair company',
    steps: [
      'Check the breaker box for tripped breakers.',
      'Turn off all equipment the hood serves. Avoid heat build-up.',
      'Stop cooking under the hood that is not working.',
      'Call the hood repair company from your emergency call list.',
      'Do your best to keep heat from tripping the Ansul system.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'water-heater',
    title: 'Hot water heater stops, floods or breaks down',
    needsVendor: 'the plumber, and the property manager if applicable',
    steps: [
      'No hot water means no service. Stop serving immediately.',
      'Call the plumber from your emergency call list, and the property manager if applicable.',
      'Clean up if the heater has overheated or blown.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'power',
    title: 'Power failure, day or night',
    needsVendor: 'the power company and the property manager',
    steps: [
      'Check the emergency kit for flashlights if needed.',
      'Call the power company, and the property manager if applicable.',
      'Keep talking to your staff. Work out how long it may last before deciding about cutting anyone.',
      'If it lasts more than 15 minutes, clear the building of all guests.',
      'Guests may stay until it is fixed if they want. Anyone leaving does not need to settle their check — enter open checks as comps and detail them for insurance.',
      'Make sure all gas is turned off on cooking equipment. Pilots can stay; nothing else should be running.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'hvac',
    title: 'AC or heat stops working',
    needsVendor: 'the electrician or HVAC company',
    steps: [
      'Check the breakers first.',
      'Call the electrician or HVAC company from your call list.',
      'Tell guests and let them decide whether to wait it out. Anyone leaving does not have to settle their check — keep comps for insurance.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'injury',
    title: 'Kitchen staff or guest injury',
    steps: [
      'Get the on-site manager involved. Give first aid if you are able.',
      'Judge the severity. Better to be safe than sorry.',
      'Decide whether an ambulance is needed, or whether a manager can drive a staff member to hospital. If a guest is involved, always call 911.',
      'Document it thoroughly. Get names if a guest is involved and follow the procedure closely.',
      'Stay calm and keep staff from getting drawn in.',
      'Stay with the person as long as it takes to keep things calm and organised.',
      'Take photos of the area or the injury if they might be needed.',
      'Call your direct supervisor, and document it for insurance.',
    ],
  },
  {
    key: 'assault',
    title: 'Guest assaulted on the property',
    needsVendor: 'the insurance company',
    steps: [
      'Call police or 911 immediately. Call an ambulance if the injury is serious.',
      'Keep the guest calm and reassured. Give them somewhere comfortable to wait, and stay with them.',
      'Give police full access to the camera system when they arrive, along with any descriptions guests can give.',
      'Treat the whole area as a crime scene and keep everyone away.',
      'Call the insurance company from your call list.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'weather',
    title: 'Major leak, building issue, tornado or weather event',
    steps: [
      'Call 911, security or the property manager immediately.',
      'Assess the damage and photograph every affected area.',
      'Keep staff and guests safe, and keep talking to them.',
      'If there are injuries, document them and make sure 911 knows.',
      'Close the restaurant if there is any doubt about safety.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'altercation',
    title: 'Guest or staff interaction leads to injury',
    needsVendor: 'the insurance company',
    steps: [
      'Call 911 or the police immediately.',
      'Defuse it without causing more harm. De-escalate as best you can and work as a team with the other managers.',
      'Get statements from guests if applicable.',
      'Call the insurance company if anyone is injured or anything is damaged.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'break-in',
    title: 'Overnight break-in',
    steps: [
      'Stay out of the building. No staff goes in.',
      'Call 911, police, security, and the property manager if applicable.',
      'Photograph any exterior damage.',
      'Keep staff available once the damage has been assessed.',
      'Call your direct supervisor.',
    ],
  },
  {
    key: 'grease-trap',
    title: 'Grease trap overflows',
    needsVendor: 'the grease trap company or plumber, and the property manager',
    steps: [
      'Call the grease trap company or plumber if applicable.',
      'Call the property manager.',
      'Judge how bad it is. You may have to close — but call your direct supervisor before you do.',
    ],
  },
  {
    key: 'choking',
    title: 'Someone chokes or collapses',
    steps: [
      'Get anyone who knows the Heimlich manoeuvre or CPR to help.',
      'Call 911 even if someone is already assisting.',
      'Call your direct supervisor.',
    ],
  },
];

export default function EmergencyScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getByBrand } = useCustomLocations();
  const [openKey, setOpenKey] = useState(null);
  const [pickingFor, setPickingFor] = useState(null);

  // Only the locations this person can actually open.
  const places = brands
    .filter((b) => user?.role === 'admin' || user?.role === 'executive' || (user?.permissions?.brandIds ?? []).includes(b.id))
    .map((b) => ({
      brandId: b.id,
      brandName: b.name,
      locations: [
        ...(b.locations ?? []).map((l) => ({ id: l.id, name: l.name })),
        ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name })),
      ],
    }))
    .filter((b) => b.locations.length > 0);

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Emergency Procedures</h1>
      <p style={styles.subtitle}>
        In every situation the safety of guests and staff comes first — and always call your direct supervisor.
      </p>

      <div style={styles.list}>
        {SITUATIONS.map((s) => {
          const open = openKey === s.key;
          return (
            <div key={s.key} style={styles.item}>
              <button style={styles.itemHead} onClick={() => setOpenKey(open ? null : s.key)}>
                <span style={styles.itemTitle}>{s.title}</span>
                <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
              </button>

              {open ? (
                <div style={styles.steps}>
                  {s.steps.map((step, i) => (
                    <div key={i} style={styles.step}>
                      <span style={styles.stepNumber}>{i + 1}</span>
                      <span style={styles.stepText}>{step}</span>
                    </div>
                  ))}

                  {s.needsVendor ? (
                    <button style={styles.contactsButton} onClick={() => setPickingFor(s)}>
                      Find {s.needsVendor} →
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p style={styles.closing}>
        In any of these, and in anything not covered here, managers should work together and document as much as
        possible. Your direct supervisor has more experience with these — in some cases you may call them first, and
        that is fine. Always choose to be more thorough than less.
      </p>

      {pickingFor ? (
        <div style={styles.backdrop} onClick={() => setPickingFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Which location?</h2>
            <p style={styles.modalBody}>
              Contacts are kept per location, so they stay current. This opens that location's Operational POC.
            </p>
            {places.map((b) => (
              <div key={b.brandId} style={styles.brandBlock}>
                <p style={styles.brandName}>{b.brandName}</p>
                {b.locations.map((l) => (
                  <button
                    key={l.id}
                    style={styles.locationButton}
                    onClick={() => navigate(`/brand/${b.brandId}/location/${l.id}/operational-poc`)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 680 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '6px 0 20px' },

  list: { background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' },
  item: { borderBottom: '1px solid var(--border)' },
  itemHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  chevron: { fontSize: 11, color: 'var(--text-tertiary)' },

  steps: { padding: '0 16px 16px' },
  step: { display: 'flex', gap: 10, padding: '6px 0' },
  stepNumber: { flexShrink: 0, width: 20, height: 20, borderRadius: 10, background: 'var(--bg-inset)', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' },
  contactsButton: { marginTop: 10, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--neon)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },

  closing: { fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', margin: '18px 0 0' },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(380px, 100%)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  modalBody: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '0 0 14px' },
  brandBlock: { marginBottom: 14 },
  brandName: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 6px' },
  locationButton: { display: 'block', width: '100%', padding: '10px 12px', marginBottom: 6, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, textAlign: 'left', cursor: 'pointer' },
};
