/* Last Horizon Transfer — conversion Custom System Builder (fiche-manhwa) → Manhwa Sheet
 * Lit la configuration RÉELLE du monde de destination (MANHWA.config()) : stats, monnaies, rangs,
 * raretés, éléments, coûts, portées, exécutions, arbre des objets, identité. Tout ce qui ne trouve
 * pas de correspondance est compté dans le rapport et reste dans flags.last-horizon-transfer.source.
 */

import { findCsbTemplate, csbContainers } from "./config-from-csb.js";

export const CSB_ID = "custom-system-builder";
export const MS_ID = "manhwa-sheet";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
const num = (v, d = 0) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : d; };
const blank = (v) => v === undefined || v === null || v === "" || v === "—" || v === "-" || v === "???";

/* ── dictionnaires FR (CSB / fiche-manhwa) → clés par défaut de Manhwa Sheet ── */
const STAT_DICT = {
  force: "str", mobilite: "agi", agilite: "agi", dexterite: "dex", vigueur: "vit", constitution: "con", endurance: "vit",
  intelligence: "int", perception: "per", volonte: "wil", magie: "mana", mana: "mana", chance: "luck", instinct: "ins", precision: "acc", aura: "aura"
};
const RES_DICT = { gold: "coins", or: "coins", coins: "coins", pi: "pi", pointsw: "pointsW", points_w: "pointsW", pointsW: "pointsW" };
const RARITY_DICT = { ordinaire: "common", commun: "common", "commun+": "uncommon", "peu commun": "uncommon", rare: "rare", "tres rare": "epic", epique: "epic", legendaire: "legendary", mythique: "mythic", unique: "mythic" };
const ELEMENT_DICT = { neutre: "none", aucun: "none", feu: "fire", eau: "water", terre: "earth", vent: "wind", air: "wind", foudre: "lightning", lumiere: "light", tenebres: "dark", ombre: "dark" };
const COST_DICT = { aucun: "none", "tres faible": "low", faible: "low", moyen: "medium", moyenne: "medium", eleve: "high", haut: "high", extreme: "extreme", "tres eleve": "extreme" };
const RANGE_DICT = { "sur soi": "self", soi: "self", melee: "melee", "corps a corps": "melee", courte: "short", moyenne: "medium", longue: "long", illimitee: "long", zone: "area" };
const EXEC_DICT = { instantane: "instant", action: "action", canalise: "channeled", reaction: "reaction", passif: "passive" };
const AWAKE_DICT = { "non eveille": "unawakened", eveille: "awakened", transcende: "transcended" };

/* identité : clé CSB → section.champ (défauts Manhwa Sheet) */
const IDENTITY_DICT = {
  age: "personal.age", lateralite: "personal.hand", race: "personal.race", taille: "personal.height", faction: "personal.faction", affiliation: "personal.affiliation",
  personnel: "personal.personal", background: "personal.background",
  corpulence: "physique.build", peau: "physique.skin", cheveux: "physique.hair", yeux: "physique.eyes", vision: "physique.vision", sante: "physique.health", signes: "physique.marks",
  tenue: "appearance.clothes", bijoux: "appearance.jewelry", coiffure: "appearance.hairstyle", tatouage: "appearance.tattoos", maquillage: "appearance.makeup",
  parents_noms: "family.parents", parents_situation: "family.parentsStatus", parents_profession: "family.parentsJobs", fratrie: "family.siblings",
  rel_parents: "family.relParents", rel_fratrie: "family.relSiblings", famille_autres: "family.others", animaux: "family.pets",
  horaires: "daily.schedule", deplacements: "daily.transport", logement: "daily.housing", habitudes: "daily.habits", expressions: "daily.sayings", plats: "daily.food",
  alimentation: "daily.diet", aime_quotidien: "daily.likes", deteste_quotidien: "daily.dislikes", sports: "daily.sports", technologie: "daily.tech", langues: "daily.languages", comportement: "daily.public",
  meilleur_ami: "relations.bestFriend", autres_amis: "relations.friends", rel_amis: "relations.relFriends",
  qualites: "personality.qualities", defauts: "personality.flaws", religion: "personality.religion", opinion: "personality.politics", desir: "personality.desire",
  succes: "personality.successes", echecs: "personality.failures", espoirs: "personality.hopes", peurs: "personality.fears", details_perso: "personality.details",
  aime_bien: "personality.likesPlus", aime_moins: "personality.likesMinus"
};
const HAND_DICT = { droitier: "Right", gaucher: "Left", ambidextre: "Ambidextrous" };

