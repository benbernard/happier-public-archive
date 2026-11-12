import { isDirectSessionTurnCompletion, type DirectTranscriptRawMessageV1 } from '@happier-dev/protocol';

import { normalizeRawMessage, type NormalizedMessage } from '@/sync/typesRaw';

export function normalizeDirectTranscriptMessages(items: ReadonlyArray<DirectTranscriptRawMessageV1>): NormalizedMessage[] {
    const out: NormalizedMessage[] = [];
    for (const item of items) {
        const normalized = normalizeRawMessage(
            item.id,
            typeof item.localId === 'string' ? item.localId : null,
            item.createdAtMs,
            item.raw,
            { messageRole: item.messageRole ?? undefined },
        );
        if (normalized) out.push(normalized);
        if (isDirectSessionTurnCompletion(item) && !(normalized?.role === 'event' && normalized.content.type === 'ready')) {
            const id = `${item.id}:turn-ready`;
            const ready = normalizeRawMessage(id, id, item.createdAtMs, {
                role: 'agent', content: { type: 'event', id, data: { type: 'ready' } },
            });
            if (ready) out.push(ready);
        }
    }
    return out;
}
