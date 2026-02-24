import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const skillCommand = new Command('skill')
  .description('Manage MegaSloth skills');

skillCommand
  .command('list')
  .description('List all available skills')
  .action(async () => {
    console.log('\n  🦥 MegaSloth Skills\n');

    const skillDirs = [
      { path: join('src', 'skills', 'builtin'), label: 'Built-in' },
      { path: '.megasloth/skills', label: 'Custom' },
    ];

    for (const { path: dir, label } of skillDirs) {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir);
      for (const entry of entries) {
        const skillDir = join(dir, entry);
        if (!statSync(skillDir).isDirectory()) continue;

        const skillFile = join(skillDir, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        const { readFileSync } = await import('node:fs');
        const content = readFileSync(skillFile, 'utf-8');
        const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);

        let name = entry;
        let description = '';
        let enabled = true;

        if (frontmatter) {
          const { parse } = await import('yaml');
          const meta = parse(frontmatter[1]!);
          name = meta.name || entry;
          description = meta.description || '';
          enabled = meta.enabled !== false;
        }

        const status = enabled ? '✓' : '✗';
        console.log(`  ${status}  [${label}] ${name}`);
        if (description) console.log(`       ${description}`);
      }
    }
    console.log('');
  });
