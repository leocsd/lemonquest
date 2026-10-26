// Refino no Ferreiro (ciclo 16, 16-5): a janela abre na aba "Refinar"; a Katana de Mithril (tier 5) mostra custo,
// chance e ataque antes → depois; cada tentativa cobra ouro + Esmeralda; sucesso sobe o nível (selo "+N" no ícone e no
// nome do balão), falha só gasta o custo. No +5 o botão trava em "Refino máximo". O material extra do +4/+5 (ciclo 20) é
// só dos tiers 7–8: a Katana não pede.
import { expect, test, type Page } from "@playwright/test";
import { NPCS } from "../packages/shared/src/data/npcs.ts";
import { countOf, enterGame, inventory, openNpc, recordToasts, say, seenToast, snap } from "./helpers.ts";

type Inst = { defId: string; count: number; refine?: number } | null;
const katana = async (p: Page) => ((await inventory(p))!.backpack as Inst[]).find((b) => b?.defId === "mithril_katana") ?? null;
const gold = async (p: Page) => (await inventory(p))!.gold;

test("refino: Katana de Mithril do +0 ao +5 no Ferreiro, cobrando ouro e Esmeralda", async ({ page }) => {
  test.setTimeout(150_000);
  await enterGame(page, "knight");
  await say(page, "/gold 1000000");
  await expect.poll(() => gold(page)).toBe(1_000_000);
  await say(page, "/item mithril_katana");
  await say(page, "/item gem_green 40");
  await expect.poll(() => countOf(page, "gem_green")).toBe(40);
  await expect.poll(async () => (await katana(page))?.refine ?? 0).toBe(0);
  await recordToasts(page);

  const win = await openNpc(page, "blacksmith", NPCS.blacksmith!.name);
  await expect(win.getByRole("tab", { name: "Refinar" })).toHaveAttribute("aria-selected", "true");
  const row = win.getByRole("option", { name: /Katana de Mithril/ });
  await expect(row).toContainText("+0/5");
  const detail = win.locator(".refine-detail");
  await expect(detail).toContainText("Ataque 70 → 73");
  await expect(detail).toContainText("100%");
  await expect(detail).toContainText("3.000");
  await expect(detail).toContainText("1x Esmeralda (40)");

  // +1 nunca falha: 3 000 de ouro e 1 Esmeralda.
  await detail.getByRole("button", { name: "Refinar para +1" }).click();
  await seenToast(page, "Refino concluído: Katana de Mithril +1!");
  await expect.poll(async () => (await katana(page))?.refine).toBe(1);
  await expect.poll(() => gold(page)).toBe(997_000);
  await expect.poll(() => countOf(page, "gem_green")).toBe(39);
  await expect(row).toContainText("+1/5");
  // Selo no ícone da mochila.
  const bpIndex = ((await inventory(page))!.backpack as Inst[]).findIndex((b) => b?.defId === "mithril_katana");
  await expect(page.locator(`.hud-panel [data-loc="bp:${bpIndex}"] .item-refine`)).toHaveText("+1");

  // Até o +5: falhas são sorteadas (10–50%); cada clique espera o inventário voltar (botão destrava).
  const btn = detail.locator(".refine-btn");
  for (let i = 0; i < 40 && ((await katana(page))?.refine ?? 0) < 5; i++) {
    const before = await gold(page);
    await expect(btn).toBeEnabled({ timeout: 10_000 });
    await btn.click();
    await expect.poll(() => gold(page), { timeout: 10_000 }).toBeLessThan(before);
  }
  expect((await katana(page))?.refine).toBe(5);
  await expect(btn).toHaveText("Refino máximo");
  await expect(btn).toBeDisabled();
  await expect(row).toContainText("+5/5");
  // Total gasto: pelo menos o caminho sem falhas (3+6+9+12+18 mil) e uma Esmeralda por tentativa.
  const spent = 1_000_000 - (await gold(page));
  expect(spent).toBeGreaterThanOrEqual(48_000);
  expect(40 - (await countOf(page, "gem_green"))).toBeGreaterThanOrEqual(5);

  // Balão do item: nome com "+5" e o ataque do refino separado.
  await page.locator(`.hud-panel [data-loc="bp:${bpIndex}"]`).hover();
  const tip = page.locator(".item-tooltip.show");
  await expect(tip.locator(".it-name")).toHaveText("Katana de Mithril +5");
  await expect(tip.locator(".it-refine")).toContainText("+15 refino");
  await snap(page, "refine-max");
});
