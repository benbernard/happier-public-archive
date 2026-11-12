import { resolveSessionNotificationIdentifier } from '@happier-dev/protocol';
import { loadExpoNotifications } from '@/utils/platform/loadExpoNotifications';

export async function sendExpoLocalNotification(params: Readonly<{
    title: string;
    body: string;
    data?: Record<string, unknown>;
    categoryIdentifier?: string | null;
}>): Promise<string> {
    const Notifications = await loadExpoNotifications();
    const categoryIdentifier = typeof params.categoryIdentifier === 'string' && params.categoryIdentifier.trim().length > 0
        ? params.categoryIdentifier
        : undefined;
    const identifier = resolveSessionNotificationIdentifier(params.data);
    return Notifications.scheduleNotificationAsync({
        ...(identifier ? { identifier } : {}),
        content: {
            title: params.title,
            body: params.body,
            data: params.data,
            ...(categoryIdentifier ? { categoryIdentifier } : {}),
            sound: 'default',
        },
        trigger: null,
    });
}
