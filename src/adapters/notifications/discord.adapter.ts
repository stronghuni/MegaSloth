import { getLogger } from '../../utils/logger.js';

export interface DiscordConfig {
  webhookUrl?: string;
  botToken?: string;
  defaultChannelId?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
  url?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  channelId?: string;
}

const COLORS = {
  success: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
  info: 0x3b82f6,
  purple: 0x8b5cf6,
};

export class DiscordAdapter {
  private webhookUrl?: string;
  private botToken?: string;
  private defaultChannelId?: string;
  private logger = getLogger('discord-adapter');
  private enabled: boolean;

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
    this.botToken = config.botToken;
    this.defaultChannelId = config.defaultChannelId;
    this.enabled = !!(config.webhookUrl || config.botToken);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendMessage(message: DiscordMessage): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('Discord adapter is not configured');
      return false;
    }

    try {
      if (this.webhookUrl) {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message.content, embeds: message.embeds }),
        });
        if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`);
      } else if (this.botToken) {
        const channelId = message.channelId || this.defaultChannelId;
        if (!channelId) throw new Error('No channel ID specified');
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bot ${this.botToken}` },
          body: JSON.stringify({ content: message.content, embeds: message.embeds }),
        });
        if (!response.ok) throw new Error(`Discord API returned ${response.status}`);
      }
      this.logger.debug('Message sent to Discord');
      return true;
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to send Discord message');
      return false;
    }
  }

  async notifyPRReview(params: {
    repository: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    status: 'approved' | 'changes_requested' | 'commented';
    summary: string;
  }): Promise<boolean> {
    const statusConfig = {
      approved: { emoji: '✅', label: 'Approved', color: COLORS.success },
      changes_requested: { emoji: '❌', label: 'Changes Requested', color: COLORS.error },
      commented: { emoji: '💬', label: 'Commented', color: COLORS.info },
    };
    const { emoji, label, color } = statusConfig[params.status];

    return this.sendMessage({
      embeds: [{
        title: `${emoji} PR Review: ${label}`,
        description: `**${params.prTitle}**\n\n${params.summary}`,
        color,
        fields: [
          { name: 'Repository', value: params.repository, inline: true },
          { name: 'PR', value: `[#${params.prNumber}](${params.prUrl})`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  async notifyCIFailure(params: {
    repository: string;
    branch: string;
    workflowName: string;
    workflowUrl: string;
    failedJobs: string[];
    errorSummary?: string;
  }): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '❌ CI/CD Pipeline Failed',
      color: COLORS.error,
      fields: [
        { name: 'Repository', value: params.repository, inline: true },
        { name: 'Branch', value: params.branch, inline: true },
        { name: 'Workflow', value: `[${params.workflowName}](${params.workflowUrl})`, inline: true },
        { name: 'Failed Jobs', value: params.failedJobs.join(', ') },
      ],
      timestamp: new Date().toISOString(),
    };
    if (params.errorSummary) {
      embed.fields!.push({ name: 'Error', value: `\`\`\`${params.errorSummary.substring(0, 1000)}\`\`\`` });
    }
    return this.sendMessage({ embeds: [embed] });
  }

  async notifyRelease(params: {
    repository: string;
    version: string;
    releaseUrl: string;
    changelog?: string;
  }): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '🚀 New Release Published',
      color: COLORS.purple,
      fields: [
        { name: 'Repository', value: params.repository, inline: true },
        { name: 'Version', value: `[${params.version}](${params.releaseUrl})`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
    if (params.changelog) {
      embed.description = params.changelog.substring(0, 2000);
    }
    return this.sendMessage({ embeds: [embed] });
  }

  async notifyError(params: { context: string; error: string; details?: string }): Promise<boolean> {
    return this.sendMessage({
      embeds: [{
        title: '⚠️ MegaSloth Error',
        color: COLORS.warning,
        fields: [
          { name: 'Context', value: params.context },
          { name: 'Error', value: params.error },
          ...(params.details ? [{ name: 'Details', value: `\`\`\`${params.details.substring(0, 1000)}\`\`\`` }] : []),
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }
}
