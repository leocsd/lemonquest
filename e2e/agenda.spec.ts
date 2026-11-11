// Agenda de eventos (ciclo 17): botão do trilho abre a janela com o próximo em destaque e a semana por dia; o selo do
// topo mostra o evento em andamento ou o próximo (e abre a mesma janela); /agenda e /evento respondem no chat; o
// personagem novo recebe as boas-vindas no Feed. A hora real do servidor decide qual evento é o próximo: o teste só
// confere a forma (não o nome).
import { expect, test } from "@playwright/test";
import { enterGame, say, snap } from "./helpers.ts";

test("agenda: janela no trilho, selo do próximo evento, /agenda e /evento no chat, boas-vindas do novato", async ({ page }) => {
  test.setTimeout(90_000);
  const p = await enterGame(page, "druid");
  const log = page.locator(".chat-log");

  // Personagem criado agora: boas-vindas no Feed (a linha de todos e a pessoal), ~3 s depois de entrar.
  await expect(log).toContainText(`${p.name} (Druida) acabou de chegar a Pedra Clara`, { timeout: 15_000 });
  await expect(log).toContainText(`Boas-vindas, ${p.name}!`);

  // Selo do topo: o evento em andamento ou o próximo da agenda (chega no join).
  const badge = page.locator('[data-testid="event-badge"], [data-testid="event-next"]');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  if (await page.locator('[data-testid="event-next"]').isVisible()) await expect(badge).toContainText(/^.*Próximo: .+ às \d\d:\d\d/);

  // Botão do trilho (sem tecla nova): abre a janela com o próximo em destaque e a semana agrupada por dia.
  await page.getByRole("button", { name: "Agenda de eventos" }).click();
  const win = page.getByRole("dialog", { name: "Agenda de eventos" });
  await expect(win).toBeVisible();
  await expect(win.locator('[data-testid="agenda-next"]')).toBeVisible({ timeout: 10_000 });
  await expect(win.locator(".ag-day").first()).toBeVisible();
  expect(await win.locator(".ag-row").count()).toBeGreaterThanOrEqual(10);
  await expect(win.locator(".ag-row.next")).toHaveCount(1);
  await snap(page, "agenda-janela");
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);

  // O selo também abre a agenda.
  await badge.click();
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);

  // Chat: /agenda (a semana, um dia por linha) e /evento (agora e o próximo). Os nomes de teste são admins: o /evento
  // deles mostra o mesmo estado (mais a linha de uso).
  await say(page, "/agenda");
  await expect(log).toContainText("Agenda da semana");
  await expect(log).toContainText(/Hoje: |Amanhã: /);
  await say(page, "/evento");
  await expect(log).toContainText(/Nenhum evento em andamento|Em andamento: /);
  await expect(log).toContainText("Próximo agendado:");
});
