import { useEffect, useState } from 'react';

interface LanguageDetectionBadgeProps {
  language: string;
  onLanguageChange: (language: string) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
};

export function LanguageDetectionBadge({ language, onLanguageChange }: LanguageDetectionBadgeProps) {
  const [shouldPulse, setShouldPulse] = useState(false);

  useEffect(() => {
    // Trigger pulse animation when language changes
    setShouldPulse(true);
    const timer = setTimeout(() => setShouldPulse(false), 300);
    return () => clearTimeout(timer);
  }, [language]);

  const displayName = LANGUAGE_LABELS[language] || language.charAt(0).toUpperCase() + language.slice(1);

  return (
    <div className={`language-detection-badge ${shouldPulse ? 'pulse' : ''}`}>
      <span className="language-detection-icon">📝</span>
      <span className="language-detection-text">{displayName} detected</span>
    </div>
  );
}
