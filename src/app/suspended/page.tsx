import { Card, LinkButton } from "@/components/ui";

export default async function SuspendedPage({ searchParams }: PageProps<"/suspended">) {
  const { org } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">Organization suspended</h1>
        <p className="mt-2 text-sm text-muted">
          {typeof org === "string" ? org : "This organization"} is currently suspended. Contact your administrator for
          details.
        </p>
        <LinkButton href="/orgs" variant="secondary" className="mt-5">
          Back to organizations
        </LinkButton>
      </Card>
    </main>
  );
}
