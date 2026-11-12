import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

/** Shared by local and remote alerts so each server/session owns one tray entry. */
export function resolveSessionNotificationIdentifier(data: Record<string, unknown> | undefined): string | undefined {
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  if (!sessionId) return undefined;
  const serverUrl = typeof data?.serverUrl === 'string' ? data.serverUrl.trim().replace(/\/+$/, '') : '';
  return bytesToHex(sha256(JSON.stringify([serverUrl, sessionId])));
}
