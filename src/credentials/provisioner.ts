import { getLogger } from '../utils/logger.js';
import { shellExec } from '../tools/shell/process-manager.js';
import { type CredentialVault } from './vault.js';

const logger = getLogger('auto-provisioner');

export interface ProvisionResult {
  success: boolean;
  service: string;
  method: 'cli' | 'device_flow' | 'browser' | 'manual';
  message: string;
}

export class AutoProvisioner {
  private vault: CredentialVault;

  constructor(vault: CredentialVault) {
    this.vault = vault;
  }

  async provisionGitHub(): Promise<ProvisionResult> {
    const existing = this.vault.get('github', 'token');
    if (existing) return { success: true, service: 'github', method: 'cli', message: 'Already provisioned' };

    // Strategy 1: gh CLI
    const ghCheck = await shellExec('gh auth status 2>&1', { timeout: 10 });
    if (ghCheck.exitCode === 0) {
      const tokenResult = await shellExec('gh auth token 2>&1', { timeout: 10 });
      if (tokenResult.exitCode === 0 && tokenResult.stdout.trim()) {
        this.vault.store('github', 'token', tokenResult.stdout.trim());
        process.env.GITHUB_TOKEN = tokenResult.stdout.trim();
        return { success: true, service: 'github', method: 'cli', message: 'Token obtained via gh CLI' };
      }
    }

    // Strategy 2: GitHub OAuth Device Flow
    try {
      const result = await this.githubDeviceFlow();
      if (result) return result;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Device Flow failed');
    }

    return { success: false, service: 'github', method: 'manual', message: 'Set GITHUB_TOKEN or run: gh auth login' };
  }

  private async githubDeviceFlow(): Promise<ProvisionResult | null> {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || 'Ov23liUGIRGEaXKCmpL3'; // MegaSloth default OAuth App

    const codeRes = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo,workflow,admin:repo_hook,read:org' }),
    });

    if (!codeRes.ok) return null;
    const codeData = await codeRes.json() as any;

    logger.info({
      userCode: codeData.user_code,
      verificationUri: codeData.verification_uri,
    }, 'GitHub Device Flow: user action required');

    const openCmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start ""'
      : 'xdg-open';
    await shellExec(`${openCmd} "${codeData.verification_uri}"`, { timeout: 5 }).catch(() => {});

    console.log(`\n  🦥 GitHub Authorization Required`);
    console.log(`  ──────────────────────────────────`);
    console.log(`  1. Open: ${codeData.verification_uri}`);
    console.log(`  2. Enter code: ${codeData.user_code}`);
    console.log(`  3. MegaSloth will automatically detect authorization.\n`);

    const interval = (codeData.interval || 5) * 1000;
    const expiresAt = Date.now() + (codeData.expires_in || 900) * 1000;

    while (Date.now() < expiresAt) {
      await new Promise(r => setTimeout(r, interval));

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          device_code: codeData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const tokenData = await tokenRes.json() as any;

      if (tokenData.access_token) {
        this.vault.store('github', 'token', tokenData.access_token);
        process.env.GITHUB_TOKEN = tokenData.access_token;
        logger.info('GitHub token obtained via Device Flow');
        return { success: true, service: 'github', method: 'device_flow', message: 'Token obtained via OAuth Device Flow' };
      }

      if (tokenData.error === 'slow_down') {
        await new Promise(r => setTimeout(r, 5000));
      } else if (tokenData.error !== 'authorization_pending') {
        logger.warn({ error: tokenData.error }, 'Device Flow error');
        return null;
      }
    }

    return null;
  }

  async provisionGitLab(): Promise<ProvisionResult> {
    const existing = this.vault.get('gitlab', 'token');
    if (existing) return { success: true, service: 'gitlab', method: 'cli', message: 'Already provisioned' };

    const glabCheck = await shellExec('glab auth status 2>&1', { timeout: 10 });
    if (glabCheck.exitCode === 0) {
      const tokenResult = await shellExec('glab auth status -t 2>&1', { timeout: 10 });
      const tokenMatch = tokenResult.stdout.match(/Token:\s+(\S+)/);
      if (tokenMatch?.[1]) {
        this.vault.store('gitlab', 'token', tokenMatch[1]);
        return { success: true, service: 'gitlab', method: 'cli', message: 'Token obtained via glab CLI' };
      }
    }

    return { success: false, service: 'gitlab', method: 'manual', message: 'Set GITLAB_TOKEN or run: glab auth login' };
  }

  async provisionAWS(): Promise<ProvisionResult> {
    const check = await shellExec('aws sts get-caller-identity 2>&1', { timeout: 15 });
    if (check.exitCode === 0) {
      return { success: true, service: 'aws', method: 'cli', message: 'AWS CLI already configured' };
    }

    const ssoCheck = await shellExec('aws configure list-profiles 2>&1', { timeout: 10 });
    if (ssoCheck.exitCode === 0 && ssoCheck.stdout.trim()) {
      return { success: false, service: 'aws', method: 'cli', message: 'AWS profiles exist. Run: aws sso login' };
    }

    return { success: false, service: 'aws', method: 'manual', message: 'Run: aws configure' };
  }

  async provisionGCP(): Promise<ProvisionResult> {
    const check = await shellExec('gcloud auth print-access-token 2>&1', { timeout: 15 });
    if (check.exitCode === 0) {
      return { success: true, service: 'gcp', method: 'cli', message: 'GCP CLI already authenticated' };
    }

    return { success: false, service: 'gcp', method: 'manual', message: 'Run: gcloud auth login' };
  }

  async provisionAll(): Promise<ProvisionResult[]> {
    const results: ProvisionResult[] = [];
    results.push(await this.provisionGitHub());
    results.push(await this.provisionGitLab());
    results.push(await this.provisionAWS());
    results.push(await this.provisionGCP());
    return results;
  }
}
