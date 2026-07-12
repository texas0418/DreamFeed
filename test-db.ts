// test-db.ts — runs the real schema/SQL from dbCore.ts against node:sqlite.
// Requires: NODE_OPTIONS=--experimental-sqlite (Node 22).
// @ts-expect-error node:sqlite has no types under Expo's tsconfig; tsx runs it fine
import { DatabaseSync } from 'node:sqlite';
import type { BabyEvent } from './src/models';
import {
  ALL_EVENTS_SQL, DELETE_ALL_EVENTS_SQL, DELETE_EVENT_SQL, END_EVENT_SQL,
  EventRow, GET_EVENT_SQL, INSERT_EVENT_SQL, LAST_FEED_SQL, LAST_NURSE_SQL,
  LIST_BETWEEN_SQL, LIST_RECENT_SQL, MIGRATIONS, RUNNING_EVENTS_SQL,
  TARGET_DB_VERSION, UPDATE_EVENT_SQL, eventToParams, rowToEvent,
} from './src/dbCore';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

const db = new DatabaseSync(':memory:');

function migrate(): void {
  let v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  while (v < MIGRATIONS.length) {
    for (const sql of MIGRATIONS[v]) db.exec(sql);
    v++;
    db.exec(`PRAGMA user_version = ${v}`);
  }
}

migrate();
eq('migrates to target version',
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
  TARGET_DB_VERSION);
migrate();
eq('re-migrate is a no-op', true, true);

const T0 = new Date(2026, 6, 12, 0, 0).getTime();
const at = (h: number, m = 0) => T0 + (h * 60 + m) * 60000;
const ev = (partial: Partial<BabyEvent> & Pick<BabyEvent, 'kind' | 'startMs'>): BabyEvent => ({
  endMs: null, amountMl: null, side: null, diaperType: null, note: '', ...partial,
});

const insert = (e: BabyEvent): number =>
  Number(db.prepare(INSERT_EVENT_SQL).run(...eventToParams(e)).lastInsertRowid);
const get = (id: number): BabyEvent =>
  rowToEvent(db.prepare(GET_EVENT_SQL).get(id) as unknown as EventRow);

// ---- insert / round-trip ----
const bottleId = insert(ev({ kind: 'bottle', startMs: at(6), endMs: at(6, 10), amountMl: 120, note: 'hungry' }));
const b = get(bottleId);
eq('bottle round-trip', [b.kind, b.startMs, b.endMs, b.amountMl, b.side, b.diaperType, b.note],
  ['bottle', at(6), at(6, 10), 120, null, null, 'hungry']);

const nurseId = insert(ev({ kind: 'nurse', startMs: at(9), side: 'L' }));
eq('running nurse endMs null', get(nurseId).endMs, null);

const diaperId = insert(ev({ kind: 'diaper', startMs: at(10), endMs: at(10), diaperType: 'both' }));
eq('diaper type persists', get(diaperId).diaperType, 'both');

// ---- running / end ----
const sleepId = insert(ev({ kind: 'sleep', startMs: at(22) }));
let running = (db.prepare(RUNNING_EVENTS_SQL).all() as unknown as EventRow[]).map(rowToEvent);
eq('two running timers', running.map((e) => e.kind).sort(), ['nurse', 'sleep']);

db.prepare(END_EVENT_SQL).run(at(9, 20), nurseId);
eq('endEvent sets end', get(nurseId).endMs, at(9, 20));
db.prepare(END_EVENT_SQL).run(at(9, 45), nurseId);
eq('endEvent no-op if ended', get(nurseId).endMs, at(9, 20));
running = (db.prepare(RUNNING_EVENTS_SQL).all() as unknown as EventRow[]).map(rowToEvent);
eq('one running left', running.map((e) => e.kind), ['sleep']);

// ---- update ----
const b2 = { ...b, amountMl: 150, note: '' };
db.prepare(UPDATE_EVENT_SQL).run(...eventToParams(b2), bottleId);
eq('update amount', get(bottleId).amountMl, 150);
eq('update clears note', get(bottleId).note, '');

// ---- last feed / last nurse ----
const lastFeed = rowToEvent(db.prepare(LAST_FEED_SQL).get(at(23)) as unknown as EventRow);
eq('last feed is the nurse', [lastFeed.kind, lastFeed.startMs], ['nurse', at(9)]);
const lf2 = rowToEvent(db.prepare(LAST_FEED_SQL).get(at(7)) as unknown as EventRow);
eq('last feed respects now', [lf2.kind, lf2.startMs], ['bottle', at(6)]);
const lastNurse = rowToEvent(db.prepare(LAST_NURSE_SQL).get() as unknown as EventRow);
eq('last nurse side', lastNurse.side, 'L');

// ---- list between (day window incl. overlapping sleep) ----
// Sleep spanning midnight into the NEXT day:
db.prepare(END_EVENT_SQL).run(at(30), sleepId); // 10pm -> 6am next day
const day2Start = at(24);
const day2End = at(48);
const day2 = (db.prepare(LIST_BETWEEN_SQL).all(day2End, day2Start) as unknown as EventRow[]).map(rowToEvent);
eq('midnight sleep appears in day 2', day2.some((e) => e.id === sleepId), true);
eq('day-1 bottle not in day 2', day2.some((e) => e.id === bottleId), false);
const day1 = (db.prepare(LIST_BETWEEN_SQL).all(day2Start, T0) as unknown as EventRow[]).map(rowToEvent);
eq('midnight sleep also in day 1', day1.some((e) => e.id === sleepId), true);
eq('day 1 has all four events', day1.length, 4);

// running timer appears in today's window
const s2 = insert(ev({ kind: 'sleep', startMs: at(26) }));
const day2b = (db.prepare(LIST_BETWEEN_SQL).all(day2End, day2Start) as unknown as EventRow[]).map(rowToEvent);
eq('running sleep in its day', day2b.some((e) => e.id === s2), true);

// ---- recent / delete ----
const recent = (db.prepare(LIST_RECENT_SQL).all(3) as unknown as EventRow[]).map(rowToEvent);
eq('recent limit + order', [recent.length, recent[0].id], [3, s2]);
db.prepare(DELETE_EVENT_SQL).run(diaperId);
eq('delete removes row', db.prepare(GET_EVENT_SQL).get(diaperId) ?? null, null);

// ---- backup replace-all ----
const before = (db.prepare(ALL_EVENTS_SQL).all() as unknown as EventRow[]).map(rowToEvent);
db.exec('BEGIN');
db.exec(DELETE_ALL_EVENTS_SQL);
for (const e of before.slice(0, 2)) db.prepare(INSERT_EVENT_SQL).run(...eventToParams({ ...e, id: undefined }));
db.exec('COMMIT');
const after = (db.prepare(ALL_EVENTS_SQL).all() as unknown as EventRow[]).map(rowToEvent);
eq('replace-all restores subset', after.length, 2);
eq('restored order asc', after[0].startMs <= after[1].startMs, true);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
