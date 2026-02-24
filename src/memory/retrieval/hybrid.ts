/**
 * Hybrid Retrieval System
 * Combines recent context with relevant graph memory
 */

import { type GraphStore } from '../graph/store.js';
import { type EntityNode, type EpisodeNode } from '../graph/nodes.js';
import { type EntityEdge } from '../graph/edges.js';
import { type EntityExtractor } from '../extraction/entity.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('hybrid-retrieval');

export interface RetrievalContext {
  // Recent episodes (chronological context)
  recentEpisodes: EpisodeNode[];

  // Relevant entities (semantic context)
  relevantEntities: EntityNode[];

  // Active facts (relationship context)
  activeFacts: EntityEdge[];

  // Formatted context string for prompt
  formattedContext: string;
}

export interface RetrievalConfig {
  /** Number of recent episodes to include */
  recentEpisodeCount: number;

  /** Number of relevant entities to fetch */
  maxRelevantEntities: number;

  /** Number of facts per entity to include */
  factsPerEntity: number;

  /** Whether to extract entities from query */
  extractFromQuery: boolean;
}

const DEFAULT_CONFIG: RetrievalConfig = {
  recentEpisodeCount: 10,
  maxRelevantEntities: 5,
  factsPerEntity: 3,
  extractFromQuery: true,
};

export class HybridRetriever {
  private graphStore: GraphStore;
  private entityExtractor: EntityExtractor;
  private config: RetrievalConfig;

