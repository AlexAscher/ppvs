import { Api } from "telegram";
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
