import { test, expect } from "@playwright/test";
import { seed } from "../src/lib/seed";
test("daily colors, account top-up and recorded bank payment", async ({
  page,
}) => {
  const initial = seed();
  initial.entries = [];
  initial.preferences = [];
  await page.addInitScript(
    (data) => localStorage.setItem("settle-demo-v1", JSON.stringify(data)),
    initial,
  );
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /^(My Balance|Balance)$/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("button", { name: "Set daily limit", exact: true })
    .click();
  await page.getByLabel("Daily limit (LKR)").fill("1000");
  await page.getByRole("button", { name: "Save daily limit" }).click();
  const budget = page.getByRole("region", { name: "Daily spending limit" });
  await expect(budget).toHaveClass(/green/);
  await page
    .getByRole("button", { name: "Add money to Bank", exact: true })
    .click();
  await page.getByLabel("Amount (LKR)").fill("5000");
  await expect(page.getByLabel("Into account")).toHaveValue("Bank");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByTestId("account-bank")).toContainText("5,000");
  for (const [amount, color] of [
    ["500", "green"],
    ["250", "orange"],
    ["250", "red"],
  ]) {
    await page
      .getByRole("button", { name: "Record friend payment", exact: true })
      .click();
    await page.getByLabel("Amount (LKR)").fill(amount);
    await page
      .getByLabel("Note or bank reference")
      .fill(`Bank payment ${color}`);
    await page.getByRole("button", { name: "Save friend payment" }).click();
    await expect(budget).toHaveClass(new RegExp(color));
  }
  await expect(page.getByTestId("account-bank")).toContainText("4,000");
  await expect(page.getByTestId("account-wallet")).toContainText("LKR 0");
  await expect(page.getByText(/Bank → Kasun Silva/).first()).toBeVisible();
  await expect(budget).toContainText("100% used");
  await expect(
    page.getByRole("region", { name: "Current spending totals" }),
  ).toContainText("This week");
});
