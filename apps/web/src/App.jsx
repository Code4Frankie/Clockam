import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { MANAGER_ROLES } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import RegisterOrg from './pages/RegisterOrg.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import Devices from './pages/Devices.jsx';
import Reports from './pages/Reports.jsx';
import MyFingerprint from './pages/MyFingerprint.jsx';
import Kiosk from './pages/Kiosk.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  return user ? children : <Navigate to="/login" replace />;
}

function Home() {
  const { user } = useAuth();
  return MANAGER_ROLES.includes(user.role) ? <Dashboard /> : <Navigate to="/me" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterOrg />} />
      <Route path="/kiosk/:orgSlug" element={<Kiosk />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Home />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/me" element={<MyFingerprint />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
