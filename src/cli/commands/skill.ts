import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { banner, heading, blank, colors as c } from '../ui.js';

export const skillCommand = new Command('skill')
  .description('Manage MegaSloth skills');

skillCommand
  .command('list')
  .description('List all available skills')
  .action(async () => {
    banner();
    heading('Skills');

    const builtinFromDist = join(import.meta.dirname, '../../skills/builtin');
    const builtinFromSrc = join('src', 'skills', 'builtin');
    const builtinPath = existsSync(builtinFromDist) ? builtinFromDist : builtinFromSrc;

    const skillDirs = [
      { path: builtinPath, label: 'built-in' },
      { path: '.megasloth/skills', label: 'custom' },
    ];

    let found = 0;

    for (const { path: dir, label } of skillDirs) {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir);
      for (const entry of entries) {
        const skillDir = join(dir, entry);
        if (!statSync(skillDir).isDirectory()) continue;

        const skillFile = join(skillDir, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

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

        const icon = enabled ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
        const tag = `${c.dim}[${label}]${c.reset}`;
        console.log(`  ${icon} ${name} ${tag}`);
        if (description) {
          console.log(`    ${c.dim}${description}${c.reset}`);
        }
        found++;
      }
    }

    if (found === 0) {
      console.log(`  ${c.dim}No skills found.${c.reset}`);
    }
    blank();
  });
