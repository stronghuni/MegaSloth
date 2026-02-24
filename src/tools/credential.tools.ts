import { type ToolRegistry } from './registry.js';
import { CredentialVault } from '../credentials/vault.js';
import { AutoProvisioner } from '../credentials/provisioner.js';

let vault: CredentialVault | null = null;
let provisioner: AutoProvisioner | null = null;

function getVault(): CredentialVault {
  if (!vault) {
    vault = new CredentialVault(process.env.MEGASLOTH_DATA_DIR || '.megasloth/data');
    provisioner = new AutoProvisioner(vault);
  }
  return vault;
}

function getProvisioner(): AutoProvisioner {
  getVault();
  return provisioner!;
}

export function registerCredentialTools(registry: ToolRegistry): void {
  registry.register({
    category: 'credential',
    definition: {
      name: 'credential_provision',
      description: 'Auto-provision credentials for a service. Uses CLI tools first, then OAuth Device Flow. Supported: github, gitlab, aws, gcp, or "all".',
      input_schema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name: github, gitlab, aws, gcp, or "all"', enum: ['github', 'gitlab', 'aws', 'gcp', 'all'] },
        },
        required: ['service'],
      },
    },
    handler: async (input) => {
      const prov = getProvisioner();
      const service = input.service as string;

      if (service === 'all') {
        const results = await prov.provisionAll();
        return JSON.stringify(results, null, 2);
      }

      let result;
      switch (service) {
        case 'github': result = await prov.provisionGitHub(); break;
        case 'gitlab': result = await prov.provisionGitLab(); break;
        case 'aws': result = await prov.provisionAWS(); break;
        case 'gcp': result = await prov.provisionGCP(); break;
        default: return `Unknown service: ${service}`;
      }
      return JSON.stringify(result, null, 2);
    },
  });

  registry.register({
    category: 'credential',
    definition: {
      name: 'credential_list',
      description: 'List all stored credentials (values are masked). Shows service, key, creation date, and expiry.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const list = getVault().list();
      if (list.length === 0) return 'No credentials stored';
      return JSON.stringify(list, null, 2);
    },
  });

  registry.register({
    category: 'credential',
    definition: {
      name: 'credential_store',
      description: 'Manually store a credential in the encrypted vault.',
      input_schema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name (e.g. github, aws, custom-api)' },
          key: { type: 'string', description: 'Credential key (e.g. token, api_key, password)' },
          value: { type: 'string', description: 'Credential value' },
        },
        required: ['service', 'key', 'value'],
      },
    },
    handler: async (input) => {
      getVault().store(input.service as string, input.key as string, input.value as string);
      return `Credential stored: ${input.service}/${input.key}`;
    },
  });

  registry.register({
    category: 'credential',
    definition: {
      name: 'credential_delete',
      description: 'Delete a credential from the vault.',
      input_schema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name' },
          key: { type: 'string', description: 'Credential key' },
        },
        required: ['service', 'key'],
      },
    },
    handler: async (input) => {
      const deleted = getVault().delete(input.service as string, input.key as string);
      return deleted ? `Deleted: ${input.service}/${input.key}` : 'Credential not found';
    },
  });
}
