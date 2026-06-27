export const GDRIVE_FOLDER_ID = '1WgVqUGgGc2uPwJYPFE7_84JRoZLbxg8h';

const SUFFIX_MAP = ['', '-b', '-c', '-d', '-e', '-f', '-g', '-h'];

/** Convention suffix for the Nth photo of an item: 0 → "" (cover), 1 → "-b" … */
export function driveSuffix(index: number): string {
  return SUFFIX_MAP[index] ?? `-${String.fromCharCode(105 + index)}`; // i, j, k…
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
}

export function driveThumbUrl(fileId: string, size = 400) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=s${size}`;
}

/** Lists all image files in the Drive folder using the admin OAuth token. */
export async function listDriveFiles(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${GDRIVE_FOLDER_ID}' in parents and trashed=false and mimeType contains 'image/'`);
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType)');
  const all: DriveFile[] = [];
  let pageToken = '';

  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json() as { files: DriveFile[]; nextPageToken?: string };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);

  return all;
}

const EXT_RE = /\.(jpe?g|png|webp)$/i;

/** Extracts the Drive file ID from a thumbnail/preview URL, or null if absent. */
export function driveFileIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]id=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Grants "anyone with the link" read access so the storefront can embed the image. */
export async function makeDrivePublic(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

/** Renames a Drive file. Returns true on success. */
export async function renameDriveFile(token: string, fileId: string, name: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    console.error('Drive rename failed:', res.status, await res.text());
    return false;
  }
  return true;
}

/** Permanently deletes a Drive file. Returns true on success. */
export async function deleteDriveFile(token: string, fileId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means it's already gone — treat as success so a stale list doesn't block us.
  if (!res.ok && res.status !== 404) {
    console.error('Drive delete failed:', res.status, await res.text());
    return false;
  }
  return true;
}

/**
 * Reconciles the item's Drive photos so the folder contains exactly
 * `orderedFileIds`, named into the convention `{id}`, `{id}-b`, `{id}-c`… in
 * that order (index 0 = cover). The storefront discovers photos purely by this
 * naming, so this single operation handles add, remove, reorder and set-cover:
 *
 *  • Any existing convention file for the item that isn't in the list is deleted.
 *  • The kept/new files are renamed to consecutive suffixes in the given order,
 *    leaving no gaps, and made publicly readable.
 *
 * Renames happen in two phases (temp names first) so filenames never collide
 * mid-swap. Returns the ordered public thumbnail URLs, or null on failure.
 */
export async function syncItemDriveImages(
  token: string,
  itemId: string | number,
  orderedFileIds: string[],
): Promise<string[] | null> {
  const id = String(itemId);
  const baseOf = (name: string) => name.replace(EXT_RE, '');
  const extOf = (name: string) => (name.match(EXT_RE)?.[1] ?? 'jpg').toLowerCase();

  const files = await listDriveFiles(token);
  const byId = new Map(files.map(f => [f.id, f]));

  // Files currently named into this item's convention.
  const itemFiles = files.filter(f => {
    const base = baseOf(f.name);
    return base === id || base.startsWith(`${id}-`);
  });

  // Resolve the desired files (skip any id we can't find in the folder).
  const targets = orderedFileIds
    .map(fid => byId.get(fid))
    .filter((f): f is DriveFile => !!f);

  // Short-circuit: nothing to delete and every photo already carries its final
  // name in the right order → leave Drive untouched (avoids needless renames on
  // edits that didn't change the photos).
  const wanted = new Set(orderedFileIds);
  const nothingToDelete = itemFiles.every(f => wanted.has(f.id));
  const alreadyOrdered = targets.length === itemFiles.length &&
    targets.every((f, i) => f.name === `${id}${driveSuffix(i)}.${extOf(f.name)}`);
  if (nothingToDelete && alreadyOrdered) {
    return targets.map(f => driveThumbUrl(f.id, 2000));
  }

  // 1. Delete the item's existing photos that are no longer wanted.
  for (const f of itemFiles) {
    if (!wanted.has(f.id)) {
      if (!await deleteDriveFile(token, f.id)) return null;
    }
  }

  // 2a. Move every target to a unique temporary name so the final renames in
  //     2b can't collide with a name still held by another target.
  for (let i = 0; i < targets.length; i++) {
    if (!await renameDriveFile(token, targets[i].id, `${id}-tmp${i}.${extOf(targets[i].name)}`)) {
      return null;
    }
  }

  // 2b. Move to the final consecutive convention names and publish.
  const urls: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const f = targets[i];
    const finalName = `${id}${driveSuffix(i)}.${extOf(f.name)}`;
    if (!await renameDriveFile(token, f.id, finalName)) return null;
    await makeDrivePublic(token, f.id); // so the storefront can embed the image
    urls.push(driveThumbUrl(f.id, 2000));
  }
  return urls;
}

/**
 * Uploads a file to the shared Drive folder and returns its Drive file ID.
 * The caller renames it into the item's naming convention via
 * {@link syncItemDriveImages}, which also makes it publicly readable.
 */
export async function uploadToDrive(
  token: string,
  file: File,
  filename: string,
): Promise<string | null> {
  const metadata = { name: filename, parents: [GDRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  if (!uploadRes.ok) {
    console.error('Drive upload failed:', uploadRes.status, await uploadRes.text());
    return null;
  }
  const { id } = await uploadRes.json() as { id: string };
  return id;
}
