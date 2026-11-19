import { File, Paths } from 'expo-file-system';
import type { Photo } from './graph';

/**
 * The sorting queue, saved on the phone so reopening the app doesn't rescan
 * Camera Roll. It's kept up to date as you sort, so it reflects moves,
 * deletes and skips. A scan older than MAX_AGE is redone automatically.
 */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type ScanCache = { version: 1; scannedAt: number; rootId: string; queue: Photo[] };

const file = () => new File(Paths.document, 'scan-cache.json');

export async function loadScanCache(): Promise<ScanCache | null> {
  try {
    const f = file();
    if (!f.exists) return null;
    const c = JSON.parse(await f.text());
    return c?.version === 1 && Array.isArray(c.queue) ? c : null;
  } catch {
    return null;
  }
}

export function saveScanCache(c: ScanCache) {
  try {
    file().write(JSON.stringify(c));
  } catch {
    // Not fatal: the next launch just rescans.
  }
}

export function clearScanCache() {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {}
}
