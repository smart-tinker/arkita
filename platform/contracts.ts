/** Future integration ports. Declarations only; no credentials in browser code. */
export interface Session { userId: string; displayName: string; }
export interface AuthProvider {
  readonly available: boolean;
  getSession(): Promise<Session | null>;
  signIn(): Promise<Session>;
  signOut(): Promise<void>;
}
export interface RepositoryRevision { repository: string; path: string; revision: string; }
export interface RepositoryProvider {
  readonly available: boolean;
  readFile(reference: RepositoryRevision): Promise<{ content: string; revision: string }>;
  /** Implementations must reject stale revisions; never silently overwrite another edit. */
  writeFile(reference: RepositoryRevision, content: string): Promise<RepositoryRevision>;
}
/** Explicit links, never guessed from a service name. */
export interface ModelBinding {
  serviceId: string;
  modelDocumentId: string;
  elementId: string | null;
  status: 'unresolved' | 'verified';
}

/** Current native data ports; runtime core/IO validation remains authoritative.
 * The shallow files envelope is version 1; its inner project is strictly v2.
 * These declarations do not authorize persistence, access changes or conversion.
 */
export interface NativeFile { path: string; content: string; }
export interface NativeProjectEnvelope {
  format: 'schemka-project-file';
  formatVersion: 1;
  files: NativeFile[];
}
export interface CurrentProject {
  format: 'schemka-project';
  formatVersion: 2;
  id: `prj-${string}`;
  name: string;
  metamodel: { id: 'schemka-archimate4'; version: 2 };
}
export type ConceptRef =
  | { kind: 'element'; id: `el-${string}` }
  | { kind: 'junction'; id: `jct-${string}` }
  | { kind: 'relationship'; id: `rel-${string}` };
export type OccurrenceConcept = Exclude<ConceptRef, { kind: 'relationship' }>;
export type ViewEndpoint =
  | { kind: 'occurrence'; id: `occ-${string}` }
  | { kind: 'connection'; id: `conn-${string}`; anchorId: `anc-${string}` };
export interface Point { x: number; y: number; }
export type RoutePoint =
  | { kind: 'bend'; point: Point }
  | { kind: 'anchor'; id: `anc-${string}`; point: Point };
export interface ModelElement {
  id: `el-${string}`; type: string; name: string;
  documentation: string; properties: Record<string, string>;
}
export interface ModelJunction {
  id: `jct-${string}`; type: 'AndJunction' | 'OrJunction'; name: string;
  documentation: string; properties: Record<string, string>;
}
export interface ModelRelationship {
  id: `rel-${string}`; type: string;
  source: ConceptRef; target: ConceptRef; label: string;
  properties: Record<string, string>;
  sourceMultiplicity?: string; targetMultiplicity?: string;
  /** Explicit local intent, never a semantic permission token. */
  junctionRole?: 'container';
}
export interface ViewOccurrence {
  id: `occ-${string}`; concept: OccurrenceConcept;
  bounds: Point & { width: number; height: number };
  parentOccurrenceId: null; zIndex: number;
}
export interface ViewConnection {
  id: `conn-${string}`; relationshipId: `rel-${string}`;
  source: ViewEndpoint; target: ViewEndpoint;
  routePoints: RoutePoint[]; labelPosition: Point | null;
}
export interface NativeProjectState {
  project: CurrentProject;
  elements: ModelElement[];
  junctions: ModelJunction[];
  relationships: ModelRelationship[];
  views: {
    view: { id: `view-${string}`; name: string; documentation: string };
    occurrences: ViewOccurrence[];
    connections: ViewConnection[];
  }[];
}
