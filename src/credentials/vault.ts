import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('credential-vault');

interface StoredCredential {
  service: string;
  key: string;
  value: string; // encrypted
  iv: string;
  tag: string;
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

interface VaultData {
  version: 1;
  credentials: StoredCredential[];
}

export class CredentialVault {
  private vaultPath: string;
  private encryptionKey: Buffer;
  private data: VaultData;

  constructor(vaultDir: string, masterPassword?: string) {
    this.vaultPath = join(vaultDir, 'vault.enc.json');
    mkdirSync(dirname(this.vaultPath), { recursive: true });

    const secret = masterPassword || process.env.MEGASLOTH_VAULT_KEY || 'megasloth-default-key';
    this.encryptionKey = scryptSync(secret, 'megasloth-salt', 32);

    this.data = this.load();
  }

  private load(): VaultData {
    if (!existsSync(this.vaultPath)) return { version: 1, credentials: [] };
    try {
      return JSON.parse(readFileSync(this.vaultPath, 'utf-8'));
    } catch {
      logger.warn('Vault file corrupted, starting fresh');
      return { version: 1, credentials: [] };
    }
  }

  private save(): void {
    writeFileSync(this.vaultPath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  private encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
  }

  private decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return decipher.update(encrypted, 'base64', 'utf-8') + decipher.final('utf-8');
  }

  store(service: string, key: string, value: string, options?: { expiresAt?: Date; metadata?: Record<string, string> }): void {
    this.data.credentials = this.data.credentials.filter(c => !(c.service === service && c.key === key));
    const { encrypted, iv, tag } = this.encrypt(value);
    this.data.credentials.push({
      service, key, value: encrypted, iv, tag,
      createdAt: new Date().toISOString(),
      expiresAt: options?.expiresAt?.toISOString(),
      metadata: options?.metadata,
    });
    this.save();
    logger.info({ service, key }, 'Credential stored');
  }

  get(service: string, key: string): string | null {
    const cred = this.data.credentials.find(c => c.service === service && c.key === key);
    if (!cred) return null;
    if (cred.expiresAt && new Date(cred.expiresAt) < new Date()) {
      logger.warn({ service, key }, 'Credential expired');
      return null;
    }
    try {
      return this.decrypt(cred.value, cred.iv, cred.tag);
    } catch {
      logger.error({ service, key }, 'Failed to decrypt credential');
      return null;
    }
  }

  list(): { service: string; key: string; createdAt: string; expiresAt?: string; expired: boolean }[] {
    return this.data.credentials.map(c => ({
      service: c.service,
      key: c.key,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      expired: c.expiresAt ? new Date(c.expiresAt) < new Date() : false,
    }));
  }

  delete(service: string, key: string): boolean {
    const before = this.data.credentials.length;
    this.data.credentials = this.data.credentials.filter(c => !(c.service === service && c.key === key));
    if (this.data.credentials.length < before) {
      this.save();
      logger.info({ service, key }, 'Credential deleted');
      return true;
    }
    return false;
  }

  getExpiring(withinHours = 24): { service: string; key: string; expiresAt: string }[] {
    const threshold = new Date(Date.now() + withinHours * 3600_000);
    return this.data.credentials
      .filter(c => c.expiresAt && new Date(c.expiresAt) < threshold)
      .map(c => ({ service: c.service, key: c.key, expiresAt: c.expiresAt! }));
  }

  applyToEnv(): void {
    const mapping: Record<string, { service: string; key: string }> = {
      GITHUB_TOKEN: { service: 'github', key: 'token' },
      GITLAB_TOKEN: { service: 'gitlab', key: 'token' },
      ANTHROPIC_API_KEY: { service: 'anthropic', key: 'api_key' },
      OPENAI_API_KEY: { service: 'openai', key: 'api_key' },
      GEMINI_API_KEY: { service: 'gemini', key: 'api_key' },
      SLACK_BOT_TOKEN: { service: 'slack', key: 'bot_token' },
      DISCORD_BOT_TOKEN: { service: 'discord', key: 'bot_token' },
      AWS_ACCESS_KEY_ID: { service: 'aws', key: 'access_key_id' },
      AWS_SECRET_ACCESS_KEY: { service: 'aws', key: 'secret_access_key' },
    };

    for (const [envVar, { service, key }] of Object.entries(mapping)) {
      if (!process.env[envVar]) {
        const value = this.get(service, key);
        if (value) {
          process.env[envVar] = value;
          logger.debug({ envVar, service }, 'Applied credential from vault');
        }
      }
    }
  }
}
