/**
 * IndexedDB wrapper for persisting documents and chat history
 * Provides 100% client-side storage with no cloud dependencies
 */

const DB_NAME = 'PrivateIDE';
const DB_VERSION = 1;
const DOCUMENTS_STORE = 'documents';
const HISTORY_STORE = 'history';

let dbInstance: IDBDatabase | null = null;

export interface StoredDocument {
  id: string;
  name: string;
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  timestamp: number;
}

export interface ChatHistoryEntry {
  id: string;
  mode: 'dev' | 'research' | 'chat';
  query: string;
  response: string;
  timestamp: number;
  action?: string; // For dev mode: explain, docstring, debug, refactor
}

// Helper for Dev Mode history
export async function saveDevHistory(code: string, action: string, output: string): Promise<void> {
  return saveHistory({
    id: `dev-${Date.now()}`,
    mode: 'dev',
    query: code,
    response: output,
    action,
    timestamp: Date.now(),
  });
}

// Helper for Research Mode history  
export async function saveResearchHistory(question: string, answer: string): Promise<void> {
  return saveHistory({
    id: `research-${Date.now()}`,
    mode: 'research',
    query: question,
    response: answer,
    timestamp: Date.now(),
  });
}

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Documents store
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const docStore = db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
        docStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // History store
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const histStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        histStore.createIndex('mode', 'mode', { unique: false });
        histStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Document operations
export async function saveDocument(doc: StoredDocument): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.put(doc);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDocuments(): Promise<StoredDocument[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, 'readonly');
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearDocuments(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// History operations
export async function saveHistory(entry: ChatHistoryEntry): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getHistory(mode?: 'dev' | 'research' | 'chat'): Promise<ChatHistoryEntry[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    const store = tx.objectStore(HISTORY_STORE);
    
    let request: IDBRequest;
    if (mode) {
      const index = store.index('mode');
      request = index.getAll(mode);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const results: ChatHistoryEntry[] = request.result || [];
      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
