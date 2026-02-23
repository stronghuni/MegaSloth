import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('github-app');

export interface GitHubAppConfig {
  appId: string;
  privateKeyPath?: string;
  privateKey?: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
}

export class GitHubApp {
  private appId: string;
  private privateKey: string;
  private webhookSecret?: string;

  constructor(config: GitHubAppConfig) {
    this.appId = config.appId;
    this.privateKey = config.privateKey || (config.privateKeyPath ? readFileSync(config.privateKeyPath, 'utf-8') : '');
    this.webhookSecret = config.webhookSecret;

    if (!this.privateKey) {
      throw new Error('GitHub App requires a private key');
    }
  }

  async createJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now - 60, exp: now + (10 * 60), iss: this.appId };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${header}.${body}`;

    const crypto = await import('node:crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.privateKey, 'base64url');

    return `${signingInput}.${signature}`;
  }

  async getInstallationToken(installationId: number): Promise<string> {
    const jwt = await this.createJWT();

    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get installation token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { token: string };
    logger.info({ installationId }, 'Installation token obtained');
    return data.token;
  }

  async listInstallations(): Promise<Array<{ id: number; account: { login: string }; target_type: string }>> {
    const jwt = await this.createJWT();

    const response = await fetch('https://api.github.com/app/installations', {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list installations: ${response.status}`);
    }

    return response.json() as Promise<Array<{ id: number; account: { login: string }; target_type: string }>>;
  }

  async getInstallationRepositories(installationId: number): Promise<Array<{ full_name: string; private: boolean }>> {
    const token = await this.getInstallationToken(installationId);

    const response = await fetch('https://api.github.com/installation/repositories', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list repositories: ${response.status}`);
    }

    const data = await response.json() as { repositories: Array<{ full_name: string; private: boolean }> };
    return data.repositories;
  }

  async registerWebhook(installationId: number, webhookUrl: string, events: string[]): Promise<void> {
    const token = await this.getInstallationToken(installationId);

    const repos = await this.getInstallationRepositories(installationId);
    for (const repo of repos) {
      const [owner, name] = repo.full_name.split('/');

      const existingResponse = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
      });

      const existingHooks = await existingResponse.json() as Array<{ config: { url: string } }>;
      const alreadyRegistered = existingHooks.some(h => h.config?.url === webhookUrl);

      if (alreadyRegistered) {
        logger.debug({ repo: repo.full_name }, 'Webhook already registered');
        continue;
      }

      await fetch(`https://api.github.com/repos/${owner}/${name}/hooks`, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events,
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: this.webhookSecret,
            insecure_ssl: '0',
          },
        }),
      });

      logger.info({ repo: repo.full_name }, 'Webhook registered');
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true;
    const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(payload).digest('hex')}`;
    return signature === expected;
  }
}
