import { resolveEffectiveServersV1 } from './resolveEffectiveServersV1.js';
import { describe, expect, it } from 'vitest';
import { McpServerCatalogEntryV1Schema } from './settingsV1.js';
import { inferMcpServerAuthModeV1 } from './authModeV1.js';
import { DaemonMcpOAuthRequestSchema, DaemonMcpOAuthResponseSchema } from './daemonRpcV1.js';

describe('HTTP MCP OAuth contract', () => {
  it('keeps optional public client settings and identifies OAuth servers', () => {
    const server = McpServerCatalogEntryV1Schema.parse({ id: 'one', name: 'example', transport: 'http',
      remote: { url: 'https://mcp.example', headers: {}, oauth: { clientId: 'registered', scope: 'tools' } }, env: {}, createdAt: 1, updatedAt: 1 });
    expect(inferMcpServerAuthModeV1(server)).toBe('oauth');
    const resolved = resolveEffectiveServersV1({ v: 1, strictMode: true, servers: [server], bindings: [{
      id: 'binding', serverId: server.id, enabled: true, target: { t: 'machine', machineId: 'machine' },
      overrides: { remote: { url: 'https://override.example/mcp' } }, createdAt: 1, updatedAt: 1,
    }] }, { machineId: 'machine', directory: '/' }).serversByName.example.config;
    expect(resolved.remote).toEqual({ ...server.remote, url: 'https://override.example/mcp' });
    expect(DaemonMcpOAuthRequestSchema.parse({ action: 'start', server })).toEqual({ action: 'start', server });
    expect(DaemonMcpOAuthResponseSchema.parse({ status: 'connected', access_token: 'should-not-travel' })).toEqual({ status: 'connected' });
  });
});
