import * as React from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act } from 'react-test-renderer';

import { renderScreen, standardCleanup } from '@/dev/testkit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function flattenStyle(style: unknown): Record<string, unknown> {
    if (Array.isArray(style)) {
        return Object.assign({}, ...style.map((entry) => flattenStyle(entry)));
    }
    if (style && typeof style === 'object') {
        return style as Record<string, unknown>;
    }
    return {};
}

function readOpacity(style: unknown): number | undefined {
    const opacity = flattenStyle(style).opacity;
    if (typeof opacity === 'number') return opacity;
    const animated = opacity as { __getValue?: () => number } | undefined;
    return typeof animated?.__getValue === 'function' ? animated.__getValue() : undefined;
}

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock();
});

vi.mock('react-native-unistyles', async () => {
    const { createUnistylesMock } = await import('@/dev/testkit/mocks/unistyles');
    return createUnistylesMock();
});

vi.mock('@/components/ui/text/Text', () => ({
    Text: (props: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, props.children),
}));

vi.mock('@/modal', async () => {
    const { createModalModuleMock } = await import('@/dev/testkit/mocks/modal');
    return createModalModuleMock().module;
});

describe('MessageActionRow', () => {
    afterEach(() => {
        standardCleanup();
        vi.useRealTimers();
    });

    it('shows a native message age, advances it, and reveals its local date on press', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-11T20:05:00Z'));
        const { MessageActionRow } = await import('./MessageActionRow');
        const { Modal } = await import('@/modal');
        const screen = await renderScreen(
            <MessageActionRow messageId="native" timestampCreatedAt={Date.now() - 300_000}
                timestampText="Nov 11, 2026, 12:00 PM" showActions={false}
                isWeb={false} invertTimestampAndActions={false}>
                <View />
            </MessageActionRow>,
        );
        expect(screen.findByTestId('transcript-message-timestamp:native')?.props.children).toBe('5m ago');
        await act(async () => { vi.advanceTimersByTime(60_000); });
        expect(screen.findByTestId('transcript-message-timestamp:native')?.props.children).toBe('6m ago');
        await act(async () => {
            screen.findByTestId('transcript-message-timestamp-button:native')?.props.onPress();
        });
        expect(Modal.alert).toHaveBeenCalledWith(expect.any(String), 'Nov 11, 2026, 12:00 PM');
    });

    it('renders timestamp and action slot with stable row test ids', async () => {
        const { MessageActionRow } = await import('./MessageActionRow');

        const screen = await renderScreen(
            <MessageActionRow
                messageId="m1"
                timestampCreatedAt={1}
                timestampText="May 19, 2026, 4:30 PM"
                showActions
                isWeb
                invertTimestampAndActions={false}
            >
                <View testID="child-action" />
            </MessageActionRow>,
        );

        expect(screen.findByTestId('transcript-message-actions-row:m1')).toBeTruthy();
        expect(screen.findByTestId('transcript-message-timestamp:m1')?.props.children).toBe('May 19, 2026, 4:30 PM');
        expect(readOpacity(screen.findByTestId('transcript-message-actions:m1')?.props.style)).toBe(1);
        expect(screen.findByTestId('child-action')).toBeTruthy();
    });

    it('hides the action slot without letting the row capture pointer input', async () => {
        const { MessageActionRow } = await import('./MessageActionRow');

        const screen = await renderScreen(
            <MessageActionRow
                messageId="hidden"
                timestampCreatedAt={1}
                timestampText={null}
                showActions={false}
                isWeb={false}
                invertTimestampAndActions={false}
            >
                <View testID="hidden-child-action" />
            </MessageActionRow>,
        );

        const row = screen.findByTestId('transcript-message-actions-row:hidden');
        const actions = screen.findByTestId('transcript-message-actions:hidden');

        expect(screen.findAllByTestId('transcript-message-timestamp:hidden')).toHaveLength(0);
        expect(row?.props.pointerEvents).toBe('box-none');
        expect(readOpacity(actions?.props.style)).toBe(0);
        expect(flattenStyle(actions?.props.style).pointerEvents).toBe('none');
    });

    it('keeps a pinned pin visible while the rest of the actions stay hidden', async () => {
        const { MessageActionRow } = await import('./MessageActionRow');

        const screen = await renderScreen(
            <MessageActionRow
                messageId="pinned"
                timestampCreatedAt={1}
                timestampText={null}
                showActions={false}
                showPinAction
                pinAction={<View testID="pin-action" />}
                isWeb
                invertTimestampAndActions={false}
            >
                <View testID="other-action" />
            </MessageActionRow>,
        );

        expect(readOpacity(screen.findByTestId('transcript-message-pin-slot:pinned')?.props.style)).toBe(1);
        expect(readOpacity(screen.findByTestId('transcript-message-actions:pinned')?.props.style)).toBe(0);
    });

    it('uses style-level pointer events on web and inverts timestamp spacing when requested', async () => {
        const { MessageActionRow } = await import('./MessageActionRow');

        const screen = await renderScreen(
            <MessageActionRow
                messageId="web-inverted"
                timestampCreatedAt={1}
                timestampText="Now"
                showActions={false}
                isWeb
                invertTimestampAndActions
            >
                <View testID="web-child-action" />
            </MessageActionRow>,
        );

        const row = screen.findByTestId('transcript-message-actions-row:web-inverted');
        const timestamp = screen.findByTestId('transcript-message-timestamp:web-inverted');

        expect(row?.props.pointerEvents).toBeUndefined();
        expect(flattenStyle(row?.props.style)).toEqual(expect.objectContaining({
            flexDirection: 'row-reverse',
            pointerEvents: 'box-none',
        }));
        expect(flattenStyle(timestamp?.props.style)).toEqual(expect.objectContaining({
            marginLeft: 12,
            marginRight: 0,
        }));
    });
});
