import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MANAGER_ROLES, api } from '../api.js';
import Logo from './Logo.jsx';
import AssistantChat from './AssistantChat.jsx';

export default function Layout() {
  const { user, organization, logout } = useAuth();
  const isManager = MANAGER_ROLES.includes(user.role);
  const isAdmin = ['owner', 'admin'].includes(user.role);
  const [bill, setBill] = useState(null);
  useEffect(() => { if (isAdmin) api('/billing/status').then((d) => setBill(d.state)).catch(() => {}); }, [isAdmin]);
  const billMsg = !bill ? '' : bill.status === 'overdue' ? 'Your ClockAm subscription has expired. Pay under Billing to keep admin pages working. Clock-in is not affected.' : bill.status === 'grace' ? 'Your ClockAm payment is due.' : bill.status === 'trial' && bill.daysLeft <= 3 ? `Your free trial ends in ${bill.daysLeft} ${bill.daysLeft === 1 ? 'day' : 'days'}.` : '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo size={110} />
        <nav>
          {isManager && <NavLink to="/dashboard" end>Dashboard</NavLink>}
          {isManager && <NavLink to="/employees">{organization?.type === 'workplace' || !organization?.type ? 'Employees' : 'Staff'}</NavLink>}
          {isManager && organization?.type === 'school' && <NavLink to="/classes">Classes</NavLink>}
          {isManager && organization?.type === 'school' && <NavLink to="/courses">Courses</NavLink>}
          {isAdmin && organization?.type === 'school' && <NavLink to="/students">Students</NavLink>}
          {isAdmin && <NavLink to="/devices">Scanners</NavLink>}
          {isManager && <NavLink to="/reports">Reports</NavLink>}
          {isManager && <NavLink to="/review">To review</NavLink>}
          {isAdmin && <NavLink to="/edit-attendance">Edit attendance</NavLink>}
          {isAdmin && <NavLink to="/corrections">Missed clock-outs</NavLink>}
          {isAdmin && <NavLink to="/settings">{organization?.type === 'school' ? 'Settings' : 'Work hours & location'}</NavLink>}
          {isAdmin && <NavLink to="/billing">Billing</NavLink>}
          <NavLink to="/me">My fingerprint</NavLink>
          {user.isPlatformAdmin && <NavLink to="/admin/billing">Plans and prices</NavLink>}
          {user.isPlatformAdmin && <NavLink to="/admin/seo">Site audit</NavLink>}
          <a href={`/kiosk/${organization?.slug}`} target="_blank" rel="noreferrer">Open kiosk ↗</a>
        </nav>
        <div className="sidebar-foot">
          <strong>{user.name}</strong>
          <span>{organization?.name} · {user.role}</span>
          <span title="People sign in with this">Workplace ID: <strong>{organization?.slug}</strong></span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        {billMsg && <p className="warn">{billMsg} <Link to="/billing">Open Billing</Link></p>}
        <Outlet />
      </main>
      <AssistantChat />
    </div>
  );
}
