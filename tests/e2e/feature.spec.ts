import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/** Fire enough synthetic DeviceMotion events to cross useShake's threshold. */
async function shake(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    // useDeviceMotion smooths magnitude (0.6 old + 0.4 new) and useShake fires
    // when smoothed magnitude > threshold (14). A single big spike only reaches
    // 0.4 * mag, so dispatch a short burst so the smoothed value clears 14.
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          accelerationIncludingGravity: { x: 60, y: 60, z: 60 },
        } as DeviceMotionEventInit),
      );
    }
  });
}

test("ROLL on A → both peers see the same dice total", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(700);

    await a.getByRole("button", { name: "d6", exact: true }).click();
    await a.getByRole("button", { name: "tap to enable shake", exact: true }).click();
    await a.getByRole("button", { name: "ROLL", exact: true }).click();
    await b.waitForTimeout(500);

    const totA = (await a.locator(".dice-total").innerText()).trim();
    const totB = (await b.locator(".dice-total").innerText()).trim();
    if (totA !== totB) throw new Error("disagree: " + totA + " vs " + totB);
    expect(totA).toBe(totB);
  } finally {
    await cleanup();
  }
});

/**
 * The advertised core action is "shake to roll", driven by the device's
 * accelerometer — not the fallback ROLL button. Dispatch a synthetic
 * `devicemotion` burst on peer A and assert (1) a roll actually appears on A
 * and (2) peer B sees the IDENTICAL dice values, proving the shake trigger
 * crosses the mesh.
 */
test("SHAKE on A → both peers see the same roll values", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    // Let both peers' fair-RNG salts propagate before rolling (fairness gate).
    await a.waitForTimeout(900);

    await a.getByRole("button", { name: "d20", exact: true }).click();
    // Arm the shake sensor (mounts the DeviceMotion listener) without clicking ROLL.
    await a.getByRole("button", { name: "tap to enable shake", exact: true }).click();
    await a.waitForTimeout(200);

    // Drive the REAL accelerometer path, not the fallback button.
    await shake(a);

    // A must show a roll produced by the shake.
    await expect(a.locator(".dice-values")).toBeVisible({ timeout: 5000 });
    const valsA = (await a.locator(".dice-values").innerText()).trim();
    expect(valsA.length).toBeGreaterThan(0);

    // B must converge on the SAME values via the shared Yjs event log.
    await expect
      .poll(
        async () =>
          (
            await b
              .locator(".dice-values")
              .innerText()
              .catch(() => "")
          ).trim(),
        {
          timeout: 5000,
        },
      )
      .toBe(valsA);

    const totA = (await a.locator(".dice-total").innerText()).trim();
    const totB = (await b.locator(".dice-total").innerText()).trim();
    expect(totB).toBe(totA);
  } finally {
    await cleanup();
  }
});

/**
 * Fairness: the seed must mix BOTH peers' salts, so neither peer can roll a
 * result derived only from its own randomness. We assert the status line shows
 * 2 salt contributors before a roll is allowed to determine the outcome.
 */
test("roll outcome is jointly seeded — 2 salt contributors", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    // Both peers contribute a salt; the shared status must reflect 2 contributors.
    await expect
      .poll(
        async () =>
          (
            await a
              .locator(".dice-status")
              .innerText()
              .catch(() => "")
          ).trim(),
        {
          timeout: 5000,
        },
      )
      .toContain("2 salt");
    await expect
      .poll(
        async () =>
          (
            await b
              .locator(".dice-status")
              .innerText()
              .catch(() => "")
          ).trim(),
        {
          timeout: 5000,
        },
      )
      .toContain("2 salt");

    // Now a roll fires and both agree.
    await a.getByRole("button", { name: "tap to enable shake", exact: true }).click();
    await a.getByRole("button", { name: "ROLL", exact: true }).click();

    await expect
      .poll(
        async () =>
          (
            await b
              .locator(".dice-total")
              .innerText()
              .catch(() => "")
          ).trim(),
        {
          timeout: 5000,
        },
      )
      .not.toBe("");
    const totA = (await a.locator(".dice-total").innerText()).trim();
    const totB = (await b.locator(".dice-total").innerText()).trim();
    expect(totB).toBe(totA);
  } finally {
    await cleanup();
  }
});
