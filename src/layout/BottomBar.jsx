import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../components/Icon';

// Geometry copied from the iPhone app's BottomBar so the two read as the
// same object. Changing one without the other is how they drift.
const SIDE_MARGIN = 18;
const BAR_HEIGHT = 62;
const CORNER = 30;
const NOTCH_R = 34; // half-circle cutout radius
const HOME_R = 29;  // smaller than the notch, so a gap ring shows

// A rounded pill with a concave half-circle cut out of the top centre.
// The Home button sits in that cutout: its own circle, visibly separate,
// but part of the same silhouette.
function notchedBarPath(w) {
  const cx = w / 2;
  return [
    `M ${CORNER} 0`,
    `H ${cx - NOTCH_R}`,
    `A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${cx + NOTCH_R} 0`,
    `H ${w - CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${w} ${CORNER}`,
    `V ${BAR_HEIGHT - CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${w - CORNER} ${BAR_HEIGHT}`,
    `H ${CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 0 ${BAR_HEIGHT - CORNER}`,
    `V ${CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${CORNER} 0`,
    'Z',
  ].join(' ');
}

// Which URLs light up which item. Mirrors the iPhone's ROUTE_GROUPS, keyed
// by path instead of screen name.
const ROUTE_GROUPS = {
  // Everything under /brand is reached by tapping a restaurant from Home -
  // locations, checklists, renewals, event requests - so it stays lit under
  // Home, matching how the iPhone groups the same screens.
  home: ['/brand'],
  calendar: ['/calendar'],
  messages: ['/messages'],
  directory: [
    '/directory',
    '/availability',
    '/work-orders',
    '/announcements',
    '/executive-notes',
    '/access-requests',
    '/device-requests',
    '/catering',
  ],
  profile: ['/profile', '/support', '/admin/users'],
};

function isActive(key, pathname) {
  if (key === 'home') {
    return pathname === '/' || ROUTE_GROUPS.home.some((r) => pathname.startsWith(r));
  }
  return ROUTE_GROUPS[key].some((r) => pathname === r || pathname.startsWith(r + '/'));
}

export default function BottomBar({ messagesBadge, calendarBadge, profileBadge, directoryBadge, homeBadge }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The path has to be drawn at the bar's real pixel width. Drawing it at a
  // fixed size and stretching it to fit distorts every curve: the corners
  // become ellipses and the notch squashes to a fraction of its radius,
  // far too small for the home button to sit in.
  const barRef = useRef(null);
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => setBarWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const calendarOn = isActive('calendar', pathname);
  const messagesOn = isActive('messages', pathname);
  const homeOn = isActive('home', pathname);
  const directoryOn = isActive('directory', pathname);
  const profileOn = isActive('profile', pathname);

  const item = (key, iconName, on, to, badge, size) => (
    <button style={{ ...styles.item, color: on ? "var(--text-primary)" : "var(--text-secondary)" }} onClick={() => navigate(to)} aria-label={key}>
      <span style={styles.iconWrap}>
        <Icon name={iconName} size={size} filled={on} />
        {badge ? <span style={styles.badgeDot} /> : null}
      </span>
      {on ? <span style={styles.activeDot} /> : null}
    </button>
  );

  return (
    <div style={styles.wrap}>
      <div ref={barRef} style={styles.bar}>
        {barWidth > 0 ? (
          <>
            {/* Glass, in two layers. Underneath: a layer cut to the bar's
                exact shape (notch included) that frosts whatever scrolls
                behind it. On top: a light sheen and a bright rim where the
                light hits, drawn in the same shape. */}
            <div
              data-frost=""
              style={{
                ...styles.frost,
                clipPath: `path('${notchedBarPath(barWidth)}')`,
                WebkitClipPath: `path('${notchedBarPath(barWidth)}')`,
              }}
            />
            <svg style={styles.svg} width={barWidth} height={BAR_HEIGHT}>
              <defs>
                <linearGradient id="bbSheen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--bar-sheen)', stopOpacity: 0.78 }} />
                  <stop offset="1" style={{ stopColor: 'var(--bar-sheen)', stopOpacity: 0.5 }} />
                </linearGradient>
                <linearGradient id="bbRim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: '#FFFFFF', stopOpacity: 'calc(var(--bar-rim, 1) * 1)' }} />
                  <stop offset="0.5" style={{ stopColor: '#FFFFFF', stopOpacity: 'calc(var(--bar-rim, 1) * 0.25)' }} />
                  <stop offset="1" style={{ stopColor: '#FFFFFF', stopOpacity: 'calc(var(--bar-rim, 1) * 0.85)' }} />
                </linearGradient>
              </defs>
              <path d={notchedBarPath(barWidth)} fill="url(#bbSheen)" stroke="url(#bbRim)" strokeWidth={1.4} />
            </svg>
          </>
        ) : null}

        <div style={styles.iconRow}>
          {item('calendar', 'calendar', calendarOn, '/calendar', calendarBadge, 24)}
          {item('messages', 'message', messagesOn, '/messages', messagesBadge, 22)}
          {/* Empty slot under the notch, so two icons sit each side */}
          <div style={styles.item} />
          {item('directory', 'grid', directoryOn, '/directory', directoryBadge, 23)}
          {item('profile', 'person', profileOn, '/profile', profileBadge, 25)}
        </div>

        <button style={styles.homeButton} onClick={() => navigate('/')} aria-label="home">
          <Icon name="home" size={24} filled={homeOn} />
          {/* The sidebar badges Home for events needing your job role. The
              iPhone bar has no home badge, so a straight port would have
              dropped it - worth checking whether the phone should have one. */}
          {homeBadge ? <span style={styles.homeBadgeDot} /> : null}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    zIndex: 50,
    pointerEvents: 'none',
  },
  bar: { position: 'relative', height: BAR_HEIGHT, pointerEvents: 'auto' },
  // Glass (Nov 2026): a frosted white bar with a soft shadow under it.
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'drop-shadow(0 10px 22px rgba(30,40,60,0.14))' },
  frost: {
    position: 'absolute',
    inset: 0,
    WebkitBackdropFilter: 'blur(26px) saturate(190%) brightness(1.04)',
    backdropFilter: 'blur(26px) saturate(190%) brightness(1.04)',
  },
  iconRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: BAR_HEIGHT,
    padding: '0 6px',
  },
  item: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    background: 'none',
    border: 'none',
    height: BAR_HEIGHT,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  },
  iconWrap: { position: 'relative', display: 'flex' },
  activeDot: {
    position: 'absolute',
    bottom: 12,
    width: 4,
    height: 4,
    borderRadius: 2,
    background: 'var(--neon)',
  },
  homeBadgeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    background: 'var(--danger)',
  },
  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    background: 'var(--danger)',
  },
  homeButton: {
    position: 'absolute',
    left: `calc(50% - ${HOME_R}px)`,
    top: -HOME_R,
    width: HOME_R * 2,
    height: HOME_R * 2,
    borderRadius: HOME_R,
    background: 'var(--ink)',
    border: '1px solid rgba(var(--paper-rgb), 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // A glossy dark pebble: a highlight along the top edge, a shadow under.
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 6px rgba(0,0,0,0.25), 0 8px 18px rgba(30,40,60,0.28)',
    transition: 'transform 0.42s var(--spring)',
    cursor: 'pointer',
    color: 'var(--ink-text)',
    // Safari paints its own translucent grey over a tapped button, which
    // read as the home button briefly vanishing.
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  },
};
