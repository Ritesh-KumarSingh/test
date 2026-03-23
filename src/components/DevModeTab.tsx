import { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { useModelLoaderWithOverlay } from '../hooks/useModelLoaderWithOverlay';
import { ModelBanner } from './ModelBanner';
import { StreamingOutput } from './StreamingOutput';
import { ActionBar } from './ActionBar';
import { DiffView } from './DiffView';
import { LanguageDetectionBadge } from './LanguageDetectionBadge';
import { TokenCounter } from './TokenCounter';
import { saveDevHistory } from '../utils/storage';
import { usePrivacyMonitor } from '../context/PrivacyMonitorContext';
import { useModel } from '../context/ModelContext';
import { useKeyboardShortcuts } from '../context/KeyboardShortcutsContext';
import { parseRefactorOutput, detectLanguageFromCode } from '../utils/codeUtils';

type DevAction = 'explain' | 'docstring' | 'debug' | 'refactor';

interface DevResult {
  action: DevAction;
  output: string;
  tokensPerSec?: number;
  latencyMs?: number;
}

// ── Ghost text internal state ──────────────────────────────────────────────
interface GhostState {
  decorationIds: string[];           // Monaco decoration IDs for cleanup
  text: string;                      // The completion text
  lineNumber: number;                // Line where ghost starts
  column: number;                    // Column where ghost starts
}

const ACTION_PROMPTS: Record<DevAction, (code: string, language: string, errorMsg?: string) => string> = {
  explain: (code, language) =>
    `You are a code explainer. The following is ${language} code. Explain what it does in plain English, step by step, for a developer who is reading it for the first time. Code:\n${code}`,

  docstring: (code, language) =>
    `You are a documentation generator. Generate a complete ${language} docstring or JSDoc comment for the following code. Output only the comment block, nothing else. Code:\n${code}`,

  debug: (code, language, errorMsg = 'No error message provided.') =>
    `You are a debugger. The following ${language} code has a bug or error. Error message: ${errorMsg}. Analyse the root cause and provide a corrected version of the code with an explanation of what was wrong. Code:\n${code}`,

  refactor: (code, language) =>
    `You are a senior ${language} engineer. Refactor the following code to be cleaner, more idiomatic, and more maintainable. Show the refactored version and briefly explain each change. Code:\n${code}`,
};

// Autocomplete prompt — spec-exact, optimized for speed
// maxTokens is kept at 80 to ensure <500ms first token on WebGPU
const AUTOCOMPLETE_PROMPT = (context: string, language: string) =>
  `You are a high-speed inline code completion engine. Complete the following ${language} snippet. Provide ONLY the remaining code. No explanations. No markdown. No code fences. Code:\n${context}`;

// Save preference to localStorage
function saveLanguagePreference(language: string) {
  localStorage.setItem('privateide_language', language);
}

function loadLanguagePreference(): string {
  return localStorage.getItem('privateide_language') || 'javascript';
}

const LANGUAGE_DETECTION = [
  { id: 'javascript', patterns: [/\bconst\b/, /\blet\b/, /\bfunction\b/, /\bconsole\.log\b/, /=>/, /\bimport\b.*\bfrom\b/] },
  { id: 'typescript', patterns: [/\binterface\b/, /\btype\b.*=/, /:\s*\w+/, /\bas\b/, /<.*>/] },
  { id: 'python', patterns: [/\bdef\b/, /\bimport\b/, /\bprint\(/, /\bself\b/, /\bclass\b.*:/, /__init__/] },
  { id: 'go', patterns: [/\bfunc\b/, /\bpackage\b/, /\bimport\b/, /\bvar\b/, /:=/, /\bgo\b/] },
  { id: 'rust', patterns: [/\bfn\b/, /\blet\b.*=/, /\bimpl\b/, /\bpub\b/, /\bmut\b/] },
  { id: 'java', patterns: [/\bpublic\b.*\bclass\b/, /\bprivate\b/, /\bSystem\.out\b/, /\bnew\b.*\(/, /\bvoid\b/] },
];

function detectLanguage(code: string): string {
  for (const { id, patterns } of LANGUAGE_DETECTION) {
    const matches = patterns.filter(p => p.test(code)).length;
    if (matches >= 2) return id;
  }
  return 'javascript';
}

export function DevModeTab() {
  const loader = useModelLoaderWithOverlay(ModelCategory.Language);
  const [code, setCode] = useState('// Paste your code here\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}');
  const [language, setLanguage] = useState(() => loadLanguagePreference());
  const [detectedLanguage, setDetectedLanguage] = useState(language);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<DevResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const { incrementTokens, setGenerating } = usePrivacyMonitor();
  const { setInferenceActive, resetInference } = useModel();
  const { registerHandlers, modKey } = useKeyboardShortcuts();

  // ── Ghost text state ─────────────────────────────────────────────────────
  const ghostRef = useRef<GhostState | null>(null);
  const ghostAbortRef = useRef<AbortController | null>(null);
  const ghostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostCancelRef = useRef<(() => void) | null>(null);
  const [isGhostActive, setIsGhostActive] = useState(false);

  // Handle code changes with language detection
  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);

    if (newCode.trim().length > 20) {
      const detected = detectLanguageFromCode(newCode);
      setDetectedLanguage(detected);
      setLanguage(detected);
    }
  }, []);

  // Save language preference
  useEffect(() => {
    saveLanguagePreference(language);
  }, [language]);

  // Save to IndexedDB when result changes
  useEffect(() => {
    if (result && result.output && !result.output.startsWith('Error:')) {
      saveDevHistory(code, result.action, result.output).catch(console.error);
    }
  }, [result, code]);

  // ── Clear all ghost text decorations ─────────────────────────────────────
  const clearGhostText = useCallback(() => {
    if (!editorRef.current) return;
    if (ghostRef.current?.decorationIds.length) {
      editorRef.current.deltaDecorations(ghostRef.current.decorationIds, []);
    }
    ghostRef.current = null;
    setIsGhostActive(false);

    // Cancel any in-flight ghost generation
    ghostAbortRef.current?.abort();
    ghostCancelRef.current?.();
  }, []);

  // ── Commit ghost text into the editor buffer ──────────────────────────────
  const commitGhostText = useCallback(() => {
    const ed = editorRef.current;
    const ghost = ghostRef.current;
    if (!ed || !ghost || !ghost.text) return;

    // Insert text at the ghost position
    ed.executeEdits('ghost-commit', [{
      range: {
        startLineNumber: ghost.lineNumber,
        startColumn: ghost.column,
        endLineNumber: ghost.lineNumber,
        endColumn: ghost.column,
      },
      text: ghost.text,
    }]);

    // Move cursor to end of committed text
    const insertedLines = ghost.text.split('\n');
    const newLine = ghost.lineNumber + insertedLines.length - 1;
    const newCol = insertedLines.length === 1
      ? ghost.column + ghost.text.length
      : insertedLines[insertedLines.length - 1].length + 1;
    ed.setPosition({ lineNumber: newLine, column: newCol });

    clearGhostText();
  }, [clearGhostText]);

  // ── Render ghost text as Monaco inline decoration ─────────────────────────
  const renderGhostText = useCallback((text: string, lineNumber: number, column: number) => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;

    // Clear previous ghost
    const oldIds = ghostRef.current?.decorationIds ?? [];

    // Monaco doesn't have native ghost text in all versions, so we use
    // an after-content decoration injected via CSS class.
    // We encode the text as a data attribute on the element via CSS.
    const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '↵ ');

    const newDecorations = ed.deltaDecorations(oldIds, [
      {
        range: {
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber,
          endColumn: column,
        },
        options: {
          after: {
            content: safeText.slice(0, 120), // truncate for decoration
            inlineClassName: 'ghost-text-inline',
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    ghostRef.current = { decorationIds: newDecorations, text, lineNumber, column };
    setIsGhostActive(true);
  }, []);

  // ── Fire ghost text completion ─────────────────────────────────────────────
  // Runs silently alongside normal actions.
  // Signals the HUD via setInferenceActive + setGenerating so tok/s + orb animate.
  const triggerGhostCompletion = useCallback(async (
    context: string,
    lineNumber: number,
    column: number,
    lang: string,
  ) => {
    if (loader.state !== 'ready') return;

    // Cancel any prior in-flight ghost request
    ghostAbortRef.current?.abort();
    ghostCancelRef.current?.();
    const abort = new AbortController();
    ghostAbortRef.current = abort;

    // ── Activate HUD readouts ──────────────────────────────────────────────
    setInferenceActive(true);
    setGenerating(true);

    try {
      const prompt = AUTOCOMPLETE_PROMPT(context, lang);

      const { stream, cancel } = await TextGeneration.generateStream(prompt, {
        maxTokens: 80,        // Short → fast. Speed > accuracy at hackathons.
        temperature: 0.1,    // Very deterministic for code
        stopSequences: ['\n\n', '```', '// ', '/* '],
      });
      ghostCancelRef.current = cancel;

      if (abort.signal.aborted) { cancel(); return; }

      let accumulated = '';
      for await (const token of stream) {
        if (abort.signal.aborted) break;
        accumulated += token;
        incrementTokens(1);
        // Render each token as it arrives — live streaming ghost text
        renderGhostText(accumulated.trimEnd(), lineNumber, column);
      }
    } catch (_err) {
      // Silently swallow — ghost is a bonus, not mission-critical
    } finally {
      setInferenceActive(false);
      setGenerating(false);
      ghostAbortRef.current = null;
      ghostCancelRef.current = null;
    }
  }, [loader.state, setInferenceActive, setGenerating, incrementTokens, renderGhostText]);

  // ── Main action runner (Explain / Docstring / Debug / Refactor) ────────────
  const runAction = useCallback(async (action: DevAction) => {
    if (!code.trim() || processing) return;

    if (loader.state !== 'ready') {
      setResult({ action, output: 'Please download and load the model first.' });
      return;
    }

    // Cancel any ghost in progress
    clearGhostText();

    setProcessing(true);
    setInferenceActive(true);
    resetInference();
    setResult(null);

    try {
      const detectedLang = detectLanguage(code);
      const prompt = ACTION_PROMPTS[action](code, detectedLang, errorMsg);

      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(prompt, {
        maxTokens: 800,
        temperature: 0.3,
      });
      cancelRef.current = cancel;

      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
        incrementTokens(1);
        setResult({ action, output: accumulated });
      }

      const finalResult = await resultPromise;
      setResult({
        action,
        output: finalResult.text || accumulated,
        tokensPerSec: finalResult.tokensPerSecond,
        latencyMs: finalResult.latencyMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ action, output: `Error: ${msg}` });
    } finally {
      cancelRef.current = null;
      setProcessing(false);
      setInferenceActive(false);
    }
  }, [code, errorMsg, processing, loader, incrementTokens, setInferenceActive, resetInference, clearGhostText]);

  const handleCancel = () => {
    cancelRef.current?.();
    setProcessing(false);
    setInferenceActive(false);
  };

  const handleInsertIntoEditor = () => {
    if (editorRef.current && result?.output) {
      const ed = editorRef.current;
      const position = ed.getPosition();
      if (position) {
        ed.executeEdits('insert-ai-output', [{
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: result.output,
        }]);
      }
    }
  };

  // ── Ghost trigger patterns ────────────────────────────────────────────────
  // Matches comment lines AND code block headers — these are high-intent triggers
  // where the developer has paused to describe what they want next.
  const GHOST_TRIGGER_RE = [
    /\/\/\s+\S.{1,}$/,                      // JS/TS: // comment with text
    /#\s+\S.{1,}$/,                         // Python: # comment with text
    /--\s+\S.{1,}$/,                        // Lua/SQL: -- comment
    /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/, // function foo() {
    /def\s+\w+\s*\([^)]*\)\s*:\s*$/,        // Python: def foo():
    /const\s+\w+\s*=\s*$/,                  // const x =
    /\bclass\s+\w+.*\{?\s*$/,               // class Foo {
    /\bfunc\s+\w+\s*\(/,                    // Go: func foo(
    /\bfn\s+\w+\s*\(/,                      // Rust: fn foo(
    /\bif\s*\(.*\)\s*\{?\s*$/,              // if (condition) {
    /\bfor\s*\(.*\)\s*\{?\s*$/,             // for loops
    /=>\s*$/,                               // arrow function body start
  ];

  // ── Editor mount: wire up ghost text trigger + Tab/Esc intercept ─────────
  const handleEditorMount = (ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = ed;
    monacoRef.current = monaco;

    // ── Content change listener ─────────────────────────────────────────────
    ed.onDidChangeModelContent(() => {
      const model = ed.getModel();
      const pos = ed.getPosition();
      if (!model || !pos) return;

      const lineContent = model.getLineContent(pos.lineNumber);
      const lineLength = model.getLineMaxColumn(pos.lineNumber);

      // Guard: cursor must be at or near end of line (within 1 char)
      const isAtLineEnd = pos.column >= lineLength - 1;
      if (!isAtLineEnd) {
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        return; // Don't trigger mid-line
      }

      const textUpToCursor = lineContent.slice(0, pos.column - 1);
      const shouldTrigger = GHOST_TRIGGER_RE.some(re => re.test(textUpToCursor));

      if (shouldTrigger) {
        // Debounce: 300ms after last keystroke (spec requirement)
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        ghostDebounceRef.current = setTimeout(() => {
          // Context: last 10 lines (spec requirement)
          const startLine = Math.max(1, pos.lineNumber - 9);
          const contextLines: string[] = [];
          for (let l = startLine; l <= pos.lineNumber; l++) {
            contextLines.push(model.getLineContent(l));
          }
          const context = contextLines.join('\n');
          const lang = detectLanguage(model.getValue());
          triggerGhostCompletion(context, pos.lineNumber, pos.column, lang);
        }, 300);
      } else {
        // Not a trigger line — cancel pending debounce + clear ghost
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        if (ghostRef.current) clearGhostText();
      }
    });

    // ── Key handler: Tab commits, Esc dismisses, any other key aborts ───────
    // Using onKeyDown (not addCommand) for highest-priority intercept —
    // addCommand can be shadowed by Monaco's indent/tab providers.
    ed.onKeyDown((e: any) => {
      if (!ghostRef.current) return; // Nothing to do if no ghost

      if (e.keyCode === monaco.KeyCode.Tab) {
        // Tab → commit the ghost text into the buffer
        e.preventDefault();
        e.stopPropagation();
        commitGhostText();
        return;
      }

      if (e.keyCode === monaco.KeyCode.Escape) {
        // Esc → dismiss without committing
        clearGhostText();
        return;
      }

      // Any other keystroke → abort the in-flight inference immediately
      // This is critical for responsiveness: user changed their mind.
      ghostAbortRef.current?.abort();
      ghostCancelRef.current?.();
      clearGhostText();
    });

    // ── Cursor leaves ghost line → dismiss ──────────────────────────────────
    ed.onDidChangeCursorPosition((e: any) => {
      if (ghostRef.current && e.position.lineNumber !== ghostRef.current.lineNumber) {
        ghostAbortRef.current?.abort();
        clearGhostText();
      }
    });
  };

  // Register keyboard shortcut handlers
  useEffect(() => {
    registerHandlers({
      onExplain: () => runAction('explain'),
      onDocstring: () => runAction('docstring'),
      onDebug: () => runAction('debug'),
      onRefactor: () => runAction('refactor'),
      onClearOutput: () => setResult(null),
      onFocusEditor: () => editorRef.current?.focus(),
    });
  }, [registerHandlers, runAction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
      ghostAbortRef.current?.abort();
    };
  }, []);

  const isEditorLoading = loader.state === 'downloading' || loader.state === 'loading';

  return (
    <div className="tab-panel dev-mode-panel">
      <ModelBanner
        state={loader.state}
        progress={loader.progress}
        error={loader.error}
        onLoad={loader.ensure}
        label="Dev LLM"
      />

      <div className="dev-mode-layout">
        {/* Left Panel - Code Editor */}
        <div className={`dev-mode-input${isEditorLoading ? ' shimmer-sweep' : ''}`}>
          <div className="dev-mode-toolbar">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="language-select"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="java">Java</option>
            </select>
            <span className="toolbar-label">Paste proprietary code — stays 100% local</span>

            {/* Ghost text status indicator */}
            {isGhostActive && (
              <span className="ghost-indicator">
                <span className="ghost-indicator-dot" />
                Ghost AI
              </span>
            )}
          </div>

          <div className={`editor-container${isEditorLoading ? ' shimmer-border' : ''}`}>
            <LanguageDetectionBadge
              language={detectedLanguage}
              onLanguageChange={setLanguage}
            />
            {/* Shimmer overlay on editor while model loads */}
            <div className={`editor-shimmer-wrap${isEditorLoading ? ' active' : ''}`} />
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
                // Disable Monaco's own suggest so ghost text is the only suggestion
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                parameterHints: { enabled: false },
              }}
            />
          </div>

          <TokenCounter text={code} />

          {/* Ghost text hint bar */}
          {isGhostActive && (
            <div className="ghost-hint-bar">
              <span>⚡ AI suggestion ready</span>
              <span className="ghost-hint-keys">
                <kbd>Tab</kbd> to accept · <kbd>Esc</kbd> to dismiss
              </span>
            </div>
          )}

          <div className="dev-mode-actions">
            <button
              className="btn btn-primary"
              onClick={() => runAction('explain')}
              disabled={processing}
            >
              📖 Explain <kbd>{modKey}E</kbd>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => runAction('docstring')}
              disabled={processing}
            >
              📝 Docstring <kbd>{modKey}D</kbd>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => runAction('debug')}
              disabled={processing}
            >
              🐛 Debug <kbd>{modKey}G</kbd>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => runAction('refactor')}
              disabled={processing}
            >
              ✨ Refactor <kbd>{modKey}⇧R</kbd>
            </button>
            {processing && (
              <button className="btn" onClick={handleCancel}>
                ⏹ Stop
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="Optional: paste error message for debugging"
            value={errorMsg}
            onChange={(e) => setErrorMsg(e.target.value)}
            className="error-input"
          />
        </div>

        {/* Right Panel - AI Output */}
        <div className="dev-mode-output">
          {!result && !processing && (
            <div className="empty-state">
              <h3>🔒 100% Private Code Analysis</h3>
              <p>Paste code on the left. Click any action to analyze it.</p>
              <div className="ghost-empty-hint">
                <span className="ghost-empty-icon">⚡</span>
                <div>
                  <strong>Ghost AI Autocomplete</strong>
                  <p>Type a comment like <code className="ghost-tip-code">// loop through each item and</code> then pause — the local LFM2 model will complete it inline. Press <kbd>Tab</kbd> to accept.</p>
                </div>
              </div>
              <p style={{ marginTop: 8 }}><strong>Zero bytes leave this device.</strong></p>
            </div>
          )}

          {processing && !result && (
            <div className="processing-state">
              <div className="shimmer-bar" />
              <p>Processing locally…</p>
            </div>
          )}

          {result && (
            <div className="result-card">
              <div className="result-header">
                <h4>
                  {result.action === 'explain' && '📖 Code Explanation'}
                  {result.action === 'docstring' && '📝 Generated Documentation'}
                  {result.action === 'debug' && '🐛 Debug Analysis'}
                  {result.action === 'refactor' && '✨ Refactoring Suggestions'}
                </h4>
                {result.tokensPerSec && (
                  <span className="result-stats">
                    {result.tokensPerSec.toFixed(1)} tok/s · {result.latencyMs?.toFixed(0)}ms
                  </span>
                )}
              </div>

              {result.action === 'refactor' && !processing ? (
                (() => {
                  const parsedCode = parseRefactorOutput(result.output, code);
                  if (parsedCode) {
                    return (
                      <DiffView
                        originalCode={parsedCode.originalCode}
                        refactoredCode={parsedCode.refactoredCode}
                        fullOutput={result.output}
                      />
                    );
                  }
                  return (
                    <StreamingOutput
                      content={result.output}
                      isStreaming={processing}
                    />
                  );
                })()
              ) : (
                <StreamingOutput
                  content={result.output}
                  isStreaming={processing}
                />
              )}

              {!processing && result.action !== 'refactor' && (
                <ActionBar
                  content={result.output}
                  showInsert={true}
                  onInsert={handleInsertIntoEditor}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
