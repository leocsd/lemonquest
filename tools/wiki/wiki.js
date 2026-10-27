// JS das páginas da wiki (copiado para a saída como wiki.js; sem dependências): ordenação das tabelas e busca.
// A busca carrega search.js (o mesmo índice do search.json, como script, para funcionar também abrindo do disco) no
// primeiro uso e filtra sem acento: todas as palavras precisam aparecer; título exato/no começo vem primeiro.
(() => {
  const root = document.body.dataset.root || "";

  // --- tabelas ordenáveis (table[data-sortable]) ---------------------------------------------------------------------
  const num = (t) => {
    const m = t.replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };
  for (const tb of document.querySelectorAll("table[data-sortable]")) {
    tb.querySelectorAll("thead th").forEach((th, i) => {
      th.tabIndex = 0;
      th.title = "Ordenar";
      const key = (r) => {
        const c = r.cells[i];
        if (!c) return "";
        const d = c.dataset.sort ?? c.querySelector("[data-sort]")?.dataset.sort;
        if (d !== undefined) return parseFloat(d);
        const t = c.textContent.trim();
        const n = num(t);
        return isNaN(n) ? t : n;
      };
      const go = () => {
        const body = tb.tBodies[0];
        const dir = th.dataset.dir === "asc" ? -1 : 1;
        tb.querySelectorAll("thead th").forEach((x) => delete x.dataset.dir);
        th.dataset.dir = dir === 1 ? "asc" : "desc";
        const rows = [...body.rows].sort((a, b) => {
          const x = key(a), y = key(b);
          if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
          if (typeof x === "number") return -1;
          if (typeof y === "number") return 1;
          return String(x).localeCompare(String(y), "pt-BR") * dir;
        });
        for (const r of rows) body.appendChild(r);
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  // --- busca (todas as caixas .search da página dividem o índice) -------------------------------------------------------
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let index = null, loading = false;
  const waiting = [];
  const load = (cb) => {
    if (index) return cb?.();
    if (cb) waiting.push(cb);
    if (loading) return;
    loading = true;
    const s = document.createElement("script");
    s.src = root + "search.js";
    s.onload = () => {
      index = (window.WIKI_SEARCH || []).map((e) => ({ ...e, t: norm(e.title), x: norm(`${e.title} ${e.kind} ${e.text}`) }));
      for (const f of waiting.splice(0)) f();
    };
    document.head.appendChild(s);
  };

  const boxes = [...document.querySelectorAll(".search")];
  for (const wrap of boxes) {
    const box = wrap.querySelector("input"), out = wrap.querySelector(".results");
    if (!box || !out) continue;
    let sel = -1;
    const run = () => {
      const q = norm(box.value.trim());
      out.innerHTML = "";
      sel = -1;
      if (!q) { out.hidden = true; return; }
      if (!index) { load(run); return; }
      const toks = q.split(/\s+/);
      const hits = [];
      for (const e of index) {
        if (!toks.every((t) => e.x.includes(t))) continue;
        const score = e.t === q ? 4 : e.t.startsWith(q) ? 3 : toks.every((t) => e.t.includes(t)) ? 2 : 1;
        hits.push([score, e]);
      }
      hits.sort((a, b) => b[0] - a[0] || a[1].title.length - b[1].title.length || a[1].title.localeCompare(b[1].title, "pt-BR"));
      for (const [, e] of hits.slice(0, 20)) {
        const li = document.createElement("li"), a = document.createElement("a");
        a.href = root + e.href;
        const t = document.createElement("span"), k = document.createElement("small");
        t.textContent = e.title;
        k.textContent = e.kind;
        a.append(t, k);
        li.appendChild(a);
        out.appendChild(li);
      }
      if (!hits.length) {
        const li = document.createElement("li");
        li.className = "none";
        li.textContent = "Nada encontrado.";
        out.appendChild(li);
      }
      out.hidden = false;
    };
    const mark = (d) => {
      const as = [...out.querySelectorAll("a")];
      if (!as.length) return;
      sel = (sel + d + as.length) % as.length;
      as.forEach((a, i) => a.classList.toggle("sel", i === sel));
      as[sel].scrollIntoView({ block: "nearest" });
    };
    box.addEventListener("focus", () => load());
    box.addEventListener("input", run);
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); mark(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mark(-1); }
      else if (e.key === "Enter") { const a = out.querySelectorAll("a")[Math.max(0, sel)]; if (a) location.href = a.href; }
      else if (e.key === "Escape") { box.value = ""; run(); }
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) out.hidden = true; });
  }

  // "/" foca a busca (a maior da página, se houver mais de uma: a da página inicial).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || /input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
    const box = (boxes.find((b) => b.classList.contains("big")) ?? boxes[0])?.querySelector("input");
    if (box) { e.preventDefault(); box.focus(); }
  });
})();
