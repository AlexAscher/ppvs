import { useCallback, useRef } from "react";

/**
 * Cursor-aware text insertion for an `<input>` or `<textarea>`.
 *
 * The bug this fixes: clicking an emoji button steals focus from the input,
 * and Chrome resets `selectionStart` to the end of the field before our
 * handler reads it — so every insert appended to the end instead of landing
 * at the caret. We work around it by tracking the caret in a ref on every
 * `select` / `keyup` / `click` event on the input, then reading THAT ref
 * inside the insert handler (independent of focus).
 *
 * Usage:
 *   const { bind, insert } = useCursorInsert(inputRef);
 *   <input ref={inputRef} {...bind} value={text} onChange={...} />
 *   <button onMouseDown={(e) => { e.preventDefault(); insert(text, setText, "😀"); }}>
 */
export function useCursorInsert<T extends HTMLInputElement | HTMLTextAreaElement>(
  ref: React.RefObject<T | null>,
) {
  // Last-known caret position. Updated whenever the user moves the caret in
  // the field, so it survives the focus loss that happens when they click
  // an emoji picker.
  const caretRef = useRef<{ start: number; end: number } | null>(null);

  const remember = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    caretRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }, [ref]);

  const bind = {
    onSelect: remember,
    onKeyUp: remember,
    onClick: remember,
    onFocus: remember,
  };

  const insert = useCallback(
    (currentValue: string, setValue: (next: string) => void, text: string) => {
      const el = ref.current;
      const caret = caretRef.current ?? {
        start: currentValue.length,
        end: currentValue.length,
      };
      const start = Math.min(caret.start, currentValue.length);
      const end = Math.min(caret.end, currentValue.length);
      const next = currentValue.slice(0, start) + text + currentValue.slice(end);
      setValue(next);
      const newPos = start + text.length;
      // Update the ref immediately so a follow-up insert (user clicks two
      // emojis in a row without moving the caret) lands after the previous
      // one instead of re-inserting at the same spot.
      caretRef.current = { start: newPos, end: newPos };
      // Restore focus + caret on the next frame — after React commits the
      // new value into the DOM, otherwise setSelectionRange sees stale text.
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(newPos, newPos);
        } catch {
          // Some inputs (e.g. type="number") throw on setSelectionRange —
          // safe to ignore, the value is already updated.
        }
      });
    },
    [ref],
  );

  return { bind, insert };
}
