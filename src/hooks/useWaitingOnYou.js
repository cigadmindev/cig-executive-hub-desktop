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
import { atLeast, accessLevel } from '../data/accessMatrix';
import { brandIdForTarget } from '../data/mockData';

// Everything waiting on this person specifically, for "Needs you" on Home:
// decisions their job makes, documents they must sign, enquiries they can
// claim, requests they answer, and their own expense deadline. Each line
// disappears the moment the thing is dealt with - by them or anyone else -
// because it is read live from the same data the request pages use.
const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

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
        .forEach((r) => add('Access', (r.userName ?? 'Someone') + ' · ' + (r.targetLabel ?? ''), 'Decide', '/admin/pending-requests', r.createdAt ?? 0));
    }
    (getMyQueue?.() ?? []).forEach((o) => add('Signature', o.title, 'Sign · from ' + (o.uploadedByName ?? ''), '/work-orders', o.createdAt ?? 0));
    if (handlesRequests) {
      (helpRequests ?? [])
        .filter((r) => r.status !== 'done' && !r.respondedAt)
        .forEach((r) => add('Systems Help', (r.system ?? 'Request') + ' · ' + (r.createdByName ?? ''), 'Answer', '/integration-requests', r.createdAt ?? 0));
    }
    if (isAdmin || atLeast(user, 'catering', 'claim')) {
      (enquiries ?? [])
        .filter((e) => !e.ownerUid && (e.status ?? 'new') === 'new')
        .forEach((e) => add('Catering', (e.name ?? 'New enquiry') + (e.guests ? ' · ' + e.guests : ''), 'Claim · ' + (e.locationName ?? ''), '/catering', e.createdAt ?? 0));
    }
    // Expenses: the catch-up week for anyone who submits receipts, and an
    // uncollected period report for finance.
    if (isAdmin || accessLevel(user, 'expenses') !== 'none') {
      const today = new Date().toISOString().slice(0, 10);
      const closing = (periods ?? []).find((p) => p.endKey < today && today <= p.windowEndKey);
      if (closing) add('Expenses', closing.label + ' receipts due ' + fmt(new Date(closing.windowEndKey + 'T12:00:00').getTime()), 'Add any receipts from that period', '/expenses', -1);
    }
    if (seesAll) {
      (reports ?? [])
        .filter((r) => r.kind === 'period' && !(r.downloadedByUids ?? []).includes(user.uid))
        .forEach((r) => add('Report', r.label + ' is ready', 'Download', '/expenses', -2));
    }
    return out.sort((a, b) => a.sort - b.sort);
  }, [user, timeOffRequests, eventRequests, deviceRequests, accessRequests, getMyQueue, helpRequests, handlesRequests, enquiries, periods, reports, seesAll]);
}
