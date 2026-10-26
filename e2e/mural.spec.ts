// Mural de Excursões e painel Online (ciclo 18), com duas páginas: A marca uma excursão no Mural da praça; B vê na
// Agenda → Excursões e marca "Quero ir"; A recebe o cartão e convida (o convite de grupo de sempre); B aceita e o
// painel Online de A mostra B no grupo, com a zona. A estrela põe B nos amigos; Sussurrar abre o chat com "/w nome ".
import { expect, test, type Page } from "@playwright/test";
import { enterGame, openNpc } from "./helpers.ts";

const section = (page: Page, id: string) => page.locator(`.hud-panel [data-panel-id="${id}"]`);

async function openSection(page: Page, id: string): Promise<void> {
  const s = section(page, id);
  if (!((await s.getAttribute("class")) ?? "").includes(" open")) await s.locator(".hud-section-head").click();
}

test("mural: marcar, quero ir, convite pelo cartão e painel online", async ({ browser }) => {
  test.setTimeout(150_000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    const pa = await enterGame(a, "knight");
    const pb = await enterGame(b, "druid");

    // A no Mural: Coliseu (todas as faixas), agora, 4 vagas; faixa sugerida do lv 1 (1–1) cobre B.
    const win = await openNpc(a, "excursion_board", "Mural de Excursões");
    await expect(win.getByRole("tab", { name: "Excursões" })).toHaveAttribute("aria-selected", "true");
    await win.getByTestId("ex-dest").selectOption("coliseu");
    await win.getByTestId("ex-slots").selectOption("4");
    await win.getByTestId("ex-post").click();
    await expect(win.locator(".ex-card")).toHaveCount(1);
    await expect(win.locator(".ex-card")).toContainText("Coliseu");
    await expect(win.getByTestId("excursion-form")).toHaveCount(0); // uma ativa por líder

    // B pela Agenda (de qualquer lugar): Quero ir.
    await b.getByTestId("rail-agenda").click();
    await b.getByTestId("agenda-tab-excursions").click();
    const card = b.locator(".ex-card").filter({ hasText: pa.name });
    await expect(card).toContainText("1/4");
    await card.getByRole("button", { name: "Quero ir" }).click();
    await expect(card).toContainText("2/4");
    await expect(card.getByRole("button", { name: "Sair da lista" })).toBeVisible();

    // A recebe o cartão "quer ir" e convida dali; B aceita o convite de grupo.
    const ping = a.getByTestId("excursion-ping-join");
    await expect(ping).toContainText(pb.name);
    await ping.getByRole("button", { name: "Convidar" }).click();
    await b.locator(".party-invite").getByRole("button", { name: "Aceitar" }).click();

    // Painel Online de A: B no grupo, com a zona (grupo vê a zona, regra do /quem).
    await openSection(a, "online");
    const row = section(a, "online").locator(`[data-online="${pb.name}"]`);
    await expect(row).toHaveClass(/party/, { timeout: 10_000 });
    await expect(row.locator(".online-sub")).toContainText("·");
    // Já no grupo: sem botão de convidar.
    await expect(row.getByRole("button", { name: `Convidar ${pb.name} para o grupo` })).toHaveCount(0);

    // Estrela: B vira amigo (sobe para o topo da lista).
    await row.getByRole("button", { name: `Pôr ${pb.name} nos amigos` }).click();
    await expect(row).toHaveClass(/friend/);

    // Sussurrar: chat aberto com "/w nome " e o foco no campo.
    await row.getByRole("button", { name: `Sussurrar para ${pb.name}` }).click();
    const input = a.locator(".chat-input");
    await expect(input).toHaveValue(`/w ${pb.name} `);
    await expect(input).toBeFocused();
    await a.keyboard.type("bora pro Coliseu!");
    await a.keyboard.press("Enter");
    await expect(b.locator(".chat-line.whisper").last()).toContainText("bora pro Coliseu!");

    // A cancela pela Agenda; B é avisado e o mural esvazia para os dois.
    await a.getByTestId("rail-agenda").click();
    await a.getByTestId("agenda-tab-excursions").click();
    await a.locator(".agenda-window .ex-card").getByRole("button", { name: "Cancelar" }).click();
    await expect(b.locator(".agenda-window .ex-card")).toHaveCount(0);
    await expect(b.locator(".agenda-window .ex-empty")).toContainText("Nenhuma excursão marcada");
  } finally {
    await ca.close(); await cb.close();
  }
});
