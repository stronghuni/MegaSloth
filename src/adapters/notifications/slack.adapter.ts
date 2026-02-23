import { WebClient, type ChatPostMessageResponse, type KnownBlock } from '@slack/web-api';
import { type SlackConfig } from '../../config/schema.js';
import { type MetadataStore } from '../../storage/index.js';
import { getLogger } from '../../utils/logger.js';

export interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions';
  text?: {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'plain_text' | 'mrkdwn';
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    action_id?: string;
    url?: string;
    value?: string;
  }>;
  accessory?: {
    type: string;
    image_url?: string;
    alt_text?: string;
    action_id?: string;
  };
}

export interface SlackAdapterDeps {
  config: SlackConfig;
  metadataStore?: MetadataStore;
}

export class SlackAdapter {
  private client: WebClient;
  private defaultChannel: string;
  private metadataStore?: MetadataStore;
  private logger = getLogger('slack-adapter');
  private enabled: boolean;

  constructor(deps: SlackAdapterDeps) {
    this.enabled = !!deps.config.botToken;
    this.client = new WebClient(deps.config.botToken);
    this.defaultChannel = deps.config.defaultChannel;
    this.metadataStore = deps.metadataStore;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendMessage(message: SlackMessage): Promise<ChatPostMessageResponse | null> {
    if (!this.enabled) {
      this.logger.warn('Slack adapter is not configured');
      return null;
    }

    const channel = message.channel || this.defaultChannel;

    try {
      const response = await this.client.chat.postMessage({
        channel,
        text: message.text,
        blocks: message.blocks as unknown as KnownBlock[],
        thread_ts: message.threadTs,
        unfurl_links: message.unfurlLinks ?? false,
        unfurl_media: message.unfurlMedia ?? true,
      });

      this.logger.debug({
        channel,
        ts: response.ts,
      }, 'Message sent to Slack');

      // Store notification in database
      if (this.metadataStore) {
        await this.metadataStore.createNotification({
          channel: 'slack',
          recipient: channel,
          message: message.text,
          metadata: { blocks: message.blocks, threadTs: message.threadTs },
          status: 'sent',
          sentAt: new Date(),
        });
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: errorMessage, channel }, 'Failed to send Slack message');

      if (this.metadataStore) {
        await this.metadataStore.createNotification({
          channel: 'slack',
          recipient: channel,
          message: message.text,
          status: 'failed',
          error: errorMessage,
        });
      }

      return null;
    }
  }

  // Convenience methods for common notifications

  async notifyPRReview(params: {
    repository: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    status: 'approved' | 'changes_requested' | 'commented';
    summary: string;
    channel?: string;
  }): Promise<ChatPostMessageResponse | null> {
    const statusEmoji = {
      approved: ':white_check_mark:',
      changes_requested: ':x:',
      commented: ':speech_balloon:',
    };

    const statusText = {
      approved: 'Approved',
      changes_requested: 'Changes Requested',
      commented: 'Commented',
    };

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji[params.status]} PR Review: ${statusText[params.status]}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Repository:*\n${params.repository}`,
          },
          {
            type: 'mrkdwn',
            text: `*Pull Request:*\n<${params.prUrl}|#${params.prNumber}>`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${params.prTitle}*\n\n${params.summary}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View PR',
              emoji: true,
            },
            url: params.prUrl,
            action_id: 'view_pr',
          },
        ],
      },
    ];

    return this.sendMessage({
      channel: params.channel,
      text: `PR #${params.prNumber} ${statusText[params.status]}: ${params.prTitle}`,
      blocks,
    });
  }

  async notifyCIFailure(params: {
    repository: string;
    branch: string;
    workflowName: string;
    workflowUrl: string;
    failedJobs: string[];
    errorSummary?: string;
    channel?: string;
  }): Promise<ChatPostMessageResponse | null> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':x: CI/CD Pipeline Failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Repository:*\n${params.repository}`,
          },
          {
            type: 'mrkdwn',
            text: `*Branch:*\n${params.branch}`,
          },
          {
            type: 'mrkdwn',
            text: `*Workflow:*\n<${params.workflowUrl}|${params.workflowName}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Failed Jobs:*\n${params.failedJobs.join(', ')}`,
          },
        ],
      },
    ];

    if (params.errorSummary) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Summary:*\n\`\`\`${params.errorSummary.substring(0, 500)}\`\`\``,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Logs',
            emoji: true,
          },
          url: params.workflowUrl,
          action_id: 'view_logs',
        },
      ],
    });

    return this.sendMessage({
      channel: params.channel,
      text: `CI failed for ${params.repository} on ${params.branch}`,
      blocks,
    });
  }

  async notifyRelease(params: {
    repository: string;
    version: string;
    releaseUrl: string;
    changelog?: string;
    channel?: string;
  }): Promise<ChatPostMessageResponse | null> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':rocket: New Release Published',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Repository:*\n${params.repository}`,
          },
          {
            type: 'mrkdwn',
            text: `*Version:*\n<${params.releaseUrl}|${params.version}>`,
          },
        ],
      },
    ];

    if (params.changelog) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Changelog:*\n${params.changelog.substring(0, 1000)}`,
        },
      });
    }

    return this.sendMessage({
      channel: params.channel,
      text: `New release ${params.version} for ${params.repository}`,
      blocks,
    });
  }

  async notifyError(params: {
    context: string;
    error: string;
    details?: string;
    channel?: string;
  }): Promise<ChatPostMessageResponse | null> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':warning: MegaSloth Error',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Context:* ${params.context}\n*Error:* ${params.error}`,
        },
      },
    ];

    if (params.details) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${params.details.substring(0, 1000)}\`\`\``,
        },
      });
    }

    return this.sendMessage({
      channel: params.channel,
      text: `MegaSloth Error: ${params.error}`,
      blocks,
    });
  }

  async notifyBranchCleanup(params: {
    repository: string;
    deletedBranches: string[];
    failedBranches: Array<{ name: string; reason: string }>;
    channel?: string;
  }): Promise<ChatPostMessageResponse | null> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':broom: Branch Cleanup Complete',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Repository:* ${params.repository}`,
        },
      },
    ];

    if (params.deletedBranches.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deleted Branches (${params.deletedBranches.length}):*\n${params.deletedBranches.slice(0, 10).map(b => `• ${b}`).join('\n')}${params.deletedBranches.length > 10 ? `\n_...and ${params.deletedBranches.length - 10} more_` : ''}`,
        },
      });
    }

    if (params.failedBranches.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Failed to Delete (${params.failedBranches.length}):*\n${params.failedBranches.slice(0, 5).map(b => `• ${b.name}: ${b.reason}`).join('\n')}`,
        },
      });
    }

    return this.sendMessage({
      channel: params.channel,
      text: `Branch cleanup: ${params.deletedBranches.length} deleted, ${params.failedBranches.length} failed`,
      blocks,
    });
  }
}
