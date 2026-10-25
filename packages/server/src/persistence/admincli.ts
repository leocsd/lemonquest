// Ferramenta de linha de comando do dono do servidor (quando nenhum admin está online).
//   npm run admin -- reset-password <conta>
//   Docker: docker compose exec -u node lemonquest node packages/server/dist/admin.mjs reset-password <conta>
// Abre a base em LEMONQUEST_DB (ou data/lemonquest.db). Pode rodar com o servidor ligado (SQLite WAL + busy_timeout).
import { closeDb, initDb, listDeletedCharacters, listRankingRows } from "./db.ts";
import { summarizePlay, vocationReport } from "../systems/telemetry.ts";
import { createResetCode, formatResetCode } from "./auth.ts";

export interface CliIO { out: (line: string) => void; err: (line: string) => void }

const USAGE = [
  "Uso:",
  "  npm run admin -- reset-password <conta>   gera um código de recuperação de senha (8 caracteres, 24 h, uso único)",
  "  npm run admin -- deleted                  lista os personagens excluídos (arquivo deleted_characters)",
  "  npm run admin -- telemetria               progressão medida por faixa e por vocação (XP/h, abates/h, dano/h, % resistido, mortes/h)",
  "Base: LEMONQUEST_DB (padrão: data/lemonquest.db).",
];

/** Executa um comando. Devolve o código de saída. `dbFile` (testes) sobrepõe LEMONQUEST_DB. */
export async function runAdminCli(args: string[], io: CliIO = { out: console.log, err: console.error }, dbFile?: string): Promise<number> {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    for (const l of USAGE) io.out(l);
    return cmd ? 0 : 1;
  }
  if (cmd !== "reset-password" && cmd !== "deleted" && cmd !== "telemetria") {
    io.err(`Comando desconhecido: ${cmd}`);
    for (const l of USAGE) io.err(l);
    return 1;
  }
  initDb(dbFile);
  try {
    if (cmd === "telemetria") {
      // Só leitura. Com o servidor ligado, vale o último autosave (quem está online pode estar alguns minutos atrás).
      const rows = listRankingRows();
      for (const l of summarizePlay(rows.map((r) => r.data.play))) io.out(l);
      io.out("Por vocação (desde a telemetria do ciclo 12; abates, XP e dano só contam a partir dela):");
      for (const l of vocationReport(rows.map((r) => ({ vocation: r.vocation, play: r.data.play })))) io.out(`  ${l}`);
      return 0;
    }
    if (cmd === "deleted") {
      const rows = listDeletedCharacters();
      if (!rows.length) io.out("Nenhum personagem excluído.");
      for (const r of rows) {
        io.out(`#${r.id}  ${r.name} (level ${r.level} ${r.vocation}) — conta ${r.account_name} — excluído em ${new Date(r.deleted_at).toLocaleString("pt-BR")}`);
      }
      return 0;
    }
    const account = rest.join(" ").trim();
    if (!account) { io.err("Uso: npm run admin -- reset-password <conta>"); return 1; }
    const r = await createResetCode(account, "CLI");
    if (!r) { io.err(`Conta não encontrada: ${account}`); return 2; }
    io.out(`Conta: ${r.account}`);
    io.out(`Código de recuperação: ${formatResetCode(r.code)}`);
    io.out(`Válido até ${new Date(r.expiresAt).toLocaleString("pt-BR")} (uso único).`);
    io.out(`A pessoa usa em: tela de login → "Esqueci minha senha".`);
    return 0;
  } finally {
    try { closeDb(); } catch { /* servidor segurando o WAL: tudo bem */ }
  }
}
