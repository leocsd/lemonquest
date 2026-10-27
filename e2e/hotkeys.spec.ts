// Janela "Magias" (tecla H): trocar a tecla de uma magia, tecla do jogo recusada, lançar pela tecla nova, salvo no
// personagem (volta depois de recarregar a página); tirar da barra e pôr de volta pelo slot "+"; troca de magias
// arrastando na barra real; família liberando no level; montar um grupo no editor numerado, "Mais forte primeiro",
// pôr na barra, lançar e manter.
import { expect, test } from "@playwright/test";
import { enterGame, meState, monsters, playFromList, setLevel, snap, targetNearest, teleport, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ: a regen de mana é baixa e o gasto da magia aparece). */
const FOREST = { x: 70, y: 62 };

test("magias: trocar a tecla da Cura para G, recusar Q, lançar com G e manter depois de recarregar", async ({ page }) => {
  const p = await enterGame(page, "druid");
  await setLevel(page, 20);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  const canvas = page.locator("#game canvas");
  await canvas.hover({ position: { x: 300, y: 300 } });

  // Padrão: Cura na tecla 1.
  const first = page.locator(".action-slot").first();
  await expect(first.locator(".action-key")).toHaveText("1");

  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  // Selecionar o slot da tecla 1: o painel diz o que está nele e o tile da Cura fica marcado.
  await win.getByRole("option", { name: "Tecla 1: Cura" }).click();
  await expect(win.locator(".sw-panel-title")).toContainText("Cura");
  await expect(win.getByRole("button", { name: /^Cura, tecla 1/ })).toHaveAttribute("aria-pressed", "true");
  await win.getByRole("button", { name: "Trocar tecla" }).click();
  await expect(win).toContainText("Aperte a nova tecla");
  // Q é a poção de vida: recusada com o motivo, e nada de poção (continua esperando a tecla).
  await page.keyboard.press("q");
  await expect(win).toContainText("usada por: Poção de vida");
  await page.keyboard.press("g");
  await expect(win.locator(".sw-slot.sel .sw-slot-key")).toHaveText("G");
  await snap(page, "spells-window");
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();

  await expect(first.locator(".action-key")).toHaveText("G");
  const mana0 = (await meState(page))!.mana as number;
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press("g");
  await expect.poll(async () => (await meState(page))!.mana as number, { timeout: 5000 }).toBeLessThan(mana0);
  await expect(first).toHaveClass(/cooling/);

  // Salvo no personagem: recarregar a página e entrar de novo mantém o G.
  await page.reload();
  await playFromList(page, p);
  await expect(page.locator(".action-slot").first().locator(".action-key")).toHaveText("G");
});

test("magias: tirar um atalho da barra e pôr de volta pelo slot +", async ({ page }) => {
  await enterGame(page, "sorcerer");
  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  // Pés Ligeiros libera no level 5: no level 1 o nome do slot termina com ", libera no level 5".
  const slot = win.getByRole("option", { name: /^Tecla \S+: Pés Ligeiros\b/ });
  const key = (await slot.locator(".sw-slot-key").innerText()).trim();
  await slot.click();
  await win.getByRole("button", { name: "Tirar da barra" }).click();
  await expect(win.getByRole("option", { name: /^Tecla \S+: Pés Ligeiros\b/ })).toHaveCount(0);
  await expect(win).toContainText("Atalho tirado da barra.");
  // O "+" recebe a magia na próxima tecla livre (a que acabou de vagar) e o slot volta selecionado.
  await win.getByRole("option", { name: "Atalho novo" }).click();
  await win.getByRole("button", { name: /^Pés Ligeiros/ }).click();
  await expect(win.getByRole("option", { name: new RegExp(`^Tecla ${key}: Pés Ligeiros\\b`) })).toHaveAttribute("aria-selected", "true");
  await expect(win).toContainText(`Na tecla ${key}.`);
});

test("atalhos: arrastar um slot sobre outro troca as magias e as teclas ficam", async ({ page }) => {
  await enterGame(page, "sorcerer");
  const slots = page.locator(".action-slot");
  const words = async (i: number) => (await slots.nth(i).getAttribute("data-tip")) ?? "";
  const a = await words(0), b = await words(1);
  expect(a).not.toBe(b);
  // Arrasto de verdade com o mouse (mousedown → movimentos → mouseup), como o jogador faz.
  const from = (await slots.nth(0).boundingBox())!, to = (await slots.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => words(0)).toBe(b);
  expect(await words(1)).toBe(a);
  await expect(slots.nth(0).locator(".action-key")).toHaveText("1");
  await expect(slots.nth(1).locator(".action-key")).toHaveText("2");
});

