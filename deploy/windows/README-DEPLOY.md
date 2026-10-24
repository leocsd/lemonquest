# The Lemon Quest - Deploy no Windows (rede do escritório)

Passo a passo para colocar o servidor no ar numa máquina Windows e deixar a galera jogar.

## 1. Requisitos

- **Node.js 24 LTS** - https://nodejs.org (instalador padrão; marque a opção de adicionar ao PATH).
- **Git** - https://git-scm.com (ou copie a pasta do projeto num pendrive).
- Máquina ligada e com IP fixo (ou reservado no roteador) para os jogadores não perderem o endereço.

Confira num PowerShell: `node -v` (deve mostrar v24.x) e `git --version`.

## 2. Baixar e preparar

```powershell
cd C:\
git clone <URL-DO-REPOSITORIO> lemonquest
cd C:\lemonquest
npm ci
npm run build
```

`npm run build` gera `packages\client\dist` (cerca de 20 MB). **O servidor em produção não sobe sem essa pasta.**

## 3. Primeiro teste (manual)

```powershell
npm run start:fast
```

(ou dê dois cliques em `deploy\windows\start-lemonquest.cmd`). Abra `http://localhost:2567` no navegador da própria máquina.
Para parar: `Ctrl+C` (o servidor salva os jogadores antes de sair).

## 4. Testar de outro computador

1. Descubra o IP da máquina: `ipconfig` e procure **Endereço IPv4** do adaptador em uso (ex.: `192.168.0.10`).
2. Libere a porta no firewall (PowerShell **como administrador**):

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\lemonquest\deploy\windows\firewall.ps1 -Port 2567
   ```

   A regra vale para redes Domínio e Privada. Se o Windows classificou a rede do escritório como "Pública" (comum no Wi-Fi), mude para "Privada" em Configurações > Rede **ou** acrescente `-IncludePublic` ao comando acima.
3. Em outro PC da rede abra `http://192.168.0.10:2567` (use o seu IP).

> A conexão é HTTP, sem criptografia. Avise o pessoal para não reutilizar a senha do trabalho.

## 5. Iniciar junto com o Windows

Há dois jeitos. **Recomendado: serviço (5A).** (Prefere Docker? Veja [../docker/README.md](../docker/README.md) — ele substitui esta seção.)

| | 5A. Serviço do Windows (NSSM) | 5B. Atalho na Inicialização |
| --- | --- | --- |
| Sobe quando | o PC liga, **sem ninguém logado** | alguém entra na conta do Windows |
| Se o servidor cair | reinicia sozinho em 5 s | fica fora até reabrir |
| Precisa de administrador | sim (uma vez) | não |
| Onde ver o log | `C:\lemonquest\logs\` | janela minimizada do servidor |

Use **só um dos dois** (os dois juntos disputam a porta 2567).

### 5A. Serviço com NSSM (recomendado)

1. **Instale o NSSM.** O site https://nssm.cc vive fora do ar, então use o winget (vem no Windows 10/11):

   ```powershell
   winget install --id NSSM.NSSM --exact
   ```

   Copie o executável para um lugar fixo (o serviço roda como sistema e não deve depender do seu perfil):

   ```powershell
   New-Item -ItemType Directory -Force C:\nssm\win64 | Out-Null
   $src = (Get-Item "$env:LOCALAPPDATA\Microsoft\WinGet\Links\nssm.exe").LinkTarget
   Copy-Item $src C:\nssm\win64\nssm.exe -Force
   ```

   (Sem winget: baixe o zip em https://nssm.cc/download — use a versão **2.24-101** ou mais nova — e extraia em `C:\nssm`.)

2. **Pare o servidor manual**, se estiver aberto (feche a janela do `start-lemonquest.cmd`), e desligue o atalho da opção 5B, se você tinha usado:

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\lemonquest\deploy\windows\remove-startup.ps1
   ```

3. **Instale, libere a porta e inicie** — PowerShell **como administrador** (botão direito > Executar como administrador):

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\lemonquest\deploy\windows\install-service.ps1 -RepoPath C:\lemonquest -NssmPath C:\nssm\win64\nssm.exe -Port 2567
   powershell -ExecutionPolicy Bypass -File C:\lemonquest\deploy\windows\firewall.ps1 -Port 2567 -IncludePublic
   C:\nssm\win64\nssm.exe start LemonQuest
   ```

   (Tire o `-IncludePublic` se a rede do escritório estiver como "Privada".)

4. **Confira:** `Get-Service LemonQuest` deve mostrar `Running` / `Automatic`, e `http://localhost:2567` deve abrir o jogo. Daqui em diante ele sobe sozinho quando o PC liga.

