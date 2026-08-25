type Store = Map<IDBValidKey, unknown>;

export function installMemoryIndexedDB(): () => void {
  const previous = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  const databases = new Map<string, Map<string, Store>>();
  const schedule = (fn: () => void) => queueMicrotask(fn);

  const memoryIndexedDB = {
    open(name: string, _version?: number) {
      const request: {
        result: unknown;
        error: unknown;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((event: { target: unknown }) => void) | null;
      } = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };
      schedule(() => {
        let stores = databases.get(name);
        const isNew = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }
        const dbStores = stores;
        const db = {
          objectStoreNames: {
            contains: (storeName: string) => dbStores.has(storeName)
          },
          createObjectStore(storeName: string) {
            if (!dbStores.has(storeName)) dbStores.set(storeName, new Map());
          },
          transaction(storeName: string, _mode?: string) {
            if (!dbStores.has(storeName)) dbStores.set(storeName, new Map());
            const store = dbStores.get(storeName)!;
            const tx: {
              oncomplete: (() => void) | null;
              onerror: (() => void) | null;
              error: unknown;
              objectStore: () => {
                put: (value: unknown, key: IDBValidKey) => void;
                get: (key: IDBValidKey) => { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
                clear: () => void;
              };
            } = {
              oncomplete: null,
              onerror: null,
              error: null,
              objectStore() {
                return {
                  put(value: unknown, key: IDBValidKey) {
                    store.set(key, structuredClone(value));
                  },
                  get(key: IDBValidKey) {
                    const req: {
                      result: unknown;
                      onsuccess: (() => void) | null;
                      onerror: (() => void) | null;
                    } = { result: undefined, onsuccess: null, onerror: null };
                    schedule(() => {
                      req.result = store.has(key) ? structuredClone(store.get(key)) : undefined;
                      req.onsuccess?.();
                    });
                    return req;
                  },
                  clear() {
                    store.clear();
                  }
                };
              }
            };
            schedule(() => tx.oncomplete?.());
            return tx;
          }
        };
        request.result = db;
        if (isNew) {
          request.onupgradeneeded?.({ target: request });
        }
        request.onsuccess?.();
      });
      return request;
    }
  };

  (globalThis as { indexedDB: IDBFactory }).indexedDB = memoryIndexedDB as unknown as IDBFactory;
  return () => {
    if (previous === undefined) {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    } else {
      (globalThis as { indexedDB: IDBFactory }).indexedDB = previous;
    }
  };
}
