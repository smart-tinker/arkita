/** Inert spreadsheet text: source names and diagnostics may contain formula prefixes. */
export function archiReportFiles({ diagnostics = {}, mappings = [] }) {
  const encode = rows => new TextEncoder().encode('\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n');
  const cell = value => value === undefined || value === null || value === '' ? '' : `'${value}`;
  const problems = [['category', 'code', 'sourceId', 'sourceType', 'viewId', 'viewName', 'field', 'message']];
  for (const category of ['errors', 'transformations', 'losses']) for (const item of diagnostics[category] ?? []) {
    problems.push([category, ...['code', 'sourceId', 'sourceType', 'viewId', 'viewName', 'field', 'message'].map(key => item[key] ?? (key === 'viewId' ? item.affectedViews?.map(view => view.id).join('\n') : key === 'viewName' ? item.affectedViews?.map(view => view.name).join('\n') : ''))].map(cell));
  }
  const ids = [['sourceModelId', 'sourceId', 'sourceType', 'sourceVersion', 'sourceDomain', 'name', 'targetId', 'targetType', 'kind', 'viewId', 'viewName']];
  for (const item of mappings) ids.push(['sourceModelId', 'sourceId', 'sourceType', 'sourceVersion', 'sourceDomain', 'name', 'targetId', 'targetType', 'kind', 'viewId', 'viewName'].map(key => cell(item[key])));
  return [{ name: 'arkita-archi-diagnostics.csv', bytes: encode(problems) }, { name: 'arkita-archi-mappings.csv', bytes: encode(ids) }];
}
