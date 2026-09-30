import JSZip from 'jszip';

/**
 * Readable previews of the office documents a non-coding workspace produces
 * (spreadsheets, Word files, CSV), built in the browser from the file's bytes.
 * Only the result panel of the office module uses it; kept in its own file
 * because the XML reading would crowd the panel component.
 */

/** How a result file can be shown in the preview. */
export type FilePreviewKind = 'text' | 'table' | 'document' | 'pdf' | 'image' | 'unsupported';

/** A parsed preview: rows of a table (first sheet or CSV), or the paragraphs of a document. */
export type ParsedFilePreview =
  | { kind: 'table'; sheetName: string | null; rows: string[][]; truncated: boolean; sheetCount: number }
  | { kind: 'document'; blocks: Array<{ type: 'paragraph'; text: string } | { type: 'table'; rows: string[][] }>; truncated: boolean };

/** Rows (and document blocks) shown at most, so a huge file stays quick to preview. */
const MAX_ROWS = 200;
const MAX_COLUMNS = 30;
const MAX_BLOCKS = 400;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const BINARY_EXTENSIONS = new Set(['zip', 'gz', 'tar', 'rar', '7z', 'exe', 'dll', 'so', 'bin', 'mp3', 'mp4', 'mov', 'wav', 'ppt', 'pptx', 'doc', 'xls', 'odt', 'ods']);

const extensionOf = (filePath: string): string => {
  const name = filePath.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** Picks how a file is previewed from its extension; used by the result panel before fetching it. */
export function previewKindFor(filePath: string): FilePreviewKind {
  const extension = extensionOf(filePath);
  if (extension === 'xlsx' || extension === 'xlsm' || extension === 'csv' || extension === 'tsv') return 'table';
  if (extension === 'docx') return 'document';
  if (extension === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (BINARY_EXTENSIONS.has(extension)) return 'unsupported';
  return 'text';
}

// ----- CSV -----

/** Splits CSV/TSV text into rows, honouring quoted fields with commas, quotes and line breaks. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A semicolon-separated file (common with Indonesian Excel exports) is detected from its first line. */
const guessDelimiter = (text: string, extension: string): string => {
  if (extension === 'tsv') return '\t';
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
};

// ----- XLSX -----

const parseXml = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml');

/** Every element with a local name, regardless of namespace prefix. */
const byName = (root: Document | Element, name: string): Element[] => Array.from(root.getElementsByTagNameNS('*', name));

/** "B12" → column index 1. */
const columnIndex = (reference: string): number => {
  const letters = reference.replace(/[0-9]/g, '');
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.toUpperCase().charCodeAt(0) - 64);
  }
  return index - 1;
};

const readSharedStrings = async (zip: JSZip): Promise<string[]> => {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const doc = parseXml(await file.async('string'));
  return byName(doc, 'si').map((item) => byName(item, 't').map((node) => node.textContent ?? '').join(''));
};

/** The first sheet's path and name, following the workbook's own order and relationships. */
const firstSheet = async (zip: JSZip): Promise<{ path: string; name: string | null; count: number }> => {
  const workbook = zip.file('xl/workbook.xml');
  const relations = zip.file('xl/_rels/workbook.xml.rels');
  if (workbook && relations) {
    const sheets = byName(parseXml(await workbook.async('string')), 'sheet');
    const first = sheets[0];
    const relationId = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = byName(parseXml(await relations.async('string')), 'Relationship')
      .find((relation) => relation.getAttribute('Id') === relationId)?.getAttribute('Target');
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      return { path, name: first?.getAttribute('name') ?? null, count: sheets.length };
    }
  }
  return { path: 'xl/worksheets/sheet1.xml', name: null, count: 1 };
};

const parseXlsx = async (bytes: ArrayBuffer): Promise<ParsedFilePreview> => {
  const zip = await JSZip.loadAsync(bytes);
  const [shared, sheet] = await Promise.all([readSharedStrings(zip), firstSheet(zip)]);
  const sheetFile = zip.file(sheet.path);
  if (!sheetFile) {
    throw new Error('The workbook has no readable sheet.');
  }
  const rowNodes = byName(parseXml(await sheetFile.async('string')), 'row');
  const rows: string[][] = [];
  for (const rowNode of rowNodes.slice(0, MAX_ROWS)) {
    const row: string[] = [];
    for (const cell of byName(rowNode, 'c')) {
      const reference = cell.getAttribute('r');
      const index = reference ? columnIndex(reference) : row.length;
      if (index >= MAX_COLUMNS) continue;
      const type = cell.getAttribute('t');
      const value = byName(cell, 'v')[0]?.textContent ?? '';
      const text = type === 's'
        ? shared[Number(value)] ?? ''
        : type === 'inlineStr'
          ? byName(cell, 't').map((node) => node.textContent ?? '').join('')
          : type === 'b'
            ? (value === '1' ? 'TRUE' : 'FALSE')
            : value;
      while (row.length < index) row.push('');
      row[index] = text;
    }
    rows.push(row);
  }
  return { kind: 'table', sheetName: sheet.name, rows, truncated: rowNodes.length > MAX_ROWS, sheetCount: sheet.count };
};

// ----- DOCX -----

const paragraphText = (paragraph: Element): string => {
  let text = '';
  for (const node of Array.from(paragraph.getElementsByTagNameNS('*', '*'))) {
    if (node.localName === 't') text += node.textContent ?? '';
    else if (node.localName === 'tab') text += '\t';
    else if (node.localName === 'br') text += '\n';
  }
  return text;
};

const parseDocx = async (bytes: ArrayBuffer): Promise<ParsedFilePreview> => {
  const zip = await JSZip.loadAsync(bytes);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('The document has no readable body.');
  }
  const body = byName(parseXml(await documentFile.async('string')), 'body')[0];
  const blocks: Extract<ParsedFilePreview, { kind: 'document' }>['blocks'] = [];
  let total = 0;
  for (const child of Array.from(body?.children ?? [])) {
    total += 1;
    if (blocks.length >= MAX_BLOCKS) continue;
    if (child.localName === 'p') {
      blocks.push({ type: 'paragraph', text: paragraphText(child) });
    } else if (child.localName === 'tbl') {
      const rows = byName(child, 'tr').slice(0, MAX_ROWS).map((row) => byName(row, 'tc').map((cell) => byName(cell, 'p').map(paragraphText).join('\n')));
      blocks.push({ type: 'table', rows });
    }
  }
  return { kind: 'document', blocks, truncated: total > MAX_BLOCKS };
};

/**
 * Parses a spreadsheet (xlsx, csv, tsv) or Word document (docx) from its
 * bytes into a preview. Throws when the bytes are not a readable file of that
 * type; the caller shows the error instead of a preview.
 */
export async function parseFilePreview(filePath: string, bytes: ArrayBuffer): Promise<ParsedFilePreview> {
  const extension = extensionOf(filePath);
  if (extension === 'csv' || extension === 'tsv') {
    const text = new TextDecoder().decode(bytes);
    const all = parseDelimited(text, guessDelimiter(text, extension));
    return {
      kind: 'table',
      sheetName: null,
      rows: all.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS)),
      truncated: all.length > MAX_ROWS,
      sheetCount: 1,
    };
  }
  return extension === 'docx' ? parseDocx(bytes) : parseXlsx(bytes);
}
