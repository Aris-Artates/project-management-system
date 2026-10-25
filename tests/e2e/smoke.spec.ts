import { expect, test, type Page } from "@playwright/test";

// Demo accounts from supabase/seed.sql.
const PASSWORD = process.env.E2E_PASSWORD ?? "Password123!";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/orgs|\/portal|\/acme/);
}

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/acme/projects");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("an Org Admin can open a project and add and delete a task", async ({ page }) => {
  await signIn(page, "admin@acme.test");
  await page.goto("/acme/projects");
  await page.getByRole("link", { name: /Website Redesign/ }).first().click();
  await expect(page.getByRole("heading", { name: "Website Redesign" })).toBeVisible();

  await page.goto("/acme/projects/WEB/tasks");
  const title = `E2E task ${Date.now()}`;
  await page.locator('input[name="title"]').first().fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  const link = page.getByRole("link", { name: title });
  await expect(link).toBeVisible();

  // Clean up so the live demo data stays tidy.
  await link.click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete task" }).click();
  await page.waitForURL(/\/tasks$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("a client only sees the portal and shared work", async ({ page }) => {
  await signIn(page, "client@acme.test");
  await page.goto("/acme/projects/WEB");
  await expect(page).toHaveURL(/\/portal\/acme/);

  await page.goto("/portal/acme/WEB/tasks/2");
  await expect(page.getByText("Can we try a darker background on the hero?")).toBeVisible();
  await expect(page.getByText("keep the budget for illustration")).toHaveCount(0);

  const hidden = await page.request.get("/portal/acme/WEB/tasks/3");
  expect(hidden.status()).toBe(404);
});

test("the API rejects requests without a key", async ({ request }) => {
  const res = await request.get("/api/v1/projects");
  expect(res.status()).toBe(401);
});
