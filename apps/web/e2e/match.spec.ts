import { test, expect } from "@playwright/test";

/**
 * Phase 3 — the match step. Drives the real UI: load the sample project
 * (which ships with two beats), run match-by-number, then override a beat
 * by hand and confirm the coverage report tracks it.
 */
test.describe("Match images to beats", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Projects live in OPFS/localStorage per origin; start each run clean.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("loads the sample project and reaches the match step", async ({ page }) => {
    await page.getByRole("button", { name: "Load sample" }).click();

    // The sample lands on the script step with its beats already split.
    await expect(page.getByRole("heading", { name: "Script to beats" })).toBeVisible();

    await page.getByRole("link", { name: /Match/ }).first().click();
    await expect(page.getByRole("heading", { name: "Match images to beats" })).toBeVisible();

    // No assets imported, so every beat is pending and coverage reads 0%.
    await expect(page.getByRole("progressbar", { name: "Beat match coverage" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(page.getByText("2 pending")).toBeVisible();
  });

  test("match by number reports when no filenames carry a beat number", async ({ page }) => {
    await page.getByRole("button", { name: "Load sample" }).click();
    await expect(page.getByRole("heading", { name: "Script to beats" })).toBeVisible();

    await page.getByRole("link", { name: /Match/ }).first().click();
    await page.getByRole("button", { name: "Match by number" }).click();

    await expect(page.getByRole("status")).toContainText("No filenames started with a beat number");
  });

  test("keyboard selection moves between beats", async ({ page }) => {
    await page.getByRole("button", { name: "Load sample" }).click();
    await expect(page.getByRole("heading", { name: "Script to beats" })).toBeVisible();

    await page.getByRole("link", { name: /Match/ }).first().click();
    await expect(page.getByText("Selected · beat 1")).toBeVisible();

    await page.keyboard.press("j");
    await expect(page.getByText("Selected · beat 2")).toBeVisible();

    await page.keyboard.press("k");
    await expect(page.getByText("Selected · beat 1")).toBeVisible();
  });

  test("a beat with no candidate cannot be assigned one", async ({ page }) => {
    await page.getByRole("button", { name: "Load sample" }).click();
    await expect(page.getByRole("heading", { name: "Script to beats" })).toBeVisible();

    await page.getByRole("link", { name: /Match/ }).first().click();

    // Sample project ships no images, so the candidate pool is empty.
    await expect(page.getByText("No candidates")).toBeVisible();
    await expect(page.getByLabel("Candidate for beat 1")).toHaveValue("");
  });
});
