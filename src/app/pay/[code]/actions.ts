"use server";

import { headers } from "next/headers";

export type DeliverItem = {
  name: string;
  mediaUrl: string;
  isVideo: boolean;
};

export type PayResult =
  | { ok: true; items: DeliverItem[]; caption: string | null }
  | { error: string };

/**
 * Mark a PPV send as paid + delivered, return the list of original media
 * URLs so the page can swap blurred previews for the real thing. No real
 * payment provider yet — this is a placeholder that pretends the fan paid.
 */
export async function payAndDeliver(code: string): Promise<PayResult> {
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${proto}://${host}`;

    const res = await fetch(`${base}/api/ppv/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    let data: { ok?: boolean; error?: string; items?: DeliverItem[]; caption?: string | null } = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.error) {
      return { error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, items: data.items ?? [], caption: data.caption ?? null };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}
