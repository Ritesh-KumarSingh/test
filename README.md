# 🔒 PrivateIDE

**A local-first AI workspace for developers and researchers**

PrivateIDE is a secure, fully offline AI coding and research workspace that runs powerful LLMs directly in your browser via the RunAnywhere SDK. **Zero cloud dependencies, zero API costs, zero data leakage.**

## 🎯 The Problem It Solves

- **💸 Cost**: Cloud AI API calls cost $0.08–$0.35/min. 10K users = up to $84K/month in inference bills
- **🔓 Privacy**: Pasting proprietary code into ChatGPT or Copilot risks IP leakage
- **🔬 Academic Integrity**: Researchers uploading unpublished data breach confidentiality
- **⚡ Latency**: Every cloud round-trip adds 300-400ms minimum
- **✈️ Offline**: Cloud AI fails on planes, remote areas, and air-gapped networks

## ✨ Features

### 💻 Dev Mode
Analyze proprietary code **100% locally** with zero cloud calls:

- **📖 Code Explanation**: Paste any function/class and get plain language explanations
- **📝 Docstring Generation**: Auto-generate JSDoc, Python docstrings, or XML comments
- **🐛 Offline Debugger**: Paste broken code + error message → get root cause + fix
- **✨ Refactor Suggestions**: Get idiomatic rewrites and best practices

**VS Code-quality Monaco Editor** with syntax highlighting for JavaScript, TypeScript, Python, Go, Rust, and Java.

### 🔬 Research Mode
Work with sensitive academic documents **without uploading anywhere**:

- **📚 Multi-PDF Loader**: Drag in dozens of papers — parsed 100% client-side via PDF.js
- **💬 Document Q&A**: Ask questions across all loaded papers with source attribution
- **📋 Chapter Outline Generator**: Cross-reference docs and draft thesis structures
- **📖 Citation Formatter**: Extract metadata and format references in APA, MLA, or IEEE

### Bonus Modes (from starter app)
- **💬 Chat**: Stream text from on-device LLM
- **📷 Vision**: Camera + VLM for image understanding
- **🎙️ Voice**: Full VAD + STT + LLM + TTS pipeline
- **🔧 Tools**: Function calling with custom tool registration

## 🏗️ Architecture

**4-Layer Fully Client-Side Stack**

```
┌─────────────────────────────────────────┐
│  Layer 1: UI (React + Vite)             │
│  Monaco Editor, PDF Viewer, Chat Panel  │
├─────────────────────────────────────────┤
│  Layer 2: App Logic (TypeScript)        │
│  PDF Parsing, Prompt Templates, History │
├─────────────────────────────────────────┤
│  Layer 3: RunAnywhere SDK               │
│  LLM Inference (WASM/WebGPU)            │
├─────────────────────────────────────────┤
│  Layer 4: Client Storage                │
│  IndexedDB + OPFS (Zero Cloud)          │
└─────────────────────────────────────────┘
```

**Key Guarantee**: Opening Chrome DevTools Network tab shows **zero outbound requests** to any AI inference endpoint.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Models download on first use and cache in your browser's Origin Private File System (OPFS).

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Core AI** | RunAnywhere SDK (`@runanywhere/web`, `@runanywhere/web-llamacpp`) |
| **LLM** | LFM2 350M Q4_K_M (LiquidAI) — 250MB, runs on-device |
| **Runtime** | llama.cpp compiled to WebAssembly/WebGPU |
| **Frontend** | React 18 + Vite 5 + TypeScript |
| **Editor** | Monaco Editor (VS Code's editor) |
| **PDF** | PDF.js (`pdfjs-dist`) for client-side parsing |
| **Storage** | OPFS (models) + IndexedDB (docs/history) + localStorage (settings) |

## 📦 What Gets Installed?

```bash
npm install
# Installs:
# - @runanywhere/web (core SDK)
# - @runanywhere/web-llamacpp (LLM inference)  
# - @runanywhere/web-onnx (STT/TTS/VAD)
# - @monaco-editor/react (code editor)
# - pdfjs-dist (PDF parsing)
# - react + react-dom
```

## 🎨 How It Works

### Dev Mode Example

```typescript
// User pastes code in Monaco Editor
const code = `function factorial(n) { ... }`;

// Local LLM explains it (no API call)
const explanation = await TextGeneration.generateStream(
  `Explain this code: ${code}`, 
  { maxTokens: 500 }
);
// → "This function calculates factorial recursively..."
```

### Research Mode Example

```typescript
// User drops PDFs → parsed client-side
const pdf = await pdfjsLib.getDocument(file).promise;
const text = await extractAllText(pdf);

// Ask questions across all docs (on-device)
const answer = await TextGeneration.generateStream(
  `Based on these papers: ${allDocTexts}\nQuestion: ${query}`,
  { maxTokens: 800 }
);
// → "According to Smith et al., ..."
```

## 🔐 Privacy Guarantees

✅ **No server backend** — static files only  
✅ **No API keys** — no cloud AI services  
✅ **No telemetry** — no analytics or tracking  
✅ **No uploads** — PDFs and code never leave browser  
✅ **No cookies** — all storage is sandboxed (IndexedDB/OPFS)  

**Proof**: Open DevTools → Network tab → interact with PrivateIDE → see 0 requests to AI endpoints

## 🌐 Deployment

### Vercel (Recommended)

```bash
npm run build
npx vercel --prod
```

The included `vercel.json` sets required COOP/COEP headers for WebAssembly threading.

### Netlify

Add `_headers` file:
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

### Any Static Host

Serve `dist/` with these HTTP headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## 🧪 Demo Script

1. **Privacy Demo**
   - Open Dev Mode → Paste sensitive code
   - Open DevTools Network tab
   - Click "Explain" → watch 0 network requests
   - Get instant explanation

2. **Offline Demo**
   - Enable airplane mode
   - Refresh page (models cached in OPFS)
   - Everything still works

3. **Research Demo**
   - Open Research Mode
   - Drag in multiple PDFs
   - Ask cross-document questions
   - Generate thesis outline
   - Format citations

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Model Size** | 250MB (LFM2 350M Q4_K_M) |
| **First Token** | <100ms (after model load) |
| **Throughput** | 10-30 tokens/sec (varies by device) |
| **Cost per Query** | $0.00 (fully local) |
| **Network Calls** | 0 (after initial model download) |

## 🌟 Use Cases

### For Developers
- Analyze proprietary code without cloud leakage
- Debug issues in air-gapped environments
- Learn new codebases on flights

### For Researchers
- Work with unpublished manuscripts safely
- Cross-reference lab results privately
- Generate thesis outlines from drafts

### For Enterprises
- Compliant alternative to ChatGPT/Copilot
- Works in secure/offline environments
- Zero data exfiltration risk

## 📚 Documentation

- [RunAnywhere SDK Docs](https://docs.runanywhere.ai/web/introduction)
- [Web Starter App](https://github.com/RunanywhereAI/web-starter-app)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)

## 🤝 Support

- [GitHub Issues](https://github.com/RunanywhereAI/runanywhere-sdks/issues)
- [Discord Community](https://discord.com/invite/N359FBbDVd)

## 📄 License

MIT

---

**Built with [RunAnywhere SDK](https://docs.runanywhere.ai) — Production-grade on-device AI for the web**
