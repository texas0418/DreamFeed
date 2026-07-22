// src/backupFormat.ts
// Pure module (Node-testable): versioned JSON backup format.
// Version 1: settings (profile + unit) and all events. Forward rule:
// parse must tolerate missing fields by defaulting, never throw on
// well-formed older backups.

import type { BabyEvent, BabyProfile, VolumeUnit } from './models';

export const BACKUP_FORMAT = 'dreamfeed-backup';
export const BACKUP_VERSION = 1;

export interface BackupV1 {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAtMs: number;
  profile: BabyProfile;
  unit: VolumeUnit;
  events: BabyEvent[];
}

export function serializeBackup(
  profile: BabyProfile,
  unit: VolumeUnit,
  events: BabyEvent[],
  nowMs: number,
): string {
  const b: BackupV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: nowMs,
    profile,
    unit,
    events: events.map((e) => ({ ...e, id: undefined })),
  };
  return JSON.stringify(b, null, 1);
}

const KINDS = new Set(['bottle', 'nurse', 'sleep', 'diaper']);
const SIDES = new Set(['L', 'R']);
const DIAPERS = new Set(['wet', 'dirty', 'both']);

/** Returns a validated backup or throws Error with a human-readable reason. */
// eslint-disable-next-line complexity -- tracked in #1
export function parseBackup(json: string): BackupV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Not a valid backup file (not JSON).');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Not a valid backup file.');
  }
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) {
    throw new Error('Not a Dreamfeed backup file.');
  }
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    throw new Error('Backup was made by a newer version of Dreamfeed.');
  }
  if (!Array.isArray(o.events)) {
    throw new Error('Backup contains no event list.');
  }

  const events: BabyEvent[] = [];
  for (const raw of o.events) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (!KINDS.has(e.kind as string)) continue;
    if (typeof e.startMs !== 'number') continue;
    events.push({
      kind: e.kind as BabyEvent['kind'],
      startMs: e.startMs,
      endMs: typeof e.endMs === 'number' ? e.endMs : null,
      amountMl: typeof e.amountMl === 'number' ? Math.round(e.amountMl) : null,
      side: SIDES.has(e.side as string) ? (e.side as BabyEvent['side']) : null,
      diaperType: DIAPERS.has(e.diaperType as string)
        ? (e.diaperType as BabyEvent['diaperType'])
        : null,
      note: typeof e.note === 'string' ? e.note : '',
    });
  }

  const p = (o.profile ?? {}) as Record<string, unknown>;
  const profile: BabyProfile = {
    name: typeof p.name === 'string' ? p.name : '',
    birthDateMs: typeof p.birthDateMs === 'number' ? p.birthDateMs : null,
  };
  const unit: VolumeUnit = o.unit === 'oz' ? 'oz' : 'ml';

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: typeof o.exportedAtMs === 'number' ? o.exportedAtMs : 0,
    profile,
    unit,
    events,
  };
}
