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

type Props = {
  photo: Photo;
  targetLabel: string;
  /** Called after the card has flown off to the right. */
  onSwipeRight: () => void;
};

/**
 * Phase 1: only a right swipe commits (move to the hard-coded folder).
 * Any other release springs back. The label grows as you drag towards it.
 */
export function SwipeCard({ photo, targetLabel, onSwipeRight }: Props) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.3;
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      x.value = e.translationX;
      y.value = e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationX > threshold || e.velocityX > 1200) {
        x.value = withTiming(width * 1.5, { duration: 180 }, (done) => {
          if (done) scheduleOnRN(onSwipeRight);
        });
        y.value = withTiming(0);
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

  const rightLabel = useAnimatedStyle(() => {
    const p = interpolate(x.value, [0, threshold], [0, 1], 'clamp');
    return { opacity: p, transform: [{ scale: 0.8 + p * 0.5 }] };
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.edge, styles.right, rightLabel]}>
        <Text style={styles.edgeText}>{targetLabel} ▶</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          {photo.thumbnailUrl ? (
            <Image source={{ uri: photo.thumbnailUrl }} style={styles.img} contentFit="contain" />
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
    width: '90%',
    height: '80%',
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
  edge: { position: 'absolute', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  right: { right: 8, backgroundColor: '#2e7d32' },
  edgeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
