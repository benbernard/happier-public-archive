import type { DirectTranscriptRawMessageV1 } from './daemonRpcV1.js';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Only explicit completion evidence returns the conversation turn to the user. */
export function isDirectSessionTurnCompletion(item: DirectTranscriptRawMessageV1): boolean {
  const raw = record(item.raw);
  if (!raw || raw.role === 'user') return false;
  const content = record(raw.content);
  const data = record(content?.data);
  if ((content?.type === 'codex' || content?.type === 'acp') && data?.type === 'message') {
    return data.turnCompleted === true && !data.sidechainId;
  }
  if (content?.type === 'event') return data?.type === 'ready';
  const output = content?.type === 'output' ? data : raw;
  if (output?.type !== 'assistant' || output.isSidechain === true) return false;
  const message = record(output.message);
  return message?.stop_reason === 'end_turn' || message?.stop_reason === 'stop_sequence';
}
