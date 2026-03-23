import { useState, useEffect } from 'react';

const HINT_STORAGE_KEY = 'shortcuts-hint-shown';

export function ShortcutsHintToast() {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Check if the hint has been shown before
    const hasShown = localStorage.getItem(HINT_STORAGE_KEY);
    
    if (!hasShown) {
      // Show toast after 3 seconds
      const showTimer = setTimeout(() => {
        setVisible(true);
      }, 3000);

      // Start fade out after 7 seconds (3s delay + 4s visible)
      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
      }, 7000);

      // Remove toast and set localStorage after 7.3 seconds (3s + 4s + 0.3s fade)
      const hideTimer = setTimeout(() => {
        setVisible(false);
        localStorage.setItem(HINT_STORAGE_KEY, 'true');
      }, 7300);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, []);

  if (!visible) return null;

  return (
    <div className={`shortcuts-hint-toast ${fadeOut ? 'fade-out' : ''}`}>
      Press <kbd>?</kbd> to see keyboard shortcuts
    </div>
  );
}
