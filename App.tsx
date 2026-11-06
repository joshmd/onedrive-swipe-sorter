import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { redirectUri, signOut, useMicrosoftSignIn } from './src/auth';
import { clearClientId, getClientId, isValidClientId, setClientId } from './src/settings';
import { TARGET_FOLDER_PATH } from './src/config';
import { getFolderByPath, GraphError, listCameraRoll, moveItem, type Photo } from './src/graph';
import { SwipeCard } from './src/SwipeCard';

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
      <Text style={styles.title}>Set up Swipe Sorter</Text>
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
      {value.length > 0 && !valid && <Text style={styles.error}>Should be a GUID like the placeholder.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
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
        <Text style={styles.title}>OneDrive Swipe Sorter</Text>
        <Button label="Sign in with Microsoft" onPress={auth.signIn} disabled={!auth.ready} />
        {auth.error && <Text style={styles.error}>{auth.error}</Text>}
        <Pressable onPress={onReset}>
          <Text style={styles.dim}>Change app registration</Text>
        </Pressable>
      </Centre>
    );
  return <Sorter onSignOut={auth.signOut} />;
}

function Sorter({ onSignOut }: { onSignOut: () => void }) {
  const [rootId, setRootId] = useState<string>('');
  const [queue, setQueue] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roll, folder] = await Promise.all([listCameraRoll(), getFolderByPath(TARGET_FOLDER_PATH)]);
      setRootId(roll.rootId);
      setQueue(roll.photos);
      setTotal(roll.photos.length);
      setTarget(folder);
    } catch (e) {
      setError(e instanceof GraphError && e.status === 404 ? `Folder not found: ${TARGET_FOLDER_PATH}` : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = queue[0];

  const onSwipeRight = useCallback(async () => {
    if (!current || !target) return;
    setQueue((q) => q.slice(1));
    try {
      await moveItem(current.id, target.id, rootId);
      setMoved((m) => m + 1);
    } catch (e) {
      // Put it back at the front so nothing silently disappears from the queue.
      setQueue((q) => [current, ...q]);
      setError(
        e instanceof GraphError && e.code === 'nameAlreadyExists'
          ? `${current.name} already exists in ${target.name}. Not moved.`
          : `Move failed: ${String(e)}`,
      );
    }
  }, [current, target, rootId]);

  if (loading) return <Centre><ActivityIndicator color="#fff" /><Text style={styles.dim}>Scanning Camera Roll…</Text></Centre>;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Camera Roll · {Math.min(total - queue.length + 1, total)} of {total}
        </Text>
        <Pressable onPress={onSignOut}>
          <Text style={styles.dim}>Sign out</Text>
        </Pressable>
      </View>
      {error && (
        <Pressable onPress={() => setError(null)}>
          <Text style={styles.error}>{error} (tap to dismiss)</Text>
        </Pressable>
      )}
      {current ? (
        <>
          <SwipeCard key={current.id} photo={current} targetLabel={target?.name ?? '…'} onSwipeRight={onSwipeRight} />
          <Text style={styles.footer}>
            {current.takenAt ? new Date(current.takenAt).toLocaleDateString() : current.name} ·{' '}
            {(current.size / 1_048_576).toFixed(1)} MB · swipe right → {target?.name}
          </Text>
        </>
      ) : (
        <Centre>
          <Text style={styles.title}>All done</Text>
          <Text style={styles.dim}>{moved} moved this session</Text>
          <Button label="Rescan" onPress={load} />
        </Centre>
      )}
    </View>
  );
}

const Centre = ({ children }: { children: ReactNode }) => <View style={styles.centre}>{children}</View>;

const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && { opacity: 0.4 }]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  onboarding: { padding: 24, gap: 12 },
  body: { color: '#ddd', lineHeight: 20 },
  step: { color: '#ddd', paddingLeft: 8 },
  code: { color: '#fff', fontFamily: 'monospace', backgroundColor: '#222', padding: 8, borderRadius: 6 },
  input: { color: '#fff', borderColor: '#444', borderWidth: 1, borderRadius: 8, padding: 12, fontFamily: 'monospace' },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  dim: { color: '#999' },
  error: { color: '#ff8a80', textAlign: 'center', padding: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  headerText: { color: '#fff', fontWeight: '600' },
  footer: { color: '#bbb', textAlign: 'center', padding: 16 },
  button: { backgroundColor: '#0078d4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
