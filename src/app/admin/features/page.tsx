import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabase, requireProfile } from "@/lib/session";
import { setFlagEnabled, setFlagOrg } from "@/lib/actions/dev";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Features" };

type Flag = { key: string; label: string; description: string | null; enabled: boolean; disabled_orgs: string[] };

export default async function FeaturesPage() {
  const me = await requireProfile("/admin/features");
  if (me.platform_role !== "dev") redirect("/admin");
  const supabase = await getSupabase();
  const [{ data: flags }, { data: orgs }] = await Promise.all([
    supabase.from("feature_flags").select("*").order("position"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div>
      <PageHeader title="Features" description="Switch modules off for everyone, or for single organizations. The API, webhooks and automation honor these too." />
      <Card>
        <ul className="divide-y divide-line">
          {((flags ?? []) as Flag[]).map((f) => (
            <li key={f.key} className="flex flex-col gap-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{f.label}</span>
                {f.enabled ? <Badge tone="success">On</Badge> : <Badge tone="danger">Off everywhere</Badge>}
                <span className="min-w-0 flex-1 text-muted">{f.description}</span>
                <form action={setFlagEnabled}>
                  <input type="hidden" name="key" value={f.key} />
                  <input type="hidden" name="enabled" value={String(!f.enabled)} />
                  <Button size="sm" variant="secondary">
                    {f.enabled ? "Turn off everywhere" : "Turn on"}
                  </Button>
                </form>
              </div>
              {f.enabled && (
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  {f.disabled_orgs.map((id) => (
                    <form key={id} action={setFlagOrg} className="flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-xs text-danger">
                      <input type="hidden" name="key" value={f.key} />
                      <input type="hidden" name="org_id" value={id} />
                      <input type="hidden" name="disable" value="false" />
                      Off for {orgName.get(id) ?? "deleted org"}
                      <button aria-label="Turn back on" className="font-semibold">
                        ×
                      </button>
                    </form>
                  ))}
                  <form action={setFlagOrg} className="flex items-center gap-1">
                    <input type="hidden" name="key" value={f.key} />
                    <input type="hidden" name="disable" value="true" />
                    <Select name="org_id" defaultValue="" required className="h-8 w-auto text-xs">
                      <option value="">Turn off for an organization...</option>
                      {(orgs ?? [])
                        .filter((o) => !f.disabled_orgs.includes(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </Select>
                    <Button size="sm" variant="ghost">
                      Apply
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
