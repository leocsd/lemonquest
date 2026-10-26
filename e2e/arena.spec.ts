// Coliseu: janela do Mestre (lobbies, modificador da semana, melhores tempos), partida solo (ondas emendadas, pausa com
// vendedor depois da onda-chefe, Pronto, sair → resultado) e grupo com dois navegadores.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, me, meState, monsters, setChase, setLevel, snap, targetNearest, teleport, tileToClient, walkableNear } from "./helpers.ts";

const MASTER = { x: 87, y: 108 };

/** Vai até o Mestre do Coliseu e abre a janela (clique no NPC). */
async function openArena(page: Page): Promise<void> {
  const near = (await walkableNear(page, MASTER.x, MASTER.y + 2, 1)).find((t) => !(t.x === MASTER.x && t.y === MASTER.y))!;
  await teleport(page, near.x, near.y);
  const win = page.getByRole("dialog", { name: "Coliseu" });
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, MASTER.x, MASTER.y, { fy: 0.3 });
    return win.isVisible();
  }, { timeout: 15_000, intervals: [700] }).toBe(true);
}

const bar = (page: Page) => page.locator(".arena-bar");

interface SeenUi { cls: string; text: string; top: number; barBottom: number }
/**
 * Grava cada toast/faixa/barra do coliseu no momento em que aparece (MutationObserver). Toasts duram 3 s e a faixa
 * "Onda N!" some rápido: com a máquina carregada a asserção chegava depois e o teste falhava (mesmo sem bug).
 */
