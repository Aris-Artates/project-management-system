import type { BugSeverity, BugStatus } from "./types";
import type { Tone } from "@/components/ui";

export const BUG_STATUSES: BugStatus[] = ["new", "open", "in_progress", "fixed", "verified", "closed", "reopened"];

export const BUG_STATUS: Record<BugStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "brand" },
  open: { label: "Open", tone: "brand" },
  in_progress: { label: "In progress", tone: "warning" },
  fixed: { label: "Fixed", tone: "success" },
  verified: { label: "Verified", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  reopened: { label: "Reopened", tone: "danger" },
};

export const SEVERITY: Record<BugSeverity, { label: string; tone: Tone }> = {
  minor: { label: "Minor", tone: "neutral" },
  major: { label: "Major", tone: "warning" },
  critical: { label: "Critical", tone: "ember" },
  blocker: { label: "Blocker", tone: "danger" },
};

export const REPRODUCIBILITY = { always: "Always", sometimes: "Sometimes", rarely: "Rarely", unable: "Unable to reproduce" } as const;

// Next steps offered as buttons; "verify" steps need bug.verify.
export const BUG_NEXT: Record<BugStatus, { to: BugStatus; label: string; verify?: boolean }[]> = {
  new: [
    { to: "open", label: "Confirm" },
    { to: "closed", label: "Close as not a bug", verify: true },
  ],
  open: [{ to: "in_progress", label: "Start work" }],
  in_progress: [{ to: "fixed", label: "Mark fixed" }],
  fixed: [
    { to: "verified", label: "Verify fix", verify: true },
    { to: "reopened", label: "Reopen" },
  ],
  verified: [
    { to: "closed", label: "Close", verify: true },
    { to: "reopened", label: "Reopen", verify: true },
  ],
  closed: [{ to: "reopened", label: "Reopen", verify: true }],
  reopened: [{ to: "in_progress", label: "Start work" }],
};

export const OPEN_BUG_STATUSES: BugStatus[] = ["new", "open", "in_progress", "reopened"];
