// Access-rule tests against the database, using the demo seed (supabase/seed.sql).
// Every test runs inside a transaction that is rolled back, so nothing persists.
// Run: npm run test:db   (reads SUPABASE_DB_URL from the environment or .env.local)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const line = fs
    .readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!line) throw new Error("Set SUPABASE_DB_URL");
  return line.slice("SUPABASE_DB_URL=".length).trim().replace(/^["']|["']$/g, "");
}

const raw = dbUrl();
const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^:/]+):(\d+)\/(.+)$/);
const pool = new pg.Pool({
  user: decodeURIComponent(m[1]),
  password: decodeURIComponent(m[2]),
  host: m[3],
  port: Number(m[4]),
  database: m[5],
  ssl: { rejectUnauthorized: false },
  max: 2,
});
after(() => pool.end());

// Demo users and organizations from the seed.
const U = {
  dev: "00000000-0000-4000-a000-000000000001",
  admin: "00000000-0000-4000-a000-000000000011",
  pm: "00000000-0000-4000-a000-000000000012",
  developer: "00000000-0000-4000-a000-000000000013",
  qa: "00000000-0000-4000-a000-000000000014",
  client: "00000000-0000-4000-a000-000000000015",
  globexAdmin: "00000000-0000-4000-a000-000000000021",
};
const ACME = "00000000-0000-4000-b000-000000000001";
const GLOBEX = "00000000-0000-4000-b000-000000000002";

