// src/screens/HomeScreen.tsx
// The product. Hero = time since last feed START. Two-tap logging:
//   Sleep  -> starts immediately (End on the active card)
//   Nurse  -> side sheet, suggested side preselected -> Start
//   Bottle -> amount sheet (quick chips) -> Save
//   Diaper -> wet/dirty/both, each saves immediately
// Long-press a timeline row to delete (testing convenience; real edit later).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  endEvent,
  getLastFeed,
  insertEvent,
  listEventsBetween,
} from '../db';
import {
  BabyEvent,
  DiaperType,
  NurseSide,
  activeNurse,
  activeSleep,
  formatClock,
  formatDurationShort,
  formatBabyAge,
  formatSinceFeed,
  formatVolume,
  msSinceLastFeed,
  suggestedNextSide,
  summarizeDay,
} from '../models';
import { colors } from '../theme';
import EditEventSheet from '../components/EditEventSheet';
import { useSettings } from '../SettingsContext';

const dayStart = (nowMs: number): number => {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const newEvent = (
  kind: BabyEvent['kind'],
  startMs: number,
  extra: Partial<BabyEvent> = {},
): BabyEvent => ({
  kind,
  startMs,
  endMs: null,
  amountMl: null,
  side: null,
  diaperType: null,
  note: '',
  ...extra,
});

type Sheet = 'none' | 'bottle' | 'nurse' | 'diaper';

export default function HomeScreen(props: {
  onHistory: () => void;
  onSettings: () => void;
}) {
  const { settings } = useSettings();
  const unit = settings.unit;
  const [now, setNow] = useState(Date.now());
  const [todayEvents, setTodayEvents] = useState<BabyEvent[]>([]);
  const [lastFeed, setLastFeed] = useState<BabyEvent | null>(null);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [bottleMl, setBottleMl] = useState(120);
  const [nurseSide, setNurseSide] = useState<NurseSide>('L');
  const [editing, setEditing] = useState<BabyEvent | null>(null);

  const refresh = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const start = dayStart(t);
    setTodayEvents(listEventsBetween(start, start + 24 * 3600 * 1000));
    setLastFeed(getLastFeed(t));
  }, []);

  useEffect(() => {
    refresh();
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [refresh]);

  const sleeping = useMemo(() => activeSleep(todayEvents), [todayEvents]);
  const nursing = useMemo(() => activeNurse(todayEvents), [todayEvents]);
  const summary = useMemo(() => summarizeDay(todayEvents, now, now), [todayEvents, now]);
  const sinceFeed = lastFeed ? msSinceLastFeed([lastFeed], now) : null;
  const nextSide = useMemo(() => suggestedNextSide(todayEvents), [todayEvents]);

  const log = (e: BabyEvent) => {
    insertEvent(e);
    setSheet('none');
    refresh();
  };

  const stopTimer = (e: BabyEvent) => {
    if (e.id != null) endEvent(e.id, Date.now());
    refresh();
  };

  const timeline = useMemo(
    () => [...todayEvents].sort((a, b) => b.startMs - a.startMs),
    [todayEvents],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerName}>
            {settings.profile.name || 'Dreamfeed'}
            {settings.profile.birthDateMs != null && (
              <Text style={styles.headerAge}>
                {'  '}
                {formatBabyAge(settings.profile.birthDateMs, now)}
              </Text>
            )}
          </Text>
          <View style={styles.headerLinks}>
            <Pressable onPress={props.onHistory} hitSlop={12}>
              <Text style={styles.historyLink}>History</Text>
            </Pressable>
            <Pressable onPress={props.onSettings} hitSlop={12}>
              <Text style={styles.historyLink}>Settings</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Since last feed</Text>
          <Text style={styles.heroValue}>{formatSinceFeed(sinceFeed)}</Text>
          {lastFeed && (
            <Text style={styles.heroSub}>
              {lastFeed.kind === 'bottle'
                ? `Bottle · ${formatVolume(lastFeed.amountMl ?? 0, unit)}`
                : `Nurse · ${lastFeed.side ?? ''}`}
              {' · '}
              {formatClock(lastFeed.startMs)}
            </Text>
          )}
        </View>

        {sleeping && (
          <TimerCard
            icon="🌙"
            title="Sleeping"
            event={sleeping}
            now={now}
            accent={colors.lavender}
            onEnd={() => stopTimer(sleeping)}
          />
        )}
        {nursing && (
          <TimerCard
            icon="🍼"
            title={`Nursing · ${nursing.side ?? ''}`}
            event={nursing}
            now={now}
            accent={colors.peach}
            onEnd={() => stopTimer(nursing)}
          />
        )}

        <Text style={styles.summaryLine}>
          Today · {summary.feeds} feeds · {formatDurationShort(summary.sleepMs)} sleep ·{' '}
          {summary.diapers} diapers
        </Text>

        <View style={styles.timeline}>
          {timeline.length === 0 && (
            <Text style={styles.emptyText}>Nothing logged yet today.</Text>
          )}
          {timeline.map((e) => (
            <Pressable key={e.id} onPress={() => setEditing(e)} style={styles.row}>
              <Text style={[styles.rowIcon, { color: eventColor(e) }]}>
                {eventIcon(e)}
              </Text>
              <Text style={styles.rowText}>{describeEvent(e, unit, now)}</Text>
              <Text style={styles.rowTime}>{formatClock(e.startMs)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.buttonGrid}>
        <LogButton
          label="Bottle"
          icon="🍼"
          bg={colors.peachBg}
          border={colors.peachBorder}
          text={colors.peachText}
          onPress={() => setSheet('bottle')}
        />
        <LogButton
          label={`Nurse · ${nextSide} next`}
          icon="🤱"
          bg={colors.peachBg}
          border={colors.peachBorder}
          text={colors.peachText}
          disabled={!!nursing}
          onPress={() => {
            setNurseSide(nextSide);
            setSheet('nurse');
          }}
        />
        <LogButton
          label="Sleep"
          icon="🌙"
          bg={colors.lavenderBg}
          border={colors.lavenderBorder}
          text={colors.lavenderText}
          disabled={!!sleeping}
          onPress={() => log(newEvent('sleep', Date.now()))}
        />
        <LogButton
          label="Diaper"
          icon="💧"
          bg={colors.card}
          border={colors.cardBorder}
          text={colors.blueText}
          onPress={() => setSheet('diaper')}
        />
      </View>

      <LogSheet visible={sheet === 'bottle'} title="Bottle" onClose={() => setSheet('none')}>
        <View style={styles.chipRow}>
          {[60, 90, 120, 150, 180].map((ml) => (
            <Pressable
              key={ml}
              onPress={() => setBottleMl(ml)}
              style={[styles.chip, bottleMl === ml && styles.chipActive]}
            >
              <Text style={[styles.chipText, bottleMl === ml && styles.chipTextActive]}>
                {unit === 'ml' ? ml : formatVolume(ml, 'oz')}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.stepperRow}>
          <StepBtn
            label={unit === 'ml' ? '−10' : '−½oz'}
            onPress={() => setBottleMl((v) => Math.max(10, v - (unit === 'ml' ? 10 : 15)))}
          />
          <Text style={styles.stepperValue}>{formatVolume(bottleMl, unit)}</Text>
          <StepBtn
            label={unit === 'ml' ? '+10' : '+½oz'}
            onPress={() => setBottleMl((v) => v + (unit === 'ml' ? 10 : 15))}
          />
        </View>
        <PrimaryButton
          label={`Save ${formatVolume(bottleMl, unit)}`}
          onPress={() => {
            const t = Date.now();
            log(newEvent('bottle', t, { endMs: t, amountMl: bottleMl }));
          }}
        />
      </LogSheet>

      <LogSheet visible={sheet === 'nurse'} title="Nurse" onClose={() => setSheet('none')}>
        <View style={styles.chipRow}>
          {(['L', 'R'] as NurseSide[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setNurseSide(s)}
              style={[styles.sideChip, nurseSide === s && styles.chipActive]}
            >
              <Text style={[styles.chipText, nurseSide === s && styles.chipTextActive]}>
                {s === 'L' ? 'Left' : 'Right'}
                {s === nextSide ? ' · next' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          label="Start timer"
          onPress={() => log(newEvent('nurse', Date.now(), { side: nurseSide }))}
        />
      </LogSheet>

      <LogSheet visible={sheet === 'diaper'} title="Diaper" onClose={() => setSheet('none')}>
        <View style={styles.chipRow}>
          {(['wet', 'dirty', 'both'] as DiaperType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                const ts = Date.now();
                log(newEvent('diaper', ts, { endMs: ts, diaperType: t }));
              }}
              style={styles.sideChip}
            >
              <Text style={styles.chipText}>{t[0].toUpperCase() + t.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      </LogSheet>

      {editing && (
        <EditEventSheet
          event={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </View>
  );
}

// ------------------------------------------------------------- components

function TimerCard(props: {
  icon: string;
  title: string;
  event: BabyEvent;
  now: number;
  accent: string;
  onEnd: () => void;
}) {
  const { icon, title, event, now, accent, onEnd } = props;
  return (
    <View style={styles.timerCard}>
      <View style={styles.timerLeft}>
        <Text style={styles.timerIcon}>{icon}</Text>
        <View>
          <Text style={[styles.timerTitle, { color: accent }]}>{title}</Text>
          <Text style={styles.timerSub}>
            {formatDurationShort(Math.max(0, now - event.startMs))} · started{' '}
            {formatClock(event.startMs)}
          </Text>
        </View>
      </View>
      <Pressable onPress={onEnd} style={[styles.endBtn, { borderColor: accent }]}>
        <Text style={[styles.endBtnText, { color: accent }]}>End</Text>
      </Pressable>
    </View>
  );
}

function LogButton(props: {
  label: string;
  icon: string;
  bg: string;
  border: string;
  text: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { label, icon, bg, border, text, disabled, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.logBtn,
        { backgroundColor: bg, borderColor: border },
        disabled && styles.logBtnDisabled,
      ]}
    >
      <Text style={styles.logBtnIcon}>{icon}</Text>
      <Text style={[styles.logBtnLabel, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

function LogSheet(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { visible, title, onClose, children } = props;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StepBtn(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.stepBtn}>
      <Text style={styles.stepBtnText}>{props.label}</Text>
    </Pressable>
  );
}

function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.primaryBtn}>
      <Text style={styles.primaryBtnText}>{props.label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- helpers

function eventIcon(e: BabyEvent): string {
  switch (e.kind) {
    case 'bottle':
      return '🍼';
    case 'nurse':
      return '🤱';
    case 'sleep':
      return '🌙';
    case 'diaper':
      return '💧';
  }
}

function eventColor(e: BabyEvent): string {
  switch (e.kind) {
    case 'bottle':
    case 'nurse':
      return colors.peach;
    case 'sleep':
      return colors.lavender;
    case 'diaper':
      return colors.blue;
  }
}

function describeEvent(e: BabyEvent, unit: 'ml' | 'oz', now = Date.now()): string {
  switch (e.kind) {
    case 'bottle':
      return `Bottle · ${formatVolume(e.amountMl ?? 0, unit)}`;
    case 'nurse':
      return e.endMs == null
        ? `Nurse · ${e.side ?? ''} · running`
        : `Nurse · ${e.side ?? ''} · ${formatDurationShort(e.endMs - e.startMs)}`;
    case 'sleep':
      return e.endMs == null
        ? 'Sleep · running'
        : `Sleep · ${formatDurationShort(e.endMs - e.startMs)}`;
    case 'diaper':
      return `Diaper · ${e.diaperType ?? ''}`;
  }
}

// ------------------------------------------------------------------ style

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 12 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  headerAge: { color: colors.textMuted, fontSize: 13, fontWeight: '400' },
  headerLinks: { flexDirection: 'row', gap: 16 },
  historyLink: { color: colors.peach, fontSize: 14 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  heroLabel: { color: colors.textMuted, fontSize: 12, letterSpacing: 0.4 },
  heroValue: {
    color: colors.peach,
    fontSize: 44,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginVertical: 2,
  },
  heroSub: { color: colors.textMuted, fontSize: 12 },
  timerCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerIcon: { fontSize: 18 },
  timerTitle: { fontSize: 13, fontWeight: '600' },
  timerSub: { color: colors.lavenderMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  endBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 14 },
  endBtnText: { fontSize: 12, fontWeight: '600' },
  summaryLine: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  timeline: { paddingHorizontal: 20 },
  emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  rowText: { color: colors.textBody, fontSize: 13, flex: 1 },
  rowTime: { color: colors.textMuted, fontSize: 12 },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
    paddingBottom: 32,
  },
  logBtn: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logBtnDisabled: { opacity: 0.4 },
  logBtnIcon: { fontSize: 20 },
  logBtnLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sideChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexGrow: 1,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.peach, backgroundColor: colors.peachBg },
  chipText: { color: colors.textBody, fontSize: 14 },
  chipTextActive: { color: colors.peachText, fontWeight: '600' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  stepperValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    minWidth: 90,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepBtn: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stepBtnText: { color: colors.textBody, fontSize: 15 },
  primaryBtn: {
    backgroundColor: colors.peach,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
});
