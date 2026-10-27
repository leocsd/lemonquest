import { useEffect, useId, useRef, useState } from "preact/hooks";
import {
  GAME_NAME, MAX_CHARACTERS_PER_ACCOUNT, MAX_NAME_LEN,
  type AuthError, type AuthFail, type CharacterSummary, type SkillId, type Vocation,
} from "@lemonquest/shared";
import { session } from "../session.ts";
import { loading } from "./loading.ts";
import { PixelIcon } from "./hud/icons.tsx";
import { VOCATION_META, vocationMeta } from "./hud/vocations.ts";
import { OutfitCanvas } from "./outfit/OutfitCanvas.tsx";
import { resolveOutfit, type Sex } from "@lemonquest/shared";

const VOCS: { id: Vocation; desc: string }[] = [
  { id: "knight", desc: "Resistente, luta de perto com espada." },
  { id: "paladin", desc: "Ágil, acerta de longe com arco." },
  { id: "sorcerer", desc: "Frágil, magias de fogo devastadoras." },
  { id: "druid", desc: "Cura aliados e domina a natureza." },
];
/** Escolha de sexo na criação (os dois botões grandes com a prévia). */
const SEXES_SHOWN: { sex: Sex; sym: string; label: string }[] = [
  { sex: "m", sym: "♂", label: "Masculino" },
  { sex: "f", sym: "♀", label: "Feminino" },
];

const SKILL_LABEL: Record<SkillId, string> = { melee: "Corpo a corpo", distance: "Distância", magic: "Magic Level", shield: "Escudo" };

const MIN_NEW_PASSWORD = 6;
const MAX_ACCOUNT = 20;

const ERRORS: Record<AuthError, string> = {
  invalid_request: "Requisição inválida. Tente novamente.",
  invalid_account: "Conta inválida: use de 3 a 20 caracteres (letras, números, espaço, ponto, _ ou -).",
  invalid_name: `Nome inválido: use de 3 a ${MAX_NAME_LEN} caracteres (letras e números, com espaços entre palavras).`,
  wrong_password: "Senha incorreta.",
  no_account: "Conta não encontrada. Confira o nome ou crie uma conta nova.",
  account_taken: "Já existe uma conta com esse nome.",
  weak_password: `A senha precisa ter pelo menos ${MIN_NEW_PASSWORD} caracteres.`,
  too_many_attempts: "Muitas tentativas. Aguarde alguns minutos.",
  name_taken: "Esse nome de personagem já está em uso.",
  too_many_characters: `Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`,
  invalid_session: "Sua sessão expirou. Entre na conta de novo.",
  no_character: "Personagem não encontrado nesta conta.",
  already_online: "Este personagem já está online.",
  invalid_code: "Código inválido ou expirado. Peça um novo a um administrador.",
  character_online: "Esse personagem está online. Saia do jogo com ele antes de excluí-lo.",
  character_training: "Esse personagem está treinando offline. Entre com ele (o treino termina), saia e tente de novo.",
};

function errorText(r: AuthFail): string {
  if (r.error === "too_many_attempts" && r.message) return r.message;
  return ERRORS[r.error] ?? r.message ?? "Não foi possível entrar. Tente novamente.";
}

/** "há 5 min", "há 2h", "há 1d 3h". */
export function sinceText(sinceMs: number, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - sinceMs) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `há ${d}d ${h % 24}h` : `há ${d}d`;
}

const LAST_CHAR_KEY = "lemonquest.lastCharacter";
function storeLastChar(): string | null { try { return localStorage.getItem(LAST_CHAR_KEY); } catch { return null; } }

type Step = "loading" | "account" | "reset" | "chars" | "new";

/** Mesma chave do servidor (NFC + minúsculas): confirmar a exclusão digitando o nome. */
const sameName = (a: string, b: string) => a.normalize("NFC").trim().toLowerCase() === b.normalize("NFC").trim().toLowerCase();

