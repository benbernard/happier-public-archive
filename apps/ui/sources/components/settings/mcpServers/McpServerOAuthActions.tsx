import * as React from 'react';
import type { McpServerCatalogEntryV1 } from '@happier-dev/protocol';
import { Item } from '@/components/ui/lists/Item';
import { machineMcpOAuth } from '@/sync/ops/machineMcpServers';
import { useHappyAction } from '@/hooks/ui/useHappyAction';
import { Modal } from '@/modal';
import { t } from '@/text';

export function McpServerOAuthActions(props: Readonly<{ server: McpServerCatalogEntryV1; machineId: string | null; serverId?: string | null }>) {
    const [flowId, setFlowId] = React.useState<string | null>(null);
    const [connected, setConnected] = React.useState(false);
    React.useEffect(() => { setFlowId(null); setConnected(false); }, [props.machineId, props.serverId, props.server.remote?.url, props.server.remote?.oauth?.clientId]);
    React.useEffect(() => {
        if (!flowId || !props.machineId) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const result = await machineMcpOAuth(props.machineId!, { action: 'status', flowId }, { serverId: props.serverId });
                if (disposed) return;
                if (result.status === 'pending') { timer = setTimeout(poll, 2_000); return; }
                setFlowId(null);
                setConnected(result.status === 'connected');
                if (result.status === 'error') Modal.alert(t('common.error'), result.error);
            } catch {
                if (!disposed) { setFlowId(null); Modal.alert(t('common.error'), t('errors.operationFailed')); }
            }
        };
        timer = setTimeout(poll, 2_000);
        return () => { disposed = true; clearTimeout(timer); };
    }, [flowId, props.machineId, props.serverId]);
    const [busy, signIn] = useHappyAction(async () => {
        if (!props.machineId) return;
        const result = await machineMcpOAuth(props.machineId, { action: 'start', server: props.server }, { serverId: props.serverId });
        if (result.status === 'error') { Modal.alert(t('common.error'), result.error); return; }
        if (result.status === 'connected') { setConnected(true); return; }
        if (result.status === 'authorize') {
            setFlowId(result.flowId);
            const browser = await import('expo-web-browser');
            await browser.openBrowserAsync(result.authorizationUrl);
        }
    });
    const [disconnecting, disconnect] = useHappyAction(async () => {
        if (!props.machineId) return;
        const result = await machineMcpOAuth(props.machineId, { action: 'disconnect', server: props.server }, { serverId: props.serverId });
        if (result.status === 'error') { Modal.alert(t('common.error'), result.error); return; }
        setFlowId(null); setConnected(false);
    });
    return <>
        <Item testID="mcp.server.oauth.signIn" title={t('settings.mcpOAuthSignIn')}
            subtitle={flowId ? t('settings.mcpOAuthWaiting') : connected ? t('settings.mcpOAuthConnected') : undefined}
            onPress={signIn} disabled={!props.machineId || busy || Boolean(flowId)} />
        <Item testID="mcp.server.oauth.disconnect" title={t('settings.mcpOAuthDisconnect')}
            onPress={disconnect} disabled={!props.machineId || disconnecting} />
    </>;
}
