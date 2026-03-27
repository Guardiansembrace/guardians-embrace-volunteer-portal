import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import type { AdminAccessScope } from './lib/api';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './lib/useAuth';
import { GOOGLE_CLIENT_ID } from './lib/config';

// Pages
import LoginPage from './pages/LoginPage';
import SetNamePage from './pages/SetNamePage';
import DashboardPage from './pages/DashboardPage';
import SubmissionsPage from './pages/SubmissionsPage';
import NewSubmissionPage from './pages/NewSubmissionPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSubmissionsPage from './pages/AdminSubmissionsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminAuditPage from './pages/AdminAuditPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/set-name" element={<SetNameRoute><SetNamePage /></SetNameRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/submissions" element={<ProtectedRoute><SubmissionsPage /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
      <Route path="/submissions/new" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />
      <Route path="/submissions/:id" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />

      <Route path="/admin" element={<AdminPortalRoute><AdminDashboardPage /></AdminPortalRoute>} />
      <Route path="/admin/users" element={<AdminScopeRoute scopes={['view_users', 'manage_users', 'manage_invites']}><AdminUsersPage /></AdminScopeRoute>} />
      <Route path="/admin/submissions" element={<AdminScopeRoute scopes={['review_submissions']}><AdminSubmissionsPage /></AdminScopeRoute>} />
      <Route path="/admin/settings" element={<AdminScopeRoute scopes={['manage_settings']}><AdminSettingsPage /></AdminScopeRoute>} />
      <Route path="/admin/audit" element={<AdminScopeRoute scopes={['view_audit_logs']}><AdminAuditPage /></AdminScopeRoute>} />

      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
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
