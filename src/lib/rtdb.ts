/**
 * src/lib/rtdb.ts
 * Инициализация Firebase Realtime Database для клиента.
 * Использует уже инициализированный app из firebase.ts.
 */
import { getApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { browser } from '$app/environment';

let _db: Database | null = null;

export function getRtdb(): Database {
  if (!browser) throw new Error('RTDB доступен только в браузере');
  if (!_db) _db = getDatabase(getApp());
  return _db;
}
