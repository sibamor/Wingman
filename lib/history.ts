import { FUNPAY_ORIGIN } from './funpay.ts';
import { parseReviews, parseSales, parseTransactions, readContinue, type Review, type Sale, type Transaction } from './rows.ts';

export type HistoryName = 'sales' | 'purchases' | 'transactions' | 'reviews';

type RowOf = { sales: Sale; purchases: Sale; transactions: Transaction; reviews: Review };

export type HistoryRow = RowOf[HistoryName];

export type SyncState = { running: boolean; pages: number; complete: boolean; syncedAt: number; error: string | null };

type Meta = { complete: boolean; syncedAt: number; cursor: string };

const KEY_PATH: Record<HistoryName, string> = { sales: 'id', purchases: 'id', transactions: 'id', reviews: 'key' };
const PAGE_PAUSE = 900;
const FRESH_FOR = 120_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const databases = new Map<number, Promise<IDBDatabase>>();

function openDb(userId: number): Promise<IDBDatabase> {
  let db = databases.get(userId);
  if (!db) {
    db = new Promise((resolve, reject) => {
      const request = indexedDB.open(`wingman-${userId}`, 2);
      request.onupgradeneeded = () => {
        const names = request.result.objectStoreNames;
        for (const [name, keyPath] of Object.entries(KEY_PATH)) {
          if (!names.contains(name)) {
            request.result.createObjectStore(name, { keyPath });
          }
        }
        if (!names.contains('meta')) {
          request.result.createObjectStore('meta');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    databases.set(userId, db);
  }
  return db;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readAll<N extends HistoryName>(userId: number, name: N): Promise<RowOf[N][]> {
  const db = await openDb(userId);
  return done(db.transaction(name).objectStore(name).getAll()) as Promise<RowOf[N][]>;
}

async function readMeta(db: IDBDatabase, name: HistoryName): Promise<Meta> {
  return ((await done(db.transaction('meta').objectStore('meta').get(name))) as Meta | undefined) ?? { complete: false, syncedAt: 0, cursor: '' };
}

async function writeRows(db: IDBDatabase, name: HistoryName, rows: HistoryRow[]): Promise<number> {
  const store = db.transaction(name, 'readwrite').objectStore(name);
  const key = KEY_PATH[name] as keyof HistoryRow;
  let changed = 0;
  for (const row of rows) {
    const old = await done(store.get(row[key] as IDBValidKey));
    if (!old || JSON.stringify(old) !== JSON.stringify(row)) {
      changed += 1;
      store.put(row);
    }
  }
  return changed;
}

async function load(url: string, form?: Record<string, string>): Promise<Document> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      method: form ? 'POST' : 'GET',
      credentials: 'include',
      headers: form ? { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {},
      body: form ? new URLSearchParams(form) : undefined,
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(Math.min(30_000, Number(response.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      throw new Error(`FunPay ответил ${response.status}`);
    }
    if (response.url.includes('/account/login')) {
      throw new Error('Нужно войти на FunPay');
    }
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }
  throw new Error('FunPay не отвечает, попробуйте позже');
}

type Source = { first: () => Promise<Document>; next: (cursor: string) => Promise<Document>; parse: (doc: Document) => HistoryRow[] };

function source(name: HistoryName, userId: number): Source {
  if (name === 'sales') {
    return {
      first: () => load(`${FUNPAY_ORIGIN}/orders/trade`),
      next: (cursor) => load(`${FUNPAY_ORIGIN}/orders/trade`, { continue: cursor }),
      parse: (doc) => parseSales(doc),
    };
  }
  if (name === 'purchases') {
    return {
      first: () => load(`${FUNPAY_ORIGIN}/orders/`),
      next: (cursor) => load(`${FUNPAY_ORIGIN}/orders/`, { continue: cursor }),
      parse: (doc) => parseSales(doc),
    };
  }
  if (name === 'transactions') {
    return {
      first: () => load(`${FUNPAY_ORIGIN}/account/balance`),
      next: (cursor) => load(`${FUNPAY_ORIGIN}/users/transactions`, { user_id: String(userId), continue: cursor, filter: '' }),
      parse: (doc) => parseTransactions(doc),
    };
  }
  return {
    first: () => load(`${FUNPAY_ORIGIN}/users/${userId}/`),
    next: (cursor) => load(`${FUNPAY_ORIGIN}/users/reviews`, { user_id: String(userId), continue: cursor, filter: '' }),
    parse: (doc) => parseReviews(doc),
  };
}

const states = new Map<string, SyncState>();
const listeners = new Set<(name: HistoryName) => void>();

export function onHistoryChange(listener: (name: HistoryName) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(name: HistoryName) {
  for (const listener of listeners) {
    listener(name);
  }
}

export function syncState(userId: number, name: HistoryName): SyncState {
  return states.get(`${userId}:${name}`) ?? { running: false, pages: 0, complete: false, syncedAt: 0, error: null };
}

export async function syncHistory(userId: number, name: HistoryName, force = false): Promise<void> {
  const db = await openDb(userId);
  const meta = await readMeta(db, name);
  const id = `${userId}:${name}`;
  const state: SyncState = { running: false, pages: 0, complete: meta.complete, syncedAt: meta.syncedAt, error: null };
  states.set(id, state);
  if (!force && meta.complete && Date.now() - meta.syncedAt < FRESH_FOR) {
    emit(name);
    return;
  }
  await navigator.locks.request(`wingman-sync-${id}`, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      return;
    }
    state.running = true;
    emit(name);
    const { first, next, parse } = source(name, userId);
    try {
      let doc = await first();
      const seen = new Set<string>();
      let resumed = false;
      for (;;) {
        const rows = parse(doc);
        const changed = await writeRows(db, name, rows);
        state.pages += 1;
        emit(name);
        const cursor = readContinue(doc);
        if (!cursor || !rows.length || seen.has(cursor)) {
          meta.complete = true;
          break;
        }
        if (!changed && meta.complete) {
          break;
        }
        seen.add(cursor);
        await sleep(PAGE_PAUSE);
        const jump: string = !changed && !resumed && meta.cursor && !seen.has(meta.cursor) ? meta.cursor : cursor;
        resumed ||= jump !== cursor;
        doc = await next(jump);
        if (!meta.complete) {
          meta.cursor = jump;
          await done(db.transaction('meta', 'readwrite').objectStore('meta').put(meta, name));
        }
      }
      meta.syncedAt = Date.now();
      await done(db.transaction('meta', 'readwrite').objectStore('meta').put(meta, name));
      state.complete = meta.complete;
      state.syncedAt = meta.syncedAt;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.running = false;
      emit(name);
    }
  });
}
