// Filtro de disfarce dos textos que vêm do ClickUp (ciclo 11): o jogo mostra títulos de tarefas e itens de compras
// para a sala inteira, então nada de cliente real, gente de fora, cidade de pátio, infraestrutura ou assunto de
// RH/financeiro/jurídico. Duas saídas: o texto disfarçado, ou null = descartar a tarefa INTEIRA (lista negra).
// Na dúvida, descarta. Antes de tudo o texto é normalizado (NFKC, sem caracteres invisíveis), senão "Ｊ Ｌ Ｒ" (largura
// cheia), "J​LR" (espaço de largura zero) ou "J.L.R" passavam pela lista negra.
import { WORK_FIRST_NAME_NICKS, WORK_NICKS, workFold } from "./data/workProjects.ts";

/** Corte padrão dos títulos (aba "Na obra"). */
export const WORK_TITLE_MAX = 60;
/** Corte do item do "Chegou!". */
export const WORK_ITEM_MAX = 40;

/** NFKC (largura cheia → normal), sem caracteres de formatação invisíveis (\p{Cf}: largura zero, bidi) nem de controle. */
export function normalizeWorkText(s: string): string {
  return s.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}

/**
 * Chave da lista negra: sem acento, minúscula, toda pontuação vira espaço ("JLR_UK", "Edge-SM", "EM 1.000") e letras
 * soltas em sequência se juntam ("j l r" → "jlr"). Fica entre espaços para os padrões usarem limites de letra.
 */
export function workBlockKey(s: string): string {
  let k = workFold(normalizeWorkText(s)).replace(/[^a-z0-9$]+/g, " ").trim();
  k = k.replace(/(?<![a-z0-9])[a-z](?: [a-z](?![a-z0-9]))+/g, (m) => m.replace(/ /g, ""));
  return ` ${k} `;
}

/** Palavra (ou prefixo) inteira na chave: não pode ter letra colada antes; `open` = prefixo (sem limite depois). */
const W = (re: string, open = false) => new RegExp(`(?<![a-z])(?:${re})${open ? "" : "(?![a-z])"}`);

/**
 * Lista negra sobre a chave (workBlockKey). Qualquer acerto descarta a tarefa inteira.
 * "defender" fica de fora de propósito: é verbo comum em português; "land rover"/"range rover" já pegam o modelo.
 */
const BLOCK_WORDS: readonly RegExp[] = [
  // Cliente confidencial, os modelos/fábricas dele e o projeto ligado a ele.
  W("jaguar", true), W("jlr"), W("land ?rover"), W("range ?rover"), W("discovery ?sport"), W("solihull"), W("halewood"),
  W("edge ?sm"), W("em ?1 ?000", true),
  // Segurança e acesso.
  W("senhas?"), W("password"), W("tokens?"), W("api ?keys?"), W("chave de acesso"), W("credencia", true), W("ssh"),
  W("supersite", true), W("porta \\d{2,5}"),
  // RH, financeiro e jurídico.
  W("salari", true), W("demiss", true), W("demiti", true), W("rescis", true), W("juridic", true), W("contrat", true),
  W("holerite", true), W("processo trabalhista"), W("ferias"), W("atestados?"), W("boletos?"), W("pagamentos?"),
  W("orcamentos?"), W("propostas?"), W("licencas?"), W("r\\$"),
  // Número de série ("porta serial" sozinho é assunto técnico comum e fica).
  W("(serial|numero de serie|n de serie|s ?n) (n |no |numero |number )?\\d{4,}", true),
  W("notas? fisca(l|is)"), W("nfs? ?e?"), W("cpf"), W("cnpj"),
  // Identificação de vagão (série + número).
  W("(gdt|gdu|pes|pds|hts|hes|tpt|pqt|pqs) ?\\d{4,}", true),
];
/** Padrões que vazam contato/infra: e-mail, URL, domínio, IP, telefone, caminho de rede. Rodam no texto normalizado. */
const BLOCK_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]+/, /\b[a-z][a-z0-9+.-]*:\/\//i, /\bwww\./i,
  /\b[\w-]+\.(com|net|org|io|br|app|dev|cloud|info|biz|co)\b/i,
  /\b\d{1,3}(\.\d{1,3}){3}\b/, /\(?\b\d{2}\)?\s?9?\d{4}[-\s.]\d{4}\b/, /\+\d{2}[\s(]*\d/, /(?<!\d)\d{10,11}(?!\d)/,
  /\\[\w.$-]/, // caminho de rede (\\servidor\pasta) ou do Windows: título de tarefa não tem barra invertida
];

