import { useState, useCallback, useRef, useEffect } from 'react';
import { ModelManager, ModelCategory, EventBus } from '@runanywhere/web';
import { useDownloadOverlay } from '../context/DownloadOverlayContext';
import { useModel } from '../context/ModelContext';

export type LoaderState = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

interface ModelLoaderResult {
  state: LoaderState;
  progress: number;
  error: string | null;
  ensure: () => Promise<boolean>;
}

/**
 * Enhanced hook to download + load models with cinematic overlay.
 * Tracks download progress and loading state.
 *
 * @param category - Which model category to ensure is loaded.
 * @param coexist  - If true, only unload same-category models.
 */
export function useModelLoaderWithOverlay(category: ModelCategory, coexist = false): ModelLoaderResult {
  const [state, setState] = useState<LoaderState>(() =>
    ModelManager.getLoadedModel(category) ? 'ready' : 'idle',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const { showOverlay, updateProgress, hideOverlay } = useDownloadOverlay();
  const { setModelLoaded } = useModel();

  // Update overlay progress when local progress changes
  useEffect(() => {
    if (state === 'downloading') {
      updateProgress(progress * 100);
    }
  }, [progress, state, updateProgress]);

  const ensure = useCallback(async (): Promise<boolean> => {
    // Already loaded
    if (ModelManager.getLoadedModel(category)) {
      setState('ready');
      setModelLoaded(true);
      return true;
    }

    if (loadingRef.current) return false;
    loadingRef.current = true;

    try {
      // Find a model for this category
      const models = ModelManager.getModels().filter((m) => m.modality === category);
      if (models.length === 0) {
        setError(`No ${category} model registered`);
        setState('error');
        return false;
      }

      const model = models[0];
      
      // Calculate model size for display
      const sizeInMB = model.sizeBytes ? Math.round(model.sizeBytes / 1024 / 1024) : 234;
      const modelDisplayName = model.id.includes('350M') ? 'LFM2 350M' : 
                               model.id.includes('1.5B') ? 'LFM2 1.5B' : 
                               'LFM2 350M';

      // Download if needed
      if (model.status !== 'downloaded' && model.status !== 'loaded') {
        // Show cinematic overlay
        showOverlay(modelDisplayName, `${sizeInMB} MB`);
        setState('downloading');
        setProgress(0);

        const unsub = EventBus.shared.on('model.downloadProgress', (evt) => {
          if (evt.modelId === model.id) {
            const progressValue = evt.progress ?? 0;
            setProgress(progressValue);
          }
        });

        await ModelManager.downloadModel(model.id);
        unsub();
        setProgress(1);
        updateProgress(100);
      }

      // Load
      setState('loading');
      const ok = await ModelManager.loadModel(model.id, { coexist });
      if (ok) {
        setState('ready');
        setModelLoaded(true);
        
        // Overlay will auto-hide after celebration
        setTimeout(hideOverlay, 2500);
        
        return true;
      } else {
        setError('Failed to load model');
        setState('error');
        hideOverlay();
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
      hideOverlay();
      return false;
    } finally {
      loadingRef.current = false;
    }
  }, [category, coexist, showOverlay, updateProgress, hideOverlay, setModelLoaded]);

  return { state, progress, error, ensure };
}
