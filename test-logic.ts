// test-logic.ts — offline correctness suite for the parts a device pass can't
// prove: backup round-trip/validation (data-loss protection), unit rounding,
// date parsing, and the summary math behind the pediatrician PDF.
// Run: npx tsx test-logic.ts
import {
  BabyEvent, formatBabyAge, formatDurationShort, formatVolume, ozToMl,
  parseBirthDate, summarizeDay,
} from './src/models';
import { serializeBackup, parseBackup, BACKUP_FORMAT } from './src/backupFormat';
import { buildSummaryDays, buildSummaryHtml } from './src/summaryHtml';
import { isPlaceholderKey } from './src/revenuecat';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};
const throws = (name: string, fn: () => unknown, msgIncludes?: string) => {
  try {
    fn();
    console.log(`FAIL ${name}: expected throw, none happened`);
    failures++;
  } catch (e) {
    if (msgIncludes && !(e as Error).message.includes(msgIncludes)) {
      console.log(`FAIL ${name}: threw "${(e as Error).message}", wanted include "${msgIncludes}"`);
      failures++;
    } else console.log(`ok   ${name}`);
  }
};

const T0 = new Date(2026, 6, 12, 0, 0).getTime();
const at = (h: number, m = 0) => T0 + (h * 60 + m) * 60000;
const ev = (p: Partial<BabyEvent> & Pick<BabyEvent, 'kind' | 'startMs'>): BabyEvent => ({
  endMs: null, amountMl: null, side: null, diaperType: null, note: '', ...p,
});

// ============ §10 Backup: round-trip integrity ============
const profile = { name: 'Ada', birthDateMs: new Date(2026, 0, 5).getTime() };
const events: BabyEvent[] = [
  ev({ kind: 'bottle', startMs: at(6), endMs: at(6, 15), amountMl: 120, note: 'sleepy' }),
  ev({ kind: 'nurse', startMs: at(9), endMs: at(9, 20), side: 'L' }),
  ev({ kind: 'sleep', startMs: at(13), endMs: at(15) }),
  ev({ kind: 'diaper', startMs: at(10), endMs: at(10), diaperType: 'both' }),
];
const json = serializeBackup(profile, 'oz', events, at(20));
const back = parseBackup(json);
eq('backup preserves event count', back.events.length, 4);
eq('backup preserves profile', back.profile, profile);
eq('backup preserves unit', back.unit, 'oz');
eq('backup preserves amount', back.events[0].amountMl, 120);
eq('backup preserves side', back.events[1].side, 'L');
eq('backup preserves diaperType', back.events[3].diaperType, 'both');
eq('backup preserves note', back.events[0].note, 'sleepy');
eq('backup preserves running(null end)', parseBackup(serializeBackup(profile, 'ml',
  [ev({ kind: 'sleep', startMs: at(22) })], at(23))).events[0].endMs, null);
eq('backup strips ids', JSON.parse(json).events.every((e: BabyEvent) => e.id === undefined), true);
eq('backup format tag', back.format, BACKUP_FORMAT);

// ============ §10 Backup: validation & tolerance ============
throws('reject non-JSON', () => parseBackup('not json{'), 'JSON');
throws('reject non-object', () => parseBackup('42'), 'valid backup');
throws('reject foreign format', () => parseBackup(JSON.stringify({ format: 'other', version: 1, events: [] })), 'Dreamfeed');
throws('reject newer version', () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, events: [] })), 'newer version');
throws('reject missing events', () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 })), 'event list');
// tolerance: skip bad events, default missing fields, never throw on well-formed
const messy = parseBackup(JSON.stringify({
  format: BACKUP_FORMAT, version: 1, events: [
    { kind: 'bottle', startMs: 111, amountMl: 90.7 },      // missing note/end -> defaulted; amount rounds
    { kind: 'garbage', startMs: 222 },                      // bad kind -> skipped
    { startMs: 333 },                                       // no kind -> skipped
    { kind: 'nurse' },                                      // no startMs -> skipped
    { kind: 'diaper', startMs: 444, diaperType: 'weird' },  // bad diaper -> null
  ],
}));
eq('tolerant parse keeps only valid events', messy.events.length, 2);
eq('tolerant parse rounds amount', messy.events[0].amountMl, 91);
eq('tolerant parse defaults note', messy.events[0].note, '');
eq('tolerant parse defaults end to null', messy.events[0].endMs, null);
eq('tolerant parse nulls bad diaper', messy.events[1].diaperType, null);
eq('tolerant parse defaults unit to ml', messy.unit, 'ml');
eq('tolerant parse defaults profile', messy.profile, { name: '', birthDateMs: null });