test("família de magias: só o que está liberado aparece, magia nova avisa e a tecla da família solta a mais forte pronta", async ({ page }) => {
  await enterGame(page, "sorcerer");
  const slots = page.locator(".action-slot");
  // lv 1: Cura (1) e a família "Ataque no alvo" (2); o resto da barra recomendada ainda está bloqueado e não aparece.
  await expect(slots).toHaveCount(2);
  await expect(slots.nth(1)).toHaveClass(/family/);
  await expect(slots.nth(1)).toHaveAttribute("data-tip", "Ataque no alvo: Bola de Fogo");

  await setLevel(page, 20);
  await expect(page.locator(".toast").filter({ hasText: /Novas magias|Nova magia/ }).first()).toBeVisible();
  await expect(slots).toHaveCount(6);

  // Sem alvo, a família fica apagada; com alvo ao lado, a tecla 2 solta o Raio de Energia (a mais forte no lv 20).
  await expect(slots.nth(1)).toHaveClass(/no-target/);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  // O alvo (rato) pode morrer ou fugir antes da tecla: até 3 tentativas, mirando de novo no mais perto.
  const beamCd = () => page.evaluate(() => (window as any).__lq.spellCd("energy_beam") as number);
  for (let attempt = 0; attempt < 3 && (await beamCd()) === 0; attempt++) {
    const pos = (await meState(page))!;
    const mob = (await monsters(page)).sort((a, b) => Math.max(Math.abs(a.x - pos.x), Math.abs(a.y - pos.y)) - Math.max(Math.abs(b.x - pos.x), Math.abs(b.y - pos.y)))[0];
    const near = mob && (await walkableNear(page, mob.x, mob.y, 2)).find((w) => w.x !== mob.x || w.y !== mob.y);
    if (near) await teleport(page, near.x, near.y);
    await targetNearest(page);
    await expect(slots.nth(1)).toHaveAttribute("data-tip", "Ataque no alvo: Raio de Energia");
    await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
    await page.keyboard.press("2");
    await expect.poll(beamCd, { timeout: 3000 }).toBeGreaterThan(0).catch(() => {});
  }
  expect(await beamCd()).toBeGreaterThan(0);
  await snap(page, "spell-family");
});

test("grupos: montar o próprio grupo no editor numerado, 'Mais forte primeiro', pôr na barra, lançar e manter depois de recarregar", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 60);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  const canvas = page.locator("#game canvas");
  await canvas.hover({ position: { x: 300, y: 300 } });

  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  await win.getByRole("button", { name: "+ Novo grupo" }).click();
  const editor = win.locator(".sw-group");
  await expect(editor).toBeVisible();
  await editor.getByRole("textbox", { name: "Nome do grupo" }).fill("Meu combo");

  // Clique adiciona no fim; "Mais forte primeiro" põe a Onda de Fogo (lv 35) na frente da Bola de Fogo (lv 1).
  await editor.getByRole("button", { name: /^Bola de Fogo/ }).click();
  await editor.getByRole("button", { name: /^Onda de Fogo/ }).click();
  // Nomes na ordem (sem o selo "sai agora", que fica dentro do nome).
  const names = async () => (await editor.locator(".sw-row .sw-row-name").allInnerTexts()).map((n) => n.replace("sai agora", "").trim());
  await expect.poll(names).toEqual(["Bola de Fogo", "Onda de Fogo"]);
  await editor.getByRole("button", { name: "Mais forte primeiro" }).click();
  await expect.poll(names).toEqual(["Onda de Fogo", "Bola de Fogo"]);
  await expect(editor.locator(".sw-row.now .sw-row-name")).toContainText("Onda de Fogo");
  await snap(page, "spells-group-editor");

  await editor.getByRole("button", { name: "Pôr na barra" }).click();
  const onBar = editor.locator(".sw-group-onbar kbd");
  await expect(onBar).toBeVisible();
  const key = (await onBar.innerText()).trim();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();

  const slot = page.locator(".action-slot", { has: page.locator(".action-key", { hasText: new RegExp(`^${key}$`) }) });
  await expect(slot).toHaveAttribute("data-tip", /Onda de Fogo/);
  const mana0 = (await meState(page))!.mana as number;
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press(key.toLowerCase());
  await expect.poll(async () => (await meState(page))!.mana as number, { timeout: 5000 }).toBeLessThan(mana0);

  await page.reload();
  await playFromList(page, p);
  await page.keyboard.press("h");
  await win.getByRole("option", { name: `Tecla ${key}: Meu combo` }).click();
  await win.getByRole("button", { name: "Editar grupo" }).click();
  await expect.poll(names).toEqual(["Onda de Fogo", "Bola de Fogo"]);
});
