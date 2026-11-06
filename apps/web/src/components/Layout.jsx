import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MANAGER_ROLES } from '../api.js';
import Logo from './Logo.jsx';

export default function Layout() {
  const { user, organization, logout } = useAuth();
  const isManager = MANAGER_ROLES.includes(user.role);
  const isAdmin = ['owner', 'admin'].includes(user.role);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo size={110} />
        <nav>
          {isManager && <NavLink to="/" end>Dashboard</NavLink>}
          {isManager && <NavLink to="/employees">Employees</NavLink>}
          {isAdmin && <NavLink to="/devices">Scanners</NavLink>}
          {isManager && <NavLink to="/reports">Reports</NavLink>}
          <NavLink to="/me">My fingerprint</NavLink>
          <a href={`/kiosk/${organization?.slug}`} target="_blank" rel="noreferrer">Open kiosk ↗</a>
        </nav>
        <div className="sidebar-foot">
          <strong>{user.name}</strong>
          <span>{organization?.name} · {user.role}</span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