/** Teclas digitadas na tela de login não vão para o jogo. */
const stop = (e: KeyboardEvent) => e.stopPropagation();

/**
 * Campo de senha com "mostrar senha" (olho em pixel art, PixelIcon) e aviso de Caps Lock (UX-21): o navegador não
 * avisa, e na LAN do escritório a senha errada por Caps Lock era a dúvida mais comum. O Caps Lock vem de
 * getModifierState, lido a cada tecla.
 */
function PasswordField({ label, value, autocomplete, onInput, onKeyDown }: {
  label: string; value: string; autocomplete: string; onInput: (v: string) => void; onKeyDown: (e: KeyboardEvent) => void;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const labelId = useId();
  const watchCaps = (e: KeyboardEvent) => setCaps(typeof e.getModifierState === "function" && e.getModifierState("CapsLock"));
  // Não é um <label> envolvendo tudo: o botão do olho entraria no nome acessível do campo ("Senha Mostrar senha"), o
  // que confunde leitor de tela e os testes que procuram o rótulo exato. O rótulo vai por aria-labelledby.
  return (
    <div class="field">
      <span id={labelId}>{label}</span>
      <span class="pw-wrap">
        <input
          // A tipagem do Preact não aceita a união dinâmica text|password (discrimina por `type`); o cast só acalma o tsc.
          type={(show ? "text" : "password") as "password"}
          aria-labelledby={labelId}
          value={value}
          autocomplete={autocomplete}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { watchCaps(e); onKeyDown(e); }}
          onKeyUp={watchCaps}
          onBlur={() => setCaps(false)}
        />
        <button
          type="button" class="pw-eye" tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Esconder senha" : "Mostrar senha"} aria-pressed={show} title={show ? "Esconder senha" : "Mostrar senha"}
        ><PixelIcon name={show ? "eye_closed" : "eye"} size={16} /></button>
      </span>
      {caps && <span class="pw-caps" role="status">Caps Lock ligado</span>}
    </div>
  );
}

