import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMicrosoftSignIn } from './src/auth';
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
  const auth = useMicrosoftSignIn();
  if (auth.signedIn === null) return <Centre><ActivityIndicator color="#fff" /></Centre>;
  if (!auth.signedIn)
    return (
      <Centre>
        <Text style={styles.title}>OneDrive Swipe Sorter</Text>
        <Button label="Sign in with Microsoft" onPress={auth.signIn} disabled={!auth.ready} />
        {auth.error && <Text style={styles.error}>{auth.error}</Text>}
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
