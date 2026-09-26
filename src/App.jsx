import React from 'react';
import { HashRouter, BrowserRouter, Routes, Route, Navigate , useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { hasFeature } from './data/mockData';
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
import { ExpensesProvider } from './context/ExpensesContext';
import { BudgetTargetsProvider } from './context/BudgetTargetsContext';
import { IntegrationRequestsProvider } from './context/IntegrationRequestsContext';
import { OpeningInfoProvider } from './context/OpeningInfoContext';
import { OpeningOngoingContactsProvider } from './context/OpeningOngoingContactsContext';
import { ExecutiveNotesProvider } from './context/ExecutiveNotesContext';
import { WorkOrdersProvider } from './context/WorkOrdersContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
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
import IntegrationRequestsScreen from './screens/IntegrationRequestsScreen';
import OpeningSoonScreen from './screens/OpeningSoonScreen';
import WaresInventoryScreen from './screens/WaresInventoryScreen';
import { UnderRepairGate } from './components/UnderRepair';
import { AccessPresetsProvider } from './context/AccessPresetsContext';
import { OffboardingProvider } from './context/OffboardingContext';
import OffboardingScreen from './screens/OffboardingScreen';
import OpeningChecklistScreen from './screens/OpeningChecklistScreen';
import OperationalPOCScreen from './screens/OperationalPOCScreen';
import IntegrationsScreen from './screens/IntegrationsScreen';
import ExecutiveNotesScreen from './screens/ExecutiveNotesScreen';
import WorkOrdersScreen from './screens/WorkOrdersScreen';
import ResetAppDataScreen from './screens/ResetAppDataScreen';
import ExpensesScreen from './screens/ExpensesScreen';

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
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  return (
    <Providers>
    <AppLayout>
      <UnderRepairGate>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/brand/:brandId" element={<RequireBrand><BrandScreen /></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId" element={<RequireBrand><LocationScreen /></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId/event-requests" element={<RequireBrand><RequireFeature feature="eventRequests"><EventRequestsScreen /></RequireFeature></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId/renewals" element={<RequireBrand><RequireFeature feature="renewals"><RenewalsScreen /></RequireFeature></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId/category/:categoryId" element={<RequireCategory><CategoryDetailScreen /></RequireCategory>} />
        <Route
          path="/brand/:brandId/location/:locationId/category/:categoryId/announcements"
          element={<AnnouncementsScreen />}
        />
        <Route path="/announcements/new" element={<RequireReviewer><HomeAnnouncementsScreen /></RequireReviewer>} />
        <Route path="/messages" element={<MessagesScreen />} />
        <Route path="/calendar" element={<CalendarScreen />} />
        <Route path="/directory" element={<DirectoryScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/availability" element={<RequireFeature feature="availability"><AvailabilityScreen /></RequireFeature>} />
        <Route path="/admin/users" element={<AdminUsersScreen />} />
        <Route path="/admin/offboarding" element={<RequireReviewer><OffboardingScreen /></RequireReviewer>} />
        <Route path="/admin/pending-requests" element={<PendingRequestsScreen />} />
        <Route path="/brand/:brandId/location/:locationId/opening-checklist" element={<RequireBrand><RequireFeature feature="openingChecklist"><OpeningChecklistScreen /></RequireFeature></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId/operational-poc" element={<RequireBrand><RequireFeature feature="operationalPoc"><OperationalPOCScreen /></RequireFeature></RequireBrand>} />
        <Route path="/brand/:brandId/location/:locationId/integrations" element={<RequireBrand><RequireFeature feature="integrations"><IntegrationsScreen /></RequireFeature></RequireBrand>} />
        <Route path="/support" element={<RequireFeature feature="support"><SupportScreen /></RequireFeature>} />
        <Route path="/integration-requests" element={<IntegrationRequestsScreen />} />
        <Route path="/opening-soon" element={<OpeningSoonScreen />} />
        <Route path="/wares-inventory" element={<WaresInventoryScreen />} />
        <Route path="/executive-notes" element={<ExecutiveNotesScreen />} />
        <Route path="/work-orders" element={<RequireFeature feature="workOrders"><WorkOrdersScreen /></RequireFeature>} />
        <Route path="/expenses" element={<RequireFeature feature="expenses"><ExpensesScreen /></RequireFeature>} />
        <Route path="/reset-app-data" element={<ResetAppDataScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </UnderRepairGate>
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
      {/* Reads role and job to decide whether this account sees everyone's
          receipts or only its own, so it sits inside AuthProvider. */}
      <IntegrationRequestsProvider>
      <OffboardingProvider>
      <AccessPresetsProvider>
      <BudgetTargetsProvider>
      <ExpensesProvider>
      <CategoryDriveLinksProvider>
      <SupportRequestsProvider>
        <SupportAnnouncementsProvider>
          <AnnouncementsProvider>
            <BrandAnnouncementsProvider>
              <ChatProvider>
                <ScheduleProvider>
                  <OpeningInfoProvider>
                    <CustomLocationsProvider>
                      <OpeningOngoingContactsProvider>
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
                      </OpeningOngoingContactsProvider>
                    </CustomLocationsProvider>
                  </OpeningInfoProvider>
                </ScheduleProvider>
              </ChatProvider>
            </BrandAnnouncementsProvider>
          </AnnouncementsProvider>
        </SupportAnnouncementsProvider>
      </SupportRequestsProvider>
      </CategoryDriveLinksProvider>
      </ExpensesProvider>
      </BudgetTargetsProvider>
      </AccessPresetsProvider>
      </OffboardingProvider>
      </IntegrationRequestsProvider>
      </ExecutiveNotesProvider>
      </WorkOrdersProvider>
      </ThemeProvider>
  );
}



// Executives and admins only - posting announcements. The Directory tile was
// hidden from everyone else, but the address itself was not.
function RequireReviewer({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'executive') return <Navigate to="/" replace />;
  return children;
}

// A restaurant's own page checks the brand. Anything under a location checks
// that location as well, so a Ridgeland-only manager cannot reach Starkville
// by typing the address.
function RequireBrand({ children }) {
  const { user, hasBrandAccess, hasLocationAccess } = useAuth();
  const { brandId, locationId } = useParams();
  if (!hasBrandAccess(user, brandId)) return <Navigate to="/" replace />;
  if (locationId && !hasLocationAccess(user, brandId, locationId)) return <Navigate to={'/brand/' + brandId} replace />;
  return children;
}

function RequireCategory({ children }) {
  const { user, hasBrandAccess, hasLocationAccess, hasCategoryAccess } = useAuth();
  const { brandId, locationId, categoryId } = useParams();
  if (!hasBrandAccess(user, brandId)) return <Navigate to="/" replace />;
  if (!hasLocationAccess(user, brandId, locationId)) return <Navigate to={'/brand/' + brandId} replace />;
  if (!hasCategoryAccess(user, categoryId)) return <Navigate to="/" replace />;
  return children;
}

function RequireFeature({ feature, children }) {
  const { user } = useAuth();
  if (!hasFeature(user, feature)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
  return (
    <AuthProvider>
      {/* Packaged Electron loads from file://, where BrowserRouter can't
          resolve paths — hence HashRouter there. Everywhere else (the web
          build, and Electron in dev against the Vite server) has a real
          origin and a history fallback, so BrowserRouter gives clean,
          shareable URLs instead of /#/messages. */}
      <Router>
        <Gate />
      </Router>
    </AuthProvider>
  );
}