export function Login() {
  const [step, setStep] = useState<Step>(() => (session.accountSession ? "loading" : "account"));
  const [account, setAccount] = useState(() => session.lastAccount);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [accName, setAccName] = useState("");
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [sel, setSel] = useState(0);
  const [newName, setNewName] = useState("");
  const [vocation, setVocation] = useState<Vocation | null>(null);
  const [sex, setSex] = useState<Sex>("m");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetCode, setResetCode] = useState("");
  /** Personagem na confirmação de exclusão (null = diálogo fechado). */
  const [del, setDel] = useState<CharacterSummary | null>(null);
  const [delName, setDelName] = useState("");
  const [delPass, setDelPass] = useState("");
  const [delError, setDelError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false); // trava síncrona (clique + duplo clique no mesmo tick)

  // Voltando de uma desconexão: a sessão da conta ainda vale → direto para a lista de personagens.
  useEffect(() => {
    if (step !== "loading") return;
    session.resume()
      .then((r) => {
        if (r?.ok) { showChars(r.account, r.characters); return; }
        if (r && !r.ok && r.error !== "invalid_session") setError(errorText(r));
        setStep("account");
      })
      .catch(() => { setError("Não foi possível conectar ao servidor."); setStep("account"); }); // fora do ar ou sem resposta (timeout)
  }, []);

  useEffect(() => { if (step === "chars") listRef.current?.focus(); }, [step]);

  function showChars(acc: string, list: CharacterSummary[], select?: string) {
    setAccName(acc);
    setChars(list);
    const want = select ?? storeLastChar();
    const i = want ? list.findIndex((c) => c.name === want) : 0;
    setSel(Math.max(0, i));
    setPassword(""); setConfirm("");
    setStep("chars");
  }

  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    setBusy(true);
    try { await fn(); } catch { setError("Não foi possível conectar ao servidor."); } finally { busyRef.current = false; setBusy(false); }
  }

  const submitAccount = () => run(async () => {
    if (creating) {
      if (password.length < MIN_NEW_PASSWORD) { setError(ERRORS.weak_password); return; }
      if (password !== confirm) { setError("As senhas não conferem."); return; }
    }
    const r = await session.login({ account, password, create: creating || undefined });
    if (!r.ok) { setError(errorText(r)); return; }
    setCreating(false);
    if (r.characters.length === 0) { setAccName(r.account); setChars([]); setStep("new"); return; }
    showChars(r.account, r.characters);
  });

  const submitReset = () => run(async () => {
    if (!resetCode.trim()) { setError("Digite o código de recuperação."); return; }
    if (password.length < MIN_NEW_PASSWORD) { setError(ERRORS.weak_password); return; }
    if (password !== confirm) { setError("As senhas não conferem."); return; }
    const r = await session.resetPassword({ account, code: resetCode, password });
    if (!r.ok) { setError(errorText(r)); return; }
    setResetCode("");
    if (r.characters.length === 0) { setAccName(r.account); setChars([]); setPassword(""); setConfirm(""); setStep("new"); return; }
    showChars(r.account, r.characters);
  });

  function openReset() { setError(""); setPassword(""); setConfirm(""); setResetCode(""); setStep("reset"); }
  function backToLogin() { setError(""); setPassword(""); setConfirm(""); setResetCode(""); setCreating(false); setStep("account"); }

  function openDelete(c: CharacterSummary) {
    setError("");
    if (c.online) { setError(ERRORS.character_online); return; }
    if (c.training) { setError(ERRORS.character_training); return; }
    setDel(c); setDelName(""); setDelPass(""); setDelError("");
  }
  function closeDelete() { setDel(null); setDelName(""); setDelPass(""); setDelError(""); listRef.current?.focus(); }

  const confirmDelete = () => {
    const c = del;
    if (!c || busyRef.current) return;
    if (!sameName(delName, c.name)) { setDelError("Digite o nome do personagem exatamente como aparece."); return; }
    if (!delPass) { setDelError("Digite a senha da conta."); return; }
    busyRef.current = true;
    setBusy(true);
    setDelError("");
    session.deleteCharacter({ name: c.name, password: delPass })
      .then((r) => {
        if (!r.ok) {
          if (r.error === "invalid_session") { setDel(null); setStep("account"); setError(errorText(r)); return; }
          setDelError(errorText(r));
          return;
        }
        setDel(null); setDelName(""); setDelPass("");
        if (r.characters.length === 0) { setAccName(r.account); setChars([]); setStep("new"); return; }
        showChars(r.account, r.characters);
      })
      .catch(() => setDelError("Não foi possível conectar ao servidor."))
      .finally(() => { busyRef.current = false; setBusy(false); });
  };

  const play = (c: CharacterSummary | undefined) => c && run(async () => {
    const r = await session.play(c.name);
    if (!r.ok) {
      if (r.error === "invalid_session") setStep("account");
      setError(errorText(r));
      return;
    }
    try { localStorage.setItem(LAST_CHAR_KEY, r.name); } catch { /* indisponível */ }
    loading.enterWorld(); // "Entrando no mundo…" até a sala chegar e a câmera estar no jogador
    try { await session.connect(r.token, r.name); } catch (e) { loading.cancelEnter(); throw e; }
  });

  const createChar = () => run(async () => {
    if (!vocation) { setError("Escolha uma vocação."); return; }
    const r = await session.createCharacter({ name: newName, vocation, sex });
    if (!r.ok) {
      if (r.error === "invalid_session") setStep("account");
      setError(errorText(r));
      return;
    }
    setNewName(""); setVocation(null);
    showChars(r.account, r.characters, r.characters[r.characters.length - 1]?.name);
  });

  const logout = () => run(async () => {
    await session.logout();
    setChars([]); setAccName("");
    setStep("account");
  });

  const canCreate = chars.length < MAX_CHARACTERS_PER_ACCOUNT;
  const slots = chars.length + (canCreate ? 1 : 0);

  const onListKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setSel((i) => (i + 1) % slots); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setSel((i) => (i - 1 + slots) % slots); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sel < chars.length) play(chars[sel]); else openNew();
    } else if (e.key === "Delete" && sel < chars.length) { e.preventDefault(); openDelete(chars[sel]!); }
    else if (e.key === "Escape") { e.preventDefault(); logout(); }
  };

  function openNew() { setError(""); setNewName(""); setVocation(null); setStep("new"); }

  const onFieldKey = (submit: () => void) => (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  let body;
  if (step === "loading") {
    body = <p class="hint login-loading">Carregando personagens...</p>;
  } else if (step === "account") {
    body = (
      <>
        <h2 class="login-step">{creating ? "Criar conta" : "Entrar na conta"}</h2>
        <label class="field">
          Conta
          <input
            value={account}
            maxLength={MAX_ACCOUNT}
            autoFocus
            autocomplete="username"
            spellcheck={false}
            onInput={(e) => setAccount((e.target as HTMLInputElement).value)}
            onKeyDown={onFieldKey(submitAccount)}
          />
        </label>
        <PasswordField label="Senha" value={password} autocomplete={creating ? "new-password" : "current-password"} onInput={setPassword} onKeyDown={onFieldKey(submitAccount)} />
        {creating && (
          <PasswordField label="Confirmar senha" value={confirm} autocomplete="new-password" onInput={setConfirm} onKeyDown={onFieldKey(submitAccount)} />
        )}
        <button class="btn" disabled={busy} onClick={submitAccount}>
          {busy ? (creating ? "Criando..." : "Entrando...") : creating ? "Criar conta" : "Entrar"}
        </button>
        <button class="btn ghost" disabled={busy} onClick={() => { setCreating((c) => !c); setError(""); setConfirm(""); }}>
          {creating ? "Já tenho conta" : "Criar conta"}
        </button>
        <p class="hint">
          {creating
            ? `A conta é privada (ninguém a vê no jogo) e pode ter até ${MAX_CHARACTERS_PER_ACCOUNT} personagens. Senha de no mínimo ${MIN_NEW_PASSWORD} caracteres.`
            : "Uma conta guarda todos os seus personagens. Você fica conectado neste navegador até usar \"Sair da conta\"."}
        </p>
        {!creating && <button class="link-btn" disabled={busy} onClick={openReset}>Esqueci minha senha</button>}
      </>
    );
  } else if (step === "reset") {
    body = (
      <>
        <h2 class="login-step">Recuperar senha</h2>
        <p class="hint left">
          Peça um <b>código de recuperação</b> a um administrador do jogo (vale 24 h e só funciona uma vez) e escolha uma senha nova.
        </p>
        <label class="field">
          Conta
          <input
            value={account}
            maxLength={MAX_ACCOUNT}
            autoFocus
            autocomplete="username"
            spellcheck={false}
            onInput={(e) => setAccount((e.target as HTMLInputElement).value)}
            onKeyDown={onFieldKey(submitReset)}
          />
        </label>
        <label class="field">
          Código de recuperação
          <input
            class="reset-code"
            value={resetCode}
            maxLength={16}
            autocomplete="one-time-code"
            spellcheck={false}
            placeholder="ABCD-EFGH"
            onInput={(e) => setResetCode((e.target as HTMLInputElement).value.toUpperCase())}
            onKeyDown={onFieldKey(submitReset)}
          />
        </label>
        <PasswordField label="Nova senha" value={password} autocomplete="new-password" onInput={setPassword} onKeyDown={onFieldKey(submitReset)} />
        <PasswordField label="Confirmar nova senha" value={confirm} autocomplete="new-password" onInput={setConfirm} onKeyDown={onFieldKey(submitReset)} />
        <button class="btn" disabled={busy} onClick={submitReset}>{busy ? "Salvando..." : "Trocar senha e entrar"}</button>
        <button class="btn ghost" disabled={busy} onClick={backToLogin}>Voltar</button>
        <p class="hint">Senha de no mínimo {MIN_NEW_PASSWORD} caracteres.</p>
      </>
    );
  } else if (step === "chars") {
    body = (
      <>
        <div class="login-head">
          <h2 class="login-step">Personagens</h2>
          <span class="login-acc" title="Conta">{accName}</span>
        </div>
        <div
          class="char-list"
          role="listbox"
          aria-label="Personagens"
          tabIndex={0}
          ref={listRef}
          aria-activedescendant={`char-${sel}`}
          onKeyDown={onListKey}
        >
          {chars.map((c, i) => {
            const m = vocationMeta(c.vocation);
            return (
              <div
                key={c.name}
                id={`char-${i}`}
                role="option"
                aria-selected={sel === i}
                class={`char-card${sel === i ? " selected" : ""}`}
                style={{ "--accent": m.color } as any}
                onClick={() => { if (sel === i) play(c); else setSel(i); }}
                onDblClick={() => play(c)}
              >
                <span class="char-face char-outfit" aria-hidden="true">
                  <OutfitCanvas outfit={resolveOutfit(c.outfit, c.vocation)} addons={c.addons ?? 0} scale={2} tight sex={c.sex} />
                </span>
                <div class="char-info">
                  <span class="char-name">{c.name}</span>
                  <span class="char-meta"><span class="char-voc">{m.label}</span> · Nível {c.level}</span>
                  {(c.training || c.online) && (
                    <span class="char-badges">
                      {c.online && <span class="badge online">online</span>}
                      {c.training && (
                        <span class="badge training" title={new Date(c.training.sinceMs).toLocaleString("pt-BR")}>
                          Treinando: {SKILL_LABEL[c.training.skill] ?? c.training.skill} {sinceText(c.training.sinceMs)}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <button
                  class="char-del"
                  title={`Excluir ${c.name}`}
                  aria-label={`Excluir ${c.name}`}
                  tabIndex={-1}
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); openDelete(c); }}
                  onDblClick={(e) => e.stopPropagation()}
                >
                  Excluir
                </button>
                <span class="char-play" aria-hidden="true" />
              </div>
            );
          })}
          {canCreate && (
            <div
              id={`char-${chars.length}`}
              role="option"
              aria-selected={sel === chars.length}
              class={`char-card new${sel === chars.length ? " selected" : ""}`}
              onClick={openNew}
            >
              <span class="char-plus" aria-hidden="true">+</span>
              <div class="char-info">
                <span class="char-name">Novo personagem</span>
                <span class="char-meta">{chars.length}/{MAX_CHARACTERS_PER_ACCOUNT} personagens</span>
              </div>
            </div>
          )}
        </div>
        <button class="btn" disabled={busy || sel >= chars.length} onClick={() => play(chars[sel])}>
          {busy ? "Entrando..." : sel < chars.length ? `Jogar com ${chars[sel]!.name}` : "Jogar"}
        </button>
        <p class="hint">↑↓ escolhe · Enter joga · duplo clique também · Delete exclui</p>
        <button class="link-btn" disabled={busy} onClick={logout}>Sair da conta</button>
      </>
    );
  } else {
    body = (
      <>
        <div class="login-head">
          <h2 class="login-step">Novo personagem</h2>
          <span class="login-acc" title="Conta">{accName}</span>
        </div>
        <label class="field">
          Nome do personagem
          <input
            value={newName}
            maxLength={MAX_NAME_LEN}
            autoFocus
            spellcheck={false}
            onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
            onKeyDown={onFieldKey(createChar)}
          />
        </label>
        <p class="hint left">É o nome que os outros jogadores veem: 3 a {MAX_NAME_LEN} letras ou números, espaços entre palavras.</p>
        <div class="voc-grid">
          {VOCS.map((v) => {
            const m = VOCATION_META[v.id];
            return (
              <button
                key={v.id}
                class={`voc-card${vocation === v.id ? " selected" : ""}`}
                style={{ "--accent": m.color } as any}
                aria-pressed={vocation === v.id}
                onClick={() => setVocation(v.id)}
                onKeyDown={onFieldKey(createChar)}
              >
                <span class="voc-top">
                  <img class="voc-face" src={m.faceset} alt="" draggable={false} />
                  <span class="voc-name">{m.label}</span>
                </span>
                <span class="voc-desc">{v.desc}</span>
              </button>
            );
          })}
        </div>
        {/* Sexo: a prévia é a roupa padrão da vocação escolhida (cavaleiro enquanto nenhuma), no sexo de cada botão. */}
        <div class="sex-grid" role="radiogroup" aria-label="Sexo">
          {SEXES_SHOWN.map((o) => (
            <button
              key={o.sex}
              class={`sex-card${sex === o.sex ? " selected" : ""}`}
              role="radio"
              aria-checked={sex === o.sex}
              onClick={() => setSex(o.sex)}
              onKeyDown={onFieldKey(createChar)}
            >
              <span class="sex-preview" aria-hidden="true">
                <OutfitCanvas outfit={resolveOutfit(undefined, vocation ?? "knight")} addons={0} scale={2} tight sex={o.sex} />
              </span>
              <span class="sex-label">{o.sym} {o.label}</span>
            </button>
          ))}
        </div>
        <p class="hint left">Dá para trocar depois, de graça, na janela de roupas (O).</p>
        <button class="btn" disabled={busy || !vocation || newName.trim().length < 3} onClick={createChar}>
          {busy ? "Criando..." : "Criar personagem"}
        </button>
        {chars.length > 0 ? (
          <button class="btn ghost" disabled={busy} onClick={() => { setError(""); setStep("chars"); }}>Voltar</button>
        ) : (
          <button class="link-btn" disabled={busy} onClick={logout}>Sair da conta</button>
        )}
      </>
    );
  }

  return (
    <div class="login-wrap" onKeyDown={stop}>
      <div class={`panel login-card step-${step}`}>
        <h1 class="login-title">{GAME_NAME}</h1>
        {body}
        {error && <div class="error" role="alert">{error}</div>}
        <p class="login-notice">Rede do escritório sem criptografia: não use a mesma senha do trabalho.</p>
      </div>
      {del && (
        <div
          class="login-dialog-wrap"
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); closeDelete(); } }}
          onClick={(e) => { if (e.target === e.currentTarget && !busy) closeDelete(); }}
        >
          <div class="panel login-dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title" class="login-step danger">Excluir {del.name}?</h2>
            <p class="hint left">
              {vocationMeta(del.vocation).label}, nível {del.level}. O personagem, os itens e o depot somem do jogo e o nome fica livre
              para outra pessoa. <b>Não dá para desfazer pelo jogo.</b>
            </p>
            <label class="field">
              Digite o nome do personagem para confirmar
              <input
                value={delName}
                autoFocus
                spellcheck={false}
                autocomplete="off"
                placeholder={del.name}
                onInput={(e) => setDelName((e.target as HTMLInputElement).value)}
                onKeyDown={onFieldKey(confirmDelete)}
              />
            </label>
            <PasswordField label="Senha da conta" value={delPass} autocomplete="current-password" onInput={setDelPass} onKeyDown={onFieldKey(confirmDelete)} />
            {delError && <div class="error" role="alert">{delError}</div>}
            <div class="login-dialog-actions">
              <button class="btn ghost" disabled={busy} onClick={closeDelete}>Cancelar</button>
              <button class="btn danger" disabled={busy || !sameName(delName, del.name) || !delPass} onClick={confirmDelete}>
                {busy ? "Excluindo..." : "Excluir para sempre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
