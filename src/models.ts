// src/models.ts
// One unified event model covers everything a newborn does that parents track.
// Times are epoch ms. Amounts are stored in ml (integer); display converts.

export type EventKind = 'bottle' | 'nurse' | 'sleep' | 'diaper';
export type NurseSide = 'L' | 'R';
export type DiaperType = 'wet' | 'dirty' | 'both';

export interface BabyEvent {
  id?: number;
  kind: EventKind;
  startMs: number;
  /** null while a sleep/nurse timer is still running */
  endMs: number | null;
  amountMl: number | null; // bottle only
  side: NurseSide | null; // nurse only
  diaperType: DiaperType | null; // diaper only
  note: string;
}

export interface BabyProfile {
  name: string;
  birthDateMs: number | null;
}

export const isFeed = (e: BabyEvent): boolean =>
  e.kind === 'bottle' || e.kind === 'nurse';

export const isRunning = (e: BabyEvent): boolean =>
  (e.kind === 'sleep' || e.kind === 'nurse') && e.endMs == null;

export const durationMs = (e: BabyEvent, nowMs: number): number =>
  Math.max(0, (e.endMs ?? nowMs) - e.startMs);

/** The hero number: ms since the most recent feed *started*.
 *  Start (not end) is the convention parents and pediatricians use for
 *  feed spacing. Returns null if no feeds yet. */
export function msSinceLastFeed(events: BabyEvent[], nowMs: number): number | null {
  let latest = -Infinity;
  for (const e of events) {
    if (isFeed(e) && e.startMs <= nowMs && e.startMs > latest) latest = e.startMs;
  }
  return latest === -Infinity ? null : nowMs - latest;
}

/** The currently running sleep event, if any (most recent wins). */
export function activeSleep(events: BabyEvent[]): BabyEvent | null {
  let best: BabyEvent | null = null;
  for (const e of events) {
    if (e.kind === 'sleep' && e.endMs == null) {
      if (!best || e.startMs > best.startMs) best = e;
    }
  }
  return best;
}

export function activeNurse(events: BabyEvent[]): BabyEvent | null {
  let best: BabyEvent | null = null;
  for (const e of events) {
    if (e.kind === 'nurse' && e.endMs == null) {
      if (!best || e.startMs > best.startMs) best = e;
    }
  }
  return best;
}

/** Which side to suggest for the next nursing session: the one NOT used
 *  last time. Defaults to L for the first-ever session. */
export function suggestedNextSide(events: BabyEvent[]): NurseSide {
  let latest: BabyEvent | null = null;
  for (const e of events) {
    if (e.kind === 'nurse' && e.side && (!latest || e.startMs > latest.startMs)) {
      latest = e;
    }
  }
  return latest?.side === 'L' ? 'R' : 'L';
}

export interface DaySummary {
  feeds: number;
  bottleMl: number;
  nurseMs: number;
  sleepMs: number; // portion of sleep overlapping the day
  diapers: number;
  wetDiapers: number;
  dirtyDiapers: number; // 'both' counts toward wet AND dirty
}

const dayBounds = (dayStartMs: number): [number, number] => {
  const d = new Date(dayStartMs);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return [start, start + 24 * 3600 * 1000];
};

/** Summarize a calendar day. Sleep spanning midnight is apportioned to the
 *  overlap with the day, so a 10pm–6am sleep credits 2h to day one and 6h
 *  to day two. Running timers count up to nowMs. */
export function summarizeDay(
  events: BabyEvent[],
  dayMs: number,
  nowMs: number,
): DaySummary {
  const [start, end] = dayBounds(dayMs);
  const s: DaySummary = {
    feeds: 0,
    bottleMl: 0,
    nurseMs: 0,
    sleepMs: 0,
    diapers: 0,
    wetDiapers: 0,
    dirtyDiapers: 0,
  };
  for (const e of events) {
    const eEnd = e.endMs ?? Math.min(nowMs, end);
    if (e.kind === 'sleep') {
      const overlap = Math.min(eEnd, end) - Math.max(e.startMs, start);
      if (overlap > 0) s.sleepMs += overlap;
      continue;
    }
    // point-ish events belong to the day they started
    if (e.startMs < start || e.startMs >= end) continue;
    switch (e.kind) {
      case 'bottle':
        s.feeds++;
        s.bottleMl += e.amountMl ?? 0;
        break;
      case 'nurse':
        s.feeds++;
        s.nurseMs += Math.max(0, eEnd - e.startMs);
        break;
      case 'diaper':
        s.diapers++;
        if (e.diaperType === 'wet' || e.diaperType === 'both') s.wetDiapers++;
        if (e.diaperType === 'dirty' || e.diaperType === 'both') s.dirtyDiapers++;
        break;
    }
  }
  return s;
}

// ---------------------------------------------------------------- display

export type VolumeUnit = 'ml' | 'oz';

export function formatVolume(ml: number, unit: VolumeUnit): string {
  if (unit === 'ml') return `${ml} ml`;
  const oz = ml / 29.5735;
  const rounded = Math.round(oz * 4) / 4; // quarter-oz steps
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} oz`;
}

export const ozToMl = (oz: number): number => Math.round(oz * 29.5735);

/** "2h 15m", "45m", "1m" — never seconds; parents don't need them. */
export function formatDurationShort(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
}

/** Hero display: "1h 42m ago", "just now" under a minute. */
export function formatSinceFeed(ms: number | null): string {
  if (ms == null) return 'No feeds yet';
  if (ms < 60000) return 'Just now';
  return `${formatDurationShort(ms)} ago`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${d.getMinutes().toString().padStart(2, '0')} ${ampm}`;
}
