import * as React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '@/dev/testkit';
import type { McpServerCatalogEntryV1 } from '@happier-dev/protocol';
import { installMcpServersCommonModuleMocks } from './mcpServersTestHelpers';

installMcpServersCommonModuleMocks();
const { rpc, openBrowser } = vi.hoisted(() => ({ rpc: vi.fn(), openBrowser: vi.fn(async () => ({ type: 'opened' })) }));
vi.mock('@/sync/ops/machineMcpServers', () => ({ machineMcpOAuth: rpc }));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: openBrowser }));
vi.mock('@/hooks/ui/useHappyAction', () => ({ useHappyAction: (action: () => Promise<void>) => [false, action] }));
const server: McpServerCatalogEntryV1 = { id: 'mcp', name: 'example', transport: 'http',
    remote: { url: 'https://mcp.example', headers: {}, oauth: {} }, env: {}, createdAt: 1, updatedAt: 1 };

describe('MCP browser sign-in', () => {
    beforeEach(() => { vi.useFakeTimers(); rpc.mockReset(); openBrowser.mockClear(); });
    afterEach(() => { vi.useRealTimers(); });
    it('opens authorization and finishes on the selected machine/server, then disconnects', async () => {
        rpc.mockResolvedValueOnce({ status: 'authorize', flowId: 'flow', authorizationUrl: 'https://issuer.example/authorize' })
            .mockResolvedValueOnce({ status: 'connected' }).mockResolvedValueOnce({ status: 'disconnected' });
        const { McpServerOAuthActions } = await import('./McpServerOAuthActions');
        const screen = await renderScreen(<McpServerOAuthActions server={server} machineId="machine" serverId="relay" />);
        await act(async () => { await screen.findByTestId('mcp.server.oauth.signIn')?.props.onPress(); });
        expect(rpc).toHaveBeenCalledWith('machine', { action: 'start', server }, { serverId: 'relay' });
        expect(openBrowser).toHaveBeenCalledWith('https://issuer.example/authorize');
        expect(screen.findByTestId('mcp.server.oauth.signIn')?.props.subtitle).toBe('settings.mcpOAuthWaiting');
        await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
        expect(rpc).toHaveBeenCalledWith('machine', { action: 'status', flowId: 'flow' }, { serverId: 'relay' });
        expect(screen.findByTestId('mcp.server.oauth.signIn')?.props.subtitle).toBe('settings.mcpOAuthConnected');
        await act(async () => { await screen.findByTestId('mcp.server.oauth.disconnect')?.props.onPress(); });
        expect(rpc).toHaveBeenCalledWith('machine', { action: 'disconnect', server }, { serverId: 'relay' });
        expect(screen.findByTestId('mcp.server.oauth.signIn')?.props.subtitle).toBeUndefined();
    });
});
