import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationFullSchema, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { configuration } from '@/configuration';
import { readCredentials } from '@/persistence';
import { readAccountIdFromToken } from '@/daemon/machineIdentity/resolveMachineRegistrationIdentity';
import { readProtectedLocalStateFile, writeProtectedLocalStateFileAtomic, removeProtectedLocalStateFile } from '@/utils/fs/protectedLocalState';

const storedSchema = z.object({
  client: OAuthClientInformationFullSchema.optional(), tokens: OAuthTokensSchema.optional(),
});
export type McpOAuthConfiguration = Readonly<{ clientId?: string; scope?: string }>;

export async function createMcpOAuthProvider(params: Readonly<{
  serverUrl: string;
  oauth: McpOAuthConfiguration;
  redirectUrl: string;
  state?: string;
  onAuthorization?: (url: URL) => void;
  storagePath?: string;
}>): Promise<OAuthClientProvider & { disconnect(): Promise<void> }> {
  const credentials = params.storagePath ? null : await readCredentials();
  const accountId = credentials ? readAccountIdFromToken(credentials.token) : null;
  if (!params.storagePath && !accountId) throw new Error('Sign in to Happier before connecting an MCP server.');
  const digest = createHash('sha256').update(JSON.stringify([accountId, params.serverUrl, params.oauth.clientId ?? null])).digest('hex');
  const path = params.storagePath ?? join(configuration.activeServerDir, 'mcp-oauth', `${digest}.json`);
  const load = async (): Promise<z.infer<typeof storedSchema>> => {
    try { return storedSchema.parse(JSON.parse(await readProtectedLocalStateFile(path))); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
      throw error;
    }
  };
  let verifier: string | undefined;
  let discovery: OAuthDiscoveryState | undefined;
  const save = (stored: z.infer<typeof storedSchema>) => writeProtectedLocalStateFileAtomic(path, JSON.stringify(stored));
  return {
    redirectUrl: params.redirectUrl,
    clientMetadata: { client_name: 'Happier', redirect_uris: [params.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      ...(params.oauth.scope ? { scope: params.oauth.scope } : {}),
    },
    state: () => {
      if (!params.state) throw new Error('Sign in to this MCP server in Happier settings.');
      return params.state;
    },
    clientInformation: async (): Promise<OAuthClientInformationMixed | undefined> => params.oauth.clientId
      ? { client_id: params.oauth.clientId } : (await load()).client,
    saveClientInformation: async (client) => { await save({ ...await load(), client: OAuthClientInformationFullSchema.parse(client) }); },
    tokens: async (): Promise<OAuthTokens | undefined> => (await load()).tokens,
    saveTokens: async (tokens) => { await save({ ...await load(), tokens }); },
    redirectToAuthorization: (url) => {
      if (!params.onAuthorization) throw new Error('Sign in to this MCP server in Happier settings.');
      params.onAuthorization(url);
    },
    saveCodeVerifier: (value) => { verifier = value; },
    codeVerifier: () => {
      if (!verifier) throw new Error('MCP sign-in expired. Start again in Happier.');
      return verifier;
    },
    saveDiscoveryState: (value) => { discovery = value; },
    discoveryState: () => discovery,
    invalidateCredentials: async (scope) => {
      const stored = await load();
      if (scope === 'all' || scope === 'client') delete stored.client;
      if (scope === 'all' || scope === 'tokens') delete stored.tokens;
      if (scope === 'all' || scope === 'verifier') verifier = undefined;
      if (scope === 'all' || scope === 'discovery') discovery = undefined;
      await save(stored);
    },
    disconnect: async () => {
      await removeProtectedLocalStateFile(path).catch((error: unknown) => {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
      });
    },
  };
}
