import { type ToolRegistry } from './registry.js';
import {
  shellExec,
} from './shell/process-manager.js';

export function registerCicdTools(registry: ToolRegistry): void {

  // ─── Jenkins Tools ───

  registry.register({
    category: 'ci',
    definition: {
      name: 'jenkins_list_jobs',
      description: 'List all Jenkins jobs/pipelines. Requires JENKINS_URL and JENKINS_TOKEN env vars.',
      input_schema: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Optional folder path to list jobs within' },
        },
      },
    },
    handler: async (input) => {
      const url = process.env.JENKINS_URL;
      const user = process.env.JENKINS_USER || 'admin';
      const token = process.env.JENKINS_TOKEN;
      if (!url || !token) return JSON.stringify({ error: 'JENKINS_URL and JENKINS_TOKEN env vars required' });

      const folder = input.folder ? `job/${(input.folder as string).replace(/\//g, '/job/')}/` : '';
      const endpoint = `${url}/${folder}api/json?tree=jobs[name,url,color,lastBuild[number,result,timestamp]]`;

      const result = await shellExec(
        `curl -sf -u "${user}:${token}" "${endpoint}"`,
        { timeout: 30 }
      );

      if (result.exitCode !== 0) return JSON.stringify({ error: 'Failed to connect to Jenkins', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { jobs: Array<{ name: string; url: string; color: string; lastBuild?: { number: number; result: string; timestamp: number } }> };
        return JSON.stringify(data.jobs.map(j => ({
          name: j.name,
          url: j.url,
          status: j.color,
          lastBuild: j.lastBuild ? {
            number: j.lastBuild.number,
            result: j.lastBuild.result,
            time: new Date(j.lastBuild.timestamp).toISOString(),
          } : null,
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'jenkins_build',
      description: 'Trigger a Jenkins build for a job/pipeline. Requires JENKINS_URL and JENKINS_TOKEN.',
      input_schema: {
        type: 'object',
        properties: {
          job: { type: 'string', description: 'Job name or path (e.g. "my-pipeline" or "folder/my-pipeline")' },
          parameters: { type: 'object', description: 'Build parameters as key-value pairs' },
        },
        required: ['job'],
      },
    },
    handler: async (input) => {
      const url = process.env.JENKINS_URL;
      const user = process.env.JENKINS_USER || 'admin';
      const token = process.env.JENKINS_TOKEN;
      if (!url || !token) return JSON.stringify({ error: 'JENKINS_URL and JENKINS_TOKEN env vars required' });

      const jobPath = (input.job as string).replace(/\//g, '/job/');
      const params = input.parameters as Record<string, string> | undefined;

      let endpoint: string;
      let curlArgs = '';

      if (params && Object.keys(params).length > 0) {
        endpoint = `${url}/job/${jobPath}/buildWithParameters`;
        const formData = Object.entries(params).map(([k, v]) => `--data-urlencode "${k}=${v}"`).join(' ');
        curlArgs = formData;
      } else {
        endpoint = `${url}/job/${jobPath}/build`;
      }

      const result = await shellExec(
        `curl -sf -X POST -u "${user}:${token}" ${curlArgs} "${endpoint}"`,
        { timeout: 30 }
      );

      if (result.exitCode !== 0) return JSON.stringify({ error: 'Failed to trigger build', stderr: result.stderr });
      return `Build triggered for ${input.job}`;
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'jenkins_get_build',
      description: 'Get details and console output of a Jenkins build.',
      input_schema: {
        type: 'object',
        properties: {
          job: { type: 'string', description: 'Job name or path' },
          build_number: { type: 'number', description: 'Build number (omit for latest)' },
          logs: { type: 'boolean', description: 'Include console output (default false)' },
        },
        required: ['job'],
      },
    },
    handler: async (input) => {
      const url = process.env.JENKINS_URL;
      const user = process.env.JENKINS_USER || 'admin';
      const token = process.env.JENKINS_TOKEN;
      if (!url || !token) return JSON.stringify({ error: 'JENKINS_URL and JENKINS_TOKEN env vars required' });

      const jobPath = (input.job as string).replace(/\//g, '/job/');
      const buildNum = input.build_number ? String(input.build_number) : 'lastBuild';

      const infoResult = await shellExec(
        `curl -sf -u "${user}:${token}" "${url}/job/${jobPath}/${buildNum}/api/json?tree=number,result,timestamp,duration,building,displayName,description"`,
        { timeout: 30 }
      );

      if (infoResult.exitCode !== 0) return JSON.stringify({ error: 'Failed to get build info', stderr: infoResult.stderr });

      const buildInfo = infoResult.stdout;

      if (input.logs) {
        const logResult = await shellExec(
          `curl -sf -u "${user}:${token}" "${url}/job/${jobPath}/${buildNum}/consoleText"`,
          { timeout: 60 }
        );
        const logs = logResult.stdout;
        const truncated = logs.length > 10000 ? logs.substring(logs.length - 10000) : logs;
        return JSON.stringify({ build: JSON.parse(buildInfo), consoleOutput: truncated }, null, 2);
      }

      return buildInfo;
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'jenkins_stop_build',
      description: 'Abort/stop a running Jenkins build.',
      input_schema: {
        type: 'object',
        properties: {
          job: { type: 'string', description: 'Job name or path' },
          build_number: { type: 'number', description: 'Build number' },
        },
        required: ['job', 'build_number'],
      },
    },
    handler: async (input) => {
      const url = process.env.JENKINS_URL;
      const user = process.env.JENKINS_USER || 'admin';
      const token = process.env.JENKINS_TOKEN;
      if (!url || !token) return JSON.stringify({ error: 'JENKINS_URL and JENKINS_TOKEN env vars required' });

      const jobPath = (input.job as string).replace(/\//g, '/job/');
      const result = await shellExec(
        `curl -sf -X POST -u "${user}:${token}" "${url}/job/${jobPath}/${input.build_number}/stop"`,
        { timeout: 15 }
      );

      if (result.exitCode !== 0) return JSON.stringify({ error: 'Failed to stop build', stderr: result.stderr });
      return `Build #${input.build_number} stop requested for ${input.job}`;
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'jenkins_get_pipeline_config',
      description: 'Get the Jenkinsfile/pipeline configuration for a job.',
      input_schema: {
        type: 'object',
        properties: {
          job: { type: 'string', description: 'Job name or path' },
        },
        required: ['job'],
      },
    },
    handler: async (input) => {
      const url = process.env.JENKINS_URL;
      const user = process.env.JENKINS_USER || 'admin';
      const token = process.env.JENKINS_TOKEN;
      if (!url || !token) return JSON.stringify({ error: 'JENKINS_URL and JENKINS_TOKEN env vars required' });

      const jobPath = (input.job as string).replace(/\//g, '/job/');
      const result = await shellExec(
        `curl -sf -u "${user}:${token}" "${url}/job/${jobPath}/config.xml"`,
        { timeout: 30 }
      );

      if (result.exitCode !== 0) return JSON.stringify({ error: 'Failed to get pipeline config', stderr: result.stderr });
      return result.stdout;
    },
  });

  // ─── Kubernetes Tools ───

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_get_pods',
      description: 'List Kubernetes pods. Uses kubectl (must be configured).',
      input_schema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Kubernetes namespace (default: current context default)' },
          selector: { type: 'string', description: 'Label selector (e.g. "app=myapp")' },
          all_namespaces: { type: 'boolean', description: 'List across all namespaces' },
        },
      },
    },
    handler: async (input) => {
      let cmd = 'kubectl get pods -o json';
      if (input.all_namespaces) cmd += ' --all-namespaces';
      else if (input.namespace) cmd += ` -n ${input.namespace}`;
      if (input.selector) cmd += ` -l ${input.selector}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl failed', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { items: Array<{ metadata: { name: string; namespace: string }; status: { phase: string; containerStatuses?: Array<{ ready: boolean; restartCount: number }> } }> };
        return JSON.stringify(data.items.map(p => ({
          name: p.metadata.name,
          namespace: p.metadata.namespace,
          phase: p.status.phase,
          ready: p.status.containerStatuses?.every(c => c.ready) ?? false,
          restarts: p.status.containerStatuses?.reduce((s, c) => s + c.restartCount, 0) ?? 0,
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_get_services',
      description: 'List Kubernetes services.',
      input_schema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace' },
          all_namespaces: { type: 'boolean', description: 'All namespaces' },
        },
      },
    },
    handler: async (input) => {
      let cmd = 'kubectl get svc -o json';
      if (input.all_namespaces) cmd += ' --all-namespaces';
      else if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl failed', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { items: Array<{ metadata: { name: string; namespace: string }; spec: { type: string; clusterIP: string; ports?: Array<{ port: number; targetPort: number | string; protocol: string }> } }> };
        return JSON.stringify(data.items.map(s => ({
          name: s.metadata.name,
          namespace: s.metadata.namespace,
          type: s.spec.type,
          clusterIP: s.spec.clusterIP,
          ports: s.spec.ports,
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_get_deployments',
      description: 'List Kubernetes deployments with replica status.',
      input_schema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace' },
          all_namespaces: { type: 'boolean', description: 'All namespaces' },
        },
      },
    },
    handler: async (input) => {
      let cmd = 'kubectl get deployments -o json';
      if (input.all_namespaces) cmd += ' --all-namespaces';
      else if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl failed', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { items: Array<{ metadata: { name: string; namespace: string }; spec: { replicas: number }; status: { readyReplicas?: number; availableReplicas?: number; updatedReplicas?: number } }> };
        return JSON.stringify(data.items.map(d => ({
          name: d.metadata.name,
          namespace: d.metadata.namespace,
          desired: d.spec.replicas,
          ready: d.status.readyReplicas ?? 0,
          available: d.status.availableReplicas ?? 0,
          updated: d.status.updatedReplicas ?? 0,
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_apply',
      description: 'Apply a Kubernetes manifest (YAML/JSON) from a file or inline content.',
      input_schema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to manifest file' },
          manifest: { type: 'string', description: 'Inline YAML manifest content (alternative to file)' },
          namespace: { type: 'string', description: 'Target namespace' },
          dry_run: { type: 'boolean', description: 'Dry run only (client-side)' },
        },
      },
    },
    handler: async (input) => {
      let cmd: string;
      if (input.manifest) {
        cmd = `echo '${(input.manifest as string).replace(/'/g, "'\\''")}' | kubectl apply -f -`;
      } else if (input.file) {
        cmd = `kubectl apply -f ${input.file}`;
      } else {
        return JSON.stringify({ error: 'Either file or manifest is required' });
      }
      if (input.namespace) cmd += ` -n ${input.namespace}`;
      if (input.dry_run) cmd += ' --dry-run=client';

      const result = await shellExec(cmd, { timeout: 60 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl apply failed', stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_delete',
      description: 'Delete a Kubernetes resource.',
      input_schema: {
        type: 'object',
        properties: {
          resource: { type: 'string', description: 'Resource type (pod, deployment, service, etc.)' },
          name: { type: 'string', description: 'Resource name' },
          namespace: { type: 'string', description: 'Namespace' },
          force: { type: 'boolean', description: 'Force delete' },
        },
        required: ['resource', 'name'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl delete ${input.resource} ${input.name}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;
      if (input.force) cmd += ' --force --grace-period=0';

      const result = await shellExec(cmd, { timeout: 60 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl delete failed', stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_logs',
      description: 'Get logs from a Kubernetes pod.',
      input_schema: {
        type: 'object',
        properties: {
          pod: { type: 'string', description: 'Pod name' },
          namespace: { type: 'string', description: 'Namespace' },
          container: { type: 'string', description: 'Container name (for multi-container pods)' },
          tail: { type: 'number', description: 'Number of lines from end (default 100)' },
          previous: { type: 'boolean', description: 'Show logs from previous container instance' },
        },
        required: ['pod'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl logs ${input.pod}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;
      if (input.container) cmd += ` -c ${input.container}`;
      cmd += ` --tail=${input.tail ?? 100}`;
      if (input.previous) cmd += ' --previous';

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl logs failed', stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_scale',
      description: 'Scale a Kubernetes deployment.',
      input_schema: {
        type: 'object',
        properties: {
          deployment: { type: 'string', description: 'Deployment name' },
          replicas: { type: 'number', description: 'Desired replica count' },
          namespace: { type: 'string', description: 'Namespace' },
        },
        required: ['deployment', 'replicas'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl scale deployment/${input.deployment} --replicas=${input.replicas}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl scale failed', stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_rollout',
      description: 'Manage Kubernetes deployment rollouts (status, restart, undo).',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'restart', 'undo'], description: 'Rollout action' },
          deployment: { type: 'string', description: 'Deployment name' },
          namespace: { type: 'string', description: 'Namespace' },
        },
        required: ['action', 'deployment'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl rollout ${input.action} deployment/${input.deployment}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 60 });
      if (result.exitCode !== 0) return JSON.stringify({ error: `kubectl rollout ${input.action} failed`, stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_exec',
      description: 'Execute a command inside a Kubernetes pod.',
      input_schema: {
        type: 'object',
        properties: {
          pod: { type: 'string', description: 'Pod name' },
          command: { type: 'string', description: 'Command to execute' },
          namespace: { type: 'string', description: 'Namespace' },
          container: { type: 'string', description: 'Container name' },
        },
        required: ['pod', 'command'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl exec ${input.pod}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;
      if (input.container) cmd += ` -c ${input.container}`;
      cmd += ` -- ${input.command}`;

      const result = await shellExec(cmd, { timeout: 120 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl exec failed', stderr: result.stderr, stdout: result.stdout });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_get_namespaces',
      description: 'List all Kubernetes namespaces.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const result = await shellExec('kubectl get namespaces -o json', { timeout: 15 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl failed', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { items: Array<{ metadata: { name: string }; status: { phase: string } }> };
        return JSON.stringify(data.items.map(n => ({
          name: n.metadata.name,
          status: n.status.phase,
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_describe',
      description: 'Describe a Kubernetes resource in detail.',
      input_schema: {
        type: 'object',
        properties: {
          resource: { type: 'string', description: 'Resource type (pod, deployment, service, node, etc.)' },
          name: { type: 'string', description: 'Resource name' },
          namespace: { type: 'string', description: 'Namespace' },
        },
        required: ['resource', 'name'],
      },
    },
    handler: async (input) => {
      let cmd = `kubectl describe ${input.resource} ${input.name}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl describe failed', stderr: result.stderr });
      const output = result.stdout;
      return output.length > 10000 ? output.substring(output.length - 10000) : output;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_get_nodes',
      description: 'List Kubernetes cluster nodes with status.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const result = await shellExec('kubectl get nodes -o json', { timeout: 15 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'kubectl failed', stderr: result.stderr });

      try {
        const data = JSON.parse(result.stdout) as { items: Array<{ metadata: { name: string }; status: { conditions: Array<{ type: string; status: string }> } }> };
        return JSON.stringify(data.items.map(n => ({
          name: n.metadata.name,
          ready: n.status.conditions.find(c => c.type === 'Ready')?.status === 'True',
        })), null, 2);
      } catch {
        return result.stdout;
      }
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'k8s_port_forward',
      description: 'Start port-forwarding to a Kubernetes pod or service (runs in background).',
      input_schema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target (e.g. "pod/mypod" or "svc/myservice")' },
          ports: { type: 'string', description: 'Port mapping (e.g. "8080:80")' },
          namespace: { type: 'string', description: 'Namespace' },
        },
        required: ['target', 'ports'],
      },
    },
    handler: async (input) => {
      const { shellBackground } = await import('./shell/process-manager.js');
      let cmd = `kubectl port-forward ${input.target} ${input.ports}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;

      const session = shellBackground(cmd, {});
      return JSON.stringify({ sessionId: session.sessionId, pid: session.pid, message: `Port-forward started: ${input.target} ${input.ports}` });
    },
  });

  // ─── Helm Tools ───

  registry.register({
    category: 'deploy',
    definition: {
      name: 'helm_list',
      description: 'List Helm releases.',
      input_schema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace' },
          all_namespaces: { type: 'boolean', description: 'All namespaces' },
        },
      },
    },
    handler: async (input) => {
      let cmd = 'helm list -o json';
      if (input.all_namespaces) cmd += ' --all-namespaces';
      else if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 30 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'helm list failed', stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'helm_install',
      description: 'Install or upgrade a Helm chart.',
      input_schema: {
        type: 'object',
        properties: {
          release: { type: 'string', description: 'Release name' },
          chart: { type: 'string', description: 'Chart reference (e.g. "bitnami/nginx")' },
          namespace: { type: 'string', description: 'Target namespace' },
          values_file: { type: 'string', description: 'Path to values YAML file' },
          set_values: { type: 'object', description: 'Key-value pairs to --set' },
          upgrade: { type: 'boolean', description: 'Use helm upgrade --install' },
          dry_run: { type: 'boolean', description: 'Dry run' },
        },
        required: ['release', 'chart'],
      },
    },
    handler: async (input) => {
      const action = input.upgrade ? 'upgrade --install' : 'install';
      let cmd = `helm ${action} ${input.release} ${input.chart}`;
      if (input.namespace) cmd += ` -n ${input.namespace} --create-namespace`;
      if (input.values_file) cmd += ` -f ${input.values_file}`;
      if (input.set_values) {
        for (const [k, v] of Object.entries(input.set_values as Record<string, string>)) {
          cmd += ` --set ${k}=${v}`;
        }
      }
      if (input.dry_run) cmd += ' --dry-run';

      const result = await shellExec(cmd, { timeout: 300 });
      if (result.exitCode !== 0) return JSON.stringify({ error: `helm ${action} failed`, stderr: result.stderr });
      return result.stdout;
    },
  });

  registry.register({
    category: 'deploy',
    definition: {
      name: 'helm_uninstall',
      description: 'Uninstall a Helm release.',
      input_schema: {
        type: 'object',
        properties: {
          release: { type: 'string', description: 'Release name' },
          namespace: { type: 'string', description: 'Namespace' },
        },
        required: ['release'],
      },
    },
    handler: async (input) => {
      let cmd = `helm uninstall ${input.release}`;
      if (input.namespace) cmd += ` -n ${input.namespace}`;

      const result = await shellExec(cmd, { timeout: 60 });
      if (result.exitCode !== 0) return JSON.stringify({ error: 'helm uninstall failed', stderr: result.stderr });
      return result.stdout;
    },
  });
}
