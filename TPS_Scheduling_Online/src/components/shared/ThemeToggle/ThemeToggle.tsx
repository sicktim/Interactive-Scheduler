import { useThemeContext } from '../../../context/ThemeContext';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { darkMode, toggleTheme } = useThemeContext();

  return (
    <div className="theme-toggle-container">
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? '\u2600' : '\u263D'}
      </button>
    </div>
  );
}
