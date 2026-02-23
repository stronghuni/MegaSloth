import { SkillParser, type ParsedSkill, type SkillTrigger } from './parser.js';
import { getLogger } from '../utils/logger.js';

export class SkillRegistry {
  private skills: Map<string, ParsedSkill> = new Map();
  private parser: SkillParser;
  private logger = getLogger('skill-registry');

  constructor() {
    this.parser = new SkillParser();
  }

  register(skill: ParsedSkill): void {
    if (this.skills.has(skill.metadata.name)) {
      this.logger.warn({ skillName: skill.metadata.name }, 'Overwriting existing skill');
    }
    this.skills.set(skill.metadata.name, skill);
    this.logger.info({
      skillName: skill.metadata.name,
      triggers: skill.metadata.triggers.map(t => t.type),
    }, 'Registered skill');
  }

  unregister(name: string): boolean {
    const deleted = this.skills.delete(name);
    if (deleted) {
      this.logger.info({ skillName: name }, 'Unregistered skill');
    }
    return deleted;
  }

  get(name: string): ParsedSkill | undefined {
    return this.skills.get(name);
  }

  getAll(): ParsedSkill[] {
    return Array.from(this.skills.values());
  }

  getEnabled(): ParsedSkill[] {
    return Array.from(this.skills.values()).filter(s => s.metadata.enabled !== false);
  }

  loadFromDirectory(directory: string): number {
    const skills = this.parser.loadSkillsFromDirectory(directory);
    for (const skill of skills) {
      this.register(skill);
    }
    return skills.length;
  }

  findByWebhookEvent(provider: string, eventName: string): ParsedSkill[] {
    return this.getEnabled().filter(skill => {
      // Check provider filter
      if (skill.metadata.providers && !skill.metadata.providers.includes(provider as 'github' | 'gitlab' | 'bitbucket')) {
        return false;
      }

      return this.parser.matchesTrigger(skill, 'webhook', eventName);
    });
  }

  findByCronSchedule(): ParsedSkill[] {
    return this.getEnabled().filter(skill =>
      skill.metadata.triggers.some(t => t.type === 'cron' && t.cron)
    );
  }

  findByManualCommand(command: string): ParsedSkill | undefined {
    return this.getEnabled().find(skill =>
      skill.metadata.triggers.some(t =>
        t.type === 'manual' && t.command === command
      )
    );
  }

  listSkills(): Array<{
    name: string;
    description?: string;
    triggers: SkillTrigger[];
    enabled: boolean;
  }> {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.metadata.name,
      description: skill.metadata.description,
      triggers: skill.metadata.triggers,
      enabled: skill.metadata.enabled !== false,
    }));
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const skill = this.skills.get(name);
    if (!skill) {
      return false;
    }
    skill.metadata.enabled = enabled;
    return true;
  }
}
