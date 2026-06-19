import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import bigInt from "big-integer";

/**
 * Build a gramJS InputPeer from our string peerId + optional accessHash.
 *
 * Convention used across this codebase:
 *   - `"<positive number>"`       → user/bot
 *   - `"-<number>"`               → small chat
 *   - `"-100<number>"`            → channel/supergroup
 *
 * accessHash is required for users and channels; chats don't have one.
 */
export function buildPeer(peerId: string, accessHash: string | null): Api.TypeInputPeer {
  if (peerId.startsWith("-100")) {
    return new Api.InputPeerChannel({
      channelId: bigInt(peerId.slice(4)),
      accessHash: bigInt(accessHash ?? "0"),
    });
  }
  if (peerId.startsWith("-")) {
    return new Api.InputPeerChat({ chatId: bigInt(peerId.slice(1)) });
  }
  return new Api.InputPeerUser({
    userId: bigInt(peerId),
    accessHash: bigInt(accessHash ?? "0"),
  });
}

const PEER_INVALID_RE =
  /PEER_ID_INVALID|CHAT_INVALID|CHANNEL_INVALID|USER_ID_INVALID|peer not found/i;

/**
 * Run a peer-scoped gramJS op, re-resolving the peer once if Telegram rejects
 * the cheap buildPeer() with PEER_ID_INVALID / CHAT_INVALID. That error means
 * the cached access_hash is stale (or never matched THIS session — common
 * when the dialog list was bootstrapped against a different account / model
 * session). On that specific error we fall back to `tg.getInputEntity(peerId)`
 * to refresh the session's entity cache, then retry the op once.
 *
 * Shared between routes (messages, mark-read, etc.) so the same peer-recovery
 * behaviour applies anywhere we touch Telegram with a stored peerId.
 */
export async function withResolvedPeer<T>(
  tg: TelegramClient,
  peerId: string,
  accessHash: string | null,
  op: (peer: Api.TypeInputPeer) => Promise<T>,
): Promise<T> {
  const initial = buildPeer(peerId, accessHash);
  try {
    return await op(initial);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!PEER_INVALID_RE.test(msg)) throw e;
    let resolved: Api.TypeInputPeer;
    try {
      resolved = (await tg.getInputEntity(peerId)) as Api.TypeInputPeer;
    } catch {
      throw e;
    }
    return await op(resolved);
  }
}
