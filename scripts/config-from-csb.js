/* Last Horizon Transfer — génère une configuration Manhwa Sheet à partir du template de fiche CSB (fiche-manhwa)
 * Source : l'acteur `_template` (system.header / system.body) + les valeurs réellement utilisées par les objets du fichier.
 * Produit les parties : stats, resources, ranks, awakening, identity, rarities, elements, costs, ranges, executions.
 * L'arbre des catégories d'objets et le reste de la config (mode, jauges, XP…) ne sont pas touchés.
 */

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const slug = (s) => norm(s).replace(/\+/g, "_plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";
const blank = (v) => v === undefined || v === null || v === "" || v === "—" || v === "-" || v === "???";

const PALETTE = ["#ff4d5e", "#38e0ff", "#5aff9a", "#7ad7ff", "#ffd070", "#ff8af0", "#b980ff", "#c9f06a", "#ffa94d", "#6ef0d8", "#ff6a3d", "#9ad0ff"];
const RANK_COLORS = { F: "#8e98b0", E: "#9aaac8", D: "#5aa6f0", C: "#20d8f8", B: "#b46bff", A: "#34d46e", S: "#f5c842", SS: "#ff7a2a", SSS: "#ff3b6b" };
const STAT_ICONS = { force: "fa-hand-fist", constitution: "fa-shield-halved", vigueur: "fa-heart-pulse", mobilite: "fa-person-running", precision: "fa-bullseye", dexterite: "fa-hand", intelligence: "fa-brain", volonte: "fa-fire", magie: "fa-wand-sparkles", perception: "fa-eye", instinct: "fa-paw", aura: "fa-sun", chance: "fa-clover", mana: "fa-droplet", endurance: "fa-bolt" };
const RES_ICONS = { gold: ["fa-coins", "#ffd070"], pi: ["fa-star", "#38a8ff"], pointsw: ["fa-gem", "#b980ff"] };
/* ordres canoniques (FR) pour les listes reconstruites depuis les objets */
const ORDER = {
  rarities: ["ordinaire", "commun", "commun+", "peu commun", "rare", "tres rare", "epique", "legendaire", "mythique", "unique", "divin"],
  elements: ["neutre", "feu", "eau", "terre", "vent", "air", "foudre", "glace", "lumiere", "tenebres", "ombre", "nature", "poison", "psychique", "espace", "temps"],
  costs: ["aucun", "tres faible", "faible", "moyen", "eleve", "tres eleve", "extreme"],
  ranges: ["sur soi", "contact", "melee", "courte", "moyenne", "longue", "tres longue", "zone", "illimitee"],
  executions: ["aucun", "instantane", "rapide", "action", "lent", "tres lent", "canalise", "reaction", "passif"]
};
const RARITY_COLORS = ["#9aaac8", "#b8c4dc", "#34d46e", "#5aa6f0", "#20d8f8", "#b46bff", "#f5c842", "#ff7a2a", "#ff3b6b", "#ffffff"];

/* ── parcours du template CSB ── */
function* walk(o) {
  if (Array.isArray(o)) { for (const v of o) yield* walk(v); return; }
  if (!o || typeof o !== "object") return;
  if (o.type) yield o;
  for (const k of ["contents", "tabs", "rows", "cols", "columns", "children", "items"]) if (o[k]) yield* walk(o[k]);
}
const leaves = (node) => [...walk(node)].filter((c) => ["textField", "numberField", "textArea", "select", "checkbox"].includes(c.type) && c.key);
const findKey = (root, key) => [...walk(root)].find((c) => c.key === key);
const findTab = (root, keyOrName) => [...walk(root)].find((c) => c.type === "tab" && (c.key === keyOrName || norm(c.name) === norm(keyOrName)));
const optLabel = (o) => (o && typeof o === "object") ? String(o.value ?? o.key ?? "") : String(o ?? "");
const optKey = (o) => (o && typeof o === "object") ? String(o.key ?? o.value ?? "") : String(o ?? "");

export function findCsbTemplate(data) {
  return (data.documents?.Actor ?? []).find((a) => a.type === "_template" && a.system?.body) ?? null;
}

/* Les conteneurs d'objets de la fiche : clé → ids de templates d'objets (pour classer les objets sans leurs templates) */
export function csbContainers(tpl) {
  const out = {};
  for (const c of walk(tpl?.system?.body ?? [])) if (c.type === "itemContainer" && c.key) out[c.key] = Array.isArray(c.templateFilter) ? c.templateFilter : [];
  return out;
}

/* ------------------------------------------------------------------ */

export function buildConfigFromCsb(data, current) {
  const tpl = findCsbTemplate(data);
  if (!tpl) return null;
  const header = tpl.system.header ?? [], body = tpl.system.body ?? [];
  const cfg = {};
  const notes = [];

  /* stats : champs numériques de l'onglet Statistiques */
  const statsTab = findTab(body, "tab_stats") ?? findTab(body, "Statistiques");
  const statFields = statsTab ? leaves(statsTab).filter((f) => f.type === "numberField") : [];
  cfg.stats = statFields.map((f, i) => ({
    key: f.key, name: f.label || f.key, abbr: norm(f.label || f.key).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase(),
    icon: STAT_ICONS[norm(f.key)] ?? "fa-star", color: PALETTE[i % PALETTE.length],
    min: Math.max(0, Number(f.defaultValue ?? f.minVal ?? 1) || 0), max: 99, costMult: 1, locked: false
  }));
  if (!cfg.stats.length) { delete cfg.stats; notes.push("Onglet Statistiques introuvable : stats non générées."); }

  /* monnaies : champs numériques de l'en-tête (hors niveau) */
  const headerNums = leaves(header).filter((f) => f.type === "numberField" && f.key !== "niveau");
  cfg.resources = headerNums.map((f) => {
    const [icon, color] = RES_ICONS[norm(f.key).replace(/[^a-z]/g, "")] ?? ["fa-coins", "#ffd070"];
    return { key: f.key, name: f.label || f.key, icon, color, start: Number(f.defaultValue) || 0, min: Number(f.minVal) || 0, inHeader: true, paysStats: norm(f.key) === "gold" };
  });
  if (!cfg.resources.length) { delete cfg.resources; notes.push("Aucune monnaie trouvée dans l'en-tête."); }

  /* rangs */
  const rang = findKey(header, "rang") ?? findKey(body, "rang");
  if (rang?.options?.length) cfg.ranks = rang.options.map((o) => ({ key: optKey(o), name: optLabel(o), color: RANK_COLORS[optKey(o).toUpperCase()] ?? "#9aaac8" }));
  else notes.push("Menu « rang » introuvable : rangs non générés.");

  /* mondes → origines */
  const monde = findKey(header, "monde") ?? findKey(body, "monde");
  // mondes : volontairement non repris en origines (champ Monde non voulu sur la fiche) ; la liste reste disponible ici si besoin
  void monde;

  /* éveil : valeurs distinctes de « classe » dans les personnages (défaut du template en premier) */
  const classe = findKey(header, "classe") ?? findKey(body, "classe");
  const seen = new Map();
  const def = classe?.defaultValue; if (!blank(def)) seen.set(norm(def), String(def));
  for (const a of data.documents?.Actor ?? []) { const v = a.system?.props?.classe; if (!blank(v) && !seen.has(norm(v))) seen.set(norm(v), String(v)); }
  if (seen.size) cfg.awakening = [...seen.values()].map((name, i) => ({ key: slug(name), name, color: ["#8ea0c8", "#38a8ff", "#ffd070", "#ff8af0", "#5aff9a", "#ff4d5e"][i % 6], anim: i === 0 ? "none" : i === 1 ? "pulse" : "aura" }));

  /* identité : sous-onglets de l'onglet Identité */
  const idTab = findTab(body, "tab_identite") ?? findTab(body, "Identité");
  if (idTab) {
    const subTabs = [...walk(idTab)].filter((c) => c.type === "tab" && c !== idTab);
    const sections = subTabs.length ? subTabs : [idTab];
    cfg.identity = sections.map((t) => ({
      key: t.key, name: String(t.name || t.key).replace(/^\d+\.\s*/, ""),
      fields: leaves(t).map((f) => {
        const kind = f.type === "textArea" ? "rich" : f.type === "select" ? "select" : "short";
        const o = { key: f.key, label: f.label || f.key, kind };
        if (kind === "select") o.options = (f.options || []).map(optLabel);
        return o;
      })
    })).filter((s) => s.fields.length);
  } else notes.push("Onglet Identité introuvable : sections d'identité non générées.");

  /* listes d'objets : valeurs réellement utilisées (objets du monde + objets des acteurs) */
  const items = [...(data.documents?.Item ?? []), ...(data.documents?.Actor ?? []).flatMap((a) => a.items ?? [])].filter((i) => i.type === "equippableItem");
  const collect = (prop) => { const m = new Map(); for (const it of items) { const v = it.system?.props?.[prop]; if (!blank(v) && !m.has(norm(v))) m.set(norm(v), String(v)); } return m; };
  const listFrom = (prop, name, colors) => {
    const m = collect(prop); if (!m.size) return;
    const order = ORDER[name]; const keys = [...m.keys()].sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b); });
    cfg[name] = keys.map((k, i) => { const e = { key: slug(m.get(k)), name: m.get(k) }; if (colors) e.color = colors[Math.min(i, colors.length - 1)]; return e; });
  };
  listFrom("rarete", "rarities", RARITY_COLORS);
  listFrom("element", "elements", ["#8ea0c8", "#ff6a3d", "#38a8ff", "#c9a06a", "#8fe3c8", "#ffe066", "#fff1b8", "#9b6bff", "#b980ff", "#5aff9a", "#c9f06a", "#ff8af0", "#7ad7ff", "#ffd070"]);
  listFrom("cout", "costs"); listFrom("portee", "ranges"); listFrom("execution", "executions");
  if (!cfg.rarities) notes.push("Aucun objet dans le fichier : raretés / éléments / coûts / portées / exécutions non générés (coche « Objets » et « Acteurs » à l'export).");

  /* progression : la monnaie qui paie les stats */
  if (cfg.resources?.some((r) => r.paysStats)) cfg.progression = { payWith: cfg.resources.find((r) => r.paysStats).key };

  return { cfg, notes, templateName: tpl.name };
}

/* Fusionne sur la config courante : les listes générées remplacent les listes courantes. */
export function mergeConfig(current, generated) {
  const out = foundry.utils.deepClone(current);
  for (const [k, v] of Object.entries(generated)) {
    if (k === "progression") out.progression = { ...(out.progression ?? {}), ...v };
    else out[k] = foundry.utils.deepClone(v);
  }
  return out;
}

/* Sauvegarde dans configBackups (même forme que Manhwa Sheet) puis applique. */
export async function applyConfig(cfg, reason = "last-horizon-transfer") {
  const SYS = "manhwa-sheet";
  const raw = game.settings.get(SYS, "config");
  if (raw && Object.keys(raw).length && game.settings.settings.has(`${SYS}.configBackups`)) {
    const list = game.settings.get(SYS, "configBackups") || [];
    list.push({ at: Date.now(), version: raw.configVersion || 1, reason, system: game.system.version, cfg: foundry.utils.deepClone(raw) });
    while (list.length > 8) list.shift();
    await game.settings.set(SYS, "configBackups", list);
  }
  await game.settings.set(SYS, "config", cfg);
}
