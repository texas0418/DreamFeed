// src/dbCore.ts
// Pure module: SQL schema/migrations and row<->model mapping.
// No expo imports so it can be tested in Node against node:sqlite.

import type { BabyEvent, DiaperType, EventKind, NurseSide } from './models';

/** Each entry is the batch of statements that upgrades user_version N-1 -> N.
 *  MIGRATIONS[0] builds version 1. Append only; never edit shipped entries. */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER,
      amount_ml INTEGER,
      side TEXT,
      diaper_type TEXT,
      note TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_ms)`,
    `CREATE INDEX IF NOT EXISTS idx_events_running ON events(start_ms) WHERE end_ms IS NULL`,
  ],
];

export const TARGET_DB_VERSION = MIGRATIONS.length;

export interface EventRow {
  id: number;
  kind: string;
  start_ms: number;
  end_ms: number | null;
  amount_ml: number | null;
  side: string | null;
  diaper_type: string | null;
  note: string;
}

export function rowToEvent(r: EventRow): BabyEvent {
  return {
    id: r.id,
    kind: r.kind as EventKind,
    startMs: r.start_ms,
    endMs: r.end_ms,
    amountMl: r.amount_ml,
    side: (r.side as NurseSide | null) ?? null,
    diaperType: (r.diaper_type as DiaperType | null) ?? null,
    note: r.note ?? '',
  };
}

/** Positional params matching INSERT_EVENT_SQL / UPDATE_EVENT_SQL column order. */
export function eventToParams(
  e: BabyEvent,
): [string, number, number | null, number | null, string | null, string | null, string] {
  return [e.kind, e.startMs, e.endMs, e.amountMl, e.side, e.diaperType, e.note ?? ''];
}

export const INSERT_EVENT_SQL = `INSERT INTO events
  (kind, start_ms, end_ms, amount_ml, side, diaper_type, note)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

export const UPDATE_EVENT_SQL = `UPDATE events SET
  kind = ?, start_ms = ?, end_ms = ?, amount_ml = ?, side = ?, diaper_type = ?, note = ?
  WHERE id = ?`;

export const END_EVENT_SQL = `UPDATE events SET end_ms = ? WHERE id = ? AND end_ms IS NULL`;

export const DELETE_EVENT_SQL = `DELETE FROM events WHERE id = ?`;

export const GET_EVENT_SQL = `SELECT * FROM events WHERE id = ?`;

/** Everything overlapping [startMs, endMs): running timers and sleeps that
 *  span midnight are included; summarizeDay clips zero-overlap edges. */
export const LIST_BETWEEN_SQL = `SELECT * FROM events
  WHERE start_ms < ? AND (end_ms IS NULL OR end_ms >= ?)
  ORDER BY start_ms DESC`;

export const LIST_RECENT_SQL = `SELECT * FROM events ORDER BY start_ms DESC LIMIT ?`;

export const RUNNING_EVENTS_SQL = `SELECT * FROM events WHERE end_ms IS NULL ORDER BY start_ms DESC`;

export const LAST_FEED_SQL = `SELECT * FROM events
  WHERE kind IN ('bottle', 'nurse') AND start_ms <= ?
  ORDER BY start_ms DESC LIMIT 1`;

export const LAST_NURSE_SQL = `SELECT * FROM events
  WHERE kind = 'nurse' AND side IS NOT NULL
  ORDER BY start_ms DESC LIMIT 1`;

export const COUNT_EVENTS_SQL = `SELECT COUNT(*) AS n FROM events`;

export const ALL_EVENTS_SQL = `SELECT * FROM events ORDER BY start_ms ASC`;

export const DELETE_ALL_EVENTS_SQL = `DELETE FROM events`;
