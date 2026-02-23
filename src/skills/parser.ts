import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getLogger } from '../utils/logger.js';

export interface SkillTrigger {
  type: 'webhook' | 'cron' | 'manual';
  events?: string[];
  cron?: string;
  command?: string;
}

export interface SkillMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  triggers: SkillTrigger[];
  tools?: string[];
  providers?: ('github' | 'gitlab' | 'bitbucket')[];
  enabled?: boolean;
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  systemPrompt: string;
  filePath: string;
}

export class SkillParser {
  private logger = getLogger('skill-parser');

  parseSkillFile(filePath: string): ParsedSkill | null {
    if (!existsSync(filePath)) {
      this.logger.warn({ filePath }, 'Skill file not found');
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseSkillContent(content, filePath);
    } catch (error) {
      this.logger.error({ error, filePath }, 'Failed to read skill file');
      return null;
    }
  }

  parseSkillContent(content: string, filePath: string): ParsedSkill | null {
    try {
      // Extract YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        this.logger.warn({ filePath }, 'No YAML frontmatter found in skill file');
        return null;
      }

      const yamlContent = frontmatterMatch[1];
      const systemPrompt = frontmatterMatch[2]?.trim() || '';

      if (!yamlContent) {
        this.logger.warn({ filePath }, 'Empty YAML frontmatter');
        return null;
      }

      const metadata = parseYaml(yamlContent) as SkillMetadata;

      if (!metadata.name) {
        this.logger.warn({ filePath }, 'Skill name is required');
        return null;
      }

      if (!metadata.triggers || metadata.triggers.length === 0) {
        metadata.triggers = [{ type: 'manual' }];
      }

      if (metadata.enabled === undefined) {
        metadata.enabled = true;
      }

      return {
        metadata,
        systemPrompt,
        filePath,
      };
    } catch (error) {
      this.logger.error({ error, filePath }, 'Failed to parse skill file');
      return null;
    }
  }

  loadSkillsFromDirectory(directory: string): ParsedSkill[] {
    const skills: ParsedSkill[] = [];

    if (!existsSync(directory)) {
      this.logger.debug({ directory }, 'Skills directory does not exist');
      return skills;
    }

    try {
      const entries = readdirSync(directory);

      for (const entry of entries) {
        const entryPath = join(directory, entry);
        const stat = statSync(entryPath);

        if (stat.isDirectory()) {
          // Look for SKILL.md in subdirectory
          const skillFile = join(entryPath, 'SKILL.md');
          if (existsSync(skillFile)) {
            const skill = this.parseSkillFile(skillFile);
            if (skill) {
              skills.push(skill);
            }
          }
        } else if (entry.endsWith('.md') && entry !== 'README.md') {
          // Direct skill file
          const skill = this.parseSkillFile(entryPath);
          if (skill) {
            skills.push(skill);
          }
        }
      }
    } catch (error) {
      this.logger.error({ error, directory }, 'Failed to load skills from directory');
    }

    this.logger.info({ count: skills.length, directory }, 'Loaded skills from directory');
    return skills;
  }

  matchesTrigger(skill: ParsedSkill, triggerType: string, eventName?: string): boolean {
    for (const trigger of skill.metadata.triggers) {
      if (trigger.type !== triggerType) {
        continue;
      }

      if (triggerType === 'webhook' && eventName && trigger.events) {
        // Support wildcard matching
        for (const pattern of trigger.events) {
          if (this.matchesEventPattern(eventName, pattern)) {
            return true;
          }
        }
        return false;
      }

      return true;
    }

    return false;
  }

  private matchesEventPattern(eventName: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(eventName);
    }

    return eventName === pattern;
  }

  getCronTriggers(skill: ParsedSkill): string[] {
    return skill.metadata.triggers
      .filter(t => t.type === 'cron' && t.cron)
      .map(t => t.cron!);
  }
}