  constructor(
    graphStore: GraphStore,
    entityExtractor: EntityExtractor,
    config: Partial<RetrievalConfig> = {}
  ) {
    this.graphStore = graphStore;
    this.entityExtractor = entityExtractor;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Retrieve context for a query
   */
  async retrieve(query: string): Promise<RetrievalContext> {
    logger.debug({ query: query.substring(0, 100) }, 'Starting hybrid retrieval');

    // 1. Get recent episodes (chronological context)
    const recentEpisodes = this.graphStore.getRecentEpisodes(
      this.config.recentEpisodeCount
    );

    // 2. Extract entities from query if enabled
    let queryEntities: string[] = [];
    if (this.config.extractFromQuery) {
      const extracted = await this.entityExtractor.extract(query);
      queryEntities = extracted.entities.map((e) => e.name);
    }

    // 3. Search for relevant entities
    const relevantEntities = await this.findRelevantEntities(query, queryEntities);

    // 4. Get active facts for relevant entities
    const activeFacts = this.getFactsForEntities(relevantEntities);

    // 5. Format context
    const formattedContext = this.formatContext(
      recentEpisodes,
      relevantEntities,
      activeFacts
    );

    const result: RetrievalContext = {
      recentEpisodes,
      relevantEntities,
      activeFacts,
      formattedContext,
    };

    logger.info({
      recentEpisodes: recentEpisodes.length,
      relevantEntities: relevantEntities.length,
      activeFacts: activeFacts.length,
      contextLength: formattedContext.length,
    }, 'Hybrid retrieval completed');

    return result;
  }

  /**
   * Find entities relevant to the query
   */
  private async findRelevantEntities(
    query: string,
    extractedNames: string[]
  ): Promise<EntityNode[]> {
    const entities: EntityNode[] = [];
    const seen = new Set<string>();

    // 1. First, look up extracted entity names
    for (const name of extractedNames) {
      const entity = this.graphStore.findEntityByName(name);
      if (entity && !seen.has(entity.id)) {
        entities.push(entity);
        seen.add(entity.id);
      }
    }

    // 2. Text search for additional entities
    const searchResults = this.graphStore.searchEntities(
      query,
      this.config.maxRelevantEntities
    );

    for (const entity of searchResults) {
      if (!seen.has(entity.id)) {
        entities.push(entity);
        seen.add(entity.id);
      }
    }

    // 3. Get related entities for found entities
    for (const entity of [...entities]) {
      if (entities.length >= this.config.maxRelevantEntities) break;

      const related = this.graphStore.getRelatedEntities(entity.id, 3);
      for (const relatedEntity of related) {
        if (!seen.has(relatedEntity.id)) {
          entities.push(relatedEntity);
          seen.add(relatedEntity.id);
          if (entities.length >= this.config.maxRelevantEntities) break;
        }
      }
    }

    return entities.slice(0, this.config.maxRelevantEntities);
  }

  /**
   * Get active facts for a set of entities
   */
  private getFactsForEntities(entities: EntityNode[]): EntityEdge[] {
    const facts: EntityEdge[] = [];
    const seen = new Set<string>();

    for (const entity of entities) {
      const entityFacts = this.graphStore.getValidFactsForEntity(entity.id);

      for (const fact of entityFacts) {
        if (!seen.has(fact.id) && facts.length < entities.length * this.config.factsPerEntity) {
          facts.push(fact);
          seen.add(fact.id);
        }
      }
    }

    return facts;
  }

  /**
   * Format context for inclusion in prompt
   */
  private formatContext(
    episodes: EpisodeNode[],
    entities: EntityNode[],
    facts: EntityEdge[]
  ): string {
    const sections: string[] = [];

    // Recent conversation context
    if (episodes.length > 0) {
      sections.push('## Recent Conversation\n');
      for (const episode of episodes.slice(-5)) {
        const time = episode.validAt.toISOString().split('T')[0];
        sections.push(`[${time}] ${episode.source}: ${episode.content.substring(0, 200)}...`);
      }
    }

    // Relevant entities
    if (entities.length > 0) {
      sections.push('\n## Relevant Context\n');
      for (const entity of entities) {
        sections.push(`**${entity.name}** (${entity.type}): ${entity.summary}`);
      }
    }

    // Active facts/relationships
    if (facts.length > 0) {
      sections.push('\n## Known Facts\n');
      for (const fact of facts) {
        sections.push(`- ${fact.fact}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Add new information to the graph
   */
  async ingestEpisode(
    content: string,
    source: EpisodeNode['source'],
    sourceDescription: string
  ): Promise<void> {
    // 1. Store episode
    const episode = this.graphStore.addEpisode(content, source, sourceDescription);

    // 2. Extract entities and relations
    const extracted = await this.entityExtractor.extract(content);

    // 3. Store entities and link to episode
    const entityIdMap = new Map<string, string>();

    for (const extractedEntity of extracted.entities) {
      const entity = this.graphStore.addEntity(
        extractedEntity.name,
        extractedEntity.type,
        extractedEntity.summary,
        { attributes: extractedEntity.attributes }
      );
      entityIdMap.set(extractedEntity.name.toLowerCase(), entity.id);
      this.graphStore.linkEpisodeToEntity(episode.id, entity.id, 'explicit');
    }

    // 4. Store relations
    for (const relation of extracted.relations) {
      const sourceId = entityIdMap.get(relation.sourceName.toLowerCase());
      const targetId = entityIdMap.get(relation.targetName.toLowerCase());

      if (sourceId && targetId) {
        this.graphStore.addFact(
          sourceId,
          targetId,
          relation.relation,
          relation.fact,
          [episode.id],
          { confidence: relation.confidence }
        );
      }
    }

    logger.debug({
      episodeId: episode.id,
      entitiesAdded: extracted.entities.length,
      relationsAdded: extracted.relations.length,
    }, 'Ingested episode');
  }

  /**
   * Get summary of known context about a topic
   */
  async getSummary(topic: string): Promise<string> {
    const context = await this.retrieve(topic);

    if (context.relevantEntities.length === 0 && context.activeFacts.length === 0) {
      return `No stored information found about "${topic}".`;
    }

    const parts: string[] = [`Information about "${topic}":\n`];

    for (const entity of context.relevantEntities) {
      parts.push(`\n**${entity.name}** (${entity.type})`);
      parts.push(entity.summary);

      const entityFacts = context.activeFacts.filter(
        (f) => f.sourceId === entity.id || f.targetId === entity.id
      );
      for (const fact of entityFacts) {
        parts.push(`  - ${fact.fact}`);
      }
    }

    return parts.join('\n');
  }
}