// Runs fn as the given user (RLS applies), then rolls everything back.
async function asUser(userId, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return await fn(async (sql, params) => (await c.query(sql, params)).rows);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

// Expects the statement to fail (RLS denial or a guard trigger).
async function rejects(q, sql, params) {
  await q("savepoint s");
  try {
    await q(sql, params);
    assert.fail(`expected failure: ${sql}`);
  } catch (e) {
    if (e.code === "ERR_ASSERTION") throw e;
  } finally {
    await q("rollback to savepoint s");
  }
}

const count = async (q, sql, params) => Number((await q(sql, params))[0].n);

// --- Organization isolation ---------------------------------------------------

test("people only see their own organizations", async () => {
  await asUser(U.pm, async (q) => {
    const orgs = await q("select slug from organizations order by slug");
    assert.deepEqual(orgs.map((o) => o.slug), ["acme"]);
    assert.equal(await count(q, "select count(*) n from projects where org_id = $1", [GLOBEX]), 0);
    assert.equal(await count(q, "select count(*) n from tasks where org_id = $1", [GLOBEX]), 0);
  });
  await asUser(U.globexAdmin, async (q) => {
    assert.equal(await count(q, "select count(*) n from tasks where org_id = $1", [ACME]), 0);
  });
});

test("platform admins see every organization", async () => {
  await asUser(U.dev, async (q) => {
    assert.equal(await count(q, "select count(*) n from organizations where id in ($1, $2)", [ACME, GLOBEX]), 2);
  });
});

// --- Clients ------------------------------------------------------------------

test("clients see only shared work on their projects", async () => {
  await asUser(U.client, async (q) => {
    const projects = await q("select key from projects");
    assert.deepEqual(projects.map((p) => p.key), ["WEB"]);
    assert.equal(await count(q, "select count(*) n from tasks where not client_visible"), 0);
    assert.equal(await count(q, "select count(*) n from comments where is_internal"), 0);
    assert.equal(await count(q, "select count(*) n from documents where not client_visible"), 0);
    assert.equal(await count(q, "select count(*) n from chat_messages"), 0);
    assert.equal(await count(q, "select count(*) n from document_versions"), 0);
    assert.equal(await count(q, "select count(*) n from invoices where status = 'draft'"), 0);
    assert.equal(await count(q, "select count(*) n from member_rates"), 0);
    assert.equal(await count(q, "select count(*) n from audit_log"), 0);
    assert.equal(await count(q, "select count(*) n from api_keys"), 0);
  });
});

test("clients see only their own role", async () => {
  await asUser(U.client, async (q) => {
    const roles = await q("select system_key from roles");
    assert.deepEqual(roles.map((r) => r.system_key), ["client"]);
  });
});

test("clients cannot edit tasks, widen their role or promote themselves", async () => {
  await asUser(U.client, async (q) => {
    const updated = await q("update tasks set title = 'x' where org_id = $1 returning id", [ACME]);
    assert.equal(updated.length, 0);
    const widened = await q("update roles set permissions = '{task.edit}' where system_key = 'client' returning id");
    assert.equal(widened.length, 0);
    await rejects(q, "update profiles set platform_role = 'dev' where id = $1", [U.client]);
    await rejects(q, "insert into roles (org_id, name) values ($1, 'Sneaky')", [ACME]);
  });
});

test("a client's internal comment is saved as a normal comment", async () => {
  await asUser(U.client, async (q) => {
    const [p] = await q("select id from projects where key = 'WEB'");
    const [c] = await q("insert into comments (project_id, body, is_internal) values ($1, 'hi', true) returning is_internal", [p.id]);
    assert.equal(c.is_internal, false);
  });
});

// --- Roles built from permissions ---------------------------------------------

test("edit-own permission covers only your own tasks", async () => {
  await asUser(U.developer, async (q) => {
    // Diego is assigned WEB-2 but not WEB-4 (Quinn's).
    const own = await q("update tasks set priority = 'urgent' where number = 2 and project_id = (select id from projects where key = 'WEB') returning id");
    assert.equal(own.length, 1);
    const other = await q("update tasks set priority = 'urgent' where number = 4 and project_id = (select id from projects where key = 'WEB') returning id");
    assert.equal(other.length, 0);
  });
});

test("only roles allowed to verify can close bugs", async () => {
  const bugId = await asUser(U.qa, async (q) => {
    const [b] = await q("insert into bugs (project_id, title) values ((select id from projects where key = 'WEB'), 'test bug') returning id");
    await q("update bugs set status = 'fixed' where id = $1", [b.id]);
    // QA has bug.verify.
    await q("update bugs set status = 'verified' where id = $1", [b.id]);
    return b.id;
  });
  assert.ok(bugId);
  await asUser(U.developer, async (q) => {
    const [b] = await q("insert into bugs (project_id, title, assignee_id) values ((select id from projects where key = 'WEB'), 'dev bug', $1) returning id", [U.developer]);
    await q("update bugs set status = 'fixed' where id = $1", [b.id]);
    await rejects(q, "update bugs set status = 'closed' where id = $1", [b.id]);
  });
});

test("preset roles cannot be deleted and a non-admin cannot grant Org Admin", async () => {
  await asUser(U.admin, async (q) => {
    await rejects(q, "delete from roles where org_id = $1 and system_key = 'org_admin'", [ACME]);
  });
  await asUser(U.pm, async (q) => {
    await rejects(
      q,
      "insert into invitations (org_id, email, role_id) values ($1, 'x@example.com', (select id from roles where org_id = $1 and system_key = 'org_admin'))",
      [ACME],
    );
  });
});

test("an organization keeps at least one Org Admin", async () => {
  await asUser(U.admin, async (q) => {
    await rejects(q, "update org_members set status = 'deactivated' where org_id = $1 and user_id = $2", [ACME, U.admin]);
  });
});

// --- Money ----------------------------------------------------------------------

test("approved time is billed once and sent invoices are locked", async () => {
  await asUser(U.admin, async (q) => {
    const [p] = await q("select id from projects where key = 'WEB'");
    const [e] = await q("insert into time_entries (project_id, minutes, work_date) values ($1, 60, current_date) returning id", [p.id]);
    await q("update time_entries set status = 'submitted' where id = $1", [e.id]);
    await q("update time_entries set status = 'approved' where id = $1", [e.id]);
    const [inv] = await q("select create_invoice_from_time($1, current_date, current_date, 'entry') as id", [p.id]);
    await rejects(q, "select create_invoice_from_time($1, current_date, current_date, 'entry')", [p.id]);
    await q("update invoices set status = 'sent' where id = $1", [inv.id]);
    await rejects(q, "insert into invoice_items (invoice_id, description, unit_price) values ($1, 'extra', 10)", [inv.id]);
  });
});

test("people without invoice rights cannot mark time as billed", async () => {
  await asUser(U.developer, async (q) => {
    await rejects(q, "update time_entries set invoice_id = gen_random_uuid() where user_id = $1", [U.developer]);
  });
});

// --- Public API -------------------------------------------------------------------

test("API keys are checked for scope and organization", async () => {
  await asUser(U.admin, async (q) => {
    const [{ k: readKey }] = await q("select create_api_key($1, 'read only', '{read}') k", [ACME]);
    const [{ j }] = await q("select api_projects($1) j", [readKey]);
    assert.ok(j.every((p) => ["WEB", "APP"].includes(p.key)));
    await rejects(q, "select api_create_task($1, 'WEB', '{\"title\":\"x\"}')", [readKey]);
    await rejects(q, "select api_projects('pms_not_a_key')");
  });
});
