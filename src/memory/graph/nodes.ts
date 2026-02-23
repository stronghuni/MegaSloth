/**
 * Graph Memory Nodes (inspired by Graphiti)
 * Entity-centric architecture for agent memory
 */

export type EntityType =
  | 'repository'
  | 'user'
  | 'pull_request'
  | 'issue'
  | 'branch'
  | 'commit'
  | 'file'
  | 'concept'
  | 'error'
  | 'decision';

export type EpisodeSource =
  | 'user_message'
  | 'assistant_message'
  | 'tool_output'
  | 'webhook_event'
  | 'system';

/**
 * Episode Node - Records raw events/messages (episodic memory)
 * Forms the ground truth corpus
 */
export interface EpisodeNode {
  id: string;
  content: string;
  source: EpisodeSource;
  sourceDescription: string;
  validAt: Date;  // When the event occurred
  createdAt: Date; // When it was recorded
  groupId?: string; // For multi-tenancy
  metadata?: Record<string, unknown>;
}

/**
 * Entity Node - Extracted, deduplicated entities (semantic memory)
 */
export interface EntityNode {
  id: string;
  name: string;
  type: EntityType;
  summary: string;
  attributes: Record<string, unknown>;
  labels: string[];
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
  groupId?: string;
}

/**
 * Community Node - Clusters of related entities
 */
export interface CommunityNode {
  id: string;
  name: string;
  summary: string;
  memberCount: number;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
  groupId?: string;
}

/**
 * Create a new episode node
 */
export function createEpisodeNode(
  content: string,
  source: EpisodeSource,
  sourceDescription: string,
  options: {
    validAt?: Date;
    groupId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): EpisodeNode {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    content,
    source,
    sourceDescription,
    validAt: options.validAt ?? now,
    createdAt: now,
    groupId: options.groupId,
    metadata: options.metadata,
  };
}

/**
 * Create a new entity node
 */
export function createEntityNode(
  name: string,
  type: EntityType,
  summary: string,
  options: {
    attributes?: Record<string, unknown>;
    labels?: string[];
    groupId?: string;
  } = {}
): EntityNode {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name,
    type,
    summary,
    attributes: options.attributes ?? {},
    labels: options.labels ?? [],
    createdAt: now,
    updatedAt: now,
    groupId: options.groupId,
  };
}

/**
 * Create a new community node
 */
export function createCommunityNode(
  name: string,
  summary: string,
  memberCount: number,
  options: {
    groupId?: string;
  } = {}
): CommunityNode {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name,
    summary,
    memberCount,
    createdAt: now,
    updatedAt: now,
    groupId: options.groupId,
  };
}

/**
 * Normalize entity name for deduplication
 */
export function normalizeEntityName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Check if two entities might be the same
 */
export function entitiesMightMatch(a: EntityNode, b: EntityNode): boolean {
  if (a.type !== b.type) return false;

  const normalizedA = normalizeEntityName(a.name);
  const normalizedB = normalizeEntityName(b.name);

  return normalizedA === normalizedB;
}
