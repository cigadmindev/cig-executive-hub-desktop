import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useSchedule } from '../context/ScheduleContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';

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

const timeLabel = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
            : e.dateTime
              ? '/calendar?date=' + new Date(e.dateTime).toISOString().slice(0, 10)
              : '/calendar',
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
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <span style={styles.title}>Notifications</span>
          {tab === 'forYou' && unreadCount > 0 ? (
            <button style={styles.linkButton} onClick={markAllRead}>
              Mark all read
            </button>
          ) : null}
          <button style={styles.close} onClick={onClose} aria-label="Close">
            ✕
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
                    const unread = tab === 'forYou' && !item.readAt;
                    return (
                      <button
                        key={item.id}
                        data-row=""
                        style={{ ...styles.row, ...(unread ? styles.rowUnread : {}) }}
                        onClick={() => open(item)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...styles.rowTitle, ...(unread ? {} : styles.rowTitleRead) }}>{item.title}</p>
                          {item.body ? <p style={styles.rowBody}>{item.body}</p> : null}
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
      onClick={onClick}
      aria-label={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
    >
      <Icon name="bell" size={floating ? 19 : 18} color="var(--text-secondary)" />
      {unreadCount > 0 ? <span style={floating ? styles.dotFloating : styles.dot} /> : null}
    </button>
  );
}

const styles = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px 16px' },
  panel: { width: 'min(460px, 100%)', maxHeight: '76vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' },

  head: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' },
  title: { flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  linkButton: { background: 'none', border: 'none', padding: 0, color: 'var(--neon)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  close: { background: 'none', border: 'none', padding: 4, color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' },

  tabs: { display: 'flex', gap: 6, padding: '0 16px 12px', borderBottom: '1px solid var(--border)' },
  tab: { padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },
  tabOn: { border: '1px solid var(--neon)', background: 'rgba(34,211,238,0.12)', color: 'var(--text-primary)' },
  tabCount: { color: 'var(--neon)', fontWeight: 700 },

  scroll: { overflowY: 'auto', padding: '4px 0 8px' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)', padding: '18px 16px' },
  dayLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, padding: '12px 16px 4px' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' },
  rowUnread: { borderLeft: '3px solid var(--neon)', background: 'rgba(34,211,238,0.06)' },
  rowTitle: { fontSize: 13, color: 'var(--text-primary)', margin: 0 },
  rowTitleRead: { color: 'var(--text-secondary)' },
  rowBody: { fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' },
  rowTime: { fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', paddingTop: 2 },
  showOlder: { width: '100%', padding: '11px 0', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },

  bell: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', flexShrink: 0 },
  dot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },

  // On a phone: floating above the bottom bar, bottom right.
  bellFloating: { position: 'fixed', right: 14, bottom: 96, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)', cursor: 'pointer' },
  dotFloating: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },
};
