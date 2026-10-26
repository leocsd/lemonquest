# The Lemon Quest — rodando com Docker

Alternativa ao serviço do Windows (NSSM). Funciona igual em Windows (Docker Desktop), Linux ou Mac.
A imagem tem o servidor e o cliente já compilado; o jogo fica em `http://<IP-da-máquina>:2567`.

> **Use um ou outro.** O serviço do Windows (`LemonQuest`, via NSSM) e o container usam a mesma porta 2567.
> Para trocar para o Docker, pare e desative o serviço primeiro (passo 2).

## 1. Requisitos

- Docker com Compose v2 (`docker compose version`). No Windows: Docker Desktop com WSL2.
- A pasta do projeto (git clone ou cópia).

## 2. Trocar do serviço do Windows para o Docker (só se o NSSM estiver instalado)

PowerShell **como administrador**:

```powershell
C:\nssm\win64\nssm.exe stop LemonQuest        # para o servidor (salva os jogadores)
Set-Service LemonQuest -StartupType Disabled  # não sobe mais com o Windows
```

**Levar os personagens para o container** (o banco do serviço fica em `data\`, o do Docker em `docker-data\`):

```powershell
cd C:\Users\leocs\Desktop\lemonquest
mkdir docker-data -Force
copy data\lemonquest.db docker-data\lemonquest.db
```

(Só o `.db` basta: o servidor fecha o banco direito ao parar, então os arquivos `-wal`/`-shm` ficam vazios.)

## 3. Subir

Na pasta do projeto:

```powershell
docker compose up -d --build
```

A primeira vez leva alguns minutos (baixa a imagem do Node e compila o cliente). Depois:

```powershell
docker compose ps          # STATUS deve ficar "healthy"
docker compose logs -f     # acompanhar (Ctrl+C sai do log, não para o jogo)
```

Abra `http://localhost:2567`. De outro PC: `http://<IP-desta-máquina>:2567` (o firewall precisa liberar a porta 2567 — veja `deploy\windows\firewall.ps1`).

## 4. Dia a dia

| Ação | Comando (na pasta do projeto) |
| --- | --- |
| Parar (salva todos os jogadores) | `docker compose stop` |
| Iniciar de novo | `docker compose start` |
| Reiniciar | `docker compose restart` |
| Ver logs | `docker compose logs -f` |
| Ver estado | `docker compose ps` |
| **Atualizar o jogo** | `git pull` e depois `docker compose up -d --build` |
| Remover o container (os dados ficam em `docker-data\`) | `docker compose down` |

**Inicia junto com o Windows?** Sim: o container tem `restart: unless-stopped`, então volta sozinho sempre que o Docker iniciar. No Docker Desktop, ative *Settings → General → Start Docker Desktop when you sign in to your computer*. (Diferente do NSSM, o Docker Desktop só sobe quando alguém entra no Windows. Num servidor Linux o Docker sobe no boot.)

## 5. Dados e backups

- Banco: `docker-data\lemonquest.db`. Backups automáticos de hora em hora: `docker-data\backups\` (48 h de horários + 1 por dia por 14 dias).
- Restaurar um backup:

  ```powershell
  docker compose stop
  copy docker-data\backups\<ARQUIVO>.db docker-data\lemonquest.db
  del docker-data\lemonquest.db-wal, docker-data\lemonquest.db-shm
  docker compose start
  ```

  (Se o `del` reclamar que os arquivos não existem, tudo bem.)

### Voltar para a versão anterior (rollback)

Antes de atualizar, guarde a imagem atual e uma cópia do banco: `docker tag lemonquest:latest lemonquest:pre-<versão>` e
um backup manual do `.db` (com o jogo parado, `copy docker-data\lemonquest.db docker-data\backups\pre-<versão>.db`).
Para voltar: `docker compose stop`, `docker tag lemonquest:pre-<versão> lemonquest:latest` e `docker compose up -d` (sem
`--build`).

> **Depois do ciclo 16 (refino +1..+5), voltar só a imagem apaga o refino.** O código antigo não conhece o campo
> `refine` dos itens: no primeiro save de cada personagem os itens refinados voltam a +0, e o ouro e as gemas gastos não
> voltam. Rollback para antes do ciclo 16, depois que alguém refinou, exige restaurar também o backup do banco feito antes
> do deploy (como em "Restaurar um backup", acima; perde-se o que aconteceu depois dele) ou aceitar a perda do refino.

### Cópia dos backups em outro disco (recomendado)

Se o disco da máquina morrer, `docker-data\backups\` vai junto. Com `LEMONQUEST_BACKUP_COPY_DIR`, depois de cada backup o
servidor copia o arquivo novo para outra pasta, com rotação própria (o mais recente de cada dia, por 14 dias). Se a pasta
não estiver disponível (disco desligado, rede fora), o servidor só registra `[backup] cópia externa falhou` no log e segue —
o jogo não cai e a pasta **não** é criada no disco local por engano.

No `docker-compose.yml`, descomente/ajuste:

```yaml
    environment:
      LEMONQUEST_BACKUP_COPY_DIR: "/backup-copy"
    volumes:
      - ./docker-data:/app/data
      - /mnt/nas/lemonquest:/backup-copy        # Linux: disco/NAS já montado no host
      # - D:/backups-lemonquest:/backup-copy    # Windows (Docker Desktop): outra unidade
```

e rode `docker compose up -d`. Confira no log: `[backup] cópia externa: /backup-copy/lemonquest-....db`.

**Alternativa sem mexer no container (Linux, cron + rsync)** — copia a pasta de backups para outro disco/servidor toda hora:

```bash
crontab -e
# a cada hora, no minuto 10 (o backup do jogo sai na virada da hora):
10 * * * * rsync -a --delete-after ~/lemonquest/docker-data/backups/ /mnt/nas/lemonquest-backups/ >> ~/lemonquest-rsync.log 2>&1
# ou para outra máquina via SSH (chave sem senha):
# 10 * * * * rsync -a -e "ssh -i ~/.ssh/backup_key" ~/lemonquest/docker-data/backups/ usuario@outro-servidor:/srv/lemonquest-backups/
```

(`--delete-after` espelha a rotação local; tire-o para guardar tudo no destino.)

## 6. Configuração

Edite `docker-compose.yml` (seção `environment`) e rode `docker compose up -d` de novo:

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `PORT` | `2567` | Porta dentro do container (para mudar a porta de fora, altere `ports: "NOVA:2567"`). |
| `TZ` | `America/Sao_Paulo` | Fuso dos nomes de backup e dos logs. |
| `LEMONQUEST_ADMINS` | vazio | Personagens administradores (ex.: `"Leonardo, Ana"`) — comandos de admin, veja o passo 9. |
| `LEMONQUEST_ADMIN_ACCOUNTS` | vazio | Contas (login) que podem criar personagens com nome de admin. Sem ela, nomes de admin ainda não criados ficam reservados. |
| `LEMONQUEST_TRUST_PROXY` | vazio | Só atrás do Caddy **com a 2567 fechada** (`"uniquelocal"`): o limite de login por IP usa o IP real do jogador. |
| `LEMONQUEST_DEV_COMMANDS` | desligado | `"1"` liga /level, /item etc. para os admins — só fora de produção (no container, que roda em produção, nunca liga). |
| `LEMONQUEST_BACKUP_COPY_DIR` | vazio | Pasta para uma **cópia extra** de cada backup (outro disco/NAS). Veja o passo 5. |
| `LEMONQUEST_CLICKUP_TOKEN` | vazio | Token pessoal do ClickUp (só leitura) que liga o "Chegou!", as barras de sprint, a aba "Na obra" e as conquistas de tarefas ([README](../../README.md#clickup-no-jogo-opcional)). O `docker-compose.yml` já repassa a variável: só crie um `.env` ao lado dele com `LEMONQUEST_CLICKUP_TOKEN=pk_...` e rode `docker compose up -d` (**nunca** escreva o token no compose; o `.env` não vai para o git). O container precisa de saída para `api.clickup.com` (HTTPS). |
| `LEMONQUEST_CLICKUP_POLL_MIN` | `5` | Minutos entre leituras do ClickUp (1 a 60). |
| `LEMONQUEST_CLICKUP_TEAM` / `LEMONQUEST_CLICKUP_PURCHASES_LIST` | do código | Workspace e lista "Controle de Compras", se mudarem. |

## 7. Servidor Linux do escritório (repositório privado no GitHub)

O código fica em `github.com/leocsd/lemonquest` (privado). No servidor:

1. **Docker**: `curl -fsSL https://get.docker.com | sh` e `sudo usermod -aG docker $USER` (saia e entre de novo). Confira com `docker compose version`.
2. **Chave de leitura só deste repositório (deploy key)** — assim o servidor baixa o código sem usar a sua conta:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/lemonquest_deploy -N "" -C "servidor-escritorio"
   cat ~/.ssh/lemonquest_deploy.pub
   ```

   Cole a chave pública em GitHub → repositório → *Settings → Deploy keys → Add deploy key* (deixe **sem** "Allow write access"). Depois:

   ```bash
   cat >> ~/.ssh/config <<'EOF'
   Host github-lemonquest
     HostName github.com
     User git
     IdentityFile ~/.ssh/lemonquest_deploy
     IdentitiesOnly yes
   EOF
   git clone git@github-lemonquest:leocsd/lemonquest.git ~/lemonquest
   ```

3. **Levar os personagens** (opcional): pare o jogo na máquina antiga (`docker compose stop`) e copie o banco para o servidor:

   ```bash
   # na máquina antiga (PowerShell), por exemplo:
   scp C:\Users\leocs\Desktop\lemonquest\docker-data\lemonquest.db usuario@IP-DO-SERVIDOR:~/lemonquest/docker-data/
   ```

   (Crie a pasta antes no servidor: `mkdir -p ~/lemonquest/docker-data`.)
4. **Subir**: `cd ~/lemonquest && docker compose up -d --build`, depois `docker compose ps` até ficar *healthy*.
5. **Firewall** (se usar ufw): `sudo ufw allow 2567/tcp`. O jogo fica em `http://IP-DO-SERVIDOR:2567`.
6. **Inicia com o servidor**: o Docker sobe no boot no Linux e o container tem `restart: unless-stopped` — não precisa de mais nada (confira com `sudo systemctl is-enabled docker`).
7. **Atualizar** quando houver versão nova no GitHub: `cd ~/lemonquest && git pull && docker compose up -d --build`.

> Não deixe a máquina antiga e o servidor rodando o jogo ao mesmo tempo com o mesmo banco copiado — cada um vira um "mundo" separado. Depois de migrar, desligue o antigo (`docker compose down`).

## 8. Como a imagem é montada

- `Dockerfile` em duas etapas: a primeira instala tudo e gera o cliente e o **servidor empacotado com esbuild** (`packages/server/dist/server.mjs`, um arquivo só com todas as dependências; `admin.mjs` é o CLI de administração); a final é um Alpine com só o binário do Node (strip), o bundle, o mapa e o cliente compilado — sem `node_modules`, `tsx` nem npm (~180 MB em camadas, contra ~500 MB antes). `LEMONQUEST_ROOT` (padrão `/app`) diz onde ficam `assets/`, `packages/client/dist` e `data/`.
- Os itens no chão e o recorde do Coliseu ficam no banco (`ground_items`/`kv`) e sobrevivem a reinícios.
- O processo roda como o usuário `node` (sem privilégios). Na partida o container acerta o dono da pasta `/app/data`, para funcionar também com pastas montadas no Linux.
- `docker stop` manda SIGTERM: o servidor salva todos os jogadores e fecha o banco antes de sair (até 30 s, `stop_grace_period`).
- Healthcheck em `/health` a cada 30 s.

## 9. Administração

Coloque o seu personagem em `LEMONQUEST_ADMINS` (seção `environment`) e rode `docker compose up -d`. No jogo, digite no
chat: `/online`, `/kick <nome> [motivo]`, `/mute <nome> <minutos>`, `/unmute <nome>`, `/anuncio <texto>`, `/tp <nome>`,
`/resetsenha <conta>`, `/status`, `/evento <nome> [minutos]`, `/desbloquear <nome> <roupa|addon|título>`,
`/vincular <personagem> <apelido|id do ClickUp|nenhum>` (detalhes no
[README principal](../../README.md#administradores)). Tudo fica no log com `[admin]`:
`docker compose logs | grep "\[admin\]"`.

**Recuperar a senha de alguém sem admin online** (o container precisa estar rodando; o diretório de trabalho da imagem
é `/app` e o banco é o de `LEMONQUEST_DB=/app/data/lemonquest.db`):

```bash
docker compose exec -u node lemonquest node packages/server/dist/admin.mjs reset-password <conta>
docker compose exec -u node lemonquest node packages/server/dist/admin.mjs deleted     # personagens excluídos
docker compose exec -u node lemonquest node packages/server/dist/admin.mjs telemetria  # progressão por faixa e vocação, skills reais e causas de morte (só leitura)
```

Conta com espaço no nome: use aspas (`reset-password "Time Azul"`). O `-u node` evita criar arquivos do banco como root.
O código aparece no terminal (vale 24 h, uso único); a pessoa usa em "Esqueci minha senha" na tela de login.

**Personagens excluídos** pelos jogadores ficam guardados na tabela `deleted_characters` (linha inteira: level, itens,
depot, posição). Para restaurar à mão: pare o jogo, abra o banco com `sqlite3` e copie a linha de volta para `characters`
(o nome precisa estar livre).

## 10. HTTPS (opcional)

Sem HTTPS o jogo funciona normalmente na LAN (`http://IP:2567`). Se quiser HTTPS (cadeado, senhas não trafegam em
claro, necessário se publicar na internet), há um proxy [Caddy](https://caddyserver.com) pronto como override do compose.
Ele também faz o proxy do WebSocket do jogo (`wss://`) sem configuração extra.

**LAN (IP ou nome interno, certificado da CA local do Caddy):**

```bash
SITE_ADDRESS=192.168.1.50 docker compose -f docker-compose.yml -f deploy/docker/docker-compose.https.yml up -d --build
# jogo em https://192.168.1.50  (portas 80/443 do servidor; a 80 redireciona para a 443)
```

Guarde as variáveis num arquivo `.env` ao lado do `docker-compose.yml` (`SITE_ADDRESS=192.168.1.50`) para não digitar
sempre. `HTTP_PORT`/`HTTPS_PORT` mudam as portas publicadas (ex.: `8080`/`8443` para testar sem mexer no 80/443).

**Confiar no certificado nos PCs dos jogadores** (senão o navegador mostra um aviso, que dá para aceitar em cada PC):

```bash
docker cp lemonquest-caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Distribua o `caddy-root.crt` e instale em "Autoridades de Certificação Raiz Confiáveis" (Windows: duplo clique >
Instalar certificado > Computador local; macOS: Keychain > Sempre confiar; o Firefox tem repositório próprio:
Configurações > Certificados > Importar). O certificado fica no volume `caddy_data` — não o apague, ou a CA muda e
todos precisam reinstalar. Se o IP do servidor mudar, mude `SITE_ADDRESS` (o certificado é emitido para o novo IP).

**Domínio público real (Let's Encrypt automático):** DNS apontando para o servidor e portas 80/443 acessíveis da internet:

```bash
CADDYFILE=Caddyfile.domain SITE_ADDRESS=jogo.empresa.com.br ACME_EMAIL=ti@empresa.com.br \
  docker compose -f docker-compose.yml -f deploy/docker/docker-compose.https.yml up -d --build
```

**Fechar a 2567:** com o HTTPS validado, os jogadores usam só `https://...`. Para não expor mais o HTTP direto,
acrescente no `docker-compose.https.yml`, no serviço `lemonquest`, `ports: !override []` (e feche a 2567 no firewall).
O Caddy alcança o jogo pela rede interna do compose.

## Problemas comuns

- **`port is already allocated` / porta 2567 em uso**: o serviço do Windows ainda está rodando — veja o passo 2 — ou outro programa usa a porta (`netstat -ano | findstr :2567`).
- **Fica `unhealthy`**: `docker compose logs` mostra o motivo.
- **Funciona no PC, mas não nos outros**: firewall do Windows (porta 2567) ou rede classificada como Pública.
