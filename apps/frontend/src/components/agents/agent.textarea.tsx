import React, { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

interface AutoResizingTextareaProps {
  maxRows?: number;
  placeholder?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  autoFocus?: boolean;
}

/**
 * Grows with its content up to `maxRows`, then scrolls. The limit is derived
 * from the computed line height on every change rather than from a
 * `scrollHeight` snapshot taken on mount: that snapshot was 0 whenever the
 * chat mounted before layout, which pinned `max-height: 0` and left the box
 * at its CSS `min-height` with the first line scrolled out of view.
 */
const AutoResizingTextarea = forwardRef<HTMLTextAreaElement, AutoResizingTextareaProps>(
  (
    {
      maxRows = 1,
      placeholder,
      value,
      onChange,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
      autoFocus,
    },
    ref,
  ) => {
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => internalTextareaRef.current as HTMLTextAreaElement);

    useEffect(() => {
      if (autoFocus) {
        internalTextareaRef.current?.focus();
      }
    }, [autoFocus]);

    useEffect(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea) {
        return;
      }
      const style = getComputedStyle(textarea);
      const lineHeight =
        parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 20;
      const limit =
        lineHeight * maxRows +
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
      textarea.style.maxHeight = `${limit}px`;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, limit)}px`;
    }, [value, maxRows]);

    return (
      <textarea
        ref={internalTextareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        placeholder={placeholder}
        style={{
          overflow: "auto",
          resize: "none",
        }}
        rows={1}
      />
    );
  },
);

export default AutoResizingTextarea;
