import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExchangeXml} from '../xml-validator.mjs';
const xml=body=>`<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="id-model"><name>Кириллица</name>${body}</model>`;
test('offline pinned XSD validates model, geometry and optional Dublin Core; supplied schemas stay exact',async()=>{
 const result=await validateExchangeXml(xml('<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><schema>http://purl.org/dc/elements/1.1/</schema><schemaversion>1.1</schemaversion><dc:creator xml:lang="ru">Автор</dc:creator></metadata>'));
 assert.equal(result.status,'ok');assert.equal(result.schema.version,'3.1');assert.match(result.schema.status,/Preliminary/);assert.equal(result.schemas.length,9);
 const geometry='<views><diagrams><view identifier="view-1" xsi:type="Diagram"><name>View</name><node identifier="note-1" xsi:type="Label" x="0" y="0" w="100" h="50"><label>Text</label></node></view></diagrams></views>';
 assert.equal((await validateExchangeXml(xml(geometry))).status,'ok');
 await assert.rejects(validateExchangeXml(xml(geometry.replace('w="100"','w="0"'))),e=>e.code==='XML_XSD'&&e.diagnostics.length>0);
});
test('schema failures and syntax failures are distinct; identifiers and references are checked',async()=>{
 await assert.rejects(validateExchangeXml(xml('<elements><element identifier="a" xsi:type="NoSuchType"/></elements>')),e=>e.code==='XML_XSD');
 await assert.rejects(validateExchangeXml(xml('').replace('</name>','</broken>')),e=>e.code==='XML_SYNTAX');
 await assert.rejects(validateExchangeXml(xml('<relationships><relationship identifier="r" xsi:type="Association" source="missing" target="missing"/></relationships>')),e=>e.code==='XML_XSD');
});
test('untrusted XML cannot request DTD, entity expansion, XInclude, stylesheet, non-UTF8 or excessive nesting',async()=>{
 for(const input of ['<!DOCTYPE x SYSTEM "file:///etc/passwd">'+xml(''),'<!ENTITY x "a">'+xml(''),xml('<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="https://invalid.example/"/>'),'<?xml-stylesheet href="file:///etc/passwd"?>'+xml('')])await assert.rejects(validateExchangeXml(input),e=>e.code==='XML_UNSAFE');
 await assert.rejects(validateExchangeXml('<?xml version="1.0" encoding="utf-16"?>'+xml('')),e=>e.code==='XML_INPUT');
 await assert.rejects(validateExchangeXml('<a>'.repeat(65)+'</a>'.repeat(65)),e=>e.code==='XML_LIMIT');
 await assert.rejects(validateExchangeXml(new Uint8Array([255])),e=>e.code==='XML_INPUT');
});
test('cancellation terminates worker and repeated isolated validation has no retained state',async()=>{
 const pre=new AbortController();pre.abort();await assert.rejects(validateExchangeXml(xml(''),{signal:pre.signal}),e=>e.code==='XML_CANCELLED');
 const active=new AbortController(),pending=validateExchangeXml(xml(''),{signal:active.signal});active.abort();await assert.rejects(pending,e=>e.code==='XML_CANCELLED');
 for(let i=0;i<2;i++)assert.equal((await validateExchangeXml(xml(''))).status,'ok');
 // schemaLocation supplied by the document is never a loader instruction: validation uses only the bundled schema.
 assert.equal((await validateExchangeXml(xml('').replace('identifier="id-model"','identifier="id-model" xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ https://invalid.example/evil.xsd"'))).status,'ok');
});
