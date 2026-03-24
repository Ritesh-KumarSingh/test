import { useState, useRef, useEffect, useCallback } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { useModelLoaderWithOverlay } from '../hooks/useModelLoaderWithOverlay';
import { ModelBanner } from './ModelBanner';
import { usePrivacyMonitor } from '../context/PrivacyMonitorContext';
import { useModel } from '../context/ModelContext';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  stats?: { tokens: number; tokPerSec: number; latencyMs: number };
}

export function ChatTab() {
  const loader = useModelLoaderWithOverlay(ModelCategory.Language);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { incrementTokens } = usePrivacyMonitor();
  const { setInferenceActive, resetInference } = useModel();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;

    // Ensure model is loaded
    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setGenerating(true);
    setInferenceActive(true);
    resetInference(); // Reset token count for new inference

    // Add empty assistant message for streaming
    const assistantIdx = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);

    try {
      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(text, {
        maxTokens: 256,
        temperature: 0.5,
        stopSequences: ['\n\n\n', '---', 'User:', 'Human:'],
      });
      cancelRef.current = cancel;

      let accumulated = '';
      let tokenCount = 0;
      for await (const token of stream) {
        accumulated += token;
        tokenCount++;
        incrementTokens(1); // Increment privacy shield counter
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: 'assistant', text: accumulated };
          return updated;
        });
      }

      const result = await resultPromise;
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: 'assistant',
          text: result.text || accumulated,
          stats: {
            tokens: result.tokensUsed,
            tokPerSec: result.tokensPerSecond,
            latencyMs: result.latencyMs,
          },
        };
        return updated;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: 'assistant', text: `Error: ${msg}` };
        return updated;
      });
    } finally {
      cancelRef.current = null;
      setGenerating(false);
      setInferenceActive(false);
    }
  }, [input, generating, messages.length, loader, incrementTokens, setInferenceActive, resetInference]);

  const handleCancel = () => {
    cancelRef.current?.();
  };

  return (
    <div className="tab-panel chat-panel">
      <ModelBanner
        state={loader.state}
        progress={loader.progress}
        error={loader.error}
        onLoad={loader.ensure}
        label="LLM"
      />

      <div className="message-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: '48px', marginBottom: '16px' }}>💬</span>
            <h3>Your Private AI Assistant</h3>
            <p>Start chatting with a fully local AI model. Your conversations never leave your device.</p>
            <p style={{ 
              fontSize: '12px', 
              marginTop: '16px',
              color: 'var(--green-light)',
              fontWeight: '600'
            }}>
              🔒 100% Private • ⚡ Fast • 🌐 Offline-Ready
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-bubble">
              <p>{msg.text || <span style={{ opacity: 0.5 }}>Thinking...</span>}</p>
              {msg.stats && (
                <div className="message-stats">
                  ⚡ {msg.stats.tokens} tokens • {msg.stats.tokPerSec.toFixed(1)} tok/s • ⏱️ {msg.stats.latencyMs.toFixed(0)}ms
                </div>
              )}
            </div>
          </div>
        ))}
        {generating && (
          <div className="message message-assistant">
            <div className="message-bubble" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              minHeight: '44px'
            }}>
              <span className="cursor-blink">|</span>
            </div>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <input
          type="text"
          placeholder="Type your message... (Press Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={generating}
          autoFocus
        />
        {generating ? (
          <button type="button" className="btn btn-danger" onClick={handleCancel}>
            ⏹️ Stop
          </button>
        ) : (
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={!input.trim()}
            title="Send message (Enter)"
          >
            ⬆️ Send
          </button>
        )}
      </form>
    </div>
  );
}
