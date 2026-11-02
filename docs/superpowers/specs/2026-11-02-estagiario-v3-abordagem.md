# Estagiário v3 — abordagem nova (política, canais e diário)

Data: 2026-11-02. Dono: "A questão da cura ainda tá me incomodando. Eu fui caçar agora e quando a vida abaixou muito,
ele não usou pote." e depois "Vamos pensar em uma outra abordagem então. Como você criaria um bot com essas
funcionalidades? Sem levar em consideração o que temos hoje."

## 1. O caso que motivou

Leitura só-leitura do banco de produção (2026-11-02): o cavaleiro lv 111 do dono tinha como regras de cura só "poção de
vida abaixo de 80 %" e "poção de mana abaixo de 25 %", 349 Poções Supremas e 45 Grandes na mochila, as duas bebíveis.
Pelo código, com a Cura ligada ele beberia aos 79 %. A única explicação: **o interruptor Cura estava desligado**. Ele
voltava a desligado a cada entrada no mundo e a cada recarga da página (spec de 01/11: "Desconectou / fechou o cliente:
cura e ataque desligam"), e ligar a rota acendia Ataque e Buffs, mas não a Cura. O dono recarregou o cliente depois do
deploy do dia e a Cura apagou sem aviso.

Achado de passagem na mesma leitura: um paladino lv 83 sem nenhuma poção de vida na mochila — a regra de poção é pulada
em silêncio e só a magia cura. Nada avisava.

## 2. Princípios da abordagem nova

1. **Cura é camada de segurança, não módulo.** Bot ligado implica cura ligada. O jogador ajusta porcentagens, não liga e
   desliga a cura. Os interruptores ficam salvos por personagem e sobrevivem a recarregar a página; ao entrar, uma
   carência curta e pronto. Só a rota exige ligar à mão, porque gasta turno.
2. **Um canal por recarga.** Quatro recursos que não se misturam: a recarga de poção, a das magias de cura e suporte, a
   das magias de ataque e o movimento. Cada tick, cada canal decide no máximo uma ação, de forma independente. Com a
   vida em 25 %, poção e Limpar Feridas saem no mesmo tick. (Hoje sai uma cura por tick e a outra espera.)
3. **Decisão por "o que falta", não por ordem de lista.** A política calcula quanto falta de vida, quanto cada opção
   devolve e quanto custa em mana e tempo, e escolhe a melhor cobertura por custo. O cavaleiro bebe poção quase sempre
   (a cura dele devolve pouco); o mago usa a magia (cobre bem). É o que o simulador mediu, mas sai da fórmula, não de
   limiares ajustados à mão.
4. **Perfil por nome, não por valores.** O save guarda `preset: "equilibrado"`, não os números. Quem usa o recomendado
   recebe o recomendado atual a cada versão, sem clicar em nada. Só quem personalizou grava números. Elimina a classe
   inteira de "configuração salva antiga".
5. **Transparência.** Um diário com as últimas decisões e o motivo de cada uma, visível na janela: "12:41:03 vida 28 %,
   poção em recarga, usei Limpar Feridas, +96". O crachá mostra a última ação. Antes de começar, o bot confere a mochila
   e avisa: "nenhuma poção de vida que você possa beber".
6. **Perfis derivados dos dados e validados por simulação.** O jogo sabe quais magias e poções existem por vocação e
   level; o recomendado é calculado disso, e o arnês de balanço (`estagiarioSimKit.ts`) vira asserção de CI.

## 3. O laço de cada tick (alvo)

1. **Sentir**: um instantâneo puro — vida, mana, o que falta, recargas restantes por canal, ameaças ordenadas por
   distância e vida, aliados, poções bebíveis na mochila, comida, posição, zona segura, NPC aberto.
2. **Decidir**: uma função pura no `shared` — instantâneo + perfil entram, sai `{ pocao, magia, ataque, movimento,
   motivos }`. Testável em tabela, sem servidor.
3. **Agir**: cada canal executa a sua ação; recusa vira linha no diário e um pequeno recuo para não insistir todo tick.
4. **Comunicar**: estado ao cliente quando muda; alarmes quando passam de um limiar.

Perfil de cura com três números por vocação: emergência, conforto e reserva de mana. Abaixo da emergência, poção e magia
juntas e, se nada está pronto, o personagem se afasta do bicho mais perto. Entre emergência e conforto, a melhor
cobertura por custo. Mana abaixo da reserva, poção de mana, só se o canal de poção não está servindo a vida. Com Escudo
de Mana, a mana é a vida: a reserva sobe e a prioridade inverte sozinha. Buffs só quando o canal de magia não está
ocupado com cura. A reserva de mana do ataque vira "duas vezes a cura mais cara", que acompanha o level.

## 4. Interface (alvo)

- **Modo simples** com três presets (Seguro, Equilibrado, Agressivo) e três deslizadores.
- **Modo avançado** com a lista de regras de hoje, para quem gosta de ajustar.

## 5. Etapas (cada uma já melhora a caça e o simulador mede o ganho)

| Etapa | O quê | Status |
|---|---|---|
| 1 | Cura salva por personagem (com Ataque e Buffs) e ligada pela rota; diário de decisões na janela | ✅ 2026-11-02 (PR "Estagiário v3, etapa 1") |
| 2 | Canais independentes: poção e magia de cura no mesmo tick; buff só com o canal de magia livre | 🧭 |
| 3 | Perfil por nome (`preset`) no save e a política de cura por cobertura/custo (3 números por vocação) | 🧭 |
| 4 | Modo simples (presets + deslizadores) e modo avançado (regras) | 🧭 |

## 6. Etapa 1 — o que foi feito

- **Interruptores salvos** (`CharacterData.estagiario.ligado = { cura?, ataque?, buffs? }`, só os `true`):
  `EstagiarioSystem.load` restaura; `saved` grava a escolha do jogador (não o que a rota liga por tabela). Na queda ou
  ao fechar o cliente, `desligarTudo` agora só **suspende** (`suspenso`): nada age, a rota desliga e a gravação se
  perde, mas os interruptores ficam para o save; `reconectou` (WorldRoom.onReconnect) volta a agir. Ao entrar ou
  reconectar com algo ligado, **carência** de 3 s (`CARENCIA_LOGIN_MS`) antes de agir; ligar algo à mão zera a carência.
- **Cura ligada pela rota** (`curaLigada = cura || rota`), como Ataque e Buffs; o interruptor fica travado com
  "ligada pela rota" enquanto a rota roda.
- **Diário** (`DiarioItem { t, canal, texto }`, `DIARIO_MAX = 50`, S2C `EstagiarioDiario { itens, tudo? }`, uma
  mensagem por tick com as linhas novas; `tudo` ao reconectar): cada poção ("vida 42 % → poção de vida, +450") e cura
  ("vida 30 % → Limpar Feridas, +96"), "esperando" com os motivos (poção em recarga, nenhuma poção que você possa
  beber, magia em recarga/sem mana/acima do level) no máximo a cada 2 s, "a Cura está desligada" com a vida abaixo de
  uma regra a cada 10 s, buffs, comida, rota (ligada, pausada, desligada com o motivo: turno, morte, zona de proteção,
  pontos travados, Coliseu, saiu do jogo, rota apagada), interruptores e alarmes (mesmo os que o jogador desligou).
  Aba **Diário** na janela, a linha mais nova em cima.
- Texto da aba Buffs corrigido (a frase "sobra mana para a cura" era da v1; na v2 o buff só exige a própria mana).

Decisão que contraria a spec de 01/11 ("Desconectou / fechou o cliente: cura e ataque desligam"): aprovada pelo dono em
2026-11-02 ("Pode fazer a etapa 1").
