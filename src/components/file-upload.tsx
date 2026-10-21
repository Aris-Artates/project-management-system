"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui";

const MAX_BYTES = 50 * 1024 * 1024;

// Uploads straight to Supabase Storage with the viewer's session; storage and
// table policies decide whether it is allowed.
export function FileUpload({
  orgId,
  projectId,
  taskId,
  defaultClientVisible = false,
  showVisibility = true,
}: {
  orgId: string;
  projectId: string;
  taskId?: string;
  defaultClientVisible?: boolean;
  showVisibility?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientVisible, setClientVisible] = useState(defaultClientVisible);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 50 MB`);
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
        const path = `${orgId}/${projectId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { error: rowErr } = await supabase.from("attachments").insert({
          project_id: projectId,
          task_id: taskId ?? null,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
          client_visible: clientVisible,
        });
        if (rowErr) {
          await supabase.storage.from("attachments").remove([path]);
          throw rowErr;
        }
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading..." : "Upload files"}
      </Button>
      {showVisibility && (
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} className="accent-[var(--brand)]" />
          Share with client
        </label>
      )}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
