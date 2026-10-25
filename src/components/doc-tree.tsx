import Link from "next/link";
import { cn } from "@/lib/utils";
import { EyeIcon } from "./icons";

type Node = { id: string; parent_id: string | null; title: string; client_visible: boolean };

// Nested page list; children sit under their parent.
export function DocTree({ docs, base, activeId, showVisibility = true }: { docs: Node[]; base: string; activeId?: string; showVisibility?: boolean }) {
  const ids = new Set(docs.map((d) => d.id));
  const children = (parent: string | null) => docs.filter((d) => (d.parent_id && ids.has(d.parent_id) ? d.parent_id : null) === parent);
  const render = (parent: string | null, depth: number): React.ReactNode =>
    children(parent).map((d) => (
      <div key={d.id}>
        <Link
          href={`${base}/${d.id}`}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
            d.id === activeId ? "bg-brand-soft font-medium text-brand" : "hover:bg-surface-2",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <span className="min-w-0 flex-1 truncate">{d.title}</span>
          {showVisibility && d.client_visible && (
            <span className="text-ember" title="Shared with client">
              <EyeIcon size={12} />
            </span>
          )}
        </Link>
        {render(d.id, depth + 1)}
      </div>
    ));
  if (!docs.length) return <p className="px-2 py-1.5 text-sm text-muted">No pages yet.</p>;
  return <nav className="flex flex-col">{render(null, 0)}</nav>;
}
