// Bestiário (tecla B): personagem novo vê tudo como "???"; depois de derrotar um rato, ele aparece com os detalhes.
import { expect, test } from "@playwright/test";
import { enterGame, monsters, setChase, setLevel, targetNearest, teleport, walkableNear } from "./helpers.ts";

test("bestiário: desconhecidos como ???, e o rato aparece depois do primeiro abate", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");
  await page.keyboard.press("b");
  const win = page.getByRole("dialog", { name: "Bestiário" });
  await expect(win).toBeVisible();
  await expect(win).toContainText("0 de");
  await expect(win.locator('[data-monster="rat"]')).toContainText("???");
  // Filtros e "onde procurar" (ciclo 17): a zona filtra a lista; mesmo sem conhecer, o rato diz onde vive.
  await win.getByRole("combobox", { name: "Zona" }).selectOption("Floresta Sussurrante");
  await expect(win.locator('[data-monster="rat"]')).toBeVisible();
  await expect(win.locator('[data-monster="dragon"]')).toHaveCount(0);
  await win.locator('[data-monster="rat"]').click();
  await expect(win.locator(".be-unknown")).toContainText("Onde procurar: Floresta Sussurrante");
  await win.getByRole("combobox", { name: "Zona" }).selectOption("");
  await expect(win.locator('[data-monster="dragon"]')).toBeVisible();
  await win.getByRole("button", { name: "Fechar" }).focus(); // o Esc não depende do select focado
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);

  // Abate um rato na floresta (nível alto para não depender de sorte).
  await setLevel(page, 30);
  const spot = (await walkableNear(page, 70, 62, 3))[0]!;
  await teleport(page, spot.x, spot.y);
  await setChase(page, true);
  await expect.poll(async () => (await monsters(page)).some((m) => m.defId === "rat"), { timeout: 20_000 }).toBe(true);
  await targetNearest(page, (d) => d === "rat");
  await page.keyboard.press("b");
  await expect(win).toBeVisible();
  await expect.poll(async () => (await win.locator('[data-monster="rat"]').innerText()).includes("Rato"), { timeout: 60_000 }).toBe(true);
  await win.locator('[data-monster="rat"]').click();
  await expect(win).toContainText("Abates:");
  await expect(win).toContainText("Pode soltar");
});
