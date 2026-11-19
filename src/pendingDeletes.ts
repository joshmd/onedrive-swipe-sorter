import * as SecureStore from 'expo-secure-store';
import { deleteItem, GraphError } from './graph';

/**
 * Deletes are held back until they can no longer be undone (they fall off the
 * undo stack, the app goes to the background, or Camera Roll is rescanned).
 * Undo then only has to cancel, so the app never needs the broader
 * Files.ReadWrite.All permission that recycle-bin restore requires.
 *
 * The pending list is saved so a killed app finishes the job on next launch.
 * An item that fails MAX_ATTEMPTS times for a reason other than a network
 * error is dropped from the list and left where it is.
 */
const KEY = 'pending_deletes_v2';
const OLD_KEY = 'pending_deletes_v1';
const MAX_ATTEMPTS = 3;

type Pending = { id: string; name: string; attempts: number };

let pending: Pending[] | null = null;

async function load(): Promise<Pending[]> {
  if (pending) return pending;
  try {
    pending = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]');
    const old: string[] = JSON.parse((await SecureStore.getItemAsync(OLD_KEY)) ?? '[]');
    for (const id of old) if (!pending!.some((p) => p.id === id)) pending!.push({ id, name: 'photo', attempts: 0 });
    if (old.length) await SecureStore.deleteItemAsync(OLD_KEY);
  } catch {
    pending = [];
  }
  return pending!;
}

async function save() {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pending ?? []));
}

export async function getPendingDeletes(): Promise<Set<string>> {
  return new Set((await load()).map((p) => p.id));
}

export async function addPendingDelete(id: string, name: string) {
  const list = await load();
  if (!list.some((p) => p.id === id)) list.push({ id, name, attempts: 0 });
  await save();
}

export async function cancelPendingDelete(id: string) {
  pending = (await load()).filter((p) => p.id !== id);
  await save();
}

export type FlushResult = {
  /** Failed and still pending. */
  failed: number;
  /** Of those, how many failed for a reason other than no network. */
  otherFailed: number;
  /** Names of photos dropped after MAX_ATTEMPTS. They stay in OneDrive. */
  gaveUp: string[];
  firstError?: string;
};

const isNetworkError = (e: unknown) => !(e instanceof GraphError);

/**
 * Sends pending deletes (all, or just the given IDs) to OneDrive.
 * Failures stay pending for next time, up to MAX_ATTEMPTS.
 */
export async function flushPendingDeletes(cameraRollId: string, onlyIds?: string[]): Promise<FlushResult> {
  const result: FlushResult = { failed: 0, otherFailed: 0, gaveUp: [] };
  for (const p of [...(await load())]) {
    if (onlyIds && !onlyIds.includes(p.id)) continue;
    try {
      await deleteItem(p.id, cameraRollId);
      pending = pending!.filter((x) => x.id !== p.id);
    } catch (e) {
      result.firstError ??= String(e);
      const network = isNetworkError(e);
      if (!network && ++p.attempts >= MAX_ATTEMPTS) {
        pending = pending!.filter((x) => x.id !== p.id);
        result.gaveUp.push(p.name);
      } else {
        result.failed++;
        if (!network) result.otherFailed++;
      }
    }
  }
  await save();
  return result;
}
