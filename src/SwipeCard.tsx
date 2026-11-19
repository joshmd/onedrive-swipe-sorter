import { Image } from 'expo-image';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Photo } from './graph';
import { actionLabel, COLOURS, type Direction, type SwipeMap } from './swipeMap';

type Props = {
  photo: Photo;
  map: SwipeMap;
  /** Called after the card has flown off in that direction. */
  onSwipe: (direction: Direction) => void;
  /** Called if the thumbnail fails to load (e.g. an expired URL). */
  onImageError?: () => void;
};

/**
 * Four-way swipe. A direction mapped to "nothing" springs back.
 * The label on the edge you drag towards grows as you approach the threshold.
 */
export function SwipeCard({ photo, map, onSwipe, onImageError }: Props) {
  const { width, height } = useWindowDimensions();
  const hThreshold = width * 0.3;
  const vThreshold = height * 0.18;
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const active = {
    left: map.left.type !== 'none',
    right: map.right.type !== 'none',
    up: map.up.type !== 'none',
    down: map.down.type !== 'none',
  };

  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      x.value = e.translationX;
      y.value = e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      let dir: Direction | null = null;
      if (horizontal) {
        if (e.translationX > hThreshold || e.velocityX > 1200) dir = 'right';
        else if (e.translationX < -hThreshold || e.velocityX < -1200) dir = 'left';
      } else {
        if (e.translationY > vThreshold || e.velocityY > 1200) dir = 'down';
        else if (e.translationY < -vThreshold || e.velocityY < -1200) dir = 'up';
      }
      if (dir && active[dir]) {
        const d = dir;
        const tx = d === 'right' ? width * 1.5 : d === 'left' ? -width * 1.5 : 0;
        const ty = d === 'down' ? height * 1.2 : d === 'up' ? -height * 1.2 : 0;
        x.value = withTiming(tx, { duration: 180 });
        y.value = withTiming(ty, { duration: 180 }, (done) => {
          if (done) scheduleOnRN(onSwipe, d);
        });
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, width], [-12, 12])}deg` },
    ],
  }));

  // Called from useAnimatedStyle on the UI thread, so it must be a worklet too.
  const grow = (p: number) => {
    'worklet';
    return { opacity: 0.25 + p * 0.75, transform: [{ scale: 0.85 + p * 0.45 }] };
  };
  const rightStyle = useAnimatedStyle(() => grow(interpolate(x.value, [0, hThreshold], [0, 1], 'clamp')));
  const leftStyle = useAnimatedStyle(() => grow(interpolate(x.value, [-hThreshold, 0], [1, 0], 'clamp')));
  const downStyle = useAnimatedStyle(() => grow(interpolate(y.value, [0, vThreshold], [0, 1], 'clamp')));
  const upStyle = useAnimatedStyle(() => grow(interpolate(y.value, [-vThreshold, 0], [1, 0], 'clamp')));

  const edge = (dir: Direction, style: object, pos: object, arrow: string) =>
    active[dir] && (
      <Animated.View style={[styles.edge, pos, { backgroundColor: COLOURS[dir] }, style]}>
        <Text style={styles.edgeText} numberOfLines={1}>
          {dir === 'left' || dir === 'up' ? `${arrow} ${actionLabel(map[dir])}` : `${actionLabel(map[dir])} ${arrow}`}
        </Text>
      </Animated.View>
    );

  return (
    <View style={styles.wrap}>
      {edge('left', leftStyle, styles.left, '◀')}
      {edge('right', rightStyle, styles.right, '▶')}
      {edge('up', upStyle, styles.up, '▲')}
      {edge('down', downStyle, styles.down, '▼')}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          {photo.thumbnailUrl ? (
            <Image source={{ uri: photo.thumbnailUrl }} style={styles.img} contentFit="contain" onError={onImageError} />
          ) : (
            <Text style={styles.noThumb}>No thumbnail</Text>
          )}
          {photo.isVideo && <Text style={styles.video}>▶ video</Text>}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '78%',
    height: '74%',
    borderRadius: 16,
    backgroundColor: '#111',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  img: { width: '100%', height: '100%' },
  noThumb: { color: '#aaa' },
  video: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    color: '#fff',
    backgroundColor: '#0008',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  edge: { position: 'absolute', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, maxWidth: '45%', zIndex: 2 },
  left: { left: 4 },
  right: { right: 4 },
  up: { top: 4 },
  down: { bottom: 4 },
  edgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
