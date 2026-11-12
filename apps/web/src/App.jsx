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
import AdminSeo from './pages/AdminSeo.jsx';
import Settings from './pages/Settings.jsx';
import Corrections from './pages/Corrections.jsx';
import ForgotWorkplace from './pages/ForgotWorkplace.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import { Privacy, Terms } from './pages/Legal.jsx';
import EditAttendance from './pages/EditAttendance.jsx';
import Review from './pages/Review.jsx';
import Attend from './pages/Attend.jsx';
import Enrol from './pages/Enrol.jsx';
import Classes from './pages/Classes.jsx';
import ClassScreen from './pages/ClassScreen.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Billing from './pages/Billing.jsx';
import AdminWorkplaces from './pages/AdminWorkplaces.jsx';
import AdminBilling from './pages/AdminBilling.jsx';
import AdminWorkplace from './pages/AdminWorkplace.jsx';
import Students from './pages/Students.jsx';
import Landing from './pages/Landing.jsx';

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
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-workplace" element={<ForgotWorkplace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register" element={<RegisterOrg />} />
      <Route path="/attend/:sessionId" element={<Attend />} />
      <Route path="/enrol" element={<Enrol />} />
      <Route path="/kiosk/:orgSlug" element={<Kiosk />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<Home />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/classes/:id" element={<ClassScreen />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/students" element={<Students />} />
        <Route path="/me" element={<MyFingerprint />} />
        <Route path="/review" element={<Review />} />
        <Route path="/edit-attendance" element={<EditAttendance />} />
        <Route path="/corrections" element={<Corrections />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/admin/workplaces" element={<AdminWorkplaces />} />
        <Route path="/admin/billing" element={<AdminBilling />} />
        <Route path="/admin/workplaces/:id" element={<AdminWorkplace />} />
        <Route path="/admin/seo" element={<AdminSeo />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
