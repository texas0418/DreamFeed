import { useEffect, useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { SettingsProvider, useSettings } from './src/SettingsContext';
import { initPurchases } from './src/proAccess';

function Root() {
  const { settings, loaded } = useSettings();
  const [screen, setScreen] = useState<'home' | 'history' | 'settings'>('home');
  if (!loaded) return null;
  if (!settings.onboarded) return <OnboardingScreen />;
  if (screen === 'history') return <HistoryScreen onBack={() => setScreen('home')} />;
  if (screen === 'settings') return <SettingsScreen onBack={() => setScreen('home')} />;
  return (
    <HomeScreen
      onHistory={() => setScreen('history')}
      onSettings={() => setScreen('settings')}
    />
  );
}

export default function App() {
  useEffect(() => {
    // Fail-open: unlocks Pro immediately in Expo Go / placeholder builds.
    initPurchases();
  }, []);
  return (
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  );
}
