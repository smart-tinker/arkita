import { CURRENT_METAMODEL, CURRENT_CATALOG } from '../../schemka-model-core/src/current-catalog.js';
import { freeze } from './descriptor.js';

const labels = {
  "SystemSoftware": "System Software",
  "CommunicationNetwork": "Communication Network",
  "ApplicationComponent": "Application Component",
  "ApplicationInterface": "Application Interface",
  "DataObject": "Data Object",
  "BusinessActor": "Business Actor",
  "BusinessInterface": "Business Interface",
  "BusinessObject": "Business Object",
  "TechnologyInterface": "Technology Interface",
  "DistributionNetwork": "Distribution Network",
  "ValueStream": "Value Stream",
  "CourseOfAction": "Course of Action",
  "WorkPackage": "Work Package",
  "ReadAccess": "Read Access",
  "WriteAccess": "Write Access",
  "ReadWriteAccess": "Read/Write Access",
  "DirectedAssociation": "Directed Association"
};

export const CURRENT_PROFILE = freeze({
  ...CURRENT_METAMODEL,
  label: 'Schemka ArchiMate 4 catalogue',
  metadata: {
    source: 'Current catalogue of 42 element identifiers and 11 base relationship names plus four nominal variants. Independent, unofficial Kalin Maldzhanski / Linked.Archi ArchiMate 4.0 draft ontology https://meta.linked.archi/archimate4/onto/ontology.ttl and notation https://meta.linked.archi/archimate4/notation/archimate4-notation.ttl, modified 2026-10-10, retrieved 2026-10-12. SHA-256: ontology 1df66d66b01bacc315499ffbf9d33be22a3858e9d5690352b653154b1728caf7; notation 9f75eef817d0665c9ad540b8bdd82c130214aa4254c4b8ebb12b36ef831938f1. Original neutral primitive descriptor adapters; UI notation is separate. No definitions, icons, SHACL, hierarchy, derivation or ontology code imported. A separate code-owned endpoint-type check covers all 42 current element endpoint types across all 15 relationship IDs, from reconciled independent visual transcriptions of owner-provided C260 table B.5 (printed 140-145/PDF 158-163), legend (139/157), and sections 5.1.2, 5.2.2, 5.2.4 and 5.8. Its source hash and locators are separate from this CC BY catalogue attribution. The 26460 reviewed element triples yield 26452 settled decisions and eight explicitly qualified source-scope UNKNOWN results for Product/Plateau aggregation/composition to Deliverable/WorkPackage. Unsupported queries and overall conformance remain UNKNOWN; group contents and instance containment are not assessed. Access variants and DirectedAssociation are nominal IDs, without accessType. Source hashes identify retrieved artifacts, not normative authority.',
    license: 'Attribution: Kalin Maldzhanski / Linked.Archi. Independent sources declare CC BY 4.0 https://creativecommons.org/licenses/by/4.0/. Notice https://meta.linked.archi/docs/TRADEMARKS/ retrieved 2026-10-12; SHA-256 dc835caa397437613d011e7dc03f0f17507c90d04d1b6390590be89263965fbf. Changes: bounded name selection, local identifiers, original code/labels and primitive adapters. No icons copied. This independent-source CC BY declaration does not apply to the owner-provided C260 artifact or its bounded technical checks. No source document, prose or graphics redistributed; no endorsement, certification, conformance or independently verified upstream rights claimed.',
    status: 'local',
  },
  elementTypes: CURRENT_CATALOG.elementTypes.map(id => ({ id, label: labels[id] || id, presentation: { adapter: 'box', token: 'neutral' } })),
  junctionTypes: ['AndJunction', 'OrJunction'].map(id => ({ id, label: id === 'AndJunction' ? 'And Junction' : 'Or Junction', presentation: { adapter: 'circle', token: 'neutral' } })),
  relationshipTypes: CURRENT_CATALOG.relationshipTypes.map(id => ({ id, label: labels[id] || id, presentation: { adapter: 'open-arrow', token: 'neutral' } })),
  rules: [],
});
