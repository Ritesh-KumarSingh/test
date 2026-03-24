/**
 * RunAnywhere SDK initialization and model catalog.
 *
 * This module:
 * 1. Initializes the core SDK (TypeScript-only, no WASM)
 * 2. Registers the LlamaCPP backend (loads LLM/VLM WASM)
 * 3. Registers the ONNX backend (sherpa-onnx — STT/TTS/VAD)
 * 4. Registers the model catalog and wires up VLM worker
 *
 * Import this module once at app startup.
 */

import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  type CompactModelDef,
} from '@runanywhere/web';

import { LlamaCPP, VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { ONNX } from '@runanywhere/web-onnx';

// Vite bundles the worker as a standalone JS chunk and returns its URL.
// @ts-ignore — Vite-specific ?worker&url query
import vlmWorkerUrl from './workers/vlm-worker?worker&url';

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

const MODELS: CompactModelDef[] = [
  // LLM — Liquid AI LFM2 350M (small + fast for chat)
  {
    id: 'lfm2-350m-q4_k_m',
    name: 'LFM2 350M Q4_K_M',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
  // LLM — Liquid AI LFM2 1.2B Tool (optimized for tool calling & function calling)
  {
    id: 'lfm2-1.2b-tool-q4_k_m',
    name: 'LFM2 1.2B Tool Q4_K_M',
    repo: 'LiquidAI/LFM2-1.2B-Tool-GGUF',
    files: ['LFM2-1.2B-Tool-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 800_000_000,
  },
  // VLM — Liquid AI LFM2-VL 450M (vision + language)
  {
    id: 'lfm2-vl-450m-q4_0',
    name: 'LFM2-VL 450M Q4_0',
    repo: 'runanywhere/LFM2-VL-450M-GGUF',
    files: ['LFM2-VL-450M-Q4_0.gguf', 'mmproj-LFM2-VL-450M-Q8_0.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Multimodal,
    memoryRequirement: 500_000_000,
  },
  // STT (sherpa-onnx archive)
  {
    id: 'sherpa-onnx-whisper-tiny.en',
    name: 'Whisper Tiny English (ONNX)',
    url: 'https://huggingface.co/runanywhere/sherpa-onnx-whisper-tiny.en/resolve/main/sherpa-onnx-whisper-tiny.en.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechRecognition,
    memoryRequirement: 105_000_000,
    artifactType: 'archive' as const,
  },
  // TTS (sherpa-onnx archive)
  {
    id: 'vits-piper-en_US-lessac-medium',
    name: 'Piper TTS US English (Lessac)',
    url: 'https://huggingface.co/runanywhere/vits-piper-en_US-lessac-medium/resolve/main/vits-piper-en_US-lessac-medium.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechSynthesis,
    memoryRequirement: 65_000_000,
    artifactType: 'archive' as const,
  },
  // VAD (single ONNX file)
  {
    id: 'silero-vad-v5',
    name: 'Silero VAD v5',
    url: 'https://huggingface.co/runanywhere/silero-vad-v5/resolve/main/silero_vad.onnx',
    files: ['silero_vad.onnx'],
    framework: LLMFramework.ONNX,
    modality: ModelCategory.Audio,
    memoryRequirement: 5_000_000,
  },
];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;

/** Detect WebGPU + JSPI availability and log details */
async function diagnoseWebGPU(): Promise<boolean> {
  console.group('🔍 WebGPU Diagnostics');

  // Check navigator.gpu
  const hasGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  console.log(`  navigator.gpu: ${hasGPU ? '✅ Available' : '❌ Not available'}`);

  if (hasGPU) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || {};
        console.log(`  GPU Adapter: ✅ ${info.vendor || 'unknown'} - ${info.device || 'unknown'}`);
        console.log(`  Architecture: ${info.architecture || 'unknown'}`);

        const features = [...(adapter.features || [])];
        console.log(`  Features: ${features.length} (${features.slice(0, 5).join(', ')}${features.length > 5 ? '...' : ''})`);
      } else {
        console.log('  GPU Adapter: ❌ No adapter returned');
      }
    } catch (err) {
      console.log(`  GPU Adapter: ❌ Error: ${err}`);
    }
  }

  // Check JSPI
  const hasPromising = typeof WebAssembly !== 'undefined' && 'promising' in WebAssembly;
  const hasSuspending = typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly;
  console.log(`  WebAssembly.promising: ${hasPromising ? '✅' : '❌'}`);
  console.log(`  WebAssembly.Suspending: ${hasSuspending ? '✅' : '❌'}`);

  const canUseWebGPU = hasGPU && hasPromising && hasSuspending;
  console.log(`  ➡️ Can use WebGPU WASM: ${canUseWebGPU ? '✅ YES' : '❌ NO'}`);

  if (!canUseWebGPU) {
    if (!hasGPU) {
      console.warn('  💡 Enable WebGPU: chrome://flags/#enable-unsafe-webgpu');
    }
    if (!hasPromising || !hasSuspending) {
      console.warn('  💡 Enable JSPI: chrome://flags/#enable-experimental-webassembly-jspi');
    }
  }

  console.groupEnd();
  return canUseWebGPU;
}

/** Initialize the RunAnywhere SDK. Safe to call multiple times. */
export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Step 1: Initialize core SDK (TypeScript-only, no WASM)
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: true,
    });

    // Step 2: Diagnose WebGPU capability
    const canUseWebGPU = await diagnoseWebGPU();

    // Step 3: Register LlamaCPP with best available acceleration
    if (canUseWebGPU) {
      try {
        await LlamaCPP.register({ acceleration: 'webgpu' });
        console.log(`🚀 LlamaCPP loaded with: ${LlamaCPP.accelerationMode.toUpperCase()}`);
      } catch (err) {
        console.warn(`⚠️ WebGPU WASM failed: ${err}. Falling back to CPU...`);
        await LlamaCPP.register({ acceleration: 'cpu' });
        console.log(`⚙️ LlamaCPP loaded with: ${LlamaCPP.accelerationMode.toUpperCase()} (fallback)`);
      }
    } else {
      await LlamaCPP.register({ acceleration: 'cpu' });
      console.log(`⚙️ LlamaCPP loaded with: CPU (WebGPU not available)`);
    }

    await ONNX.register();

    // Step 4: Register model catalog
    RunAnywhere.registerModels(MODELS);

    // Step 5: Wire up VLM worker
    VLMWorkerBridge.shared.workerUrl = vlmWorkerUrl;
    RunAnywhere.setVLMLoader({
      get isInitialized() { return VLMWorkerBridge.shared.isInitialized; },
      init: () => VLMWorkerBridge.shared.init(),
      loadModel: (params) => VLMWorkerBridge.shared.loadModel(params),
      unloadModel: () => VLMWorkerBridge.shared.unloadModel(),
    });
  })();

  return _initPromise;
}

/** Get acceleration mode after init. */
export function getAccelerationMode(): string | null {
  return LlamaCPP.isRegistered ? LlamaCPP.accelerationMode : null;
}

// Re-export for convenience
export { RunAnywhere, ModelManager, ModelCategory, VLMWorkerBridge };
