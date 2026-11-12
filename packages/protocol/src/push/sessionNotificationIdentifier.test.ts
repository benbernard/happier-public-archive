import { describe, expect, it } from 'vitest';
import { resolveSessionNotificationIdentifier as identifier } from './sessionNotificationIdentifier.js';

describe('session notification identity', () => {
  it('scopes alerts to a server and session, regardless of their message or request', () => {
    const data = { serverUrl: 'https://relay.example', sessionId: 'one' };
    expect(identifier({ ...data, requestId: 'first' })).toBe(identifier({ ...data, requestId: 'second' }));
    expect(identifier(data)).not.toBe(identifier({ ...data, sessionId: 'two' }));
    expect(identifier(data)).not.toBe(identifier({ ...data, serverUrl: 'https://other.example' }));
    expect(identifier(data)).toBe(identifier({ ...data, serverUrl: data.serverUrl + '/' }));
    expect(identifier(data)).toHaveLength(64);
  });
  it('leaves non-session alerts independent', () => {
    expect(identifier(undefined)).toBeUndefined();
    expect(identifier({ kind: 'account' })).toBeUndefined();
  });
});
