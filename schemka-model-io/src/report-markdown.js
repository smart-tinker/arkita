export const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Closed report Markdown: paragraphs, headings, flat lists, tables, fenced code and explicit links. Raw HTML and remote images stay inert. */
export function reportMarkdown(text, { externalLinks = false } = {}) {
  const inline = source => {
    let out = '', at = 0; const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    for (const match of source.matchAll(pattern)) {
      out += escapeHtml(source.slice(at, match.index));
      if (match[1] !== undefined) out += `<code>${escapeHtml(match[1])}</code>`;
      else if (match[2] !== undefined) out += `<strong>${escapeHtml(match[2])}</strong>`;
      else {
        let safe = false; try { safe = externalLinks && ['https:', 'http:', 'mailto:', 'file:'].includes(new URL(match[4]).protocol); } catch { /* Unrecognised links remain text. */ }
        out += safe ? `<a href="${escapeHtml(match[4])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[3])}</a>` : `${escapeHtml(match[3])} (${escapeHtml(match[4])})`;
      }
      at = match.index + match[0].length;
    }
    return out + escapeHtml(source.slice(at));
  };
  const listItem = line => /^ {0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (line.startsWith('```')) { const code = []; i++; while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]); if (i < lines.length) i++; out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue; }
    if (/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '') && line.includes('|')) {
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const header = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${header.map((_cell, index) => `<td>${inline(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    const item = listItem(line);
    if (item) {
      const ordered = /^\d/.test(item[1]), tag = ordered ? 'ol' : 'ul', items = [];
      while (i < lines.length) { const next = listItem(lines[i]); if (!next || /^\d/.test(next[1]) !== ordered) break; items.push(`<li>${inline(next[2])}</li>`); i++; }
      out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) out.push(`<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`);
    else if (line.trim()) { const paragraph = [line]; i++; while (i < lines.length && lines[i].trim() && !listItem(lines[i]) && !/^(?:#{1,3}\s|```)/.test(lines[i]) && !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) paragraph.push(lines[i++]); out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); continue; }
    i++;
  }
  return out.join('\n');
}
