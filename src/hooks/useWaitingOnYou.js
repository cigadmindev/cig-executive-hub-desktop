import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useEventRequests } from '../context/EventRequestsContext';
import { useDeviceRequests } from '../context/DeviceRequestsContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useIntegrationRequests } from '../context/IntegrationRequestsContext';
import { useCatering } from '../context/CateringContext';
import { useExpenses } from '../context/ExpensesContext';
import { useSchedule } from '../context/ScheduleContext';
import { atLeast, accessLevel } from '../data/accessMatrix';
import { brandIdForTarget } from '../data/mockData';
import { fmtDay } from '../lib/dates';

// Everything waiting on this person specifically, for "Needs you" on Home:
// decisions their job makes, documents they must sign, enquiries they can
// claim, requests they answer, and their own expense deadline. Each line
// disappears the moment the thing is dealt with - by them or anyone else -
// because it is read live from the same data the request pages use.
const fmt = (ms) => fmtDay(ms);

export function useWaitingOnYou() {
  const { user } = useAuth();
  const { timeOffRequests } = useAvailability();
  const { requests: eventRequests } = useEventRequests();
  const { requests: deviceRequests } = useDeviceRequests();
  const { requests: accessRequests } = useAccessRequests();
  const { getMyQueue } = useWorkOrders();
  const { requests: helpRequests, handlesRequests } = useIntegrationRequests();
  const { enquiries } = useCatering();
  const { periods, reports, seesAll } = useExpenses();
  const { entries } = useSchedule();

  return useMemo(() => {
    if (!user) return [];
    const out = [];
    const isAdmin = user.role === 'admin';
    const add = (tag, text, where, to, sort = 0) => out.push({ level: 'waiting', mine: true, tag, text: tag + ' · ' + text, where, to, sort });

    if (isAdmin || atLeast(user, 'availability', 'approve')) {
      timeOffRequests
        .filter((r) => r.status === 'pending' && (isAdmin || r.uid !== user.uid))
        .forEach((r) => add('Time off', r.name + ' · ' + fmt(r.startDate) + (r.endDate && r.endDate !== r.startDate ? ' – ' + fmt(r.endDate) : ''), 'Decide', '/availability', r.startDate));
    }
    if (isAdmin || atLeast(user, 'eventRequests', 'approve')) {
      (eventRequests ?? [])
        .filter((r) => r.status === 'pending' && (isAdmin || r.requestedByUid !== user.uid))
        .forEach((r) => add('Event', r.title + ' · ' + (r.requestedBy ?? ''), 'Decide · ' + (r.locationName ?? ''), r.locationId ? `/brand/${r.brandId ?? brandIdForTarget(r.locationId)}/location/${r.locationId}/event-requests` : '/', r.dateTime ?? 0));
    }
    if (isAdmin || atLeast(user, 'deviceRequests', 'approve')) {
      (deviceRequests ?? [])
        .filter((r) => r.status === 'requested')
        .forEach((r) => add('Device', r.deviceType + ' · ' + (r.requestedByName ?? ''), 'Decide', '/device-requests', r.createdAt ?? 0));
    }
    if (isAdmin) {
      (accessRequests ?? [])
        .filter((r) => r.status === 'pending')
        .forEach((r) => add('Access', (r.userName ?? 'Someone') + ' · ' + (r.targetLabel ?? ''), 'Decide', '/access-requests', r.timestamp ?? 0));
    }
    (getMyQueue?.() ?? []).forEach((o) => add('Signature', o.title, 'Sign · from ' + (o.uploadedByName ?? ''), '/work-orders', o.createdAt ?? 0));
    // A checklist item someone finished and asked you to sign (10 Oct 2026).
    (entries ?? [])
      .filter((e) => e.signature?.status === 'waiting' && e.signature.requestedOfUid === user.uid && !e.done)
      .forEach((e) => add('Signature', e.title, 'Sign · from ' + (e.signature.requestedByName ?? ''), `/brand/${brandIdForTarget(e.locationId) ?? e.brandId}/location/${e.locationId}/opening-checklist`, e.signature.requestedAt ?? 0));
    if (handlesRequests) {
      (helpRequests ?? [])
        .filter((r) => r.status !== 'done' && !r.respondedAt)
        .forEach((r) => add('Systems Help', [r.system ?? 'Request', r.createdByName].filter(Boolean).join(' · '), 'Answer', '/integration-requests', r.createdAt ?? 0));
    }
    // Only Catering & Events managers claim (10 Oct 2026) - never admins.
    if (accessLevel(user, 'catering') === 'claim') {
      (enquiries ?? [])
        .filter((e) => !e.ownerUid && (e.status ?? 'new') === 'new')
        .forEach((e) => add('Catering', (e.name ?? 'New enquiry') + (e.guests ? ' · ' + e.guests : ''), 'Claim · ' + (e.locationName ?? ''), '/catering', e.createdAt ?? 0));
    }
    // Expenses: the last three days of a period for anyone who submits
    // receipts - a receipt is dated the day it is added, so anything not in
    // by the end goes into the next period (10 Oct 2026) - and an
    // uncollected period report for finance.
    if (isAdmin || accessLevel(user, 'expenses') !== 'none') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      const inThree = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      const ending = (periods ?? []).find((p) => p.startKey <= today && today <= p.endKey && p.endKey <= inThree);
      if (ending) add('Expenses', ending.label + ' ends ' + fmt(new Date(ending.endKey + 'T12:00:00').getTime()), 'Add any receipts you still have', '/expenses', -1);
    }
    if (seesAll) {
      (reports ?? [])
        .filter((r) => r.kind === 'period' && !(r.downloadedByUids ?? []).includes(user.uid))
        .forEach((r) => add('Report', r.label + ' is ready', 'Download', '/expenses', -2));
    }
    return out.sort((a, b) => a.sort - b.sort);
  }, [user, timeOffRequests, eventRequests, deviceRequests, accessRequests, getMyQueue, helpRequests, handlesRequests, enquiries, periods, reports, seesAll, entries]);
}
