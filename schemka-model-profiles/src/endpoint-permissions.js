import { CURRENT_CATALOG } from '../../schemka-model-core/src/current-catalog.js';
import { freeze } from './descriptor.js';

// Selected endpoint-type facts reconciled from two independent visual readings.
// Columns are sources; targets use this explicit order. No inference is done.
const types = ["Collaboration", "Event", "Function", "Grouping", "Location", "Path", "Process", "Role", "Service", "Assessment", "Driver", "Goal", "Meaning", "Outcome", "Principle", "Requirement", "Stakeholder", "Value", "Capability", "CourseOfAction", "Resource", "ValueStream", "BusinessActor", "BusinessInterface", "BusinessObject", "Product", "ApplicationComponent", "ApplicationInterface", "DataObject", "Artifact", "CommunicationNetwork", "Device", "DistributionNetwork", "Equipment", "Facility", "Material", "Node", "SystemSoftware", "TechnologyInterface", "Deliverable", "Plateau", "WorkPackage"];
const columns = [
  [140, "Assessment", "O O O Ogns O O O O O GNOS NO NO NO NO NO NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Driver", "O O O Ogns O O O O O NO GNOS NO NO NO NO NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Goal", "O O O Ogns O O O O O NO NO GNOS NO NO NO NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Meaning", "O O O Ogns O O O O O NO NO NO GNOS NO NO NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Outcome", "O O O Ognrs O O O O O NO NO NOR NO GNOS NO NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Principle", "O O O Ognrs O O O O O NO NO NOr NO NOR GNOS NO NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Requirement", "O O O Ognrs O O O O O NO NO NOr NO NOR NOR GNOS NO NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Stakeholder", "O O O Ogns O O O O O NO NO NO NO NO NO NO GNOS NO O O O O O O O O O O O O O O O O O O O O O O O O"],
  [140, "Value", "O O O Ogns O O O O O NO NO NO NO NO NO NO NO GNOS O O O O O O O O O O O O O O O O O O O O O O O O"],
  [141, "Capability", "O O O Ofgnrstv O O O O O On On Onr On Onr Onr NOR On On FGOSTV FORTV Oftv FOTV O O O O O O O O O O O O O O O O O O O O"],
  [141, "CourseOfAction", "O O O Ofgnrstv O O O O O On On Onr On NOR Onr NOR On On FOTV FGOSTV Oftv FOTV O O O O O O O O O O O O O O O O O O O O"],
  [141, "Resource", "O O O Ofginrstv O O O O O On On Onr On Onr Onr NOR On On IOftv IOfrtv GOSftv IOftv O O O O O O O O O O O O O O O O O O O O"],
  [141, "ValueStream", "O O O Ofgnrstv O O O O O On On Onr On Onr Onr NOR On On FOTV FORTV Oftv FGOSTV O O O O O O O O O O O O O O O O O O O O"],
  [142, "Collaboration", "GOSftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv GIOfrtv Ofirtv On On Onr On Onr Onr NOR Oin On Or Or OR Or GOfitv Ofgirtv Oai Oftv GOfrtv Ofgirtv Oai Oai Oftv GOfirtv Oftv GOfirtv GOfitv Oai GOfitv GOfirtv Ofgirtv O O Oi"],
  [142, "Event", "Oftv GOSftv FOTv Oafgnrstv Oftv Oftv FOTv Oftv FOTv On On Onr On Onr Onr NOR On On O O O O Oftv Oftv AO Oftv Oftv Oftv AO AO Oftv Oftv Oftv Oftv Oftv AO Oftv Oftv Oftv AO OT FOT"],
  [142, "Function", "Oftv FOTv FGOSTv Oafgnrstv Oftv Oftv FGOTv Oftv ORftv On On Onr On Onr Onr NOR On On OR OR O OR Oftv Oftv AO Oftv Oftv Oftv AO AO Oftv Oftv Oftv Oftv Oftv AO Oftv Oftv Oftv O O O"],
  [142, "Grouping", "GOfrstv GOfirstv GOfirstv GOSafinrtv GOfrstv GOfrstv GOfirstv GOfirstv GOfirstv GOns GOns GOnrs GOns GOnrs GOnrs GNORs GOinrs GOns GOfirstv GOfirstv GOfrstv GOfirstv GOfirstv GOfirstv GOairs GOfrstv GOfrstv GOfirstv GOairs GOairs GOfrstv GOfirstv GOfrstv GOfirstv GOfirstv GOairs GOfirstv GOfirstv GOfirstv GOars GOfrst GOfist"],
  [142, "Location", "GOftv GOfirtv GOfirtv GOafinrstv GOSftv GOfrtv GOfirtv GOfirtv GOfirtv GOn GOn GOnr GOn GOnr GOnr GNOR GOin GOn GOr GOr GOR GOr GOfitv GOfirtv GOai GOftv GOfrtv GOfirtv GOai GOai GOftv GOfirtv GOftv GOfirtv GOfitv GOai GOfitv GOfirtv GOfirtv GO GO GOi"],
  [142, "Path", "Oftv Oftv Oftv Oafgnrstv Oftv GORSftv Oftv Oftv Oftv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Oftv Oa Oftv Oftv Oftv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv Oftv O O O"],
  [142, "Process", "Oftv FOTv FGOTv Oafgnrstv Oftv Oftv FGOSTv Oftv ORftv On On Onr On Onr Onr NOR On On OR OR O OR Oftv Oftv AO Oftv Oftv Oftv AO AO Oftv Oftv Oftv Oftv Oftv AO Oftv Oftv Oftv O O O"],
  [142, "Role", "Oftv IOftv IOftv Oafginrstv Oftv ORftv IOftv GIOSftv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv GOfirtv Oa Oftv Oftv GOfirtv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv GOfitv O O IO"],
  [142, "Service", "OVft FOTv OVft Oafgnrstv Oftv OVft OVft OVft FGOSTv On On Onr On Onr Onr NOR On On OR OR O OR OVft OVft AO Oftv OVft OVft AO AO OVft OVft OVft OVft OVft AO OVft OVft OVft O O O"],
  [143, "BusinessActor", "Oftv Ofitv Ofitv Oafginrstv Oftv ORftv Ofitv IOftv Ofirtv On On Onr On Onr Onr NOR IOn On Or Or OR Or GOSftv GOfirtv IOa Oftv Oftv Ofirtv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv Ofitv O O Oi"],
  [143, "BusinessInterface", "Oftv Oftv Oftv Oafginrstv Oftv ORftv Oftv Oftv IOftv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv GOSftv Oa Oftv Oftv Oftv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv Oftv O O O"],
  [143, "BusinessObject", "O O O Ognrs O O O O O On On Onr On Onr Onr NOR On On Or Or OR Or O O GOS O O O O O O O O O O O O O O OS O O"],
  [143, "Product", "Oftv Ofrtv Ofrtv Oafgnrstv Oftv Ofrtv Ofrtv Ofrtv GOfrtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofrtv GOa GOSftv Ofrtv Ofrtv GOa GOa Oftv Ofrtv Oftv Ofrtv Oftv GOa Oftv Ofrtv Ofrtv O O O"],
  [143, "ApplicationComponent", "Oftv Ofitv Ofitv Oafginrstv Oftv ORftv Ofitv IOftv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofirtv Oa Oftv GOSftv GOfirtv IOa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv Ofitv O O Oi"],
  [143, "ApplicationInterface", "Oftv Oftv Oftv Oafginrstv Oftv ORftv Oftv Oftv IOfrtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv ORftv Oa Oftv Oftv GOSftv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv Oftv O O O"],
  [143, "DataObject", "O O O Ognrs O O O O O On On Onr On Onr Onr NOR On On Or Or OR Or O O OR O O O GOS O O O O O O O O O O OS O O"],
  [144, "Artifact", "O Or Or Ognrs O Or Or Or Or On On Onr On Onr Onr NOR On On Or Or OR Or O Or OSr O OR Or ORS GOSr O OR O O O OS O OR Or OS O O"],
  [144, "CommunicationNetwork", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv Ofirtv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofirtv Oa Oftv Ofrtv Ofirtv Oa Oai GOSftv GOfrtv Oftv Oftv Oftv Oa Oftv GOfirtv Ofgirtv O O Oi"],
  [144, "Device", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv IOfrtv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofirtv Oa Oftv Ofrtv Ofirtv Oa IOa Oftv GOSfrtv Oftv Oftv Oftv Oa Oftv IOfrtv GOfirtv O O Oi"],
  [144, "DistributionNetwork", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv Ofirtv Ofirtv On On Onr On Onr Onr NOR Oin On Or Or OR Or GOfitv Ofgirtv Oai Oftv Ofrtv Ofirtv Oa Oai Oftv Ofgirtv GOSftv GOfirtv GOfitv Oai Ofgitv Ofgirtv Ofgirtv O O Oi"],
  [144, "Equipment", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv IOfrtv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofirtv Oa Oftv Ofrtv Ofirtv Oa Oai Oftv GOfrtv Oftv GOSfrtv Oftv IOa Oftv Ofirtv GOfirtv O O Oi"],
  [144, "Facility", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv IOfrtv Ofirtv On On Onr On Onr Onr NOR Oin On Or Or OR Or IOftv Ofirtv Oai Oftv Ofrtv Ofirtv Oa Oai Oftv Ofgirtv Oftv GOfirtv GOSfitv Oai GIOftv Ofgirtv GOfirtv O O Oi"],
  [144, "Material", "O Or Or Ognrs O Or Or Or Or On On Onr On Onr Onr NOR On On Or Or OR Or O Or ORS O Or Or OSr OSr O OR O OR O GOSr O Or Or OS O O"],
  [144, "Node", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv IOfrtv Ofirtv On On Onr On Onr Onr NOR Oin On Or Or OR Or Ofitv Ofirtv Oai Oftv Ofrtv Ofirtv Oa Oai Oftv GOfirtv Oftv GOfirtv GOfitv Oai GOSfitv GOfirtv GOfirtv O O Oi"],
  [144, "SystemSoftware", "Oftv Ofirtv Ofirtv Oafginrstv Oftv ORftv Ofirtv IOfrtv Ofirtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofirtv Oa Oftv Ofrtv Ofirtv Oa IOa Oftv Ofrtv Oftv Oftv Oftv Oa Oftv GIOSfrtv GOfirtv O O Oi"],
  [144, "TechnologyInterface", "Oftv Oftv Oftv Oafginrstv Oftv ORftv Oftv Oftv IOfrtv On On Onr On Onr Onr NOR On On Or Or OR Or Oftv Ofrtv Oa Oftv Oftv ORftv Oa Oa Oftv Oftv Oftv Oftv Oftv Oa Oftv Oftv GOSftv O O O"],
  [145, "Deliverable", "OR OR OR Ognrs OR OR OR OR OR On On Onr On Onr Onr NOR Onr On OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR GOS OR O"],
  [145, "Plateau", "GOR GORT GOR Oafginrst GOR GOR GOR GOR GOR On On GOnr On GOnr Onr GNOR Oinr On GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR GOR Oa GOSTf Oft"],
  [145, "WorkPackage", "OR FORT OR Oafgnrst OR OR OR OR OR On On Onr On Onr Onr NOR Onr On OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR OR AOR Ofrt FGOST"],
];
const cells = new Map(columns.map(([printedPage, source, raw]) => [source, {
  printedPage, targets: new Map(raw.split(' ').map((value, index) => [types[index], value])),
}]));
const letters = new Map([
  ['Access', 'a'], ['ReadAccess', 'a'], ['WriteAccess', 'a'], ['ReadWriteAccess', 'a'],
  ['Flow', 'f'], ['Aggregation', 'g'], ['Composition', 'g'], ['Assignment', 'i'],
  ['Influence', 'n'], ['Association', 'o'], ['DirectedAssociation', 'o'], ['Realization', 'r'],
  ['Specialization', 's'], ['Triggering', 't'], ['Serving', 'v'],
]);
// The raw table cells stay unchanged. Only these exact eight decisions remain
// unresolved because the scoped composite wording has not been reconciled.
const unresolvedPairs = new Set(['Product/Deliverable', 'Product/WorkPackage', 'Plateau/Deliverable', 'Plateau/WorkPackage']);
const isSourceUnresolved = (source, relationship, target) =>
  (relationship === 'Aggregation' || relationship === 'Composition') && unresolvedPairs.has(`${source}/${target}`);
const compositeQualification = {
  id: 'composite-aggregation-scope',
  reason: 'source-scope-unresolved',
  issue: 'B.5 omits G/g for this exact pair. Generic composite wording in section 12.4 and the specific Product/Plateau qualification in B.4 leave the applicable scope unresolved. This is an interpretation ambiguity, not a claim that the standard contradicts itself.',
  locators: [
    { section: '12.4', printedPage: 104, pdfPage: 122 },
    { section: 'B.4', printedPage: 139, pdfPage: 157 },
  ],
  resolution: "Remove a qualified UNKNOWN only after authoritative source evidence (an official clarification, applicable erratum, or verified updated specification) explicitly settles Product/Plateau aggregation eligibility for that target. Independently review and record exact publication/hash/locators, preserve raw facts, update the per-triple disposition and regression tests. Do not infer resolution from another tool, a generic sentence, or a guessed precedence rule.",
};
// Counts come from actual checked entries and scoped dispositions, not a square
// inferred from the presence of type names in the catalogue.
const sources = new Set(cells.keys());
const targets = new Set([...cells.values()].flatMap(column => [...column.targets.keys()]));
const verifiedPairCount = [...cells.values()].reduce((total, column) => total + column.targets.size, 0);
const reviewedTripleCount = verifiedPairCount * letters.size;
const sourceUnresolvedTripleCount = [...cells].reduce((total, [source, column]) => total +
  [...column.targets.keys()].reduce((count, target) => count +
    [...letters.keys()].filter(relationship => isSourceUnresolved(source, relationship, target)).length, 0), 0);
const verifiedTripleCount = reviewedTripleCount - sourceUnresolvedTripleCount;
const totalTripleCount = CURRENT_CATALOG.elementTypes.length ** 2 * CURRENT_CATALOG.relationshipTypes.length;
export const endpointCoverage = freeze({
  sourceTypeIds: CURRENT_CATALOG.elementTypes.filter(type => sources.has(type)),
  targetTypeIds: CURRENT_CATALOG.elementTypes.filter(type => targets.has(type)),
  relationshipTypeIds: CURRENT_CATALOG.relationshipTypes.filter(type => letters.has(type)),
  excludedTypeIds: CURRENT_CATALOG.elementTypes.filter(type => !sources.has(type) && !targets.has(type)),
  verifiedPairCount, reviewedTripleCount, verifiedTripleCount, sourceUnresolvedTripleCount, unknownTripleCount: totalTripleCount - verifiedTripleCount, totalTripleCount,
});

const families = new Map([
  ['Access', { baseRelationship: 'Access', section: '5.2.2', printedPage: 38, pdfPage: 56 }],
  ['Association', { baseRelationship: 'Association', section: '5.2.4', printedPage: 40, pdfPage: 58 }],
  ['Composition', { baseRelationship: 'Composition', section: '5.1.2', printedPage: 31, pdfPage: 49 }],
]);
const derivedAssertion = { section: '5.8', printedPages: [49, 50], pdfPages: [67, 68] };

/** Internal data lookup; the public evaluator separately establishes authority. */
export function endpointDecision(query) {
  const column = cells.get(query.sourceType);
  const raw = column?.targets.get(query.targetType), letter = letters.get(query.relationshipType);
  if (raw === undefined || letter === undefined) return null;
  const upper = letter.toUpperCase();
  const matchedLetter = raw.includes(upper) ? upper : raw.includes(letter) ? letter : null;
  const permissionClass = matchedLetter === null ? null : matchedLetter === upper ? 'direct' : 'derived';
  const classification = permissionClass || 'not-listed';
  const unresolved = isSourceUnresolved(query.sourceType, query.relationshipType, query.targetType);
  const familyType = letter === 'a' ? 'Access' : letter === 'o' ? 'Association' : query.relationshipType;
  return freeze({
    status: unresolved ? 'UNKNOWN' : matchedLetter === null ? 'FORBIDDEN' : 'ALLOWED',
    permissionClass: unresolved ? null : permissionClass,
    reason: unresolved ? 'source-scope-unresolved' : permissionClass ? `verified-table-${permissionClass}` : 'verified-table-forbidden',
    ruleId: `am4-b5-${query.sourceType}-${query.relationshipType}-${query.targetType}`,
    sourceEvidence: {
      id: 'archimate4-endpoint-types-b5', publication: 'C260',
      sha256: 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093',
      matrix: { section: 'B.5', printedPage: column.printedPage, pdfPage: column.printedPage + 18 },
      cell: { sourceType: query.sourceType, relationshipType: query.relationshipType, targetType: query.targetType,
        letters: raw, relationshipLetter: letter, matchedLetter, classification },
      legend: { printedPage: 139, pdfPage: 157 },
      family: families.get(familyType) || null,
      derivedAssertion: permissionClass === 'derived' ? derivedAssertion : null,
      ...(unresolved ? { qualification: compositeQualification } : {}),
    },
  });
}
