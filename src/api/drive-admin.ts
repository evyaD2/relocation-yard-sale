export const GDRIVE_FOLDER_ID = '1WgVqUGgGc2uPwJYPFE7_84JRoZLbxg8h';

const SUFFIX_MAP = ['', '-b', '-c', '-d', '-e', '-f', '-g', '-h'];

/** Returns the Drive filename for an image at a given index (0 = first/primary). */
export function driveFilename(itemId: string | number, index: number, file: File): string {
  const suffix = SUFFIX_MAP[index] ?? `-${String.fromCharCode(105 + index)}`; // i, j, k…
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  return `${itemId}${suffix}.${ext}`;
}

export interface DriveFile {
  id: string;
  name: string;
}

export function driveThumbUrl(fileId: string, size = 400) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=s${size}`;
}

/** Lists all image files in the Drive folder using the admin OAuth token. */
export async function listDriveFiles(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${GDRIVE_FOLDER_ID}' in parents and trashed=false`);
  const fields = encodeURIComponent('nextPageToken,files(id,name)');
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

  // Grant public read access so the storefront can embed the image
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return `https://drive.google.com/thumbnail?id=${id}&sz=s2000`;
}
