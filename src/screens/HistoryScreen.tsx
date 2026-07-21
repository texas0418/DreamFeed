// src/screens/HistoryScreen.tsx
// Browse past days: prev/next chevrons, richer day summary, timeline.
// Tap a row to edit (EditEventSheet).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { listEventsBetween } from '../db';
import {
  BabyEvent,
  formatClock,
  formatDurationShort,
  formatVolume,
  summarizeDay,
} from '../models';
import { colors } from '../theme';
import { useSettings } from '../SettingsContext';
import EditEventSheet from '../components/EditEventSheet';

const DAY_MS = 24 * 3600 * 1000;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const dayLabel = (dayStartMs: number): string => {
  const today = startOfDay(Date.now());
  if (dayStartMs === today) return 'Today';
  if (dayStartMs === today - DAY_MS) return 'Yesterday';
  const d = new Date(dayStartMs);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export default function HistoryScreen(props: { onBack: () => void }) {
  const { settings } = useSettings();
  const unit = settings.unit;
  const [dayStart, setDayStart] = useState(() => startOfDay(Date.now()));
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [editing, setEditing] = useState<BabyEvent | null>(null);

  const load = useCallback(() => {
    setEvents(listEventsBetween(dayStart, dayStart + DAY_MS));
  }, [dayStart]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tracked in #2
  useEffect(load, [load]);

  const now = Date.now();
  const summary = useMemo(
    () => summarizeDay(events, dayStart, now),
    [events, dayStart, now],
  );
  const timeline = useMemo(
    () => [...events].sort((a, b) => b.startMs - a.startMs),
    [events],
  );
  const isToday = dayStart >= startOfDay(now);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.dayNav}>
        <Pressable onPress={() => setDayStart((d) => d - DAY_MS)} hitSlop={12}>
          <Text style={styles.chev}>‹</Text>
        </Pressable>
        <Text style={styles.dayLabel}>{dayLabel(dayStart)}</Text>
        <Pressable
          onPress={() => setDayStart((d) => Math.min(startOfDay(Date.now()), d + DAY_MS))}
          hitSlop={12}
          disabled={isToday}
        >
          <Text style={[styles.chev, isToday && styles.chevDisabled]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <SummaryStat
          label="Feeds"
          value={`${summary.feeds}`}
          sub={
            summary.bottleMl > 0
              ? formatVolume(summary.bottleMl, unit)
              : summary.nurseMs > 0
                ? formatDurationShort(summary.nurseMs)
                : ''
          }
          color={colors.peach}
        />
        <SummaryStat
          label="Sleep"
          value={summary.sleepMs > 0 ? formatDurationShort(summary.sleepMs) : '0m'}
          sub=""
          color={colors.lavender}
        />
        <SummaryStat
          label="Diapers"
          value={`${summary.diapers}`}
          sub={
            summary.diapers > 0
              ? `${summary.wetDiapers}w · ${summary.dirtyDiapers}d`
              : ''
          }
          color={colors.blue}
        />
      </View>
      {summary.nurseMs > 0 && summary.bottleMl > 0 && (
        <Text style={styles.summaryExtra}>
          Nursed {formatDurationShort(summary.nurseMs)} · bottles{' '}
          {formatVolume(summary.bottleMl, unit)}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.timeline}>
        {timeline.length === 0 && (
          <Text style={styles.emptyText}>Nothing logged this day.</Text>
        )}
        {timeline.map((e) => (
          <Pressable key={e.id} onPress={() => setEditing(e)} style={styles.row}>
            <Text style={[styles.rowIcon, { color: rowColor(e) }]}>{rowIcon(e)}</Text>
            <Text style={styles.rowText}>{describe(e, unit)}</Text>
            <Text style={styles.rowTime}>{formatClock(e.startMs)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {editing && (
        <EditEventSheet
          event={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </View>
  );
}

function SummaryStat(props: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: props.color }]}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
      {props.sub ? <Text style={styles.statSub}>{props.sub}</Text> : null}
    </View>
  );
}

function rowIcon(e: BabyEvent): string {
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

function rowColor(e: BabyEvent): string {
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

function describe(e: BabyEvent, unit: 'ml' | 'oz'): string {
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backText: { color: colors.peach, fontSize: 15 },
  backSpacer: { width: 50 },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 18,
  },
  chev: { color: colors.textBody, fontSize: 26, paddingHorizontal: 8 },
  chevDisabled: { opacity: 0.25 },
  dayLabel: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    minWidth: 150,
    textAlign: 'center',
  },
  summaryCard: {
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  statSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  summaryExtra: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  timeline: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  rowText: { color: colors.textBody, fontSize: 13, flex: 1 },
  rowTime: { color: colors.textMuted, fontSize: 12 },
});
