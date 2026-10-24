import { describe, expect, it } from "vitest";
import { WORK_ITEM_MAX, WORK_TITLE_MAX, clipText, filterWorkText, isBlockedWorkText, workAssigneeNick } from "./workFilter.ts";
import { WORK_NICKS, WORK_PROJECTS, workProjectOfSpace, workUserByNick } from "./data/workProjects.ts";

// Títulos inventados no formato dos reais (anonimizados): nenhum nome de cliente fica de pé no resultado.
describe("filterWorkText: clientes viram disfarce", () => {
  it.each([
    ["Ajustar câmera do portal MRS", "Ajustar câmera do portal Ferrovia"],
    ["Relatório CSN escória", "Relatório Siderúrgica escória"],
    ["Visita técnica Ambev", "Visita técnica Cervejaria"],
    ["Sensor de nível São Martinho", "Sensor de nível Usina de Cana"],
    ["Stellantis, VW, Volkswagen, Volks, VWCO", "Montadora, Montadora, Montadora, Montadora, Montadora"],
    ["Amostra Dexco", "Amostra Louçaria"],
    ["Forno Saint-Gobain", "Forno Vidraria"],
    ["Correia Vale Sul", "Correia Mineradora Sul"],
    ["Chip TIM no gateway", "Chip Operadora no gateway"],
    // Variantes (revisão cruzada): pontuação, colado, caixa, largura cheia e invisíveis.
    ["Visita MRS Lafaiete", "Visita Ferrovia Pátio"],
    ["M.R.S. pátio", "Ferrovia pátio"],
    ["mrs-inspecao", "Ferrovia-inspecao"],
    ["mrs_portal", "Ferrovia_portal"],
    ["MRSLogistica", "Ferrovia"],
    ["Mrs relatório", "Ferrovia relatório"],
    ["Visita à Mrs. em Lafaiete", "Visita à Ferrovia em Pátio"],
    ["\uff2d \uff32 \uff33", "Ferrovia"],
    ["Mrs\u200b", "Ferrovia"],
    ["Paulo da MRS", "alguém da Ferrovia"],
    ["CSN-UPV", "Siderúrgica-UPV"],
    ["csn", "Siderúrgica"],
    ["Gerdau", "Siderúrgica"],
    ["SaoMartinho", "Usina de Cana"],
    ["Sao Martinho", "Usina de Cana"],
    ["embeddo", "Oficina"],
    ["VALE", "Mineradora"],
    ["Minério da Vale", "Minério da Mineradora"],
    // Fabricantes: troca, não descarta.
    ["Câmera Baumer", "Câmera Fabricante"],
    ["Sensor Frauscher", "Sensor Fabricante"],
    ["Daheng MER2", "Fabricante MER2"],
    ["Siemens S7-1200", "Fabricante S7-1200"],
    ["Iluminador Litrium", "Iluminador Fabricante"],
    ["Lente Basler", "Lente Fabricante"],
  ])("%s", (inp, out) => expect(filterWorkText(inp)).toBe(out));

  it("'vale' e 'tim' minúsculos e 'Vale' no começo/'Vale a pena' são palavras comuns e ficam", () => {
    expect(filterWorkText("Ver se vale trocar o cabo")).toBe("Ver se vale trocar o cabo");
    expect(filterWorkText("vale a pena")).toBe("vale a pena");
    expect(filterWorkText("Vale revisar os cabos")).toBe("Vale revisar os cabos");
    expect(filterWorkText("Testar se Vale a pena")).toBe("Testar se Vale a pena");
  });
  it("'Defender' fica (verbo comum); o modelo é pego por land/range rover", () => {
    expect(filterWorkText("Defender o layout")).toBe("Defender o layout");
  });
});

