type KeyPairRecord = {
  id: string;
  publicKey: string;
  secretKey: string;
  updatedAt: string;
};

type FingerprintRecord = {
  id: string;
  fingerprint: string;
  updatedAt: string;
};

type ReplayRecord = {
  id: string;
  messageIds: string[];
  updatedAt: string;
};

const DB_NAME = 'lancelot-e2ee';
const DB_VERSION = 1;
const STORE_KEYS = 'keys';
const STORE_FINGERPRINTS = 'fingerprints';
const STORE_REPLAY = 'replay';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FINGERPRINTS)) {
        db.createObjectStore(STORE_FINGERPRINTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REPLAY)) {
        db.createObjectStore(STORE_REPLAY, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getRecord<T>(storeName: string, id: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as T) || null);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord<T extends { id: string }>(storeName: string, record: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getKeyPair(userId: string): Promise<KeyPairRecord | null> {
  return getRecord<KeyPairRecord>(STORE_KEYS, userId);
}

export async function saveKeyPair(userId: string, publicKey: string, secretKey: string): Promise<void> {
  const record: KeyPairRecord = {
    id: userId,
    publicKey,
    secretKey,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(STORE_KEYS, record);
}

export async function getFingerprint(userId: string): Promise<string | null> {
  const record = await getRecord<FingerprintRecord>(STORE_FINGERPRINTS, userId);
  return record?.fingerprint || null;
}

export async function saveFingerprint(userId: string, fingerprint: string): Promise<void> {
  const record: FingerprintRecord = {
    id: userId,
    fingerprint,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(STORE_FINGERPRINTS, record);
}

export async function getReplayMessageIds(conversationId: string): Promise<string[]> {
  const record = await getRecord<ReplayRecord>(STORE_REPLAY, conversationId);
  return record?.messageIds || [];
}

export async function saveReplayMessageIds(conversationId: string, messageIds: string[]): Promise<void> {
  const record: ReplayRecord = {
    id: conversationId,
    messageIds,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(STORE_REPLAY, record);
}
