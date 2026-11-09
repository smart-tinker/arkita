import { cornerGlyphLayout } from './notation.js';

// Canvas typography only. Model values and the separate full accessible labels never change.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const boundaries = text => [...segmenter.segment(text)].map(part => part.index).concat(text.length);
const centeredContours = new Set(['octagon', 'ellipse', 'folder', 'cloud', 'wavy']);
const NS = 'http://www.w3.org/2000/svg';
// Native SVG metrics round fractional positions; tolerate at most 1/64 of one SVG unit.
const placementTolerance = 1 / 64;

export function captionGrid(appearance, { width, height }) {
  let start = Math.min(appearance.contour === 'cloud' ? 17 : 15, height * .2);
  if (appearance.contour === 'folder') start = Math.max(start, height * .2 + 3);
  if (appearance.banded || appearance.tabbed) start = Math.max(start, Math.min(height / 5, 12) + 3);
  const end = (appearance.contour === 'wavy' ? height * .8 : height) - 3;
  const slots = [12, 20, 20].flatMap((size, index) => {
    const top = start; start += size;
    return start <= end && width > 34 ? [{ top, height: size, header: index === 0 }] : [];
  });
  if (!slots.length) return slots;
  // Give native header fonts spare space without losing any existing name row.
  const minTop = appearance.contour === 'folder' ? height * .2 + 3 : appearance.banded || appearance.tabbed ? Math.min(height / 5, 12) + 3 : 3;
  const header = slots[0], last = slots.at(-1), upperRoom = Math.max(0, header.top - minTop);
  const extra = Math.min(4, upperRoom + Math.max(0, end - last.top - last.height)), up = Math.min(extra, upperRoom);
  header.top -= up; header.height += extra;
  for (const slot of slots.slice(1)) slot.top += extra - up;
  return slots;
}

export function captionSpan(appearance, { width, height }, slot, inkHeight) {
  const centered = centeredContours.has(appearance.contour);
  let left = slot.header && appearance.glyph && centered ? 36 : 17;
  let right = width - (slot.header && appearance.glyph ? 36 : 17);
  const corner = cornerGlyphLayout(appearance, { width, height });
  const top = slot.top + (slot.height - inkHeight) / 2;
  if (corner && top < corner.y + corner.height && top + inkHeight > corner.y) {
    right = Math.min(right, corner.x - 3);
    if (centered) left = Math.max(left, width - right);
  }
  if (['ellipse', 'cloud'].includes(appearance.contour)) {
    const top = slot.top + (slot.height - inkHeight) / 2, bottom = top + inkHeight;
    const d = Math.max(Math.abs(2 * top / height - 1), Math.abs(2 * bottom / height - 1));
    const radius = appearance.contour === 'cloud' ? .79 : 1;
    const half = width / 2 * Math.sqrt(Math.max(0, radius * radius - d * d));
    left = Math.max(left, width / 2 - half + 3); right = Math.min(right, width / 2 + half - 3);
  }
  return { left, right };
}

export function createElementCaption(document, appearance, bounds, rawName, index) {
  const normalized = rawName.replace(/\s+/gu, ' '), marks = boundaries(normalized);
  // A space attached to a mark/Prepend/ZWJ is not a disposable separator.
  const first = normalized[0] === ' ' && marks[1] === 1 ? 1 : 0;
  const last = normalized.slice(marks.at(-2)) === ' ' ? marks.length - 2 : marks.length - 1;
  const name = normalized.slice(marks[first], marks[Math.max(first, last)]) || '(без названия)';
  const offsets = last > first ? marks.slice(first, last + 1).map(offset => offset - marks[first]) : boundaries(name);
  const badge = appearance.badge.toUpperCase();
  const slots = captionGrid(appearance, bounds), centered = centeredContours.has(appearance.contour);
  let used = 0;
  const nodes = slots.map((slot, i) => {
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('class', slot.header ? 'node-type' : 'node-title');
    text.setAttribute('x', centered ? bounds.width / 2 : 17);
    text.setAttribute('y', slot.top + (slot.header ? 10 : 15));
    if (centered) text.setAttribute('text-anchor', 'middle');
    if (slot.header) text.textContent = `${badge} · ${String(index).padStart(2, '0')}`;
    else {
      const remaining = offsets.length - 1 - used, last = i === slots.length - 1;
      const count = Math.min(remaining, last && remaining > 22 ? 21 : 22);
      text.textContent = name.slice(offsets[used], offsets[used + count]) + (last && remaining > count ? '…' : '');
      used += count;
    }
    return text;
  });
  return { appearance, bounds, name, offsets, badge, index: String(index).padStart(2, '0'), slots, nodes };
}

