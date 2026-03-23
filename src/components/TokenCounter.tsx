import { useEffect, useState } from 'react';
import { estimateTokenCount } from '../utils/codeUtils';

interface TokenCounterProps {
  text: string;
}

export function TokenCounter({ text }: TokenCounterProps) {
  const [tokenCount, setTokenCount] = useState(0);
  const [debouncedText, setDebouncedText] = useState(text);

  // Debounce text updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 300);

    return () => clearTimeout(timer);
  }, [text]);

  // Calculate token count when debounced text changes
  useEffect(() => {
    setTokenCount(estimateTokenCount(debouncedText));
  }, [debouncedText]);

  return (
    <div className="token-counter">
      <span className="token-counter-icon">🔢</span>
      <span className="token-counter-text">~{tokenCount} tokens</span>
    </div>
  );
}
