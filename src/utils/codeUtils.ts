/**
 * Parse LLM refactor output to extract original and refactored code blocks
 */
export function parseRefactorOutput(output: string, originalCode: string): {
  originalCode: string;
  refactoredCode: string;
} | null {
  // Try to extract code blocks from markdown
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
  const matches = [...output.matchAll(codeBlockRegex)];

  if (matches.length >= 2) {
    // Assume first block is original (or skip it), second is refactored
    // If there's only one block, use it as refactored and compare with original
    return {
      originalCode: originalCode,
      refactoredCode: matches[matches.length - 1][1].trim(),
    };
  }

  if (matches.length === 1) {
    return {
      originalCode: originalCode,
      refactoredCode: matches[0][1].trim(),
    };
  }

  // Fallback: look for "Refactored:" or similar markers
  const refactoredMatch = output.match(/(?:refactored|improved|updated)[\s:]+```(?:\w+)?\n([\s\S]*?)```/i);
  if (refactoredMatch) {
    return {
      originalCode: originalCode,
      refactoredCode: refactoredMatch[1].trim(),
    };
  }

  // No code blocks found
  return null;
}

/**
 * Detect language from code content
 */
export function detectLanguageFromCode(code: string): string {
  const trimmedCode = code.trim();
  
  // Python detection
  if (/\bdef\s+\w+\s*\(/.test(trimmedCode) || 
      /\bimport\s+\w+/.test(trimmedCode) ||
      /\bclass\s+\w+\s*:/.test(trimmedCode) ||
      /__init__/.test(trimmedCode)) {
    return 'python';
  }

  // Go detection
  if (/\bfunc\s+\w+\s*\(/.test(trimmedCode) || 
      /\bpackage\s+\w+/.test(trimmedCode) ||
      /:=/.test(trimmedCode)) {
    return 'go';
  }

  // TypeScript detection (before JavaScript)
  if (/\binterface\s+\w+/.test(trimmedCode) ||
      /\btype\s+\w+\s*=/.test(trimmedCode) ||
      /:\s*\w+(\[\]|\|)/.test(trimmedCode)) {
    return 'typescript';
  }

  // JavaScript detection
  if (/\b(const|let|var)\s+\w+/.test(trimmedCode) ||
      /\bfunction\s+\w+\s*\(/.test(trimmedCode) ||
      /\bconsole\.log/.test(trimmedCode) ||
      /=>\s*{/.test(trimmedCode) ||
      /\bimport\s+.*\bfrom\b/.test(trimmedCode)) {
    return 'javascript';
  }

  // Rust detection
  if (/\bfn\s+\w+\s*\(/.test(trimmedCode) ||
      /\blet\s+mut\b/.test(trimmedCode) ||
      /\bimpl\s+/.test(trimmedCode)) {
    return 'rust';
  }

  // Java detection
  if (/\bpublic\s+class\s+\w+/.test(trimmedCode) ||
      /\bprivate\s+\w+\s+\w+/.test(trimmedCode) ||
      /\bSystem\.out\.print/.test(trimmedCode)) {
    return 'java';
  }

  // C/C++ detection
  if (/#include\s*</.test(trimmedCode) ||
      /\bint\s+main\s*\(/.test(trimmedCode) ||
      /\bstd::/.test(trimmedCode)) {
    return 'cpp';
  }

  // Default to javascript
  return 'javascript';
}

/**
 * Estimate token count (approximate: 1 token ≈ 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.round(text.length / 4);
}
