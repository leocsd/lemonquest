// Comandos de ADMINISTRADOR no chat — funcionam também em PRODUÇÃO (diferente dos comandos de dev).
// Admin = personagem listado em LEMONQUEST_ADMINS (vírgulas; comparação como name_key: NFC + minúsculas).
// Resposta só para quem digitou (Notice com log=true: aparece também no chat). Nada é difundido, exceto /anuncio.
//   /kick <nome> [motivo] · /mute <nome> <minutos> · /unmute <nome> · /anuncio <texto>
//   /online · /resetsenha <conta> · /tp <nome> · /desbloquear <nome> <roupa|addon|título>
//   /vincular <personagem> <apelido|id do ClickUp|nenhum> (conquistas de tarefas do ClickUp; sem argumentos lista)
// Toda ação é logada no console com o prefixo [admin].
import { S2C, WORK_NICKS, resolveUnlockArg, unlockText, workUserByNick, type AnnounceMsg, type FeedMsg, type NoticeMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterRecord } from "../persistence/types.ts";
import { nameKey } from "../persistence/db.ts";
import { devAdmins } from "./devcommands.ts";

type Env = Record<string, string | undefined>;

/** Mute máximo: 30 dias. */
export const MAX_MUTE_MIN = 30 * 24 * 60;
/** Motivo do kick vai no frame de fechamento do WebSocket (máx. 123 bytes): cortado em 100 bytes UTF-8. */
export const MAX_KICK_REASON_BYTES = 100;

/** Este personagem é admin? (vale em produção; não depende de LEMONQUEST_DEV_COMMANDS). */
export const isAdmin = (name: string, env: Env = process.env): boolean => devAdmins(env).has(nameKey(name));

export const ADMIN_COMMANDS = ["/kick", "/mute", "/unmute", "/anuncio", "/online", "/resetsenha", "/tp", "/desbloquear", "/status", "/evento", "/vincular"] as const;

export interface AdminContext {
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  /** Jogadores online. */
  players: () => Iterable<PlayerState>;
  /** Registro persistido do jogador online (rec.data.muted vive aqui). */
  record: (sessionId: string) => CharacterRecord | undefined;
  /** Personagem offline (para /mute e /unmute de quem não está no jogo). */
  findOffline?: (name: string) => CharacterRecord | undefined;
  saveOffline?: (rec: CharacterRecord) => void;
  /** Fecha a sessão do jogador com CLOSE_KICKED e o motivo. */
  kick: (sessionId: string, reason: string) => void;
  /** Leva o admin para perto do alvo. false = sem tile livre. */
  teleportNear: (admin: PlayerState, target: PlayerState) => boolean;
  /** Gera o código de recuperação da conta (null = conta inexistente). */
  resetCode: (account: string, by: string) => Promise<{ code: string; account: string; expiresAt: number } | null>;
  /** /tp x y é do comando de dev: se estiver ligado para este jogador, o admin deixa passar. */
  devTp?: (p: PlayerState) => boolean;
  /** Concede roupa/addon/título (online: avisa o jogador). true = era novo. */
  grantUnlock?: (rec: CharacterRecord, unlockId: string, online?: PlayerState) => boolean;
  /** /evento: dispara/encerra eventos com bônus (systems/events.ts). */
  events?: { ids: () => string[]; start: (id: string, minutes: number) => string | null; stop: () => boolean; status: () => string[] };
  /** /vincular: personagem ↔ usuário do ClickUp (systems/clickup.ts). userId null = desvincula. */
  work?: { link: (charName: string, userId: string | null) => void; list: () => [string, { name: string; since: number }][] };
  /** Linhas do /status (números do servidor). */
  status?: () => string[];
  env?: Env;
  now?: () => number;
  log?: (line: string) => void;
}

/** Corta uma string para caber em `max` bytes UTF-8 (sem quebrar caracteres). */
export function clipBytes(s: string, max: number): string {
  if (Buffer.byteLength(s) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > max) break;
    out += ch;
  }
  return out;
}

