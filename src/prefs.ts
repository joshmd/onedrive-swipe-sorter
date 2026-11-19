import * as SecureStore from 'expo-secure-store';
import type { SortOrder } from './graph';

export type Prefs = { order: SortOrder };

const KEY = 'prefs_v1';
const DEFAULTS: Prefs = { order: 'oldest' };

export async function loadPrefs(): Promise<Prefs> {
  try {
    return { ...DEFAULTS, ...JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(p: Prefs): Promise<void> {
  return SecureStore.setItemAsync(KEY, JSON.stringify(p));
}
