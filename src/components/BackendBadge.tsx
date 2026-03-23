import { useState } from 'react';
import { useModel } from '../context/ModelContext';

export function BackendBadge() {
  const { backend, modelLoaded, inferenceActive, tokensPerSecond } = useModel();
  const [showTooltip, setShowTooltip] = useState(false);

  const getState = () => {
    if (!modelLoaded) return 'no-model';
    return backend;
  };

  const state = getState();

  const getLabel = () => {
    if (state === 'no-model') return 'NO MODEL';
    if (state === 'webgpu') return 'WEBGPU';
    return 'WASM';
  };

  const getDotClass = () => {
    if (state === 'no-model') return 'backend-dot backend-dot-grey';
    if (state === 'webgpu') {
      return `backend-dot backend-dot-green ${inferenceActive ? 'backend-dot-pulsing' : ''}`;
    }
    return `backend-dot backend-dot-amber ${inferenceActive ? 'backend-dot-pulsing' : ''}`;
  };

  const getBadgeClass = () => {
    if (state === 'no-model') return 'backend-badge backend-badge-grey';
    if (state === 'webgpu') return 'backend-badge backend-badge-green';
    return 'backend-badge backend-badge-amber';
  };

  return (
    <div 
      className="backend-badge-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={getBadgeClass()}>
        <span className={getDotClass()} />
        <span className="backend-label">{getLabel()}</span>
        {inferenceActive && tokensPerSecond > 0 && (
          <>
            <span className="backend-divider">·</span>
            <span className="backend-tps">{tokensPerSecond} tok/s</span>
          </>
        )}
      </div>

      {showTooltip && (
        <div className="backend-tooltip">
          <div className="backend-tooltip-line">
            {state === 'webgpu' && 'Backend: WebGPU (GPU-accelerated)'}
            {state === 'wasm' && 'Backend: WASM (CPU)'}
            {state === 'no-model' && 'Backend: No model loaded'}
          </div>
          <div className="backend-tooltip-line">
            Model: LFM2 350M Q4_K_M
          </div>
          <div className="backend-tooltip-line">
            Loaded from: OPFS cache
          </div>
        </div>
      )}
    </div>
  );
}