async function recordUi(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__seenUi = [] as SeenUi[];
    const scan = () => {
      const barEl = document.querySelector(".arena-bar");
      const barBottom = barEl ? barEl.getBoundingClientRect().bottom : -1;
      for (const el of document.querySelectorAll(".toast, .arena-banner, .arena-bar")) {
        const cls = el.classList.contains("toast") ? "toast" : el.classList.contains("arena-banner") ? "banner" : "bar";
        const text = el.textContent ?? "";
        if (w.__seenUi.some((s: SeenUi) => s.cls === cls && s.text === text)) continue;
        w.__seenUi.push({ cls, text, top: el.getBoundingClientRect().top, barBottom });
      }
    };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
/** Primeiro registro de `cls` cujo texto contém `text` (espera até aparecer). */
async function seenUi(page: Page, cls: string, text: string, timeout = 15_000): Promise<SeenUi> {
  let hit: SeenUi | undefined;
  await expect.poll(async () => {
    hit = await page.evaluate(([c, t]) => ((window as any).__seenUi as SeenUi[]).find((s) => s.cls === c && s.text.includes(t)), [cls, text] as const);
    return !!hit;
  }, { timeout, message: `${cls} com "${text}"` }).toBe(true);
  return hit!;
}

/** Mata todos os monstros da onda `wave` (alvo no mais perto, modo seguir ligado) até o aviso "Onda N vencida". */
async function clearWave(page: Page, wave: number): Promise<void> {
  const done = () => page.evaluate((t) => ((window as any).__seenUi as SeenUi[]).some((s) => s.cls === "toast" && s.text.includes(t)), `Onda ${wave} vencida`);
  await expect.poll(async () => {
    if (await done()) return true;
    // Espera curta na mira: as ondas comuns emendam (respiro de 3 s), então a onda pode acabar durante a chamada.
    if ((await monsters(page)).length) await targetNearest(page, undefined, 3000).catch(() => "");
    return done();
  }, { timeout: 90_000, intervals: [1000], message: `onda ${wave} vencida` }).toBe(true);
}

/** Botão "Sair" da barra do coliseu + confirmação no próprio HUD. */
async function leaveArena(page: Page): Promise<void> {
  await bar(page).getByRole("button", { name: "Sair" }).click();
  await bar(page).getByRole("button", { name: "Sim, sair" }).click();
}

test("coliseu solo: ondas 1–5 emendadas → pausa (vendedor) → Pronto → onda 6 → sair → resultado", async ({ page }) => {
  test.setTimeout(300_000);
  await enterGame(page, "knight");
  await setLevel(page, 40);
  await setChase(page, true);
  await openArena(page);
  const win = page.getByRole("dialog", { name: "Coliseu" });
  await expect(win).toContainText("Arenas livres");
  // Ciclo 16: modificador da semana das ondas 61–70 e o ranking de tempo das 70 ondas.
  await expect(win.locator(".arena-week-mod")).toContainText(/Ondas 61–70 desta semana: (Fúria|Carapaça|Enxame|Sem Trégua|Calmaria)/);
  await expect(win).toContainText("Tempo para vencer as 70 ondas");
  await snap(page, "arena-window");
  await win.getByRole("button", { name: "Criar grupo" }).click();
  await expect(win.locator(".arena-members li")).toHaveCount(1);
  await win.getByRole("button", { name: "Iniciar (solo)" }).click();
  await expect(bar(page)).toContainText("Entrando no Coliseu em");
  await recordUi(page);
  // Dentro da arena: a janela fecha, contagem e onda 1.
  await expect(win).toBeHidden({ timeout: 15_000 });
  await seenUi(page, "banner", "Onda 1", 20_000);
  const hp0 = (await meState(page))!.hp;
  expect(hp0).toBeGreaterThan(0);
  // Ondas comuns emendam: só um respiro curto, sem vendedor nem "Pronto".
  await clearWave(page, 1);
  await seenUi(page, "bar", "Onda 1 vencida! Próxima em");
  await seenUi(page, "banner", "Onda 2", 20_000);
  for (let w = 2; w <= 5; w++) await clearWave(page, w);

  // Depois da onda-chefe (5): pausa com botão Pronto, ganho acumulado e o vendedor do coliseu abre a loja.
  await expect(bar(page)).toContainText("Vendedor do Coliseu aberto");
  await snap(page, "arena-pause");
  // O aviso da onda vencida aparece ABAIXO da barra (antes ficava escondido atrás dela).
  const toast = await seenUi(page, "toast", "vencida");
  expect(toast.barBottom).toBeGreaterThan(0);
  expect(toast.top).toBeGreaterThanOrEqual(toast.barBottom);
  const pos = (await me(page))!;
  const shop = await page.evaluate(([x, y]) => {
    const lq = (window as any).__lq;
    let best: { id: string; x: number; y: number } | null = null, bd = 1e9;
    for (const id of ["arena_shop_1", "arena_shop_2", "arena_shop_3", "arena_shop_4"]) {
      const t = lq.npcTile(id); if (!t) continue;
      const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
      if (d < bd) { bd = d; best = { id, ...t }; }
    }
    return best;
  }, [pos.x, pos.y] as const);
  expect(shop).not.toBeNull();
  // Perto do vendedor (/tp): o teste é a loja abrir na pausa, não o caminho até ela — andando, com a CPU ocupada,
  // a pausa de 25 s às vezes acabava antes de chegar.
  const nearShop = (await walkableNear(page, shop!.x, shop!.y + 2, 2)).find((t) => t.x !== shop!.x || t.y !== shop!.y);
  if (nearShop) await teleport(page, nearShop.x, nearShop.y);
  const npcWin = page.locator(".npc-window");
  await expect.poll(async () => {
    if (await npcWin.isVisible()) return true;
    const c = await tileToClient(page, shop!.x, shop!.y, 0.3);
    if (c.y > 140 && c.y < 820 && c.x > 360 && c.x < 1150) { // fora da barra do coliseu, do chat e do painel
      await clickTile(page, shop!.x, shop!.y, { fy: 0.3 }); // na tela: clique no NPC (anda até ele se longe)
    } else {
      // Fora da tela: anda na direção dele primeiro.
      const m = (await me(page))!;
      const step = (await walkableNear(page, m.x + Math.sign(shop!.x - m.x) * 4, m.y + Math.sign(shop!.y - m.y) * 4, 2))[0];
      if (step) await clickTile(page, step.x, step.y);
    }
    await page.waitForTimeout(600);
    return npcWin.isVisible();
  }, { timeout: 20_000, intervals: [800] }).toBe(true);
  await snap(page, "arena-shop");
  await page.keyboard.press("Escape");

  const ready = page.locator(".arena-bar.pause").getByRole("button", { name: "Pronto" });
  await ready.click();
  await expect(page.locator(".arena-bar.pause")).toContainText("Pronto ✓");
  // Pronto (todos) → começa em 3 s.
  await seenUi(page, "banner", "Onda 6");
  await seenUi(page, "bar", "Onda 6/70");

  // Sair (botão + confirmação no HUD) → cartão de resultado com as ondas vencidas.
  await leaveArena(page);
  const card = page.getByRole("dialog", { name: "Resultado do Coliseu" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("Você saiu do Coliseu");
  // 5 ondas (ou 6, se a onda 6 acabou antes do clique em sair com a máquina lenta).
  await expect(card).toContainText(/[56] ondas vencidas/);
  await snap(page, "arena-result");
  // Centralizado na tela (a animação de entrada não pode deslocar o cartão) e sem a faixa "Onda N!" por cima.
  await expect(page.locator(".arena-banner")).toHaveCount(0);
  await page.waitForTimeout(300);
  const cb = (await card.boundingBox())!;
  expect(Math.abs(cb.x + cb.width / 2 - 720)).toBeLessThan(3);
  expect(Math.abs(cb.y + cb.height / 2 - 450)).toBeLessThan(3);
  await card.getByRole("button", { name: "Fechar" }).click();
  await expect(card).toBeHidden();
  await expect(bar(page)).toHaveCount(0);
});

test("coliseu em grupo: dois jogadores, lobby → entrar → iniciar → ambos na arena", async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    const pa = await enterGame(a, "knight");
    const pb = await enterGame(b, "druid");
    await setLevel(a, 30);
    await setLevel(b, 30);
    await openArena(a);
    const wa = a.getByRole("dialog", { name: "Coliseu" });
    await wa.getByRole("button", { name: "Criar grupo" }).click();
    await openArena(b);
    const wb = b.getByRole("dialog", { name: "Coliseu" });
    const lobby = wb.locator(".arena-lobby", { hasText: pa.name });
    await expect(lobby).toBeVisible();
    await lobby.getByRole("button", { name: "Entrar" }).click();
    await expect(wb.locator(".arena-members")).toContainText(pb.name);
    await expect(wa.locator(".arena-members li")).toHaveCount(2);
    await expect(wa.locator(".arena-slots").first()).toHaveText("2"); // sem limite de pessoas desde b988e19
    await snap(a, "arena-group-lobby");
    // Só o líder inicia.
    await expect(wb.getByRole("button", { name: /Iniciar/ })).toHaveCount(0);
    for (const p of [a, b]) await recordUi(p);
    await wa.getByRole("button", { name: "Iniciar" }).click();
    for (const p of [a, b]) await seenUi(p, "banner", "Onda 1", 25_000);
    // Os dois estão na mesma arena (perto um do outro).
    const ma = (await me(a))!, mb = (await me(b))!;
    expect(Math.max(Math.abs(ma.x - mb.x), Math.abs(ma.y - mb.y))).toBeLessThan(10);
    // Um desiste: o outro continua; depois o segundo também.
    await leaveArena(a);
    await expect(a.getByRole("dialog", { name: "Resultado do Coliseu" })).toBeVisible();
    await expect(bar(b)).toContainText("Onda");
    await leaveArena(b);
    await expect(b.getByRole("dialog", { name: "Resultado do Coliseu" })).toBeVisible();
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("coliseu: cair na arena não tem penalidade (sem perda de XP) e mostra o resultado", async ({ page }) => {
  test.setTimeout(300_000); // espera os ratos derrubarem um personagem fraco que não reage
  await enterGame(page, "sorcerer");
  await setLevel(page, 2);
  const before = (await meState(page))!;
  await openArena(page);
  const win = page.getByRole("dialog", { name: "Coliseu" });
  await win.getByRole("button", { name: "Criar grupo" }).click();
  await recordUi(page);
  await win.getByRole("button", { name: "Iniciar (solo)" }).click();
  await seenUi(page, "banner", "Onda 1", 25_000);
  const card = page.getByRole("dialog", { name: "Resultado do Coliseu" });
  await expect(card).toBeVisible({ timeout: 240_000 });
  await expect(card).toContainText("Você caiu na arena");
  await expect(card).toContainText("Sem penalidade");
  await snap(page, "arena-wiped");
  // Nada da tela de morte comum, XP/level intactos e o personagem fora da arena, vivo.
  await expect(page.getByRole("alertdialog", { name: "Você morreu" })).toHaveCount(0);
  const after = (await meState(page))!;
  expect(after.level).toBe(before.level);
  expect(after.xp).toBeGreaterThanOrEqual(before.xp);
  expect(after.hp).toBeGreaterThan(0);
  // O cartão pode chegar antes da posição nova (a saída é um teleporte): espera o personagem aparecer na saída.
  await expect.poll(async () => { const pos = (await me(page))!; return Math.max(Math.abs(pos.x - MASTER.x), Math.abs(pos.y - MASTER.y)); }, { timeout: 10_000 }).toBeLessThan(12);
});
