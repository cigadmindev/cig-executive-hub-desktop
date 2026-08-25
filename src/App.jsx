import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { ScheduleProvider } from './context/ScheduleContext';
import { CustomLocationsProvider } from './context/CustomLocationsContext';
import { AvailabilityProvider } from './context/AvailabilityContext';
import { EventRequestsProvider } from './context/EventRequestsContext';
import { RenewalsProvider } from './context/RenewalsContext';
import { AccessRequestsProvider } from './context/AccessRequestsContext';
import { AnnouncementsProvider } from './context/AnnouncementsContext';
import { BrandAnnouncementsProvider } from './context/BrandAnnouncementsContext';
import { ViewTrackingProvider } from './context/ViewTrackingContext';
import { SupportRequestsProvider } from './context/SupportRequestsContext';
import { SupportAnnouncementsProvider } from './context/SupportAnnouncementsContext';
import { CategoryDriveLinksProvider } from './context/CategoryDriveLinksContext';
import { OpeningInfoProvider } from './context/OpeningInfoContext';
import { OpeningOngoingContactsProvider } from './context/OpeningOngoingContactsContext';
import { ExecutiveNotesProvider } from './context/ExecutiveNotesContext';
import { WorkOrdersProvider } from './context/WorkOrdersContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginScreen from './screens/LoginScreen';
import DirectoryScreen from './screens/DirectoryScreen';
import ProfileScreen from './screens/ProfileScreen';
import AppLayout from './layout/AppLayout';
import HomeScreen from './screens/HomeScreen';
import BrandScreen from './screens/BrandScreen';
import LocationScreen from './screens/LocationScreen';
import CategoryDetailScreen from './screens/CategoryDetailScreen';
import AnnouncementsScreen from './screens/AnnouncementsScreen';
import HomeAnnouncementsScreen from './screens/HomeAnnouncementsScreen';
import MessagesScreen from './screens/MessagesScreen';
import CalendarScreen from './screens/CalendarScreen';
import AvailabilityScreen from './screens/AvailabilityScreen';
import EventRequestsScreen from './screens/EventRequestsScreen';
import RenewalsScreen from './screens/RenewalsScreen';
import AdminUsersScreen from './screens/AdminUsersScreen';
import PendingRequestsScreen from './screens/PendingRequestsScreen';
import SupportScreen from './screens/SupportScreen';
import OpeningChecklistScreen from './screens/OpeningChecklistScreen';
import OperationalPOCScreen from './screens/OperationalPOCScreen';
import IntegrationsScreen from './screens/IntegrationsScreen';
import ExecutiveNotesScreen from './screens/ExecutiveNotesScreen';
import OverallAnalysisScreen from './screens/OverallAnalysisScreen';
import WorkOrdersScreen from './screens/WorkOrdersScreen';
import ResetAppDataScreen from './screens/ResetAppDataScreen';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  return (
    <Providers>
    <AppLayout>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/brand/:brandId" element={<BrandScreen />} />
        <Route path="/brand/:brandId/location/:locationId" element={<LocationScreen />} />
        <Route path="/brand/:brandId/location/:locationId/event-requests" element={<EventRequestsScreen />} />
        <Route path="/brand/:brandId/location/:locationId/renewals" element={<RenewalsScreen />} />
        <Route path="/brand/:brandId/location/:locationId/category/:categoryId" element={<CategoryDetailScreen />} />
        <Route
          path="/brand/:brandId/location/:locationId/category/:categoryId/announcements"
          element={<AnnouncementsScreen />}
        />
        <Route path="/announcements/new" element={<HomeAnnouncementsScreen />} />
        <Route path="/messages" element={<MessagesScreen />} />
        <Route path="/calendar" element={<CalendarScreen />} />
        <Route path="/directory" element={<DirectoryScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/availability" element={<AvailabilityScreen />} />
        <Route path="/admin/users" element={<AdminUsersScreen />} />
        <Route path="/admin/pending-requests" element={<PendingRequestsScreen />} />
        <Route path="/brand/:brandId/location/:locationId/opening-checklist" element={<OpeningChecklistScreen />} />
        <Route path="/brand/:brandId/location/:locationId/operational-poc" element={<OperationalPOCScreen />} />
        <Route path="/brand/:brandId/location/:locationId/integrations" element={<IntegrationsScreen />} />
        <Route path="/support" element={<SupportScreen />} />
        <Route path="/executive-notes" element={<ExecutiveNotesScreen />} />
        <Route path="/overall-analysis" element={<OverallAnalysisScreen />} />
        <Route path="/work-orders" element={<WorkOrdersScreen />} />
        <Route path="/reset-app-data" element={<ResetAppDataScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
    </Providers>
  );
}

// Every one of these opens a Firestore listener the moment it mounts.
// They used to sit above the auth gate, so on a cold start they all fired
// while signed out and each threw permission-denied — correct behaviour
// from the rules, but it buried real errors in console noise. Mounting
// them only once there's a user means the listeners start with a token.
function Providers({ children }) {
  return (

      <ThemeProvider>
      <WorkOrdersProvider>
      <ExecutiveNotesProvider>
      <CategoryDriveLinksProvider>
      <SupportRequestsProvider>
        <SupportAnnouncementsProvider>
          <AnnouncementsProvider>
            <BrandAnnouncementsProvider>
              <ChatProvider>
                <ScheduleProvider>
                  <OpeningInfoProvider>
                    <OpeningOngoingContactsProvider>
                      <CustomLocationsProvider>
                        <AvailabilityProvider>
                          <EventRequestsProvider>
                            <RenewalsProvider>
                              <AccessRequestsProvider>
                                <ViewTrackingProvider>
    {children}

                                </ViewTrackingProvider>
                              </AccessRequestsProvider>
                            </RenewalsProvider>
                          </EventRequestsProvider>
                        </AvailabilityProvider>
                      </CustomLocationsProvider>
                    </OpeningOngoingContactsProvider>
                  </OpeningInfoProvider>
                </ScheduleProvider>
              </ChatProvider>
            </BrandAnnouncementsProvider>
          </AnnouncementsProvider>
        </SupportAnnouncementsProvider>
      </SupportRequestsProvider>
      </CategoryDriveLinksProvider>
      </ExecutiveNotesProvider>
      </WorkOrdersProvider>
      </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* HashRouter, not BrowserRouter — Electron loads from a local
          file:// path in production, and HashRouter is the one that
          works reliably there without extra server config. */}
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}
