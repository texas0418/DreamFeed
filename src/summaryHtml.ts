// src/summaryHtml.ts
// Pure module: pediatrician summary HTML for expo-print.
// One row per day (most recent first): feeds, bottle volume, nursing time,
// sleep total, diapers (wet/dirty). App palette carried into the document.

import {
  BabyEvent,
  BabyProfile,
  DaySummary,
  VolumeUnit,
  formatBabyAge,
  formatDurationShort,
  formatVolume,
  summarizeDay,
} from './models';

const INK = '#1a1a2e';
const PEACH = '#e8935a';
const LAVENDER = '#7d6fc4';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SummaryDay {
  dayStartMs: number;
  summary: DaySummary;
}

/** Build the last `numDays` calendar days (today first) from raw events. */
export function buildSummaryDays(
  events: BabyEvent[],
  nowMs: number,
  numDays: number,
): SummaryDay[] {
  const d = new Date(nowMs);
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days: SummaryDay[] = [];
  for (let i = 0; i < numDays; i++) {
    const dayStartMs = todayStart - i * 24 * 3600 * 1000;
    days.push({ dayStartMs, summary: summarizeDay(events, dayStartMs, nowMs) });
  }
  return days;
}

const dayLabel = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

export function buildSummaryHtml(
  profile: BabyProfile,
  unit: VolumeUnit,
  days: SummaryDay[],
  nowMs: number,
): string {
  const name = profile.name.trim() || 'Baby';
  const age =
    profile.birthDateMs != null ? formatBabyAge(profile.birthDateMs, nowMs) : '';
  const generated = new Date(nowMs).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const rows = days
    .map(({ dayStartMs, summary: s }) => {
      const bottle = s.bottleMl > 0 ? formatVolume(s.bottleMl, unit) : '—';
      const nurse = s.nurseMs > 0 ? formatDurationShort(s.nurseMs) : '—';
      const sleep = s.sleepMs > 0 ? formatDurationShort(s.sleepMs) : '—';
      const diapers =
        s.diapers > 0 ? `${s.diapers} (${s.wetDiapers}w / ${s.dirtyDiapers}d)` : '—';
      return `<tr>
        <td class="day">${esc(dayLabel(dayStartMs))}</td>
        <td>${s.feeds || '—'}</td>
        <td>${bottle}</td>
        <td>${nurse}</td>
        <td class="sleep">${sleep}</td>
        <td>${diapers}</td>
      </tr>`;
    })
    .join('\n');

  const totals = days.reduce(
    (t, { summary: s }) => ({
      feeds: t.feeds + s.feeds,
      bottleMl: t.bottleMl + s.bottleMl,
      nurseMs: t.nurseMs + s.nurseMs,
      sleepMs: t.sleepMs + s.sleepMs,
      diapers: t.diapers + s.diapers,
    }),
    { feeds: 0, bottleMl: 0, nurseMs: 0, sleepMs: 0, diapers: 0 },
  );
  const avgSleep = days.length > 0 ? totals.sleepMs / days.length : 0;
  const avgFeeds = days.length > 0 ? totals.feeds / days.length : 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 40px; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${INK}; margin: 0; }
  .head { border-bottom: 3px solid ${INK}; padding-bottom: 14px; margin-bottom: 6px; }
  .brand { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: ${MUTED}; }
  h1 { font-size: 26px; margin: 4px 0 2px; }
  .meta { font-size: 12px; color: ${MUTED}; }
  .stats { display: flex; gap: 28px; margin: 18px 0 22px; }
  .stat .v { font-size: 20px; font-weight: 700; }
  .stat .l { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${MUTED}; margin-top: 2px; }
  .stat.feeds .v { color: ${PEACH}; }
  .stat.sleep .v { color: ${LAVENDER}; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
       color: ${MUTED}; padding: 6px 8px; border-bottom: 2px solid ${INK}; }
  td { padding: 8px; border-bottom: 1px solid ${HAIRLINE}; }
  td.day { font-weight: 600; }
  td.sleep { color: ${LAVENDER}; font-weight: 600; }
  .foot { margin-top: 24px; font-size: 10px; color: ${MUTED}; }
</style></head><body>
  <div class="head">
    <div class="brand">Dreamfeed · Pediatrician summary</div>
    <h1>${esc(name)}${age ? ` <span style="font-weight:400;color:${MUTED};font-size:16px">· ${esc(age)} old</span>` : ''}</h1>
    <div class="meta">Last ${days.length} days · generated ${esc(generated)}</div>
  </div>
  <div class="stats">
    <div class="stat feeds"><div class="v">${avgFeeds.toFixed(1)}</div><div class="l">Feeds / day</div></div>
    <div class="stat sleep"><div class="v">${formatDurationShort(avgSleep)}</div><div class="l">Sleep / day</div></div>
    <div class="stat"><div class="v">${totals.diapers}</div><div class="l">Diapers total</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Day</th><th>Feeds</th><th>Bottle</th><th>Nursing</th><th>Sleep</th><th>Diapers</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <div class="foot">Logged with Dreamfeed. Running timers are counted up to the moment of export.</div>
</body></html>`;
}
