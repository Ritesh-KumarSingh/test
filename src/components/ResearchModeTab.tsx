import { useState, useCallback, useRef, useEffect } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { useModelLoaderWithOverlay } from '../hooks/useModelLoaderWithOverlay';
import { ModelBanner } from './ModelBanner';
import { StreamingOutput } from './StreamingOutput';
import { ActionBar } from './ActionBar';
import * as pdfjsLib from 'pdfjs-dist';
import { saveDocument, getDocuments, deleteDocument, saveResearchHistory, type StoredDocument } from '../utils/storage';
import { usePrivacyMonitor } from '../context/PrivacyMonitorContext';
import { useModel } from '../context/ModelContext';
import { useKeyboardShortcuts } from '../context/KeyboardShortcutsContext';

// Configure PDF.js worker - use local worker instead of CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface DocumentChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
}

// Chunk text into ~1500 char segments with 200 char overlap
function chunkText(text: string, documentId: string, documentName: string, chunkSize = 1500, overlap = 200): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.slice(start, end);
    
    chunks.push({
      documentId,
      documentName,
      chunkIndex,
      text: chunkText,
    });

    chunkIndex++;
    start = end - overlap; // Overlap for context
  }

  return chunks;
}

interface PDFDocument {
  id: string;
  name: string;
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
  };
}

type ResearchAction = 'qa' | 'outline' | 'citations';

interface ResearchResult {
  action: ResearchAction;
  output: string;
  tokensPerSec?: number;
  latencyMs?: number;
}

