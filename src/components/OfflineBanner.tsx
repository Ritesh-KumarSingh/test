import { useState } from 'react';

interface OfflineBannerProps {
  isVisible: boolean;
  onDismiss: () => void;
}

export function OfflineBanner({ isVisible, onDismiss }: OfflineBannerProps) {
  if (!isVisible) return null;

  return (
    <div className="offline-banner">
      <div className="offline-banner-content">
        <span className="offline-banner-text">
          ✈️ Simulating offline mode — AI still works.
        </span>
        <button 
          className="offline-banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss offline banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
