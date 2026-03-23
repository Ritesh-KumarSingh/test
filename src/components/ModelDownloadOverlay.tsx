import { useState, useEffect } from 'react';
import { useModel } from '../context/ModelContext';

interface ModelDownloadOverlayProps {
  isVisible: boolean;
  progress: number;
  modelName: string;
  modelSize: string;
  onComplete: () => void;
}

export function ModelDownloadOverlay({
  isVisible,
  progress,
  modelName,
  modelSize,
  onComplete,
}: ModelDownloadOverlayProps) {
  const { backend } = useModel();
  const [phase, setPhase] = useState<'downloading' | 'success' | 'fadeout'>('downloading');

  useEffect(() => {
    if (progress >= 100 && phase === 'downloading') {
      setPhase('success');
      
      // Auto-fadeout after celebration
      const timer = setTimeout(() => {
        setPhase('fadeout');
        setTimeout(onComplete, 500); // Wait for fade animation
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [progress, phase, onComplete]);

  if (!isVisible && phase !== 'fadeout') return null;

  return (
    <div className={`model-download-overlay ${phase === 'fadeout' ? 'model-download-overlay-fadeout' : ''}`}>
      <div className="model-download-card">
        {/* Lock Icon */}
        <div className="model-download-icon">
          {phase === 'success' ? (
            <span className="model-download-checkmark">✓</span>
          ) : (
            <span className="model-download-lock">🔒</span>
          )}
        </div>

        {/* Heading */}
        <h2 className="model-download-heading">
          {phase === 'success' 
            ? 'Model ready — you are now fully offline'
            : 'Bringing the AI to you — not your data to the AI'
          }
        </h2>

        {/* Model Info */}
        <div className="model-download-info">
          <span className="model-download-name">{modelName}</span>
          <span className="model-download-divider">·</span>
          <span className="model-download-size">{modelSize}</span>
        </div>

        {/* Progress Bar */}
        <div className="model-download-progress-container">
          <div 
            className={`model-download-progress-bar ${phase === 'success' ? 'model-download-progress-success' : ''}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Percentage */}
        <div className="model-download-percentage">
          {phase === 'success' ? '100%' : `${Math.round(progress)}%`}
        </div>

        {/* Backend Info */}
        <div className={`model-download-backend ${backend === 'webgpu' ? 'backend-webgpu' : 'backend-wasm'}`}>
          {backend === 'webgpu' ? (
            <>
              <span className="backend-icon">⚡</span>
              <span>WebGPU acceleration enabled</span>
            </>
          ) : (
            <>
              <span className="backend-icon">⚙️</span>
              <span>Running on CPU via WASM</span>
            </>
          )}
        </div>

        {/* Footer Copy */}
        <div className="model-download-footer">
          {phase === 'success' 
            ? '🎉 Ready to use • No internet required'
            : 'Downloading once. Running forever. Offline.'
          }
        </div>
      </div>
    </div>
  );
}