/* templates fiche-manhwa (flags.fiche-manhwa.key ou nom) → racine de l'arbre des objets + famille par défaut */
const TEMPLATE_ROOTS = [
  [/competence.?combat|comp.?combat/, "skill", "skill_body_and_combat"],
  [/competence.?sort|comp.?sort|magie/, "skill", "skill_magic_and_occult"],
  [/competence.?passif|passif/, "skill", "skill_body_and_combat"],
  [/competence.?divers|comp.?divers|systeme/, "skill", "skill_system_and_society"],
  [/competence|skill/, "skill", ""],
  [/titre|title/, "title", "title_achievement"],
  [/arme|weapon/, "weapon", ""],
  [/armure|armor/, "armor", "armor_armors"],
  [/accessoire|accessory/, "armor", "armor_clothing_and_pieces"],
  [/consommable|consumable|munition|ammo/, "items", "item_survival_and_daily"],
  [/sac|bag/, "bags", "bags_backpack"],
  [/vehicule|vehicle/, "vehicle", "vehicle_land"],
  [/compagnon|companion/, "companion", "companion_animal"],
  [/propriete|property/, "property", "property_housing"],
  [/loot|objet|item|divers/, "items", ""]
];
/* conteneurs de la fiche CSB (clé itemContainer) → racine + famille */
const CONTAINER_ROOTS = [
  [/competence_combat/, "skill", "skill_body_and_combat"], [/competence_sort/, "skill", "skill_magic_and_occult"], [/competence_passif/, "skill", "skill_passive"],
  [/competence_divers/, "skill", "skill_system_and_society"], [/competence/, "skill", ""], [/titre/, "title", "title_achievement"],
  [/inventaire_armes|arme/, "weapon", ""], [/inventaire_armures|armure/, "armor", ""], [/inventaire_consommables|consommable/, "items", "item_survival_and_daily"],
  [/inventaire_sacs|sac/, "bags", ""], [/inventaire_vehicules|vehicule/, "vehicle", ""], [/inventaire_compagnons|compagnon/, "companion", ""],
  [/inventaire_proprietes|propriete/, "property", ""], [/inventaire_divers|divers|loot/, "items", ""]
];
/* repli : ids des templates d'objets de la fiche « Fiche Manhwa » de Bastien (exportée le 10/10/2026) */
const KNOWN_TEMPLATES = {
  ofR4Rtgnve4cNVNa: "inventaire_armes", qAfpvThtXNP6Az5p: "inventaire_armures", oJT6CqaJc5EWTBO9: "inventaire_armures",
  zolKQqSFrssxcooO: "inventaire_consommables", sGBvtfNBbsGGCj14: "inventaire_consommables", rCttBTUYL1KEPRZD: "inventaire_divers",
  L6vTVJ4Fwv4uh0dR: "inventaire_vehicules", cDUTEs6EsLORrvUG: "inventaire_compagnons", uxkgrtZ6XGbwtVXh: "inventaire_proprietes", PFX5dEpRsS4RsDWF: "inventaire_sacs",
  d8t6pQEpBOyCaJHo: "competence_combat", J7AAkUJWTVy3Zxmi: "competence_sort", ViGGcpEUPel4J1uk: "competence_passif", cYrxXNA1C4I9GsAJ: "competence_divers", Qusmnralm3aIrrpo: "titres"
};

/* props.type d'un objet CSB (FR) → nom de catégorie Manhwa Sheet (EN par défaut, pour l'arbre non traduit) */
const TYPE_DICT = {
  epee: "Sword", dague: "Dagger", hache: "Axe", faux: "Scythe", sabre: "Saber", katana: "Katana", machette: "Machete", cimeterre: "Scimitar", claymore: "Claymore", espadon: "Greatsword",
  lance: "Spear", hallebarde: "Halberd", pique: "Pike", trident: "Trident", masse: "Mace", baton: "Staff", marteau: "Hammer", gourdin: "Club", fouet: "Whip", chaine: "Chain", griffes: "Claws",
  arc: "Bow", arbalete: "Crossbow", pistolet: "Pistol", fusil: "Rifle", bottes: "Boots", casque: "Helmet", gants: "Gloves", cape: "Cloak", anneau: "Ring", collier: "Necklace", amulette: "Amulet",
  potion: "Potion", antidote: "Antidote", elixir: "Elixir", nourriture: "Food", bibelot: "Trinket", babiole: "Trinket", exploit: "Achievement", boutique: "Shop", faction: "Faction",
  actif: "Active", passif: "Passive", systeme: "System", sort: "Spell"
};

/* ------------------------------------------------------------------ */

export function csbConvertible(data) {
  return data?.system?.id === CSB_ID && game.system.id === MS_ID && typeof globalThis.MANHWA?.config === "function";
}