// ============ §9 Units: ml/oz + quarter-oz rounding ============
eq('ml passthrough', formatVolume(120, 'ml'), '120 ml');
eq('oz whole', formatVolume(ozToMl(4), 'oz'), '4 oz');           // 4 oz -> 118ml -> 4 oz
eq('oz quarter', formatVolume(ozToMl(2.25), 'oz'), '2.25 oz');
eq('oz rounds to nearest quarter', formatVolume(74, 'oz'), '2.5 oz'); // 74ml=2.503oz -> 2.5
eq('ozToMl round-trips', ozToMl(3), 89);                          // 3*29.5735=88.72 -> 89
eq('zero oz', formatVolume(0, 'oz'), '0 oz');

// ============ §5/§8 Duration + summary math (PDF engine) ============
eq('duration never seconds (floor 1m)', formatDurationShort(30 * 1000), '1m');
eq('duration hours+min', formatDurationShort((2 * 60 + 15) * 60000), '2h 15m');
eq('duration exact hour', formatDurationShort(3600000), '1h');
// midnight-spanning sleep apportioned: 10pm day1 -> 6am day2
const nightSleep = [ev({ kind: 'sleep', startMs: at(22), endMs: at(30) })]; // 30h = 6am next day
eq('sleep credits 2h to day 1', summarizeDay(nightSleep, T0, at(30)).sleepMs, 2 * 3600000);
eq('sleep credits 6h to day 2', summarizeDay(nightSleep, T0 + 24 * 3600000, at(30)).sleepMs, 6 * 3600000);
// 'both' diaper counts wet AND dirty
const bothDiaper = summarizeDay([ev({ kind: 'diaper', startMs: at(10), diaperType: 'both' })], T0, at(11));
eq("'both' diaper counts wet", bothDiaper.wetDiapers, 1);
eq("'both' diaper counts dirty", bothDiaper.dirtyDiapers, 1);
eq("'both' is one diaper event", bothDiaper.diapers, 1);

// ============ §9 PDF summary structure & XSS-safety ============
const days = buildSummaryDays(events, at(20), 7);
eq('summary spans 7 days', days.length, 7);
eq('summary day 0 is today', days[0].dayStartMs, T0);
const html = buildSummaryHtml({ name: '<script>x</script>', birthDateMs: profile.birthDateMs }, 'oz', days, at(20));
eq('PDF escapes name (no raw script tag)', html.includes('<script>x</script>'), false);
eq('PDF includes escaped name', html.includes('&lt;script&gt;'), true);
eq('PDF shows bottle total', html.includes('oz'), true);

// ============ §1 DOB parsing ============
eq('parse valid date', parseBirthDate('2026-03-05'), new Date(2026, 2, 5).getTime());
eq('parse leap day valid', parseBirthDate('2024-02-29'), new Date(2024, 1, 29).getTime());
eq('reject non-leap Feb 29', parseBirthDate('2026-02-29'), null);
eq('reject month 13', parseBirthDate('2026-13-01'), null);
eq('reject day 00', parseBirthDate('2026-05-00'), null);
eq('reject junk', parseBirthDate('not-a-date'), null);
eq('reject empty', parseBirthDate('   '), null);

// ============ §9 age display boundaries ============
const bday = new Date(2026, 0, 1).getTime();
eq('age days under 2wk', formatBabyAge(bday, new Date(2026, 0, 6).getTime()), '5 d');
eq('age weeks under 6mo', formatBabyAge(bday, new Date(2026, 1, 1).getTime()), '4 wk');
eq('age months under 2yr', formatBabyAge(bday, new Date(2026, 8, 1).getTime()), '8 mo');
eq('age negative -> empty', formatBabyAge(new Date(2027, 0, 1).getTime(), bday), '');

// ============ §9 Pro fail-open decision (placeholder detection) ============
eq('placeholder ios key -> fail-open', isPlaceholderKey('REPLACE_WITH_RC_IOS_KEY'), true);
eq('empty key -> fail-open', isPlaceholderKey(''), true);
eq('real-looking key -> gated', isPlaceholderKey('appl_abc123'), false);

// ---- results ----
console.log(failures === 0 ? `\nALL PASS (0 failures)` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
