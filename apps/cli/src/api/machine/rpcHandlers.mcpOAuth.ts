import axios from 'axios';
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { RPC_METHODS } from '@happier-dev/protocol/rpc';
import { DaemonMcpOAuthRequestSchema, type DaemonMcpOAuthResponse } from '@happier-dev/protocol';
import { configuration } from '@/configuration';
import { readCredentials } from '@/persistence';
import { createMcpOAuthProvider } from '@/mcp/oauth/createMcpOAuthProvider';
import type { RpcHandlerManager } from '../rpc/RpcHandlerManager';
import { z } from 'zod';

const returnedSchema = z.discriminatedUnion('status', [z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('returned'), code: z.string().optional(), error: z.string().optional(), issuer: z.string().optional() })]);

export function registerMachineMcpOAuthRpcHandlers(manager: Pick<RpcHandlerManager, 'registerHandler'>): void {
  const flows = new Map<string, { provider: OAuthClientProvider; serverUrl: string; accountToken: string; expiresAt: number }>();
  manager.registerHandler(RPC_METHODS.DAEMON_MCP_OAUTH, async (raw: unknown): Promise<DaemonMcpOAuthResponse> => {
    const parsed = DaemonMcpOAuthRequestSchema.safeParse(raw);
    if (!parsed.success) return { status: 'error', error: 'Invalid MCP sign-in request.' };
    const credentials = await readCredentials();
    if (!credentials) return { status: 'error', error: 'Sign in to Happier first.' };
    const request = parsed.data;
    const options = { headers: { Authorization: `Bearer ${credentials.token}` }, timeout: 15_000 };
    const relayUrl = configuration.publicServerUrl.replace(/\/+$/, '');
    const redirectUrl = `${relayUrl}/v1/mcp/oauth/callback`;
    for (const [id, flow] of flows) if (flow.expiresAt <= Date.now()) flows.delete(id);
    try {
      if (request.action === 'status') {
        const flow = flows.get(request.flowId);
        if (!flow || flow.accountToken !== credentials.token) return { status: 'error', error: 'MCP sign-in expired. Start again.' };
        const response = returnedSchema.parse((await axios.post(`${relayUrl}/v1/mcp/oauth/flows/${request.flowId}/consume`, {}, options)).data);
        if (response.status === 'pending') return response;
        flows.delete(request.flowId);
        if (response.error || !response.code) return { status: 'error', error: 'MCP sign-in was declined.' };
        const discovery = await flow.provider.discoveryState?.();
        if (response.issuer && response.issuer !== discovery?.authorizationServerMetadata?.issuer) {
          return { status: 'error', error: 'The MCP authorization server did not match this sign-in.' };
        }
        await auth(flow.provider, { serverUrl: flow.serverUrl, authorizationCode: response.code });
        return { status: 'connected' };
      }
      const remote = request.server.remote;
      if (request.server.transport === 'stdio' || !remote?.oauth) return { status: 'error', error: 'Enable OAuth for this HTTP MCP server first.' };
      const url = new URL(remote.url);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
        return { status: 'error', error: 'MCP OAuth requires HTTPS (or localhost for development).' };
      }
      if (request.action === 'disconnect') {
        for (const [id, flow] of flows) {
          if (flow.serverUrl === url.href && flow.accountToken === credentials.token) flows.delete(id);
        }
        const provider = await createMcpOAuthProvider({ serverUrl: url.href, oauth: remote.oauth, redirectUrl });
        await provider.disconnect();
        return { status: 'disconnected' };
      }
      const { flowId } = z.object({ flowId: z.string().regex(/^[a-f0-9]{64}$/) }).parse(
        (await axios.post(`${relayUrl}/v1/mcp/oauth/flows`, {}, options)).data,
      );
      let authorizationUrl: string | undefined;
      const provider = await createMcpOAuthProvider({ serverUrl: url.href, oauth: remote.oauth, redirectUrl,
        state: flowId, onAuthorization: (value) => { authorizationUrl = value.href; } });
      const result = await auth(provider, { serverUrl: url, scope: remote.oauth.scope });
      if (result === 'AUTHORIZED') return { status: 'connected' };
      if (!authorizationUrl) throw new Error('No authorization URL');
      flows.set(flowId, { provider, serverUrl: url.href, accountToken: credentials.token, expiresAt: Date.now() + 10 * 60_000 });
      return { status: 'authorize', flowId, authorizationUrl };
    } catch {
      return { status: 'error', error: 'Could not sign in to this MCP server. Check its OAuth support, client ID, and Happier server version.' };
    }
  });
}
