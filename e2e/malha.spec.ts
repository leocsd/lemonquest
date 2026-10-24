// Malha da Ferrovia (ciclo 11): trem do Chefe da Estação da Vila leva à Estação Central da Malha (200 de ouro) e o
// Chefe da Estação Central traz de volta; o portal oculto da Vila (99,104) liga à plataforma, o que deixa a Malha
// alcançável do spawn e por isso quem desloga lá volta lá (e não no spawn); o Painel da Obra abre a aba "Na obra"
// (sem token do ClickUp no E2E: estado sem notícias); a Escamação nasce no Pátio de Manobra.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, openNpc, say, setLevel, snap, teleport, waitInWorld, waitSettled, walkableNear } from "./helpers.ts";

/** Coordenadas de tools/mapgen/expansion4.mjs e shared/data/npcs.ts (o servidor usa o tile ou o livre mais perto). */
const MALHA_ARRIVAL = { x: 60, y: 374 };
const VILLAGE_ARRIVAL = { x: 97, y: 98 };
const VILLAGE_PORTAL = { x: 99, y: 104 };
const MALHA_PORTAL_ARRIVAL = { x: 47, y: 373 };
const MALHA_PORTAL = { x: 44, y: 371 };
const VILLAGE_RETURN = { x: 98, y: 103 };
const ESCAMACAO_SPAWN = { x: 110, y: 370 };
/** Retângulo da zona "Estação Central da Malha" (BLOCK4 40,360 + local 3,3, 34×25). */
const STATION = { x0: 43, y0: 363, x1: 76, y1: 387 };
const ZONE = "Estação Central da Malha";
const PRICE = 200;

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };
const inStation = async (p: Page) => { const m = await me(p); return !!m && m.x >= STATION.x0 && m.x <= STATION.x1 && m.y >= STATION.y0 && m.y <= STATION.y1; };

/** Grava cada faixa de zona (".zone-banner") assim que aparece: ela dura 2,4 s (como em travel.spec). */
async function recordZones(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__zones = [] as string[];
    const scan = () => { for (const el of document.querySelectorAll(".zone-banner")) { const t = el.textContent ?? ""; if (!w.__zones.includes(t)) w.__zones.push(t); } };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const zonesSeen = (page: Page) => page.evaluate(() => (window as any).__zones as string[]);
/** Nome da zona no rodapé do minimapa (fica enquanto o jogador estiver nela). */
const zoneFooter = (page: Page) => page.locator(".minimap-zone-name").textContent().catch(() => "");

async function travel(page: Page, npcId: string, npcName: string, dest: string) {
  const win = await openNpc(page, npcId, npcName);
  await win.getByRole("tab", { name: "Viagem" }).click();
  const row = win.locator(".shop-row", { hasText: dest });
  await expect(row).toContainText(String(PRICE));
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();
}

/** Pisa num portal a partir de um tile livre ao lado (como em oficina.spec), reclicando até chegar. */
async function stepOnPortal(page: Page, portal: { x: number; y: number }, arrived: () => Promise<boolean>): Promise<void> {
  const spot = (await walkableNear(page, portal.x, portal.y, 1)).find((t) => !(t.x === portal.x && t.y === portal.y));
  if (!spot) throw new Error(`nenhum tile livre ao lado do portal ${portal.x},${portal.y}`);
  await teleport(page, spot.x, spot.y);
  await expect.poll(async () => {
    if (await arrived()) return true;
    await clickTile(page, portal.x, portal.y);
    await page.waitForTimeout(700);
    return arrived();
  }, { timeout: 20_000, intervals: [300], message: `portal ${portal.x},${portal.y}` }).toBe(true);
}

test("trem da Vila leva à Estação Central da Malha e volta", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 30); // acima do level 8 a passagem é paga
  await say(page, `/gold ${PRICE * 2}`);
  await expect.poll(() => gold(page)).toBe(PRICE * 2);
  await recordZones(page);

  await travel(page, "chefe_estacao_vila", "Chefe da Estação de Pedra Clara", ZONE);
  await expect.poll(() => distTo(page, MALHA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(PRICE);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);
  await expect.poll(() => zoneFooter(page)).toBe(ZONE);
  await waitSettled(page);
  await snap(page, "malha-estacao");

  await travel(page, "chefe_estacao_malha", "Chefe da Estação Central", "Vila de Pedra Clara");
  await expect.poll(() => distTo(page, VILLAGE_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
  await expect.poll(() => zonesSeen(page)).toContain("Vila de Pedra Clara");
});

test("deslogar na Malha volta na Malha", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 30);
  await teleport(page, MALHA_ARRIVAL.x, MALHA_ARRIVAL.y);
  expect(await inStation(page)).toBe(true);
  // Recarrega a aba e espera a janela de reconexão (2 s no E2E) passar: o onLeave salva e tira o personagem do mundo;
  // o próximo login lê a posição do banco e só a aceita se ela for alcançável do spawn (portal oculto).
  await page.reload();
  const btn = page.getByRole("button", { name: `Jogar com ${p.name}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await btn.click();
  await waitInWorld(page);
  await expect.poll(() => distTo(page, MALHA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await inStation(page)).toBe(true);
});

test("portal oculto liga a Vila à Estação e a volta", async ({ page }) => {
  await enterGame(page, "paladin");
  await recordZones(page);
  await stepOnPortal(page, VILLAGE_PORTAL, () => inStation(page));
  await expect.poll(() => distTo(page, MALHA_PORTAL_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);

  await stepOnPortal(page, MALHA_PORTAL, async () => !(await inStation(page)));
  await expect.poll(() => distTo(page, VILLAGE_RETURN), { timeout: 10_000 }).toBeLessThanOrEqual(1);
});

test("Painel da Obra mostra a aba Na obra", async ({ page }) => {
  await enterGame(page, "druid");
  const win = await openNpc(page, "painel_obra", "Painel da Obra");
  const tab = win.getByRole("tab", { name: "Na obra" });
  await expect(tab).toBeVisible();
  await tab.click();
  // O servidor E2E não tem LEMONQUEST_CLICKUP_TOKEN: o quadro responde offline (WorkTab.tsx).
  await expect(win).toContainText("O quadro está sem notícias da obra por enquanto.", { timeout: 10_000 });
  await snap(page, "malha-painel");
});

test("Escamação aparece no Pátio de Manobra", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 60); // a Escamação é lv 28 e bate forte: aguenta enquanto espera o spawn
  const spot = (await walkableNear(page, ESCAMACAO_SPAWN.x, ESCAMACAO_SPAWN.y, 3))[0]!;
  await teleport(page, spot.x, spot.y);
  await expect.poll(async () => (await monsters(page)).map((m) => m.defId), { timeout: 30_000 }).toContain("engate_solto");
  const m = (await monsters(page)).find((x) => x.defId === "engate_solto")!;
  expect(m.name).toBe("Escamação");
  await expect.poll(() => zoneFooter(page)).toBe("Pátio de Manobra");
});
