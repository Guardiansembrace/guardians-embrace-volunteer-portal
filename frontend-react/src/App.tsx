import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import type { AdminAccessScope } from './lib/api';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './lib/useAuth';
import { GOOGLE_CLIENT_ID } from './lib/config';

// Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SetNamePage = lazy(() => import('./pages/SetNamePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'));
const NewSubmissionPage = lazy(() => import('./pages/NewSubmissionPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminSubmissionsPage = lazy(() => import('./pages/AdminSubmissionsPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const CrmPage = lazy(() => import('./features/crm/CrmPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));

function RouteLoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  );
}

// Protected Route wrapper — also gates on profile completion
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsName } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (needsName) return <Navigate to="/set-name" />;

  return <>{children}</>;
}

// Admin Portal Route wrapper
function AdminPortalRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, canAccessAdminPortal, isLoading, needsName } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (needsName) return <Navigate to="/set-name" />;
  if (!canAccessAdminPortal) return <Navigate to="/dashboard" />;

  return <>{children}</>;
}

function AdminScopeRoute({ children, scopes }: { children: React.ReactNode; scopes: AdminAccessScope[] }) {
  const { isAuthenticated, isAdmin, hasAdminScope, canAccessAdminPortal, isLoading, needsName } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (needsName) return <Navigate to="/set-name" />;
  if (!canAccessAdminPortal) return <Navigate to="/dashboard" />;
  if (!isAdmin && !scopes.some((scope) => hasAdminScope(scope))) return <Navigate to="/admin" />;

  return <>{children}</>;
}

// Set-Name Route — only for authenticated users who haven't set their name yet
function SetNameRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsName } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!needsName) return <Navigate to="/dashboard" />;

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/set-name" element={<SetNameRoute><SetNamePage /></SetNameRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/submissions" element={<ProtectedRoute><SubmissionsPage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
        <Route path="/crm" element={<AdminScopeRoute scopes={['manage_crm']}><CrmPage /></AdminScopeRoute>} />
        <Route path="/guide" element={<ProtectedRoute><GuidePage /></ProtectedRoute>} />
        <Route path="/submissions/new" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />
        <Route path="/submissions/:id" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />

        <Route path="/admin" element={<AdminPortalRoute><AdminDashboardPage /></AdminPortalRoute>} />
        <Route
          path="/admin/users"
          element={
            <AdminScopeRoute scopes={['view_users', 'edit_users', 'manage_user_status', 'manage_user_roles', 'manage_invites', 'view_admin_access', 'manage_admin_access']}>
              <AdminUsersPage />
            </AdminScopeRoute>
          }
        />
        <Route path="/admin/submissions" element={<AdminScopeRoute scopes={['review_submissions']}><AdminSubmissionsPage /></AdminScopeRoute>} />
        <Route path="/admin/settings" element={<AdminScopeRoute scopes={['manage_settings']}><AdminSettingsPage /></AdminScopeRoute>} />
        <Route path="/admin/audit" element={<AdminScopeRoute scopes={['view_audit_logs']}><AdminAuditPage /></AdminScopeRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
