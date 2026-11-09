// Closed structural membership for the single current Schemka catalogue.
// Type names do not grant relationship permissions or normative conformance.
export const CURRENT_METAMODEL = Object.freeze({ id: 'schemka-archimate4', version: 2 });
export const CURRENT_CATALOG = Object.freeze({
  ...CURRENT_METAMODEL,
  elementTypes: Object.freeze(['Service', 'Process', 'Function', 'Event', 'Node', 'Device', 'SystemSoftware', 'CommunicationNetwork', 'Path', 'Collaboration', 'Role', 'ApplicationComponent', 'ApplicationInterface', 'DataObject', 'BusinessActor', 'BusinessInterface', 'BusinessObject', 'Product', 'TechnologyInterface', 'Equipment', 'Facility', 'DistributionNetwork', 'Artifact', 'Material', 'Grouping', 'Location', 'Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Value', 'Resource', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage', 'Deliverable', 'Plateau']),
  junctionTypes: Object.freeze(['AndJunction', 'OrJunction']),
  relationshipTypes: Object.freeze(['Realization', 'Association', 'Flow', 'Composition', 'Aggregation', 'Assignment', 'Serving', 'Access', 'Influence', 'Triggering', 'Specialization', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess', 'DirectedAssociation']),
});
