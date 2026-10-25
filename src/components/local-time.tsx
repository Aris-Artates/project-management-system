"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Formats a timestamp in the viewer's timezone (the server cannot know it).
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "date" | "time" }) {
  const text = useSyncExternalStore(
    noop,
    () => {
      const d = new Date(iso);
      if (mode === "date") return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      if (mode === "time") return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    },
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
