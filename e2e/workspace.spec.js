import { test, expect } from "@playwright/test";
test("complete workspace journey on desktop and mobile", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("#password").fill("e2e-workspace-password");
  await page.getByRole("button", { name: "Open your workspace" }).click();
  await expect(page.locator("#workspace")).toBeVisible();
  // Works both on a fresh run and after a retry against the same test server.
  if (await page.locator("#demo").isVisible()) {
    await page.getByRole("button", { name: "Try a sample journal" }).click();
    await expect(page.locator(".card")).toHaveCount(6);
  }
  const unique = `Browser decision ${Date.now()}`;
  await page.locator("#new").click();
  await page.locator("#title").fill(unique);
  await page.locator("#record-project").fill("Quality");
  await page.locator("#context").fill("Verify the complete journey.");
  await page.locator("#tags").fill("test, journey");
  await page.locator("#save").click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.locator("#search").fill(unique);
  await expect(page.locator(".card")).toHaveCount(1);
  await page.locator(".card").click();
  await page.locator("#status").selectOption("accepted");
  await page.locator("#decision").fill("The complete flow works.");
  await page.locator("#save").click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator(".card .badge")).toHaveText("Accepted");
  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await page.locator("#search").fill(unique);
  await page.locator(".card").click();
  await expect(page.locator("#decision")).toHaveValue(
    "The complete flow works.",
  );
  await page.locator("#delete").click();
  await page.locator("#confirm-delete").click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator(".card")).toHaveCount(0);
  await expect(page.locator("#empty")).toBeVisible();
  await page.locator("#search").fill("");
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await downloadEvent).suggestedFilename()).toBe("trace-backup.json");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("#logout")).toBeVisible();
  await page.locator("#logout").click();
  await expect(page.locator("#login")).toBeVisible();
  expect(errors).toEqual([]);
});
