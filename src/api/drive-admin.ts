export const GDRIVE_FOLDER_ID = '1WgVqUGgGc2uPwJYPFE7_84JRoZLbxg8h';

const SUFFIX_MAP = ['', '-b', '-c', '-d', '-e', '-f', '-g', '-h'];

function driveSuffix(index: number): string {
  return SUFFIX_MAP[index] ?? `-${String.fromCharCode(105 + index)}`; // i, j, k…
}

/** Returns the Drive filename for an image at a given index (0 = first/primary). */
export function driveFilename(itemId: string | number, index: number, file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  return driveFilenameForExt(itemId, index, ext);
}

/** Like driveFilename but for an already-uploaded file, given only its extension. */
export function driveFilenameForExt(itemId: string | number, index: number, ext: string): string {
  return `${itemId}${driveSuffix(index)}.${(ext || 'jpg').toLowerCase()}`;
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

/**
 * Makes the given Drive file the item's cover (primary thumbnail) by swapping
 * filename suffixes with the current cover. Drive images are discovered by the
 * naming convention `{id}`, `{id}-b`, `{id}-c`… so the cover is whichever file
 * carries the bare `{id}` name. Each file keeps its own extension; only the
 * suffix is swapped. Returns true on success (or if it was already the cover).
 */
export async function setDriveCover(
  token: string,
  itemId: string | number,
  coverFileId: string,
): Promise<boolean> {
  const id = String(itemId);
  const baseOf = (name: string) => name.replace(EXT_RE, '');
  const extOf = (name: string) => (name.match(EXT_RE)?.[1] ?? 'jpg').toLowerCase();

  const files = await listDriveFiles(token);
  const itemFiles = files.filter(f => {
    const base = baseOf(f.name);
    return base === id || base.startsWith(`${id}-`);
  });

  const chosen = itemFiles.find(f => f.id === coverFileId);
  if (!chosen) { console.error('setDriveCover: chosen file not found in folder'); return false; }

  const current = itemFiles.find(f => baseOf(f.name) === id);
  if (!current || current.id === chosen.id) return true; // already the cover

  const chosenSuffix = baseOf(chosen.name).slice(id.length); // e.g. "-c"
  const tempName = `${id}-tmp.${extOf(current.name)}`;

  // 3-step swap so every filename stays unique at each step (Drive allows
  // duplicates, but the storefront keys its file map by name).
  if (!await renameDriveFile(token, current.id, tempName)) return false;
  if (!await renameDriveFile(token, chosen.id, `${id}.${extOf(chosen.name)}`)) return false;
  if (!await renameDriveFile(token, current.id, `${id}${chosenSuffix}.${extOf(current.name)}`)) return false;
  return true;
}

/** Uploads a file to the shared Drive folder and makes it publicly readable. */
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

  await makeDrivePublic(token, id); // so the storefront can embed the image

  return `https://drive.google.com/thumbnail?id=${id}&sz=s2000`;
}
