import Link from "next/link";
import { getProjectContext } from "@/lib/session";
import { TabLink } from "@/components/nav-link";
import { Badge, Dot } from "@/components/ui";
import { PROJECT_STATUS } from "@/components/project-bits";

export default async function ProjectLayout({ children, params }: LayoutProps<"/[org]/projects/[key]">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const base = `/${slug}/projects/${ctx.project.key}`;
  const status = PROJECT_STATUS[ctx.project.status]!;

  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/tasks`, label: "Tasks" },
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/calendar`, label: "Calendar" },
    { href: `${base}/files`, label: "Files" },
    { href: `${base}/discussion`, label: "Discussion" },
    ...(ctx.canProject("project.edit") || ctx.canProject("project.manage_members") || ctx.canProject("milestone.manage")
      ? [{ href: `${base}/settings`, label: "Settings" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-1 flex items-center gap-2 text-sm text-muted">
        <Link href={`/${slug}/projects`} className="hover:text-fg">
          Projects
        </Link>
        <span>/</span>
        <span className="font-mono">{ctx.project.key}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Dot color={ctx.project.color} className="size-3" />
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.project.name}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
        {!ctx.isMember && <Badge>Viewing as {ctx.isPlatformAdmin ? "platform admin" : "org-wide viewer"}</Badge>}
      </div>
      <nav className="mt-4 mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <TabLink key={t.href} href={t.href} exact={t.exact}>
            {t.label}
          </TabLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
