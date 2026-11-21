// A small .xlsx reader: enough for a Rocket Money export (first sheet, plain cells).
// An .xlsx file is a zip of XML files; the browser unzips with DecompressionStream.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a spreadsheet the app can read');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? raw : await inflate(raw));
  }
  return files;
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...letters].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

const textOf = (el: Element) => Array.from(el.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');

export async function readXlsx(file: Blob): Promise<(string | number | null)[][]> {
  const files = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder();
  const parse = (name: string) => {
    const f = files.get(name);
    return f ? new DOMParser().parseFromString(dec.decode(f), 'application/xml') : null;
  };
  const shared = Array.from(parse('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? []).map(textOf);
  const sheetName = [...files.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort()[0];
  const sheet = sheetName ? parse(sheetName) : null;
  if (!sheet) throw new Error('No sheet found in this file');
  const rows: (string | number | null)[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const out: (string | number | null)[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') ?? 'A');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
      let val: string | number | null = null;
      if (t === 's') val = v !== null ? shared[Number(v)] ?? '' : '';
      else if (t === 'inlineStr') val = textOf(c);
      else if (t === 'str' || t === 'e') val = v;
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v === null || v === '' ? null : Number(v);
      while (out.length < i) out.push(null);
      out[i] = val;
    }
    rows.push(out);
  }
  return rows;
}

// Excel stores dates as days since 1899-12-30.
export function excelDate(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return d.toISOString().slice(0, 10);
}
