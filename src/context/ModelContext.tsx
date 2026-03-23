import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

type Backend = 'webgpu' | 'wasm';

interface ModelContextType {
  backend: Backend;
  modelLoaded: boolean;
  tokensGenerated: number;
  inferenceActive: boolean;
  inferenceStartTime: number | null;
  tokensPerSecond: number;
  setModelLoaded: (loaded: boolean) => void;
  setInferenceActive: (active: boolean) => void;
  incrementTokens: (count: number) => void;
  resetInference: () => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend>('wasm');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [tokensGenerated, setTokensGenerated] = useState(0);
  const [inferenceActive, setInferenceActiveState] = useState(false);
  const [inferenceStartTime, setInferenceStartTime] = useState<number | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);

  // ── Refs so the interval closure never goes stale ─────────────────────────
  // Using refs avoids including fast-changing values in the effect dependency
  // array, which would tear down and recreate the interval on every token —
  // causing the "Maximum update depth exceeded" crash.
  const tokensRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const inferenceActiveRef = useRef(false);

  // Keep refs in sync with state (no extra renders)
  useEffect(() => { tokensRef.current = tokensGenerated; }, [tokensGenerated]);
  useEffect(() => { startTimeRef.current = inferenceStartTime; }, [inferenceStartTime]);
  useEffect(() => { inferenceActiveRef.current = inferenceActive; }, [inferenceActive]);

  // Detect WebGPU support on mount
  useEffect(() => {
    const detectBackend = async () => {
      if ('gpu' in navigator) {
        try {
          const gpu = (navigator as any).gpu;
          const adapter = await gpu.requestAdapter();
          if (adapter) {
            setBackend('webgpu');
            console.log('✅ WebGPU acceleration enabled');
            return;
          }
        } catch (err) {
          console.warn('WebGPU detection failed:', err);
        }
      }
      setBackend('wasm');
      console.log('⚙️ Running on CPU via WASM');
    };
    detectBackend();
  }, []);

  // ── Calculate tok/s every 500ms — uses refs, never re-subscribes ──────────
  // Dependency array only contains `inferenceActive` (a boolean that changes
  // infrequently), NOT `tokensGenerated` (which changes every token).
  useEffect(() => {
    if (!inferenceActive) {
      setTokensPerSecond(0);
      return;
    }

    const interval = setInterval(() => {
      const start = startTimeRef.current;
      if (!start || !inferenceActiveRef.current) return;
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed > 0 && tokensRef.current > 0) {
        setTokensPerSecond(Math.round(tokensRef.current / elapsed));
      }
    }, 500);

    return () => clearInterval(interval);
  }, [inferenceActive]); // ← only boolean, stable dependency

  const incrementTokens = useCallback((count: number) => {
    setTokensGenerated(prev => prev + count);
  }, []);

  const setInferenceActive = useCallback((active: boolean) => {
    setInferenceActiveState(active);
    if (active) {
      setInferenceStartTime(prev => prev ?? Date.now());
    } else {
      setInferenceStartTime(null);
    }
  }, []);

  const resetInference = useCallback(() => {
    setTokensGenerated(0);
    tokensRef.current = 0;
    setInferenceStartTime(null);
    startTimeRef.current = null;
    setTokensPerSecond(0);
  }, []);

  return (
    <ModelContext.Provider
      value={{
        backend,
        modelLoaded,
        tokensGenerated,
        inferenceActive,
        inferenceStartTime,
        tokensPerSecond,
        setModelLoaded,
        setInferenceActive,
        incrementTokens,
        resetInference,
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}

export function useModel() {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error('useModel must be used within ModelProvider');
  }
  return context;
}
