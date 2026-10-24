// Oficina dos Engenhos (ciclo 10): portal escondido da Vila (99,79) leva ao corredor da Oficina e a porta de saída
// (63,321) traz de volta; a Geladeira da Copa vende a Marmita de Tampa Vermelha; a carroça do Bastião tem o destino
// "Oficina dos Engenhos" (100 de ouro); o Rato do Datacenter nasce na floresta antiga perto de (47,42).
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, openNpc, say, setLevel, snap, teleport, waitSettled, walkableNear } from "./helpers.ts";

/** Coordenadas de tools/mapgen/expansion3.mjs (VILLAGE_DOOR, WORKSHOP_ARRIVAL, WORKSHOP_EXIT, VILLAGE_RETURN, WORKSHOP_COACH). */
const VILLAGE_DOOR = { x: 99, y: 79 };
const VILLAGE_RETURN = { x: 98, y: 80 };
const WORKSHOP_ARRIVAL = { x: 65, y: 323 };
const WORKSHOP_EXIT = { x: 63, y: 321 };
const WORKSHOP_COACH = { x: 83, y: 330 };
/** Retângulo do bloco da Oficina, em tiles (x 60..89 × y 312..333). */
const WORKSHOP = { x0: 60, y0: 312, x1: 89, y1: 333 };
const DATACENTER_RAT_SPAWN = { x: 47, y: 42 };
const ZONE = "Oficina dos Engenhos";

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };
const inWorkshop = async (p: Page) => { const m = (await me(p))!; return m.x >= WORKSHOP.x0 && m.x <= WORKSHOP.x1 && m.y >= WORKSHOP.y0 && m.y <= WORKSHOP.y1; };

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

/**
 * Pisa num portal: teleporta para um tile livre ao lado dele (nunca o próprio portal, que é o que se quer testar) e
 * clica no portal até o servidor mover o jogador para o destino. Um clique só pode se perder (o ator ainda assentando),
 * por isso o reclique dentro do `expect.poll`.
 */
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

test("portal da Vila leva à Oficina e a saída traz de volta", async ({ page }) => {
  await enterGame(page, "knight");
  await recordZones(page);
  // O portal da Vila é um tile de chão sem arte (só a luz marca o lugar): pisar nele é o que teleporta.
  await stepOnPortal(page, VILLAGE_DOOR, () => inWorkshop(page));
  await expect.poll(() => distTo(page, WORKSHOP_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);
  await expect.poll(() => zoneFooter(page)).toBe(ZONE);
  await waitSettled(page);
  await snap(page, "oficina-arrival");

  // Porta de saída na parede norte do corredor: volta para o tile diagonal ao portal da Vila (nunca o próprio portal).
  await stepOnPortal(page, WORKSHOP_EXIT, async () => !(await inWorkshop(page)));
  await expect.poll(() => distTo(page, VILLAGE_RETURN), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zoneFooter(page)).not.toBe(ZONE);
});

test("Geladeira da Copa abre a loja com a Marmita de Tampa Vermelha", async ({ page }) => {
  await enterGame(page, "druid");
  const win = await openNpc(page, "geladeira", "Geladeira da Copa");
  // A fala sai letra a letra (Typewriter), mas o texto inteiro já está no DOM em dois spans.
  await expect(win).toContainText("Marmita sem nome é marmita de todos.");
  await win.getByRole("tab", { name: "Comprar" }).click();
  const row = win.locator(".shop-row", { hasText: "Marmita de Tampa Vermelha" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Comprar" })).toBeVisible();
  await snap(page, "oficina-geladeira");
});

test("carroça do Bastião leva à Oficina por 100 de ouro", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 10); // acima do level 8 a viagem é paga
  await say(page, "/gold 300");
  await expect.poll(() => gold(page)).toBe(300);
  await recordZones(page);

  const win = await openNpc(page, "coach_village", "Cocheiro Bastião");
  await win.getByRole("tab", { name: "Viagem" }).click();
  const row = win.locator(".shop-row", { hasText: ZONE });
  await expect(row).toContainText("100");
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();

  await expect.poll(() => distTo(page, WORKSHOP_COACH), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  expect(await inWorkshop(page)).toBe(true);
  await expect.poll(() => gold(page)).toBe(200);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);
  await snap(page, "oficina-coach");
});

test("Rato do Datacenter aparece na Floresta", async ({ page }) => {
  await enterGame(page, "knight");
  const spot = (await walkableNear(page, DATACENTER_RAT_SPAWN.x, DATACENTER_RAT_SPAWN.y, 3))[0]!;
  await teleport(page, spot.x, spot.y);
  await expect.poll(async () => (await monsters(page)).map((m) => m.defId), { timeout: 30_000 }).toContain("datacenter_rat");
  const rat = (await monsters(page)).find((m) => m.defId === "datacenter_rat")!;
  expect(rat.name).toBe("Rato do Datacenter");
});
