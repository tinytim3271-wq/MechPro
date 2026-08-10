import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
}

async function openPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test("protected dashboard requires authentication", async ({ page }) => {
  await openPage(page, "/dashboard");

  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.getByText("Mobile Mechanic Business Platform")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("checkout refuses a request without an invoice link", async ({ page }) => {
  await openPage(page, "/pay");

  await expect(page.getByRole("heading", { name: "No Invoice Specified" })).toBeVisible();
  await expect(page.getByText("This page requires an invoice link.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("install page describes cached-shell behavior accurately", async ({ page }) => {
  await openPage(page, "/download");

  await expect(page.getByRole("heading", { name: "MechPro for Android" })).toBeVisible();
  await expect(page.getByText("Resilient loading")).toBeVisible();
  await expect(page.getByText("App shell is cached locally")).toBeVisible();
  await expect(page.getByText("Works offline")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});