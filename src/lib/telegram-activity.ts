import { Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { Raw } from "telegram/events/Raw";
import type { TelegramClient } from "telegram";
import { EventEmitter } from "node:events";

/**
 * In-memory presence store for fans we're chatting with.
 *
 * Telegram's "Last seen & online" privacy often hides true `UserStatusOnline`
 * from non-contacts — we'd always see "last seen recently" regardless of
 * actual presence. We work around this by listening to update events from
 * the long-lived gramJS client and inferring activity:
 *
 *   - UpdateUserTyping / UpdateChatUserTyping → user is typing right now
 *   - UpdateNewMessage / UpdateShortMessage → user sent a message
 *
 * Both bump `lastSeenTs`. Typing events also set `lastTypingTs`. The
 * client polls `/api/telegram/activity/{modelId}` to read this state.
 */

type Entry = {
  lastSeenTs: number;     // ms epoch — any activity from this peer
  lastTypingTs: number;   // ms epoch — most recent typing event
};

declare global {
  var __ppvs_activity__: Map<string, Entry> | undefined;
  var __ppvs_activity_subscribed__: Set<string> | undefined;
  var __ppvs_activity_emitters__: Map<string, EventEmitter> | undefined;
}

const activity: Map<string, Entry> = globalThis.__ppvs_activity__ ?? new Map();
globalThis.__ppvs_activity__ = activity;

const subscribed: Set<string> = globalThis.__ppvs_activity_subscribed__ ?? new Set();
globalThis.__ppvs_activity_subscribed__ = subscribed;

// Per-model EventEmitter — SSE consumers subscribe via `onStreamEvent` to
// react to typing/new-message updates without polling.
const emitters: Map<string, EventEmitter> =
  globalThis.__ppvs_activity_emitters__ ?? new Map();
globalThis.__ppvs_activity_emitters__ = emitters;

function emitterFor(modelId: string): EventEmitter {
  let em = emitters.get(modelId);
  if (!em) {
    em = new EventEmitter();
    // Multiple browser tabs / multiple chatters per model — bump the
    // default 10-listener cap so a busy agency doesn't warn-spam.
    em.setMaxListeners(50);
    emitters.set(modelId, em);
  }
  return em;
}

export type StreamEvent =
  | { kind: "typing"; peerId: string; ts: number }
  | { kind: "message"; peerId: string; ts: number };

export function onStreamEvent(
  modelId: string,
  handler: (ev: StreamEvent) => void,
): () => void {
  const em = emitterFor(modelId);
  em.on("event", handler);
  return () => em.off("event", handler);
}

function emitEvent(modelId: string, ev: StreamEvent) {
  const em = emitters.get(modelId);
  if (em) em.emit("event", ev);
}

const TYPING_FRESH_MS = 6_000;    // typing events come every ~5s
const ONLINE_FRESH_MS = 60_000;   // treat as online if any activity within 60s

function keyOf(modelId: string, peerId: string): string {
  return `${modelId}:${peerId}`;
}

function bump(modelId: string, peerId: string, kind: "typing" | "message") {
  const k = keyOf(modelId, peerId);
  const now = Date.now();
  const cur = activity.get(k) ?? { lastSeenTs: 0, lastTypingTs: 0 };
  cur.lastSeenTs = now;
  if (kind === "typing") cur.lastTypingTs = now;
  activity.set(k, cur);
  emitEvent(modelId, { kind, peerId, ts: now });
}

export function readActivity(
  modelId: string,
  peerId: string,
): { typing: boolean; online: boolean; lastActiveAgoSec: number | null } {
  const k = keyOf(modelId, peerId);
  const e = activity.get(k);
  if (!e) return { typing: false, online: false, lastActiveAgoSec: null };
  const now = Date.now();
  const ago = now - e.lastSeenTs;
  return {
    typing: now - e.lastTypingTs < TYPING_FRESH_MS,
    online: ago < ONLINE_FRESH_MS,
    lastActiveAgoSec: Math.floor(ago / 1000),
  };
}

/**
 * Attach event handlers to a freshly-connected TelegramClient. Safe to call
 * multiple times — guarded by the `subscribed` set so HMR / multiple route
 * hits don't pile up listeners on the same client.
 */
export function subscribeActivityEvents(modelId: string, client: TelegramClient) {
  if (subscribed.has(modelId)) return;
  subscribed.add(modelId);

  // 1) Typing notifications — Raw update handler so we catch every variant
  //    (UpdateUserTyping for private chats, UpdateChatUserTyping for groups,
  //    UpdateChannelUserTyping for channels). The Raw subscription delivers
  //    any TL update so we accept `unknown` and narrow via instanceof.
  client.addEventHandler((rawUpdate: unknown) => {
    try {
      const update = rawUpdate as Api.TypeUpdate | Api.UpdateShortMessage;
      if (update instanceof Api.UpdateUserTyping) {
        bump(modelId, update.userId.toString(), "typing");
        return;
      }
      if (update instanceof Api.UpdateChatUserTyping) {
        const fromId = (update.fromId as Api.PeerUser).userId?.toString();
        if (fromId) bump(modelId, fromId, "typing");
        return;
      }
      if (update instanceof Api.UpdateChannelUserTyping) {
        const fromId = (update.fromId as Api.PeerUser).userId?.toString();
        if (fromId) bump(modelId, fromId, "typing");
        return;
      }
      // Compact updates for new direct messages — fire before NewMessage
      // sometimes; treat as activity.
      if (update instanceof Api.UpdateShortMessage) {
        if (!update.out) bump(modelId, update.userId.toString(), "message");
      }
    } catch {
      // never let a handler error break gramJS
    }
  }, new Raw({}));

  // 2) NewMessage handler — fires for incoming messages across user chats.
  client.addEventHandler((evt: NewMessageEvent) => {
    try {
      if (evt.message.out) return; // outgoing — that's us
      const senderId = evt.message.senderId?.toString();
      if (senderId) {
        bump(modelId, senderId, "message");
        // Timezone histogram + Mass DM reply tracking (fire-and-forget).
        void import("@/lib/fan-activity").then((m) =>
          m.recordIncomingMessage(modelId, senderId),
        );
      }
    } catch {
      /* ignore */
    }
  }, new NewMessage({ incoming: true }));
}

/**
 * Drop a model from the subscribed set so the next connect re-attaches
 * fresh handlers. Pool calls this when it evicts a broken client.
 */
export function clearActivitySubscription(modelId: string) {
  subscribed.delete(modelId);
}