describe("filterWorkText: lista negra descarta a tarefa inteira", () => {
  it.each([
    "Firmware do EdgeSM v2", "Edge SM: OTA", "Teste EM-1000 na linha", "Reunião Jaguar", "Peças JLR", "Land Rover kickoff",
    "Trocar senha do roteador", "Gerar token da API", "Credenciais do Azure", "Planilha de salário", "Demissão do terceirizado",
    "Rescisão contratual", "Parecer do jurídico", "Renovar contrato de manutenção", "Lançar nota fiscal da câmera", "Emitir NF-e",
    "Conferir CPF do motorista", "CNPJ do fornecedor", "Mandar para fulano@empresa.com", "Ver https://exemplo.com/x",
    "Acessar www.exemplo.com.br", "Liberar IP 10.0.0.12 no firewall", "Ligar para (32) 99999-1234",
    // Revisão cruzada: cliente confidencial disfarçado por pontuação, caixa, colado, invisível ou largura cheia.
    "jlr2026", "JLR_UK", "proj_jlr", "J.L.R", "JLR-UK", "J\u200bLR", "\uff2a \uff2c \uff32", "Jaguar", "Jaguar Land Rover", "Land-Rover",
    "LandRover", "Range Rover", "Discovery Sport", "Solihull", "Halewood", "Edge-SM", "EdgeSM v2", "EM1000", "em 1000", "em1000x",
    "EM-1000B", "EM 1.000",
    // Segurança e infraestrutura.
    "Ajustar token do Azure", "Tokens API", "SENHA", "api key do azure", "chave de acesso", "password reset", "credenciais",
    "acessar supersite-prod", "host supersite-db", "supersite.azurewebsites.net", "ssh root@srv", "porta 5432",
    "192.168.1.10:8080", "+55 32 99999-9999", "(32) 3333-4444", "32999998888", "ftp://10.1.1.1", "\\servidor\\share",
    "\\\\servidor\\share", "\\servidorshare", "C:\\dados", "github.com/x", "www.exemplo", "exemplo.com.br", "Embeddo.io", "falar com joao.silva@mrs.com.br",
    "ver portal.mrs.com.br/app",
    // RH, financeiro e jurídico.
    "Salário de outubro", "Férias do Pedro", "atestado médico", "Pagamento fornecedor", "boleto", "Orçamento cliente",
    "proposta comercial R$ 50.000", "Licença Halcon", "serial 12345678", "contratos", "contratação de estagiário", "NF-e 1234",
    "nfe", "Contrato Vale",
    // Identificação de vagão.
    "vagão GDT 123456-7", "GDU 987654",
  ])("%s", (t) => {
    expect(isBlockedWorkText(t)).toBe(true);
    expect(filterWorkText(t)).toBeNull();
  });

  it("EM100 e EM310 (projetos da casa) não confundem com o EM-1000", () => {
    expect(filterWorkText("Montar EM100 de bancada")).toBe("Montar EM100 de bancada");
  });
  it("'porta serial' (assunto técnico) não é número de série", () => {
    expect(filterWorkText("Testar porta serial do PLC")).toBe("Testar porta serial do PLC");
  });
});

describe("filterWorkText: pessoas e lugares", () => {
  it("nome da equipe vira apelido e o sobrenome some", () => {
    expect(filterWorkText("Pedro Carvalho revisar layout")).toBe("Pedrão revisar layout");
    expect(filterWorkText("Alinhar com Julio e Leonardo da Silva")).toBe("Alinhar com Julião e Leo");
  });
  it("gente de fora vira 'alguém' (repetição colapsa)", () => {
    expect(filterWorkText("Validar com Cristovão e Rafaela o go/nogo")).toBe("Validar com alguém o go/nogo");
    expect(filterWorkText("Bruno Souza pediu fotos")).toBe("alguém pediu fotos");
  });
  it("nome comum ambíguo só com inicial maiúscula (palavra comum fica)", () => {
    expect(filterWorkText("Cor clara no iluminador")).toBe("Cor clara no iluminador");
  });
  it.each([
    ["Reunião com Ana Paula", "Reunião com alguém"],
    ["Alinhar com joão", "Alinhar com alguém"],
    ["Felipe Souza revisar", "alguém revisar"],
    ["Thais revisar", "alguém revisar"],
    ["Thaís", "alguém"],
    ["Paula", "alguém"],
    ["Ligar pro Mário", "Ligar pro alguém"],
    ["Cristóvão aprovar", "alguém aprovar"],
  ])("pessoa: %s", (inp, out) => expect(filterWorkText(inp)).toBe(out));
  it.each([
    ["Visita a Sarzedo", "Visita a Pátio"],
    ["CARANDAÍ", "Pátio"],
    ["carandai", "Pátio"],
    ["Dias Tavares", "Pátio"],
    ["Cons. Lafaiete", "Pátio"],
    ["C. Lafaiete", "Pátio"],
    ["Juiz-de-Fora", "Pátio"],
    ["BH", "Pátio"],
    ["SP", "Pátio"],
    ["Vale do Aço", "Pátio"],
    ["Descer o rio", "Descer o rio"],
    ["Vli", "outra Ferrovia"],
    ["Lafaiete2", "Pátio2"],
    ["Lafaiete_Pátio", "Pátio_Pátio"],
  ])("lugar: %s", (inp, out) => expect(filterWorkText(inp)).toBe(out));
  it("cidades e pátios viram Pátio", () => {
    expect(filterWorkText("Instalação em Conselheiro Lafaiete")).toBe("Instalação em Pátio");
    expect(filterWorkText("Sarzedo, Carandaí e Juiz de Fora")).toBe("Pátio, Pátio e Pátio");
    expect(filterWorkText("Volta Redonda / Barra Mansa / Cruzeiro")).toBe("Pátio / Pátio / Pátio");
  });
});

