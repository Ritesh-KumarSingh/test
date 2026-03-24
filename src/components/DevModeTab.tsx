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

interface GhostState {
  decorationIds: string[];
  text: string;
  lineNumber: number;
  column: number;
}

const ACTION_PROMPTS: Record<DevAction, (code: string, language: string, errorMsg?: string) => string> = {
  explain: (code, language) =>
    `Explain this ${language} code step by step:\n${code}`,
  docstring: (code, language) =>
    `Generate a ${language} docstring for this code. Output only the comment:\n${code}`,
  debug: (code, language, errorMsg = 'No error message provided.') =>
    `Debug this ${language} code. Error: ${errorMsg}. Fix it and explain:\n${code}`,
  refactor: (code, language) =>
    `Refactor this ${language} code to be cleaner. Show refactored version and explain changes:\n${code}`,
};

const AUTOCOMPLETE_PROMPT = (context: string, language: string) =>
  `Complete this ${language} code. Only output the remaining code, nothing else:\n${context}`;

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

  // ── Ghost text state ──────────────────────────────────────────────────────
  const ghostRef = useRef<GhostState | null>(null);
  const ghostAbortRef = useRef<AbortController | null>(null);
  const ghostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostCancelRef = useRef<(() => void) | null>(null);
  const [isGhostActive, setIsGhostActive] = useState(false);

  // ── Batching refs — THE CORE FIX ─────────────────────────────────────────
  //
  // ROOT CAUSE of 4.4 tok/s: calling setState on every token causes React to
  // run a full reconcile on every token — at 30 tok/s that's 30 reconciles/sec
  // on the main JS thread. The WebGPU command queue starves waiting for the
  // main thread to be free. This was also the source of "Maximum update depth
  // exceeded" — rapid setState calls inside an async for-await loop triggered
  // React's infinite-loop guard.
  //
  // THE FIX: accumulate tokens in a ref (zero React involvement), then flush
  // to state via requestAnimationFrame — at most once per 16ms (~60fps).
  // At 30 tok/s, that's 1 React render per ~2 tokens instead of 30/sec.
  // The main thread is free 94% of the time for WebGPU work.
  const accumulatedRef = useRef('');       // raw text accumulation — no setState
  const pendingTokensRef = useRef(0);      // token count pending privacy flush
  const flushRafRef = useRef<number | null>(null);  // rAF handle for idempotency

  // Schedule a batched setState flush — only one rAF queued at a time.
  const scheduleFlush = useCallback((action: DevAction) => {
    if (flushRafRef.current !== null) return; // already scheduled, skip
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const text = accumulatedRef.current;
      if (!text) return;

      // ONE setState per animation frame — ~60fps max regardless of token speed
      setResult(prev => ({
        action,
        output: text,
        tokensPerSec: prev?.tokensPerSec,
        latencyMs: prev?.latencyMs,
      }));

      // Batch privacy counter flush
      if (pendingTokensRef.current > 0) {
        incrementTokens(pendingTokensRef.current);
        pendingTokensRef.current = 0;
      }
    });
  }, [incrementTokens]);

  const cancelFlush = useCallback(() => {
    if (flushRafRef.current !== null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
  }, []);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    if (newCode.trim().length > 20) {
      const detected = detectLanguageFromCode(newCode);
      setDetectedLanguage(detected);
      setLanguage(detected);
    }
  }, []);

  useEffect(() => {
    saveLanguagePreference(language);
  }, [language]);

  useEffect(() => {
    if (result && result.output && !result.output.startsWith('Error:')) {
      saveDevHistory(code, result.action, result.output).catch(console.error);
    }
  }, [result, code]);

  // ── Ghost helpers ─────────────────────────────────────────────────────────
  const clearGhostText = useCallback(() => {
    if (!editorRef.current) return;
    if (ghostRef.current?.decorationIds.length) {
      editorRef.current.deltaDecorations(ghostRef.current.decorationIds, []);
    }
    ghostRef.current = null;
    setIsGhostActive(false);
    ghostAbortRef.current?.abort();
    ghostCancelRef.current?.();
  }, []);

  const commitGhostText = useCallback(() => {
    const ed = editorRef.current;
    const ghost = ghostRef.current;
    if (!ed || !ghost || !ghost.text) return;

    ed.executeEdits('ghost-commit', [{
      range: {
        startLineNumber: ghost.lineNumber,
        startColumn: ghost.column,
        endLineNumber: ghost.lineNumber,
        endColumn: ghost.column,
      },
      text: ghost.text,
    }]);

    const insertedLines = ghost.text.split('\n');
    const newLine = ghost.lineNumber + insertedLines.length - 1;
    const newCol = insertedLines.length === 1
      ? ghost.column + ghost.text.length
      : insertedLines[insertedLines.length - 1].length + 1;
    ed.setPosition({ lineNumber: newLine, column: newCol });
    clearGhostText();
  }, [clearGhostText]);

  const renderGhostText = useCallback((text: string, lineNumber: number, column: number) => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;

    const oldIds = ghostRef.current?.decorationIds ?? [];
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
            content: safeText.slice(0, 120),
            inlineClassName: 'ghost-text-inline',
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    ghostRef.current = { decorationIds: newDecorations, text, lineNumber, column };
    setIsGhostActive(true);
  }, []);

  // ── Ghost completion — also batched ───────────────────────────────────────
  const triggerGhostCompletion = useCallback(async (
    context: string,
    lineNumber: number,
    column: number,
    lang: string,
  ) => {
    if (loader.state !== 'ready') return;

    ghostAbortRef.current?.abort();
    ghostCancelRef.current?.();
    const abort = new AbortController();
    ghostAbortRef.current = abort;

    setInferenceActive(true);
    setGenerating(true);

    try {
      const prompt = AUTOCOMPLETE_PROMPT(context, lang);
      const { stream, cancel } = await TextGeneration.generateStream(prompt, {
        maxTokens: 25,
        temperature: 0.05,
        topP: 0.9,
        stopSequences: ['\n\n', '```', '// ', '/* ', '\n'],
      });
      ghostCancelRef.current = cancel;

      if (abort.signal.aborted) { cancel(); return; }

      let ghostAccumulated = '';
      let ghostRaf: number | null = null;

      for await (const token of stream) {
        if (abort.signal.aborted) break;
        ghostAccumulated += token;

        // Batch ghost decoration updates — one rAF per frame max
        if (ghostRaf === null) {
          const snap = ghostAccumulated;
          ghostRaf = requestAnimationFrame(() => {
            ghostRaf = null;
            renderGhostText(snap.trimEnd(), lineNumber, column);
          });
        }
      }
      if (ghostRaf !== null) cancelAnimationFrame(ghostRaf);
    } catch (_err) {
      // Ghost is a bonus — swallow silently
    } finally {
      setInferenceActive(false);
      setGenerating(false);
      ghostAbortRef.current = null;
      ghostCancelRef.current = null;
    }
  }, [loader.state, setInferenceActive, setGenerating, renderGhostText]);

  // ── Main action runner — BATCHED hot loop ─────────────────────────────────
  const runAction = useCallback(async (action: DevAction) => {
    if (!code.trim() || processing) return;

    if (loader.state !== 'ready') {
      setResult({ action, output: 'Please download and load the model first.' });
      return;
    }

    clearGhostText();
    cancelFlush();

    // Reset accumulation buffers
    accumulatedRef.current = '';
    pendingTokensRef.current = 0;

    setProcessing(true);
    setInferenceActive(true);
    resetInference();
    setResult(null);

    try {
      const detectedLang = detectLanguage(code);
      const prompt = ACTION_PROMPTS[action](code, detectedLang, errorMsg);

      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(prompt, {
        maxTokens: 300,
        temperature: 0.1,
        topP: 0.9,
        stopSequences: ['\n\n\n', '---', 'Human:', 'User:', '###'],
      });
      cancelRef.current = cancel;

      // ── ZERO setState calls in this hot loop ──────────────────────────────
      // Every token: write to ref (no React), schedule one rAF flush.
      // scheduleFlush is idempotent — only one rAF is ever pending at a time.
      // Result: React renders at ~60fps max, not once per token.
      for await (const token of stream) {
        accumulatedRef.current += token;
        pendingTokensRef.current += 1;
        scheduleFlush(action);
      }

      // Cancel any pending rAF and do one final synchronous update
      cancelFlush();
      const finalResult = await resultPromise;
      const finalOutput = finalResult.text || accumulatedRef.current;

      // Flush remaining privacy tokens
      if (pendingTokensRef.current > 0) {
        incrementTokens(pendingTokensRef.current);
        pendingTokensRef.current = 0;
      }

      setResult({
        action,
        output: finalOutput,
        tokensPerSec: finalResult.tokensPerSecond,
        latencyMs: finalResult.latencyMs,
      });
    } catch (err) {
      cancelFlush();
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ action, output: `Error: ${msg}` });
    } finally {
      cancelRef.current = null;
      accumulatedRef.current = '';
      pendingTokensRef.current = 0;
      setProcessing(false);
      setInferenceActive(false);
    }
  }, [code, errorMsg, processing, loader, incrementTokens, setInferenceActive, resetInference, clearGhostText, scheduleFlush, cancelFlush]);

  const handleCancel = () => {
    cancelRef.current?.();
    cancelFlush();
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

  const GHOST_TRIGGER_RE = [
    /\/\/\s+\S.{1,}$/,
    /#\s+\S.{1,}$/,
    /--\s+\S.{1,}$/,
    /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/,
    /def\s+\w+\s*\([^)]*\)\s*:\s*$/,
    /const\s+\w+\s*=\s*$/,
    /\bclass\s+\w+.*\{?\s*$/,
    /\bfunc\s+\w+\s*\(/,
    /\bfn\s+\w+\s*\(/,
    /\bif\s*\(.*\)\s*\{?\s*$/,
    /\bfor\s*\(.*\)\s*\{?\s*$/,
    /=>\s*$/,
  ];

  const handleEditorMount = (ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = ed;
    monacoRef.current = monaco;

    ed.onDidChangeModelContent(() => {
      const model = ed.getModel();
      const pos = ed.getPosition();
      if (!model || !pos) return;

      const lineContent = model.getLineContent(pos.lineNumber);
      const lineLength = model.getLineMaxColumn(pos.lineNumber);
      const isAtLineEnd = pos.column >= lineLength - 1;

      if (!isAtLineEnd) {
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        return;
      }

      const textUpToCursor = lineContent.slice(0, pos.column - 1);
      const shouldTrigger = GHOST_TRIGGER_RE.some(re => re.test(textUpToCursor));

      if (shouldTrigger) {
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        ghostDebounceRef.current = setTimeout(() => {
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
        if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
        if (ghostRef.current) clearGhostText();
      }
    });

    ed.onKeyDown((e: any) => {
      if (!ghostRef.current) return;
      if (e.keyCode === monaco.KeyCode.Tab) {
        e.preventDefault();
        e.stopPropagation();
        commitGhostText();
        return;
      }
      if (e.keyCode === monaco.KeyCode.Escape) {
        clearGhostText();
        return;
      }
      ghostAbortRef.current?.abort();
      ghostCancelRef.current?.();
      clearGhostText();
    });

    ed.onDidChangeCursorPosition((e: any) => {
      if (ghostRef.current && e.position.lineNumber !== ghostRef.current.lineNumber) {
        ghostAbortRef.current?.abort();
        clearGhostText();
      }
    });
  };

  // ── Keyboard shortcuts — FIXED dependency array ───────────────────────────
  //
  // BEFORE (broken): useEffect(() => { registerHandlers({...}); });
  //   — no dep array → runs on EVERY render → one of the causes of the
  //   "Maximum update depth exceeded" cascade during token streaming.
  //
  // AFTER: stable handlersRef pattern — useEffect runs once (on mount),
  //   handlers always reflect the latest closures via the ref.
  const handlersRef = useRef({ runAction, setResult, editorRef });
  handlersRef.current = { runAction, setResult, editorRef };

  useEffect(() => {
    registerHandlers({
      onExplain: () => handlersRef.current.runAction('explain'),
      onDocstring: () => handlersRef.current.runAction('docstring'),
      onDebug: () => handlersRef.current.runAction('debug'),
      onRefactor: () => handlersRef.current.runAction('refactor'),
      onClearOutput: () => handlersRef.current.setResult(null),
      onFocusEditor: () => handlersRef.current.editorRef.current?.focus(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandlers]); // stable — runs once on mount

  useEffect(() => {
    return () => {
      if (ghostDebounceRef.current) clearTimeout(ghostDebounceRef.current);
      ghostAbortRef.current?.abort();
      cancelFlush();
    };
  }, [cancelFlush]);

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
        {/* Left Panel — Code Editor */}
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
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                parameterHints: { enabled: false },
              }}
            />
          </div>

          <TokenCounter text={code} />

          {isGhostActive && (
            <div className="ghost-hint-bar">
              <span>⚡ AI suggestion ready</span>
              <span className="ghost-hint-keys">
                <kbd>Tab</kbd> to accept · <kbd>Esc</kbd> to dismiss
              </span>
            </div>
          )}

          <div className="dev-mode-actions">
            <button className="btn btn-primary" onClick={() => runAction('explain')} disabled={processing}>
              📖 Explain <kbd>{modKey}E</kbd>
            </button>
            <button className="btn btn-primary" onClick={() => runAction('docstring')} disabled={processing}>
              📝 Docstring <kbd>{modKey}D</kbd>
            </button>
            <button className="btn btn-primary" onClick={() => runAction('debug')} disabled={processing}>
              🐛 Debug <kbd>{modKey}G</kbd>
            </button>
            <button className="btn btn-primary" onClick={() => runAction('refactor')} disabled={processing}>
              ✨ Refactor <kbd>{modKey}⇧R</kbd>
            </button>
            {processing && (
              <button className="btn" onClick={handleCancel}>⏹ Stop</button>
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

        {/* Right Panel — AI Output */}
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
                  return <StreamingOutput content={result.output} isStreaming={processing} />;
                })()
              ) : (
                <StreamingOutput content={result.output} isStreaming={processing} />
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