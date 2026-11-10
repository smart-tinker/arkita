import { csvTables } from './csv.js';
import { collectArchiMappings } from './archi-provenance.js';
import { fail } from '../../schemka-model-core/src/json.js';
const encode = text => new TextEncoder().encode(text);
const xml = value => { value = String(value); if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value) || !value.isWellFormed()) fail('XLSX_TEXT', 'Поле содержит символ, не представимый в XML 1.0. Используйте нативный формат.'); return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]).replaceAll('\r', '&#13;'); };
const crcTable = Array.from({ length: 256 }, (_, value) => { for (let n = 0; n < 8; n++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ value >>> 8; return (value ^ 0xffffffff) >>> 0; }
function record(size, values) { const bytes = new Uint8Array(size), view = new DataView(bytes.buffer); for (const [offset, value, width = 4] of values) width === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true); return bytes; }
const concat = parts => { const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let at = 0; for (const part of parts) { result.set(part, at); at += part.length; } return result; };
/** Fixed stored ZIP entries: no filesystem names, formulas, macros or external links. */
function zip(files) {
  const local = [], central = []; let offset = 0, centralSize = 0;
  for (const [name, text] of files) {
    const filename = encode(name), bytes = encode(text), hash = crc(bytes);
    const header = record(30, [[0, 0x04034b50], [4, 20, 2], [6, 0x800, 2], [14, hash], [18, bytes.length], [22, bytes.length], [26, filename.length, 2]]);
    local.push(header, filename, bytes);
    const directory = record(46, [[0, 0x02014b50], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [16, hash], [20, bytes.length], [24, bytes.length], [28, filename.length, 2], [42, offset]]);
    central.push(directory, filename); centralSize += directory.length + filename.length; offset += header.length + filename.length + bytes.length;
  }
  if (offset + centralSize > 18 * 1024 * 1024) fail('XLSX_LIMIT', 'Выгрузка XLSX превышает 18 MiB.');
  return concat([...local, ...central, record(22, [[0, 0x06054b50], [8, files.length, 2], [10, files.length, 2], [12, centralSize], [16, offset]])]);
}
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function exportXLSX(state) {
  const tables = Object.entries(csvTables(state)), names = { model: 'Модель', profiles: 'Профили', elements: 'Элементы', junctions: 'Junctions', relationships: 'Отношения', properties: 'Свойства' };
  const files = [['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${main}" xmlns:r="${office}"><sheets>${tables.map(([name], i) => `<sheet name="${names[name]}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${rels}">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${office}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`]];
  const counts = {};
  tables.forEach(([name, table], index) => {
    const rows = [table.header, ...table.rows]; counts[name] = table.rows.length;
    const column = i => { let name = ''; for (i++; i; i = Math.floor((i - 1) / 26)) name = String.fromCharCode(65 + (i - 1) % 26) + name; return name; };
    const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => { if (String(value).length > 32767) fail('XLSX_LIMIT', `Лист ${names[name]}, строка ${r + 1}: ячейка превышает предел Excel 32767 символов.`); return `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`; }).join('')}</row>`).join('');
    files.push([`xl/worksheets/sheet${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${main}"><dimension ref="A1:${column(table.header.length - 1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${data}</sheetData></worksheet>`]);
  });
  return { bytes: zip(files), counts, losses: [...(collectArchiMappings(state).length ? ['Исходные ID, типы и домены Archi (archiSource) не входят в выгрузку. Для сохранения прослеживаемости используйте .arkita; таблицу соответствий сохраните отдельно.'] : []), 'Табличная выгрузка концептов, отношений, свойств и профилей. Диаграммы и ресурсы не входят в XLSX. Обратный импорт XLSX не поддерживается.'] };
}
