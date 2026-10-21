import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";

const FEATURES = [
  ["Projects and tasks", "Lists, subtasks, priorities, due dates and a board you can drag."],
  ["Roles you define", "Build the roles your team actually uses with a simple permission grid."],
  ["Client portal", "Invite clients by email. They see their project and nothing else."],
  ["Every organization, one place", "Run many organizations side by side with clean separation."],
];

export default async function Home() {
  if (await getProfile()) redirect("/orgs");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Logo />
          {APP_NAME}
        </div>
        <div className="flex gap-2">
          <LinkButton href="/login" variant="ghost" size="sm">
            Sign in
          </LinkButton>
          <LinkButton href="/signup" size="sm">
            Get started
          </LinkButton>
        </div>
      </header>

      <section className="py-20 sm:py-28">
        <p className="text-sm font-medium text-ember">Project management for teams and their clients</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Plan the work. Ship it. Keep everyone in the loop.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          One workspace for projects, tasks, files and conversations, with access shaped around how your
          organization works.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/signup">Create a workspace</LinkButton>
          <LinkButton href="/login" variant="secondary">
            I have an invite
          </LinkButton>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-2">
        {FEATURES.map(([title, text]) => (
          <div key={title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