Comandos do dia a dia (PowerShell como administrador):

| Ação | Comando |
| --- | --- |
| Parar (salva todos os jogadores) | `C:\nssm\win64\nssm.exe stop LemonQuest` |
| Iniciar | `C:\nssm\win64\nssm.exe start LemonQuest` |
| Reiniciar | `C:\nssm\win64\nssm.exe restart LemonQuest` |
| Ver estado | `Get-Service LemonQuest` |
| Desinstalar o serviço | `C:\nssm\win64\nssm.exe remove LemonQuest confirm` |

### 5B. Atalho na Inicialização (sem administrador)

```powershell
powershell -ExecutionPolicy Bypass -File C:\lemonquest\deploy\windows\install-startup.ps1
```

Cria o atalho "The Lemon Quest (servidor)" na pasta Inicialização (`shell:startup`): o servidor abre minimizado quando você entra no Windows. Para desfazer: `remove-startup.ps1`. Para parar o servidor: Ctrl+C ou feche a janela dele (ele salva antes de sair).

### 5A em detalhe: instalar o serviço à mão (o que o script faz)

O `install-service.ps1` pode ser executado de novo para atualizar a configuração. Se preferir fazer à mão:

```powershell
nssm install LemonQuest
```

Na janela que abre:

| Aba | Campo | Valor |
| --- | --- | --- |
| Application | Path | `C:\Program Files\nodejs\node.exe` |
| Application | Startup directory | `C:\lemonquest\packages\server` |
| Application | Arguments | `--import tsx src/index.ts` |
| Details | Startup type | Automatic |
| I/O | Output (stdout) | `C:\lemonquest\logs\lemonquest.out.log` |
| I/O | Error (stderr) | `C:\lemonquest\logs\lemonquest.err.log` |
| File rotation | Rotate files + Rotate while running + Restrict rotation to 1048576 bytes | marcados |
| Shutdown | Método | deixe apenas **Generate Ctrl+C** (timeout 20000 ms), desmarque os demais |
| Exit actions | Default action | Restart application, delay 5000 ms |
| Environment | Environment variables | uma por linha: `NODE_ENV=production` e `NODE_OPTIONS=--disable-warning=ExperimentalWarning` (e `PORT=...`, se mudar) |

Ou, tudo por linha de comando:

```powershell
nssm install LemonQuest "C:\Program Files\nodejs\node.exe" "--import tsx src/index.ts"
nssm set LemonQuest AppDirectory C:\lemonquest\packages\server
nssm set LemonQuest AppEnvironmentExtra NODE_ENV=production NODE_OPTIONS=--disable-warning=ExperimentalWarning
nssm set LemonQuest AppStopMethodConsole 20000
nssm set LemonQuest AppStopMethodWindow 0
nssm set LemonQuest AppStopMethodThreads 0
nssm set LemonQuest AppStdout C:\lemonquest\logs\lemonquest.out.log
nssm set LemonQuest AppStderr C:\lemonquest\logs\lemonquest.err.log
nssm set LemonQuest AppRotateFiles 1
nssm set LemonQuest AppRotateOnline 1
nssm set LemonQuest AppRotateBytes 1048576
nssm set LemonQuest AppExit Default Restart
nssm set LemonQuest AppRestartDelay 5000
nssm set LemonQuest Start SERVICE_AUTO_START
```

(Crie a pasta `C:\lemonquest\logs` antes.) O Ctrl+C no encerramento faz o servidor salvar tudo e fechar o banco corretamente.

Comandos úteis: `nssm start LemonQuest`, `nssm stop LemonQuest`, `nssm restart LemonQuest`, `nssm status LemonQuest`, `nssm remove LemonQuest confirm`.

## 6. Atualizar o jogo

Com o serviço (5A), em PowerShell como administrador:

```powershell
C:\nssm\win64\nssm.exe stop LemonQuest
cd C:\lemonquest
git pull            # ou copie os arquivos novos por cima (sem node_modules e data)
npm ci
npm run build
C:\nssm\win64\nssm.exe start LemonQuest
```

Com o atalho (5B): feche a janela do servidor, rode os mesmos `git pull` / `npm ci` / `npm run build` e abra o `start-lemonquest.cmd` de novo.

