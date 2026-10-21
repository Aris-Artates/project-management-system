import type { CatalogEntry } from "@/lib/types";
import { Badge } from "./ui";

// Permission grid grouped by module. Client roles only show client-safe keys.
export function PermissionMatrix({
  catalog,
  selected,
  mode,
}: {
  catalog: CatalogEntry[];
  selected: string[];
  mode: "custom" | "client" | "admin";
}) {
  const entries = mode === "client" ? catalog.filter((c) => c.client_safe) : catalog;
  const modules = [...new Set(entries.map((c) => c.module))];

  return (
    <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {modules.map((mod) => (
        <div key={mod} className="grid gap-3 p-4 sm:grid-cols-[160px_1fr]">
          <p className="text-sm font-semibold">{mod}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {entries
              .filter((c) => c.module === mod)
              .map((c) => (
                <label key={c.key} className="flex items-start gap-2 rounded-md p-1.5 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={c.key}
                    defaultChecked={mode === "admin" || selected.includes(c.key)}
                    disabled={mode === "admin"}
                    className="mt-0.5 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {c.label}
                      {c.scope === "project" && <Badge className="text-[10px]">per project</Badge>}
                    </span>
                    {c.description && <span className="block text-xs text-muted">{c.description}</span>}
                  </span>
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