/** Ainda silenciado? (limpa mute vencido do registro). Devolve os ms restantes ou 0. */
export function muteRemaining(rec: CharacterRecord | undefined, now = Date.now()): number {
  const m = rec?.data.muted;
  if (!m) return 0;
  if (typeof m.until !== "number" || m.until <= now) { delete rec!.data.muted; return 0; }
  return m.until - now;
}

export const minutesText = (ms: number): string => {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
};

/** Online cujo nome bate com o início de `words` (o mais longo vence: "Ana Maria" antes de "Ana"). */
function matchOnlinePrefix(words: string[], players: PlayerState[]): { target: PlayerState; rest: string[] } | null {
  for (let n = words.length; n >= 1; n--) {
    const key = nameKey(words.slice(0, n).join(" "));
    const t = players.find((p) => nameKey(p.name) === key);
    if (t) return { target: t, rest: words.slice(n) };
  }
  return null;
}

/** /ajuda (/comandos, /help): os comandos de jogador; para admins, também os de admin. Linhas para o log do chat. */
export const HELP_COMMANDS = ["/ajuda", "/comandos", "/help"] as const;
export function helpLines(name: string, env: Env = process.env): string[] {
  const lines = [
    "Grupo: /convidar <nome> · /aceitar [nome] · /recusar [nome] · /sair · /expulsar <nome> · /lider <nome> · /desfazer",
    "Social: /w <nome> <mensagem> sussurra · /r <mensagem> responde · /amigo <nome> adiciona ou remove · /amigos lista · /quem mostra quem está online, onde e quem pode caçar em grupo com você · /e <emote> (botão ☺ no chat).",
    "Magias: digite as palavras (ex.: exura) ou use as teclas 1–0 (H configura a barra). Todos os atalhos de teclado: F1.",
  ];
  if (isAdmin(name, env)) lines.push(`Admin: ${ADMIN_COMMANDS.join(" ")}`);
  return lines;
}