export function ResearchModeTab() {
  const loader = useModelLoaderWithOverlay(ModelCategory.Language);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { incrementTokens } = usePrivacyMonitor();
  const { setInferenceActive } = useModel();
  const { registerHandlers, modKey } = useKeyboardShortcuts();

  // Load documents from IndexedDB on mount
  useEffect(() => {
    getDocuments().then(setDocuments).catch(console.error);
  }, []);

  // Parse PDF client-side
  const parsePDF = useCallback(async (file: File): Promise<StoredDocument | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n\n';
      }

      const info = metadata.info as any;
      const doc: StoredDocument = {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        text: fullText.trim(),
        timestamp: Date.now(),
        metadata: {
          title: info?.Title || file.name,
          author: info?.Author,
          subject: info?.Subject,
        },
      };

      // Save to IndexedDB
      await saveDocument(doc);
      return doc;
    } catch (err) {
      console.error('PDF parsing error:', err);
      alert(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      alert('Please upload PDF files only');
      return;
    }

    for (const file of pdfFiles) {
      const doc = await parsePDF(file);
      if (doc) {
        setDocuments(prev => [...prev, doc]);
      }
    }
  }, [parsePDF]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeDocument = useCallback(async (id: string) => {
    await deleteDocument(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const runResearchAction = useCallback(async (action: ResearchAction) => {
    if (documents.length === 0) {
      setResult({
        action,
        output: 'Please upload at least one PDF document first.',
      });
      return;
    }

    if (action === 'qa' && !query.trim()) {
      setResult({
        action,
        output: 'Please enter a question.',
      });
      return;
    }

    if (loader.state !== 'ready') {
      setResult({
        action,
        output: 'Please download and load the model first.',
      });
      return;
    }

    setProcessing(true);
    setInferenceActive(true); // Activate HUD before the async work
    setResult(null);

    try {
      // Chunk all documents
      const allChunks: DocumentChunk[] = [];
      for (const doc of documents) {
        const chunks = chunkText(doc.text, doc.id, doc.name);
        allChunks.push(...chunks);
      }

      // Take first N chunks that fit in context (roughly 4000 chars = ~1000 tokens)
      const maxChars = 4000;
      let charCount = 0;
      const selectedChunks: DocumentChunk[] = [];
      
      for (const chunk of allChunks) {
        if (charCount + chunk.text.length > maxChars) break;
        selectedChunks.push(chunk);
        charCount += chunk.text.length;
      }

      const chunksText = selectedChunks
        .map(c => `[${c.documentName}]: ${c.text}`)
        .join('\n\n');

      let prompt = '';

      if (action === 'qa') {
        prompt = `You are a research assistant. The user has loaded the following document excerpts: ${chunksText}. Answer the following question based only on these documents, and cite which document each part of your answer comes from. Question: ${query}`;
      } else if (action === 'outline') {
        const topic = query || 'the research topic covered in these documents';
        prompt = `You are an academic writing assistant. Based on the following research documents: ${chunksText}. Generate a detailed chapter-by-chapter thesis outline for a paper on the topic: ${topic}. Format it as a numbered outline with sub-sections.`;
      } else if (action === 'citations') {
        const docList = documents
          .map(d => `Title: ${d.metadata?.title || d.name}\nAuthor: ${d.metadata?.author || 'Unknown'}\nFile: ${d.name}`)
          .join('\n\n');
        prompt = `Extract the bibliographic metadata from the following document text and format references in APA, MLA, and IEEE styles.\n\n${docList}\n\nGenerate formatted citations for each document:`;
      }

      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(prompt, {
        maxTokens: 1000,
        temperature: 0.4,
      });
      cancelRef.current = cancel;

      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
        incrementTokens(1); // Track tokens in privacy shield
        setResult({
          action,
          output: accumulated,
        });
      }

      const finalResult = await resultPromise;
      const finalOutput = finalResult.text || accumulated;
      
      setResult({
        action,
        output: finalOutput,
        tokensPerSec: finalResult.tokensPerSecond,
        latencyMs: finalResult.latencyMs,
      });

      // Save to history
      if (action === 'qa' && finalOutput && !finalOutput.startsWith('Error:')) {
        await saveResearchHistory(query, finalOutput);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        action,
        output: `Error: ${msg}`,
      });
    } finally {
      cancelRef.current = null;
      setProcessing(false);
      setInferenceActive(false);
    }
  }, [documents, query, loader, incrementTokens, setInferenceActive]);

  const handleCancel = () => {
    cancelRef.current?.();
    setProcessing(false);
    setInferenceActive(false);
  };

  // Register keyboard shortcut handlers
  useEffect(() => {
    registerHandlers({
      onOpenPdfPicker: () => fileInputRef.current?.click(),
      onSubmitQuestion: () => {
        if (query.trim() && !processing) {
          runResearchAction('qa');
        }
      },
      onGenerateOutline: () => runResearchAction('outline'),
      onFormatCitations: () => runResearchAction('citations'),
    });
  }, [registerHandlers, runResearchAction, query, processing]);

  return (
    <div className="tab-panel research-mode-panel">
      <ModelBanner
        state={loader.state}
        progress={loader.progress}
        error={loader.error}
        onLoad={loader.ensure}
        label="Research LLM"
      />

      <div className="research-mode-layout">
        {/* Left Panel - Document Management */}
        <div className="research-mode-input">
          <h3>📚 Document Library</h3>
          
          <div 
            className={`pdf-drop-zone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <p>📁 Drag & Drop PDFs Here</p>
            <p className="drop-zone-hint">or click to browse</p>
            <p className="drop-zone-privacy">🔒 Parsed 100% locally in browser</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className="document-list">
            {documents.length === 0 && (
              <p className="text-muted">No documents loaded yet</p>
            )}
            {documents.map(doc => (
              <div key={doc.id} className="document-card">
                <div className="document-info">
                  <strong>{doc.name}</strong>
                  <span className="document-size">{Math.round(doc.text.length / 1000)}KB text</span>
                </div>
                <button 
                  className="btn btn-sm"
                  onClick={() => removeDocument(doc.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="research-actions">
            <input
              type="text"
              placeholder="Ask a question about your documents..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="research-query-input"
              onKeyDown={(e) => e.key === 'Enter' && runResearchAction('qa')}
            />
            
            <button 
              className="btn btn-primary"
              onClick={() => runResearchAction('qa')}
              disabled={processing || documents.length === 0}
            >
              💬 Ask Question <kbd>{modKey}↵</kbd>
            </button>
            
            <button 
              className="btn btn-primary"
              onClick={() => runResearchAction('outline')}
              disabled={processing || documents.length === 0}
            >
              📋 Generate Outline <kbd>{modKey}⇧O</kbd>
            </button>
            
            <button 
              className="btn btn-primary"
              onClick={() => runResearchAction('citations')}
              disabled={processing || documents.length === 0}
            >
              📖 Format Citations <kbd>{modKey}⇧C</kbd>
            </button>

            {processing && (
              <button className="btn" onClick={handleCancel}>
                ⏹ Stop
              </button>
            )}
          </div>
        </div>

        {/* Right Panel - Results */}
        <div className="research-mode-output">
          {!result && !processing && (
            <div className="empty-state">
              <h3>🔬 Private Research Assistant</h3>
              <p>Upload unpublished PDFs - thesis drafts, lab results, papers.</p>
              <p><strong>Nothing leaves your device.</strong></p>
              <ul className="feature-list">
                <li>💬 Ask questions across all documents</li>
                <li>📋 Generate thesis chapter outlines</li>
                <li>📖 Auto-format citations (APA/MLA/IEEE)</li>
              </ul>
            </div>
          )}

          {processing && !result && (
            <div className="processing-state">
              <div className="shimmer-bar" />
              <p>Analyzing documents locally…</p>
            </div>
          )}

          {result && (
            <div className="result-card">
              <div className="result-header">
                <h4>
                  {result.action === 'qa' && '💬 Answer'}
                  {result.action === 'outline' && '📋 Thesis Outline'}
                  {result.action === 'citations' && '📖 Formatted Citations'}
                </h4>
                {result.tokensPerSec && (
                  <span className="result-stats">
                    {result.tokensPerSec.toFixed(1)} tok/s · {result.latencyMs?.toFixed(0)}ms
                  </span>
                )}
              </div>
              
              <StreamingOutput 
                content={result.output}
                isStreaming={processing}
              />
              
              {!processing && (
                <ActionBar
                  content={result.output}
                  showInsert={false}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
