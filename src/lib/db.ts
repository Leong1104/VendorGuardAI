// Browser-local persistence on IndexedDB. Every table from the original
// Postgres schema is an object store; PDF originals live in `files`, keyed
// by document id. Nothing here ever leaves the device — that is the
// privacy model: there is no server to send data to.
//
// Volumes are tiny (a handful of batches), so the API is deliberately
// simple: whole-table reads filtered in JS, no secondary indexes.

import type {
  AuditEvent,
  Batch,
  Document,
  Finding,
  Supplier,
  Transaction,
} from "@/lib/types";

export interface TransactionDocument {
  transaction_id: string;
  document_id: string;
  role: string | null;
}

export interface StoredFile {
  document_id: string;
  bytes: Uint8Array;
}

interface Tables {
  batches: Batch;
  documents: Document;
  files: StoredFile;
  suppliers: Supplier;
  transactions: Transaction;
  transaction_documents: TransactionDocument;
  findings: Finding;
  audit_events: AuditEvent;
}

type Table = keyof Tables;

const DB_NAME = "vendorguard";
const DB_VERSION = 1;

// Key paths per store. `findings` and `audit_events` use auto-increment ids
// like their SQL serial columns; the composite link table uses an array key.
const KEYS: Record<Table, { keyPath: string | string[]; autoIncrement?: boolean }> = {
  batches: { keyPath: "id" },
  documents: { keyPath: "id" },
  files: { keyPath: "document_id" },
  suppliers: { keyPath: "id" },
  transactions: { keyPath: "id" },
  transaction_documents: { keyPath: ["transaction_id", "document_id"] },
  findings: { keyPath: "id", autoIncrement: true },
  audit_events: { keyPath: "id", autoIncrement: true },
};

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser"));
  }
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(KEYS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab upgrades the schema, drop our handle so we reopen.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error("Failed to open IndexedDB"));
    };
  });
  return opening;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export const db = {
  async all<T extends Table>(table: T): Promise<Tables[T][]> {
    const conn = await open();
    return request(conn.transaction(table).objectStore(table).getAll()) as Promise<
      Tables[T][]
    >;
  },

  async get<T extends Table>(table: T, key: IDBValidKey): Promise<Tables[T] | undefined> {
    const conn = await open();
    return request(conn.transaction(table).objectStore(table).get(key)) as Promise<
      Tables[T] | undefined
    >;
  },

  async count(table: Table): Promise<number> {
    const conn = await open();
    return request(conn.transaction(table).objectStore(table).count());
  },

  /** Insert or replace. Returns the key (useful for auto-increment tables). */
  async put<T extends Table>(table: T, row: Omit<Tables[T], "id"> | Tables[T]): Promise<IDBValidKey> {
    const conn = await open();
    const tx = conn.transaction(table, "readwrite");
    const key = await request(tx.objectStore(table).put(row));
    await done(tx);
    return key;
  },

  async putMany<T extends Table>(
    table: T,
    rows: (Omit<Tables[T], "id"> | Tables[T])[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const conn = await open();
    const tx = conn.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    for (const row of rows) store.put(row);
    await done(tx);
  },

  async delete(table: Table, key: IDBValidKey): Promise<void> {
    const conn = await open();
    const tx = conn.transaction(table, "readwrite");
    tx.objectStore(table).delete(key);
    await done(tx);
  },

  async deleteMany(table: Table, keys: IDBValidKey[]): Promise<void> {
    if (keys.length === 0) return;
    const conn = await open();
    const tx = conn.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    for (const key of keys) store.delete(key);
    await done(tx);
  },

  /** Wipe every table. PDPA "erase everything" — no audit record survives. */
  async clearAll(): Promise<void> {
    const conn = await open();
    const names = Object.keys(KEYS) as Table[];
    const tx = conn.transaction(names, "readwrite");
    for (const name of names) tx.objectStore(name).clear();
    await done(tx);
  },
};

/** Append an audit event; returns the stored row. */
export async function audit(
  event: Omit<AuditEvent, "id" | "created_at">
): Promise<AuditEvent> {
  const row = { ...event, created_at: new Date().toISOString() };
  const id = (await db.put("audit_events", row)) as number;
  return { id, ...row };
}
