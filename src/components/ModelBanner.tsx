import type { LoaderState } from '../hooks/useModelLoaderWithOverlay';
import { useModel } from '../context/ModelContext';

interface Props {
  state: LoaderState;
  progress: number;
  error: string | null;
  onLoad: () => void;
  label: string;
}

export function ModelBanner({ state, progress, error, onLoad, label }: Props) {
  const { backend } = useModel();

  if (state === 'ready') {
    return (
      <div className="model-banner model-banner-ready">
        <span>✅ {label} ready</span>
        <span className={`backend-badge ${backend === 'webgpu' ? 'badge-gpu' : 'badge-cpu'}`}>
          {backend === 'webgpu' ? '⚡ WebGPU' : '🐢 WASM (CPU — slower)'}
        </span>
      </div>
    );
  }

  const isLoading = state === 'downloading' || state === 'loading';

  return (
    <div className={`model-banner${isLoading ? ' shimmer-sweep' : ''}`}>
      {state === 'idle' && (
        <>
          <span>No {label} model loaded.</span>
          <button className="btn btn-sm btn-accent" onClick={onLoad}>
            ↓ Download &amp; Load
          </button>
        </>
      )}
      {state === 'downloading' && (
        <>
          <span style={{ color: '#b0b0b0' }}>
            Downloading {label}… {(progress * 100).toFixed(0)}%
          </span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      )}
      {state === 'loading' && (
        <span style={{ color: '#b0b0b0' }}>Loading {label} into engine…</span>
      )}
      {state === 'error' && (
        <>
          <span className="error-text">Error: {error}</span>
          <button className="btn btn-sm" onClick={onLoad}>Retry</button>
        </>
      )}
    </div>
  );
}
