import { getLogger } from '../../utils/logger.js';

export interface TeamsConfig {
  webhookUrl?: string;
}

interface AdaptiveCardElement {
  type: string;
  text?: string;
  weight?: string;
  size?: string;
  color?: string;
  wrap?: boolean;
  isSubtle?: boolean;
  spacing?: string;
  columns?: AdaptiveCardElement[];
  width?: string;
  items?: AdaptiveCardElement[];
  separator?: boolean;
  facts?: Array<{ title: string; value: string }>;
}

interface AdaptiveCard {
  type: string;
  attachments: Array<{
    contentType: string;
    content: {
      type: string;
      version: string;
      body: AdaptiveCardElement[];
      actions?: Array<{ type: string; title: string; url: string }>;
      $schema: string;
    };
  }>;
}

export class TeamsAdapter {
  private webhookUrl?: string;
  private logger = getLogger('teams-adapter');
  private enabled: boolean;

  constructor(config: TeamsConfig) {
    this.webhookUrl = config.webhookUrl;
    this.enabled = !!config.webhookUrl;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private createCard(body: AdaptiveCardElement[], actions?: Array<{ type: string; title: string; url: string }>): AdaptiveCard {
    return {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body,
          actions,
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        },
      }],
    };
  }

  async sendMessage(card: AdaptiveCard): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      this.logger.warn('Teams adapter is not configured');
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      });
      if (!response.ok) throw new Error(`Teams webhook returned ${response.status}`);
      this.logger.debug('Message sent to Teams');
      return true;
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to send Teams message');
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
    const statusMap = {
      approved: { emoji: '✅', label: 'Approved', color: 'good' },
      changes_requested: { emoji: '❌', label: 'Changes Requested', color: 'attention' },
      commented: { emoji: '💬', label: 'Commented', color: 'accent' },
    };
    const { emoji, label, color } = statusMap[params.status];

    return this.sendMessage(this.createCard([
      { type: 'TextBlock', text: `${emoji} PR Review: ${label}`, weight: 'Bolder', size: 'Medium', color },
      { type: 'FactSet', facts: [
        { title: 'Repository', value: params.repository },
        { title: 'PR', value: `#${params.prNumber} - ${params.prTitle}` },
      ]},
      { type: 'TextBlock', text: params.summary, wrap: true },
    ], [
      { type: 'Action.OpenUrl', title: 'View PR', url: params.prUrl },
    ]));
  }

  async notifyCIFailure(params: {
    repository: string;
    branch: string;
    workflowName: string;
    workflowUrl: string;
    failedJobs: string[];
    errorSummary?: string;
  }): Promise<boolean> {
    const body: AdaptiveCardElement[] = [
      { type: 'TextBlock', text: '❌ CI/CD Pipeline Failed', weight: 'Bolder', size: 'Medium', color: 'attention' },
      { type: 'FactSet', facts: [
        { title: 'Repository', value: params.repository },
        { title: 'Branch', value: params.branch },
        { title: 'Workflow', value: params.workflowName },
        { title: 'Failed Jobs', value: params.failedJobs.join(', ') },
      ]},
    ];
    if (params.errorSummary) {
      body.push({ type: 'TextBlock', text: params.errorSummary.substring(0, 500), wrap: true, isSubtle: true });
    }
    return this.sendMessage(this.createCard(body, [
      { type: 'Action.OpenUrl', title: 'View Logs', url: params.workflowUrl },
    ]));
  }

  async notifyRelease(params: {
    repository: string;
    version: string;
    releaseUrl: string;
    changelog?: string;
  }): Promise<boolean> {
    const body: AdaptiveCardElement[] = [
      { type: 'TextBlock', text: '🚀 New Release Published', weight: 'Bolder', size: 'Medium' },
      { type: 'FactSet', facts: [
        { title: 'Repository', value: params.repository },
        { title: 'Version', value: params.version },
      ]},
    ];
    if (params.changelog) {
      body.push({ type: 'TextBlock', text: params.changelog.substring(0, 1000), wrap: true });
    }
    return this.sendMessage(this.createCard(body, [
      { type: 'Action.OpenUrl', title: 'View Release', url: params.releaseUrl },
    ]));
  }

  async notifyError(params: { context: string; error: string; details?: string }): Promise<boolean> {
    return this.sendMessage(this.createCard([
      { type: 'TextBlock', text: '⚠️ MegaSloth Error', weight: 'Bolder', size: 'Medium', color: 'warning' },
      { type: 'FactSet', facts: [
        { title: 'Context', value: params.context },
        { title: 'Error', value: params.error },
      ]},
      ...(params.details ? [{ type: 'TextBlock', text: params.details.substring(0, 500), wrap: true, isSubtle: true } as AdaptiveCardElement] : []),
    ]));
  }
}
