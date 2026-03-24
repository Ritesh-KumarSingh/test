import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';

// Detect Mac vs non-Mac
const isMac = navigator.platform.includes('Mac');
export const modKey = isMac ? '⌘' : 'Ctrl';
export const modKeyName = isMac ? 'Cmd' : 'Ctrl';

interface ShortcutHandlers {
  onExplain?: () => void;
  onDocstring?: () => void;
  onDebug?: () => void;
  onRefactor?: () => void;
  onClearOutput?: () => void;
  onFocusEditor?: () => void;
  onOpenPdfPicker?: () => void;
  onSubmitQuestion?: () => void;
  onGenerateOutline?: () => void;
  onFormatCitations?: () => void;
  onSwitchToDevMode?: () => void;
  onSwitchToResearchMode?: () => void;
  onSwitchToChat?: () => void;
}

interface KeyboardShortcutsContextType {
  registerHandlers: (handlers: ShortcutHandlers) => void;
  showShortcutsModal: boolean;
  setShowShortcutsModal: (show: boolean) => void;
  isMac: boolean;
  modKey: string;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | undefined>(undefined);

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  // Use a ref for handlers to avoid re-renders when handlers are registered
  const handlersRef = useRef<ShortcutHandlers>({});
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const registerHandlers = useCallback((newHandlers: ShortcutHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...newHandlers };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current; // Read from ref, always current
      // Guard: skip if in text input or Monaco editor
      const activeEl = document.activeElement;
      const isInInput = activeEl instanceof HTMLInputElement || 
                       activeEl instanceof HTMLTextAreaElement ||
                       activeEl?.closest('.monaco-editor') !== null;

      // Special case: ? key opens shortcuts modal (only when not in text input)
      if (e.key === '?' && !isInInput) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // Skip all other shortcuts if in text input
      if (isInInput) return;

      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;

      // Cmd/Ctrl+E - Explain
      if (cmdOrCtrl && e.key === 'e' && !shift) {
        e.preventDefault();
        h.onExplain?.();
        return;
      }

      // Cmd/Ctrl+D - Docstring (prevent browser bookmark)
      if (cmdOrCtrl && e.key === 'd' && !shift) {
        e.preventDefault();
        h.onDocstring?.();
        return;
      }

      // Cmd/Ctrl+G - Debug
      if (cmdOrCtrl && e.key === 'g' && !shift) {
        e.preventDefault();
        h.onDebug?.();
        return;
      }

      // Cmd/Ctrl+Shift+R - Refactor
      if (cmdOrCtrl && shift && e.key === 'R') {
        e.preventDefault();
        h.onRefactor?.();
        return;
      }

      // Cmd/Ctrl+L - Clear output
      if (cmdOrCtrl && e.key === 'l' && !shift) {
        e.preventDefault();
        h.onClearOutput?.();
        return;
      }

      // Cmd/Ctrl+K - Focus editor
      if (cmdOrCtrl && e.key === 'k' && !shift) {
        e.preventDefault();
        h.onFocusEditor?.();
        return;
      }

      // Cmd/Ctrl+U - Open PDF picker
      if (cmdOrCtrl && e.key === 'u' && !shift) {
        e.preventDefault();
        h.onOpenPdfPicker?.();
        return;
      }

      // Cmd/Ctrl+Enter - Submit question
      if (cmdOrCtrl && e.key === 'Enter' && !shift) {
        e.preventDefault();
        h.onSubmitQuestion?.();
        return;
      }

      // Cmd/Ctrl+Shift+O - Generate Outline
      if (cmdOrCtrl && shift && e.key === 'O') {
        e.preventDefault();
        h.onGenerateOutline?.();
        return;
      }

      // Cmd/Ctrl+Shift+C - Format Citations
      if (cmdOrCtrl && shift && e.key === 'C') {
        e.preventDefault();
        h.onFormatCitations?.();
        return;
      }

      // Cmd/Ctrl+1 - Switch to Dev Mode
      if (cmdOrCtrl && e.key === '1' && !shift) {
        e.preventDefault();
        h.onSwitchToDevMode?.();
        return;
      }

      // Cmd/Ctrl+2 - Switch to Research Mode
      if (cmdOrCtrl && e.key === '2' && !shift) {
        e.preventDefault();
        h.onSwitchToResearchMode?.();
        return;
      }

      // Cmd/Ctrl+3 - Switch to Chat
      if (cmdOrCtrl && e.key === '3' && !shift) {
        e.preventDefault();
        h.onSwitchToChat?.();
        return;
      }

      // Escape - Close shortcuts modal
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps — ref is always current

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        registerHandlers,
        showShortcutsModal,
        setShowShortcutsModal,
        isMac,
        modKey,
      }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  }
  return context;
}
