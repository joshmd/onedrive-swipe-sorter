import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getThumbnails,
  GraphError,
  itemExists,
  listCameraRoll,
  moveItem,
  sortPhotos,
  type Photo,
  type SortOrder,
} from './graph';
import { GridScreen } from './GridScreen';
import {
  addPendingDelete,
  cancelPendingDelete,
  flushPendingDeletes,
  getPendingDeletes,
  type FlushResult,
} from './pendingDeletes';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { clearScanCache, loadScanCache, MAX_AGE_MS, saveScanCache } from './scanCache';
import { SettingsScreen } from './SettingsScreen';
import { SwipeCard } from './SwipeCard';
import { DIRECTIONS, loadSwipeMap, saveSwipeMap, type Direction, type Folder, type SwipeMap } from './swipeMap';
import { Button, Centre, ui } from './ui';

type UndoEntry = {
  id: number;
  photo: Photo;
  kind: 'move' | 'skip' | 'delete';
  /** Resolves true once a move has succeeded on the server. */
  done: Promise<boolean>;
};

const UNDO_LIMIT = 10;

type View_ = 'sort' | 'settings' | 'grid';

export function Sorter({ onSignOut }: { onSignOut: () => void }) {
  const [rootId, setRootId] = useState('');
  const [queue, setQueue] = useState<Photo[]>([]);
  const [map, setMap] = useState<SwipeMap | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ order: 'oldest' });
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View_>('sort');
  const [moved, setMoved] = useState(0);
  const [deleted, setDeleted] = useState(0);
  const [scannedAt, setScannedAt] = useState(0);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const historyRef = useRef<UndoEntry[]>([]);
  const rootRef = useRef('');
  const scannedAtRef = useRef(0);
  const nextId = useRef(1);
  const thumbRetried = useRef(new Set<string>());

  const setHist = (h: UndoEntry[]) => {
    historyRef.current = h;
    setHistory(h);
  };

  const without = (q: Photo[], photo: Photo) => q.filter((p) => p.id !== photo.id);

  // ---- persistence ---------------------------------------------------------

  const persistNow = useCallback(() => {
    if (rootRef.current && scannedAtRef.current)
      saveScanCache({ version: 1, scannedAt: scannedAtRef.current, rootId: rootRef.current, queue: queueRef.current });
  }, []);

  // Save the queue a moment after it changes, so reopening the app picks up where you left off.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(persistNow, 1000);
    return () => clearTimeout(t);
  }, [queue, loading, persistNow]);

  // ---- deletes -------------------------------------------------------------

  /** Network failures stay quiet (they are retried); anything else is shown. */
  const report = (r: FlushResult) => {
    if (r.gaveUp.length)
      setError(
        `Couldn't delete ${r.gaveUp.join(', ')} after 3 tries, so left in Camera Roll. Last error: ${r.firstError}`,
      );
    else if (r.otherFailed) setError(`${r.otherFailed} delete(s) failed and will be retried: ${r.firstError}`);
  };

  /** Sends all pending deletes. They stop being undoable. */
  const flushDeletes = useCallback(async () => {
    if (!rootRef.current) return;
    setHist(historyRef.current.filter((e) => e.kind !== 'delete'));
    report(await flushPendingDeletes(rootRef.current));
  }, []);

  const sendDelete = (photo: Photo) => {
    flushPendingDeletes(rootRef.current, [photo.id]).then(report);
  };

  // ---- loading -------------------------------------------------------------

  const fullScan = useCallback(
    async (order: SortOrder) => {
      await flushDeletes();
      const roll = await listCameraRoll();
      rootRef.current = roll.rootId;
      setRootId(roll.rootId);
      const pending = await getPendingDeletes();
      setQueue(sortPhotos(roll.photos.filter((p) => !pending.has(p.id)), order));
      scannedAtRef.current = Date.now();
      setScannedAt(scannedAtRef.current);
      setHist([]);
      thumbRetried.current.clear();
    },
    [flushDeletes],
  );

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cache, savedMap, savedPrefs, pending] = await Promise.all([
        loadScanCache(),
        loadSwipeMap(),
        loadPrefs(),
        getPendingDeletes(),
      ]);
      setMap(savedMap);
      setPrefs(savedPrefs);
      if (cache && Date.now() - cache.scannedAt < MAX_AGE_MS) {
        // Recent enough: carry on from the saved queue without rescanning.
        rootRef.current = cache.rootId;
        setRootId(cache.rootId);
        setQueue(cache.queue.filter((p) => !pending.has(p.id)));
        scannedAtRef.current = cache.scannedAt;
        setScannedAt(cache.scannedAt);
      } else {
        await fullScan(savedPrefs.order);
      }
      // Finish any deletes left over from a killed app.
      report(await flushPendingDeletes(rootRef.current));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fullScan]);

  useEffect(() => {
    init();
  }, [init]);

  const rescan = useCallback(async () => {
    setView('sort');
    setLoading(true);
    setError(null);
    try {
      await fullScan(prefs.order);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fullScan, prefs.order]);

  // Leaving the app saves the queue and commits pending deletes; coming back retries any that failed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        persistNow();
        flushDeletes();
      } else if (state === 'active' && rootRef.current) {
        flushPendingDeletes(rootRef.current).then(report);
      }
    });
    return () => sub.remove();
  }, [flushDeletes, persistNow]);

  // ---- actions -------------------------------------------------------------

  const record = (entry: UndoEntry) => {
    const all = [...historyRef.current, entry];
    const evicted = all.slice(0, Math.max(0, all.length - UNDO_LIMIT));
    setHist(all.slice(-UNDO_LIMIT));
    // A delete that can no longer be undone is sent now.
    for (const e of evicted) if (e.kind === 'delete') sendDelete(e.photo);
  };

  const skip = useCallback((photo: Photo | undefined = queueRef.current[0]) => {
    if (!photo) return;
    // Skipped photos go to the back of the queue.
    setQueue((q) => [...without(q, photo), photo]);
    record({ id: nextId.current++, photo, kind: 'skip', done: Promise.resolve(true) });
  }, []);

  const remove = useCallback((photo: Photo) => {
    setQueue((q) => without(q, photo));
    setDeleted((d) => d + 1);
    addPendingDelete(photo.id, photo.name).catch((e) => setError(`Could not queue delete: ${String(e)}`));
    record({ id: nextId.current++, photo, kind: 'delete', done: Promise.resolve(true) });
  }, []);

  const move = useCallback((photo: Photo, folder: Folder) => {
    setQueue((q) => without(q, photo));
    const id = nextId.current++;
    const dropEntry = () => setHist(historyRef.current.filter((x) => x.id !== id));
    const done = moveItem(photo.id, folder.id, rootRef.current).then(
      () => {
        setMoved((m) => m + 1);
        return true;
      },
      async (e) => {
        dropEntry();
        if (e instanceof GraphError && e.status === 404) {
          // Either the photo or the folder has gone. Find out which.
          const photoThere = await itemExists(photo.id).catch(() => true);
          if (!photoThere) {
            setError(`${photo.name} is no longer in OneDrive (moved or deleted elsewhere), so it was taken off the list.`);
            return false;
          }
          setQueue((q) => [photo, ...without(q, photo)]);
          setError(`Folder "${folder.name}" wasn't found. It may have been moved or deleted. Choose it again in settings.`);
          return false;
        }
        // Put it back at the front so nothing silently disappears from the queue.
        setQueue((q) => [photo, ...without(q, photo)]);
        setError(
          e instanceof GraphError && e.code === 'nameAlreadyExists'
            ? `${photo.name} already exists in ${folder.name}. Not moved.`
            : `Move of ${photo.name} failed: ${String(e)}`,
        );
        return false;
      },
    );
    record({ id, photo, kind: 'move', done });
  }, []);

  const onSwipe = useCallback(
    (photo: Photo, dir: Direction) => {
      const action = map?.[dir];
      if (action?.type === 'move') move(photo, action.folder);
      else if (action?.type === 'skip') skip(photo);
      else if (action?.type === 'delete') remove(photo);
    },
    [map, move, skip, remove],
  );

  const undoBusy = useRef(false);
  const undo = useCallback(async () => {
    const entry = historyRef.current[historyRef.current.length - 1];
    if (!entry || undoBusy.current) return;
    undoBusy.current = true;
    setHist(historyRef.current.slice(0, -1));
    const toFront = () => setQueue((q) => [entry.photo, ...without(q, entry.photo)]);
    try {
      if (entry.kind === 'skip') return toFront();
      if (entry.kind === 'delete') {
        // Not sent yet, so undo only has to cancel it.
        await cancelPendingDelete(entry.photo.id);
        setDeleted((d) => d - 1);
        return toFront();
      }
      // Wait for the original move to finish, then move the file back to where it came from.
      if (!(await entry.done)) return;
      await moveItem(entry.photo.id, entry.photo.parentId, rootRef.current);
      setMoved((m) => m - 1);
      toFront();
    } catch (e) {
      setError(`Undo failed: ${String(e)}`);
    } finally {
      undoBusy.current = false;
    }
  }, []);

  /** Continue sorting from a photo picked in the grid. Earlier photos wrap round to the end. */
  const jumpTo = useCallback((index: number) => {
    setQueue((q) => [...q.slice(index), ...q.slice(0, index)]);
    setView('sort');
  }, []);

  /** Thumbnail links expire; fetch fresh ones once per photo. */
  const refreshThumb = useCallback((photo: Photo) => {
    if (thumbRetried.current.has(photo.id)) return;
    thumbRetried.current.add(photo.id);
    getThumbnails(photo.id)
      .then((t) =>
        setQueue((q) =>
          q.map((p) => (p.id === photo.id ? { ...p, thumbnailUrl: t.large, gridThumbUrl: t.medium } : p)),
        ),
      )
      .catch(() => {});
  }, []);

  const changeMap = useCallback((m: SwipeMap) => {
    setMap(m);
    saveSwipeMap(m).catch((e) => setError(`Could not save settings: ${String(e)}`));
  }, []);

  const changeOrder = useCallback((order: SortOrder) => {
    setPrefs((p) => {
      const next = { ...p, order };
      savePrefs(next).catch(() => {});
      return next;
    });
    setQueue((q) => sortPhotos(q, order));
  }, []);

  const signOutSafely = useCallback(async () => {
    await flushDeletes();
    clearScanCache();
    onSignOut();
  }, [flushDeletes, onSignOut]);

  // ---- render --------------------------------------------------------------

  if (loading || !map)
    return (
      <Centre>
        <ActivityIndicator color="#fff" />
        <Text style={ui.dim}>Scanning Camera Roll…</Text>
        {error && <Text style={ui.error}>{error}</Text>}
        {error && <Button label="Retry" onPress={init} />}
      </Centre>
    );

  if (view === 'settings')
    return (
      <SettingsScreen
        map={map}
        order={prefs.order}
        onOrderChange={changeOrder}
        scannedAt={scannedAt}
        onRescan={rescan}
        excludeId={rootId}
        onChange={changeMap}
        onClose={() => setView('sort')}
        onSignOut={signOutSafely}
      />
    );

  if (view === 'grid')
    return <GridScreen queue={queue} onJump={jumpTo} onClose={() => setView('sort')} onThumbError={refreshThumb} />;

  const current = queue[0];
  const nothingMapped = DIRECTIONS.every((d) => map[d].type === 'none' || map[d].type === 'skip');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {queue.length} left · {moved} moved · {deleted} deleted
        </Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => setView('grid')} hitSlop={12} disabled={!current}>
            <Text style={styles.icon}>▦</Text>
          </Pressable>
          <Pressable onPress={() => setView('settings')} hitSlop={12}>
            <Text style={styles.icon}>⚙</Text>
          </Pressable>
        </View>
      </View>
      {error && (
        <Pressable onPress={() => setError(null)}>
          <Text style={ui.error}>{error} (tap to dismiss)</Text>
        </Pressable>
      )}
      {nothingMapped && (
        <Pressable onPress={() => setView('settings')}>
          <Text style={styles.hint}>No folders or delete set yet. Tap here to choose what each swipe does.</Text>
        </Pressable>
      )}
      {current ? (
        <>
          <SwipeCard
            key={`${current.id}:${nextId.current}`}
            photo={current}
            map={map}
            onSwipe={(dir) => onSwipe(current, dir)}
            onImageError={() => refreshThumb(current)}
          />
          <Text style={styles.footer}>
            {current.sortDate ? new Date(current.sortDate).toLocaleDateString() : current.name} ·{' '}
            {(current.size / 1_048_576).toFixed(1)} MB
          </Text>
        </>
      ) : (
        <Centre>
          <Text style={ui.title}>All done</Text>
          <Text style={ui.dim}>
            {moved} moved · {deleted} deleted this session
          </Text>
          <Button label="Rescan" onPress={rescan} />
        </Centre>
      )}
      <View style={styles.toolbar}>
        <Button label="↶ Undo" onPress={undo} disabled={history.length === 0} />
        <Button label="Skip ⏭" onPress={() => skip()} disabled={!current} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerText: { color: '#fff', fontWeight: '600' },
  headerButtons: { flexDirection: 'row', gap: 20 },
  icon: { color: '#fff', fontSize: 22 },
  footer: { color: '#bbb', textAlign: 'center', paddingTop: 8 },
  toolbar: { flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 16 },
  hint: { color: '#4fc3f7', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
});
