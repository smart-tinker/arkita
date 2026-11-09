/* Skhemka source-span move planner. Original code; no Mermaid parser copied.
 * This is a conservative lexical planner, NOT a Mermaid semantic validator.
 * The caller MUST parse both original and candidate with the pinned Tiny engine
 * and verify node/edge/style/group invariants and effective target membership.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SkGroupMove = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const RESERVED = new Set(['end', 'subgraph', 'graph', 'flowchart', 'direction', 'style', 'classDef', 'class', 'click', 'linkStyle', 'accTitle', 'accDescr']);
  const diagnostic = (code, message, start, end) => ({code, message, ...(Number.isInteger(start) ? {start, end: Number.isInteger(end) ? end : start} : {})});
  const failure = diagnostics => ({ok: false, edits: [], diagnostics});
  const isID = c => !!c && /[\p{L}\p{N}\p{M}_]/u.test(c);
  const skipSpace = (text, offset) => {while (offset < text.length && /\s/u.test(text[offset])) offset++; return offset;};

  function readID(text, offset) {
    const start = offset;
    if (!isID(text[offset])) return null;
    while (offset < text.length) {
      const c = text[offset];
      if (isID(c)) {offset++; continue;}
      // A single hyphen or period inside an ID is not an edge connector.
      if ((c === '-' || c === '.') && isID(text[offset - 1]) && isID(text[offset + 1])) {offset++; continue;}
      break;
    }
    return {id: text.slice(start, offset), start, end: offset};
  }

  function skipQuoted(text, offset) {
    const quote = text[offset++];
    while (offset < text.length) {
      if (text[offset] === '\\') {offset += 2; continue;}
      if (text[offset++] === quote) return offset;
    }
    return -1;
  }

  function balancedEnd(text, offset) {
    const pairs = {'[': ']', '(': ')', '{': '}', '>': ']'};
    if (!pairs[text[offset]]) return -1;
    const stack = [pairs[text[offset++]]];
    while (offset < text.length) {
      const c = text[offset];
      if (c === '"') {offset = skipQuoted(text, offset); if (offset < 0) return -1; continue;}
      if (c === '[' || c === '(' || c === '{') stack.push(pairs[c]);
      else if (c === ']' || c === ')' || c === '}') {
        if (stack.pop() !== c) return -1;
        if (!stack.length) return offset + 1;
      }
      offset++;
    }
    return -1;
  }

  // Newlines/semicolons split statements only outside labels, shapes, quoted
  // strings, edge-label pipes, comments, metadata blocks and init directives.
  // Every offset refers to the ORIGINAL JS string, including BOM and CRLF.
  function lex(source) {
    const statements = [], diagnostics = [];
    let start = 0, offset = 0, stack = [], quote = false, pipe = false, comment = -1;
    const pairs = {'[': ']', '(': ')', '{': '}'};
    // Tiny front-matter preprocessing is line based. A lone CR can otherwise
    // make our boundaries disagree with the engine, so reject it atomically.
    const loneCR = /\r(?!\n)/.exec(source);
    if (loneCR) return {statements, diagnostics: [diagnostic('UNSUPPORTED_LINE_ENDINGS', 'Для безопасного переноса нужны окончания строк LF или CRLF; одиночный CR не поддерживается.', loneCR.index, loneCR.index + 1)]};
    function emit(end, delimiterEnd) {
      const codeEnd = comment < 0 ? end : comment;
      let contentStart = start, contentEnd = codeEnd;
      while (contentStart < contentEnd && /\s/u.test(source[contentStart])) contentStart++;
      while (contentEnd > contentStart && /\s/u.test(source[contentEnd - 1])) contentEnd--;
      statements.push({start, end: delimiterEnd, contentStart, contentEnd, delimiterStart: end,
        delimiter: source.slice(end, delimiterEnd), text: source.slice(contentStart, contentEnd)});
      start = delimiterEnd; comment = -1;
    }
    // Front matter is opaque. No YAML identifier can become a Mermaid scope.
    const frontStart = source.charCodeAt(0) === 0xFEFF ? 1 : 0;
    const firstLineEnd = source.indexOf('\n', frontStart);
    const openingFence = firstLineEnd >= 0 ? /^([ \t]*)---[ \t]*\r?$/.exec(source.slice(frontStart, firstLineEnd)) : null;
    if (openingFence) {
      let line = firstLineEnd + 1, closed = false;
      while (line <= source.length) {
        const nl = source.indexOf('\n', line), end = nl < 0 ? source.length : nl;
        const closingFence = /^([ \t]*)---[ \t]*\r?$/.exec(source.slice(line, end));
        // Match Tiny's exact opening indentation. A more-indented fence can
        // be literal text inside a YAML block scalar, never a Mermaid node.
        if (closingFence && closingFence[1] === openingFence[1]) {
          offset = start = nl < 0 ? end : nl + 1; closed = true;
          statements.push({start: 0, end: offset, contentStart: 0, contentEnd: offset, delimiterStart: offset, delimiter: '', text: '', kind: 'metadata'});
          break;
        }
        if (nl < 0) break;
        line = nl + 1;
      }
      if (!closed) return {statements, diagnostics: [diagnostic('UNCLOSED_FRONT_MATTER', 'Блок YAML не закрыт.', 0, source.length)]};
    }
    while (offset < source.length) {
      const c = source[offset];
      if (comment >= 0) {
        if (c !== '\r' && c !== '\n') {offset++; continue;}
      } else if (quote) {
        if (c === '\\') {offset += 2; continue;}
        if (c === '"') quote = false;
        offset++; continue;
      } else {
        if (c === '"') {quote = true; offset++; continue;}
        if (pipe) {if (c === '|') pipe = false; offset++; continue;}
        if (!stack.length && source.startsWith('%%{', offset)) {
          // Directives must occupy a statement; parse balanced braces so an
          // apparent }%% or end inside a JSON string cannot end the directive.
          if (source.slice(start, offset).trim()) {
            diagnostics.push(diagnostic('INLINE_DIRECTIVE', 'Директива внутри строки не поддерживается для переноса.', offset));
            break;
          }
          const end = balancedEnd(source, offset + 2);
          if (end < 0 || source.slice(end, end + 2) !== '%%') {
            diagnostics.push(diagnostic('UNCLOSED_DIRECTIVE', 'Не удалось определить конец директивы.', offset)); break;
          }
          statements.push({start, end: end + 2, contentStart: offset, contentEnd: end + 2, delimiterStart: end + 2, delimiter: '', text: '', kind: 'metadata'});
          start = offset = end + 2; continue;
        }
        if (!stack.length && source.startsWith('%%', offset)) {comment = offset; offset += 2; continue;}
        if (!stack.length && c === '|') {pipe = true; offset++; continue;}
        if (pairs[c]) {stack.push(pairs[c]); offset++; continue;}
        // Mermaid's asymmetric node A>text] has a different opening token.
        if (!stack.length && c === '>' && isID(source[offset - 1])) {stack.push(']'); offset++; continue;}
        if (c === ']' || c === ')' || c === '}') {
          if (stack.pop() !== c) {diagnostics.push(diagnostic('UNBALANCED_LABEL', 'Не удалось безопасно определить границы подписи.', offset)); break;}
          offset++; continue;
        }
        if (stack.length) {offset++; continue;}
      }
      if (c === '\n' || c === '\r' || c === ';') {
        const delimiterEnd = offset + (c === '\r' && source[offset + 1] === '\n' ? 2 : 1);
        emit(offset, delimiterEnd); offset = delimiterEnd; continue;
      }
      offset++;
    }
    if (!diagnostics.length && (quote || pipe || stack.length)) diagnostics.push(diagnostic('UNCLOSED_LABEL', 'Подпись или строка не закрыта; перенос отменён.', start, source.length));
    if (!diagnostics.length && start < source.length) emit(source.length, source.length);
    return {statements, diagnostics};
  }

  function readNode(text, offset) {
    offset = skipSpace(text, offset);
    const token = readID(text, offset);
    if (!token || RESERVED.has(token.id)) return null;
    offset = skipSpace(text, token.end);
    let explicit = false;
    if ('[({>'.includes(text[offset] || '\0')) {
      const end = balancedEnd(text, offset);
      if (end < 0) return null;
      offset = skipSpace(text, end); explicit = true;
    }
    if (text.slice(offset, offset + 2) === '@{') {
      const end = balancedEnd(text, offset + 1);
      if (end < 0) return null;
      offset = skipSpace(text, end); explicit = true;
    }
    if (text.slice(offset, offset + 3) === ':::') {
      const classStart = offset + 3;
      const match = /^[\p{L}\p{N}_-]+(?:,[\p{L}\p{N}_-]+)*/u.exec(text.slice(classStart));
      if (!match) return null;
      offset = skipSpace(text, classStart + match[0].length); explicit = true;
    }
    return {id: token.id, start: token.start, end: offset, explicit};
  }

  function nodeStatement(text) {
    const first = readNode(text, 0);
    if (!first) return null;
    if (first.end === text.length) return {kind: 'node', nodes: [{...first, explicit: true}]};
    const nodes = [first];
    let offset = first.end;
    while (offset < text.length) {
      // Bare-connector edges, optionally followed by |quoted or plain label|.
      // Text between two connector halves, ampersand fanouts and edge IDs are
      // deliberately outside this bounded grammar and fail atomically.
      const arrow = /^(?:<?(?:-{2,}>|-{3,}|-{2,}[ox]|={2,}>|={3,}|-\.+->|-\.+-)|[ox]-{2,}(?:[ox]|>)|~{3,})/.exec(text.slice(offset));
      if (!arrow) return null;
      offset = skipSpace(text, offset + arrow[0].length);
      if (text[offset] === '|') {
        offset++;
        let closed = false;
        while (offset < text.length) {
          if (text[offset] === '"') {offset = skipQuoted(text, offset); if (offset < 0) return null; continue;}
          if (text[offset++] === '|') {closed = true; break;}
        }
        if (!closed) return null;
      }
      const next = readNode(text, offset);
      if (!next) return null;
      nodes.push(next); offset = next.end;
    }
    return {kind: 'edge', nodes};
  }

  function analyze(source) {
    if (typeof source !== 'string') return {ok: false, groups: [], statements: [], declarations: [], references: [], diagnostics: [diagnostic('INVALID_SOURCE', 'Нужен строковый исходник Mermaid.')]};
    const scanned = lex(source), statements = scanned.statements, diagnostics = scanned.diagnostics;
    const groups = [], declarations = [], references = [], stack = [], groupIDs = new Map();
    let header = false;
    if (diagnostics.length) return {ok: false, groups, statements, declarations, references, diagnostics};
    for (const statement of statements) {
      const text = statement.text;
      statement.groupId = stack.length ? stack[stack.length - 1].id : null;
      if (statement.kind === 'metadata' || !text) {statement.kind = statement.kind || 'trivia'; continue;}
      if (!header) {
        if (!/^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)$/.test(text)) {
          diagnostics.push(diagnostic('UNSUPPORTED_HEADER', 'Для переноса нужен обычный заголовок flowchart или graph с направлением.', statement.contentStart, statement.contentEnd)); break;
        }
        statement.kind = 'header'; header = true; continue;
      }
      if (/^subgraph(?:\s|$)/.test(text)) {
        const begin = skipSpace(text, 8), id = readID(text, begin);
        let end = id ? skipSpace(text, id.end) : -1;
        if (id && text[end] === '[') {end = balancedEnd(text, end); if (end >= 0) end = skipSpace(text, end);}
        if (!id || RESERVED.has(id.id) || end !== text.length) {
          diagnostics.push(diagnostic('UNSUPPORTED_GROUP_HEADER', 'Для переноса у группы должен быть однозначный ID: subgraph id["Название"].', statement.contentStart, statement.contentEnd)); break;
        }
        const group = {id: id.id, parentId: statement.groupId, depth: stack.length, start: statement.start, end: null,
          headerStart: statement.contentStart, headerEnd: statement.contentEnd, bodyStart: statement.end, closeStart: null, closeEnd: null};
        statement.kind = 'group-open'; statement.opensGroupId = group.id;
        if (groupIDs.has(group.id)) diagnostics.push(diagnostic('DUPLICATE_GROUP_ID', 'ID группы повторяется; перенос неоднозначен: ' + group.id, statement.contentStart, statement.contentEnd));
        groupIDs.set(group.id, group); groups.push(group); stack.push(group); continue;
      }
      if (text === 'end') {
        const group = stack.pop();
        if (!group) {diagnostics.push(diagnostic('UNMATCHED_END', 'Найден end без соответствующей группы.', statement.contentStart, statement.contentEnd)); break;}
        statement.kind = 'group-close'; statement.closesGroupId = group.id;
        group.closeStart = statement.start; group.closeEnd = statement.end; group.end = statement.end; continue;
      }
      if (/^direction\s+(?:TB|TD|BT|RL|LR)$/.test(text) || /^(?:classDef|class|style|linkStyle|click)\s+/.test(text) || /^(?:accTitle|accDescr)\s*(?::|\{)/.test(text)) {
        statement.kind = 'directive'; continue;
      }
      const parsed = nodeStatement(text);
      if (!parsed) {
        diagnostics.push(diagnostic('UNSUPPORTED_STATEMENT', 'Эта конструкция Mermaid пока не поддерживает безопасный перенос. Измените группу в исходнике.', statement.contentStart, statement.contentEnd)); break;
      }
      statement.kind = parsed.kind;
      statement.nodes = parsed.nodes.map(node => ({...node, start: statement.contentStart + node.start, end: statement.contentStart + node.end}));
      for (const node of statement.nodes) {
        const entry = {id: node.id, explicit: node.explicit, groupId: statement.groupId, start: node.start, end: node.end, statementStart: statement.start, statementEnd: statement.end, kind: statement.kind};
        references.push(entry);
        if (entry.explicit) declarations.push(entry);
      }
    }
    if (header && stack.length && !diagnostics.length) diagnostics.push(diagnostic('UNCLOSED_GROUP', 'Группа не закрыта: ' + stack[stack.length - 1].id, stack[stack.length - 1].start));
    if (!header && !diagnostics.length) diagnostics.push(diagnostic('MISSING_HEADER', 'Не найден заголовок Mermaid.'));
    return {ok: !diagnostics.length, groups, statements, declarations, references, diagnostics};
  }

  function applyEdits(source, edits) {
    // All offsets are in the original source. Highest offset first also handles
    // moving a final declaration to a group above it without offset adjustment.
    let result = source;
    const ordered = edits.map((edit, index) => ({...edit, index})).sort((a, b) => b.start - a.start || b.end - a.end || b.index - a.index);
    for (const edit of ordered) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    return result;
  }

  function planMove(source, nodeId, targetGroupId) {
    if (typeof nodeId !== 'string' || !nodeId || (targetGroupId !== null && typeof targetGroupId !== 'string')) return failure([diagnostic('INVALID_ARGUMENT', 'Нужны ID блока и ID существующей группы либо null для корня.')]);
    const ast = analyze(source);
    if (!ast.ok) return failure(ast.diagnostics);
    const target = targetGroupId === null ? null : ast.groups.find(group => group.id === targetGroupId);
    if (targetGroupId !== null && !target) return failure([diagnostic('TARGET_NOT_FOUND', 'Группа назначения не найдена: ' + targetGroupId)]);
    if (ast.groups.some(group => group.id === nodeId)) return failure([diagnostic('NODE_GROUP_ID_COLLISION', 'ID блока совпадает с ID группы; перенос неоднозначен.')]);
    const mentions = ast.references.filter(node => node.id === nodeId), definitions = ast.declarations.filter(node => node.id === nodeId);
    if (!definitions.length) return failure([diagnostic(mentions.length ? 'IMPLIED_ONLY_NODE' : 'NODE_NOT_FOUND', mentions.length ? 'Блок создан внутри связи. Сначала выделите его в отдельную строку исходника.' : 'Объявление блока не найдено.')]);
    if (definitions.length !== 1) return failure([diagnostic('REPEATED_NODE_DECLARATION', 'Блок объявлен несколько раз; перенос отменён, чтобы не изменить его свойства.')]);
    const declaration = definitions[0];
    if (declaration.kind !== 'node') return failure([diagnostic('INLINE_NODE_DECLARATION', 'Объявление блока находится внутри связи. Сначала выделите его в отдельную строку исходника.', declaration.start, declaration.end)]);
    const conflict = mentions.find(node => node.kind === 'edge' && node.groupId !== null && node.groupId !== targetGroupId);
    if (conflict) return failure([diagnostic('CONFLICTING_SCOPED_REFERENCE', 'Связь внутри другой группы удерживает этот блок в ней. Переносите такой блок и связь вручную в исходнике.', conflict.start, conflict.end)]);
    if (declaration.groupId === targetGroupId) return {ok: true, changed: false, source, edits: [], diagnostics: [], nodeId, fromGroupId: declaration.groupId, targetGroupId, requiresSemanticValidation: true};
    const statement = ast.statements.find(item => item.start === declaration.statementStart);
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    let payload = source.slice(statement.start, statement.end);
    // When the moved statement was the unterminated final line, supply only
    // the required boundary; never rewrite indentation or existing newlines.
    if (!statement.delimiter) payload += eol;
    const position = target ? target.closeStart : source.length;
    const prefix = !target && source.length && !/[\r\n]$/.test(source) ? eol : '';
    const edits = [{start: statement.start, end: statement.end, text: ''}, {start: position, end: position, text: prefix + payload}];
    const candidate = applyEdits(source, edits);
    const checked = analyze(candidate);
    if (!checked.ok) return failure([diagnostic('CANDIDATE_STRUCTURE_FAILED', 'Безопасность границ переноса не подтверждена; исходник не изменён.'), ...checked.diagnostics]);
    const moved = checked.declarations.filter(node => node.id === nodeId);
    if (moved.length !== 1 || moved[0].kind !== 'node' || moved[0].groupId !== targetGroupId) return failure([diagnostic('CANDIDATE_MEMBERSHIP_FAILED', 'Не удалось однозначно поместить объявление в выбранную группу.')]);
    return {ok: true, changed: true, source: candidate, edits, diagnostics: [], nodeId, fromGroupId: declaration.groupId, targetGroupId, requiresSemanticValidation: true};
  }

  return Object.freeze({analyze, planMove, applyEdits, version: 1});
});
