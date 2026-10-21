"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export function NotificationBell({ userId, initial }: { userId: string; initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  // Take fresh server data after a navigation or refresh.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 30)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markRead = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    startTransition(() => markNotificationRead(id));
  };

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                className="text-xs text-brand"
                onClick={() => {
                  setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
                  startTransition(() => markAllNotificationsRead());
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">You are all caught up.</p>}
            {items.map((n) => {
              const content = (
                <>
                  <span className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ember" />}
                    <span className="min-w-0">
                      <span className="block text-sm">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="block text-xs text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </span>
                </>
              );
              const cls = cn("block border-b border-line px-3 py-2 last:border-0 hover:bg-surface-2", n.read_at && "opacity-70");
              return n.link ? (
                <Link
                  key={n.id}
                  href={n.link}
                  className={cls}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                >
                  {content}
                </Link>
              ) : (
                <button key={n.id} className={cn(cls, "w-full text-left")} onClick={() => markRead(n.id)}>
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
