import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Training-2026";
const run = Date.now().toString(36);
const shared: { trainerSlug?: string; trainerEmail?: string; trainerPassword?: string } = {};

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function fresh(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe.serial("RT Performance end-to-end", () => {
  test("Scenario A — Raymond builds, assigns, logs and inspects progress", async ({ page }) => {
    await signIn(page, "raymond@rtperformance.dev");
    await expect(page).toHaveURL(/\/w\/rt-performance$/);
    await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();

    // Create an athlete
    await page.goto("/w/rt-performance/athletes/new");
    await page.getByLabel("First name").fill("Jamie");
    await page.getByLabel("Last name").fill(`E2E-${run}`);
    await page.getByLabel("Training goals").fill("Learn the main lifts");
    await page.getByRole("button", { name: "Create athlete" }).click();
    await expect(page.getByRole("heading", { name: `Jamie E2E-${run}` })).toBeVisible();
    const athleteUrl = page.url().split("?")[0]!;

    // Create a program in the builder
    await page.goto("/w/rt-performance/programs/new");
    await page.getByLabel("Name").fill(`E2E Program ${run}`);
    await page.getByLabel("Weeks").fill("1");
    await page.getByLabel("Sessions per week").fill("1");
    await page.getByRole("button", { name: "Create draft program" }).click();
    await expect(page.getByRole("heading", { name: `E2E Program ${run}` })).toBeVisible();
    await page.getByRole("button", { name: "Add session" }).click();
    await page.getByLabel("Session name").fill("Total Body");
    await page.getByRole("button", { name: "Add session" }).last().click();
    await expect(page.getByRole("heading", { name: "Total Body" })).toBeVisible();
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.getByPlaceholder("Search exercises").fill("Back Squat");
    await page.getByRole("button", { name: /^Back Squat/ }).click();
    await expect(page.getByRole("button", { name: /Back Squat/ }).first()).toBeVisible();

    // Publish (with confirmation)
    await page.getByRole("button", { name: "Publish v1" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("v1 · published")).toBeVisible();

    // Assign it to the new athlete on every day so today's session exists
    await page.goto(`${athleteUrl}?tab=program`);
    await page.getByLabel("Program").selectOption({ label: `E2E Program ${run} · v1` });
    for (const box of await page.locator('input[name="training_days"]').all()) await box.check({ force: true });
    await page.getByRole("button", { name: "Assign program" }).click();
    await expect(page.getByText("Program assigned")).toBeVisible();

    // Record a workout on the athlete's behalf
    await page.getByRole("button", { name: "Log for athlete" }).first().click();
    await page.waitForURL(/\/workouts\//);
    await page.getByLabel("Back Squat set 1 reps").fill("5");
    await page.getByLabel("Back Squat set 1 weight").fill("135");
    await page.getByRole("button", { name: "Save Back Squat set 1" }).click();
    await expect(page.getByRole("button", { name: "Save Back Squat set 1" })).toHaveClass(/border-accent/);
    await page.getByRole("button", { name: "Complete workout" }).click();
    await expect(page.getByRole("heading", { name: "Session recorded" })).toBeVisible();

    // Inspect progress
    await page.goto(`${athleteUrl}?tab=progress`);
    await expect(page.getByText("1 of 1 started")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Back Squat" })).toBeVisible();
  });

  test("Scenario B — Raymond invites a trainer who sets up an independent workspace", async ({ page, browser }) => {
    await signIn(page, "raymond@rtperformance.dev");
    await page.goto("/w/rt-performance/network");
    const email = `trainer-${run}@e2e.rtperformance.dev`;
    await page.getByLabel("Trainer email").fill(email);
    await page.getByLabel("Suggested workspace name").fill(`Coach ${run}`);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const link = await page.getByLabel("Invitation link").inputValue();
    expect(link).toContain("/invite/");
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    // The trainer, in a separate browser session
    const { context, page: t } = await fresh(browser);
    await t.goto(new URL(link).pathname);
    await expect(t.getByText("Trainer network invitation")).toBeVisible();
    await t.getByRole("link", { name: "Create account" }).click();
    await t.getByLabel("Full name").fill("Casey Trainer");
    await t.getByLabel("Password").fill("Trainer-Pass-2026");
    await t.getByRole("button", { name: "Create account" }).click();
    await t.waitForURL(/\/invite\//);
    const slug = `coach-${run}`;
    await t.getByLabel("Workspace address").fill(slug);
    await t.getByRole("button", { name: "Create my workspace" }).click();
    await t.waitForURL(new RegExp(`/w/${slug}/settings`));
    await expect(t.getByText("Your workspace is live.")).toBeVisible();
    shared.trainerSlug = slug;
    shared.trainerEmail = email;
    shared.trainerPassword = "Trainer-Pass-2026";

    // Configure branding (Scenario E setup)
    await t.getByLabel("Welcome headline").fill(`Built different ${run}`);
    await t.getByLabel("Accent", { exact: true }).fill("#8FA3B8");
    await t.getByRole("button", { name: "Save branding" }).click();
    await expect(t.getByText("Branding saved")).toBeVisible();

    // Add an athlete and create a program in the trainer's own workspace
    await t.goto(`/w/${slug}/athletes/new`);
    await t.getByLabel("First name").fill("Riley");
    await t.getByRole("button", { name: "Create athlete" }).click();
    await expect(t.getByRole("heading", { name: "Riley" })).toBeVisible();
    await t.goto(`/w/${slug}/programs/new`);
    await t.getByLabel("Name").fill("Trainer Program");
    await t.getByRole("button", { name: "Create draft program" }).click();
    await expect(t.getByRole("heading", { name: "Trainer Program" })).toBeVisible();

    // The Tech Guy is reachable; without provider credentials it degrades gracefully.
    await t.goto(`/w/${slug}/assistant`);
    await expect(t.getByText(/What are we building/)).toBeVisible();

    // Isolation: Raymond's workspace and athletes are invisible to the trainer.
    const r = await t.goto("/w/rt-performance");
    expect(r?.status()).toBe(404);
    await t.goto(`/w/${slug}/athletes`);
    await expect(t.getByRole("link", { name: "Riley" })).toBeVisible();
    await expect(t.getByText("Maya Chen")).toHaveCount(0);
    expect((await t.request.get("/w/rt-performance/athletes")).status()).toBe(404);
    // Network administration is owner-only.
    expect((await t.goto(`/w/${slug}/network`))?.status()).toBe(404);
    await context.close();

    // Raymond sees the new workspace in aggregate only.
    await page.reload();
    await expect(page.getByRole("cell", { name: new RegExp(`Coach ${run}|${slug}`) }).first()).toBeVisible();
  });

  test("Scenario E — the trainer's branding shows on their public page without touching others", async ({ browser }) => {
    expect(shared.trainerSlug).toBeTruthy();
    const { context, page } = await fresh(browser);
    await page.goto(`/t/${shared.trainerSlug}`);
    await expect(page.getByRole("heading", { name: `Built different ${run}` })).toBeVisible();
    const accent = await page.locator("div[style*='--brand-accent']").first().getAttribute("style");
    expect(accent?.toLowerCase()).toContain("#8fa3b8");
    await page.goto("/t/rt-performance");
    await expect(page.getByRole("heading", { name: /Discipline creates momentum/i })).toBeVisible();
    expect((await page.locator("div[style*='--brand-accent']").first().getAttribute("style"))?.toLowerCase()).toContain("#c8a45d");
    await context.close();
  });

  test("Scenario C — an athlete sees only their program and records a real session", async ({ page }) => {
    await signIn(page, "maya@athlete.dev");
    await expect(page).toHaveURL(/\/t\/rt-performance\/athlete$/);
    await expect(page.getByRole("heading", { name: "Today's session" })).toBeVisible();

    const start = page.getByRole("button", { name: "Start workout" });
    const resume = page.getByRole("link", { name: /Resume workout/ });
    if ((await start.count()) > 0) await start.first().click();
    else if ((await resume.count()) > 0) await resume.first().click();
    else test.info().annotations.push({ type: "note", description: "Today's session already completed in a previous run" });

    if (page.url().includes("/workout/")) {
      const firstReps = page.getByLabel(/set 1 reps$/).first();
      await firstReps.fill("6");
      const weight = page.getByLabel(/set 1 weight$/).first();
      if (await weight.count()) await weight.fill("95");
      await page.getByRole("button", { name: /^Save .* set 1$/ }).first().click();
      await expect(page.getByRole("button", { name: /^Save .* set 1$/ }).first()).toHaveClass(/border-accent/);
      await page.getByRole("button", { name: "8", exact: true }).click();
      await page.getByRole("button", { name: "Complete workout" }).click();
      await expect(page.getByRole("heading", { name: "Session recorded" })).toBeVisible();
    }

    // Persisted in history
    await page.goto("/t/rt-performance/athlete/history");
    await expect(page.getByText("Completed").first()).toBeVisible();

    // Only her own program; coach areas are off limits.
    await page.goto("/t/rt-performance/athlete/program");
    await expect(page.getByRole("heading", { name: "Foundations Strength" })).toBeVisible();
    await page.goto("/w/rt-performance");
    await expect(page).toHaveURL(/\/t\/rt-performance\/athlete$/);
    expect((await page.goto(`/t/reyes-strength/athlete`))?.status()).toBe(404);
  });
});
