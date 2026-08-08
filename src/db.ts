// src/db.ts
// expo-sqlite wrapper. All SQL and mapping live in dbCore.ts (pure, tested).
// Billowe pattern: lazy singleton, PRAGMA user_version migrations in a
// transaction, integer epoch-ms everywhere.

import * as SQLite from 'expo-sqlite';
import type { BabyEvent } from './models';
import {
  ALL_EVENTS_SQL,
  COUNT_EVENTS_SQL,
  DELETE_ALL_EVENTS_SQL,
  DELETE_EVENT_SQL,
  END_EVENT_SQL,
  EventRow,
  GET_EVENT_SQL,
  INSERT_EVENT_SQL,
  LAST_FEED_SQL,
  LAST_NURSE_SQL,
  LIST_BETWEEN_SQL,
  LIST_RECENT_SQL,
  MIGRATIONS,
  RUNNING_EVENTS_SQL,
  UPDATE_EVENT_SQL,
  eventToParams,
  rowToEvent,
} from './dbCore';

const DB_NAME = 'dreamfeed.db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync('PRAGMA journal_mode = WAL');
    runMigrations(db);
  }
  return db;
}

function runMigrations(d: SQLite.SQLiteDatabase): void {
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const batch = MIGRATIONS[version];
    d.withTransactionSync(() => {
      for (const sql of batch) d.execSync(sql);
    });
    version++;
    d.execSync(`PRAGMA user_version = ${version}`);
  }
}

export function insertEvent(e: BabyEvent): number {
  const res = getDb().runSync(INSERT_EVENT_SQL, eventToParams(e));
  return Number(res.lastInsertRowId);
}

export function updateEvent(e: BabyEvent): void {
  if (e.id == null) throw new Error('updateEvent requires id');
  getDb().runSync(UPDATE_EVENT_SQL, [...eventToParams(e), e.id]);
}

/** Stop a running timer. No-op if already ended. */
export function endEvent(id: number, endMs: number): void {
  getDb().runSync(END_EVENT_SQL, [endMs, id]);
}

export function deleteEvent(id: number): void {
  getDb().runSync(DELETE_EVENT_SQL, [id]);
}

export function getEvent(id: number): BabyEvent | null {
  const row = getDb().getFirstSync<EventRow>(GET_EVENT_SQL, [id]);
  return row ? rowToEvent(row) : null;
}

/** Events overlapping [startMs, endMs) — feeds/diapers that started in the
 *  window plus any sleep/timer overlapping it (including still running). */
export function listEventsBetween(startMs: number, endMs: number): BabyEvent[] {
  return getDb().getAllSync<EventRow>(LIST_BETWEEN_SQL, [endMs, startMs]).map(rowToEvent);
}

export function listRecentEvents(limit: number): BabyEvent[] {
  return getDb().getAllSync<EventRow>(LIST_RECENT_SQL, [limit]).map(rowToEvent);
}

export function getRunningEvents(): BabyEvent[] {
  return getDb().getAllSync<EventRow>(RUNNING_EVENTS_SQL).map(rowToEvent);
}

export function getLastFeed(nowMs: number): BabyEvent | null {
  const row = getDb().getFirstSync<EventRow>(LAST_FEED_SQL, [nowMs]);
  return row ? rowToEvent(row) : null;
}

/** Total logged events of every kind (feeds + sleeps + diapers). */
export function countEvents(): number {
  const row = getDb().getFirstSync<{ n: number }>(COUNT_EVENTS_SQL);
  return row?.n ?? 0;
}

export function getLastNurse(): BabyEvent | null {
  const row = getDb().getFirstSync<EventRow>(LAST_NURSE_SQL);
  return row ? rowToEvent(row) : null;
}

// ------------------------------------------------------------------ backup

export function getAllEvents(): BabyEvent[] {
  return getDb().getAllSync<EventRow>(ALL_EVENTS_SQL).map(rowToEvent);
}

/** Restore: replace-all inside one transaction (Billowe backup semantics). */
export function replaceAllEvents(events: BabyEvent[]): void {
  const d = getDb();
  d.withTransactionSync(() => {
    d.execSync(DELETE_ALL_EVENTS_SQL);
    for (const e of events) d.runSync(INSERT_EVENT_SQL, eventToParams(e));
  });
}