const L = "\\p{L}\\p{N}";
/** Palavra no texto (unicode): sem letra/dígito colado dos lados. */
const word = (re: string, flags = "giu") => new RegExp(`(?<![${L}])(?:${re})(?![${L}])`, flags);

/**
 * Clientes reais → disfarce. "Vale" e "TIM" são palavras comuns em minúsculas: "TIM"/"VALE" valem em maiúsculas; "Vale"
 * com inicial maiúscula só fora do começo do título e sem "a pena/do/da" depois (senão "Vale a pena" virava empresa).
 */
const CLIENTS: readonly [RegExp, string][] = [
  [word("MRS\\s*Log[íi]stica"), "Ferrovia"],
  [/(?<![\p{L}\p{N}])M\.?\s?R\.?\s?S(?:\.(?=\s|$))?(?![\p{L}\p{N}])/giu, "Ferrovia"],
  [word("C\\.?S\\.?N"), "Siderúrgica"],
  [word("Gerdau|Usiminas"), "Siderúrgica"],
  [word("VLI"), "outra Ferrovia"],
  [word("Ambev"), "Cervejaria"],
  [word("S[ãa]o\\s*-?\\s*Martinho"), "Usina de Cana"],
  [word("Stellantis|Volkswagen|Volks|VWCO|VW"), "Montadora"],
  [word("Dexco"), "Louçaria"],
  [word("Saint[\\s-]?Gobain"), "Vidraria"],
  [word("VALE", "gu"), "Mineradora"],
  [/(?<=[\p{L}\p{N}][^\p{L}\p{N}]*\s)Vale(?![\p{L}\p{N}])(?!\s+(a\s+pena|do|da|dos|das)\b)/gu, "Mineradora"],
  [word("TIM", "gu"), "Operadora"],
  [word("Embeddo"), "Oficina"],
  // Fabricantes: compra com marca é comum, então troca em vez de descartar.
  [word("Baumer|Frauscher|Daheng|Siemens|Litrium|Basler|Halcon|MVTec|Hikvision|Hikrobot|Cognex|Keyence|Allied\\s+Vision|Teledyne|Dalsa|FLIR"), "Fabricante"],
];

/** Cidades e pátios reais → "Pátio" (os mais longos primeiro; hífen vale como espaço: "Juiz-de-Fora"). */
const PLACES: readonly RegExp[] = [
  ...[
    "Cons(elheiro)?\\.?\\s*Lafaiete", "C\\.\\s*Lafaiete", "Juiz de Fora", "Volta Redonda", "Barra Mansa", "Belo Horizonte",
    "Ouro Branco", "Vale do A[çc]o", "Tr[êe]s Rios", "Rio de Janeiro", "S[ãa]o Paulo", "Horto Florestal", "Dias Tavares", "Lagoa Seca",
    "Lafaiete", "Sarzedo", "Caranda[íi]", "Cruzeiro", "Barbacena", "Brumadinho", "Itagua[íi]", "Jundia[íi]", "Japeri",
    "Paraopeba", "Arar[áa]", "Andaime", "Ipatinga", "Congonhas", "Itabirito", "Mangaratiba", "Gua[íi]ba", "Sepetiba",
  ].map((p) => new RegExp(`(?<!\\p{L})${p.replace(/ /g, "[\\s-]+")}(?!\\p{L})`, "giu")),
  // Siglas de cidade/estado só em maiúsculas ("Rio" e "rio" são palavras comuns e ficam).
  word("BH|SP|RJ|MG|JF", "gu"),
];

/**
 * Primeiros nomes (sem acento, minúsculos) que viram "alguém" — gente de fora da equipe, ou da equipe sem apelido.
 * Valem em qualquer caixa, menos os de AMBIGUOUS_NAMES (palavras comuns: só com inicial maiúscula).
 * Os da equipe vêm de WORK_FIRST_NAME_NICKS.
 */
