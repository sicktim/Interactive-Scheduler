import { useEffect } from 'react';

/**
 * Keyboard shortcut hook for Escape key handler.
 *
 * Registers a `keydown` listener on the window that fires the
 * provided callback when the Escape key is pressed. Cleans up
 * on unmount.
 *
 * @param key - The keyboard key to listen for (default: 'Escape')
 * @param callback - The function to call when the key is pressed
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === key) callback();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, callback]);
}
