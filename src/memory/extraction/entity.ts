/**
 * Entity Extraction using LLM
 * Inspired by Graphiti's automatic entity extraction
 */

import { type LLMProvider } from '../../providers/types.js';
import { type EntityNode, type EntityType } from '../graph/nodes.js';
import { type RelationType } from '../graph/edges.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('entity-extraction');

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  summary: string;
  attributes: Record<string, unknown>;
}

export interface ExtractedRelation {
  sourceName: string;
  targetName: string;
  relation: RelationType;
  fact: string;
  confidence: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

const EXTRACTION_PROMPT = `You are an entity extraction system for a Git project management assistant.
Extract entities and relationships from the given text.

Entity Types:
- repository: Git repositories
- user: People, usernames, authors
- pull_request: Pull requests, merge requests
- issue: Issues, bugs, feature requests
- branch: Git branches
- commit: Git commits
- file: Files, paths
- concept: Technical concepts, features, decisions
- error: Errors, bugs, problems
- decision: Decisions made, choices

Relation Types:
- created_by: Who created something
- modified_by: Who modified something
- reviewed_by: Who reviewed something
- assigned_to: Who is assigned
- references: References another entity
- depends_on: Dependencies
- blocks: Blocking relationships
- fixes: What fixes what
- related_to: General relations
- part_of: Part-of relationships
- contains: Contains something
- implements: Implements something
- caused_by: Causation
- resolved_by: Resolution

Respond in JSON format:
{
  "entities": [
    {
      "name": "entity name",
      "type": "entity type",
      "summary": "brief description",
      "attributes": {}
    }
  ],
  "relations": [
    {
      "sourceName": "source entity name",
      "targetName": "target entity name",
      "relation": "relation type",
      "fact": "human readable fact",
      "confidence": 0.0-1.0
    }
  ]
}

Only extract entities and relations that are clearly mentioned or strongly implied.
Do not invent information not present in the text.

Text to analyze:
`;

export class EntityExtractor {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Extract entities and relations from text
   */
  async extract(text: string): Promise<ExtractionResult> {
    if (!text.trim()) {
      return { entities: [], relations: [] };
    }

    try {
      const response = await this.llm.chat(
        [{ role: 'user', content: EXTRACTION_PROMPT + text }],
        { maxTokens: 2000 },
      );

      const textContent = response.content
        .filter(b => b.type === 'text')
        .map(b => b.type === 'text' ? b.text : '')
        .join('');

      const result = this.parseExtractionResponse(textContent);

      logger.debug({
        textLength: text.length,
        entitiesFound: result.entities.length,
        relationsFound: result.relations.length,
      }, 'Extracted entities and relations');

      return result;
    } catch (error) {
      logger.error({ error }, 'Entity extraction failed');
      return { entities: [], relations: [] };
    }
  }

  /**
   * Parse the LLM response into structured data
   */
  private parseExtractionResponse(content: string): ExtractionResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in extraction response');
        return { entities: [], relations: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize entities
      const entities: ExtractedEntity[] = (parsed.entities || [])
        .filter((e: unknown) => this.isValidEntity(e))
        .map((e: ExtractedEntity) => ({
          name: String(e.name).trim(),
          type: this.normalizeEntityType(e.type),
          summary: String(e.summary || '').trim(),
          attributes: e.attributes || {},
        }));

      // Validate and normalize relations
      const relations: ExtractedRelation[] = (parsed.relations || [])
        .filter((r: unknown) => this.isValidRelation(r))
        .map((r: ExtractedRelation) => ({
          sourceName: String(r.sourceName).trim(),
          targetName: String(r.targetName).trim(),
          relation: this.normalizeRelationType(r.relation),
          fact: String(r.fact || '').trim(),
          confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0.5)),
        }));

      return { entities, relations };
    } catch (error) {
      logger.error({ error, content }, 'Failed to parse extraction response');
      return { entities: [], relations: [] };
    }
  }

  private isValidEntity(e: unknown): e is ExtractedEntity {
    if (!e || typeof e !== 'object') return false;
    const entity = e as Record<string, unknown>;
    return typeof entity.name === 'string' && entity.name.trim().length > 0;
  }

  private isValidRelation(r: unknown): r is ExtractedRelation {
    if (!r || typeof r !== 'object') return false;
    const relation = r as Record<string, unknown>;
    return (
      typeof relation.sourceName === 'string' &&
      typeof relation.targetName === 'string' &&
      relation.sourceName.trim().length > 0 &&
      relation.targetName.trim().length > 0
    );
  }

  private normalizeEntityType(type: string): EntityType {
    const normalized = String(type).toLowerCase().trim();
    const validTypes: EntityType[] = [
      'repository', 'user', 'pull_request', 'issue', 'branch',
      'commit', 'file', 'concept', 'error', 'decision'
    ];
    return validTypes.includes(normalized as EntityType)
      ? (normalized as EntityType)
      : 'concept';
  }

  private normalizeRelationType(type: string): RelationType {
    const normalized = String(type).toLowerCase().trim();
    const validTypes: RelationType[] = [
      'created_by', 'modified_by', 'reviewed_by', 'assigned_to',
      'references', 'depends_on', 'blocks', 'fixes', 'related_to',
      'part_of', 'contains', 'implements', 'caused_by', 'resolved_by'
    ];
    return validTypes.includes(normalized as RelationType)
      ? (normalized as RelationType)
      : 'related_to';
  }

  /**
   * Extract entities from a batch of messages
   */
  async extractFromMessages(
    messages: Array<{ role: string; content: string }>
  ): Promise<ExtractionResult> {
    const combinedText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    return this.extract(combinedText);
  }

  /**
   * Merge duplicate entities
   */
  mergeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const merged = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;
      const existing = merged.get(key);

      if (existing) {
        // Merge attributes and keep longer summary
        merged.set(key, {
          ...existing,
          summary: existing.summary.length > entity.summary.length
            ? existing.summary
            : entity.summary,
          attributes: { ...existing.attributes, ...entity.attributes },
        });
      } else {
        merged.set(key, entity);
      }
    }

    return Array.from(merged.values());
  }
}
