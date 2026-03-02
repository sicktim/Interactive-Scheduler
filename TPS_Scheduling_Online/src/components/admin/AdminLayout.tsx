import { NavLink, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../shared/ThemeToggle/ThemeToggle';
import './AdminLayout.css';

const NAV_ITEMS = [
  { to: '/admin/aircraft', label: 'Aircraft' },
  { to: '/admin/personnel', label: 'Personnel' },
  { to: '/admin/curriculum', label: 'Curriculum' },
];

export function AdminLayout() {
  return (
    <div className="admin-root">
      <ThemeToggle />
      <header className="admin-header">
        <div className="admin-header-left">
          <a href="/scheduler" className="admin-back-link">&larr; Scheduler</a>
          <h1 className="admin-title">Database Admin</h1>
        </div>
        <nav className="admin-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `admin-tab${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
