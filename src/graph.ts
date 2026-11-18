import { getAccessToken } from './auth';
import type { Folder } from './swipeMap';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type Photo = {
  id: string;
  name: string;
  size: number;
  parentId: string;
  takenAt?: string;
  isVideo: boolean;
  thumbnailUrl?: string;
};

export class GraphError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Graph fetch with bearer auth and 429/503 back-off that honours Retry-After. */
export async function graph<T = any>(pathOrUrl: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : GRAPH + pathOrUrl;
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const wait = Number(res.headers.get('Retry-After') ?? 2 ** attempt);
    await sleep(wait * 1000);
    return graph<T>(pathOrUrl, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GraphError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const SELECT = 'id,name,size,file,folder,photo,video,parentReference';

async function listChildren(itemPath: string): Promise<any[]> {
  const items: any[] = [];
  let next: string | undefined = `${itemPath}/children?$select=${SELECT}&$expand=thumbnails($select=large)&$top=200`;
  while (next) {
    const page: any = await graph(next);
    items.push(...page.value);
    next = page['@odata.nextLink'];
  }
  return items;
}

function toPhoto(item: any): Photo | null {
  const mime: string = item.file?.mimeType ?? '';
  const isVideo = !!item.video || mime.startsWith('video/');
  if (!item.file || !(isVideo || item.photo || mime.startsWith('image/'))) return null;
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    parentId: item.parentReference?.id,
    takenAt: item.photo?.takenDateTime,
    isVideo,
    thumbnailUrl: item.thumbnails?.[0]?.large?.url,
  };
}

/**
 * Lists every photo and video in Camera Roll: loose files at the top level
 * plus everything in Year > Month subfolders (walked recursively).
 * Read-only: the Camera Roll folder itself is never renamed or moved.
 */
export async function listCameraRoll(): Promise<{ rootId: string; photos: Photo[] }> {
  const root: any = await graph('/me/drive/special/cameraroll?$select=id');
  const photos: Photo[] = [];
  const walk = async (path: string) => {
    for (const item of await listChildren(path)) {
      if (item.folder) await walk(`/me/drive/items/${item.id}`);
      else {
        const p = toPhoto(item);
        if (p) photos.push(p);
      }
    }
  };
  await walk(`/me/drive/items/${root.id}`);
  // Oldest first, so sorting works through the backlog in order.
  photos.sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''));
  return { rootId: root.id, photos };
}

/**
 * Moves a single file to another folder. Fails with GraphError code
 * "nameAlreadyExists" (409) on a name clash rather than overwriting.
 */
export async function moveItem(itemId: string, targetFolderId: string, cameraRollId: string): Promise<void> {
  if (itemId === cameraRollId) throw new Error('Refusing to move the Camera Roll folder itself');
  await graph(`/me/drive/items/${itemId}?@microsoft.graph.conflictBehavior=fail`, {
    method: 'PATCH',
    body: JSON.stringify({ parentReference: { id: targetFolderId } }),
  });
}

const ROOT_PREFIX = /^\/drive\/root:\/?/;

function toFolder(item: any): Folder {
  const parent = decodeURIComponent((item.parentReference?.path ?? '').replace(ROOT_PREFIX, ''));
  return { id: item.id, name: item.name, path: parent ? `${parent}/${item.name}` : item.name };
}

/** The Pictures folder (special folder alias, so it works whatever its display name). */
export async function getPicturesFolder(): Promise<Folder> {
  return toFolder(await graph('/me/drive/special/photos?$select=id,name,parentReference'));
}

/** Child folders of a folder, sorted by name. */
export async function listChildFolders(folderId: string): Promise<Folder[]> {
  const folders: Folder[] = [];
  let next: string | undefined = `/me/drive/items/${folderId}/children?$select=id,name,folder,parentReference&$top=200`;
  while (next) {
    const page: any = await graph(next);
    for (const item of page.value) if (item.folder) folders.push(toFolder(item));
    next = page['@odata.nextLink'];
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

/** Folders under Pictures whose name matches the query. */
export async function searchFolders(query: string, picturesPath: string): Promise<Folder[]> {
  const q = query.replace(/'/g, "''");
  const page: any = await graph(
    `/me/drive/root/search(q='${encodeURIComponent(q)}')?$select=id,name,folder,parentReference&$top=100`,
  );
  const needle = query.toLowerCase();
  return page.value
    .filter((i: any) => i.folder && i.name.toLowerCase().includes(needle))
    .map(toFolder)
    .filter((f: Folder) => f.path.startsWith(picturesPath + '/'));
}
