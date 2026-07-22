// src/components/EditEventSheet.tsx
// Edit any logged event. 3am ergonomics: no pickers, just steppers.
//   start time  -> ±5m / ±15m (moves end too for completed timers, keeping duration)
//   duration    -> ±5m (completed sleep/nurse only)
//   amount      -> chips + ±10ml (bottle)
//   side / type -> toggles
// Delete lives here too.

import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteEvent, updateEvent } from '../db';
import {
  BabyEvent,
  DiaperType,
  NurseSide,
  formatClock,
  formatDurationShort,
  formatVolume,
} from '../models';
import { colors } from '../theme';
import { useSettings } from '../SettingsContext';

const MIN_5 = 5 * 60000;
const MIN_15 = 15 * 60000;

export default function EditEventSheet(props: {
  event: BabyEvent | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const { event, onDone, onClose } = props;
  const { settings } = useSettings();
  const unit = settings.unit;
  const [startMs, setStartMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [amountMl, setAmountMl] = useState<number | null>(null);
  const [side, setSide] = useState<NurseSide | null>(null);
  const [diaperType, setDiaperType] = useState<DiaperType | null>(null);

  useEffect(() => {
    if (!event) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tracked in #2
    setStartMs(event.startMs);
    setDurationMs(event.endMs != null ? event.endMs - event.startMs : null);
    setAmountMl(event.amountMl);
    setSide(event.side);
    setDiaperType(event.diaperType);
  }, [event]);

  if (!event) return null;
  const running = event.endMs == null;
  const isTimer = event.kind === 'sleep' || event.kind === 'nurse';
  const pointEvent = !isTimer; // bottle/diaper: endMs mirrors startMs

  const shiftStart = (deltaMs: number) => {
    setStartMs((s) => Math.min(Date.now(), s + deltaMs));
  };

  const save = () => {
    const endMs = running
      ? null
      : pointEvent
        ? startMs
        : startMs + Math.max(MIN_5 / 5, durationMs ?? 0); // >=1 min
    updateEvent({ ...event, startMs, endMs, amountMl, side, diaperType });
    onDone();
  };

  const confirmDelete = () => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (event.id != null) deleteEvent(event.id);
          onDone();
        },
      },
    ]);
  };

  const title =
    event.kind === 'bottle'
      ? 'Edit bottle'
      : event.kind === 'nurse'
        ? 'Edit nurse'
        : event.kind === 'sleep'
          ? 'Edit sleep'
          : 'Edit diaper';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>

          <Text style={styles.fieldLabel}>Started {formatClock(startMs)}</Text>
          <View style={styles.stepRow}>
            <Step label="−15m" onPress={() => shiftStart(-MIN_15)} />
            <Step label="−5m" onPress={() => shiftStart(-MIN_5)} />
            <Step label="+5m" onPress={() => shiftStart(MIN_5)} />
            <Step label="+15m" onPress={() => shiftStart(MIN_15)} />
          </View>

          {isTimer && !running && durationMs != null && (
            <>
              <Text style={styles.fieldLabel}>
                Duration {formatDurationShort(durationMs)}
              </Text>
              <View style={styles.stepRow}>
                <Step
                  label="−5m"
                  onPress={() => setDurationMs((d) => Math.max(60000, (d ?? 0) - MIN_5))}
                />
                <Step label="+5m" onPress={() => setDurationMs((d) => (d ?? 0) + MIN_5)} />
              </View>
            </>
          )}
          {running && <Text style={styles.runningNote}>Timer still running</Text>}

          {event.kind === 'bottle' && (
            <>
              <Text style={styles.fieldLabel}>
                Amount {formatVolume(amountMl ?? 0, unit)}
              </Text>
              <View style={styles.stepRow}>
                {[60, 90, 120, 150, 180].map((ml) => (
                  <Pressable
                    key={ml}
                    onPress={() => setAmountMl(ml)}
                    style={[styles.chip, amountMl === ml && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, amountMl === ml && styles.chipTextActive]}
                    >
                      {ml}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.stepRow}>
                <Step
                  label="−10"
                  onPress={() => setAmountMl((v) => Math.max(10, (v ?? 0) - 10))}
                />
                <Step label="+10" onPress={() => setAmountMl((v) => (v ?? 0) + 10)} />
              </View>
            </>
          )}

          {event.kind === 'nurse' && (
            <>
              <Text style={styles.fieldLabel}>Side</Text>
              <View style={styles.stepRow}>
                {(['L', 'R'] as NurseSide[]).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSide(s)}
                    style={[styles.chipWide, side === s && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, side === s && styles.chipTextActive]}>
                      {s === 'L' ? 'Left' : 'Right'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {event.kind === 'diaper' && (
            <>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.stepRow}>
                {(['wet', 'dirty', 'both'] as DiaperType[]).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setDiaperType(t)}
                    style={[styles.chipWide, diaperType === t && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, diaperType === t && styles.chipTextActive]}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Pressable onPress={save} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete entry</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Step(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.chip}>
      <Text style={styles.chipText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
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
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 14 },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  runningNote: { color: colors.lavenderText, fontSize: 13, marginBottom: 12 },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  chipWide: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    flexGrow: 1,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.peach, backgroundColor: colors.peachBg },
  chipText: { color: colors.textBody, fontSize: 14 },
  chipTextActive: { color: colors.peachText, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.peach,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14 },
  deleteBtnText: { color: colors.danger, fontSize: 14 },
});
