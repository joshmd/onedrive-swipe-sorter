import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { redirectUri, signOut, useMicrosoftSignIn } from './src/auth';
import { clearClientId, getClientId, isValidClientId, setClientId } from './src/settings';
import { Sorter } from './src/Sorter';
import { Button, Centre, ui } from './src/ui';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <Root />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function Root() {
  // undefined = still loading, null = onboarding needed.
  const [clientId, setId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getClientId().then(setId);
  }, []);

  const reset = useCallback(async () => {
    // Tokens belong to the old app registration, so drop them too.
    await signOut();
    await clearClientId();
    setId(null);
  }, []);

  if (clientId === undefined) return <Centre><ActivityIndicator color="#fff" /></Centre>;
  if (!clientId) return <Onboarding onDone={setId} />;
  return <SignedInGate key={clientId} clientId={clientId} onReset={reset} />;
}

function Onboarding({ onDone }: { onDone: (id: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = isValidClientId(value);

  const save = async () => {
    try {
      await setClientId(value);
      onDone(value.trim().toLowerCase());
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.onboarding} keyboardShouldPersistTaps="handled">
      <Text style={ui.title}>Set up Swipe Sorter</Text>
      <Text style={styles.body}>
        This app signs in through your own Microsoft Entra app registration. Create one with these settings:
      </Text>
      <Text style={styles.step}>1. Account types: Personal Microsoft accounts only</Text>
      <Text style={styles.step}>2. Platform: Mobile and desktop applications</Text>
      <Text style={styles.step}>3. Redirect URI:</Text>
      <Text selectable style={styles.code}>{redirectUri}</Text>
      <Text style={styles.step}>4. Delegated permissions: Files.ReadWrite, User.Read, offline_access</Text>
      <Text style={styles.body}>Then paste its Application (client) ID here. It is stored only on this phone.</Text>
      <TextInput
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
        }}
        placeholder="00000000-0000-0000-0000-000000000000"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {value.length > 0 && !valid && <Text style={ui.error}>Should be a GUID like the placeholder.</Text>}
      {error && <Text style={ui.error}>{error}</Text>}
      <Button label="Save and continue" onPress={save} disabled={!valid} />
    </ScrollView>
  );
}

function SignedInGate({ clientId, onReset }: { clientId: string; onReset: () => void }) {
  const auth = useMicrosoftSignIn(clientId);
  if (auth.signedIn === null) return <Centre><ActivityIndicator color="#fff" /></Centre>;
  if (!auth.signedIn)
    return (
      <Centre>
        <Text style={ui.title}>OneDrive Swipe Sorter</Text>
        <Button label="Sign in with Microsoft" onPress={auth.signIn} disabled={!auth.ready} />
        {auth.error && <Text style={ui.error}>{auth.error}</Text>}
        <Pressable onPress={onReset}>
          <Text style={ui.dim}>Change app registration</Text>
        </Pressable>
      </Centre>
    );
  return <Sorter onSignOut={auth.signOut} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  onboarding: { padding: 24, gap: 12 },
  body: { color: '#ddd', lineHeight: 20 },
  step: { color: '#ddd', paddingLeft: 8 },
  code: { color: '#fff', fontFamily: 'monospace', backgroundColor: '#222', padding: 8, borderRadius: 6 },
  input: { color: '#fff', borderColor: '#444', borderWidth: 1, borderRadius: 8, padding: 12, fontFamily: 'monospace' },
});
