import { describe, expect, it } from 'vitest';
import { mapCodexRolloutLineToDirectMessages } from './mapCodexRolloutLineToDirectMessages';
import { mapCodexRolloutEventToActions } from '../localControl/rolloutMapper';

function project(type: string, sidechainId: string | null = null) {
  const lineValue = { timestamp: '2026-11-12T08:00:00Z', type: 'event_msg', payload: { type, turn_id: 'turn-1' } };
  return mapCodexRolloutLineToDirectMessages({ fileRelPath: 'session.jsonl', lineStartOffsetBytes: 100,
    lineValue, actions: mapCodexRolloutEventToActions(lineValue, { debug: false }), sidechainId });
}

describe('Codex direct turn notification evidence', () => {
  it.each(['task_complete', 'turn_complete'])('preserves %s as a ready event', (type) => {
    expect(project(type)).toEqual([expect.objectContaining({ raw: {
      role: 'agent', content: expect.objectContaining({ type: 'event', data: { type: 'ready' } }),
    } })]);
  });
  it('does not return the parent turn for starts, interruptions, or subagent completion', () => {
    expect(project('task_started')).toEqual([]);
    expect(project('turn_aborted')).toEqual([]);
    expect(project('task_complete', 'child')).toEqual([]);
  });
});
