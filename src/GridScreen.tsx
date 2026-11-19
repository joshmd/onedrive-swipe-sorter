import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Photo } from './graph';

type Props = {
  queue: Photo[];
  onJump: (index: number) => void;
  onClose: () => void;
  onThumbError: (photo: Photo) => void;
};

/** Column counts for "zoom". More columns = zoomed further out. */
const ZOOM = [2, 3, 4, 6, 8];

const monthLabel = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'No date';

/** Thumbnail grid of the queue, in queue order. Tap a photo to continue sorting from there. */
export function GridScreen({ queue, onJump, onClose, onThumbError }: Props) {
  const { width } = useWindowDimensions();
  const [zoom, setZoom] = useState(2);
  const [visibleLabel, setVisibleLabel] = useState(queue[0] ? monthLabel(queue[0].sortDate) : '');
  const cols = ZOOM[zoom];
  const size = Math.floor(width / cols);

  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: Photo }[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setVisibleLabel(monthLabel(first.sortDate));
  }).current;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{visibleLabel}</Text>
        <View style={styles.zoom}>
          <Pressable onPress={() => setZoom((z) => Math.min(z + 1, ZOOM.length - 1))} hitSlop={8}>
            <Text style={[styles.zoomBtn, zoom === ZOOM.length - 1 && styles.disabled]}>−</Text>
          </Pressable>
          <Pressable onPress={() => setZoom((z) => Math.max(z - 1, 0))} hitSlop={8}>
            <Text style={[styles.zoomBtn, zoom === 0 && styles.disabled]}>+</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>{queue.length} to sort. Tap a photo to carry on sorting from there.</Text>
      <FlatList
        key={cols}
        data={queue}
        numColumns={cols}
        keyExtractor={(p) => p.id}
        onViewableItemsChanged={onViewable}
        initialNumToRender={cols * 8}
        windowSize={7}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => onJump(index)} style={{ width: size, height: size, padding: 1 }}>
            <Image
              source={{ uri: item.gridThumbUrl ?? item.thumbnailUrl }}
              style={[styles.thumb, index === 0 && styles.current]}
              contentFit="cover"
              recyclingKey={item.id}
              onError={() => onThumbError(item)}
            />
            {item.isVideo && <Text style={styles.video}>▶</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: '#4fc3f7', fontSize: 16 },
  zoom: { flexDirection: 'row', gap: 18 },
  zoomBtn: { color: '#fff', fontSize: 24, fontWeight: '700' },
  disabled: { opacity: 0.3 },
  hint: { color: '#888', paddingHorizontal: 16, paddingBottom: 8 },
  thumb: { flex: 1, backgroundColor: '#1a1a1a' },
  current: { borderWidth: 3, borderColor: '#4fc3f7' },
  video: { position: 'absolute', right: 6, bottom: 4, color: '#fff', fontSize: 12 },
});
