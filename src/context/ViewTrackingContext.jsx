import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { useAnnouncements } from './AnnouncementsContext';
import { useBrandAnnouncements } from './BrandAnnouncementsContext';
import { useEventRequests } from './EventRequestsContext';
import { useAvailability } from './AvailabilityContext';
import { useSchedule } from './ScheduleContext';
import { categories } from '../data/mockData';

const ViewTrackingContext = createContext(undefined);
const COLLECTION = 'viewTracking';

export function ViewTrackingProvider({ children }) {
  const { user } = useAuth();
  const { announcements } = useAnnouncements();
  const { announcements: brandAnnouncements } = useBrandAnnouncements();
  const { requests: eventRequests } = useEventRequests();
  const { timeOffRequests } = useAvailability();
  const { entries: scheduleEntries } = useSchedule();
  const [views, setViews] = useState({});

  useEffect(() => {
    if (!user) {
      setViews({});
      return;
    }
    // Same document ID scheme mobile uses (${uid}_${type}_${targetId}) —
    // this is what makes marking something viewed on the phone clear it
    // here too, automatically, via the same live Firestore document.
    const unsubscribe = onSnapshot(query(collection(db, COLLECTION), where('uid', '==', user.uid)), (snapshot) => {
      const map = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        map[`${data.type}_${data.targetId}`] = data.lastViewedAt;
      });
      setViews(map);
    });
    return unsubscribe;
  }, [user]);

  const markViewed = async (type, targetId) => {
    if (!user) return;
    await setDoc(doc(db, COLLECTION, `${user.uid}_${type}_${targetId}`), {
      uid: user.uid,
      type,
      targetId,
      lastViewedAt: Date.now(),
    });
  };

  const markCategoryViewed = (locationId, categoryId) => markViewed('category', `${locationId}_${categoryId}`);
  const markEventRequestsViewed = (locationId) => markViewed('eventRequests', locationId);
  const markBrandViewed = (brandId) => markViewed('brand', brandId);
  const markTimeOffViewed = () => markViewed('timeoff', 'global');
  const markCalendarViewed = (brandId) => markViewed('calendar', brandId);

  const hasUnseenCategoryPosts = (locationId, categoryId) => {
    if (!user) return false;
    const lastViewed = views[`category_${locationId}_${categoryId}`] ?? 0;
    return announcements.some(
      (a) => a.locationId === locationId && a.categoryId === categoryId && a.timestamp > lastViewed && a.authorUid !== user.uid
    );
  };

  const hasUnseenEventRequests = (locationId) => {
    if (!user) return false;
    const lastViewed = views[`eventRequests_${locationId}`] ?? 0;
    return eventRequests.some((r) => {
      if (r.locationId !== locationId) return false;
      if (r.status === 'pending') {
        return r.timestamp > lastViewed && r.requestedByUid !== user.uid;
      }
      return !!r.resolvedAt && r.resolvedAt > lastViewed && r.resolvedByUid !== user.uid;
    });
  };

  const hasUnseenBrandPosts = (brandId) => {
    if (!user) return false;
    const lastViewed = views[`brand_${brandId}`] ?? 0;
    return brandAnnouncements.some(
      (a) => (a.targetId === brandId || a.targetId === 'all') && a.timestamp > lastViewed && a.authorUid !== user.uid
    );
  };

  const hasUnseenForLocation = (locationId) => {
    if (categories.some((c) => hasUnseenCategoryPosts(locationId, c.id))) return true;
    return hasUnseenEventRequests(locationId);
  };

  const hasUnseenForBrand = (brandId, locationIds) => {
    if (hasUnseenBrandPosts(brandId)) return true;
    if (hasUnseenCalendar(brandId, locationIds)) return true;
    return locationIds.some((id) => hasUnseenForLocation(id));
  };

  const hasUnseenCalendar = (brandId, locationIds) => {
    if (!user) return false;
    const lastViewed = views[`calendar_${brandId}`] ?? 0;
    return scheduleEntries.some((e) => locationIds.includes(e.locationId) && e.timestamp > lastViewed && e.authorUid !== user.uid);
  };

  const hasUnseenTimeOff = () => {
    if (!user) return false;
    const lastViewed = views['timeoff_global'] ?? 0;
    const pendingForAdmin = user.role === 'admin' && timeOffRequests.some((r) => r.status === 'pending' && r.uid !== user.uid);
    const myOwnResolved = timeOffRequests.some(
      (r) => r.uid === user.uid && r.status !== 'pending' && !!r.resolvedAt && r.resolvedAt > lastViewed && r.resolvedByUid !== user.uid
    );
    return pendingForAdmin || myOwnResolved;
  };

  return (
    <ViewTrackingContext.Provider
      value={{
        markCategoryViewed,
        markEventRequestsViewed,
        markBrandViewed,
        markTimeOffViewed,
        markCalendarViewed,
        hasUnseenCategoryPosts,
        hasUnseenEventRequests,
        hasUnseenBrandPosts,
        hasUnseenForLocation,
        hasUnseenForBrand,
        hasUnseenTimeOff,
        hasUnseenCalendar,
      }}
    >
      {children}
    </ViewTrackingContext.Provider>
  );
}

export function useViewTracking() {
  const ctx = useContext(ViewTrackingContext);
  if (!ctx) throw new Error('useViewTracking must be used within ViewTrackingProvider');
  return ctx;
}
