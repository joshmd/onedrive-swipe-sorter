import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getPicturesFolder, listChildFolders, searchFolders } from './graph';
import type { Folder } from './swipeMap';

type Props = {
  /** Camera Roll's ID, hidden from the list so it can never be chosen as a destination. */
  excludeId?: string;
  onPick: (folder: Folder) => void;
  onCancel: () => void;
};

/** Browse folders under Pictures, or type to search the whole Pictures tree. */
export function FolderPicker({ excludeId, onPick, onCancel }: Props) {
  const [trail, setTrail] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const here = trail[trail.length - 1];

  useEffect(() => {
    getPicturesFolder().then((p) => setTrail([p]), (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!here) return;
    const seq = ++searchSeq.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(
      () => {
        const load = query.trim().length >= 2 ? searchFolders(query.trim(), trail[0].path) : listChildFolders(here.id);
        load
          .then((f) => seq === searchSeq.current && setFolders(f.filter((x) => x.id !== excludeId)))
          .catch((e) => seq === searchSeq.current && setError(String(e)))
          .finally(() => seq === searchSeq.current && setLoading(false));
      },
      query ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [here, query, excludeId, trail]);

  const searching = query.trim().length >= 2;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onCancel}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Choose folder</Text>
        <View style={{ width: 50 }} />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search folders in Pictures"
        placeholderTextColor="#666"
        autoCorrect={false}
        style={styles.search}
      />
      {!searching && here && (
        <View style={styles.crumbRow}>
          {trail.length > 1 && (
            <Pressable onPress={() => setTrail((t) => t.slice(0, -1))}>
              <Text style={styles.link}>‹ Back</Text>
            </Pressable>
          )}
          <Text style={styles.crumb} numberOfLines={1}>
            {here.path}
          </Text>
        </View>
      )}
      {!searching && here && trail.length > 1 && (
        <Pressable style={styles.useHere} onPress={() => onPick(here)}>
          <Text style={styles.useHereText}>Use “{here.name}”</Text>
        </Pressable>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{searching ? 'No matching folders' : 'No subfolders'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={{ flex: 1 }} onPress={() => onPick(item)}>
                <Text style={styles.rowName}>{item.name}</Text>
                {searching && <Text style={styles.rowPath}>{item.path}</Text>}
              </Pressable>
              {!searching && (
                <Pressable onPress={() => setTrail((t) => [...t, item])} hitSlop={12}>
                  <Text style={styles.open}>Open ›</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  link: { color: '#4fc3f7', fontSize: 16 },
  search: {
    color: '#fff',
    borderColor: '#444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 16,
  },
  crumbRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  crumb: { color: '#999', flex: 1 },
  useHere: { margin: 16, marginBottom: 4, padding: 12, borderRadius: 8, backgroundColor: '#0078d4' },
  useHereText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  error: { color: '#ff8a80', padding: 16 },
  empty: { color: '#777', padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomColor: '#222',
    borderBottomWidth: 1,
  },
  rowName: { color: '#fff', fontSize: 16 },
  rowPath: { color: '#777', fontSize: 12, marginTop: 2 },
  open: { color: '#4fc3f7', paddingLeft: 16 },
});
