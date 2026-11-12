import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMachineMcpOAuthRpcHandlers } from './rpcHandlers.mcpOAuth';
import type { RpcHandlerManager } from '../rpc/RpcHandlerManager';
import type { DaemonMcpOAuthResponse } from '@happier-dev/protocol';
const mocks = vi.hoisted(() => ({ post: vi.fn(), auth: vi.fn(), provider: vi.fn(), token: 'owner', disconnect: vi.fn() }));
vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({ auth: mocks.auth }));
vi.mock('@/mcp/oauth/createMcpOAuthProvider', () => ({ createMcpOAuthProvider: mocks.provider }));
vi.mock('@/persistence', () => ({ readCredentials: async () => ({ token: mocks.token }) }));
vi.mock('@/configuration', () => ({ configuration: { publicServerUrl: 'https://relay.example' } }));
const flowId = 'a'.repeat(64);
const server = { id: 'mcp', name: 'example', transport: 'http', remote: { url: 'https://mcp.example', headers: {}, oauth: {} }, env: {}, createdAt: 1, updatedAt: 1 };

function handler() {
  let invoke: (input: unknown) => Promise<DaemonMcpOAuthResponse>;
  const registerHandler: RpcHandlerManager['registerHandler'] = (_name, fn) => { invoke = fn as typeof invoke; };
  registerMachineMcpOAuthRpcHandlers({ registerHandler });
  return (input: unknown) => invoke(input);
}

describe('MCP OAuth machine RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.token = 'owner';
    mocks.post.mockResolvedValue({ data: { flowId } });
    mocks.provider.mockImplementation(async (params: { onAuthorization?: (url: URL) => void }) => ({
      ...params, discoveryState: () => ({ authorizationServerMetadata: { issuer: 'https://issuer.example' } }), disconnect: mocks.disconnect,
    }));
    mocks.auth.mockImplementation(async (provider: { onAuthorization?: (url: URL) => void }, options: { authorizationCode?: string }) => {
      if (options.authorizationCode) return 'AUTHORIZED';
      provider.onAuthorization?.(new URL('https://issuer.example/authorize'));
      return 'REDIRECT';
    });
  });
  it('exchanges returned codes on the originating machine and never returns tokens', async () => {
    const invoke = handler();
    expect(await invoke({ action: 'start', server })).toEqual({ status: 'authorize', flowId, authorizationUrl: 'https://issuer.example/authorize' });
    mocks.post.mockResolvedValue({ data: { status: 'returned', code: 'code', issuer: 'https://issuer.example' } });
    expect(await invoke({ action: 'status', flowId })).toEqual({ status: 'connected' });
    expect(mocks.auth).toHaveBeenLastCalledWith(expect.anything(), { serverUrl: 'https://mcp.example/', authorizationCode: 'code' });
    expect((await invoke({ action: 'status', flowId })).status).toBe('error');
  });
  it('rejects a different account or issuer and cancels pending sign-in on disconnect', async () => {
    const invoke = handler();
    await invoke({ action: 'start', server });
    mocks.token = 'other';
    expect((await invoke({ action: 'status', flowId })).status).toBe('error');
    mocks.token = 'owner';
    mocks.post.mockResolvedValue({ data: { status: 'returned', code: 'code', issuer: 'https://wrong.example' } });
    expect((await invoke({ action: 'status', flowId })).status).toBe('error');
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    mocks.post.mockResolvedValue({ data: { flowId } });
    await invoke({ action: 'start', server });
    expect(await invoke({ action: 'disconnect', server })).toEqual({ status: 'disconnected' });
    expect((await invoke({ action: 'status', flowId })).status).toBe('error');
  });
});