export function fitElementCaption(job, measure = node => node.getBBox()) {
  const { appearance, bounds, name, offsets, badge, index, slots, nodes } = job;
  const before = nodes.map(node => ({ text: node.textContent, x: node.getAttribute('x'), y: node.getAttribute('y') }));
  let calls = 0;
  const separator = index => offsets[index + 1] === offsets[index] + 1 && name[offsets[index]] === ' ';
  function box(node) {
    if (++calls > 64) throw new Error('Caption metric budget exceeded');
    const value = measure(node);
    if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) throw new Error('Unavailable caption metrics');
    return value;
  }
  function candidate(node, slot, text) {
    node.textContent = text; node.setAttribute('x', 0); node.setAttribute('y', 0);
    const ink = box(node), span = captionSpan(appearance, bounds, slot, ink.height);
    if (ink.height > slot.height || ink.width > span.right - span.left) return null;
    const x = centeredContours.has(appearance.contour) ? (span.left + span.right - ink.width) / 2 - ink.x : span.left - ink.x;
    return { text, x, y: slot.top + (slot.height - ink.height) / 2 - ink.y };
  }
  // Keep a measured fit even when shaping is nonmonotone; maximal text is not promised.
  function prefix(node, slot, textAt, low, high) {
    let best = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), result = candidate(node, slot, textAt(middle));
      if (result) { best = { ...result, count: middle }; low = middle + 1; }
      else high = middle - 1;
    }
    return best;
  }
  function place(node, slot, result) {
    if (!result) { node.textContent = ''; return; }
    node.textContent = result.text; node.setAttribute('x', result.x); node.setAttribute('y', result.y);
    const ink = box(node), span = captionSpan(appearance, bounds, slot, ink.height);
    if (ink.x < span.left - placementTolerance || ink.x + ink.width > span.right + placementTolerance || ink.y < slot.top - placementTolerance || ink.y + ink.height > slot.top + slot.height + placementTolerance) node.textContent = '';
  }
  try {
    let used = 0;
    nodes.forEach((node, i) => {
      const slot = slots[i];
      if (slot.header) {
        let result = candidate(node, slot, `${badge} · ${index}`);
        if (!result) {
          const marks = boundaries(badge), minimum = badge.startsWith('?') ? 1 : 0;
          result = prefix(node, slot, count => `${badge.slice(0, marks[count]).trimEnd()}… · ${index}`, minimum, marks.length - 2);
          // A nonmonotone search may miss the shortest truthful candidate.
          if (!result) result = candidate(node, slot, `${minimum ? '?' : ''}… · ${index}`);
        }
        place(node, slot, result); return;
      }
      while (separator(used)) used++;
      if (used >= offsets.length - 1) { node.textContent = ''; return; }
      const remaining = name.slice(offsets[used]);
      let result = candidate(node, slot, remaining), count = offsets.length - 1 - used;
      if (!result) {
        const last = i === nodes.length - 1, suffix = last ? '…' : '';
        const textAt = length => name.slice(offsets[used], offsets[used + length - (length && separator(used + length - 1) ? 1 : 0)]) + suffix;
        result = prefix(node, slot, textAt, last ? 0 : 1, count - 1);
        if (result) {
          count = result.count;
          if (!last) {
            for (let end = used + count - 1; end > used; end--) if (separator(end)) {
              const word = candidate(node, slot, name.slice(offsets[used], offsets[end]));
              if (word) { result = word; count = end - used; }
              break;
            }
          }
        } else { count = 0; if (last) result = candidate(node, slot, '…'); }
      }
      place(node, slot, result); used += node.textContent ? count : 0;
    });
    // If the final slot cannot show even an ellipsis, the surviving row must still signal omission.
    if (nodes.length === 3 && nodes[1].textContent && !nodes[2].textContent && used < offsets.length - 1) {
      const textAt = count => name.slice(0, offsets[count - (count && separator(count - 1) ? 1 : 0)]) + '…';
      place(nodes[1], slots[1], prefix(nodes[1], slots[1], textAt, 0, used) || candidate(nodes[1], slots[1], '…'));
    }
    for (const node of nodes) if (!node.textContent) node.remove();
    return { available: true, calls };
  } catch {
    nodes.forEach((node, i) => { node.textContent = before[i].text; node.setAttribute('x', before[i].x); node.setAttribute('y', before[i].y); });
    return { available: false, calls };
  }
}
