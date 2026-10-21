import { Eye, Lock, Paperclip } from "lucide-react";

export function EyeIcon({ size = 14 }: { size?: number }) {
  return <Eye size={size} aria-hidden="true" />;
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return <Lock size={size} aria-hidden="true" />;
}

export function ClipIcon({ size = 14 }: { size?: number }) {
  return <Paperclip size={size} aria-hidden="true" />;
}