> O servidor faz backup do banco de hora em hora em `data\backups`; antes de uma atualização grande, vale guardar também uma cópia manual.

## 7. Variáveis de ambiente

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `PORT` | `2567` | Porta HTTP/WebSocket do servidor. |
| `LEMONQUEST_DB` | `data\lemonquest.db` (na raiz do repo) | Caminho do banco SQLite. |
| `LEMONQUEST_BACKUP_DIR` | `data\backups` | Pasta onde o servidor grava os backups automáticos. |
| `LEMONQUEST_DEV_COMMANDS` | desligado | `1` habilita comandos de desenvolvimento (só para teste, **não** deixe ligado em produção sem necessidade). |
| `LEMONQUEST_ADMINS` | vazio | Nomes de personagens admin, separados por vírgula (ex.: `Leo,Ana`). Comandos de admin (`/kick`, `/mute`, `/unmute`, `/anuncio`, `/online`, `/resetsenha`, `/tp`, `/status`, `/evento`, `/desbloquear`, `/vincular`) valem em produção; os de dev só com `LEMONQUEST_DEV_COMMANDS=1` fora de produção. Veja "Administradores" no README principal. |
| `LEMONQUEST_ADMIN_ACCOUNTS` | vazio | Contas (login) que podem criar personagens com nome de admin; sem ela, esses nomes ficam reservados se o personagem ainda não existir. |
| `LEMONQUEST_BACKUP_COPY_DIR` | vazio | Pasta extra (outro disco/pasta de rede) que recebe uma cópia de cada backup, com rotação própria (1 por dia, 14 dias). Se estiver indisponível, só loga. |
| `LEMONQUEST_CLICKUP_TOKEN` | vazio | Token pessoal do ClickUp (só leitura): liga o "Chegou!", as barras de sprint, a aba "Na obra" e as conquistas de tarefas (veja "ClickUp no jogo" no README principal). Sem ele, nada disso liga. Precisa de saída HTTPS para `api.clickup.com`. |
| `LEMONQUEST_CLICKUP_POLL_MIN` | `5` | Minutos entre leituras do ClickUp (1 a 60). |
| `LEMONQUEST_CLICKUP_TEAM` / `LEMONQUEST_CLICKUP_PURCHASES_LIST` | do código | Workspace e lista "Controle de Compras", se mudarem. |
| `NODE_ENV` | - | Use `production` (o `npm run start:fast` já define). |

No serviço, acrescente-as em `AppEnvironmentExtra` (ex.: `nssm set LemonQuest AppEnvironmentExtra NODE_ENV=production LEMONQUEST_BACKUP_DIR=D:\backups-lemonquest`). Lembre que esse comando **substitui** a lista inteira.

## 8. Backups e restauração

O servidor gera backups do banco automaticamente em `data\backups` (ou em `LEMONQUEST_BACKUP_DIR`). Recomendado: apontar para outro disco ou pasta sincronizada.

Para restaurar:

```powershell
C:\nssm\win64\nssm.exe stop LemonQuest
cd C:\lemonquest\data
copy backups\<ARQUIVO-DE-BACKUP>.db lemonquest.db
del lemonquest.db-wal, lemonquest.db-shm
C:\nssm\win64\nssm.exe start LemonQuest
```

(Se o `del` reclamar que os arquivos não existem, tudo bem. Guarde uma cópia do `lemonquest.db` antigo antes de sobrescrever.)

## 9. Problemas comuns

- **Servidor não sobe e pede para rodar `npm run build`**: falta `packages\client\dist`. Rode `npm run build` e inicie de novo.
- **Porta em uso (`EADDRINUSE`)**: outro programa (ou o serviço já rodando) usa a porta. Veja com `netstat -ano | findstr :2567`; encerre o processo ou mude `PORT`.
- **Funciona na própria máquina, mas não nos outros PCs**: firewall (rode `firewall.ps1`), rede classificada como Pública, ou IP errado (`ipconfig`). Teste a porta de outro PC: `Test-NetConnection 192.168.0.10 -Port 2567`.
- **Serviço não inicia**: veja `C:\lemonquest\logs\lemonquest.err.log`. Confirme que o caminho do `node.exe` está certo (`where node`) e que o Startup directory é `packages\server`.
- **Jogadores caem e voltam**: o cliente tenta reconectar sozinho por até ~20 s; se o servidor reiniciar, aparece "Você foi desconectado" com o botão "Voltar ao login".
- **"Muitas tentativas"** no login: aguardar alguns minutos.
