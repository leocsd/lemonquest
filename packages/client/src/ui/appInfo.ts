// Marca que o app de desktop (packages/desktop) deixa na página antes de cada carga: `window.__lemonApp`.
// O cliente só a lê para mostrar a versão e esconder o link de download; nenhuma regra de jogo depende dela.

export interface AppInfo {
  versao: string;
  so: string;
}

/** Página da Release mais nova no GitHub (instaladores de Windows, Mac e Linux). */
export const APP_DOWNLOAD_URL = "https://github.com/leocsd/lemonquest/releases/latest";

const NOMES_SO: Record<string, string> = { windows: "Windows", macos: "Mac", linux: "Linux" };

export function appInfo(w: unknown = globalThis): AppInfo | null {
  if (!w || typeof w !== "object") return null;
  const marca = (w as { __lemonApp?: unknown }).__lemonApp;
  if (!marca || typeof marca !== "object") return null;
  const { versao, so } = marca as { versao?: unknown; so?: unknown };
  if (typeof versao !== "string" || !versao) return null;
  return { versao, so: typeof so === "string" ? so : "" };
}

export function nomeDoSo(so: string): string {
  return NOMES_SO[so] ?? (so || "?");
}
