import { test, expect } from "@playwright/test";
test("shared custom expense links cash once and uses only the personal share", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Groups(?: \d+)?$/ })
    .filter({ visible: true })
    .click();
  await page
    .locator(".group-card")
    .filter({ hasText: "The Boarding House" })
    .getByRole("button", { name: "Open group" })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What did you pay for?").fill("Browser shared dinner");
  await page.getByLabel("Total paid (LKR)").fill("900");
  await page.getByLabel(/^Custom shares/).fill("100,300,500");
  await page.getByLabel("Also record my cash payment in My Balance").check();
  await page.getByRole("button", { name: "Add shared expense" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(
    page.getByText("Browser shared dinner", { exact: true }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: /^(My Balance|Balance)$/ })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByText("Group: Browser shared dinner", { exact: true }),
  ).toHaveCount(1);
  const raw = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("settle-demo-v1")!),
  );
  const entry = raw.entries.find(
    (e: { note: string }) => e.note === "Group: Browser shared dinner",
  );
  expect(entry.amount).toBe(90000);
  expect(entry.expenseShare).toBe(10000);
});
test("dashboard, private entry and reports", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hey, Ashan." }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.getByRole("button", { name: "Add income", exact: true }).click();
  await page.getByLabel("Amount (LKR)").fill("1234.56");
  await page.getByLabel("Note", { exact: true }).fill("Browser test income");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "View all", exact: true }).click();
  await expect(page.getByText("Browser test income")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "View all", exact: true }).click();
  await expect(page.getByText("Browser test income")).toBeVisible();
});
test("two people complete the activation handshake", async ({ page }) => {
  await page.goto("/");
  const loans = page
    .locator("nav")
    .getByRole("button", { name: /^(My Loans|Loans)$/ })
    .filter({ visible: true });
  await loans.click();
  await page
    .getByRole("button")
    .filter({ hasText: "Bus pass for next month" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept request", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo person").selectOption("kasun");
  await loans.click();
  await page
    .getByRole("button")
    .filter({ hasText: "Bus pass for next month" })
    .click();
  await page
    .getByRole("button", { name: "Accept request", exact: true })
    .click();
  await page.getByRole("button", { name: "I’ve sent the money" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo person").selectOption("ashan");
  await loans.click();
  await page
    .getByRole("button")
    .filter({ hasText: "Bus pass for next month" })
    .click();
  await page
    .getByRole("button", { name: "I received the money · Generate code" })
    .click();
  const code = await page.locator(".receipt-code strong").innerText();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo person").selectOption("kasun");
  await loans.click();
  await page
    .getByRole("button")
    .filter({ hasText: "Bus pass for next month" })
    .click();
  await page.getByRole("button", { name: "Enter receiver’s code" }).click();
  await page.getByLabel("6-digit receipt code").fill(code);
  await page.getByRole("button", { name: "Verify transfer" }).click();
  await expect(page.locator(".loan-detail-heading .badge")).toHaveText(
    "Active",
  );
});
