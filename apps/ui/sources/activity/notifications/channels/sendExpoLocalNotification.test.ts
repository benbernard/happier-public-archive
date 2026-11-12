import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleNotificationAsync = vi.hoisted(() => vi.fn(async (_request: { identifier?: string; content: unknown; trigger: null }) => 'notif-1'));
const notificationNativeState = vi.hoisted(() => ({ unavailable: false }));

vi.mock('expo-notifications', () => {
    if (notificationNativeState.unavailable) {
        throw new Error('expo-notifications native module unavailable');
    }
    return {
        scheduleNotificationAsync,
    };
});

describe('sendExpoLocalNotification', () => {
    beforeEach(() => {
        vi.resetModules();
        notificationNativeState.unavailable = false;
        scheduleNotificationAsync.mockClear();
    });

    it('does not load expo-notifications while importing the channel module', async () => {
        notificationNativeState.unavailable = true;

        await expect(import('./sendExpoLocalNotification')).resolves.toHaveProperty('sendExpoLocalNotification');
    });

    it('schedules an immediate local notification with navigation data', async () => {
        const { sendExpoLocalNotification } = await import('./sendExpoLocalNotification');

        await sendExpoLocalNotification({
            title: 'Session ready',
            body: 'Codex finished the turn.',
            data: { sessionId: 'session-1' },
            categoryIdentifier: 'ready_category',
        });

        expect(scheduleNotificationAsync).toHaveBeenCalledWith({
            identifier: expect.any(String),
            content: {
                title: 'Session ready',
                body: 'Codex finished the turn.',
                data: { sessionId: 'session-1' },
                categoryIdentifier: 'ready_category',
                sound: 'default',
            },
            trigger: null,
        });
    });

    it('reuses the notification identifier for the latest alert in a session', async () => {
        const { sendExpoLocalNotification } = await import('./sendExpoLocalNotification');
        for (const sessionId of ['one', 'one', 'two']) {
            await sendExpoLocalNotification({ title: 'Ready', body: 'Latest', data: { sessionId } });
        }
        const requests = scheduleNotificationAsync.mock.calls.map((call) => call[0]);
        expect(requests[0].identifier).toEqual(expect.any(String));
        expect(requests[1].identifier).toBe(requests[0].identifier);
        expect(requests[2].identifier).not.toBe(requests[0].identifier);
    });

    it('omits the native category field when no category is provided', async () => {
        const { sendExpoLocalNotification } = await import('./sendExpoLocalNotification');

        await sendExpoLocalNotification({
            title: 'Session ready',
            body: 'Codex finished the turn.',
            data: { sessionId: 'session-1' },
            categoryIdentifier: null as unknown as string,
        });

        expect(scheduleNotificationAsync).toHaveBeenCalledWith({
            identifier: expect.any(String),
            content: {
                title: 'Session ready',
                body: 'Codex finished the turn.',
                data: { sessionId: 'session-1' },
                sound: 'default',
            },
            trigger: null,
        });
    });
});
