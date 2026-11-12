import { describe, expect, it } from 'vitest';
import { isDirectSessionTurnCompletion } from '@happier-dev/protocol';
import { mapOpenCodeMessageToDirectItem } from '@/backends/opencode/directSessions/mapOpenCodeMessageToDirectItem';
import { mapPiSessionToDirectMessages } from '@/backends/pi/directSessions/mapPiSessionToDirectMessages';

describe('provider completion evidence survives direct transcript projection', () => {
  it.each([['stop', true], ['tool-calls', false]] as const)('OpenCode finish %s', (finish, expected) => {
    const item = mapOpenCodeMessageToDirectItem({ info: { id: 'one', role: 'assistant', finish,
      time: { created: 1, completed: 2 } }, parts: [{ type: 'text', text: 'answer' }] }, 0);
    expect(item).not.toBeNull();
    expect(isDirectSessionTurnCompletion(item!)).toBe(expected);
  });
  it.each([['stop', true], ['toolUse', false]] as const)('Pi stopReason %s', (stopReason, expected) => {
    const [item] = mapPiSessionToDirectMessages({ fileRelPath: 'session.jsonl', entries: [{
      type: 'message', id: 'one', parentId: null, timestamp: '2026-11-12T08:00:00Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'answer' }], stopReason },
    }] });
    expect(isDirectSessionTurnCompletion(item)).toBe(expected);
  });
});
