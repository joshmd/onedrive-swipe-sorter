import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FolderPicker } from './FolderPicker';
import type { SortOrder } from './graph';
import { COLOURS, DIRECTIONS, type Direction, type SwipeAction, type SwipeMap } from './swipeMap';

type Props = {
  map: SwipeMap;
  order: SortOrder;
  onOrderChange: (order: SortOrder) => void;
  scannedAt: number;
  onRescan: () => void;
  excludeId?: string;
  onChange: (map: SwipeMap) => void;
  onClose: () => void;
  onSignOut: () => void;
};

const NAMES: Record<Direction, string> = { left: '◀ Left', right: 'Right ▶', up: '▲ Up', down: '▼ Down' };

function describe(a: SwipeAction): string {
  if (a.type === 'move') return `Move to ${a.folder.path}`;
  if (a.type === 'skip') return 'Skip for later';
  if (a.type === 'delete') return 'Delete (to OneDrive recycle bin)';
  return 'Nothing';
}

export function SettingsScreen({ map, order, onOrderChange, scannedAt, onRescan, excludeId, onChange, onClose, onSignOut }: Props) {
  const [picking, setPicking] = useState<Direction | null>(null);

  if (picking)
    return (
      <FolderPicker
        excludeId={excludeId}
        onCancel={() => setPicking(null)}
        onPick={(folder) => {
          onChange({ ...map, [picking]: { type: 'move', folder } });
          setPicking(null);
        }}
      />
    );

  const set = (dir: Direction, action: SwipeAction) => onChange({ ...map, [dir]: action });

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Swipe settings</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
      {DIRECTIONS.map((dir) => (
        <View key={dir} style={[styles.card, { borderLeftColor: COLOURS[dir] }]}>
          <Text style={styles.dir}>{NAMES[dir]}</Text>
          <Text style={styles.current}>{describe(map[dir])}</Text>
          <View style={styles.choices}>
            <Chip label="Choose folder…" onPress={() => setPicking(dir)} selected={map[dir].type === 'move'} />
            <Chip label="Skip" onPress={() => set(dir, { type: 'skip' })} selected={map[dir].type === 'skip'} />
            <Chip label="Delete" onPress={() => set(dir, { type: 'delete' })} selected={map[dir].type === 'delete'} />
            <Chip label="Nothing" onPress={() => set(dir, { type: 'none' })} selected={map[dir].type === 'none'} />
          </View>
        </View>
      ))}
      <View style={styles.card}>
        <Text style={styles.dir}>Order</Text>
        <Text style={styles.current}>By date taken (or file date if there isn't one). Undated photos go last.</Text>
        <View style={styles.choices}>
          <Chip label="Oldest first" onPress={() => onOrderChange('oldest')} selected={order === 'oldest'} />
          <Chip label="Newest first" onPress={() => onOrderChange('newest')} selected={order === 'newest'} />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.dir}>Camera Roll</Text>
        <Text style={styles.current}>Last scanned {ago(scannedAt)}. Rescans automatically after 6 hours.</Text>
        <View style={styles.choices}>
          <Chip label="Rescan now" onPress={onRescan} selected={false} />
        </View>
      </View>
      <Text style={styles.note}>Folders are under Pictures. Camera Roll is never offered as a destination. Deletes are sent once they drop off the undo list or you leave the app, and go to the OneDrive recycle bin.</Text>
      <Pressable onPress={onSignOut} style={{ marginTop: 24 }}>
        <Text style={styles.dim}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function ago(t: number): string {
  if (!t) return 'never';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const Chip = ({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) => (
  <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
    <Text style={styles.chipText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  link: { color: '#4fc3f7', fontSize: 16 },
  card: { backgroundColor: '#151515', borderRadius: 10, padding: 12, borderLeftWidth: 5, gap: 6 },
  dir: { color: '#fff', fontWeight: '700', fontSize: 16 },
  current: { color: '#bbb' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#2a2a2a' },
  chipOn: { backgroundColor: '#0078d4' },
  chipText: { color: '#fff' },
  note: { color: '#777', fontSize: 12, marginTop: 8 },
  dim: { color: '#999' },
});
