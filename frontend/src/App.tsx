import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/Spinner';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';

export default function App() {
  const { user, isInitialising } = useAuth();

  if (isInitialising) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }

  // Routes for unauthenticated users
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Routes for authenticated users
  return (
    <AppLayout>
      <Routes>
        {/* Redirect authenticated users from home to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/orders/new" element={<NewOrderPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
  );
}