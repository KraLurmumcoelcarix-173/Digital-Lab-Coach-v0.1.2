  /*# ───────────────────────────────────────────────────────────────────
  *#  Interface language. Loaded before app.js (and by kmap.html).
  *#  Translation is DOM-level: every text node, title / placeholder /
  *#  aria-label attribute and simple inline block is looked up in the
  *#  active pack by its English text, so app.js / l3.js / settings.js /
  *#  tutor.js keep their English strings and nothing else changes.
  *#  Packs live in /static/i18n/<lang>.js and call I18N.register().
  *#  Keys: exact English text; "{name}" placeholders make a pattern key;
  *#  "(s)" / "(es)" match an optional plural; keys with tags translate an
  *#  element's inner HTML as one unit. Anything not in the pack, and
  *#  anything under [data-i18n-skip], stays English (AI output, Digital
  *#  names, net ids, the manifest guide).
  *# ──────────────────────────────────────────────────────────────────#*/

(function () {
  "use strict";

  const LANGS = [
    ["en", "English"],
    ["zh-Hans", "简体中文"],
    ["zh-Hant", "繁體中文"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["vi", "Tiếng Việt"],
    ["my", "မြန်မာ"],
  ];
  const STORE_KEY = "dlc_lang";
  const ATTRS = ["title", "placeholder", "aria-label"];
  const NO_ATTR_TAGS = new Set(["SCRIPT", "STYLE"]);
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "IFRAME", "NOSCRIPT", "PRE", "svg", "SVG"]);
  const SIMPLE_TAGS = new Set(["B", "I", "EM", "STRONG", "CODE", "BR", "KBD", "SMALL", "SUB", "SUP", "U", "SPAN", "A",
                               "DIV", "P", "UL", "OL", "LI", "H1", "H2", "H3", "H4"]);
  const SKIP_SELECTOR = "[data-i18n-skip], .l2-flow-prose, .l2-sub-model, .l2-sub-rest, .l2-sub-role, .l3-prop-why, .l3-diag, .gd-why, .flag-quote";

  const packs = {};
  let lang = "en";
  let active = null;
  const textOrig = new WeakMap(), textDone = new WeakMap();
  const htmlOrig = new WeakMap(), htmlDone = new WeakMap();
  const attrOrig = new WeakMap(), attrDone = new WeakMap();
  const tracked = new Set();
  const tpl = document.createElement("template");

  function readLang() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v && LANGS.some((l) => l[0] === v)) return v;
    } catch (e) {}
    return "en";
  }

  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function normHtml(s) { tpl.innerHTML = s; return norm(tpl.innerHTML); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function compilePattern(key, value) {
    const names = [];
    let re = escapeRe(key).replace(/\\\{(\w+)\\\}/g, (_m, n) => { names.push(n); return "([\\s\\S]+?)"; });
    re = re.replace(/\\\(es\\\)/g, "(?:es)?").replace(/\\\(s\\\)/g, "s?");
    const lit = key.replace(/\{\w+\}/g, "").length;
    return { re: new RegExp("^" + re + "$"), names, value, lit };
  }

  function compile(raw) {
    const out = { text: new Map(), textPat: [], html: new Map(), htmlPat: [], css: raw.css || "" };
    const table = raw.strings || raw;
    for (const key of Object.keys(table)) {
      const value = table[key];
      if (typeof value !== "string") continue;
      const isHtml = /<[a-z][^>]*>/i.test(key);
      const isPat = /\{\w+\}/.test(key) || /\((?:e?s)\)/.test(key);
      if (isHtml) {
        const k = normHtml(key);
        if (isPat) out.htmlPat.push(compilePattern(k, value)); else out.html.set(k, value);
      } else {
        const k = norm(key);
        if (isPat) out.textPat.push(compilePattern(k, value)); else out.text.set(k, value);
      }
    }
    const bySpecificity = (a, b) => b.lit - a.lit;
    out.textPat.sort(bySpecificity);
    out.htmlPat.sort(bySpecificity);
    return out;
  }

  function nested(s, depth) {
    if (depth > 2 || !s || s.includes("<") || !/[A-Za-z]/.test(s)) return s;
    const key = norm(s);
    const hit = lookup(active.text, active.textPat, key, depth);
    if (hit != null) return hit;
    if (key.includes("; ")) {
      let any = false;
      const parts = key.split("; ").map((p) => {
        const h = lookup(active.text, active.textPat, p, depth);
        if (h != null) { any = true; return h; }
        return p;
      });
      if (any) return parts.join("; ");
    }
    return s;
  }

  function fill(pat, m, depth) {
    const vals = {};
    pat.names.forEach((n, i) => { if (!(n in vals)) vals[n] = nested(m[i + 1], depth + 1); });
    return pat.value.replace(/\{(\w+)\}/g, (_x, n) => (n in vals ? vals[n] : "{" + n + "}"));
  }

  function lookup(map, pats, key, depth) {
    if (!active) return null;
    const hit = map.get(key);
    if (hit != null) return hit;
    for (const p of pats) {
      const m = p.re.exec(key);
      if (m) return fill(p, m, depth || 0);
    }
    return null;
  }

  function translateString(s) {
    if (!active || typeof s !== "string") return null;
    const key = norm(s);
    if (!key || !/[A-Za-z]/.test(key) || key.length > 4000) return null;
    return lookup(active.text, active.textPat, key, 0);
  }

  function isSkipped(el) {
    return !!(el && el.closest && el.closest(SKIP_SELECTOR));
  }

  function translateText(node) {
    if (!active) return;
    const raw = node.data;
    if (textDone.get(node) === raw) return;
    if (!/[A-Za-z]/.test(raw)) return;
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName) || isSkipped(parent)) return;
    const key = norm(raw);
    if (!key) return;
    const tr = lookup(active.text, active.textPat, key, 0);
    if (tr == null) return;
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    if (!textOrig.has(node)) textOrig.set(node, raw);
    const out = lead + tr + trail;
    node.data = out;
    textDone.set(node, out);
    tracked.add(node);
  }

  function simpleOnly(el, depth) {
    for (const c of el.childNodes) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1) return false;
      if (!SIMPLE_TAGS.has(c.tagName) || c.id || depth > 4) return false;
      if (!simpleOnly(c, depth + 1)) return false;
    }
    return true;
  }

  function originalHtml(el) {
    const clone = el.cloneNode(true);
    const a = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const b = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let x, y;
    while ((x = a.nextNode()) && (y = b.nextNode())) {
      if (x.nodeType === 3) {
        if (textOrig.has(x) && x.data === textDone.get(x)) y.data = textOrig.get(x);
      } else {
        const o = attrOrig.get(x), d = attrDone.get(x);
        if (o) for (const n of Object.keys(o)) if (d && x.getAttribute(n) === d[n]) y.setAttribute(n, o[n]);
      }
    }
    return clone.innerHTML;
  }

  function translateHtml(el) {
    if (!active || !el.childNodes.length) return false;
    if (!(active.html.size || active.htmlPat.length)) return false;
    const cur = el.innerHTML;
    if (htmlDone.get(el) === cur) return true;
    if (!/[A-Za-z]/.test(cur) || cur.length > 6000) return false;
    if (!simpleOnly(el, 0)) return false;
    const orig = originalHtml(el);
    const tr = lookup(active.html, active.htmlPat, norm(orig), 0);
    if (tr == null) return false;
    htmlOrig.set(el, orig);
    el.innerHTML = tr;
    htmlDone.set(el, el.innerHTML);
    tracked.add(el);
    return true;
  }

  function translateAttr(el, name) {
    if (!active || !el.hasAttribute(name)) return;
    const raw = el.getAttribute(name);
    const done = attrDone.get(el);
    if (done && done[name] === raw) return;
    const tr = translateString(raw);
    if (tr == null) return;
    let orig = attrOrig.get(el);
    if (!orig) { orig = {}; attrOrig.set(el, orig); }
    if (!(name in orig)) orig[name] = raw;
    el.setAttribute(name, tr);
    let d = attrDone.get(el);
    if (!d) { d = {}; attrDone.set(el, d); }
    d[name] = tr;
    tracked.add(el);
  }

  function translateSubtree(node) {
    if (!active) return;
    if (node.nodeType === 3) { translateText(node); return; }
    if (node.nodeType !== 1) return;
    const el = node;
    if (NO_ATTR_TAGS.has(el.tagName)) return;
    if (el.matches && el.matches(SKIP_SELECTOR)) return;
    for (const a of ATTRS) if (el.hasAttribute(a)) translateAttr(el, a);
    if (SKIP_TAGS.has(el.tagName)) return;
    if (translateHtml(el)) return;
    const kids = Array.from(el.childNodes);
    for (const c of kids) {
      if (c.nodeType === 3) translateText(c);
      else if (c.nodeType === 1) translateSubtree(c);
    }
  }

  function restoreAll() {
    for (const n of Array.from(tracked)) {
      if (!n.isConnected) { tracked.delete(n); continue; }
      if (n.nodeType === 3) {
        if (textOrig.has(n) && n.data === textDone.get(n)) n.data = textOrig.get(n);
        textOrig.delete(n); textDone.delete(n);
      } else {
        if (htmlOrig.has(n) && n.innerHTML === htmlDone.get(n)) n.innerHTML = htmlOrig.get(n);
        htmlOrig.delete(n); htmlDone.delete(n);
        const orig = attrOrig.get(n), done = attrDone.get(n);
        if (orig) {
          for (const a of Object.keys(orig)) {
            if (done && n.getAttribute(a) === done[a]) n.setAttribute(a, orig[a]);
          }
        }
        attrOrig.delete(n); attrDone.delete(n);
      }
      tracked.delete(n);
    }
  }

  function applyCss() {
    let st = document.getElementById("i18n-css");
    const css = active && active.css ? active.css : "";
    if (!css) { if (st) st.remove(); return; }
    if (!st) {
      st = document.createElement("style");
      st.id = "i18n-css";
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = css;
  }

  function applyAll() {
    if (document.body) translateSubtree(document.body);
    document.documentElement.setAttribute("lang", lang);
    applyCss();
  }

  const observer = new MutationObserver((records) => {
    if (!active) return;
    for (const r of records) {
      if (r.type === "childList") {
        if (!r.addedNodes.length) continue;
        const target = r.target;
        if (target.nodeType === 1 && (isSkipped(target) || SKIP_TAGS.has(target.tagName))) continue;
        if (target.nodeType === 1 && translateHtml(target)) continue;
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 3) translateText(n);
          else if (n.nodeType === 1) translateSubtree(n);
        });
      } else if (r.type === "characterData") {
        if (r.target.nodeType === 3) translateText(r.target);
      } else if (r.type === "attributes") {
        if (r.target.nodeType === 1 && !isSkipped(r.target)) translateAttr(r.target, r.attributeName);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });

  function packUrl(code) { return "/static/i18n/" + code + ".js"; }

  function loadPack(code, cb) {
    if (packs[code]) { cb(true); return; }
    const s = document.createElement("script");
    s.src = packUrl(code);
    s.onload = () => cb(!!packs[code]);
    s.onerror = () => cb(false);
    document.head.appendChild(s);
  }

  function activate(code) {
    lang = code;
    active = code === "en" ? null : (packs[code] || null);
    applyAll();
    const sel = document.getElementById("lang-select");
    if (sel && sel.value !== code) sel.value = code;
    const frame = document.getElementById("kmap-frame");
    try {
      if (frame && frame.contentWindow && frame.contentWindow.I18N) frame.contentWindow.I18N.set(code);
    } catch (e) {}
  }

  function set(code) {
    if (!LANGS.some((l) => l[0] === code)) code = "en";
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
    restoreAll();
    if (code === "en" || packs[code]) { activate(code); return; }
    loadPack(code, (ok) => activate(ok ? code : "en"));
  }

  function register(code, pack) {
    packs[code] = compile(pack || {});
    if (code === lang) { active = packs[code]; applyAll(); }
  }

  function wireSelect() {
    const sel = document.getElementById("lang-select");
    if (!sel) return;
    sel.setAttribute("data-i18n-skip", "1");
    sel.innerHTML = LANGS.map(([code, name]) =>
      `<option value="${code}">${name}</option>`).join("");
    sel.disabled = false;
    sel.value = lang;
    sel.addEventListener("change", () => {
      const code = sel.value;
      set(code);
      if (typeof logEvent === "function") {
        try { logEvent("settings_language", { lang: code }); } catch (e) {}
      }
    });
  }

  lang = readLang();
  if (lang !== "en") {
    document.write('<script src="' + packUrl(lang) + '"><\/script>');
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (lang !== "en" && !packs[lang]) {
      loadPack(lang, (ok) => activate(ok ? lang : "en"));
    } else {
      applyAll();
    }
    wireSelect();
  });

  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  const nativePrompt = window.prompt.bind(window);
  window.confirm = (m) => nativeConfirm(translateString(m) ?? m);
  window.alert = (m) => nativeAlert(translateString(m) ?? m);
  window.prompt = (m, d) => nativePrompt(translateString(m) ?? m, d);

  window.I18N = {
    LANGS,
    register,
    set,
    get lang() { return lang; },
    t: (s) => translateString(s) ?? s,
    refresh: applyAll,
  };
})();
