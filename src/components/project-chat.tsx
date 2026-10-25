"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { subscribeAuthed } from "@/lib/supabase/realtime";
import { deleteChatMessage, sendChatMessage } from "@/lib/actions/forum";
import { cn, initials } from "@/lib/utils";

type Message = { id: string; body: string; created_at: string; author_id: string };
type Person = { name: string; avatar: string | null };

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function day(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function ProjectChat({
  projectId,
  meId,
  initial,
  people,
  canPost,
  canModerate,
}: {
  projectId: string;
  meId: string;
  initial: Message[];
  people: Record<string, Person>;
  canPost: boolean;
  canModerate: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    subscribeAuthed(supabase, (client) =>
      client
        .channel(`chat:${projectId}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `project_id=eq.${projectId}` }, (p) =>
          setMessages((prev) => (prev.some((m) => m.id === (p.new as Message).id) ? prev : [...prev, p.new as Message])),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (p) =>
          setMessages((prev) => prev.filter((m) => m.id !== (p.old as { id: string }).id)),
        ),
    ).then((c) => {
      if (cancelled) supabase.removeChannel(c);
      else channel = c;
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    setText("");
    startTransition(async () => {
      const res = await sendChatMessage(projectId, body);
      if (res.error) {
        setError(res.error);
        setText(body);
      } else if (res.message) {
        const m = res.message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-96 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello to the team.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || day(prev.created_at) !== day(m.created_at);
          const grouped = !newDay && prev?.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
          const person = people[m.author_id] ?? { name: "Former member", avatar: null };
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-line" />
                  {day(m.created_at)}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className={cn("group flex gap-3", grouped ? "mt-0.5" : "mt-3")}>
                <div className="w-8 shrink-0">
                  {!grouped &&
                    (person.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={person.avatar} alt="" className="size-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                        {initials(person.name)}
                      </span>
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="text-sm">
                      <span className="font-medium">{person.name}</span> <span className="text-xs text-muted">{time(m.created_at)}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                </div>
                {(m.author_id === meId || canModerate) && (
                  <button
                    className="self-start text-xs text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                    onClick={() =>
                      startTransition(async () => {
                        const err = await deleteChatMessage(m.id);
                        if (err) setError(err);
                        else setMessages((prev) => prev.filter((x) => x.id !== m.id));
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {canPost ? (
        <div className="border-t border-line p-3">
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Message the team. Enter to send, Shift+Enter for a new line."
              className="min-h-10 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <button
              onClick={send}
              disabled={pending || !text.trim()}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-line p-3 text-sm text-muted">You can read this chat but your role cannot post.</p>
      )}
    </div>
  );
}
