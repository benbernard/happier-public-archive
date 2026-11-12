import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { createMcpOAuthProvider } from './createMcpOAuthProvider';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

describe('MCP OAuth provider', () => {
  it.each([undefined, 'registered-client'])('discovers, exchanges with PKCE, persists, refreshes and disconnects (client %s)', async (clientId) => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-oauth-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    let base = '';
    const tokenRequests: URLSearchParams[] = [];
    const server = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      const url = new URL(request.url ?? '/', base);
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        response.end(JSON.stringify({ resource: `${base}/mcp`, authorization_servers: [base] })); return;
      }
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        response.end(JSON.stringify({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'] })); return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      if (url.pathname === '/register') {
        response.end(JSON.stringify({ ...JSON.parse(body), client_id: 'registered-client' })); return;
      }
      if (url.pathname === '/token') {
        tokenRequests.push(new URLSearchParams(body));
        response.end(JSON.stringify({ access_token: `access-${tokenRequests.length}`, token_type: 'Bearer', refresh_token: 'refresh', expires_in: 3600 })); return;
      }
      response.statusCode = 404; response.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    base = `http://127.0.0.1:${address.port}`;
    let authorizationUrl: URL | undefined;
    const params = { serverUrl: `${base}/mcp`, oauth: { clientId }, redirectUrl: 'https://happier.example/v1/mcp/oauth/callback',
      storagePath: join(root, 'credentials.json') };
    const provider = await createMcpOAuthProvider({ ...params, state: 'flow-state', onAuthorization: url => { authorizationUrl = url; } });
    expect(await auth(provider, { serverUrl: params.serverUrl })).toBe('REDIRECT');
    expect(authorizationUrl?.searchParams.get('state')).toBe('flow-state');
    expect(authorizationUrl?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(await auth(provider, { serverUrl: params.serverUrl, authorizationCode: 'authorization-code' })).toBe('AUTHORIZED');
    const verifier = tokenRequests[0].get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(authorizationUrl?.searchParams.get('code_challenge'));
    expect(tokenRequests[0].get('redirect_uri')).toBe(params.redirectUrl);
    expect(tokenRequests[0].get('resource')).toBe(params.serverUrl);
    expect((await stat(params.storagePath)).mode & 0o777).toBe(0o600);
    const retained = await createMcpOAuthProvider(params);
    const restored = await createMcpOAuthProvider(params);
    expect((await restored.tokens())?.access_token).toBe('access-1');
    expect(await auth(restored, { serverUrl: params.serverUrl })).toBe('AUTHORIZED');
    expect(tokenRequests[1].get('grant_type')).toBe('refresh_token');
    expect((await restored.tokens())?.access_token).toBe('access-2');
    expect((await retained.tokens())?.access_token).toBe('access-2');
    await restored.disconnect();
    expect(await retained.tokens()).toBeUndefined();
    expect(await (await createMcpOAuthProvider(params)).tokens()).toBeUndefined();
  });
});