const COMMON_NAMES = new Set([
  "ana", "anna", "maria", "joao", "jose", "carlos", "paulo", "paula", "marcos", "marcio", "fernando", "ricardo", "rodrigo",
  "felipe", "fellipe", "filipe", "mateus", "matheus", "thiago", "tiago", "diego", "andre", "marcelo", "eduardo", "vinicius",
  "camila", "juliana", "fernanda", "patricia", "aline", "amanda", "beatriz", "leticia", "gabriela", "mariana", "bruno",
  "jessica", "raquel", "rafaela", "cristovao", "brenda", "leandro", "ian", "lucas", "julia", "renato", "renata", "sergio",
  "roberto", "antonio", "francisco", "luiz", "luis", "henrique", "caio", "vitor", "victor", "igor", "otavio", "claudio",
  "claudia", "sandra", "simone", "vanessa", "tatiana", "priscila", "carla", "debora", "flavia", "natalia", "bruna", "isabela",
  "isabella", "larissa", "clara", "joana", "marta", "helena", "esperanca", "wagner", "wellington", "adriano", "adriana",
  "alessandro", "fabio", "fabricio", "hugo", "jorge", "julio", "luciano", "luciana", "mauricio", "murilo", "nelson",
  "rogerio", "samuel", "vagner", "william", "willian", "everton", "ederson", "edson", "emerson", "thais", "tais", "mario",
  "marina", "monica", "silvia", "sonia", "regina", "rita", "vera", "lucia", "cristiane", "cristina", "daniela", "danilo",
  "douglas", "elaine", "fabiana", "gisele", "guilherme", "gustavo", "heitor", "humberto", "jefferson", "jonas", "karina",
  "kelly", "laura", "leonardo", "lorena", "manuela", "marcela", "milena", "miguel", "nathalia", "neide", "osvaldo", "pamela",
  "raul", "ronaldo", "sabrina", "sara", "sarah", "talita", "valeria", "viviane", "wesley", "yasmin", "arthur", "artur",
  "bernardo", "davi", "enzo", "gael", "joaquim", "lorenzo", "nicolas", "noah", "theo", "valentina", "alice", "livia",
  "giovanna", "giovana", "rebeca", "emanuel", "benjamin", "anderson", "alan", "allan", "cesar", "elias", "ivan", "joel",
  "kaio", "otto", "ruan", "saulo", "silvio", "tulio", "ulisses", "vicente", "washington",
]);
/** Nomes que também são palavras comuns: só contam com inicial maiúscula. */
const AMBIGUOUS_NAMES = new Set(["clara", "caio", "rita", "vera", "sara", "laura", "alice", "esperanca", "regina", "lucia", "marina"]);

/** Sobrenomes comuns (sem acento, minúsculos) engolidos depois de um nome trocado ("Pedro Silva" → "Pedrão"). */
const SURNAMES = new Set([
  "silva", "souza", "sousa", "oliveira", "santos", "pereira", "costa", "almeida", "ferreira", "rodrigues", "lima", "gomes",
  "ribeiro", "martins", "barbosa", "rocha", "dias", "andrade", "brito", "carvalho", "ramos", "vianna", "viana", "cavalcante",
  "cordeiro", "pessoa", "furtado", "neves", "alvarenga", "castro", "moura", "mendes", "nunes", "freitas", "araujo",
  "teixeira", "cardoso", "monteiro", "batista", "machado", "moreira", "soares", "vieira", "lopes", "campos", "faria",
  "vilela", "barra", "doro", "melo", "mello", "reis", "pinto", "fonseca", "correia", "correa", "azevedo", "rezende",
  "resende", "duarte", "guimaraes", "tavares", "coelho", "peixoto", "miranda", "medeiros", "nascimento", "borges", "pires",
]);
const CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"]);

/** A tarefa cita algo da lista negra? (descartar inteira). */
export function isBlockedWorkText(text: string): boolean {
  if (typeof text !== "string") return true;
  const key = workBlockKey(text);
  const norm = normalizeWorkText(text);
  return BLOCK_WORDS.some((r) => r.test(key)) || BLOCK_PATTERNS.some((r) => r.test(norm));
}

