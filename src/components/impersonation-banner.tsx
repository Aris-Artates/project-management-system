import { getImpersonation } from "@/lib/impersonation";
import { stopImpersonation } from "@/lib/actions/dev";

export async function ImpersonationBanner() {
  const imp = await getImpersonation();
  if (!imp) return null;
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-ember px-4 py-1.5 text-sm font-medium text-white print:hidden">
      <span>
        You are signed in as {imp.as} (started by {imp.by}).
      </span>
      <form action={stopImpersonation}>
        <button className="rounded-md bg-white/20 px-2 py-0.5 hover:bg-white/30">End session</button>
      </form>
    </div>
  );
}
