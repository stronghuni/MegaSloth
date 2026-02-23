/**
 * Graph Memory Store
 * Persistent storage for graph-based memory
 */

import { type Database } from 'better-sqlite3';
import {
  type EpisodeNode,
  type EntityNode,
  type CommunityNode,
  createEpisodeNode,
  createEntityNode,
  entitiesMightMatch,
} from './nodes.js';
import {
  type EpisodicEdge,
  type EntityEdge,
  type CommunityEdge,
  createEpisodicEdge,
  createEntityEdge,
  isFactValid,
  factsContradict,
  resolveContradiction,
  type RelationType,
} from './edges.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('graph-store');

export interface GraphStoreConfig {
  db: Database;
  groupId?: string;
}

export interface SearchResult {
  entities: EntityNode[];
  edges: EntityEdge[];
  episodes: EpisodeNode[];
  score: number;
}

export class GraphStore {
  private db: Database;
  private defaultGroupId: string | undefined;

  constructor(config: GraphStoreConfig) {
    this.db = config.db;
    this.defaultGroupId = config.groupId;
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      -- Episodes (raw events)
      CREATE TABLE IF NOT EXISTS graph_episodes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        source_description TEXT NOT NULL,
        valid_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        group_id TEXT,
        metadata TEXT
      );

      -- Entities (extracted concepts)
      CREATE TABLE IF NOT EXISTS graph_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        attributes TEXT NOT NULL DEFAULT '{}',
        labels TEXT NOT NULL DEFAULT '[]',
        embedding BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        group_id TEXT
      );

      -- Communities (entity clusters)
      CREATE TABLE IF NOT EXISTS graph_communities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        summary TEXT NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 0,
        embedding BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        group_id TEXT
      );

      -- Episodic edges (episode -> entity)
      CREATE TABLE IF NOT EXISTS graph_episodic_edges (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL REFERENCES graph_episodes(id),
        entity_id TEXT NOT NULL REFERENCES graph_entities(id),
        mention_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL
      );

      -- Entity edges (entity -> entity with facts)
      CREATE TABLE IF NOT EXISTS graph_entity_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES graph_entities(id),
        target_id TEXT NOT NULL REFERENCES graph_entities(id),
        relation TEXT NOT NULL,
        fact TEXT NOT NULL,
        valid_at TEXT NOT NULL,
        invalid_at TEXT,
        created_at TEXT NOT NULL,
        expired_at TEXT,
        confidence REAL NOT NULL DEFAULT 1.0,
        episode_ids TEXT NOT NULL DEFAULT '[]',
        embedding BLOB,
        group_id TEXT
      );

      -- Community edges (community -> entity)
      CREATE TABLE IF NOT EXISTS graph_community_edges (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL REFERENCES graph_communities(id),
        entity_id TEXT NOT NULL REFERENCES graph_entities(id),
        weight REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_episodes_group ON graph_episodes(group_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_valid_at ON graph_episodes(valid_at);
      CREATE INDEX IF NOT EXISTS idx_entities_group ON graph_entities(group_id);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON graph_entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON graph_entities(name);
      CREATE INDEX IF NOT EXISTS idx_entity_edges_source ON graph_entity_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_entity_edges_target ON graph_entity_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_entity_edges_valid ON graph_entity_edges(valid_at, invalid_at);
    `);
  }

  // Episode operations

  addEpisode(
    content: string,
    source: EpisodeNode['source'],
    sourceDescription: string,
    options: { validAt?: Date; metadata?: Record<string, unknown> } = {}
  ): EpisodeNode {
    const episode = createEpisodeNode(content, source, sourceDescription, {
      ...options,
      groupId: this.defaultGroupId,
    });

    this.db.prepare(`
      INSERT INTO graph_episodes (id, content, source, source_description, valid_at, created_at, group_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episode.id,
      episode.content,
      episode.source,
      episode.sourceDescription,
      episode.validAt.toISOString(),
      episode.createdAt.toISOString(),
      episode.groupId,
      JSON.stringify(episode.metadata ?? {})
    );

    logger.debug({ episodeId: episode.id, source }, 'Added episode');
    return episode;
  }

  getEpisode(id: string): EpisodeNode | null {
    const row = this.db.prepare('SELECT * FROM graph_episodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEpisode(row) : null;
  }

  getRecentEpisodes(limit: number = 100): EpisodeNode[] {
    const rows = this.db.prepare(`
      SELECT * FROM graph_episodes
      WHERE group_id = ? OR group_id IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.defaultGroupId, limit) as Record<string, unknown>[];
    return rows.map(this.rowToEpisode);
  }

  // Entity operations

  addEntity(
    name: string,
    type: EntityNode['type'],
    summary: string,
    options: { attributes?: Record<string, unknown>; labels?: string[] } = {}
  ): EntityNode {
    // Check for existing entity with same name and type
    const existing = this.findEntityByName(name, type);
    if (existing) {
      // Update existing entity
      return this.updateEntity(existing.id, { summary, ...options });
    }

    const entity = createEntityNode(name, type, summary, {
      ...options,
      groupId: this.defaultGroupId,
    });

    this.db.prepare(`
      INSERT INTO graph_entities (id, name, type, summary, attributes, labels, created_at, updated_at, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entity.id,
      entity.name,
      entity.type,
      entity.summary,
      JSON.stringify(entity.attributes),
      JSON.stringify(entity.labels),
      entity.createdAt.toISOString(),
      entity.updatedAt.toISOString(),
      entity.groupId
    );

    logger.debug({ entityId: entity.id, name, type }, 'Added entity');
    return entity;
  }

  updateEntity(
    id: string,
    updates: Partial<Pick<EntityNode, 'summary' | 'attributes' | 'labels'>>
  ): EntityNode {
    const existing = this.getEntity(id);
    if (!existing) {
      throw new Error(`Entity not found: ${id}`);
    }

    const updated: EntityNode = {
      ...existing,
      summary: updates.summary ?? existing.summary,
      attributes: { ...existing.attributes, ...updates.attributes },
      labels: updates.labels ?? existing.labels,
      updatedAt: new Date(),
    };

    this.db.prepare(`
      UPDATE graph_entities
      SET summary = ?, attributes = ?, labels = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.summary,
      JSON.stringify(updated.attributes),
      JSON.stringify(updated.labels),
      updated.updatedAt.toISOString(),
      id
    );

    return updated;
  }

  getEntity(id: string): EntityNode | null {
    const row = this.db.prepare('SELECT * FROM graph_entities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  findEntityByName(name: string, type?: EntityNode['type']): EntityNode | null {
    let sql = 'SELECT * FROM graph_entities WHERE LOWER(name) = LOWER(?)';
    const params: unknown[] = [name];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (this.defaultGroupId) {
      sql += ' AND (group_id = ? OR group_id IS NULL)';
      params.push(this.defaultGroupId);
    }

    const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  // Edge operations

  addFact(
    sourceId: string,
    targetId: string,
    relation: RelationType,
    fact: string,
    episodeIds: string[],
    options: { validAt?: Date; confidence?: number } = {}
  ): EntityEdge {
    // Check for contradictions
    const existingFacts = this.getFactsBetween(sourceId, targetId, relation);
    const newEdge = createEntityEdge(sourceId, targetId, relation, fact, episodeIds, {
      ...options,
      groupId: this.defaultGroupId,
    });

    for (const existing of existingFacts) {
      if (factsContradict(existing, newEdge)) {
        const { existing: updated } = resolveContradiction(existing, newEdge);
        this.invalidateEdge(updated.id, updated.invalidAt!);
        logger.info({ existingFact: existing.fact, newFact: fact }, 'Resolved contradiction');
      }
    }

    this.db.prepare(`
      INSERT INTO graph_entity_edges
      (id, source_id, target_id, relation, fact, valid_at, created_at, confidence, episode_ids, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newEdge.id,
      newEdge.sourceId,
      newEdge.targetId,
      newEdge.relation,
      newEdge.fact,
      newEdge.validAt.toISOString(),
      newEdge.createdAt.toISOString(),
      newEdge.confidence,
      JSON.stringify(newEdge.episodeIds),
      newEdge.groupId
    );

    return newEdge;
  }

  private invalidateEdge(id: string, invalidAt: Date): void {
    this.db.prepare(`
      UPDATE graph_entity_edges
      SET invalid_at = ?, expired_at = ?
      WHERE id = ?
    `).run(invalidAt.toISOString(), new Date().toISOString(), id);
  }

  getFactsBetween(sourceId: string, targetId: string, relation?: RelationType): EntityEdge[] {
    let sql = 'SELECT * FROM graph_entity_edges WHERE source_id = ? AND target_id = ?';
    const params: unknown[] = [sourceId, targetId];

    if (relation) {
      sql += ' AND relation = ?';
      params.push(relation);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(this.rowToEntityEdge);
  }

  getValidFactsForEntity(entityId: string, asOf: Date = new Date()): EntityEdge[] {
    const rows = this.db.prepare(`
      SELECT * FROM graph_entity_edges
      WHERE (source_id = ? OR target_id = ?)
        AND valid_at <= ?
        AND (invalid_at IS NULL OR invalid_at > ?)
    `).all(entityId, entityId, asOf.toISOString(), asOf.toISOString()) as Record<string, unknown>[];
    return rows.map(this.rowToEntityEdge);
  }

  linkEpisodeToEntity(episodeId: string, entityId: string, mentionType: 'explicit' | 'implicit' | 'inferred' = 'explicit'): EpisodicEdge {
    const edge = createEpisodicEdge(episodeId, entityId, mentionType);

    this.db.prepare(`
      INSERT INTO graph_episodic_edges (id, episode_id, entity_id, mention_type, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(edge.id, edge.episodeId, edge.entityId, edge.mentionType, edge.confidence, edge.createdAt.toISOString());

    return edge;
  }

  // Search operations

  searchEntities(query: string, limit: number = 10): EntityNode[] {
    // Simple text search (can be enhanced with embeddings later)
    const rows = this.db.prepare(`
      SELECT * FROM graph_entities
      WHERE (name LIKE ? OR summary LIKE ?)
        AND (group_id = ? OR group_id IS NULL)
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, this.defaultGroupId, limit) as Record<string, unknown>[];
    return rows.map(this.rowToEntity);
  }

  getRelatedEntities(entityId: string, limit: number = 20): EntityNode[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT e.* FROM graph_entities e
      JOIN graph_entity_edges ee ON (e.id = ee.target_id OR e.id = ee.source_id)
      WHERE (ee.source_id = ? OR ee.target_id = ?)
        AND e.id != ?
        AND (ee.invalid_at IS NULL)
      ORDER BY e.updated_at DESC
      LIMIT ?
    `).all(entityId, entityId, entityId, limit) as Record<string, unknown>[];
    return rows.map(this.rowToEntity);
  }

  // Utility methods

  private rowToEpisode(row: Record<string, unknown>): EpisodeNode {
    return {
      id: row.id as string,
      content: row.content as string,
      source: row.source as EpisodeNode['source'],
      sourceDescription: row.source_description as string,
      validAt: new Date(row.valid_at as string),
      createdAt: new Date(row.created_at as string),
      groupId: row.group_id as string | undefined,
      metadata: JSON.parse((row.metadata as string) || '{}'),
    };
  }

  private rowToEntity(row: Record<string, unknown>): EntityNode {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as EntityNode['type'],
      summary: row.summary as string,
      attributes: JSON.parse((row.attributes as string) || '{}'),
      labels: JSON.parse((row.labels as string) || '[]'),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      groupId: row.group_id as string | undefined,
    };
  }

  private rowToEntityEdge(row: Record<string, unknown>): EntityEdge {
    return {
      id: row.id as string,
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      relation: row.relation as RelationType,
      fact: row.fact as string,
      validAt: new Date(row.valid_at as string),
      invalidAt: row.invalid_at ? new Date(row.invalid_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      expiredAt: row.expired_at ? new Date(row.expired_at as string) : undefined,
      confidence: row.confidence as number,
      episodeIds: JSON.parse((row.episode_ids as string) || '[]'),
      groupId: row.group_id as string | undefined,
    };
  }

  // Clear operations

  clearGroup(groupId: string): void {
    this.db.exec(`
      DELETE FROM graph_episodic_edges WHERE episode_id IN (SELECT id FROM graph_episodes WHERE group_id = '${groupId}');
      DELETE FROM graph_entity_edges WHERE group_id = '${groupId}';
      DELETE FROM graph_community_edges WHERE community_id IN (SELECT id FROM graph_communities WHERE group_id = '${groupId}');
      DELETE FROM graph_episodes WHERE group_id = '${groupId}';
      DELETE FROM graph_entities WHERE group_id = '${groupId}';
      DELETE FROM graph_communities WHERE group_id = '${groupId}';
    `);
    logger.info({ groupId }, 'Cleared graph data for group');
  }
}
