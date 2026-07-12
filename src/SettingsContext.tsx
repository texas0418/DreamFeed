// src/SettingsContext.tsx
// App settings: baby profile, volume unit, onboarded flag.
// Persisted via expo-sqlite/kv-store (same API as AsyncStorage, but backed
// by SQLite we already ship — no separate native dependency to version-match).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Storage from 'expo-sqlite/kv-store';
import type { BabyProfile, VolumeUnit } from './models';

const KEY = 'dreamfeed.settings.v1';

export interface Settings {
  profile: BabyProfile;
  unit: VolumeUnit;
  onboarded: boolean;
}

const DEFAULTS: Settings = {
  profile: { name: '', birthDateMs: null },
  unit: 'ml',
  onboarded: false,
};

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULTS,
  loaded: false,
  update: () => {},
});

export function SettingsProvider(props: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Storage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setSettings({
            ...DEFAULTS,
            ...parsed,
            profile: { ...DEFAULTS.profile, ...(parsed.profile ?? {}) },
          });
        }
      })
      .catch((e) => console.warn('settings load failed', e))
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        ...patch,
        profile: { ...prev.profile, ...(patch.profile ?? {}) },
      };
      Storage.setItem(KEY, JSON.stringify(next)).catch((e) =>
        console.warn('settings save failed', e),
      );
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, update }}>
      {props.children}
    </SettingsContext.Provider>
  );
}

export const useSettings = (): Ctx => useContext(SettingsContext);