/** Trata um comando de admin. true = era um comando de admin (tratado); false = não é admin/não é comando de admin. */
export function handleAdminCommand(p: PlayerState, text: string, ctx: AdminContext): boolean {
  const env = ctx.env ?? process.env;
  if (!isAdmin(p.name, env)) return false;
  const words = text.trim().split(/\s+/);
  const cmd = (words.shift() ?? "").toLowerCase();
  if (!(ADMIN_COMMANDS as readonly string[]).includes(cmd)) return false;
  const now = (ctx.now ?? Date.now)();
  const log = ctx.log ?? ((l: string) => console.log(l));
  const reply = (t: string, kind: NoticeMsg["kind"] = "info") => ctx.send(p.id, S2C.Notice, { text: t, kind, log: true } satisfies NoticeMsg);
  const audit = (what: string) => log(`[admin] ${p.name}: ${what}`);
  const online = [...ctx.players()];
  const byName = (name: string) => online.find((o) => nameKey(o.name) === nameKey(name));

  switch (cmd) {
    case "/kick": {
      const m = matchOnlinePrefix(words, online);
      if (!m) { reply(words.length ? `Ninguém online com esse nome: ${words.join(" ")}` : "Uso: /kick <nome> [motivo]", "warn"); break; }
      const reason = clipBytes(m.rest.join(" "), MAX_KICK_REASON_BYTES);
      ctx.kick(m.target.id, reason);
      audit(`/kick ${m.target.name}${reason ? ` (motivo: ${reason})` : ""}`);
      reply(`${m.target.name} foi expulso.`, "good");
      break;
    }
    case "/mute": {
      const minStr = words.pop();
      const min = minStr !== undefined && /^\d+$/.test(minStr) ? Number(minStr) : NaN;
      const name = words.join(" ");
      if (!name || !(min >= 1 && min <= MAX_MUTE_MIN)) { reply(`Uso: /mute <nome> <minutos> (1–${MAX_MUTE_MIN})`, "warn"); break; }
      const target = byName(name);
      const rec = target ? ctx.record(target.id) : ctx.findOffline?.(name);
      if (!rec) { reply(`Personagem não encontrado: ${name}`, "warn"); break; }
      rec.data.muted = { until: now + min * 60_000, by: p.name };
      if (!target) ctx.saveOffline?.(rec);
      else ctx.send(target.id, S2C.Notice, { text: `Você foi silenciado por ${minutesText(min * 60_000)}.`, kind: "warn", log: true } satisfies NoticeMsg);
      audit(`/mute ${rec.name} ${min} min${target ? "" : " (offline)"}`);
      reply(`${rec.name} silenciado por ${minutesText(min * 60_000)}.`, "good");
      break;
    }
    case "/unmute": {
      const name = words.join(" ");
      if (!name) { reply("Uso: /unmute <nome>", "warn"); break; }
      const target = byName(name);
      const rec = target ? ctx.record(target.id) : ctx.findOffline?.(name);
      if (!rec) { reply(`Personagem não encontrado: ${name}`, "warn"); break; }
      const was = muteRemaining(rec, now) > 0;
      delete rec.data.muted;
      if (!target) ctx.saveOffline?.(rec);
      else if (was) ctx.send(target.id, S2C.Notice, { text: "Você pode falar no chat de novo.", kind: "good", log: true } satisfies NoticeMsg);
      audit(`/unmute ${rec.name}${target ? "" : " (offline)"}`);
      reply(was ? `${rec.name} pode falar de novo.` : `${rec.name} não estava silenciado.`, was ? "good" : "info");
      break;
    }
    case "/anuncio": {
      const msg = words.join(" ");
      if (!msg) { reply("Uso: /anuncio <texto>", "warn"); break; }
      ctx.broadcast(S2C.Announce, { text: msg, from: p.name } satisfies AnnounceMsg);
      ctx.broadcast(S2C.Feed, { text: `📢 ${msg}`, kind: "info" } satisfies FeedMsg);
      audit(`/anuncio ${msg}`);
      break;
    }
    case "/evento": {
      const ev = ctx.events;
      if (!ev) { reply("Eventos indisponíveis.", "warn"); break; }
      const sub = (words[0] ?? "").toLowerCase();
      if (!sub) { for (const l of ev.status()) reply(l); reply(`Uso: /evento <${ev.ids().join("|")}> [minutos] · /evento parar`); break; }
      if (sub === "parar" || sub === "stop") {
        audit("/evento parar");
        reply(ev.stop() ? "Evento encerrado." : "Nenhum evento em andamento.", "good");
        break;
      }
      const min = words[1] === undefined ? 60 : /^\d+$/.test(words[1]) ? Number(words[1]) : NaN;
      if (!(min >= 1 && min <= 24 * 60)) { reply("Minutos de 1 a 1440. Uso: /evento <nome> [minutos]", "warn"); break; }
      const text = ev.start(sub, min);
      if (!text) { reply(`Evento desconhecido: ${sub}. Disponíveis: ${ev.ids().join(", ")}`, "warn"); break; }
      audit(`/evento ${sub} ${min} min`);
      reply(text, "good");
      break;
    }
    case "/vincular": {
      const work = ctx.work;
      if (!work) { reply("ClickUp indisponível.", "warn"); break; }
      if (!words.length) {
        const list = work.list().map(([uid, l]) => `${l.name} ↔ ${WORK_NICKS[uid] ?? uid}`);
        reply(list.length ? `Vínculos (${list.length}): ${list.join(", ")}` : "Nenhum vínculo.");
        reply("Uso: /vincular <personagem> <apelido|id do ClickUp> · /vincular <personagem> nenhum");
        break;
      }
      // Nome e apelido podem ter espaço ("Anna Clara", "Lucas P."): tenta cada divisão, do nome mais longo ao mais curto.
      let done = false;
      for (let n = words.length - 1; n >= 1 && !done; n--) {
        const name = words.slice(0, n).join(" "), arg = words.slice(n).join(" ");
        const remove = /^(nenhum|-)$/i.test(arg);
        const uid = remove ? null : workUserByNick(arg);
        if (uid === undefined) continue;
        const target = byName(name);
        const rec = target ? ctx.record(target.id) : ctx.findOffline?.(name);
        if (!rec) continue;
        // O mesmo usuário do ClickUp só conta para um personagem: avisa quando tira de outro.
        const before = uid ? work.list().find(([u, l]) => u === uid && nameKey(l.name) !== nameKey(rec.name))?.[1].name : undefined;
        work.link(rec.name, uid);
        audit(`/vincular ${rec.name} ${uid ?? "nenhum"}${before ? ` (era de ${before})` : ""}`);
        if (before) reply(`${WORK_NICKS[uid!] ?? `O usuário ${uid}`} estava vinculado a ${before}; agora conta só para ${rec.name}.`, "warn");
        reply(uid ? `${rec.name} vinculado a ${WORK_NICKS[uid] ?? `usuário ${uid}`}: tarefas fechadas a partir de agora contam nas conquistas.` : `${rec.name} desvinculado.`, "good");
        done = true;
      }
      if (!done) reply("Personagem ou apelido não encontrado. Uso: /vincular <personagem> <apelido|id do ClickUp|nenhum>", "warn");
      break;
    }
    case "/status": {
      for (const l of ctx.status?.() ?? ["Status indisponível."]) reply(l);
      break;
    }
    case "/online": {
      const list = online.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((o) => `${o.name} (${o.level})`);
      reply(`Online (${list.length}): ${list.join(", ") || "ninguém"}`);
      audit("/online");
      break;
    }
    case "/resetsenha": {
      const account = words.join(" ");
      if (!account) { reply("Uso: /resetsenha <conta>", "warn"); break; }
      audit(`/resetsenha ${account}`);
      ctx.resetCode(account, `admin ${p.name}`).then(
        (r) => {
          if (!r) { reply(`Conta não encontrada: ${account}`, "warn"); return; }
          const code = `${r.code.slice(0, 4)}-${r.code.slice(4)}`;
          reply(`Código de recuperação da conta "${r.account}": ${code} — vale 24 h, uso único. Passe só para o dono da conta (tela de login → "Esqueci minha senha").`, "good");
        },
        (e) => { console.error("[admin] /resetsenha falhou:", e); reply("Não foi possível gerar o código.", "warn"); },
      );
      break;
    }
    case "/desbloquear": {
      const arg = words.pop();
      const name = words.join(" ");
      if (!name || !arg) { reply("Uso: /desbloquear <nome> <roupa|addon|título> (ex.: pirata, pirata_chapeu, title:persistente)", "warn"); break; }
      const unlockId = resolveUnlockArg(arg);
      if (!unlockId) { reply(`Não conheço "${arg}". Use o id de uma roupa (pirata), de um addon (pirata_chapeu) ou title:<id>.`, "warn"); break; }
      const target = byName(name);
      const rec = target ? ctx.record(target.id) : ctx.findOffline?.(name);
      if (!rec || !ctx.grantUnlock) { reply(`Personagem não encontrado: ${name}`, "warn"); break; }
      const isNew = ctx.grantUnlock(rec, unlockId, target);
      if (!target) ctx.saveOffline?.(rec);
      audit(`/desbloquear ${rec.name} ${unlockId}${target ? "" : " (offline)"}${isNew ? "" : " (já tinha)"}`);
      reply(isNew ? `${rec.name} recebeu — ${unlockText(unlockId)}.` : `${rec.name} já tinha — ${unlockText(unlockId)}.`, isNew ? "good" : "info");
      break;
    }
    case "/tp": {
      if (words.length === 2 && words.every((w) => /^-?\d+$/.test(w)) && ctx.devTp?.(p)) return false; // /tp x y (dev)
      const name = words.join(" ");
      if (!name) { reply("Uso: /tp <nome>", "warn"); break; }
      const target = byName(name);
      if (!target) { reply(`Ninguém online com esse nome: ${name}`, "warn"); break; }
      if (target.id === p.id) { reply("Você já está aí.", "info"); break; }
      if (!ctx.teleportNear(p, target)) { reply(`Sem espaço livre perto de ${target.name}.`, "warn"); break; }
      audit(`/tp ${target.name} (${target.x},${target.y})`);
      reply(`Teleportado até ${target.name}.`, "good");
      break;
    }
  }
  return true;
}
