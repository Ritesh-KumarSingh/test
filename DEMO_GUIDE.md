# PrivateIDE Demo Guide

## 🎬 Killer Demo Script (3 minutes)

### Demo 1: Privacy Guarantee (Dev Mode)
**Duration**: 60 seconds

1. Open PrivateIDE at http://localhost:5173
2. Click **Dev Mode** tab
3. Open Chrome DevTools (F12) → **Network** tab
4. Paste proprietary code example:
   ```python
   def calculate_profit_margin(revenue, costs):
       return ((revenue - costs) / revenue) * 100
   ```
5. Click **📖 Explain**
6. Watch the LLM explain the code **instantly**
7. **Point at Network tab**: "Zero requests to any AI API"
8. **Key message**: "Your proprietary code never left this browser"

---

### Demo 2: Offline Capability
**Duration**: 30 seconds

1. Wait for model to fully load (watch model banner)
2. Enable **Airplane Mode** on your computer
3. Paste new code and click **Explain**
4. It still works!
5. **Key message**: "Works on planes, in secure facilities, anywhere"

---

### Demo 3: Research Mode (Multi-PDF Q&A)
**Duration**: 90 seconds

1. Click **🔬 Research Mode** tab
2. Drag & drop 2-3 PDF research papers
3. Watch them parse **client-side** (no upload spinner!)
4. Ask: "What are the key findings across all papers?"
5. LLM synthesizes answer with citations
6. Click **📋 Generate Outline** → instant thesis structure
7. **Key message**: "PhD students can work with unpublished data safely"

---

## 🎯 Key Talking Points

### Problem Framing
- "Cloud AI costs up to $84K/month for 10K users"
- "Engineers pasting code into ChatGPT = IP leakage risk"
- "Researchers uploading papers = academic integrity breach"
- "Every cloud call adds 300-400ms latency"

### Solution Value
- **Zero API costs**: Fully local inference
- **Zero data leakage**: Nothing leaves the device
- **Zero latency**: Sub-100ms first token
- **Zero network**: Works completely offline

### Technical Highlights
- Uses RunAnywhere SDK's WebAssembly inference engine
- LFM2 350M model (250MB) cached in browser OPFS
- Monaco Editor = VS Code quality editing
- PDF.js = 100% client-side PDF parsing

---

## 🧪 Live Feature Demos

### Dev Mode Features

**1. Code Explanation**
```javascript
// Paste this:
async function fetchUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}
```
Click **📖 Explain** → Get plain English explanation

**2. Docstring Generation**
```python
# Paste this:
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)
```
Click **📝 Docstring** → Get Python docstring

**3. Debug Broken Code**
```javascript
// Paste this:
function calculateAverage(numbers) {
    let sum = 0;
    for (let i = 0; i <= numbers.length; i++) {
        sum += numbers[i];
    }
    return sum / numbers.length;
}
```
Add error: `TypeError: Cannot read property '0' of undefined`
Click **🐛 Debug** → Get root cause + fix

**4. Refactor Suggestions**
```javascript
// Paste this messy code:
function processData(data) {
    var result = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i].status == 'active') {
            result.push(data[i]);
        }
    }
    return result;
}
```
Click **✨ Refactor** → Get modern, idiomatic version

---

### Research Mode Features

**1. Multi-PDF Upload**
- Drag 5+ research papers at once
- Watch parse in real-time
- No upload progress bar = fully local!

**2. Document Q&A**
Example queries:
- "What methodologies are common across all papers?"
- "Compare the results from Smith et al. and Jones et al."
- "What gaps in research do these papers identify?"

**3. Thesis Outline Generator**
- Load papers related to your research topic
- Click **📋 Generate Outline**
- Get complete chapter structure with key points

**4. Citation Formatter**
- Click **📖 Format Citations**
- Get APA/MLA/IEEE formatted references
- Auto-extracted from PDF metadata

---

## 🏆 Judging Criteria Highlights

### Innovation
- **Novel use case**: Local-first AI for sensitive code/research
- **Dual persona**: Dev + Research = 2x addressable market
- **Underserved users**: Enterprises, academics, privacy-conscious devs

### Technical Execution
- ✅ RunAnywhere SDK integrated correctly
- ✅ OPFS model caching working
- ✅ Streaming token generation
- ✅ Monaco Editor integration
- ✅ PDF.js client-side parsing
- ✅ IndexedDB persistence

### UX
- **VS Code-quality editing**: Monaco Editor
- **Sub-100ms inference**: No spinners after model load
- **Clear mode distinction**: Dev vs Research tabs
- **Privacy indicators**: "🔒 100% local" messaging

### Practical Impact
- Solves real compliance issues (no cloud AI)
- Works in air-gapped environments
- Zero marginal cost per user
- Visual proof: DevTools Network tab shows 0 requests

---

## 📊 Performance Metrics to Highlight

| Metric | Value |
|--------|-------|
| **Cost per query** | $0.00 |
| **First token latency** | <100ms |
| **Network requests** | 0 (after model download) |
| **Model size** | 250MB (cached forever) |
| **Throughput** | 10-30 tok/s (device-dependent) |

---

## 🎤 One-Liner Pitch

> "PrivateIDE is ChatGPT for developers and researchers who can't use ChatGPT — because it runs 100% in the browser with zero cloud dependencies."

---

## 🚀 Next Steps After Demo

1. Test on different browsers (Chrome, Edge)
2. Deploy to Vercel for public URL
3. Record demo video showing Network tab
4. Share on social media with #OnDeviceAI
5. Get feedback from target users (devs, researchers)

---

Built with ❤️ using [RunAnywhere SDK](https://docs.runanywhere.ai)
