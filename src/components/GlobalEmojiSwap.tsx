"use client";

import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect on the client, no-op on the server (SSR has no layout phase).
// We run the emoji swap synchronously before the browser paints so the user
// never sees the unswapped system-font glyph flash before the Apple PNG.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import {
  EMOJI_BASE,
  EMOJI_REGEX_SOURCE,
  emojiFallbackFilename,
  emojiFilename,
} from "@/lib/emoji";

/**
 * Mount-time DOM walker that replaces unicode emojis in static text
 * nodes with iamcal Apple PNG <img> elements site-wide.
 *
 * Why this exists: most static labels in JSX ("🔥 Hot", "📊 Stats")
 * render via the system font and look like Segoe UI Emoji on Windows
 * — nothing like the iOS style users see in Telegram. We can't ship
 * the Apple font as a webfont (licensing), so we swap PNGs.
 *
 * Limits we accept on purpose:
 *   - We replace text nodes wholesale. If React later updates a text
 *     node we already swapped, React's update silently misses (its
 *     reference is now detached). For frequently-updated emoji text
 *     (chat messages, fan names) keep the per-call `twemoji()` JSX
 *     wrapper instead.
 *   - We skip <input>/<textarea>/contenteditable so user typing isn't
 *     broken.
 *   - We run on mount + on a 1.5s rescan interval. That's enough for
 *     navigation and lazy content; truly real-time text should opt out
 *     via `data-no-emoji="1"` on a parent.
 */
export function GlobalEmojiSwap() {
  useIsoLayoutEffect(() => {
    // Recompile the regex here (with /g/u flags) so we can scan
    // arbitrary strings. The /g state is per-instance so we reset
    // lastIndex on every use.
    const regex = new RegExp(EMOJI_REGEX_SOURCE, "gu");

    function shouldSkipAncestor(el: Element | null): boolean {
      while (el) {
        if (el.nodeType === Node.ELEMENT_NODE) {
          const tag = el.tagName;
          if (
            tag === "SCRIPT" ||
            tag === "STYLE" ||
            tag === "TEXTAREA" ||
            tag === "INPUT" ||
            tag === "NOSCRIPT" ||
            tag === "CODE" ||
            tag === "PRE"
          ) {
            return true;
          }
          const html = el as HTMLElement;
          if (html.isContentEditable) return true;
          if (html.dataset?.noEmoji === "1") return true;
          if (html.dataset?.emojiSwap === "done") return true;
        }
        el = el.parentElement;
      }
      return false;
    }

    function swapTextNode(textNode: Text) {
      const text = textNode.textContent ?? "";
      if (!text) return;
      regex.lastIndex = 0;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > last) {
          fragment.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        const img = document.createElement("img");
        const primary = emojiFilename(m[0]);
        const fb = emojiFallbackFilename(m[0]);
        img.src = `${EMOJI_BASE}/${primary}.png`;
        img.alt = m[0];
        img.draggable = false;
        img.dataset.emojiGlyph = m[0];
        if (fb !== primary) img.dataset.emojiFallback = fb;
        img.style.cssText =
          "display:inline-block;height:1em;width:1em;vertical-align:-0.15em;margin-inline:0.05em";
        img.onerror = onImgError;
        fragment.appendChild(img);
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(last)));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    function swapInRoot(root: Node) {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (shouldSkipAncestor((node as Text).parentElement)) {
              return NodeFilter.FILTER_REJECT;
            }
            const txt = node.textContent ?? "";
            if (!txt) return NodeFilter.FILTER_REJECT;
            regex.lastIndex = 0;
            return regex.test(txt) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        },
      );
      const toSwap: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) toSwap.push(node as Text);
      for (const t of toSwap) swapTextNode(t);
    }

    let raf = 0;
    function scheduleScan() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        swapInRoot(document.body);
      });
    }

    scheduleScan();
    // MutationObserver catches newly-inserted subtrees the instant React
    // commits them — swaps run in the same paint frame, so switching chats /
    // opening dialogs never flashes the system-font glyph before the Apple
    // PNG. We batch to a microtask so a burst of inserts (a fresh chat's
    // whole message list) does ONE walk instead of one-per-node.
    const dirty = new Set<Node>();
    let pending = false;
    function flush() {
      pending = false;
      for (const root of dirty) {
        if (root.isConnected) swapInRoot(root);
      }
      dirty.clear();
    }
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
            dirty.add(n);
          }
        }
      }
      if (!pending && dirty.size > 0) {
        pending = true;
        queueMicrotask(flush);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Belt-and-suspenders backstop for edge cases the observer can miss
    // (character-data-only edits inside an already-swapped node).
    const interval = setInterval(scheduleScan, 5000);
    return () => {
      observer.disconnect();
      clearInterval(interval);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}

function onImgError(this: HTMLImageElement) {
  const tried = this.dataset.emojiTried ?? "";
  const fallback = this.dataset.emojiFallback;
  const glyph = this.dataset.emojiGlyph ?? this.alt ?? "";
  if (!tried.includes("fb") && fallback) {
    this.dataset.emojiTried = `${tried}fb,`;
    this.src = `${EMOJI_BASE}/${fallback}.png`;
    return;
  }
  if (!tried.includes("txt")) {
    this.dataset.emojiTried = `${tried}txt,`;
    const span = document.createElement("span");
    span.textContent = glyph;
    span.style.display = "inline";
    this.replaceWith(span);
  }
}
