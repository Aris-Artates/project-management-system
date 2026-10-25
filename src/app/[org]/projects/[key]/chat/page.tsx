import { getProjectContext, displayName, requireFeature } from "@/lib/session";
import { getChat, getProjectMembers } from "@/lib/queries";
import { ProjectChat } from "@/components/project-chat";

export default async function ChatPage({ params }: PageProps<"/[org]/projects/[key]/chat">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  requireFeature(ctx, "chat");
  const [messages, members] = await Promise.all([getChat(ctx.project.id), getProjectMembers(ctx.project.id, ctx.org.id)]);
  const people = Object.fromEntries(
    [...members.map((m) => m.profile), ...messages.flatMap((m) => (m.author ? [m.author] : []))].map((p) => [
      p.id,
      { name: displayName(p), avatar: p.avatar_url },
    ]),
  );
  people[ctx.profile.id] = { name: displayName(ctx.profile), avatar: ctx.profile.avatar_url };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">Team chat for this project. Clients never see it.</p>
      <ProjectChat
        projectId={ctx.project.id}
        meId={ctx.profile.id}
        initial={messages.map(({ id, body, created_at, author_id }) => ({ id, body, created_at, author_id }))}
        people={people}
        canPost={ctx.canProject("chat.use")}
        canModerate={ctx.canProject("forum.moderate")}
      />
    </div>
  );
}
