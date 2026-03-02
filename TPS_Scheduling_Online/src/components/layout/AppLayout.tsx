import { Outlet } from 'react-router-dom';
import { ThemeToggle } from '../shared/ThemeToggle/ThemeToggle';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-root">
      <ThemeToggle />
      <Outlet />
    </div>
  );
}
