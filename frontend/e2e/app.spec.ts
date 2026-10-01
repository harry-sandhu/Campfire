import { expect, test } from "@playwright/test";
import { ADMIN, adminToken, bootstrap, createUser, get, login, post, signIn, signInAsAdmin } from "./helpers";

test.beforeAll(async () => { await bootstrap(); });

test("create a group and a ticket, comment with Markdown, change status", async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto("/groups");
  await page.getByRole("button", { name: "+ Create group" }).click();
  const groupDialog = page.getByRole("dialog", { name: "Create group" });
  await groupDialog.getByLabel("Name").fill("Operations");
  await groupDialog.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("Operations")).toBeVisible();

  await page.goto("/tickets");
  await page.keyboard.press("c"); // global shortcut
  const dialog = page.getByRole("dialog", { name: "Create ticket" });
  await dialog.getByLabel("Title").fill("Fix the login page");
  await dialog.getByLabel("Group").selectOption({ label: "Operations" });
  await dialog.getByRole("button", { name: "Create ticket" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fix the login page");
  await page.getByLabel("New comment").fill("This is **important**");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.locator(".comment strong", { hasText: "important" })).toBeVisible();

  await page.getByLabel("Status").selectOption("IN_PROGRESS");
  await expect(page.getByText(/status changed/i).first()).toBeVisible();
});

test("a new user must change their password and cannot see another group's ticket", async ({ page }) => {
  const admin = await adminToken();
  const group = await post(admin, "/groups", { name: "Secret Club" });
  const ticket = await post(admin, "/tickets", { title: "Top secret plan", groupId: group.id });
  await createUser(admin, "Bob Tester", "bob@example.com");

  await signIn(page, "bob@example.com", "temp-password-1");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");
  await page.getByLabel("Current password").fill("temp-password-1");
  await page.getByLabel("New password", { exact: true }).fill("my-new-password-9");
  await page.getByLabel("Confirm new password").fill("my-new-password-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);

  await page.goto("/tickets");
  await expect(page.getByText("No tickets found")).toBeVisible();
  await expect(page.getByText("Top secret plan")).toHaveCount(0);
  await page.goto(`/tickets/${ticket.id}`);
  await expect(page.getByText("Ticket not found")).toBeVisible();
});

test("drag a card on the board to change its status", async ({ page }) => {
  const admin = await adminToken();
  const ticket = await post(admin, "/tickets", { title: "Drag me" });
  await signInAsAdmin(page);
  await page.goto("/tickets?view=board");
  const card = page.locator(".card", { hasText: "Drag me" });
  await card.dragTo(page.locator(".column", { hasText: "In progress" }));
  await expect.poll(async () => (await get(admin, `/tickets/${ticket.id}`)).ticket.status).toBe("IN_PROGRESS");
});

test("command palette finds a ticket and opens it", async ({ page }) => {
  const admin = await adminToken();
  await post(admin, "/tickets", { title: "Quarterly budget review" });
  await signInAsAdmin(page);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Command search").fill("budget");
  await page.getByRole("option", { name: /Quarterly budget review/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quarterly budget review");
});

test("SuperAdmin can permanently delete tickets from data management", async ({ page }) => {
  const admin = await adminToken();
  const ticket = await post(admin, "/tickets", { title: "Disposable ticket" });
  await signInAsAdmin(page);
  await page.goto("/admin/data");
  await page.getByLabel("Age").selectOption({ label: "Any age" }); // the page defaults to tickets untouched for a year
  await page.getByLabel("Search", { exact: true }).fill("Disposable");
  const row = page.locator("tr", { hasText: "Disposable ticket" });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete selected…" }).click();
  const dialog = page.getByRole("dialog", { name: "Permanently delete tickets" });
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("No tickets match")).toBeVisible();
  await expect(get(admin, `/tickets/${ticket.id}`)).rejects.toThrow(/404/);
});

test("live updates: a comment from another user appears without reloading", async ({ page }) => {
  const admin = await adminToken();
  const ticket = await post(admin, "/tickets", { title: "Live ticket" });
  await signInAsAdmin(page);
  await page.goto(`/tickets/${ticket.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Live ticket");
  await page.waitForTimeout(500); // let the event stream connect
  await post(await login(ADMIN.email, ADMIN.password), `/tickets/${ticket.id}/comments`, { body: "Posted from elsewhere" });
  await expect(page.getByText("Posted from elsewhere")).toBeVisible({ timeout: 10_000 });
});
