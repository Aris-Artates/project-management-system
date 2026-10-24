import "server-only";
import nodemailer from "nodemailer";
import { APP_NAME } from "./brand";

// SMTP settings come from env. Locally they point at the Supabase mail catcher
// (http://localhost:55324), so nothing leaves the machine.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

// Base URL for links in emails. On Vercel it falls back to the production domain.
export function appUrl(path = "") {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3200");
  return `${base.replace(/\/$/, "")}${path}`;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(heading: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:system-ui,sans-serif;color:#1d1c1a">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e2dfd8;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-weight:600;color:#17594f">${escape(APP_NAME)}</p>
    <h1 style="font-size:20px;margin:0 0 12px">${escape(heading)}</h1>
    <div style="font-size:15px;line-height:1.55;color:#3b3934">${body}</div>
    ${
      cta
        ? `<p style="margin:24px 0 0"><a href="${cta.href}" style="display:inline-block;background:#17594f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escape(cta.label)}</a></p>`
        : ""
    }
  </div></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!transport) {
    console.info(`[email] SMTP not configured, skipped "${subject}" to ${to}`);
    return;
  }
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM ?? `${APP_NAME} <no-reply@localhost>`, to, subject, html });
  } catch (e) {
    // Email is best effort; the in-app notification still exists.
    console.error("[email] send failed", e);
  }
}

export async function sendInvitationEmail(opts: {
  to: string;
  orgName: string;
  inviter: string;
  roleName: string;
  token: string;
  isClient: boolean;
}) {
  const what = opts.isClient
    ? `to follow your project${opts.orgName ? ` with <b>${escape(opts.orgName)}</b>` : ""}`
    : `to join <b>${escape(opts.orgName)}</b> as <b>${escape(opts.roleName)}</b>`;
  await sendEmail(
    opts.to,
    `${opts.inviter} invited you to ${opts.orgName}`,
    layout(
      "You're invited",
      `<p>${escape(opts.inviter)} invited you ${what}.</p><p>This invitation expires in 7 days.</p>`,
      { label: "Accept invitation", href: appUrl(`/invite/${opts.token}`) },
    ),
  );
}

export async function sendNotificationEmail(to: string, title: string, body: string | null, link: string | null) {
  await sendEmail(
    to,
    title,
    layout(title, body ? `<p>${escape(body)}</p>` : "", link ? { label: "Open", href: appUrl(link) } : undefined),
  );
}
