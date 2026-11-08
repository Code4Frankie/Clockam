import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MANAGER_ROLES } from '../api.js';
import Logo from './Logo.jsx';
import AssistantChat from './AssistantChat.jsx';

export default function Layout() {
  const { user, organization, logout } = useAuth();
  const isManager = MANAGER_ROLES.includes(user.role);
  const isAdmin = ['owner', 'admin'].includes(user.role);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo size={110} />
        <nav>
          {isManager && <NavLink to="/dashboard" end>Dashboard</NavLink>}
          {isManager && <NavLink to="/employees">Employees</NavLink>}
          {isAdmin && <NavLink to="/devices">Scanners</NavLink>}
          {isManager && <NavLink to="/reports">Reports</NavLink>}
          {isAdmin && <NavLink to="/edit-attendance">Edit attendance</NavLink>}
          {isAdmin && <NavLink to="/corrections">Missed clock-outs</NavLink>}
          {isAdmin && <NavLink to="/settings">Work hours &amp; location</NavLink>}
          <NavLink to="/me">My fingerprint</NavLink>
          {user.isPlatformAdmin && <NavLink to="/admin/seo">Site audit</NavLink>}
          <a href={`/kiosk/${organization?.slug}`} target="_blank" rel="noreferrer">Open kiosk ↗</a>
        </nav>
        <div className="sidebar-foot">
          <strong>{user.name}</strong>
          <span>{organization?.name} · {user.role}</span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
      <AssistantChat />
    </div>
  );
}
