import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getDoc, getDocs, getDocVersions } from "@/lib/queries";
import { deleteDoc, restoreDocVersion, saveDoc } from "@/lib/actions/docs";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Card, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { EyeIcon } from "@/components/icons";
import { timeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const doc = await getDoc(id);
  return { title: doc?.title ?? "Page" };
}

export default async function DocPage({ params, searchParams }: PageProps<"/[org]/projects/[key]/docs/[id]">) {
  const { org: slug, key, id } = await params;
  const sp = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const doc = await getDoc(id);
  if (!doc || doc.project_id !== ctx.project.id) notFound();

  const base = `/${slug}/projects/${ctx.project.key}/docs`;
  const canEdit = ctx.canProject("doc.edit");
  const editing = canEdit && sp.edit === "1";
  const showHistory = sp.history === "1";
  const [versions, docs] = await Promise.all([showHistory || sp.v ? getDocVersions(doc.id) : Promise.resolve([]), editing ? getDocs(ctx.project.id) : Promise.resolve([])]);
  const viewing = typeof sp.v === "string" ? versions.find((v) => String(v.version) === sp.v) : undefined;
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  if (editing) {
    return (
      <Card className="p-4">
        <ActionForm action={saveDoc} className="flex flex-col gap-4">
          {h("org_slug", slug)}
          {h("doc_id", doc.id)}
          {h("version", String(doc.version))}
          {h("base", base)}
          <Field label="Title">
            <Input name="title" defaultValue={doc.title} required maxLength={200} />
          </Field>
          <Field label="Content" hint="Markdown: ## headings, - lists, **bold**, [links](https://...), | tables |, - [ ] checklists">
            <Textarea name="body" defaultValue={doc.body} rows={22} className="font-mono text-[13px] leading-relaxed" />
          </Field>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Inside" className="min-w-56">
              <Select name="parent_id" defaultValue={doc.parent_id ?? ""}>
                <option value="">Top level</option>
                {docs
                  .filter((d) => d.id !== doc.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pb-2.5 text-sm">
              <input type="checkbox" name="client_visible" defaultChecked={doc.client_visible} className="accent-[var(--brand)]" />
              Share with clients on this project
            </label>
          </div>
          <div className="flex gap-2">
            <SubmitButton>Save page</SubmitButton>
            <LinkButton href={`${base}/${doc.id}`} variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </ActionForm>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{viewing ? viewing.title : doc.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {viewing ? (
              <>
                Version {viewing.version}, saved by {displayName(viewing.editor)} {timeAgo(viewing.created_at)}
              </>
            ) : (
              <>
                Version {doc.version}, edited by {displayName(doc.editor)} {timeAgo(doc.updated_at)}
              </>
            )}
            {doc.client_visible && (
              <Badge tone="ember">
                <EyeIcon size={12} /> Shared with client
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={showHistory ? `${base}/${doc.id}` : `${base}/${doc.id}?history=1`} variant="secondary" size="sm">
            {showHistory ? "Hide history" : `History${doc.version > 1 ? ` (${doc.version - 1})` : ""}`}
          </LinkButton>
          {canEdit && !viewing && (
            <LinkButton href={`${base}/${doc.id}?edit=1`} size="sm">
              Edit
            </LinkButton>
          )}
        </div>
      </div>

      {viewing && (
        <Notice tone="warning">
          You are looking at an older version.{" "}
          <Link href={`${base}/${doc.id}`} className="underline">
            Back to the current page
          </Link>
          {canEdit && (
            <form action={restoreDocVersion} className="mt-2">
              {h("org_slug", slug)}
              {h("version_id", viewing.id)}
              {h("base", base)}
              <Button size="sm" variant="secondary">
                Restore this version
              </Button>
            </form>
          )}
        </Notice>
      )}

      <Card className="p-5">
        {(viewing ? viewing.body : doc.body).trim() ? (
          <Markdown>{viewing ? viewing.body : doc.body}</Markdown>
        ) : (
          <p className="text-sm text-muted">This page is empty.{canEdit && " Click Edit to write it."}</p>
        )}
      </Card>

      {showHistory && (
        <Card>
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center gap-3 px-4 py-2">
              <span className="w-24 font-medium">Version {doc.version}</span>
              <span className="flex-1">Current, by {displayName(doc.editor)}</span>
              <span className="text-muted">{timeAgo(doc.updated_at)}</span>
            </li>
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-24">Version {v.version}</span>
                <Link href={`${base}/${doc.id}?history=1&v=${v.version}`} className="min-w-0 flex-1 truncate hover:text-brand">
                  {v.title}, by {displayName(v.editor)}
                </Link>
                <span className="text-muted">{timeAgo(v.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ctx.canProject("doc.delete") && !viewing && (
        <form action={deleteDoc}>
          {h("org_slug", slug)}
          {h("doc_id", doc.id)}
          {h("base", base)}
          <ConfirmButton message="Delete this page and any pages inside it?" variant="ghost">
            Delete page
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
