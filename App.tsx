import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { redirectUri, signOut, useMicrosoftSignIn } from './src/auth';
import { clearClientId, getClientId, isValidClientId, setClientId } from './src/settings';
import { GraphError, listCameraRoll, moveItem, type Photo } from './src/graph';
import { addPendingDelete, cancelPendingDelete, commitDelete, flushPendingDeletes, getPendingDeletes } from './src/pendingDeletes';
import { SettingsScreen } from './src/SettingsScreen';
import { DIRECTIONS, loadSwipeMap, saveSwipeMap, type Direction, type Folder, type SwipeMap } from './src/swipeMap';
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

type UndoEntry = {
  id: number;
  photo: Photo;
  kind: 'move' | 'skip' | 'delete';
  /** Resolves true once a move has succeeded on the server. */
  done: Promise<boolean>;
};

const UNDO_LIMIT = 10;

function Sorter({ onSignOut }: { onSignOut: () => void }) {
  const [rootId, setRootId] = useState<string>('');
  const [queue, setQueue] = useState<Photo[]>([]);
  const [map, setMap] = useState<SwipeMap | null>(null);
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moved, setMoved] = useState(0);
  const [deleted, setDeleted] = useState(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const historyRef = useRef<UndoEntry[]>([]);
  const rootRef = useRef('');
  const nextId = useRef(1);

  const setHist = (h: UndoEntry[]) => {
    historyRef.current = h;
    setHistory(h);
  };

  const sendDelete = (photo: Photo) => {
    commitDelete(photo.id, rootRef.current).catch((e) =>
      setError(`Delete of ${photo.name} failed, will retry later: ${String(e)}`),
    );
  };

  /** Sends all pending deletes. They stop being undoable. */
  const flushDeletes = useCallback(async () => {
    if (!rootRef.current) return;
    setHist(historyRef.current.filter((e) => e.kind !== 'delete'));
    const failed = await flushPendingDeletes(rootRef.current);
    if (failed) setError(`${failed} delete(s) failed and will be retried next time.`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await flushDeletes();
      const [roll, saved] = await Promise.all([listCameraRoll(), loadSwipeMap()]);
      rootRef.current = roll.rootId;
      setRootId(roll.rootId);
      // Covers a killed app: anything still pending from last time is hidden,
      // then its delete is sent.
      const pending = await getPendingDeletes();
      setQueue(roll.photos.filter((p) => !pending.has(p.id)));
      const failed = await flushPendingDeletes(roll.rootId);
      if (failed) setError(`${failed} delete(s) failed and will be retried next time.`);
      setMap(saved);
      setHist([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [flushDeletes]);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving the app commits pending deletes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') flushDeletes();
    });
    return () => sub.remove();
  }, [flushDeletes]);

  const record = (entry: UndoEntry) => {
    const all = [...historyRef.current, entry];
    const evicted = all.slice(0, Math.max(0, all.length - UNDO_LIMIT));
    setHist(all.slice(-UNDO_LIMIT));
    // A delete that can no longer be undone is sent now.
    for (const e of evicted) if (e.kind === 'delete') sendDelete(e.photo);
  };

  const skip = useCallback(() => {
    const [photo, ...rest] = queueRef.current;
    if (!photo) return;
    // Skipped photos go to the back of this session's queue.
    setQueue([...rest, photo]);
    record({ id: nextId.current++, photo, kind: 'skip', done: Promise.resolve(true) });
  }, []);

  const remove = useCallback(() => {
    const [photo, ...rest] = queueRef.current;
    if (!photo) return;
    setQueue(rest);
    setDeleted((d) => d + 1);
    addPendingDelete(photo.id).catch((e) => setError(`Could not queue delete: ${String(e)}`));
    record({ id: nextId.current++, photo, kind: 'delete', done: Promise.resolve(true) });
  }, []);

  const move = useCallback(
    (folder: Folder) => {
      const [photo, ...rest] = queueRef.current;
      if (!photo) return;
      setQueue(rest);
      const id = nextId.current++;
      const done = moveItem(photo.id, folder.id, rootId).then(
        () => {
          setMoved((m) => m + 1);
          return true;
        },
        (e) => {
          // Put it back at the front so nothing silently disappears from the queue.
          setQueue((q) => [photo, ...q]);
          setHist(historyRef.current.filter((x) => x.id !== id));
          setError(
            e instanceof GraphError && e.code === 'nameAlreadyExists'
              ? `${photo.name} already exists in ${folder.name}. Not moved.`
              : `Move failed: ${String(e)}`,
          );
          return false;
        },
      );
      record({ id, photo, kind: 'move', done });
    },
    [rootId],
  );

  const onSwipe = useCallback(
    (dir: Direction) => {
      const action = map?.[dir];
      if (action?.type === 'move') move(action.folder);
      else if (action?.type === 'skip') skip();
      else if (action?.type === 'delete') remove();
    },
    [map, move, skip, remove],
  );

  const undoBusy = useRef(false);
  const undo = useCallback(async () => {
    const entry = historyRef.current[historyRef.current.length - 1];
    if (!entry || undoBusy.current) return;
    undoBusy.current = true;
    setHist(historyRef.current.slice(0, -1));
    try {
      await undoEntry(entry);
    } finally {
      undoBusy.current = false;
    }
  }, [rootId]);

  const undoEntry = async (entry: UndoEntry) => {
    if (entry.kind === 'skip') {
      setQueue((q) => {
        const i = q.lastIndexOf(entry.photo);
        const without = i >= 0 ? [...q.slice(0, i), ...q.slice(i + 1)] : q;
        return [entry.photo, ...without];
      });
      return;
    }
    if (entry.kind === 'delete') {
      // Not sent yet, so undo only has to cancel it.
      await cancelPendingDelete(entry.photo.id);
      setDeleted((d) => d - 1);
      setQueue((q) => [entry.photo, ...q]);
      return;
    }
    // Wait for the original move to finish, then move the file back to where it came from.
    if (!(await entry.done)) return;
    try {
      await moveItem(entry.photo.id, entry.photo.parentId, rootId);
      setMoved((m) => m - 1);
      setQueue((q) => [entry.photo, ...q]);
    } catch (e) {
      setError(`Undo failed: ${String(e)}`);
    }
  };

  const changeMap = useCallback((m: SwipeMap) => {
    setMap(m);
    saveSwipeMap(m).catch((e) => setError(`Could not save settings: ${String(e)}`));
  }, []);

  const signOutSafely = useCallback(async () => {
    await flushDeletes();
    onSignOut();
  }, [flushDeletes, onSignOut]);

  if (loading || !map)
    return (
      <Centre>
        <ActivityIndicator color="#fff" />
        <Text style={styles.dim}>Scanning Camera Roll…</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {error && <Button label="Retry" onPress={load} />}
      </Centre>
    );

  if (settingsOpen)
    return (
      <SettingsScreen
        map={map}
        excludeId={rootId}
        onChange={changeMap}
        onClose={() => setSettingsOpen(false)}
        onSignOut={signOutSafely}
      />
    );

  const current = queue[0];
  const nothingMapped = DIRECTIONS.every((d) => map[d].type === 'none' || map[d].type === 'skip');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Camera Roll · {queue.length} left · {moved} moved · {deleted} deleted
        </Text>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>
      {error && (
        <Pressable onPress={() => setError(null)}>
          <Text style={styles.error}>{error} (tap to dismiss)</Text>
        </Pressable>
      )}
      {nothingMapped && (
        <Pressable onPress={() => setSettingsOpen(true)}>
          <Text style={styles.hint}>No folders or delete set yet. Tap here to choose a folder for each swipe direction.</Text>
        </Pressable>
      )}
      {current ? (
        <>
          <SwipeCard key={`${current.id}:${nextId.current}`} photo={current} map={map} onSwipe={onSwipe} />
          <Text style={styles.footer}>
            {current.takenAt ? new Date(current.takenAt).toLocaleDateString() : current.name} ·{' '}
            {(current.size / 1_048_576).toFixed(1)} MB
          </Text>
        </>
      ) : (
        <Centre>
          <Text style={styles.title}>All done</Text>
          <Text style={styles.dim}>
            {moved} moved · {deleted} deleted this session
          </Text>
          <Button label="Rescan" onPress={load} />
        </Centre>
      )}
      <View style={styles.toolbar}>
        <Button label="↶ Undo" onPress={undo} disabled={history.length === 0} />
        <Button label="Skip ⏭" onPress={skip} disabled={!current} />
      </View>
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
  footer: { color: '#bbb', textAlign: 'center', paddingTop: 8 },
  toolbar: { flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 16 },
  gear: { color: '#fff', fontSize: 22 },
  hint: { color: '#4fc3f7', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  button: { backgroundColor: '#0078d4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