function targetConfig() { return globalThis.MANHWA.config(); }

/* Trouve une entrée de liste de la config ({key,name}) pour une valeur brute. */
function matchList(list, raw, dict = {}) {
  if (blank(raw)) return "";
  const n = norm(raw);
  const hit = (list || []).find((e) => norm(e.key) === n || norm(e.name) === n);
  if (hit) return hit.key;
  const dk = dict[n];
  if (dk && (list || []).some((e) => e.key === dk)) return dk;
  if (dk) { const byName = (list || []).find((e) => norm(e.name) === norm(dk)); if (byName) return byName.key; }
  return null; // inconnu
}

/* Clés CSB candidates pour stats / monnaies, avec compteurs */
function scanActors(actors) {
  const keys = {};
  for (const a of actors) {
    if (a.type !== "character") continue;
    for (const [k, v] of Object.entries(a.system?.props ?? {})) {
      if (typeof v === "object" || IDENTITY_DICT[k]) continue;
      if (["classe", "rang", "monde", "niveau", "constellation", "titreEquipe"].includes(k)) continue;
      if (!/^-?\d+([.,]\d+)?$/.test(String(v).trim()) && !(k in STAT_DICT) && !(norm(k) in RES_DICT)) continue;
      keys[k] = (keys[k] ?? 0) + 1;
    }
  }
  return keys;
}

