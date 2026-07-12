import {
  activeSleep, BabyEvent, durationMs, formatDurationShort, formatSinceFeed,
  formatVolume, msSinceLastFeed, ozToMl, suggestedNextSide, summarizeDay,
} from './src/models';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

const T0 = new Date(2026, 6, 12, 0, 0).getTime(); // midnight July 12
const at = (h: number, m = 0) => T0 + (h * 60 + m) * 60000;
const ev = (partial: Partial<BabyEvent> & Pick<BabyEvent, 'kind' | 'startMs'>): BabyEvent => ({
  endMs: null, amountMl: null, side: null, diaperType: null, note: '', ...partial,
});

// ---- time since last feed ----
const feeds: BabyEvent[] = [
  ev({ kind: 'bottle', startMs: at(6), endMs: at(6, 15), amountMl: 120 }),
  ev({ kind: 'nurse', startMs: at(9), endMs: at(9, 20), side: 'L' }),
  ev({ kind: 'diaper', startMs: at(10), endMs: at(10), diaperType: 'wet' }),
];
eq('since-feed uses feed start', msSinceLastFeed(feeds, at(11)), 2 * 3600000);
eq('diaper not a feed', msSinceLastFeed(feeds, at(11))! < 3 * 3600000, true);
eq('no feeds -> null', msSinceLastFeed([feeds[2]], at(11)), null);
eq('future feeds ignored', msSinceLastFeed(feeds, at(8)), 2 * 3600000);

// ---- running timers ----
const sleeping = ev({ kind: 'sleep', startMs: at(13) });
eq('active sleep found', activeSleep([...feeds, sleeping])?.startMs, at(13));
eq('no active sleep when ended', activeSleep([ev({ kind: 'sleep', startMs: at(1), endMs: at(3) })]), null);
eq('running duration counts up', durationMs(sleeping, at(14)), 3600000);
eq('ended duration fixed', durationMs(feeds[0], at(23)), 15 * 60000);

// ---- side suggestion ----
eq('first nurse suggests L', suggestedNextSide([]), 'L');
eq('after L suggests R', suggestedNextSide([ev({ kind: 'nurse', startMs: at(9), side: 'L' })]), 'R');
eq('after R suggests L', suggestedNextSide([
  ev({ kind: 'nurse', startMs: at(6), side: 'L' }),
  ev({ kind: 'nurse', startMs: at(9), side: 'R' }),
]), 'L');

// ---- day summary ----
const day: BabyEvent[] = [
  ev({ kind: 'bottle', startMs: at(6), endMs: at(6, 10), amountMl: 120 }),
  ev({ kind: 'bottle', startMs: at(12), endMs: at(12, 10), amountMl: 90 }),
  ev({ kind: 'nurse', startMs: at(18), endMs: at(18, 25), side: 'R' }),
  ev({ kind: 'diaper', startMs: at(7), endMs: at(7), diaperType: 'wet' }),
  ev({ kind: 'diaper', startMs: at(13), endMs: at(13), diaperType: 'both' }),
  ev({ kind: 'sleep', startMs: at(1), endMs: at(4) }),
  // overnight sleep 10pm -> 6am next day: only 2h belongs to this day
  ev({ kind: 'sleep', startMs: at(22), endMs: at(30) }),
];
const s = summarizeDay(day, at(12), at(23, 59));
eq('feeds counted', s.feeds, 3);
eq('bottle ml summed', s.bottleMl, 210);
eq('nurse duration', s.nurseMs, 25 * 60000);
eq('diapers counted', s.diapers, 2);
eq('both counts wet+dirty', [s.wetDiapers, s.dirtyDiapers], [2, 1]);
eq('midnight sleep apportioned', s.sleepMs, (3 + 2) * 3600000);

// next day gets the other 6h of the overnight sleep
const s2 = summarizeDay(day, at(26), at(48));
eq('next-day sleep share', s2.sleepMs, 6 * 3600000);
eq('next-day no feeds', s2.feeds, 0);

// running sleep counts up to now within the day
const s3 = summarizeDay([ev({ kind: 'sleep', startMs: at(13) })], at(12), at(14));
eq('running sleep to now', s3.sleepMs, 3600000);

// ---- formatting ----
eq('volume ml', formatVolume(120, 'ml'), '120 ml');
eq('volume oz quarter-round', formatVolume(120, 'oz'), '4 oz');
eq('oz->ml roundtrip-ish', ozToMl(4), 118);
eq('duration h+m', formatDurationShort(2 * 3600000 + 15 * 60000), '2h 15m');
eq('duration exact hour', formatDurationShort(3600000), '1h');
eq('duration floor 1m', formatDurationShort(20000), '1m');
eq('since: just now', formatSinceFeed(30000), 'Just now');
eq('since: ago', formatSinceFeed(102 * 60000), '1h 42m ago');
eq('since: none', formatSinceFeed(null), 'No feeds yet');

process.exit(failures === 0 ? 0 : 1);
