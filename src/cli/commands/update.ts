import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { banner, heading, success, warn, info, blank, divider, colors as c } from '../ui.js';

const GITHUB_REPO = 'stronghuni/MegaSloth';

interface ReleaseInfo {
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  body: string;
}

function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return {
      tagName: data.tag_name as string,
      name: data.name as string,
      htmlUrl: data.html_url as string,
      publishedAt: data.published_at as string,
      body: (data.body as string || '').substring(0, 500),
    };
  } catch {
    return null;
  }
}

export async function checkForUpdatesQuiet(): Promise<void> {
  try {
    const release = await fetchLatestRelease();
    if (!release) return;

    const current = getCurrentVersion();
    const latest = release.tagName.replace(/^v/, '');

    if (compareVersions(latest, current) > 0) {
      console.log(`  ${c.yellow}!${c.reset} New version available: ${c.cyan}v${latest}${c.reset} (current: v${current})`);
      console.log(`  ${c.dim}  Run: megasloth update${c.reset}`);
      console.log('');
    }
  } catch { /* silent */ }
}

export const updateCommand = new Command('update')
  .description('Check for and install MegaSloth updates')
  .option('--check', 'Only check, do not install')
  .action(async (options: { check?: boolean }) => {
    banner();
    heading('Update Check');

    const current = getCurrentVersion();
    info(`Current version: v${current}`);
    blank();

    console.log(`  ${c.dim}Checking GitHub releases...${c.reset}`);
    const release = await fetchLatestRelease();

    if (!release) {
      warn('Could not fetch latest release from GitHub');
      blank();
      return;
    }

    const latest = release.tagName.replace(/^v/, '');
    const hasUpdate = compareVersions(latest, current) > 0;

    blank();
    divider();
    blank();

    if (!hasUpdate) {
      success(`You are on the latest version (v${current})`);
      blank();
      return;
    }

    console.log(`  ${c.green}${c.bold}New version available!${c.reset}`);
    blank();
    kv('Current', `v${current}`);
    kv('Latest', `${c.cyan}v${latest}${c.reset}`);
    kv('Released', new Date(release.publishedAt).toLocaleDateString());
    blank();

    if (release.body) {
      heading('Release Notes');
      for (const line of release.body.split('\n').slice(0, 10)) {
        console.log(`  ${c.dim}${line}${c.reset}`);
      }
      blank();
    }

    divider();
    blank();

    if (options.check) {
      info(`Download: ${c.cyan}${release.htmlUrl}${c.reset}`);
      blank();
      return;
    }

    console.log(`  ${c.white}To update, run:${c.reset}`);
    blank();
    console.log(`  ${c.cyan}  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash${c.reset}`);
    blank();
    console.log(`  ${c.dim}Or download from: ${release.htmlUrl}${c.reset}`);
    blank();
  });

function kv(key: string, value: string): void {
  console.log(`  ${c.dim}${key.padEnd(16)}${c.reset} ${value}`);
}
