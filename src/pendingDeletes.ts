import * as SecureStore from 'expo-secure-store';
import { deleteItem } from './graph';

/**
 * Deletes are held back until they can no longer be undone (they fall off the
 * undo stack, the app goes to the background, or the queue is rescanned).
 * Undo then only has to cancel, so the app never needs the broader
 * Files.ReadWrite.All permission that recycle-bin restore requires.
 *
 * The pending list is saved so a killed app finishes the job on next launch.
 */
const KEY = 'pending_deletes_v1';

let pending: string[] | null = null;

async function load(): Promise<string[]> {
  if (pending) return pending;
  try {
    pending = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]');
  } catch {
    pending = [];
  }
  return pending!;
}

async function save() {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pending ?? []));
}

export async function getPendingDeletes(): Promise<Set<string>> {
  return new Set(await load());
}

export async function addPendingDelete(id: string) {
  const list = await load();
  if (!list.includes(id)) list.push(id);
  await save();
}

export async function cancelPendingDelete(id: string) {
  pending = (await load()).filter((x) => x !== id);
  await save();
}

/** Sends one pending delete to OneDrive (recycle bin). Stays pending if it fails. */
export async function commitDelete(id: string, cameraRollId: string) {
  await deleteItem(id, cameraRollId);
  await cancelPendingDelete(id);
}

/** Sends every pending delete. Returns how many failed (they stay pending for next time). */
export async function flushPendingDeletes(cameraRollId: string): Promise<number> {
  let failed = 0;
  for (const id of [...(await load())]) {
    try {
      await commitDelete(id, cameraRollId);
    } catch {
      failed++;
    }
  }
  return failed;
}
