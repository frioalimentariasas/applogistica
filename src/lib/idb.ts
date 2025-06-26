// A simple key-value store using IndexedDB
const DB_NAME = 'frio-alimentaria-db';
const STORE_NAME = 'keyval';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject('IndexedDB can only be used in the browser.');
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
  });
}

function withStore(type: IDBTransactionMode, callback: (store: IDBObjectStore) => void): Promise<void> {
  return getDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, type);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      callback(transaction.objectStore(STORE_NAME));
    });
  });
}

export async function get<T>(key: IDBValidKey): Promise<T | undefined> {
  let request: IDBRequest;
  await withStore('readonly', store => {
    request = store.get(key);
  });
  return (request! as IDBRequest<T>).result;
}

export function set(key: IDBValidKey, value: any): Promise<void> {
  return withStore('readwrite', store => {
    store.put(value, key);
  });
}

export function del(key: IDBValidKey): Promise<void> {
  return withStore('readwrite', store => {
    store.delete(key);
  });
}

export function clear(): Promise<void> {
  return withStore('readwrite', store => {
    store.clear();
  });
}
