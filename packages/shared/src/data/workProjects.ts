// Ponte com o ClickUp do escritório (ciclo 11, server/systems/clickup.ts): espaços → projeto no jogo, apelidos da equipe.
// Só ids e nomes de PROJETO disfarçados ficam aqui; nada de nome completo, e-mail ou cliente real. O espaço do cliente
// confidencial não está no mapa de propósito: tarefa de espaço fora do mapa é ignorada inteira.

/** Workspace do escritório no ClickUp. */
export const WORK_TEAM_ID = "30950578";
/** Lista "Controle de Compras" (o "Chegou!"). */
export const WORK_PURCHASES_LIST = "901312327523";
/** Status da lista de compras que quer dizer "entregue". */
export const WORK_DELIVERED_STATUS = "pedidos entregues";

export interface WorkProject {
  /** Chave estável no jogo (barras de sprint, metas no kv). */
  id: string;
  /** Nome mostrado no jogo (já disfarçado). */
  name: string;
  /** Espaços do ClickUp que contam para este projeto. */
  spaces: readonly string[];
  /** Projeto da Ferrovia: entra na aba "Na obra" do Painel da Obra. */
  rail?: boolean;
  /** Equipe interna (a Oficina): entra na aba "Na obra", mas não tem barra de sprint. */
  office?: boolean;
}

export const WORK_PROJECTS: readonly WorkProject[] = [
  { id: "p01", name: "Engenho EM100", spaces: ["90137833570"] },
  { id: "p02", name: "Engenho EM310", spaces: ["90131491464"] },
  { id: "p03", name: "Projeto IPA", spaces: ["90131655359"] },
  { id: "p04", name: "Usina de Cana", spaces: ["90131303281"] },
  { id: "p06", name: "SmartTrain", spaces: ["90131782312"], rail: true },
  { id: "p07", name: "SA Vision", spaces: ["90137833931"] },
  { id: "p08", name: "Portal de Inspeção", spaces: ["90139446338", "901313747643", "901312958435"], rail: true },
  { id: "p09", name: "Contador de Células", spaces: ["901310422906"] },
  { id: "p10", name: "Isca", spaces: ["901310135275"] },
  { id: "p11", name: "Câmera na Locomotiva", spaces: ["90131736054"], rail: true },
  { id: "p12", name: "AGV", spaces: ["901313071656"] },
  { id: "p13", name: "Anomalia de Carga", spaces: ["901313696040", "901313806150", "901313565661"], rail: true },
  { id: "p14", name: "Zefiro", spaces: ["901313754610"] },
  { id: "p15", name: "Hidrosense", spaces: ["901313754801"] },
  { id: "p16", name: "SMV/Diesel", spaces: ["901313779818"], rail: true },
  { id: "p17", name: "RDT", spaces: ["901313890365", "901313890393", "901313890395"], rail: true },
  { id: "p18", name: "Placa P18", spaces: ["901313890368"] },
  { id: "p19", name: "Escória da Siderúrgica", spaces: ["901314638743"] },
  { id: "ferrovia", name: "Ferrovia (geral)", spaces: ["90137939355"], rail: true },
  { id: "oficina", name: "Oficina", spaces: ["90130534616", "49137402", "901313797509", "90137578531"], office: true },
];

const BY_SPACE = new Map<string, WorkProject>(WORK_PROJECTS.flatMap((p) => p.spaces.map((s) => [s, p] as const)));

/** Projeto do jogo de um espaço do ClickUp (undefined = espaço fora do mapa: a tarefa é ignorada). */
export const workProjectOfSpace = (spaceId: string | undefined): WorkProject | undefined => (spaceId ? BY_SPACE.get(spaceId) : undefined);
export const workProjectById = (id: string): WorkProject | undefined => WORK_PROJECTS.find((p) => p.id === id);
/** Espaços que contam para as sprints (todos os projetos, menos a Oficina). */
export const WORK_SPRINT_SPACES: readonly string[] = WORK_PROJECTS.filter((p) => !p.office).flatMap((p) => p.spaces);
/** Espaços da aba "Na obra": Ferrovia e Oficina. */
export const WORK_BOARD_SPACES: readonly string[] = WORK_PROJECTS.filter((p) => p.rail || p.office).flatMap((p) => p.spaces);

/** Usuário do ClickUp → apelido no jogo (os mesmos NPCs da equipe do ciclo 10). Nunca nome completo. */
export const WORK_NICKS: Readonly<Record<string, string>> = {
  "43024221": "Pedrão", "43024213": "Julião", "42990224": "Bianca", "43024219": "Luan", "100103652": "Iago",
  "82025268": "Gabriel", "42995714": "Guilherme", "49182329": "Alexandre", "10507349": "Daniel", "43024212": "Gustavo",
  "42995713": "Rafael", "170518944": "Leo", "82000274": "Larissa", "81958090": "Anna Clara", "55005351": "Lucas C.",
  "112115748": "Brenddon", "49097915": "Alex", "99984361": "Giancarlo", "118037728": "Lucas P.",
};

/**
 * Primeiro nome que aparece em título de tarefa → apelido (o resto dos nomes próprios vira "alguém", ver workFilter).
 * Chave sem acento e minúscula.
 */
export const WORK_FIRST_NAME_NICKS: Readonly<Record<string, string>> = {
  pedro: "Pedrão", pedrao: "Pedrão", julio: "Julião", juliao: "Julião", bianca: "Bianca", luan: "Luan", iago: "Iago",
  gabriel: "Gabriel", guilherme: "Guilherme", alexandre: "Alexandre", daniel: "Daniel", gustavo: "Gustavo", rafael: "Rafael",
  leonardo: "Leo", leo: "Leo", larissa: "Larissa", brenddon: "Brenddon", alex: "Alex", alexsandro: "Alex", giancarlo: "Giancarlo",
};

/** Apelido para uma busca do /vincular (apelido sem acento/caixa ou id numérico de até 12 dígitos). undefined = não conheço. */
export function workUserByNick(arg: string): string | undefined {
  const a = workFold(arg);
  if (/^\d{1,12}$/.test(a)) return a;
  for (const [id, nick] of Object.entries(WORK_NICKS)) if (workFold(nick) === a || workFold(nick).replace(/\W/g, "") === a.replace(/\W/g, "")) return id;
  return undefined;
}

/** Minúsculas, sem acento. */
export const workFold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
