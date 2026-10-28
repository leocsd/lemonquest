// Ferramenta de linha de comando do dono do servidor (quando nenhum admin está online).
//   npm run admin -- reset-password <conta>
//   Docker: docker compose exec -u node lemonquest node packages/server/dist/admin.mjs reset-password <conta>
// Abre a base em LEMONQUEST_DB (ou data/lemonquest.db). Pode rodar com o servidor ligado (SQLite WAL + busy_timeout).
import crypto from "node:crypto";
import { ADDON_BITS, MAX_CHARACTERS_PER_ACCOUNT, VOCATIONS, isSex, type Sex, type Vocation } from "@lemonquest/shared";
import {
  closeDb, countCharacters, createAccount, createCharacter, findAccount, getCharacterByName, initDb, listDeletedCharacters, listRankingRows,
} from "./db.ts";
import { deathReport, skillReport, summarizePlay, vocationReport } from "../systems/telemetry.ts";
import { starterKit } from "../systems/inventory.ts";
import { createResetCode, formatResetCode, isPlainNewName, normalizeAccount, normalizeName } from "./auth.ts";

export interface CliIO { out: (line: string) => void; err: (line: string) => void }

const COMMANDS = ["reset-password", "deleted", "telemetria", "create-account", "create-character"];
const USAGE = [
  "Uso:",
  "  npm run admin -- reset-password <conta>   gera um código de recuperação de senha (8 caracteres, 24 h, uso único)",
  "  npm run admin -- deleted                  lista os personagens excluídos (arquivo deleted_characters)",
  "  npm run admin -- telemetria               progressão medida por faixa e por vocação (XP/h, abates/h, dano/h, % resistido, mortes/h), skills reais e causas de morte",
  "  npm run admin -- create-account <conta>   cria uma conta SEM senha e imprime o código de recuperação (24 h): a pessoa escolhe a senha em \"Esqueci minha senha\"",
  "  npm run admin -- create-character <conta> <nome> <vocação> [m|f]",
  `                                            cria um personagem na conta (nome com espaço entre aspas), com o kit inicial. Vocações: ${VOCATIONS.join(", ")} — a fairy (Fada) é a oculta, que a tela de criação não oferece`,
  "Base: LEMONQUEST_DB (padrão: data/lemonquest.db).",
];

/**
 * create-account: conta nova para alguém que ainda não tem (ex.: a dona da Fada), sem a pessoa por perto. Nasce com um
 * hash aleatório (nenhuma senha confere) e um código de recuperação: a pessoa define a senha dela em "Esqueci minha
 * senha", como no reset-password.
 */
async function createAccountCli(args: string[], io: CliIO): Promise<number> {
  const name = normalizeAccount(args.join(" "));
  if (!name) { io.err("Nome de conta inválido (3 a 20 letras ou números, espaços entre palavras)."); return 1; }
  if (findAccount(name)) { io.err(`Conta já existe: ${name}`); return 3; }
  createAccount(name, crypto.randomBytes(64).toString("hex"), crypto.randomBytes(16).toString("hex"));
  const r = await createResetCode(name, "CLI");
  if (!r) { io.err(`Conta criada, mas o código de recuperação falhou: rode reset-password ${name}`); return 2; }
  io.out(`Conta criada: ${r.account} (sem senha ainda).`);
  io.out(`Código de recuperação: ${formatResetCode(r.code)}`);
  io.out(`Válido até ${new Date(r.expiresAt).toLocaleString("pt-BR")} (uso único).`);
  io.out(`A pessoa usa em: tela de login → "Esqueci minha senha" → escolhe a senha dela.`);
  return 0;
}

/**
 * create-character: o único jeito de nascer um personagem de vocação oculta (a Fada). As mesmas regras da criação pela
 * tela (nome, limite por conta, nome livre, kit inicial), sem o freio de spam e sem a reserva de nome de admin (quem
 * roda o CLI é o dono do servidor). O personagem entra pela tela de login normal, na conta informada.
 */
