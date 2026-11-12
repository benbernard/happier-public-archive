import * as React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/ui/text/Text';
import { Typography } from '@/constants/Typography';
import { useNowMs } from '@/hooks/time/useNowMs';
import { formatRelativeTimeShort } from '@/components/ui/selectionList/formatRelativeTimeShort';
import { Modal } from '@/modal';
import { t } from '@/text';

import { RowActionRevealSlot } from './RowActionRevealSlot';

function NativeMessageTimestamp(props: Readonly<{
    messageId: string;
    createdAt: number;
    fullTimestamp: string;
}>): React.ReactElement {
    const nowMs = useNowMs();
    return (
        <Pressable
            testID={`transcript-message-timestamp-button:${props.messageId}`}
            accessibilityRole="button"
            accessibilityLabel={props.fullTimestamp}
            onPress={() => Modal.alert(t('common.details'), props.fullTimestamp)}
            style={styles.timestampButton}
        >
            <Text testID={`transcript-message-timestamp:${props.messageId}`}
                style={[styles.timestampText, Typography.tabular()]}>
                {formatRelativeTimeShort(props.createdAt, nowMs)}
            </Text>
        </Pressable>
    );
}

/**
 * Timestamp + hover-revealed actions for one transcript message.
 *
 * The pin has its own reveal slot: a pinned row must keep showing its pin
 * without dragging the rest of the actions — or the timestamp presentation —
 * into view. The container never captures pointer input; each slot owns whether
 * its own children are clickable.
 */
export function MessageActionRow(props: Readonly<{
    children: React.ReactNode;
    isWeb: boolean;
    invertTimestampAndActions: boolean;
    messageId: string;
    showActions: boolean;
    showPinAction?: boolean;
    pinAction?: React.ReactNode;
    onActionsFocus?: () => void;
    onActionsBlur?: () => void;
    timestampText: string | null;
    timestampCreatedAt: number;
}>): React.ReactElement {
    const hasTimestamp = typeof props.timestampText === 'string' && props.timestampText.length > 0;
    return (
        <View
            {...(props.isWeb ? {} : { pointerEvents: 'box-none' as const })}
            style={[
                styles.container,
                props.invertTimestampAndActions ? styles.containerInverted : null,
                props.isWeb ? styles.containerWebPointerEvents : null,
            ]}
            testID={`transcript-message-actions-row:${props.messageId}`}
        >
            {hasTimestamp && !props.isWeb ? (
                <NativeMessageTimestamp messageId={props.messageId}
                    createdAt={props.timestampCreatedAt} fullTimestamp={props.timestampText!} />
            ) : hasTimestamp ? (
                <Text
                    testID={`transcript-message-timestamp:${props.messageId}`}
                    style={[
                        styles.timestampText,
                        props.invertTimestampAndActions ? styles.timestampTextInverted : null,
                    ]}
                >
                    {props.timestampText}
                </Text>
            ) : null}
            {props.pinAction ? (
                <RowActionRevealSlot
                    revealed={props.showPinAction === true}
                    onFocus={props.onActionsFocus}
                    onBlur={props.onActionsBlur}
                    testID={`transcript-message-pin-slot:${props.messageId}`}
                >
                    {props.pinAction}
                </RowActionRevealSlot>
            ) : null}
            <RowActionRevealSlot
                revealed={props.showActions}
                onFocus={props.onActionsFocus}
                onBlur={props.onActionsBlur}
                testID={`transcript-message-actions:${props.messageId}`}
            >
                {props.children}
            </RowActionRevealSlot>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    containerInverted: {
        flexDirection: 'row-reverse',
    },
    containerWebPointerEvents: {
        pointerEvents: 'box-none',
    },
    timestampButton: {
        minWidth: 48,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    timestampText: {
        color: theme.colors.text.tertiary,
        fontSize: 11,
        lineHeight: 16,
        marginRight: 8,
    },
    timestampTextInverted: {
        marginLeft: 12,
        marginRight: 0,
    },
}));
