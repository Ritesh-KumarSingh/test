import { useState } from 'react';

interface ActionBarProps {
  content: string;
  showInsert?: boolean;
  onInsert?: () => void;
}

type ConfirmationType = 'copy' | 'copyMarkdown' | 'insert' | null;

export function ActionBar({ content, showInsert = false, onInsert }: ActionBarProps) {
  const [confirmation, setConfirmation] = useState<ConfirmationType>(null);

  const showConfirmation = (type: ConfirmationType) => {
    setConfirmation(type);
    setTimeout(() => setConfirmation(null), 1500);
  };

  const handleCopy = async () => {
    try {
      // Strip markdown formatting for plain text
      const plainText = content
        .replace(/```[\s\S]*?```/g, (match) => {
          // Extract code from code blocks
          return match.replace(/```\w*\n?/, '').replace(/```$/, '');
        })
        .replace(/[*_~`]/g, '') // Remove markdown formatting
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Extract link text
        .replace(/^#+\s+/gm, ''); // Remove heading markers
      
      await navigator.clipboard.writeText(plainText.trim());
      showConfirmation('copy');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(content);
      showConfirmation('copyMarkdown');
    } catch (err) {
      console.error('Failed to copy markdown:', err);
    }
  };

  const handleInsert = () => {
    if (onInsert) {
      onInsert();
      showConfirmation('insert');
    }
  };

  return (
    <div className="action-bar">
      <button
        className="action-btn"
        onClick={handleCopy}
        disabled={confirmation === 'copy'}
      >
        {confirmation === 'copy' ? '✓ Copied!' : '📋 Copy'}
      </button>
      
      <button
        className="action-btn"
        onClick={handleCopyMarkdown}
        disabled={confirmation === 'copyMarkdown'}
      >
        {confirmation === 'copyMarkdown' ? '✓ Copied!' : '📝 Copy as Markdown'}
      </button>
      
      {showInsert && onInsert && (
        <button
          className="action-btn"
          onClick={handleInsert}
          disabled={confirmation === 'insert'}
        >
          {confirmation === 'insert' ? '✓ Inserted!' : '⬅️ Insert into Editor'}
        </button>
      )}
    </div>
  );
}