function createCharacterCli(args: string[], io: CliIO): number {
  const [accountArg, nameArg, vocArg, sexArg, ...extra] = args;
  if (!accountArg || !nameArg || !vocArg || extra.length) { io.err("Uso: npm run admin -- create-character <conta> <nome> <vocação> [m|f]"); return 1; }
  const acc = findAccount(accountArg.trim());
  if (!acc) { io.err(`Conta não encontrada: ${accountArg}`); return 2; }
  const name = normalizeName(nameArg);
  if (!name || !isPlainNewName(name)) { io.err(`Nome inválido: ${nameArg} (3 a 20 letras ou números, espaços entre palavras)`); return 1; }
  const vocation = vocArg.trim().toLowerCase() as Vocation;
  if (!VOCATIONS.includes(vocation)) { io.err(`Vocação inválida: ${vocArg} (use ${VOCATIONS.join(", ")})`); return 1; }
  const sex: Sex | undefined = sexArg === undefined ? "m" : isSex(sexArg.trim().toLowerCase()) ? (sexArg.trim().toLowerCase() as Sex) : undefined;
  if (!sex) { io.err(`Sexo inválido: ${sexArg} (use m ou f)`); return 1; }
  if (countCharacters(acc.id) >= MAX_CHARACTERS_PER_ACCOUNT) { io.err(`A conta ${acc.name} já tem ${MAX_CHARACTERS_PER_ACCOUNT} personagens.`); return 3; }
  if (getCharacterByName(name)) { io.err(`Nome já usado: ${name}`); return 3; }
  // A Fada já nasce com a roupa exclusiva completa (asas + varinha: os dois addons vêm liberados para ela).
  const addons = vocation === "fairy" ? ADDON_BITS : 0;
  const rec = createCharacter(acc.id, name, vocation, { ...starterKit(vocation), sex, addons });
  io.out(`Personagem criado: ${rec.name} (${vocation}, ${sex}) na conta ${acc.name}.`);
  io.out("Entra pela tela de login normal, na lista de personagens da conta.");
  return 0;
}

/** Executa um comando. Devolve o código de saída. `dbFile` (testes) sobrepõe LEMONQUEST_DB. */
export async function runAdminCli(args: string[], io: CliIO = { out: console.log, err: console.error }, dbFile?: string): Promise<number> {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    for (const l of USAGE) io.out(l);
    return cmd ? 0 : 1;
  }
  if (!COMMANDS.includes(cmd)) {
    io.err(`Comando desconhecido: ${cmd}`);
    for (const l of USAGE) io.err(l);
    return 1;
  }
  initDb(dbFile);
  try {
    if (cmd === "create-account") return await createAccountCli(rest, io);
    if (cmd === "create-character") return createCharacterCli(rest, io);
    if (cmd === "telemetria") {
      // Só leitura. Com o servidor ligado, vale o último autosave (quem está online pode estar alguns minutos atrás).
      const rows = listRankingRows();
      for (const l of summarizePlay(rows.map((r) => r.data.play))) io.out(l);
      io.out("Por vocação (desde a telemetria do ciclo 12; abates, XP e dano só contam a partir dela):");
      for (const l of vocationReport(rows.map((r) => ({ vocation: r.vocation, play: r.data.play })))) io.out(`  ${l}`);
      io.out("Skills treinadas por vocação e faixa do level atual (média [mín–máx]; arma = melee do cavaleiro, distância do paladino; sem bônus de equipamento):");
      for (const l of skillReport(rows.map((r) => ({ vocation: r.vocation, level: r.level, skills: r.data.skills })))) io.out(`  ${l}`);
      io.out("Causas de morte por faixa (top 5; registradas desde o ciclo 15, as anteriores contam como \"sem causa\"):");
      for (const l of deathReport(rows.map((r) => r.data.play))) io.out(`  ${l}`);
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
