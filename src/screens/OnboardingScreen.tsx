// src/screens/OnboardingScreen.tsx
// First run only. Name + birthdate, both skippable — never block logging.

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { parseBirthDate } from '../models';
import { useSettings } from '../SettingsContext';
import { colors } from '../theme';

export default function OnboardingScreen() {
  const { update } = useSettings();
  const [name, setName] = useState('');
  const [birthStr, setBirthStr] = useState('');

  const birthMs = birthStr.trim() === '' ? null : parseBirthDate(birthStr);
  const birthInvalid = birthStr.trim() !== '' && birthMs == null;

  const finish = (skip: boolean) => {
    update({
      onboarded: true,
      profile: skip
        ? { name: '', birthDateMs: null }
        : { name: name.trim(), birthDateMs: birthMs },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.body}>
        <Text style={styles.title}>Welcome to Dreamfeed</Text>
        <Text style={styles.subtitle}>
          Feeds, sleep, and diapers — logged in two taps, even at 3am.
        </Text>

        <Text style={styles.fieldLabel}>Baby&apos;s name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Luca"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Birth date (YYYY-MM-DD, optional)</Text>
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

        <Pressable
          onPress={() => finish(false)}
          disabled={birthInvalid}
          style={[styles.startBtn, birthInvalid && styles.startBtnDisabled]}
        >
          <Text style={styles.startBtnText}>Start</Text>
        </Pressable>
        <Pressable onPress={() => finish(true)} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 8, marginBottom: 28 },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputInvalid: { borderColor: colors.danger },
  invalidText: { color: colors.danger, fontSize: 12, marginTop: 6 },
  startBtn: {
    backgroundColor: colors.peach,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipBtnText: { color: colors.textMuted, fontSize: 14 },
});