/* ── UI : table de correspondance stats / monnaies ── */
export function csbMappingHTML(data) {
  const cfg = targetConfig();
  const esc = foundry.utils.escapeHTML;
  const keys = scanActors(data.documents.Actor ?? []);
  const targets = [
    ...cfg.stats.map((s) => ({ v: `stat:${s.key}`, l: `Stat · ${s.name}` })),
    ...cfg.resources.map((r) => ({ v: `res:${r.key}`, l: `Monnaie · ${r.name}` }))
  ];
  const guess = (k) => {
    const n = norm(k);
    const st = cfg.stats.find((s) => norm(s.key) === n || norm(s.name) === n || (STAT_DICT[n] && s.key === STAT_DICT[n]) || norm(s.abbr) === n);
    if (st) return `stat:${st.key}`;
    const rs = cfg.resources.find((r) => norm(r.key) === n || norm(r.name) === n || (RES_DICT[n] && r.key === RES_DICT[n]) || norm(r.name).replace(/ /g, "") === n.replace(/ /g, ""));
    if (rs) return `res:${rs.key}`;
    return "";
  };
  const rows = Object.entries(keys).sort().map(([k, n]) => {
    const g = guess(k);
    const opts = [`<option value="" ${g ? "" : "selected"}>— ignorer —</option>`, ...targets.map((t) => `<option value="${t.v}" ${t.v === g ? "selected" : ""}>${esc(t.l)}</option>`)].join("");
    return `<div class="lht-map"><span class="lht-map-src"><code>${esc(k)}</code><span class="lht-count">${n}</span></span><i class="fa-solid fa-arrow-right"></i><select name="csb:${esc(k)}">${opts}</select></div>`;
  }).join("");
  const nTpl = (data.documents.Item ?? []).filter((i) => i.type === "_equippableItemTemplate").length;
  return `<h3>Conversion CSB → Manhwa Sheet</h3>
    <label class="lht-row lht-full"><input type="checkbox" name="csbConvert" checked>
      <span>Convertir les fiches et objets CSB vers les champs Manhwa Sheet (niveau, rang, éveil, stats, monnaies, identité, titre équipé ; objets : catégorie, rang, rareté, quantité, valeur, élément, coût, portée, exécution, description, lore)</span></label>
    <p class="lht-muted">Correspondance des valeurs numériques de la fiche CSB avec les stats et monnaies <b>de cette partie</b> (préremplie, à vérifier). ${nTpl ? `${nTpl} template(s) d'objets CSB trouvés dans le fichier pour classer les objets.` : "<b>Aucun template d'objet CSB dans le fichier</b> (coche « Objets » à l'export) : les objets iront dans la racine « Objets »."}</p>
    <div class="lht-maps">${rows || "<em class='lht-muted'>Aucune valeur numérique trouvée.</em>"}</div>`;
}

export function readCsbMapping(form) {
  const map = {};
  for (const sel of form.querySelectorAll("select[name^='csb:']")) { const k = sel.name.slice(4); if (sel.value) map[k] = sel.value; }
  return { convert: form.querySelector("input[name=csbConvert]")?.checked ?? false, map };
}

/* ------------------------------------------------------------------ */
/*  Contexte de conversion (une fois par import)                        */
/* ------------------------------------------------------------------ */

export function csbContext(data, mapping) {
  const cfg = targetConfig();
  const templates = {};
  for (const it of data.documents.Item ?? []) {
    if (it.type !== "_equippableItemTemplate") continue;
    templates[it._id] = { name: it.name, key: it.flags?.["fiche-manhwa"]?.key ?? "" };
  }
  const flat = globalThis.MANHWA.flattenTree ? globalThis.MANHWA.flattenTree(cfg.items) : flatten(cfg.items);
  /* template d'objet → conteneur de la fiche (d'après l'acteur _template du fichier, sinon la liste connue) */
  const tplToContainer = { ...KNOWN_TEMPLATES };
  const sheetTpl = findCsbTemplate(data);
  if (sheetTpl) for (const [ckey, ids] of Object.entries(csbContainers(sheetTpl))) { if (ckey === "inventaire_tout") continue; for (const id of ids) tplToContainer[id] = ckey; }
  const unmatched = {};
  const miss = (field, raw) => { if (blank(raw)) return; const k = `${field} = ${raw}`; unmatched[k] = (unmatched[k] ?? 0) + 1; };
  return { cfg, templates, flat, mapping, unmatched, miss, tplToContainer };
}
function flatten(nodes, parent = null, out = []) { for (const n of nodes || []) { const e = { ...n, parent }; out.push(e); flatten(n.children, e, out); } return out; }

/* ------------------------------------------------------------------ */
/*  Acteur                                                             */
/* ------------------------------------------------------------------ */

export function convertActor(src, ctx) {
  const { cfg, mapping, miss } = ctx;
  const p = src.system?.props ?? {};
  const fm = src.flags?.["fiche-manhwa"] ?? {};
  const out = { stats: {}, resources: {}, identity: {}, gauges: {}, xp: 0, favorites: [] };

  out.level = Math.max(0, Math.round(num(p.niveau, 1)));

  const rank = matchList(cfg.ranks, p.rang); if (rank === null) miss("rang", p.rang); out.rank = rank ?? String(p.rang ?? "");
  const aw = matchList(cfg.awakening, p.classe, AWAKE_DICT); if (aw === null) miss("classe (éveil)", p.classe); out.awakening = aw ?? "";
  // le champ « monde » n'est pas repris sur la fiche (demande de Bastien) ; il reste dans le flag source
  out.sponsor = blank(p.constellation) ? "" : String(p.constellation);

  // stats / monnaies selon la table de correspondance
  for (const [k, target] of Object.entries(mapping.map ?? {})) {
    if (!(k in p)) continue;
    const [kind, key] = target.split(":");
    const v = num(p[k], 0);
    if (kind === "stat") { const st = cfg.stats.find((s) => s.key === key); out.stats[key] = Math.max(st?.min ?? 0, v); }
    else if (kind === "res") out.resources[key] = v;
  }

  // identité : d'abord par clé identique dans la config de destination (config générée depuis CSB), sinon dictionnaire FR → défauts
  const byKey = {};
  for (const sec of cfg.identity ?? []) for (const f of sec.fields ?? []) byKey[f.key] ??= { section: sec.key, field: f };
  for (const [k, v0] of Object.entries(p)) {
    if (blank(v0) || typeof v0 === "object") continue;
    let target = byKey[k], v = v0;
    if (!target && IDENTITY_DICT[k]) { const [section, field] = IDENTITY_DICT[k].split("."); const sec = (cfg.identity ?? []).find((s) => s.key === section); const f = sec?.fields?.find((x) => x.key === field); if (f) target = { section, field: f }; }
    if (!target) continue;
    if (target.field.kind === "select") {
      const opts = target.field.options ?? []; const n = norm(v);
      const hit = opts.find((o) => norm(o) === n) ?? opts.find((o) => norm(o) === norm(HAND_DICT[n] ?? "")) ?? opts.find((o) => norm(HAND_DICT[norm(o)] ?? "") === norm(HAND_DICT[n] ?? "x"));
      if (!hit) { miss(`identité ${k}`, v); continue; }
      v = hit;
    }
    (out.identity[target.section] ??= {})[target.field.key] = String(v);
  }

  if (fm.titleId) { out.equippedTitle = fm.titleId; out.equippedTitles = [fm.titleId]; }
  if (fm.portrait?.pos) out.portrait = fm.portrait.pos;
  return out;
}

/* ------------------------------------------------------------------ */
/*  Objet                                                              */
/* ------------------------------------------------------------------ */

export function convertItem(src, ctx) {
  const { cfg, templates, flat, miss } = ctx;
  const p = src.system?.props ?? {};
  const tpl = templates[src.system?.template] ?? null;
  const out = {};

  // racine + famille d'après le template, puis catégorie d'après props.type
  let root = "items", family = "", found = false;
  const container = ctx.tplToContainer?.[src.system?.template];
  if (container) for (const [re, r, f] of CONTAINER_ROOTS) if (re.test(container)) { root = r; family = f; found = true; break; }
  if (!found) {
    const tplName = norm(`${tpl?.key ?? ""} ${tpl?.name ?? ""}`) || "";
    for (const [re, r, f] of TEMPLATE_ROOTS) if (re.test(tplName)) { root = r; family = f; found = true; break; }
  }
  if (!found) miss("template d'objet inconnu", `${src.system?.template ?? "(aucun)"}${tpl ? " " + tpl.name : ""}`);
  out.category = pickCategory(flat, root, family, p.type, miss);

  // champs
  const rank = matchList(cfg.ranks, p.rang); if (rank === null) miss("rang", p.rang); out.rank = rank ?? String(p.rang ?? "");
  const rar = matchList(cfg.rarities, p.rarete, RARITY_DICT); if (rar === null) miss("rareté", p.rarete); out.rarity = rar ?? "";
  if (!blank(p.quantite)) out.quantity = Math.max(0, Math.round(num(p.quantite, 1)));
  if (!blank(p.valeur)) out.value = Math.max(0, num(p.valeur, 0));
  if (!blank(p.gold) && !out.value) out.value = Math.max(0, num(p.gold, 0));
  if (!blank(p.niveau)) out.level = Math.max(0, Math.round(num(p.niveau, 1)));
  if (!blank(p.element)) { const e = matchList(cfg.elements, p.element, ELEMENT_DICT); if (e === null) miss("élément", p.element); out.element = e ?? ""; }
  if (!blank(p.cout)) { const c = matchList(cfg.costs, p.cout, COST_DICT); if (c === null) miss("coût", p.cout); out.cost = c ?? ""; }
  if (!blank(p.portee)) { const r = matchList(cfg.ranges, p.portee, RANGE_DICT); if (r === null) miss("portée", p.portee); out.range = r ?? ""; }
  if (!blank(p.execution) && norm(p.execution) !== "aucun") { const x = matchList(cfg.executions, p.execution, EXEC_DICT); if (x === null) miss("exécution", p.execution); out.execution = x ?? ""; }
  if (!blank(p.constructeur)) out.manufacturer = String(p.constructeur);
  if (!blank(p.places)) out.capacity = Math.max(0, Math.round(num(p.places, 0)));
  if (!blank(p.description)) out.description = String(p.description).replace(/^\s*['"]\s*(?=<)/, "");
  if (!blank(p.lore)) out.lore = String(p.lore).replace(/^\s*['"]\s*(?=<)/, "");
  if (!blank(p.recadrage)) out.imgPos = String(p.recadrage);
  if (src.flags?.["fiche-manhwa"]?.fx) out.fx = String(src.flags["fiche-manhwa"].fx);
  out.equippable = (cfg.equipment?.roots ?? []).includes(root);

  // le reste des props (non vides, scalaires) dans extra
  const used = new Set(["rang", "rarete", "quantite", "valeur", "gold", "niveau", "element", "cout", "portee", "execution", "monde", "constructeur", "places", "description", "lore", "recadrage", "type"]);
  const extra = {};
  for (const [k, v] of Object.entries(p)) if (!used.has(k) && !blank(v) && typeof v !== "object") extra[k] = v;
  if (p.type && !blank(p.type)) extra.typeCSB = p.type;
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

/* Choisit la feuille la plus précise : nom de catégorie (FR via dictionnaire ou EN/FR direct) sous la racine, sinon la famille, sinon la racine. */
function pickCategory(flat, root, family, type, miss) {
  const rootNode = flat.find((n) => n.id === root) ?? flat.find((n) => !n.parent);
  if (!rootNode) return "";
  const under = (n) => { let c = n; while (c) { if (c.id === rootNode.id) return true; c = c.parent; } return false; };
  if (!blank(type)) {
    const n = norm(type); const en = norm(TYPE_DICT[n] ?? "");
    const hit = flat.find((x) => under(x) && (norm(x.name) === n || (en && norm(x.name) === en) || norm(x.id).endsWith("_" + n)));
    if (hit) return hit.id;
    miss(`type d'objet (${rootNode.name})`, type);
  }
  if (family && flat.some((x) => x.id === family)) return family;
  if (family) { const byName = flat.find((x) => under(x) && norm(x.id) === norm(family)); if (byName) return byName.id; }
  return rootNode.id;
}
