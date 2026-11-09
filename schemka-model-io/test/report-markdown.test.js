import test from 'node:test';
import assert from 'node:assert/strict';
import { reportMarkdown } from '../src/report-markdown.js';
test('closed Markdown renders unordered/ordered lists separated from paragraphs and retains inert markup', () => {
 const result=reportMarkdown('Before\n- one\n- **two**\n\n1. first\n2. <img src=x>\n\nAfter\n```\n- literal\n```');
 assert.match(result, /<p>Before<\/p>\n<ul><li>one<\/li><li><strong>two<\/strong><\/li><\/ul>/);
 assert.match(result, /<ol><li>first<\/li><li>&lt;img src=x&gt;<\/li><\/ol>/); assert.match(result, /<pre><code>- literal<\/code><\/pre>/); assert.doesNotMatch(result, /<img/);
});
