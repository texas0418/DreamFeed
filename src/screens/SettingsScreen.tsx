// src/screens/SettingsScreen.tsx
// Baby profile (name, birthdate), volume unit. Backup and Pro rows land
// in later sessions — placeholders keep the layout honest.

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { formatBabyAge, parseBirthDate, VolumeUnit } from '../models';
import { useSettings } from '../SettingsContext';
import { colors } from '../theme';
import { exportBackup, pickBackup } from '../backup';
import { exportSummaryPdf } from '../summaryPdf';
import { replaceAllEvents } from '../db';
import { purchasePro, restorePurchases, useProAccess } from '../proAccess';

const toDateString = (ms: number | null): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function SettingsScreen(props: { onBack: () => void }) {
  const { settings, update } = useSettings();
  const isPro = useProAccess();
  const [name, setName] = useState(settings.profile.name);
  const [birthStr, setBirthStr] = useState(toDateString(settings.profile.birthDateMs));

  const birthMs = birthStr.trim() === '' ? null : parseBirthDate(birthStr);
  const birthInvalid = birthStr.trim() !== '' && birthMs == null;
  const [busy, setBusy] = useState(false);

  const doUpgrade = async () => {
    setBusy(true);
    try {
      const ok = await purchasePro();
      if (ok) {
        Alert.alert('Pro unlocked', 'Thanks! The pediatrician PDF summary is now yours.');
      }
    } catch (e) {
      if (!(e as { userCancelled?: boolean })?.userCancelled) {
        Alert.alert('Purchase failed', (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const doRestorePurchases = async () => {
    setBusy(true);
    try {
      const ok = await restorePurchases();
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok
          ? 'Your Pro unlock is active on this device.'
          : 'No previous purchase was found for this account.',
      );
    } catch (e) {
      Alert.alert('Restore failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await exportBackup(settings.profile, settings.unit);
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doSummary = async () => {
    if (!isPro) {
      doUpgrade();
      return;
    }
    setBusy(true);
    try {
      await exportSummaryPdf(settings.profile, settings.unit, 7);
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        'Restore backup?',
        `This replaces ALL current data with ${backup.events.length} entries` +
          (backup.profile.name ? ` for ${backup.profile.name}` : '') +
          '. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace everything',
            style: 'destructive',
            onPress: () => {
              replaceAllEvents(backup.events);
              update({ profile: backup.profile, unit: backup.unit });
              setName(backup.profile.name);
              setBirthStr(toDateString(backup.profile.birthDateMs));
              Alert.alert('Restored', `${backup.events.length} entries imported.`);
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Restore failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    update({ profile: { name: name.trim(), birthDateMs: birthMs } });
    props.onBack();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>Baby</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Baby's name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Birth date (YYYY-MM-DD)</Text>
          <TextInput
            value={birthStr}
            onChangeText={setBirthStr}
            placeholder="2026-03-05"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            style={[styles.input, birthInvalid && styles.inputInvalid]}
          />
          {birthInvalid && <Text style={styles.invalidText}>Use YYYY-MM-DD</Text>}
          {birthMs != null && (
            <Text style={styles.ageText}>{formatBabyAge(birthMs, Date.now())} old</Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>Units</Text>
        <View style={styles.card}>
          <View style={styles.unitRow}>
            {(['ml', 'oz'] as VolumeUnit[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => update({ unit: u })}
                style={[styles.unitChip, settings.unit === u && styles.unitChipActive]}
              >
                <Text
                  style={[
                    styles.unitText,
                    settings.unit === u && styles.unitTextActive,
                  ]}
                >
                  {u}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Dreamfeed Pro</Text>
        <View style={styles.card}>
          {isPro ? (
            <>
              <View style={styles.proRow}>
                <Text style={styles.proActiveText}>Pro unlocked ✓</Text>
              </View>
              <Text style={styles.dataHint}>
                Thanks for supporting Dreamfeed. The pediatrician PDF summary is
                available in Data below.
              </Text>
            </>
          ) : (
            <>
              <Pressable onPress={doUpgrade} disabled={busy} style={styles.proRow}>
                <View style={styles.proRowMain}>
                  <Text style={styles.proRowTitle}>Unlock Dreamfeed Pro</Text>
                  <Text style={styles.proRowSub}>
                    Pediatrician PDF summary + future extras
                  </Text>
                </View>
                <Text style={styles.proPrice}>$14.99</Text>
              </Pressable>
              <Text style={styles.dataHint}>One-time purchase. No subscription.</Text>
            </>
          )}
          <View style={styles.dataDivider} />
          <Pressable
            onPress={doRestorePurchases}
            disabled={busy}
            style={styles.dataRow}
          >
            <Text style={styles.dataRowText}>Restore purchases</Text>
            <Text style={styles.dataRowChev}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <Pressable onPress={doSummary} disabled={busy} style={styles.dataRow}>
            <Text style={styles.dataRowText}>
              Pediatrician summary (PDF, last 7 days){!isPro ? '  🔒' : ''}
            </Text>
            <Text style={styles.dataRowChev}>›</Text>
          </Pressable>
          <View style={styles.dataDivider} />
          <Pressable onPress={doExport} disabled={busy} style={styles.dataRow}>
            <Text style={styles.dataRowText}>Export backup</Text>
            <Text style={styles.dataRowChev}>›</Text>
          </Pressable>
          <View style={styles.dataDivider} />
          <Pressable onPress={doRestore} disabled={busy} style={styles.dataRow}>
            <Text style={styles.dataRowText}>Restore from backup</Text>
            <Text style={styles.dataRowChev}>›</Text>
          </Pressable>
          <Text style={styles.dataHint}>
            Backups are JSON files — save them to Files, iCloud, or email.
          </Text>
        </View>

        <Pressable
          onPress={save}
          disabled={birthInvalid}
          style={[styles.saveBtn, birthInvalid && styles.saveBtnDisabled]}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
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
  body: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
  },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputInvalid: { borderColor: colors.danger },
  invalidText: { color: colors.danger, fontSize: 12, marginTop: 6 },
  ageText: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  unitRow: { flexDirection: 'row', gap: 8 },
  unitChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  unitChipActive: { borderColor: colors.peach, backgroundColor: colors.peachBg },
  unitText: { color: colors.textBody, fontSize: 14 },
  unitTextActive: { color: colors.peachText, fontWeight: '600' },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  proRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  proRowMain: { flex: 1, paddingRight: 12 },
  proRowTitle: { color: colors.peachText, fontSize: 15, fontWeight: '700' },
  proRowSub: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  proPrice: { color: colors.peach, fontSize: 16, fontWeight: '700' },
  proActiveText: { color: colors.peachText, fontSize: 15, fontWeight: '700' },
  dataRowText: { color: colors.textBody, fontSize: 14 },
  dataRowChev: { color: colors.textMuted, fontSize: 16 },
  dataDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  dataHint: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  saveBtn: {
    backgroundColor: colors.peach,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
});
