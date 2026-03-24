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
 *
 * Performance tuning:
 * - nCtx: 512  → smaller context window = fewer KV-cache ops per token = faster
 * - nBatch: 512 → larger prompt batch = faster prompt ingestion
 * - nGl: 99    → offload all layers to GPU when WebGPU is active
 * - nThreads: 4 → explicit thread count avoids over-subscription on 4-core devices
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

  // Sync overlay progress while downloading
  useEffect(() => {
    if (state === 'downloading') {
      updateProgress(progress * 100);
    }
  }, [progress, state, updateProgress]);

  const ensure = useCallback(async (): Promise<boolean> => {
    if (ModelManager.getLoadedModel(category)) {
      setState('ready');
      setModelLoaded(true);
      return true;
    }

    if (loadingRef.current) return false;
    loadingRef.current = true;

    try {
      const models = ModelManager.getModels().filter((m) => m.modality === category);
      if (models.length === 0) {
        setError(`No ${category} model registered`);
        setState('error');
        return false;
      }

      const model = models[0];
      const sizeInMB = model.sizeBytes ? Math.round(model.sizeBytes / 1024 / 1024) : 234;
      const modelDisplayName = model.id.includes('350M') ? 'LFM2 350M'
        : model.id.includes('1.5B') ? 'LFM2 1.5B'
        : 'LFM2 350M';

      // ── Download phase ────────────────────────────────────────────────────
      if (model.status !== 'downloaded' && model.status !== 'loaded') {
        showOverlay(modelDisplayName, `${sizeInMB} MB`);
        setState('downloading');
        setProgress(0);

        const unsub = EventBus.shared.on('model.downloadProgress', (evt) => {
          if (evt.modelId === model.id) {
            setProgress(evt.progress ?? 0);
          }
        });

        await ModelManager.downloadModel(model.id);
        unsub();
        setProgress(1);
        updateProgress(100);
      }

      // ── Load phase — KEY PERFORMANCE PARAMS ───────────────────────────────
      setState('loading');
      const ok = await ModelManager.loadModel(model.id, {
        coexist,
        /**
         * nCtx: Context window size in tokens.
         * Smaller = faster per-token generation (linear KV-cache cost).
         * 512 is enough for all Dev/Research prompts in this app.
         * Increase to 2048 if you start seeing truncation errors.
         */
        nCtx: 512,
        /**
         * nBatch: Prompt processing batch size.
         * Higher = faster prompt ingestion (parallelised on GPU/SIMD).
         * 512 is a sweet spot; diminishing returns above 1024.
         */
        nBatch: 512,
        /**
         * nGl: Number of transformer layers to offload to GPU.
         * 99 = "offload everything" — the SDK clips to actual layer count.
         * This is what actually gets you WebGPU speed.
         * Has no effect when running on CPU-WASM.
         */
        nGl: 99,
        /**
         * nThreads: CPU thread count for WASM fallback path.
         * Default (0) = auto, which sometimes over-subscribes cores.
         * 4 is safe for most laptops and avoids scheduling thrash.
         */
        nThreads: 4,
      } as any);

      if (ok) {
        setState('ready');
        setModelLoaded(true);
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