import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CatalogValidationError, MAX_FILE_BYTES, MAX_COLLECTION_ITEMS, parseCatalog, validateCatalog, serializeCatalog, filterServices, getServiceDetails, describeBinding } from '../catalog.js';
import { SAMPLE_CATALOG } from '../sample-catalog.js';

const fresh = () => structuredClone(SAMPLE_CATALOG);
const rejects = (change, pattern) => { const data = fresh(); change(data); assert.throws(() => validateCatalog(data), pattern); };

test('synthetic fixture conforms and JSON round-trips without dropping fields', () => {
  const data = fresh(); data.extra_extension = { notes: 'Neutral extension', count: 3 };
  assert.equal(validateCatalog(data), data);
  assert.deepEqual(parseCatalog(serializeCatalog(data)), data);
  assert.match(serializeCatalog(data), /\n$/);
});
test('accepts a UTF-8 BOM but rejects invalid JSON and non-object documents', () => {
  assert.deepEqual(parseCatalog(`\uFEFF${JSON.stringify(fresh())}`), fresh());
  for (const value of ['null', '[]', '"string"', '{', '{}']) assert.throws(() => parseCatalog(value), CatalogValidationError);
});
test('requires the supported schema and core metadata', () => {
  rejects(data => { data.schema_version = '9.0.0'; }, /unsupported schema/);
  rejects(data => { data.catalog_id = ''; }, /catalog_id/);
  rejects(data => { data.status = 1; }, /status/);
  rejects(data => { delete data.services; }, /services/);
  rejects(data => { data.systems = {}; }, /systems/);
});
test('rejects oversized files by UTF-8 bytes rather than character length', () => {
  assert.throws(() => parseCatalog(' '.repeat(MAX_FILE_BYTES + 1)), /maximum size/);
  const unicode = JSON.stringify({ x: 'я'.repeat(MAX_FILE_BYTES / 2) });
  assert.ok(unicode.length < MAX_FILE_BYTES);
  assert.throws(() => parseCatalog(unicode), /maximum size/);
});
test('rejects unsafe keys at any depth and does not pollute prototypes', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const data = JSON.stringify(fresh()).replace('"publication":', `"extension":{"${key}":{"polluted":true}},"publication":`);
    assert.throws(() => parseCatalog(data), /unsafe object key/);
  }
  assert.equal({}.polluted, undefined);
});
test('bounds arrays, strings, nesting and object keys', () => {
  rejects(data => { data.extra = Array(MAX_COLLECTION_ITEMS + 1).fill(0); }, /too many array items/);
  rejects(data => { data.extra = 'x'.repeat(20001); }, /string is too long/);
  rejects(data => { data.services[0].id = 'x'.repeat(161); }, /identifier is too long/);
  rejects(data => { data['x'.repeat(201)] = true; }, /object key is too long/);
  rejects(data => { let nested = {}; data.extra = nested; for (let i = 0; i < 17; i++) nested = nested.child = {}; }, /nesting is too deep/);
});
test('rejects unsupported JS objects when called directly', () => {
  rejects(data => { data.extra = new Date(); }, /expected an object/);
  rejects(data => { data.extra = Infinity; }, /finite/);
  rejects(data => { data.extra = undefined; }, /unsupported value/);
  rejects(data => { data.extra = () => {}; }, /unsupported value/);
});
test('rejects duplicate IDs and duplicated references', () => {
  rejects(data => { data.services.push(structuredClone(data.services[0])); }, /duplicate identifier/);
  rejects(data => { data.services[0].offer_ids.push(data.services[0].offer_ids[0]); }, /duplicate values/);
});
test('validates all core reference families', () => {
  rejects(data => { data.services[0].direction_id = 'missing'; }, /unknown directions/);
  rejects(data => { data.services[0].system_ids.push('missing'); }, /unknown systems/);
  rejects(data => { data.services[0].offer_ids.push('missing'); }, /unknown offers/);
  rejects(data => { data.offers[0].request_ids.push('missing'); }, /unknown requests/);
  rejects(data => { data.services[0].evidence_ids.push('missing'); }, /unknown evidence/);
  rejects(data => { data.requests[0].service_id = 'missing'; }, /unknown services/);
});
test('rejects cross-service and cross-offer ownership errors', () => {
  rejects(data => { data.services[0].offer_ids.push('demo-offer-c'); }, /another service/);
  rejects(data => { data.services[0].offer_ids = ['demo-offer-b']; }, /service must list/);
  rejects(data => { data.offers[0].request_ids.push('demo-request-b'); }, /another offer/);
  rejects(data => { data.offers[0].request_ids = []; }, /offer must list/);
  rejects(data => { data.requests[0].service_id = 'demo-service-b'; }, /ownership mismatch/);
});
test('validates optional metadata that is rendered by the UI', () => {
  rejects(data => { data.services[0].support = 'invalid'; }, /support/);
  rejects(data => { data.services[0].support.participants = {}; }, /participants/);
  rejects(data => { data.services[0].knowledge.instruction_ref = {}; }, /instruction_ref/);
  rejects(data => { data.services[0].knowledge.known_limits = false; }, /known_limits/);
  rejects(data => { data.offers[0].automatic_fulfilment = 'yes'; }, /expected a boolean/);
  rejects(data => { data.requests[0].handling.dispatch = 1; }, /expected a boolean/);
  rejects(data => { data.requests[0].type_is_suggestion = 'true'; }, /expected a boolean/);
  rejects(data => { data.requests[0].allowed_types = [false]; }, /expected a non-empty string/);
  rejects(data => { data.systems[0].fact_status = {}; }, /fact_status/);
});
test('validates typed architecture references without trusting declared bindings', () => {
  rejects(data => { data.view_links[0].to.id = 'missing'; }, /unknown systems/);
  rejects(data => { data.view_links[0].from.type = 'constructor'; }, /unsupported reference type/);
  rejects(data => { data.view_links[0].architecture_element_id = {}; }, /architecture_element_id/);
  const link = fresh().view_links[0];
  assert.match(describeBinding(link), /не сопоставлен/);
  link.architecture_element_id = 'unverified-example-id'; link.binding_status = 'resolved';
  assert.match(describeBinding(link), /не проверена/);
});
test('handles absent optional collections and empty catalogs', () => {
  const data = { schema_version: '0.1.0', catalog_id: 'empty-example', status: 'unknown', directions: [], services: [], offers: [], requests: [], systems: [] };
  assert.deepEqual(validateCatalog(data), data);
  assert.deepEqual(filterServices(data), []);
  assert.equal(getServiceDetails(data, 'missing'), null);
});
test('searches service, offer, request and term fields with direction filtering', () => {
  const data = fresh();
  assert.equal(filterServices(data, 'ДОКУМЕНТЫ')[0].id, 'demo-service-a');
  assert.equal(filterServices(data, 'Подготовка схемы')[0].id, 'demo-service-a');
  assert.ok(filterServices(data, 'Описать материал').some(item => item.id === 'demo-service-b'));
  assert.equal(filterServices(data, 'справка')[0].id, 'demo-service-b');
  assert.equal(filterServices(data, '', 'demo-direction-b').length, 1);
  assert.equal(filterServices(data, 'несуществующее слово').length, 0);
  assert.equal(filterServices(data, 'схема', 'demo-direction-b').length, 0);
});
test('returns service → offers → requests and related systems without mutation', () => {
  const data = fresh(); const before = JSON.stringify(data); const details = getServiceDetails(data, 'demo-service-a');
  assert.equal(details.offers.length, 2);
  assert.equal(details.offers[0].requests[0].id, 'demo-request-a');
  assert.equal(details.systems[0].id, 'demo-system-a');
  assert.equal(details.links.length, 1);
  assert.equal(JSON.stringify(data), before);
});
test('treats HTML-looking strings as data, never markup', async () => {
  const data = fresh(); data.services[0].name = '<img src=x onerror=alert(1)>';
  assert.equal(parseCatalog(serializeCatalog(data)).services[0].name, data.services[0].name);
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /node\.textContent = String\(value\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});
test('runtime is network-free and session-only with explicit unload guards', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|serviceWorker/);
  assert.match(app, /beforeunload/);
  assert.match(app, /file\.size > MAX_FILE_BYTES/);
  assert.match(app, /confirmDiscard\(\)/);
  assert.match(app, /link\.download = 'schemka-catalog\.json'/);
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  for (const route of ['/', '/mermaid/', '/model/', '/catalog/']) assert.ok(html.includes(`href="${route}" data-mode-link=`));
});
