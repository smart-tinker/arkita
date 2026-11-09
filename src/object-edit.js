/* Original conservative source-span caption/delete planner.
 * All offsets refer to the original UTF-16 string. A successful plan is not
 * semantic approval: the caller must parse both sides with pinned Mermaid Tiny
 * and validate identities, properties, edge mapping and effective membership.
 */
(function (root, factory) {
  'use strict';
  const move = typeof module === 'object' && module.exports ? require('./group-move.js') : root.SkGroupMove;
  const api = factory(move);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SkObjectEdit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (move) {
  'use strict';
  const diagnostic = (code, message, span) => ({code, message, ...(span ? {start: span.contentStart ?? span.start, end: span.contentEnd ?? span.end} : {})});
  const failure = diagnostics => ({ok: false, edits: [], diagnostics});
  const rejected = (code, message, span) => failure([diagnostic(code, message, span)]);
  const encodeLabel = text => Array.from(text).map(ch => /[A-Za-zА-Яа-яЁё0-9 _.-]/u.test(ch) ? ch : '#' + ch.codePointAt(0) + ';').join('').replace(/^ +| +$/g, spaces => '#32;'.repeat(spaces.length));
  const ARROW = /^(?:<?(?:-{2,}>|-{3,}|-{2,}[ox]|={2,}>|={3,}|-\.+->|-\.+-)|[ox]-{2,}(?:[ox]|>)|~{3,})/;
  const SHAPES = [['(((', ')))'], ['[[', ']]'], ['[(', ')]'], ['([', '])'], ['((', '))'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']];

  function decodeLabel(text) {
    const named = {quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: '\u00a0'};
    return text.replace(/(?:&?#(x[\da-f]+|\d+|quot|apos|amp|lt|gt|nbsp)|&(quot|apos|amp|lt|gt|nbsp));/gi, (whole, value, html) => {
      const key = (value || html).toLowerCase();
      if (Object.hasOwn(named, key)) return named[key];
      const point = key[0] === 'x' ? parseInt(key.slice(1), 16) : Number(key);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
    });
  }
  function plainCaption(raw) {
    const text = raw.trim();
    if (text.startsWith('"') && text.endsWith('"')) {
      const inner = text.slice(1, -1);
      if (inner.startsWith('`') && inner.endsWith('`')) return null;
      return decodeLabel(inner.trim());
    }
    return decodeLabel(text);
  }
  function analyze(source) {
    const base = move.analyze(source), edges = [], diagnostics = [...base.diagnostics];
    if (!base.ok) return {...base, edges, edgeCount: 0};
    for (const statement of base.statements) {
      if (statement.kind !== 'edge') continue;
      for (let part = 0; part < statement.nodes.length - 1; part++) {
        const left = statement.nodes[part], right = statement.nodes[part + 1];
        const between = source.slice(left.end, right.start), leading = /^\s*/.exec(between)[0].length;
        const connector = ARROW.exec(between.slice(leading));
        if (!connector) {
          diagnostics.push(diagnostic('EDGE_MAPPING_FAILED', 'Не удалось однозначно сопоставить связь с исходником.', statement));
          continue;
        }
        const connectorStart = left.end + leading, connectorEnd = connectorStart + connector[0].length;
        const suffix = source.slice(connectorEnd, right.start), labelOffset = /^\s*/.exec(suffix)[0].length;
        const labelStart = suffix[labelOffset] === '|' ? connectorEnd + labelOffset : null;
        const labelEnd = labelStart === null ? null : connectorEnd + suffix.trimEnd().length;
        if (labelStart !== null && source[labelEnd - 1] !== '|') {
          diagnostics.push(diagnostic('EDGE_MAPPING_FAILED', 'Границы подписи связи неоднозначны.', statement));
          continue;
        }
        edges.push({index: edges.length, start: left.id, end: right.id, groupId: statement.groupId,
          statementStart: statement.start, statementEnd: statement.end, sourceStart: connectorStart, sourceEnd: right.start,
          connectorStart, connectorEnd, labelStart, labelEnd, chain: statement.nodes.length !== 2, parallel: false});
      }
    }
    const pairs = new Map();
    for (const edge of edges) {
      const key = JSON.stringify([edge.start, edge.end]);
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(edge);
    }
    for (const pair of pairs.values()) if (pair.length > 1) for (const edge of pair) edge.parallel = true;
    return {...base, ok: diagnostics.length === 0, diagnostics, edges, edgeCount: edges.length};
  }
  function resolve(ast, target) {
    if (!target || !['node', 'edge', 'group'].includes(target.kind)) return rejected('INVALID_TARGET', 'Выберите блок, связь или группу.');
    if (target.kind === 'edge') {
      if (!Number.isInteger(target.index) || target.index < 0) return rejected('INVALID_EDGE_INDEX', 'Нужен точный индекс выбранной связи.');
      const edge = ast.edges[target.index];
      if (!edge) return rejected('EDGE_NOT_FOUND', 'Выбранная связь больше не существует.');
      if (edge.chain) return rejected('CHAIN_EDGE_UNSUPPORTED', 'Связь входит в цепочку. Разделите её на отдельные строки в исходнике.');
      if (edge.parallel) return rejected('PARALLEL_EDGE_AMBIGUOUS', 'Между этими блоками несколько связей. Измените нужную связь в исходнике.');
      return {ok: true, edge, statement: ast.statements.find(item => item.start === edge.statementStart)};
    }
    if (typeof target.id !== 'string' || !target.id) return rejected('INVALID_TARGET_ID', 'Нужен точный ID выбранного объекта.');
    const group = ast.groups.find(item => item.id === target.id);
    if (group && ast.declarations.some(node => node.id === target.id)) return rejected('NODE_GROUP_ID_COLLISION', 'ID группы совпадает с объявлением блока; изменение неоднозначно.');
    if (target.kind === 'group') return group ? {ok: true, group, statement: ast.statements.find(item => item.opensGroupId === group.id)} : rejected('GROUP_NOT_FOUND', 'Выбранная группа больше не существует.');
    if (group) return rejected('NODE_GROUP_ID_COLLISION', 'Выбранный ID принадлежит группе, а не блоку.');
    const references = ast.references.filter(node => node.id === target.id);
    return references.length ? {ok: true, references} : rejected('NODE_NOT_FOUND', 'Выбранный блок больше не существует.');
  }
  function captionSpan(source, ast, target, found) {
    if (target.kind === 'edge') {
      const edge = found.edge;
      if (edge.labelStart === null) return {ok: true, caption: '', start: edge.connectorEnd, end: edge.connectorEnd, form: 'edge'};
      const caption = plainCaption(source.slice(edge.labelStart + 1, edge.labelEnd - 1));
      return caption === null ? rejected('MARKDOWN_CAPTION_UNSUPPORTED', 'Подпись Markdown изменяется только в исходнике.') : {ok: true, caption, start: edge.labelStart, end: edge.labelEnd, form: 'edge'};
    }
    let start, end;
    if (target.kind === 'group') {
      const offset = found.statement.text.indexOf(target.id, 8);
      start = found.statement.contentStart + offset + target.id.length;
      end = found.statement.contentEnd;
    } else {
      const declarations = ast.declarations.filter(node => node.id === target.id);
      if (declarations.length !== 1) return rejected(declarations.length ? 'REPEATED_NODE_DECLARATION' : 'IMPLIED_ONLY_NODE', declarations.length ? 'Блок объявлен несколько раз. Измените подпись в исходнике.' : 'Блок создан внутри связи. Сначала объявите его отдельной строкой.');
      if (declarations[0].kind !== 'node') return rejected('INLINE_NODE_DECLARATION', 'Подпись блока находится внутри связи. Сначала объявите блок отдельной строкой.');
      start = declarations[0].start + target.id.length;
      end = declarations[0].end;
    }
    const tail = source.slice(start, end), whitespace = /^\s*/.exec(tail)[0].length;
    start += whitespace;
    const raw = source.slice(start, end).trimEnd();
    if (raw.startsWith('@{')) return rejected('METADATA_CAPTION_UNSUPPORTED', 'Подпись в блоке @{…} изменяется только в исходнике.');
    if (!raw || raw.startsWith(':::')) return {ok: true, caption: target.id, start, end: start, form: 'node', open: '[', close: ']'};
    // The shared lexer already proved balanced delimiters. Recognize only
    // classic shape wrappers, leaving all suffix classes byte-identical.
    for (const [open, close] of SHAPES) {
      if (!raw.startsWith(open)) continue;
      let bodyEnd = raw.length;
      const classMatch = /:::[\p{L}\p{N}_-]+(?:,[\p{L}\p{N}_-]+)*\s*$/u.exec(raw);
      if (classMatch) bodyEnd = classMatch.index;
      while (bodyEnd && /\s/u.test(raw[bodyEnd - 1])) bodyEnd--;
      if (!raw.slice(0, bodyEnd).endsWith(close)) continue;
      const inner = raw.slice(open.length, bodyEnd - close.length);
      // A generic wrapper cannot swallow unsupported nested syntax.
      if (!inner.trim().startsWith('"') && /[\[\]{}()]/.test(inner)) continue;
      const caption = plainCaption(inner);
      if (caption === null) return rejected('MARKDOWN_CAPTION_UNSUPPORTED', 'Подпись Markdown изменяется только в исходнике.');
      return {ok: true, caption, start: start + open.length, end: start + bodyEnd - close.length, form: 'inner'};
    }
    return rejected('UNSUPPORTED_CAPTION', 'Не удалось безопасно выделить подпись. Измените её в исходнике.');
  }
  function caption(source, target) {
    const ast = analyze(source);
    if (!ast.ok) return failure(ast.diagnostics);
    const found = resolve(ast, target);
    if (!found.ok) return found;
    const span = captionSpan(source, ast, target, found);
    return span.ok ? {ok: true, caption: span.caption, diagnostics: []} : span;
  }
  function finish(source, ast, target, operation, edits, extra) {
    const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0;
    for (const edit of ordered) {
      if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < cursor || edit.start > edit.end || edit.end > source.length) return rejected('OVERLAPPING_EDITS', 'Границы изменений пересекаются; исходник сохранён.');
      cursor = edit.end;
    }
    const candidate = move.applyEdits(source, edits), checked = analyze(candidate);
    if (!checked.ok) return failure([diagnostic('CANDIDATE_STRUCTURE_FAILED', 'Границы изменений не прошли проверку; исходник сохранён.'), ...checked.diagnostics]);
    const removed = new Set(extra?.removedEdgeIndexes || []), expectedEdges = ast.edges.filter(edge => !removed.has(edge.index));
    if (expectedEdges.length !== checked.edges.length || expectedEdges.some((edge, index) => edge.start !== checked.edges[index].start || edge.end !== checked.edges[index].end)) return rejected('CANDIDATE_EDGE_MAPPING_FAILED', 'Изменение затронуло другие связи; исходник сохранён.');
    return {ok: true, changed: candidate !== source, source: candidate, edits, diagnostics: [], target: {...target}, operation,
      requiresSemanticValidation: true, edgeCountBefore: ast.edgeCount, edgeCountAfter: checked.edgeCount, ...extra};
  }
  function planRename(source, target, requestedCaption) {
    if (typeof requestedCaption !== 'string') return rejected('INVALID_CAPTION', 'Нужна текстовая подпись.');
    if (target?.kind !== 'edge' && !requestedCaption.trim()) return rejected('EMPTY_CAPTION', 'Введите непустую подпись блока или группы.');
    if (/[\u0000\u000b\u000c]/u.test(requestedCaption) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(requestedCaption)) return rejected('INVALID_CAPTION', 'Подпись содержит неподдерживаемые управляющие символы.');
    const ast = analyze(source);
    if (!ast.ok) return failure(ast.diagnostics);
    const found = resolve(ast, target);
    if (!found.ok) return found;
    const span = captionSpan(source, ast, target, found);
    if (!span.ok) return span;
    const encoded = '"' + encodeLabel(requestedCaption) + '"';
    const text = span.form === 'edge' ? (requestedCaption ? '|' + encoded + '|' : '') : span.form === 'node' ? span.open + encoded + span.close : encoded;
    const edits = requestedCaption === span.caption ? [] : [{start: span.start, end: span.end, text}];
    return finish(source, ast, target, 'rename', edits, {caption: requestedCaption, desiredCaption: requestedCaption});
  }
  const removeContent = statement => ({start: statement.contentStart, end: statement.contentEnd, text: ''});
  function referencesEdits(source, ast, id) {
    const edits = [];
    for (const statement of ast.statements) {
      if (statement.kind !== 'directive') continue;
      const match = /^(style|class|click)\s+([^\s]+)([\s\S]*)$/.exec(statement.text);
      if (!match) continue;
      const [, type, ids] = match;
      const list = ids.split(',');
      if (!list.includes(id)) continue;
      if (type !== 'class' && list.length !== 1) return rejected('AMBIGUOUS_OBJECT_REFERENCE', 'Директива содержит неоднозначный список объектов.', statement);
      const remaining = list.filter(value => value !== id);
      if (!remaining.length) edits.push(removeContent(statement));
      else {
        const offset = statement.contentStart + statement.text.indexOf(ids, type.length);
        edits.push({start: offset, end: offset + ids.length, text: remaining.join(',')});
      }
    }
    return {ok: true, edits};
  }
  function linkStyleEdits(ast, removed) {
    const edits = [], map = []; let next = 0;
    for (let index = 0; index < ast.edgeCount; index++) map.push(removed.has(index) ? null : next++);
    for (const statement of ast.statements) {
      if (statement.kind !== 'directive' || !/^linkStyle\s/.test(statement.text)) continue;
      const match = /^linkStyle\s+(default|\d+(?:[ \t]*,[ \t]*\d+)*)(?=\s|$)/.exec(statement.text);
      if (!match || !statement.text.slice(match[0].length).trim()) return rejected('UNSUPPORTED_LINK_STYLE', 'Не удалось безопасно разобрать индексы linkStyle.', statement);
      if (match[1] === 'default') continue;
      const indexes = match[1].split(',').map(value => Number(value.trim()));
      if (indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= ast.edgeCount)) return rejected('INVALID_LINK_STYLE_INDEX', 'linkStyle ссылается на несуществующую связь.', statement);
      const kept = indexes.filter(index => !removed.has(index));
      if (!kept.length) {edits.push(removeContent(statement)); continue;}
      const mapped = kept.map(index => map[index]);
      if (mapped.length === indexes.length && mapped.every((value, index) => value === indexes[index])) continue;
      const offset = statement.contentStart + match[0].indexOf(match[1], 9);
      edits.push({start: offset, end: offset + match[1].length, text: mapped.join(',')});
    }
    return {ok: true, edits, edgeIndexMap: map};
  }
  function planDelete(source, target) {
    const ast = analyze(source);
    if (!ast.ok) return failure(ast.diagnostics);
    const found = resolve(ast, target);
    if (!found.ok) return found;
    const selectedEdges = target.kind === 'edge' ? [found.edge] : ast.edges.filter(edge => edge.start === target.id || edge.end === target.id);
    for (const edge of selectedEdges) {
      if (edge.chain) return rejected('CHAIN_EDGE_UNSUPPORTED', 'Объект связан с цепочкой. Разделите её на отдельные строки в исходнике.');
      if (edge.parallel) return rejected('PARALLEL_EDGE_AMBIGUOUS', 'Объект связан несколькими параллельными связями. Измените их в исходнике.');
    }
    const removed = new Set(selectedEdges.map(edge => edge.index)), edits = [];
    const deletedID = target.kind === 'edge' ? null : target.id;
    const groupIDs = new Set(ast.groups.map(group => group.id));
    const removedStatements = new Set(selectedEdges.map(edge => edge.statementStart)), materialized = new Set();
    for (const edge of selectedEdges) {
      const statement = ast.statements.find(item => item.start === edge.statementStart);
      // Keep endpoint declarations at the original lexical location. This is
      // essential for implied-only vertices and order-dependent properties.
      const survivors = statement.nodes.filter(node => {
        if (node.id === deletedID || groupIDs.has(node.id)) return false;
        const key = JSON.stringify([node.id, statement.groupId]);
        if (!node.explicit) {
          // Bare references have no authored properties. Preserve a declaration
          // only when removing it could lose this vertex or scoped membership.
          const other = ast.references.some(reference => reference.id === node.id && !removedStatements.has(reference.statementStart) && (statement.groupId === null || reference.groupId === statement.groupId));
          if (other || materialized.has(key)) return false;
        }
        materialized.add(key);
        return true;
      });
      const text = survivors.map(node => source.slice(node.start, node.end).trimEnd()).join('; ');
      edits.push({...removeContent(statement), text});
    }
    if (target.kind === 'node') {
      for (const statement of ast.statements) if (statement.kind === 'node' && statement.nodes[0].id === target.id) edits.push(removeContent(statement));
    } else if (target.kind === 'group') {
      edits.push(removeContent(found.statement));
      const close = ast.statements.find(item => item.closesGroupId === target.id);
      edits.push(removeContent(close));
      for (const statement of ast.statements) if (statement.kind === 'directive' && statement.groupId === target.id && /^direction\s/.test(statement.text)) edits.push(removeContent(statement));
    }
    if (deletedID !== null) {
      const references = referencesEdits(source, ast, deletedID);
      if (!references.ok) return references;
      edits.push(...references.edits);
    }
    const style = linkStyleEdits(ast, removed);
    if (!style.ok) return style;
    edits.push(...style.edits);
    return finish(source, ast, target, 'delete', edits, {removedEdgeIndexes: [...removed].sort((a, b) => a - b), edgeIndexMap: style.edgeIndexMap,
      ...(target.kind === 'group' ? {parentGroupId: found.group.parentId} : {})});
  }
  return Object.freeze({analyze, caption, planRename, planDelete, applyEdits: move.applyEdits, encodeLabel, version: 1});
});
