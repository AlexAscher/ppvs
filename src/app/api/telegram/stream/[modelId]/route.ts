import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { onStreamEvent } from "@/lib/telegram-activity";

/**
 * Server-Sent Events stream of typing / new-message activity for a model.
 * Client opens with `new EventSource('/api/telegram/stream/<modelId>')`
 * and receives JSON events as they fire on the long-lived gramJS client.
 *
 *   { kind: 'typing', peerId, ts }
 *   { kind: 'message', peerId, ts }
 *
 * The receiving page reacts to a 'message' event for its currently-open
 * dialog by triggering an immediate `fetchMessages` — much snappier than
 * the 3s poll. Typing events are similar: they refresh the activity
 * dot/typing-indicator in real time.
 *
 * The connection survives indefinitely; we send a keepalive comment
 * every 30s so corporate proxies / Cloudflare don't close it idle.
 *
 * Node.js runtime required — EventEmitter, no Edge.
 */
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const { modelId } = await params;
  const auth = await authorizeModelAccess(modelId);
  if ("errorResponse" in auth) return auth.errorResponse;

  // Ensure the pool's gramJS client is connected + subscribed so the
  // EventEmitter fires. Fire-and-forget — we DON'T await it, otherwise on
  // a slow uplink the whole SSE response (and the dialogs poll behind the
  // same connect lock) stalls for a minute. The dialogs poll establishes
  // the connection too, so events start flowing as soon as either lands.
  void withTelegramClient(
    modelId,
    auth.model.session_string,
    auth.model.api_id,
    auth.model.api_hash,
    async () => {
      /* noop — just establish connection + activity subscription */
    },
    15_000,
  ).catch(() => {
    // Connection will be retried by the dialogs poll; nothing to do here.
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Initial hello — lets the client know the stream is up.
      safeEnqueue(`: connected\n\n`);

      const unsubscribe = onStreamEvent(modelId, (ev) => {
        safeEnqueue(`data: ${JSON.stringify(ev)}\n\n`);
      });

      const keepalive = setInterval(() => {
        safeEnqueue(`: keepalive\n\n`);
      }, 30_000);

      // Client disconnect → release the listener + timer.
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Next/proxy buffering — events must reach the client immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
