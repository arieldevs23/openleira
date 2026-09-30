import assert from 'node:assert/strict';

import JSZip from 'jszip';
import { test } from 'vitest';

import { parseDelimited, parseFilePreview, previewKindFor } from '@/modules/office/utils/officeFilePreview';

const zipBytes = async (files: Record<string, string>): Promise<ArrayBuffer> => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'arraybuffer' });
};

test('files are previewed by extension', () => {
  assert.equal(previewKindFor('hasil/laporan.xlsx'), 'table');
  assert.equal(previewKindFor('bahan/penjualan.CSV'), 'table');
  assert.equal(previewKindFor('hasil/surat.docx'), 'document');
  assert.equal(previewKindFor('hasil/laporan.pdf'), 'pdf');
  assert.equal(previewKindFor('hasil/grafik.png'), 'image');
  assert.equal(previewKindFor('arsip.zip'), 'unsupported');
  assert.equal(previewKindFor('README.md'), 'text');
});

test('CSV keeps quoted commas, quotes and line breaks, and semicolon files are detected', async () => {
  assert.deepEqual(parseDelimited('a,"b, c","say ""hi"""\n1,"two\nlines",3\n', ','), [
    ['a', 'b, c', 'say "hi"'],
    ['1', 'two\nlines', '3'],
  ]);
  const parsed = await parseFilePreview('data.csv', new TextEncoder().encode('produk;qty\nkopi;12\n').buffer as ArrayBuffer);
  assert.equal(parsed.kind, 'table');
  assert.deepEqual(parsed.kind === 'table' && parsed.rows, [['produk', 'qty'], ['kopi', '12']]);
});

test('the first sheet of a workbook becomes a table, with shared strings and gaps', async () => {
  const blob = await zipBytes({
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sept" sheetId="1" r:id="rId1"/><sheet name="Okt" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Produk</t></si><si><t>Total</t></si><si><r><t>Ko</t></r><r><t>pi</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1250000</v></c></row></sheetData></worksheet>',
  });
  const parsed = await parseFilePreview('hasil/laporan.xlsx', blob);
  assert.equal(parsed.kind, 'table');
  if (parsed.kind !== 'table') return;
  assert.equal(parsed.sheetName, 'Sept');
  assert.equal(parsed.sheetCount, 2);
  assert.deepEqual(parsed.rows, [['Produk', '', 'Total'], ['Kopi', '', '1250000']]);
});

test('a Word document becomes paragraphs and tables in order', async () => {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const blob = await zipBytes({
    'word/document.xml': `<w:document ${w}><w:body><w:p><w:r><w:t>Laporan </w:t></w:r><w:r><w:t>September</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Omzet</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Rp 12 jt</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/></w:body></w:document>`,
  });
  const parsed = await parseFilePreview('hasil/laporan.docx', blob);
  assert.deepEqual(parsed, {
    kind: 'document',
    truncated: false,
    blocks: [
      { type: 'paragraph', text: 'Laporan September' },
      { type: 'table', rows: [['Omzet', 'Rp 12 jt']] },
      { type: 'paragraph', text: '' },
    ],
  });
});
