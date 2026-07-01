const SPREADSHEET_ID = '1PbC77GYCxuE5VnTWKoz-jSFy7maXl8ITrQqkz1FY4Hs';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function colLetter(n: number): string {
  // Supports A–Z (26 columns); enough for our ~18 column sheet
  return String.fromCharCode(65 + n);
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Returns all rows (including header row at index 0) as a 2-D string array. */
export async function readAllRows(token: string): Promise<string[][]> {
  const res = await fetch(`${BASE}/values/A:Z`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

/** Parses the header row into a lookup map. */
export function parseHeaders(allRows: string[][]): { headers: string[]; idx: Map<string, number> } {
  const headers = allRows[0] ?? [];
  return { headers, idx: new Map(headers.map((h, i) => [h, i])) };
}

/**
 * Returns the 0-based index into allRows for the item with the given ID.
 * Row 0 is the header, so data rows start at index 1.
 * Returns -1 if not found.
 */
export function findRow(allRows: string[][], itemId: string | number): number {
  for (let i = 1; i < allRows.length; i++) {
    if (allRows[i][0] === String(itemId)) return i;
  }
  return -1;
}

// ── ID generation ─────────────────────────────────────────────────────────────

/** Returns the next available integer item ID (max existing + 1). */
export async function getNextItemId(token: string): Promise<string> {
  const rows = await readAllRows(token);
  const ids = rows
    .slice(1)
    .map(r => parseInt(r[0] ?? ''))
    .filter(n => !isNaN(n) && n > 0);
  return String(ids.length ? Math.max(...ids) + 1 : 1);
}

/**
 * Ensures the given column names exist in the header row, appending any that are
 * missing (e.g. `sold_at`, added after the sheet was first created). Returns the
 * up-to-date header array. Mutates allRows[0] in place so callers reusing the
 * cached rows see the new columns immediately.
 */
export async function ensureColumns(
  token: string,
  allRows: string[][],
  required: string[],
): Promise<string[]> {
  const headers = allRows[0] ?? [];
  const missing = required.filter(c => !headers.includes(c));
  if (missing.length === 0) return headers;

  const newHeaders = [...headers, ...missing];
  const lastCol = colLetter(newHeaders.length - 1);
  const range = `A1:${lastCol}1`;

  const res = await fetch(
    `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [newHeaders] }),
    },
  );
  if (!res.ok) throw new Error(`Sheets header update failed: ${res.status}`);

  allRows[0] = newHeaders; // keep the cached copy in sync
  return newHeaders;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Appends a new row at the bottom of the sheet. */
export async function appendRow(
  token: string,
  headers: string[],
  values: Record<string, string>,
): Promise<boolean> {
  const row = headers.map(h => values[h] ?? '');
  const res = await fetch(`${BASE}/values/A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ values: [row] }),
  });
  return res.ok;
}

/**
 * Replaces a data row in-place.
 * rowIndex: 0-based position in allRows (0 = header, 1 = first data row).
 * Merges currentRow with updates so un-touched columns are preserved.
 */
export async function updateRow(
  token: string,
  rowIndex: number,
  headers: string[],
  currentRow: string[],
  updates: Record<string, string>,
): Promise<boolean> {
  const sheetRow = rowIndex + 1; // Sheets uses 1-based row numbers
  const newRow = [...currentRow];

  for (const [field, value] of Object.entries(updates)) {
    const col = headers.indexOf(field);
    if (col === -1) continue;
    while (newRow.length <= col) newRow.push('');
    newRow[col] = value;
  }

  const lastCol = colLetter(Math.max(headers.length - 1, newRow.length - 1));
  const range = `A${sheetRow}:${lastCol}${sheetRow}`;

  const res = await fetch(
    `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [newRow] }),
    },
  );
  return res.ok;
}

/**
 * Updates a single column value for a specific row.
 * Convenience wrapper around updateRow for simple field changes.
 */
export async function updateCell(
  token: string,
  rowIndex: number,
  headers: string[],
  currentRow: string[],
  field: string,
  value: string,
): Promise<boolean> {
  return updateRow(token, rowIndex, headers, currentRow, { [field]: value });
}
