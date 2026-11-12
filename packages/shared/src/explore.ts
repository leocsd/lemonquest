/** Raio (Chebyshev, em tiles) revelado ao redor do jogador no minimapa. */
export const EXPLORE_RADIUS = 8;

/** Bitset de tiles explorados. Mesma lógica no servidor (autoridade/persistência) e no cliente (revelação imediata). */
export class ExploredMask {
  readonly bits: Uint8Array;

  constructor(readonly width: number, readonly height: number, bits?: Uint8Array) {
    const len = Math.ceil((width * height) / 8);
    if (bits && bits.length === len) {
      this.bits = bits;
    } else {
      this.bits = new Uint8Array(len);
      // Máscara menor (mapa cresceu para baixo, mesma largura): as linhas antigas continuam válidas → copia o prefixo.
      if (bits && bits.length < len) this.bits.set(bits);
    }
  }

  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /**
   * Revela um quadrado de raio r (cantos arredondados). Retorna quantos tiles novos foram revelados; `onNew` recebe o
   * índice (y × largura + x) de cada um (o servidor conta os alcançáveis sem varrer o mapa).
   */
  reveal(cx: number, cy: number, r = EXPLORE_RADIUS, onNew?: (i: number) => void): number {
    let added = 0;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r + r) continue;
        const i = y * this.width + x;
        const m = 1 << (i & 7);
        if ((this.bits[i >> 3] & m) === 0) { this.bits[i >> 3] |= m; added++; onNew?.(i); }
      }
    }
    return added;
  }

  toBase64(): string {
    let s = "";
    for (let i = 0; i < this.bits.length; i++) s += String.fromCharCode(this.bits[i]);
    return btoa(s);
  }

  /**
   * `storedWidth` = largura do mapa quando a máscara foi salva (se conhecida). Mapa mais largo (expansão a leste: as
   * coordenadas antigas não mudam) → as linhas antigas são copiadas para as novas posições; mais estreito → descarta;
   * mesma largura e máscara menor → aproveita o prefixo.
   */
  static fromBase64(width: number, height: number, b64: string | undefined, storedWidth?: number): ExploredMask {
    if (!b64 || (storedWidth !== undefined && storedWidth > width)) return new ExploredMask(width, height);
    try {
      const s = atob(b64);
      const bits = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i);
      if (storedWidth !== undefined && storedWidth > 0 && storedWidth < width) {
        const out = new ExploredMask(width, height);
        const oldH = Math.min(height, Math.floor((bits.length * 8) / storedWidth));
        for (let y = 0; y < oldH; y++) for (let x = 0; x < storedWidth; x++) {
          const i = y * storedWidth + x;
          if ((bits[i >> 3]! & (1 << (i & 7))) === 0) continue;
          const j = y * width + x;
          out.bits[j >> 3] |= 1 << (j & 7);
        }
        return out;
      }
      // Máscara maior que o mapa atual (mapa encolheu): não dá para reaproveitar com segurança.
      return new ExploredMask(width, height, bits.length <= Math.ceil((width * height) / 8) ? bits : undefined);
    } catch {
      return new ExploredMask(width, height);
    }
  }
}
