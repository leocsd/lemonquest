import { defineConfig } from "vitest/config";
// Metade dos núcleos (mínimo 1, máximo 4): o padrão usa todos e trava PCs comuns. VITEST_MAX_WORKERS sobrescreve.
import os from "node:os";
const workers = Number(process.env.VITEST_MAX_WORKERS) || Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));
// LEMONQUEST_DB em memória: um teste que chame getDb()/initDb() sem caminho (banco ainda não aberto) abria
// data/lemonquest.db, o save local — nunca apontar teste para data/ (CLAUDE.md). Teste que precisa de arquivo passa o caminho.
export default defineConfig({ test: { include: ["packages/*/src/**/*.test.ts"], passWithNoTests: true, maxWorkers: workers, env: { LEMONQUEST_LOGIN_BONUS: "0", LEMONQUEST_DB: ":memory:" } } });
