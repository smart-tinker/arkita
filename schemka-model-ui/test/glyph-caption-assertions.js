import assert from 'node:assert/strict';
import { captionGrid, captionSpan } from '../src/element-captions.js';

// Callers supply independent stroke-inclusive primitive hulls, not renderer allocation bounds.
export function assertGlyphCaptionClearance(appearance, bounds, ink) {
  for (const slot of captionGrid(appearance, bounds)) for (const height of [10, 14, 20].filter(value => value <= slot.height)) {
    const span = captionSpan(appearance, bounds, slot, height), top = slot.top + (slot.height - height) / 2;
    assert.ok(span.right <= ink.left || span.left >= ink.right || top + height <= ink.top || top >= ink.bottom,
      `${appearance.glyph} ${bounds.width}x${bounds.height}: fitted caption ink stays outside glyph ink`);
  }
}