/** Nome de pessoa? Devolve o apelido da equipe, "alguém", ou undefined. */
function nameNick(token: string): string | undefined {
  const key = workFold(token);
  const team = WORK_FIRST_NAME_NICKS[key];
  if (team) return team;
  if (!COMMON_NAMES.has(key)) return undefined;
  return AMBIGUOUS_NAMES.has(key) && !/^\p{Lu}/u.test(token) ? undefined : "alguém";
}

/** Troca nomes de pessoas por apelido da equipe ou "alguém" (e engole os sobrenomes que vierem logo depois). */
function replaceNames(text: string): string {
  const tokens = text.split(/([\p{L}\p{N}]+)/u); // ímpares = palavras, pares = separadores
  const out: string[] = [];
  const isSurname = (w: string | undefined) => !!w && /^\p{Lu}/u.test(w) && SURNAMES.has(workFold(w));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (i % 2 === 0) { out.push(t); continue; }
    const nick = nameNick(t);
    if (!nick) { out.push(t); continue; }
    out.push(nick);
    // Sobrenomes: "Nome [de|da] Sobrenome Sobrenome" (só com inicial maiúscula).
    let j = i + 2;
    while (j < tokens.length && /^\s+$/.test(tokens[j - 1]!)) {
      if (CONNECTORS.has(workFold(tokens[j]!)) && /^\s+$/.test(tokens[j + 1] ?? "") && isSurname(tokens[j + 2])) { j += 4; continue; }
      if (isSurname(tokens[j])) { j += 2; continue; }
      break;
    }
    i = j - 2; // o laço soma 1 e cai no separador depois do último sobrenome
  }
  return out.join("");
}

/** Corta em `max` caracteres (com reticências), sem quebrar emoji/acento combinado. */
export function clipText(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

/**
 * Disfarça um texto vindo do ClickUp. null = descartar (lista negra ou não sobrou nada).
 * Ordem: normalização → lista negra → clientes/fabricantes → cidades/pátios → nomes de pessoas → limpeza → corte.
 */
export function filterWorkText(text: string, max = WORK_TITLE_MAX): string | null {
  if (typeof text !== "string") return null;
  let s = normalizeWorkText(text);
  if (isBlockedWorkText(s)) return null;
  for (const [r, to] of CLIENTS) s = s.replace(r, to);
  for (const r of PLACES) s = s.replace(r, "Pátio");
  s = replaceNames(s);
  s = s.replace(/(?<![\p{L}])alguém(\s+(e\s+)?alguém)+/gu, "alguém").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
  if (!s || !/[\p{L}\p{N}]/u.test(s)) return null;
  return clipText(s, max);
}

/** Domínios de e-mail de quem é de fora → como aparece no jogo (null = some com a tarefa). */
const EXTERNAL_DOMAINS: readonly [RegExp, string | null][] = [
  [/jaguar|landrover|jlr/, null],
  [/(^|\.)mrs\.com\.br$/, "alguém da Ferrovia"],
  [/(^|\.)saomartinho\.com\.br$/, "alguém da Usina"],
  [/(^|\.)csn\.com\.br$/, "alguém da Siderúrgica"],
];

/**
 * Apelido do responsável de uma tarefa: equipe → apelido do mapa; da casa sem apelido → "alguém da Oficina"; de fora
 * (ou sem e-mail) → "alguém da Ferrovia"/"alguém de fora"; cliente confidencial → null (descartar a tarefa).
 * Sem responsável → "ninguém ainda".
 */
export function workAssigneeNick(a: { id?: string | number; email?: string | null } | undefined): string | null {
  if (!a) return "ninguém ainda";
  const nick = WORK_NICKS[String(a.id ?? "")];
  if (nick) return nick;
  const email = (a.email ?? "").trim().toLowerCase();
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
  if (!domain) return "alguém de fora";
  for (const [r, label] of EXTERNAL_DOMAINS) if (r.test(domain)) return label;
  return domain === "embeddo.io" ? "alguém da Oficina" : "alguém de fora";
}
