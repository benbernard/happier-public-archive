import { describe, expect, it } from 'vitest';
import { isDirectSessionTurnCompletion as completed } from './directSessionTurnCompletion.js';

describe('direct session turn completion', () => {
  it.each(['end_turn', 'stop_sequence'])('accepts Claude %s', (stop_reason) => {
    expect(completed({ id: 'one', createdAtMs: 1, raw: { role: 'agent', content: {
      type: 'output', data: { type: 'assistant', message: { stop_reason } },
    } } })).toBe(true);
  });
  it.each([null, 'tool_use', 'max_tokens'])('rejects unfinished assistant output (%s)', (stop_reason) => {
    expect(completed({ id: 'one', createdAtMs: 1, raw: { type: 'assistant', message: { stop_reason } } })).toBe(false);
  });
  it('accepts explicit ready events, but not completed sidechain messages', () => {
    expect(completed({ id: 'one', createdAtMs: 1, raw: { role: 'agent', content: { type: 'event', data: { type: 'ready' } } } })).toBe(true);
    expect(completed({ id: 'two', createdAtMs: 2, raw: { type: 'assistant', isSidechain: true, message: { stop_reason: 'end_turn' } } })).toBe(false);
  });
});
