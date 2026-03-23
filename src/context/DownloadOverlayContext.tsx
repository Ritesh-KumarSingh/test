import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface DownloadOverlayContextType {
  isVisible: boolean;
  progress: number;
  modelName: string;
  modelSize: string;
  showOverlay: (modelName: string, modelSize: string) => void;
  updateProgress: (progress: number) => void;
  hideOverlay: () => void;
}

const DownloadOverlayContext = createContext<DownloadOverlayContextType | undefined>(undefined);

export function DownloadOverlayProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelName, setModelName] = useState('');
  const [modelSize, setModelSize] = useState('');

  const showOverlay = useCallback((name: string, size: string) => {
    setModelName(name);
    setModelSize(size);
    setProgress(0);
    setIsVisible(true);
  }, []);

  const updateProgress = useCallback((newProgress: number) => {
    setProgress(newProgress);
  }, []);

  const hideOverlay = useCallback(() => {
    setIsVisible(false);
    setProgress(0);
  }, []);

  return (
    <DownloadOverlayContext.Provider
      value={{
        isVisible,
        progress,
        modelName,
        modelSize,
        showOverlay,
        updateProgress,
        hideOverlay,
      }}
    >
      {children}
    </DownloadOverlayContext.Provider>
  );
}

export function useDownloadOverlay() {
  const context = useContext(DownloadOverlayContext);
  if (!context) {
    throw new Error('useDownloadOverlay must be used within DownloadOverlayProvider');
  }
  return context;
}
