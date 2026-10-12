"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Two panes with a draggable divider. `direction="row"` puts them side by side. */
export function SplitPane({
  first,
  second,
  direction = "row",
  initial = 45,
  min = 20,
  max = 80,
  className,
}: {
  first: ReactNode;
  second: ReactNode;
  direction?: "row" | "column";
  /** Size of the first pane in percent. */
  initial?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [size, setSize] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const row = direction === "row";

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const rect = box.current!.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const pct = row ? ((ev.clientX - rect.left) / rect.width) * 100 : ((ev.clientY - rect.top) / rect.height) * 100;
        setSize(Math.min(max, Math.max(min, pct)));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [max, min, row],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === (row ? "ArrowLeft" : "ArrowUp") ? -3 : e.key === (row ? "ArrowRight" : "ArrowDown") ? 3 : 0;
    if (step) setSize((s) => Math.min(max, Math.max(min, s + step)));
  };

  return (
    <div ref={box} className={cn("flex min-h-0 min-w-0", row ? "flex-row" : "flex-col", className)}>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(size)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={cn(
          "bg-border hover:bg-primary/60 focus-visible:bg-primary shrink-0 transition-colors focus-visible:outline-none",
          row ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
