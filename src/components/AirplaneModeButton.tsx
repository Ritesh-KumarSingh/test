import { useState, useEffect } from 'react';

// Store the original fetch function
let _originalFetch: typeof window.fetch | null = null;

interface AirplaneModeButtonProps {
  onOfflineChange: (isOffline: boolean) => void;
}

export function AirplaneModeButton({ onOfflineChange }: AirplaneModeButtonProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Save the original fetch on mount
    if (!_originalFetch) {
      _originalFetch = window.fetch;
    }
  }, []);

  const toggleOfflineMode = () => {
    if (!isOffline) {
      // Going offline - intercept fetch calls
      window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        
        // Allow localhost, blob:, opfs:, and data: URLs
        if (
          url.startsWith('http://localhost') ||
          url.startsWith('http://127.0.0.1') ||
          url.startsWith('blob:') ||
          url.startsWith('opfs:') ||
          url.startsWith('data:')
        ) {
          return _originalFetch!(input, init);
        }
        
        // Reject all other network requests
        return Promise.reject(new Error('Network request blocked: Airplane mode is active'));
      };
      
      setIsOffline(true);
      onOfflineChange(true);
    } else {
      // Going back online - restore original fetch
      if (_originalFetch) {
        window.fetch = _originalFetch;
      }
      
      setIsOffline(false);
      onOfflineChange(false);
    }
  };

  return (
    <div 
      className="airplane-mode-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        className={`airplane-mode-button ${isOffline ? 'offline' : 'online'}`}
        onClick={toggleOfflineMode}
        aria-label={isOffline ? 'Back online' : 'Go offline'}
      >
        ✈️ {isOffline ? 'Back online' : 'Go offline'}
      </button>

      {showTooltip && (
        <div className="airplane-mode-tooltip">
          {isOffline 
            ? 'Click to restore network (demo)' 
            : 'Demo: Block network, AI still works'}
        </div>
      )}
    </div>
  );
}
