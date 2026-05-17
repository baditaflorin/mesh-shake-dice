import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

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
