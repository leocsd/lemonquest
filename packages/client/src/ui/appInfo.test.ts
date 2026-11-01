import { describe, expect, it } from "vitest";
import { appInfo, nomeDoSo, APP_DOWNLOAD_URL } from "./appInfo.ts";

describe("appInfo", () => {
  it("sem marca (navegador comum) é null", () => {
    expect(appInfo({})).toBeNull();
    expect(appInfo(null)).toBeNull();
    expect(appInfo(undefined)).toBeNull();
  });

  it("lê versão e sistema da marca do app", () => {
    expect(appInfo({ __lemonApp: { versao: "0.1.0", so: "windows", url: "http://x/" } })).toEqual({ versao: "0.1.0", so: "windows" });
  });

  it("marca malformada é null; sistema ausente vira vazio", () => {
    expect(appInfo({ __lemonApp: "0.1.0" })).toBeNull();
    expect(appInfo({ __lemonApp: { so: "linux" } })).toBeNull();
    expect(appInfo({ __lemonApp: { versao: "" } })).toBeNull();
    expect(appInfo({ __lemonApp: { versao: "1.0.0" } })).toEqual({ versao: "1.0.0", so: "" });
  });

  it("nome do sistema para o jogador", () => {
    expect(nomeDoSo("windows")).toBe("Windows");
    expect(nomeDoSo("macos")).toBe("Mac");
    expect(nomeDoSo("linux")).toBe("Linux");
    expect(nomeDoSo("")).toBe("?");
    expect(nomeDoSo("freebsd")).toBe("freebsd");
  });

  it("link de download aponta para a Release mais nova", () => {
    expect(APP_DOWNLOAD_URL).toBe("https://github.com/leocsd/lemonquest/releases/latest");
  });
});
