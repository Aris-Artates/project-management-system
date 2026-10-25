import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { TabLink } from "@/components/nav-link";
import { PageHeader } from "@/components/ui";
import { settingsTabs } from "@/lib/settings-tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/[org]/settings">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const tabs = settingsTabs(slug, ctx.can, ctx.feature);
  if (!tabs.length) redirect(`/${slug}`);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description={ctx.org.name} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
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
