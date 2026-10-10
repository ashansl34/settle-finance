import { test, expect } from "@playwright/test";
test("share a group link and invite an existing friend", async ({ page }) => {
  await page.goto("/");
  const groups = page
    .locator("nav")
    .getByRole("button", { name: /^Groups(?: \d+)?$/ })
    .filter({ visible: true });
  await groups.click();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page.getByLabel("Group name").fill("Study Circle");
  await page.getByLabel("A little about the group").fill("Our study group");
  await page.getByLabel("Monthly group fund target (LKR)").fill("6000");
  await page
    .getByRole("button", { name: "Create group", exact: true })
    .last()
    .click();
  await page
    .locator(".group-card")
    .filter({ hasText: "Study Circle" })
    .getByRole("button", { name: "Open group" })
    .click();
  await page
    .getByRole("button", { name: "Invite a friend", exact: true })
    .click();
  await page.getByLabel("Choose a friend").selectOption("kasun");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByText("Invitation pending · Kasun Silva"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate join link" }).click();
  const link = await page
    .getByLabel("Group join link", { exact: true })
    .inputValue();
  expect(link).toContain("#join=");
  await page.getByLabel("Demo person").selectOption("kasun");
  await groups.click();
  await page
    .getByRole("button", { name: "Accept invite", exact: true })
    .click();
  await expect(
    page
      .locator(".group-card")
      .filter({ hasText: "Study Circle" })
      .getByRole("button", { name: "Open group" }),
  ).toBeVisible();
  await page.goto(link);
  await page.getByLabel("Demo person").selectOption("dilshan");
  await page.getByRole("button", { name: "View group invite" }).click();
  await expect(page.getByRole("dialog")).toContainText("Join Study Circle?");
  await page.getByRole("button", { name: "Request to join group" }).click();
  await expect(
    page.locator(".group-card").filter({ hasText: "Study Circle" }),
  ).toContainText("Awaiting admin approval");
});
