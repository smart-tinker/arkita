/* Mermaid 12.1.0 MIT: frontmatter scanner copied unchanged from published ESM chunk; packaging adapter added. */
(function(root){const __name=(fn)=>fn;const whitespace=/\s/;
var isLineBreak = /* @__PURE__ */ __name((char) => char === "\n" || char === "\r", "isLineBreak");
var lastLineBreakInWhitespaceRun = /* @__PURE__ */ __name((text, from) => {
  let index = -1;
  for (let i = from; i < text.length && whitespace.test(text[i]); i++) {
    if (isLineBreak(text[i])) {
      index = i;
    }
  }
  return index;
}, "lastLineBreakInWhitespaceRun");
var matchFrontMatter = /* @__PURE__ */ __name((text) => {
  let cursor = 0;
  while (cursor < text.length && whitespace.test(text[cursor]) && !isLineBreak(text[cursor])) {
    cursor++;
  }
  const indent = text.slice(0, cursor);
  if (!text.startsWith("---", cursor)) {
    return void 0;
  }
  const openingEnds = [];
  for (let i = cursor + 3; i < text.length && whitespace.test(text[i]); i++) {
    if (isLineBreak(text[i])) {
      openingEnds.push(i);
    }
  }
  if (openingEnds.length === 0) {
    return void 0;
  }
  const closingFence = `${indent}---`;
  const closingEnd = /* @__PURE__ */ __name((i) => isLineBreak(text[i]) && text.startsWith(closingFence, i + 1) ? lastLineBreakInWhitespaceRun(text, i + 1 + closingFence.length) : -1, "closingEnd");
  const earliestBodyStart = openingEnds[0] + 1;
  let lastClosingFence = -1;
  for (let i = earliestBodyStart; i < text.length; i++) {
    if (closingEnd(i) !== -1) {
      lastClosingFence = i;
    }
  }
  if (lastClosingFence === -1) {
    return void 0;
  }
  let openingEnd = openingEnds[0];
  for (const candidate of openingEnds) {
    if (candidate < lastClosingFence) {
      openingEnd = candidate;
    }
  }
  const bodyStart = openingEnd + 1;
  for (let i = bodyStart; i <= lastClosingFence; i++) {
    const matchEnd = closingEnd(i);
    if (matchEnd !== -1) {
      return { indent, body: text.slice(bodyStart, i), length: matchEnd + 1 };
    }
  }
  return void 0;
}, "matchFrontMatter");


root.SkMermaidPreflight={matchFrontMatter};})(globalThis);
