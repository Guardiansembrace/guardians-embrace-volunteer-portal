import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { GOOGLE_CLIENT_ID } from './lib/config';

// Pages
import LoginPage from './pages/LoginPage';
import SetNamePage from './pages/SetNamePage';
import DashboardPage from './pages/DashboardPage';
import SubmissionsPage from './pages/SubmissionsPage';
import NewSubmissionPage from './pages/NewSubmissionPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSubmissionsPage from './pages/AdminSubmissionsPage';

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

// Admin Route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading, needsName } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (needsName) return <Navigate to="/set-name" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;

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
      <Route path="/submissions/new" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />
      <Route path="/submissions/:id" element={<ProtectedRoute><NewSubmissionPage /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<Navigate to="/admin/users" />} />
      <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
      <Route path="/admin/submissions" element={<AdminRoute><AdminSubmissionsPage /></AdminRoute>} />

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
