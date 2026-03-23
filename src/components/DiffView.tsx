import { useState } from 'react';
import { diffLines, Change } from 'diff';

interface DiffViewProps {
  originalCode: string;
  refactoredCode: string;
  fullOutput: string;
}

export function DiffView({ originalCode, refactoredCode, fullOutput }: DiffViewProps) {
  const [viewMode, setViewMode] = useState<'diff' | 'full'>('diff');

  if (viewMode === 'full') {
    return (
      <div className="diff-view">
        <div className="diff-view-header">
          <button
            className="diff-view-toggle"
            onClick={() => setViewMode('diff')}
          >
            ← Back to Diff view
          </button>
        </div>
        <div className="diff-full-output">
          <pre>{fullOutput}</pre>
        </div>
      </div>
    );
  }

  const diff = diffLines(originalCode, refactoredCode);

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <h4 className="diff-view-title">Code Comparison</h4>
        <button
          className="diff-view-toggle"
          onClick={() => setViewMode('full')}
        >
          Show full output →
        </button>
      </div>

      <div className="diff-container">
        <div className="diff-pane">
          <div className="diff-pane-header">Original</div>
          <div className="diff-pane-content">
            {diff.map((part: Change, index: number) => {
              if (part.added) return null;
              
              const lines = part.value.split('\n').filter(line => line.length > 0 || part.value.endsWith('\n'));
              
              return lines.map((line, lineIndex) => {
                const key = `orig-${index}-${lineIndex}`;
                if (part.removed) {
                  return (
                    <div key={key} className="diff-line diff-line-removed">
                      <span className="diff-line-marker">−</span>
                      <span className="diff-line-content">{line || ' '}</span>
                    </div>
                  );
                }
                return (
                  <div key={key} className="diff-line diff-line-unchanged">
                    <span className="diff-line-marker"> </span>
                    <span className="diff-line-content">{line || ' '}</span>
                  </div>
                );
              });
            })}
          </div>
        </div>

        <div className="diff-pane">
          <div className="diff-pane-header">Refactored</div>
          <div className="diff-pane-content">
            {diff.map((part: Change, index: number) => {
              if (part.removed) return null;
              
              const lines = part.value.split('\n').filter(line => line.length > 0 || part.value.endsWith('\n'));
              
              return lines.map((line, lineIndex) => {
                const key = `new-${index}-${lineIndex}`;
                if (part.added) {
                  return (
                    <div key={key} className="diff-line diff-line-added">
                      <span className="diff-line-marker">+</span>
                      <span className="diff-line-content">{line || ' '}</span>
                    </div>
                  );
                }
                return (
                  <div key={key} className="diff-line diff-line-unchanged">
                    <span className="diff-line-marker"> </span>
                    <span className="diff-line-content">{line || ' '}</span>
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
