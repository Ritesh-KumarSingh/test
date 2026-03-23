# Quick Debugging Guide - PrivateIDE Performance Issues

## Issue: Everything Takes a Long Time

### Most Likely Causes:

1. **Model Download (First Time Only)**
   - LFM2 350M model is ~250MB
   - Download can take 2-10 minutes depending on connection
   - This only happens ONCE on first use
   - After that, model loads from OPFS cache instantly

2. **Model Loading into Memory**
   - After download, model loads into WASM
   - Takes 10-30 seconds
   - Shows "Loading model..." status

3. **First Token Generation**
   - Cold start can take 5-10 seconds
   - Subsequent generations are faster

## Quick Diagnostic Steps

### Step 1: Check Browser Console

Open Chrome DevTools (F12) → Console tab

**Look for these errors:**
- CORS errors
- COOP/COEP header errors
- SharedArrayBuffer errors
- Worker loading errors

### Step 2: Check Model Status

In the UI, look at the banner at top of Dev Mode or Research Mode:

**Status Messages:**
- "No model loaded" → Click "Download & Load"
- "Downloading model... X%" → Wait for 100%
- "Loading model..." → Wait 10-30 seconds
- "Model ready" → Ready to use!

### Step 3: Check Network Tab

Open Chrome DevTools (F12) → Network tab

**During model download, you should see:**
- Requests to `huggingface.co` (downloading model)
- Large file transfers (~250MB)

**If stuck:**
- Check if download is progressing
- Check internet connection
- Check if browser storage is full

## Quick Fixes

### Fix 1: Use Smaller Model (FASTEST!)

The LFM2 350M model is quite large. Let's try a faster approach:

**Option A: Wait for the download to complete**
- First time: 2-10 minutes
- Status bar shows progress
- After this, it's cached forever

**Option B: Clear and restart**
```bash
# Kill all node processes
pkill -f vite

# Clear browser data
# Chrome → Settings → Privacy → Clear browsing data
# Check "Cached images and files"
# Check "Site settings"

# Restart
npm run dev
```

### Fix 2: Check COOP/COEP Headers

The headers MUST be set correctly or SharedArrayBuffer won't work.

**Verify headers are working:**
1. Open http://localhost:5173
2. Open DevTools → Network tab
3. Refresh page
4. Click on the main document request
5. Look at Response Headers:
   - `Cross-Origin-Opener-Policy: same-origin` ✓
   - `Cross-Origin-Embedder-Policy: require-corp` ✓

**If headers are missing:**
```bash
# Restart dev server
pkill -f vite
npm run dev
```

### Fix 3: Check Browser Compatibility

**Requirements:**
- Chrome 96+ or Edge 96+ (recommended 120+)
- Firefox may need flags enabled

**Test in Chrome:**
```javascript
// Paste in console:
console.log('SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined');
// Should print: SharedArrayBuffer: true
```

### Fix 4: Simplify Test

Let's test with minimal functionality first:

1. **Test 1: Can you see the UI?**
   - Go to http://localhost:5173
   - Should see "PrivateIDE" header
   - Should see tabs: Dev Mode, Research Mode, etc.

2. **Test 2: Can you click Download?**
   - Click "Dev Mode" tab
   - See "Download & Load" button
   - Click it
   - Watch progress bar

3. **Test 3: Wait for model**
   - Be patient - first download takes time
   - Watch the percentage increase
   - Wait for "Model ready"

## Performance Expectations

### First Time Use:
```
Model Download:    2-10 minutes (one-time, 250MB)
Model Loading:     10-30 seconds
First Generation:  5-10 seconds
```

### After First Use:
```
Model Loading:     0-5 seconds (from cache)
First Generation:  1-3 seconds
Subsequent:        Instant streaming
```

## Common Issues & Solutions

### Issue: "Download stuck at 0%"
**Solution:** Check internet connection, try refreshing

### Issue: "Model ready but nothing happens when I click buttons"
**Solution:** 
1. Check browser console for errors
2. Try clicking "Explain" button again
3. Make sure there's code in the editor

### Issue: "Everything is slow after model loaded"
**Solution:** This is normal for on-device inference
- Expected: 10-30 tokens/second
- This is MUCH slower than cloud APIs
- But it's 100% private and offline

### Issue: "Browser crashes or freezes"
**Solution:**
- Model is too large for your device
- Need at least 4GB RAM
- Try closing other tabs
- Try using a more powerful device

## Debug Commands

```bash
# Check dev server logs
tail -f logs.txt

# Check if model is cached
# Open DevTools → Application → Storage
# Look for: OPFS / IndexedDB entries

# Check model size in OPFS
# DevTools → Application → Storage → OPFS
# Should see ~250MB file

# Clear everything and start fresh
# DevTools → Application → Clear storage
# Click "Clear site data"
```

## Still Having Issues?

### Collect Debug Info:

1. **Browser Console Output**
   - Copy all errors
   - Look for red text

2. **Network Tab**
   - Is anything downloading?
   - Any failed requests?

3. **Model Status**
   - What does the banner say?
   - What percentage is download at?

4. **System Info**
   - What browser/version?
   - How much RAM?
   - Internet speed?

### Quick Test: Try Chat Tab First

The Chat, Vision, Voice tabs might work better as they were from the original starter:

1. Click "Chat" tab
2. Click "Download & Load"
3. Wait for model
4. Type: "Hello, how are you?"
5. Press Send

If Chat works but Dev/Research don't, there's a bug in my implementation.

## Expected Timeline (First Use)

```
[0:00] Start app → UI loads instantly ✓
[0:05] Click Download & Load
[0:10] Download starts (see progress bar)
[2:00] Still downloading... be patient!
[5:00] Download complete (varies by connection)
[5:10] "Loading model..." appears
[5:30] "Model ready" appears ✓
[5:35] Click "Explain" with code
[5:40] First token appears!
[5:45] Tokens streaming...
[6:00] Complete! ✓
```

**The key is patience on first load!**

After the first time, everything is instant because the model is cached.
