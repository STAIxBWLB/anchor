import { expect, test } from "@playwright/test";

test("opens a binary file as a viewer tab", async ({ page }) => {
  await page.goto("/");

  const explorer = page.locator(".document-list");
  await explorer.getByRole("button", { name: "Files" }).click();
  await explorer.getByRole("button", { name: "모두 펴기" }).click();

  const pdfRow = explorer.getByRole("button", { name: /rise-budget-review\.pdf/ });
  await expect(pdfRow).toBeVisible();
  await pdfRow.dblclick();

  const pdfTab = page.locator(
    ".document-tab-title",
    { hasText: "rise-budget-review.pdf" },
  );
  await expect(pdfTab).toBeVisible();
  await expect(page.locator(".binary-viewer-shell")).toBeVisible();
  await expect(page.locator(".binary-viewer-header strong")).toHaveText(
    "rise-budget-review.pdf",
  );

  // Closing the binary tab from the strip removes the viewer.
  await page
    .locator(".document-tab", { has: pdfTab })
    .locator(".document-tab-close")
    .click();
  await expect(pdfTab).toHaveCount(0);
  await expect(page.locator(".binary-viewer-shell")).toHaveCount(0);
});

test("right-clicking a binary file exposes Open file menu item", async ({ page }) => {
  await page.goto("/");

  const explorer = page.locator(".document-list");
  await explorer.getByRole("button", { name: "Files" }).click();
  await explorer.getByRole("button", { name: "모두 펴기" }).click();

  await explorer
    .getByRole("button", { name: /rise-budget-review\.pdf/ })
    .click({ button: "right" });

  await expect(
    explorer.locator(".context-menu").getByRole("menuitem", { name: "파일 열기" }),
  ).toBeVisible();
});
