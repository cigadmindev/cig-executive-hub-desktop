import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useSchedule } from '../context/ScheduleContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { fmtTime } from '../lib/dates';
import { calendarLink } from '../hooks/useHomeSummary';
import { segTrack, segItem, segItemOn } from '../theme/segmented';

// Everything you have been told, everything you have done, and what everyone
// else has been up to.
//
// A panel over whatever page you are on rather than a page of its own -
// checking what happened should not lose your place.
//
// The first two tabs are stored records, kept 90 days: "did I sign that back
// in August" is the question they answer. The third is worked out from the
// entries themselves and covers 30 days, because writing a line for all
// fourteen people every time someone ticks something off would mean thousands
// of records from one checklist run.
const DAY_MS = 24 * 60 * 60 * 1000;
const AROUND_DAYS = 60;

const dayLabel = (t) => {
  const d = new Date(t);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

const timeLabel = (t) => fmtTime(t);

export default function NotificationsPanel({ onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { forYou, youDid, unreadCount, markRead, markAllRead } = useNotifications();
  const { entries } = useSchedule();
  const { getByBrand } = useCustomLocations();
  const [tab, setTab] = useState('forYou');
  const [showing, setShowing] = useState(25);

  // A location's restaurant, so a sign-off links to the checklist it is on
  // rather than dropping someone on the calendar to find it.
  const brandOf = (locationId) => {
    for (const b of brands) {
      if ((b.locations ?? []).some((l) => l.id === locationId)) return b.id;
      if (getByBrand(b.id).some((l) => l.id === locationId)) return b.id;
    }
    return null;
  };

  const since = Date.now() - AROUND_DAYS * DAY_MS;
  const around = entries
    .filter((e) => e.done && e.doneAt && e.doneAt > since && e.doneBy && e.doneBy !== user?.name)
    .sort((a, b) => b.doneAt - a.doneAt)
    .slice(0, 60)
    .map((e) => {
      const brandId = brandOf(e.locationId);
      return {
        id: 'around-' + e.id,
        title: e.doneBy + ' signed off ' + e.title,
        body: e.openingSection ?? '',
        path:
          e.openingItem && brandId && e.locationId
            ? `/brand/${brandId}/location/${e.locationId}/opening-checklist`
            : calendarLink(e),
        createdAt: e.doneAt,
        readAt: e.doneAt,
      };
    });

  const list = tab === 'forYou' ? forYou : tab === 'youDid' ? youDid : around;
  const visible = list.slice(0, showing);

  const open = (item) => {
    if (tab === 'forYou') markRead(item.id);
    navigate(item.path || '/');
    onClose();
  };

  const groups = [];
  visible.forEach((item) => {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  });

  return (
    <div data-modal="" style={styles.backdrop} onClick={onClose}>
      <div data-sheet="" style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <span style={styles.title}>Notifications</span>
          {tab === 'forYou' && unreadCount > 0 ? (
            <button style={styles.linkButton} onClick={markAllRead}>
              Mark all read
            </button>
          ) : null}
          <button style={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={styles.tabs}>
          {[
            { key: 'forYou', label: 'For you', count: unreadCount },
            { key: 'youDid', label: 'You did' },
            { key: 'around', label: 'Around the Hub' },
          ].map((t) => (
            <button
              key={t.key}
              style={{ ...styles.tab, ...(tab === t.key ? styles.tabOn : {}) }}
              onClick={() => {
                setTab(t.key);
                setShowing(25);
              }}
            >
              {t.label}
              {t.count > 0 ? <span style={styles.tabCount}> {t.count}</span> : null}
            </button>
          ))}
        </div>

        <div style={styles.scroll}>
          {visible.length === 0 ? (
            <p style={styles.empty}>
              {tab === 'forYou'
                ? 'Nothing yet. Anything sent to you shows here.'
                : tab === 'youDid'
                  ? 'Nothing yet. Things you sign, tick off or submit show here.'
                  : 'Nothing from anyone else in the last 60 days.'}
            </p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.label}>
                  <p style={styles.dayLabel}>{g.label}</p>
                  {g.items.map((item) => {
                    const unread = tab === 'forYou' && !item.readAt && !item.resolvedAt;
                    const handled = tab === 'forYou' && item.resolvedAt;
                    return (
                      <button
                        key={item.id}
                        data-row=""
                        style={{ ...styles.row, ...(unread ? styles.rowUnread : {}), ...(handled ? { opacity: 0.55 } : {}) }}
                        onClick={() => open(item)}
                      >
                        <span style={{ ...styles.unreadDot, opacity: unread ? 1 : 0 }} aria-hidden="true" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...styles.rowTitle, ...(unread ? {} : styles.rowTitleRead) }}>{item.title}</p>
                          {item.body ? <p style={styles.rowBody}>{item.body}</p> : null}
                          {handled ? (
                            <span style={styles.handledPill}>
                              {(item.topic === 'catering' ? 'Claimed' : 'Handled') +
                                (item.resolvedByName ? ' by ' + item.resolvedByName.split(' ')[0] : '')}
                            </span>
                          ) : null}
                        </div>
                        <span style={styles.rowTime}>{timeLabel(item.createdAt)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {list.length > visible.length ? (
                <button style={styles.showOlder} onClick={() => setShowing((n) => n + 25)}>
                  Show older
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The bell, with a dot when anything is unread. */
export function NotificationsBell({ onClick, floating = false }) {
  const { unreadCount } = useNotifications();
  return (
    <button
      style={floating ? styles.bellFloating : styles.bell}
      data-bell={floating ? '' : undefined}
      onClick={onClick}
      aria-label={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
    >
      <Icon name="bell" size={floating ? 19 : 18} color="var(--text-secondary)" />
      {unreadCount > 0 ? <span style={floating ? styles.dotFloating : styles.dot} /> : null}
    </button>
  );
}

const styles = {
  handledPill: {
    display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 600, letterSpacing: 0,
    textTransform: 'none', color: 'var(--text-secondary)', background: 'rgba(var(--ink-rgb), 0.06)',
    borderRadius: 999, padding: '3px 9px',
  },
  // Glass (Nov 2026): a sheet down the right-hand side, like the Mac's
  // Notification Centre - full height, so more fits without scrolling.
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(20,24,32,0.24)', zIndex: 300, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', padding: 'calc(14px + env(safe-area-inset-top, 0px)) 14px calc(14px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' },
  // The edge and its highlight follow the theme (Nov 2026): a bright rim in
  // light mode, a faint one in dark instead of a hard white line.
  panel: { width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, rgba(var(--paper-rgb), 0.92), rgba(var(--paper-rgb), 0.84))', WebkitBackdropFilter: 'blur(30px) saturate(180%)', backdropFilter: 'blur(30px) saturate(180%)', border: '1px solid var(--glass-border)', borderRadius: 26, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, calc(var(--bar-rim, 1) * 0.7)), 0 24px 60px rgba(10, 14, 22, 0.28)', overflow: 'hidden' },

  head: { display: 'flex', alignItems: 'center', gap: 12, padding: '20px 16px 14px 22px' },
  title: { flex: 1, fontSize: 24, fontWeight: 800, letterSpacing: -0.6, color: 'var(--text-primary)' },
  linkButton: { background: 'none', border: 'none', padding: 0, color: 'var(--neon)', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  close: { width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--ink-rgb), 0.06)', border: 'none', borderRadius: 17, padding: 0, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' },

  tabs: { ...segTrack, display: 'flex', margin: '0 18px 10px' },
  tab: { ...segItem, flex: 1, justifyContent: 'center', minHeight: 32, height: 32, fontSize: 13 },
  tabOn: { ...segItemOn },
  tabCount: { color: 'var(--neon)', fontWeight: 700 },

  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 8px 12px' },
  empty: { fontSize: 15, color: 'var(--text-tertiary)', padding: '40px 20px', textAlign: 'center' },
  dayLabel: { fontSize: 13, fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'var(--text-secondary)', margin: 0, padding: '14px 12px 6px' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '11px 12px', background: 'none', border: 'none', borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, background: 'var(--neon)', flexShrink: 0, marginTop: 6 },
  rowUnread: { background: 'color-mix(in srgb, var(--neon) 9%, transparent)' },
  rowTitle: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)', margin: 0 },
  rowTitleRead: { fontWeight: 500, color: 'var(--text-secondary)' },
  rowBody: { fontSize: 13, lineHeight: 1.4, color: 'var(--text-tertiary)', margin: '3px 0 0' },
  rowTime: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', paddingTop: 2 },
  showOlder: { width: '100%', padding: '12px 0', background: 'none', border: 'none', color: 'var(--neon)', fontSize: 14, fontWeight: 600, cursor: 'pointer' },

  bell: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 18, border: '1px solid rgba(var(--ink-rgb), 0.1)', background: 'rgba(var(--paper-rgb), 0.6)', cursor: 'pointer', flexShrink: 0 },
  dot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },

  // On a phone: floating above the bottom bar, bottom right.
  bellFloating: { position: 'fixed', right: 14, bottom: 104, zIndex: 60, /* above the bottom bar, under every pop-up */ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 22, border: '1.4px solid rgba(255, 255, 255, calc(var(--bar-rim, 1) * 0.85))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--bar-sheen) 78%, transparent), color-mix(in srgb, var(--bar-sheen) 50%, transparent))', backdropFilter: 'blur(26px) saturate(190%) brightness(1.04)', WebkitBackdropFilter: 'blur(26px) saturate(190%) brightness(1.04)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, calc(var(--bar-rim, 1) * 0.6)), 0 10px 22px rgba(30, 40, 60, 0.14)', cursor: 'pointer' },
  dotFloating: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },
};
