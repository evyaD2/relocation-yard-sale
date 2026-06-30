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

// Appended to every Drive call so operations also work if the shared folder ever
// lives on a Shared Drive (harmless for ordinary My-Drive folders).
const ALL_DRIVES = 'supportsAllDrives=true';

/** Pulls the human-readable message out of a Drive API JSON error body. */
function driveErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message ?? parsed?.error_description;
    if (msg) return msg;
  } catch {
    /* not JSON — fall through */
  }
  return body.slice(0, 300) || `HTTP ${status}`;
}

/** True for errors worth retrying: rate limits and transient server faults. */
function isRetriable(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  // Drive signals burst throttling as a 403 with a rate-limit reason.
  return status === 403 && /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded/i.test(body);
}

/**
 * fetch() wrapper for the Drive API that retries transient failures with
 * exponential backoff and, on a hard failure, throws an Error carrying the real
 * status and Google's message (so it can be shown to the admin — there is no
 * console on mobile). `okStatuses` lets callers treat e.g. 404 as success.
 */
async function driveFetch(
  op: string,
  url: string,
  init: RequestInit,
  okStatuses: number[] = [],
): Promise<Response> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (networkErr) {
      // Connection-level failure (common on flaky mobile networks) — retry.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 400 * 2 ** (attempt - 1) + Math.random() * 200));
        continue;
      }
      throw new Error(`${op} failed: network error (${(networkErr as Error).message})`);
    }

    if (res.ok || okStatuses.includes(res.status)) return res;

    const body = await res.text().catch(() => '');
    if (isRetriable(res.status, body) && attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 400 * 2 ** (attempt - 1) + Math.random() * 200));
      continue;
    }
    throw new Error(`${op} failed (${res.status}): ${driveErrorMessage(res.status, body)}`);
  }
}

/** Lists all image files in the Drive folder using the admin OAuth token. */
export async function listDriveFiles(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${GDRIVE_FOLDER_ID}' in parents and trashed=false and mimeType contains 'image/'`);
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType)');
  const all: DriveFile[] = [];
  let pageToken = '';

  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=200&${ALL_DRIVES}&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await driveFetch('Drive list', url, { headers: { Authorization: `Bearer ${token}` } });
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

/**
 * Grants "anyone with the link" read access so the storefront can embed the
 * image. Best-effort: a file is usually already public (or shared via the
 * folder), and a non-owner editor may not be allowed to change sharing — neither
 * case should fail the whole save, so sharing errors are logged, not thrown.
 */
export async function makeDrivePublic(token: string, fileId: string): Promise<void> {
  try {
    await driveFetch(
      'Drive share',
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?${ALL_DRIVES}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      },
    );
  } catch (err) {
    console.warn(`Could not make Drive file ${fileId} public (continuing):`, err);
  }
}

/** Renames a Drive file. Throws with the real Drive error on failure. */
export async function renameDriveFile(token: string, fileId: string, name: string): Promise<void> {
  await driveFetch(
    'Drive rename',
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&${ALL_DRIVES}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
}

/** Permanently deletes a Drive file. A 404 (already gone) is treated as success. */
export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveFetch(
    'Drive delete',
    `https://www.googleapis.com/drive/v3/files/${fileId}?${ALL_DRIVES}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    [404],
  );
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
 * mid-swap. Returns the ordered public thumbnail URLs. Throws (with the real
 * Drive error) if any step fails.
 */
export async function syncItemDriveImages(
  token: string,
  itemId: string | number,
  orderedFileIds: string[],
): Promise<string[]> {
  const id = String(itemId);
  const baseOf = (name: string) => name.replace(EXT_RE, '');
  const extOf = (name: string) => (name.match(EXT_RE)?.[1] ?? 'jpg').toLowerCase();

  const files = await listDriveFiles(token);
  const byId = new Map(files.map(f => [f.id, f]));

  // Files currently named into this item's convention. Anchor the prefix match
  // to the suffix separator so item "3" never picks up item "30"'s photos.
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
    if (!wanted.has(f.id)) await deleteDriveFile(token, f.id);
  }

  // 2a. Move every target to a unique temporary name so the final renames in
  //     2b can't collide with a name still held by another target.
  for (let i = 0; i < targets.length; i++) {
    await renameDriveFile(token, targets[i].id, `${id}-tmp${i}.${extOf(targets[i].name)}`);
  }

  // 2b. Move to the final consecutive convention names and publish.
  const urls: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const f = targets[i];
    const finalName = `${id}${driveSuffix(i)}.${extOf(f.name)}`;
    await renameDriveFile(token, f.id, finalName);
    await makeDrivePublic(token, f.id); // so the storefront can embed the image
    urls.push(driveThumbUrl(f.id, 2000));
  }
  return urls;
}

/**
 * Uploads a file to the shared Drive folder and returns its Drive file ID.
 * The caller renames it into the item's naming convention via
 * {@link syncItemDriveImages}, which also makes it publicly readable.
 * Throws (with the real Drive error) on failure.
 */
export async function uploadToDrive(
  token: string,
  file: File,
  filename: string,
): Promise<string> {
  const metadata = { name: filename, parents: [GDRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await driveFetch(
    'Drive upload',
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&${ALL_DRIVES}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const { id } = await uploadRes.json() as { id: string };
  return id;
}
