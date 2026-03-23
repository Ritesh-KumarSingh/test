import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PrivacyMonitorContextType {
  totalTokens: number;
  isGenerating: boolean;
  incrementTokens: (count: number) => void;
  setGenerating: (generating: boolean) => void;
  resetTokens: () => void;
}

const PrivacyMonitorContext = createContext<PrivacyMonitorContextType | undefined>(undefined);

export function PrivacyMonitorProvider({ children }: { children: ReactNode }) {
  const [totalTokens, setTotalTokens] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const incrementTokens = useCallback((count: number) => {
    setTotalTokens(prev => prev + count);
  }, []);

  const setGenerating = useCallback((generating: boolean) => {
    setIsGenerating(generating);
  }, []);

  const resetTokens = useCallback(() => {
    setTotalTokens(0);
  }, []);

  return (
    <PrivacyMonitorContext.Provider
      value={{
        totalTokens,
        isGenerating,
        incrementTokens,
        setGenerating,
        resetTokens,
      }}
    >
      {children}
    </PrivacyMonitorContext.Provider>
  );
}

export function usePrivacyMonitor() {
  const context = useContext(PrivacyMonitorContext);
  if (!context) {
    throw new Error('usePrivacyMonitor must be used within PrivacyMonitorProvider');
  }
  return context;
}
