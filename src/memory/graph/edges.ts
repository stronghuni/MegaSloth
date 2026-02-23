/**
 * Graph Memory Edges (inspired by Graphiti)
 * Relationships between entities with temporal tracking
 */

export type EdgeType =
  | 'episodic' // Episode → Entity (MENTIONS)
  | 'semantic' // Entity → Entity (relationship)
  | 'community'; // Community → Entity (HAS_MEMBER)

export type RelationType =
  | 'created_by'
  | 'modified_by'
  | 'reviewed_by'
  | 'assigned_to'
  | 'references'
  | 'depends_on'
  | 'blocks'
  | 'fixes'
  | 'related_to'
  | 'part_of'
  | 'contains'
  | 'implements'
  | 'caused_by'
  | 'resolved_by';

/**
 * Episodic Edge - Links episodes to entities (MENTIONS relationship)
 */
export interface EpisodicEdge {
  id: string;
  episodeId: string;
  entityId: string;
  mentionType: 'explicit' | 'implicit' | 'inferred';
  confidence: number;
  createdAt: Date;
}

/**
 * Entity Edge - Facts/relationships between entities
 * Implements bi-temporal model for historical tracking
 */
export interface EntityEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: RelationType;
  fact: string; // Human-readable description of the fact

  // Bi-temporal tracking
  validAt: Date;     // When the fact became true (event time)
  invalidAt?: Date;  // When the fact ceased to be true
  createdAt: Date;   // When the fact was recorded (system time)
  expiredAt?: Date;  // When the fact was invalidated in system

  confidence: number;
  episodeIds: string[]; // Source episodes for this fact
  embedding?: number[];
  groupId?: string;
}

/**
 * Community Edge - Links communities to member entities
 */
export interface CommunityEdge {
  id: string;
  communityId: string;
  entityId: string;
  weight: number;
  createdAt: Date;
}

/**
 * Create an episodic edge
 */
export function createEpisodicEdge(
  episodeId: string,
  entityId: string,
  mentionType: 'explicit' | 'implicit' | 'inferred' = 'explicit',
  confidence: number = 1.0
): EpisodicEdge {
  return {
    id: crypto.randomUUID(),
    episodeId,
    entityId,
    mentionType,
    confidence,
    createdAt: new Date(),
  };
}

/**
 * Create an entity edge (fact)
 */
export function createEntityEdge(
  sourceId: string,
  targetId: string,
  relation: RelationType,
  fact: string,
  episodeIds: string[],
  options: {
    validAt?: Date;
    confidence?: number;
    groupId?: string;
  } = {}
): EntityEdge {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    sourceId,
    targetId,
    relation,
    fact,
    validAt: options.validAt ?? now,
    createdAt: now,
    confidence: options.confidence ?? 1.0,
    episodeIds,
    groupId: options.groupId,
  };
}

/**
 * Create a community edge
 */
export function createCommunityEdge(
  communityId: string,
  entityId: string,
  weight: number = 1.0
): CommunityEdge {
  return {
    id: crypto.randomUUID(),
    communityId,
    entityId,
    weight,
    createdAt: new Date(),
  };
}

/**
 * Invalidate a fact (mark as no longer true)
 */
export function invalidateFact(
  edge: EntityEdge,
  invalidAt: Date = new Date()
): EntityEdge {
  return {
    ...edge,
    invalidAt,
    expiredAt: new Date(),
  };
}

/**
 * Check if a fact is currently valid
 */
export function isFactValid(edge: EntityEdge, asOf: Date = new Date()): boolean {
  if (edge.validAt > asOf) return false;
  if (edge.invalidAt && edge.invalidAt <= asOf) return false;
  return true;
}

/**
 * Check if two facts contradict each other
 * Facts contradict if they have the same source, target, and relation
 * but different conclusions
 */
export function factsContradict(a: EntityEdge, b: EntityEdge): boolean {
  // Same relationship direction
  const sameDirection =
    a.sourceId === b.sourceId &&
    a.targetId === b.targetId &&
    a.relation === b.relation;

  // Different facts
  const differentFacts = a.fact !== b.fact;

  // Overlapping validity periods
  const periodsOverlap =
    isFactValid(a) && isFactValid(b);

  return sameDirection && differentFacts && periodsOverlap;
}

/**
 * Resolve contradiction by invalidating older fact
 */
export function resolveContradiction(
  existing: EntityEdge,
  newer: EntityEdge
): { existing: EntityEdge; newer: EntityEdge } {
  if (existing.validAt < newer.validAt) {
    // Invalidate existing fact at the point new fact became valid
    return {
      existing: invalidateFact(existing, newer.validAt),
      newer,
    };
  } else {
    // Invalidate newer fact at the point existing fact became valid
    return {
      existing,
      newer: invalidateFact(newer, existing.validAt),
    };
  }
}
