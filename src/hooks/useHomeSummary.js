import { useMemo } from 'react';
import { brands } from '../data/mockData';
import { useSchedule } from '../context/ScheduleContext';
import { useRenewals } from '../context/RenewalsContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAuth } from '../context/AuthContext';
import { RENEWAL_WARNING_WINDOW_DAYS } from '../data/renewalTypes';

const DAY = 24 * 60 * 60 * 1000;

// Everything Home needs, aggregated across every brand and location.
//
// Every other screen loads one location at a time; Home is the only place
// that asks "what's happening everywhere". Both Schedule and Renewals already
// hold their full collections and filter client-side, so this is a reduce
// over data that's in memory, not a new set of queries.
export function useHomeSummary() {
  const { entries } = useSchedule();
  const { getByLocation: renewalsFor } = useRenewals();
  const { getInfo } = useOpeningInfo();
  const { getByBrand } = useCustomLocations();
  const { user, hasBrandAccess } = useAuth();

  return useMemo(() => {
    const now = Date.now();

    // Only brands this account can reach. Filtering here rather than at each
    // display site means restricted data never enters the summary at all -
    // everything below derives from this list, so one filter covers the
    // attention items, the per-brand rollup and the opening-soon panel.
    // Admins and executives see everything; a manager sees their own brands.
    const locations = brands.filter((b) => hasBrandAccess(user, b.id)).flatMap((b) => [
      ...b.locations.map((l) => ({ ...l, brandId: b.id, brandName: b.name })),
      ...getByBrand(b.id).map((l) => ({ ...l, brandId: b.id, brandName: b.name })),
    ]);

    const attention = [];
    const byBrand = {};
    const openingSoon = [];

    locations.forEach((loc) => {
      const info = getInfo(loc.id);
      const openingDate = info?.openingDate ?? null;
      const allOpening = entries.filter((e) => e.locationId === loc.id && e.openingItem);
      // Tracked separately: setup is the permit and account work, timeline is
      // the build-out milestones. They progress at different rates and mixing
      // them into one number hides which half is behind.
      const items = allOpening.filter((e) => e.openingItemType === 'setup');
      const timeline = allOpening.filter((e) => e.openingItemType === 'timeline');
      const done = items.filter((i) => i.done).length;
      const timelineDone = timeline.filter((i) => i.done).length;
      const timelineOverdue = timeline.filter((i) => !i.done && i.dateTime < now);

      // The generator clamps its window so nothing is placed in the past, so
      // anything overdue here genuinely slipped rather than being backdated.
      const overdueItems = items.filter((i) => !i.done && i.dateTime < now);

      const b = (byBrand[loc.brandId] ??= { overdue: 0, total: 0, done: 0, dueSoon: 0, openingDate: null });
      b.overdue += overdueItems.length + timelineOverdue.length;
      b.total += items.length;
      b.done += done;
      if (openingDate && openingDate > now) b.openingDate = openingDate;

      // One row per item, not one per location. "7 checklist items overdue"
      // tells you a number and nothing else - you still have to open the
      // location to find out which. The iPhone app has always listed them.
      overdueItems.forEach((item) => {
        attention.push({
          level: 'overdue',
          text: item.title,
          where: `${loc.brandName} · ${loc.name}`,
          to: `/brand/${loc.brandId}/location/${loc.id}/opening-checklist`,
          sort: item.dateTime ?? 0,
        });
      });

      timelineOverdue.forEach((item) => {
        attention.push({
          level: 'overdue',
          text: item.title,
          where: `${loc.brandName} · ${loc.name}`,
          to: `/brand/${loc.brandId}/location/${loc.id}/opening-checklist`,
          sort: item.dateTime ?? 0,
        });
      });

      (renewalsFor(loc.id) ?? []).forEach((r) => {
        if (!r.expirationDate) return;
        const days = Math.round((r.expirationDate - now) / DAY);
        if (days > RENEWAL_WARNING_WINDOW_DAYS) return;
        b.dueSoon += 1;
        attention.push({
          level: days < 0 ? 'overdue' : 'soon',
          text: days < 0 ? `${r.type} expired` : `${r.type} expires in ${days} day${days === 1 ? '' : 's'}`,
          where: `${loc.brandName} · ${loc.name}`,
          to: `/brand/${loc.brandId}/location/${loc.id}/renewals`,
          sort: days,
        });
      });

      if (openingDate && openingDate > now) {
        openingSoon.push({
          ...loc,
          openingDate,
          daysOut: Math.round((openingDate - now) / DAY),
          done,
          total: items.length,
          overdue: overdueItems.length,
          timelineDone,
          timelineTotal: timeline.length,
          timelineOverdue: timelineOverdue.length,
        });
      }
    });

    attention.sort((a, b2) => a.sort - b2.sort);

    const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
    const weekEnd = now + 7 * DAY;

    // Everything landing in the next seven days, across every location. The
    // Master Calendar shows the same entries but a month at a time; this is
    // the near horizon, which is what someone actually plans around.
    // locById holds only accessible locations, so requiring an entry to be
    // in it scopes this the same way the tiles are. It was previously used
    // for labelling alone, which let another brand's items through with a
    // blank where.
    const thisWeekAll = entries.filter(
      (e) => locById[e.locationId] && e.dateTime >= now && e.dateTime <= weekEnd && !e.done
    );
    const thisWeekCount = thisWeekAll.length;

    const thisWeek = thisWeekAll
      .sort((a, b2) => a.dateTime - b2.dateTime)
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        title: e.title,
        dateTime: e.dateTime,
        where: locById[e.locationId]
          ? `${locById[e.locationId].brandName} · ${locById[e.locationId].name}`
          : '',
        to: locById[e.locationId]
          ? `/brand/${locById[e.locationId].brandId}/location/${e.locationId}/opening-checklist`
          : '/calendar',
      }));

    // Approximated from sign-off timestamps rather than a real activity log —
    // there isn't one yet, and writing activity records on every change is
    // more plumbing than this panel is worth today. Covers the common case:
    // seeing that someone else moved something forward.
    const recent = entries
      .filter((e) => locById[e.locationId] && e.done && e.doneAt)
      .sort((a, b2) => b2.doneAt - a.doneAt)
      .slice(0, 4)
      .map((e) => ({
        id: e.id,
        text: `${e.doneBy || 'Someone'} signed off ${e.title}`,
        at: e.doneAt,
        where: locById[e.locationId]?.brandName ?? '',
      }));

    return {
      attention,
      thisWeek,
      recent,
      byBrand,
      openingSoon: openingSoon.sort((a, b2) => a.openingDate - b2.openingDate),
      counts: {
        overdue: Object.values(byBrand).reduce((n, b) => n + b.overdue, 0),
        // byBrand.dueSoon is incremented only by renewals inside the window,
        // so this has always been a renewal count - it just wasn't named one.
        renewals: Object.values(byBrand).reduce((n, b) => n + b.dueSoon, 0),
        // Counted before thisWeek is sliced to six for display, or a busy
        // week would under-report.
        thisWeek: thisWeekCount,
      },
    };
    // user is a dependency: without it, someone whose permissions change
    // would keep seeing the old summary until they reloaded the app.
  }, [entries, getByBrand, getInfo, renewalsFor, user]);
}
