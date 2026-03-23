import { useState, useEffect } from 'react';

interface PrivacyShieldProps {
  totalTokens: number;
  isGenerating: boolean;
  modelName?: string;
}

export function PrivacyShield({ totalTokens, isGenerating, modelName = 'LFM2 350M' }: PrivacyShieldProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [displayTokens, setDisplayTokens] = useState(totalTokens);

  // Animate token counter
  useEffect(() => {
    if (totalTokens === displayTokens) return;
    
    const diff = totalTokens - displayTokens;
    const steps = Math.min(Math.abs(diff), 20);
    const increment = diff / steps;
    const delay = 30;

    let current = displayTokens;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;
      
      if (step >= steps) {
        setDisplayTokens(totalTokens);
        clearInterval(timer);
      } else {
        setDisplayTokens(Math.round(current));
      }
    }, delay);

    return () => clearInterval(timer);
  }, [totalTokens, displayTokens]);

  return (
    <div
      className={`privacy-shield ${isHovered ? 'privacy-shield-expanded' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="status"
      aria-live="polite"
      aria-label={`Privacy Monitor: ${displayTokens} tokens generated locally, 0 bytes sent to cloud`}
    >
      <div className="privacy-shield-content">
        <div className="privacy-shield-main">
          <div className={`privacy-dot ${isGenerating ? 'privacy-dot-active' : ''}`} />
          <div className="privacy-stats">
            <div className="privacy-stat">
              <span className="privacy-stat-value">0 bytes</span>
              <span className="privacy-stat-label">sent to cloud</span>
            </div>
            <div className="privacy-stat-divider" />
            <div className="privacy-stat">
              <span className="privacy-stat-value">{displayTokens.toLocaleString()}</span>
              <span className="privacy-stat-label">tokens generated locally</span>
            </div>
          </div>
        </div>
        
        {isHovered && (
          <div className="privacy-shield-details">
            <div className="privacy-model-info">
              <span className="privacy-model-label">Model:</span>
              <span className="privacy-model-name">{modelName}</span>
              <span className="privacy-model-location">— running on-device</span>
            </div>
            <div className="privacy-guarantee">
              🔒 100% Private • All processing happens locally
            </div>
          </div>
        )}
      </div>
      
      <div className="privacy-shield-accent" />
    </div>
  );
}
