import * as SecureStore from 'expo-secure-store';

export type Direction = 'left' | 'right' | 'up' | 'down';
export const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];

export type Folder = { id: string; name: string; path: string };

export type SwipeAction =
  | { type: 'move'; folder: Folder }
  | { type: 'skip' }
  | { type: 'delete' }
  | { type: 'none' };

export type SwipeMap = Record<Direction, SwipeAction>;

export const DEFAULT_MAP: SwipeMap = {
  left: { type: 'none' },
  right: { type: 'none' },
  up: { type: 'none' },
  down: { type: 'skip' },
};

export const COLOURS: Record<Direction, string> = {
  left: '#c62828',
  right: '#2e7d32',
  up: '#1565c0',
  down: '#6d4c41',
};

const KEY = 'swipe_map_v1';

export function actionLabel(a: SwipeAction): string {
  if (a.type === 'move') return a.folder.name;
  if (a.type === 'skip') return 'Skip';
  if (a.type === 'delete') return 'Delete';
  return '';
}

export async function loadSwipeMap(): Promise<SwipeMap> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return DEFAULT_MAP;
  try {
    return { ...DEFAULT_MAP, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MAP;
  }
}

export function saveSwipeMap(map: SwipeMap): Promise<void> {
  return SecureStore.setItemAsync(KEY, JSON.stringify(map));
}
