import { createProject, validateProject } from '../src/index.js';
import { fixtureId as id } from './relationship-project.js';

/** Public synthetic acceptance fixture: 5016 native records at scale 1. */
export function largeNativeModel({ scale = 1 } = {}) {
  const perView = 150 * scale, links = 100 * scale;
  if (!Number.isSafeInteger(perView) || !Number.isSafeInteger(links) || perView < 2 || links < 1 || links >= perView) throw Error('Choose a positive scale with whole record counts.');
  const state = createProject('Synthetic capacity acceptance');
  state.project.id = id('prj', 900000);
  state.project.documentation = 'Public synthetic fixture; no infrastructure or user data.';
  state.elements = Array.from({ length: perView * 10 }, (_, i) => ({ id: id('el', i + 1), type: i ? 'Role' : 'Grouping', name: `Synthetic role ${i + 1}`, documentation: `Documentation ${i + 1}\r\nТест`, properties: [{ key: 'owner', value: 'Synthetic' }, { key: 'tag', value: '' }, { key: 'tag', value: String(i % 5) }] }));
  state.folders = ['Architecture', 'Business', 'Relationships', 'Views', 'Working set'].map((name, i) => ({ id: id('fld', i + 1), name, documentation: `Synthetic folder ${i + 1}`, properties: [], parentFolderId: i ? id('fld', i === 4 ? 2 : 1) : null, members: [] }));
  state.folders[1].members = state.elements.map(item => ({ kind: 'element', id: item.id }));
  for (let v = 0; v < 10; v++) {
    const occurrences = Array.from({ length: perView }, (_, i) => ({
      id: id('occ', v * perView + i + 1), concept: { kind: 'element', id: id('el', i ? v * perView + i + 1 : 1) },
      bounds: i ? { x: 50 + (i - 1) % 10 * 220, y: 60 + Math.floor((i - 1) / 10) * 110, width: 180, height: 70 } : { x: 20, y: 20, width: 2220, height: 1680 },
      parent: i > 0 && i < 10 ? { kind: 'occurrence', id: id('occ', v * perView + 1) } : null,
      zIndex: i, style: i === 1 ? { fill: '#f7e3ad', textColor: '#172437' } : {},
    }));
    const connections = Array.from({ length: links }, (_, i) => {
      const number = v * links + i + 1, source = occurrences[i], target = occurrences[i + 1];
      state.relationships.push({ id: id('rel', number), type: 'Association', source: { ...source.concept }, target: { ...target.concept }, label: `Synthetic link ${number}`, documentation: `Link documentation ${number}`, properties: [{ key: 'source', value: 'synthetic' }] });
      return { id: id('conn', number), relationshipId: id('rel', number), source: { kind: 'occurrence', id: source.id }, target: { kind: 'occurrence', id: target.id },
        routePoints: [{ kind: 'bend', point: { x: source.bounds.x + source.bounds.width / 2, y: source.bounds.y + source.bounds.height / 2 + 30 } }],
        labelPosition: { x: target.bounds.x + 10, y: target.bounds.y - 10 }, style: {},
      };
    });
    state.views.push({ view: { id: id('view', v + 1), name: `Synthetic view ${v + 1}`, documentation: `Diagram ${v + 1}`, properties: [] }, occurrences, connections, visualNodes: [], visualConnectors: [] });
  }
  state.folders[2].members = state.relationships.map(item => ({ kind: 'relationship', id: item.id }));
  state.folders[3].members = state.views.map(entry => ({ kind: 'view', id: entry.view.id }));
  return validateProject(state);
}

const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
const properties = item => item.properties.map(row => `<property key="${xml(row.key)}" value="${xml(row.value)}"/>`).join('');
const metadata = item => `<documentation>${xml(item.documentation)}</documentation>${properties(item)}`;

/** Native Archi XML 5.0.0 for the same deterministic graph and source IDs. */
export function largeArchiXML(options) {
  const state = largeNativeModel(options), concepts = new Map([...state.elements, ...state.relationships].map(item => [item.id, item]));
  const views = new Map(state.views.map(entry => [entry.view.id, entry]));
  function member(ref) {
    if (ref.kind !== 'view') {
      const item = concepts.get(ref.id), relationship = ref.kind === 'relationship';
      const type = relationship ? 'AssociationRelationship' : item.type === 'Role' ? 'BusinessRole' : item.type;
      return `<element xsi:type="archimate:${type}" id="${item.id}" name="${xml(item.name ?? item.label)}"${relationship ? ` source="${item.source.id}" target="${item.target.id}"` : ''}>${metadata(item)}</element>`;
    }
    const entry = views.get(ref.id), byId = new Map(entry.occurrences.map(item => [item.id, item]));
    function drawing(item) {
      const parent = item.parent && byId.get(item.parent.id), b = item.bounds;
      const lines = entry.connections.filter(line => line.source.id === item.id).map(line => {
        const target = byId.get(line.target.id).bounds, point = line.routePoints[0].point;
        return `<sourceConnection xsi:type="archimate:Connection" id="${line.id}" source="${line.source.id}" target="${line.target.id}" archimateRelationship="${line.relationshipId}"><bendpoint startX="${point.x - b.x - b.width / 2}" startY="${point.y - b.y - b.height / 2}" endX="${point.x - target.x - target.width / 2}" endY="${point.y - target.y - target.height / 2}"/></sourceConnection>`;
      }).join('');
      return `<child xsi:type="archimate:DiagramObject" id="${item.id}" archimateElement="${item.concept.id}"${item.style.fill ? ` fillColor="${item.style.fill}" fontColor="${item.style.textColor}"` : ''}><bounds x="${b.x - (parent?.bounds.x ?? 0)}" y="${b.y - (parent?.bounds.y ?? 0)}" width="${b.width}" height="${b.height}"/>${lines}${entry.occurrences.filter(child => child.parent?.id === item.id).map(drawing).join('')}</child>`;
    }
    return `<element xsi:type="archimate:ArchimateDiagramModel" id="${entry.view.id}" name="${xml(entry.view.name)}">${metadata(entry.view)}${entry.occurrences.filter(item => !item.parent).map(drawing).join('')}</element>`;
  }
  function folder(item) {
    return `<folder id="${item.id}" name="${xml(item.name)}">${metadata(item)}${item.members.map(member).join('')}${state.folders.filter(child => child.parentFolderId === item.id).map(folder).join('')}</folder>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" id="${state.project.id}" name="${xml(state.project.name)}" version="5.0.0"><purpose>${xml(state.project.documentation)}</purpose>${state.folders.filter(item => item.parentFolderId === null).map(folder).join('')}</archimate:model>\n`;
}