describe("filterWorkText: corte e limpeza", () => {
  it("corta em 60 caracteres com reticências", () => {
    const t = filterWorkText("Calibrar ".repeat(20))!;
    expect([...t].length).toBe(WORK_TITLE_MAX);
    expect(t.endsWith("…")).toBe(true);
  });
  it("item do Chegou! corta em 40", () => {
    expect([...filterWorkText("Cabo de rede blindado categoria 6 de 305 metros caixa", WORK_ITEM_MAX)!].length).toBe(WORK_ITEM_MAX);
  });
  it("vazio, só pontuação ou não-texto → null", () => {
    expect(filterWorkText("   ")).toBeNull();
    expect(filterWorkText("-- //")).toBeNull();
    expect(filterWorkText(42 as unknown as string)).toBeNull();
  });
  it("clipText não corta o que cabe", () => expect(clipText("abc", 3)).toBe("abc"));
  it("corte não quebra emoji e o texto final não leva caracteres invisíveis/bidi", () => {
    const t = filterWorkText("x".repeat(59) + "\u{1F600}\u{1F600}")!;
    expect([...t].length).toBe(WORK_TITLE_MAX);
    expect(filterWorkText("\u202eSLR")).toBe("SLR");
    expect(filterWorkText("Calibrar\u200b câmera\u2066")).toBe("Calibrar câmera");
    expect([...filterWorkText("a".repeat(300))!].length).toBe(WORK_TITLE_MAX);
  });
});

describe("workAssigneeNick", () => {
  it("equipe pelo id", () => expect(workAssigneeNick({ id: 43024221, email: "x@embeddo.io" })).toBe("Pedrão"));
  it("da casa sem apelido", () => expect(workAssigneeNick({ id: 1, email: "novo@embeddo.io" })).toBe("alguém da Oficina"));
  it("de fora", () => {
    expect(workAssigneeNick({ id: 2, email: "fulano@mrs.com.br" })).toBe("alguém da Ferrovia");
    expect(workAssigneeNick({ id: 3, email: "fulano@gmail.com" })).toBe("alguém de fora");
  });
  it("cliente confidencial → null", () => expect(workAssigneeNick({ id: 4, email: "x@jaguarlandrover.com" })).toBeNull());
  it("sem e-mail → de fora; domínio em maiúsculas", () => {
    expect(workAssigneeNick({ id: 5, email: null })).toBe("alguém de fora");
    expect(workAssigneeNick({ id: 6, email: "x@EMBEDDO.IO" })).toBe("alguém da Oficina");
    expect(workAssigneeNick({ id: 7, email: "x@vale.com" })).toBe("alguém de fora");
  });
  it("sem responsável", () => expect(workAssigneeNick(undefined)).toBe("ninguém ainda"));
});

describe("workProjects", () => {
  it("todo projeto tem nome que passa intacto pelo filtro (já disfarçado)", () => {
    for (const p of WORK_PROJECTS) expect(filterWorkText(p.name), p.id).toBe(p.name);
  });
  it("cada espaço pertence a um projeto só; o espaço do cliente confidencial fica de fora", () => {
    const all = WORK_PROJECTS.flatMap((p) => p.spaces);
    expect(new Set(all).size).toBe(all.length);
    expect(workProjectOfSpace("90131073435")).toBeUndefined();
  });
  it("/vincular aceita apelido (sem acento/caixa) ou id", () => {
    expect(workUserByNick("pedrao")).toBe("43024221");
    expect(workUserByNick("Lucas P.")).toBe("118037728");
    expect(workUserByNick("123")).toBe("123");
    expect(workUserByNick("1234567890123")).toBeUndefined(); // mais de 12 dígitos
    expect(workUserByNick("fulano")).toBeUndefined();
    expect(Object.values(WORK_NICKS).every((n) => !/\s\p{Lu}\p{Ll}{2,}/u.test(n) || n === "Anna Clara")).toBe(true);
  });
});
