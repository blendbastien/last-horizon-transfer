/* Last Horizon Transfer — export / import complet d'une partie Foundry (v13)
 * Export : fichier JSON unique avec tout le contenu du monde.
 * Import : recréation dans une autre partie, même entre deux systèmes
 *          (les données « system » sont alors conservées dans un flag).
 */

import { csbConvertible, csbMappingHTML, readCsbMapping, csbContext, convertActor, convertItem } from "./convert-csb.js";
import { findCsbTemplate, buildConfigFromCsb, mergeConfig, applyConfig } from "./config-from-csb.js";

const MOD = "last-horizon-transfer";
const FORMAT = 1;
const MS = "manhwa-sheet";
const isMsMsg = (m) => !!(m.flags?.[MS] && Object.keys(m.flags[MS]).length);

/* Types de documents transférables, dans l'ordre d'import
 * (les scènes en dernier : leurs tokens / notes pointent vers acteurs et journaux). */
const TYPES = [
  { cls: "Item",         coll: "items",     label: "Objets",            batch: 100 },
  { cls: "Actor",        coll: "actors",    label: "Acteurs",           batch: 50  },
  { cls: "JournalEntry", coll: "journal",   label: "Journaux",          batch: 50  },
  { cls: "RollTable",    coll: "tables",    label: "Tables aléatoires", batch: 100 },
  { cls: "Macro",        coll: "macros",    label: "Macros",            batch: 100 },
  { cls: "Playlist",     coll: "playlists", label: "Playlists (musique)", batch: 50 },
  { cls: "Cards",        coll: "cards",     label: "Paquets de cartes", batch: 50  },
  { cls: "Scene",        coll: "scenes",    label: "Scènes (cartes)",   batch: 5   },
  { cls: "ChatMessage",  coll: "messages",  label: "Messages de chat",  batch: 200, off: true }
];
const FOLDER_TYPES = ["Item", "Actor", "JournalEntry", "RollTable", "Macro", "Playlist", "Cards", "Scene", "ChatMessage"];

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

const DialogV2 = () => foundry.applications.api.DialogV2;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

function notify(kind, msg, opts = {}) {
  return ui.notifications[kind](`Transfert : ${msg}`, opts);
}
function removeNotif(n) {
  try { if (typeof n?.remove === "function") n.remove(); else ui.notifications.remove(n); } catch (e) { /* ignore */ }
}
const docClass = (name) => (foundry.utils.getDocumentClass ?? globalThis.getDocumentClass)(name);

function docTypes(cls) {
  const types = game.documentTypes?.[cls] ?? Object.keys(CONFIG[cls]?.dataModels ?? {});
  return types.filter((t) => t !== "base");
}

/* Valeur de réglage sérialisable en JSON */
function settingValue(ns, key) {
  try {
    let v = game.settings.get(ns, key);
    if (v && typeof v.toObject === "function") v = v.toObject();
    return JSON.parse(JSON.stringify(v ?? null));
  } catch (e) {
    return undefined;
  }
}

/* Réglages de monde regroupés par module (hors core, système et ce module). */
function worldSettingsByNamespace() {
  const out = {};
  for (const [id, cfg] of game.settings.settings) {
    if (cfg.scope !== "world") continue;
    const ns = cfg.namespace;
    if (ns === MOD) continue;
    const label = ns === "core" ? "Foundry (core)"
      : ns === game.system.id ? `Système (${game.system.title})`
      : (game.modules.get(ns)?.title ?? ns);
    out[ns] ??= { label, keys: [], system: ns === "core" || ns === game.system.id };
    out[ns].keys.push(cfg.key);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  EXPORT                                                             */
/* ------------------------------------------------------------------ */

async function exportDialog() {
  if (!game.user.isGM) return notify("warn", "réservé au MJ.");

  const rows = TYPES.map((t) => {
    const n = game[t.coll]?.size ?? 0;
    return `<label class="lht-row"><input type="checkbox" name="types" value="${t.cls}" ${t.off || !n ? "" : "checked"} ${n ? "" : "disabled"}>
      <span>${t.label}</span><span class="lht-count">${n}</span></label>`;
  }).join("");

  const ns = worldSettingsByNamespace();
  const nsRows = Object.entries(ns).sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([id, s]) =>
    `<label class="lht-row"><input type="checkbox" name="settings" value="${esc(id)}" ${id === "core" ? "" : "checked"}>
      <span>${esc(s.label)}</span><span class="lht-count">${s.keys.length}</span></label>`
  ).join("") || `<p class="lht-muted">Aucun réglage de monde.</p>`;

  const content = `
  <div class="lht-panel">
    <p class="lht-intro">Tout ce qui est coché part dans un seul fichier <b>.json</b>, avec les dossiers correspondants.
       Les images et les sons ne sont pas copiés : seuls leurs chemins le sont (sur Forge, la bibliothèque d'assets est commune à tes parties).</p>
    <h3>Documents</h3>
    <div class="lht-grid">${rows}</div>
    <div class="lht-grid">${msChatRow()}</div>
    <h3>Joueurs</h3>
    <label class="lht-row lht-full"><input type="checkbox" name="users" checked><span>Exporter la liste des joueurs (${game.users.size}) : nom, rôle, couleur, personnage et préférences des modules (amis, carnet…). À l'import, chaque joueur d'origine est associé à un joueur de la nouvelle partie : permissions, propriétaires de véhicules, niveaux de boutique, destinataires des messages suivent.</span></label>
    <h3>Réglages de monde des modules</h3>
    <p class="lht-muted">Données stockées par tes modules (catalogue, scénarios, notifications…). Les réglages Foundry (core) sont décochés par défaut ; ceux du système (configuration Manhwa Sheet…) partent avec le reste.</p>
    <div class="lht-grid">${nsRows}</div>
    <label class="lht-row lht-full"><input type="checkbox" name="pretty"><span>Fichier lisible (indenté, plus gros)</span></label>
  </div>`;

  const result = await DialogV2().wait({
    window: { title: "Transfert — Exporter cette partie", icon: "fa-solid fa-file-export" },
    classes: ["lht-dialog"],
    position: { width: 560 },
    content,
    buttons: [
      { action: "export", label: "Exporter", icon: "fa-solid fa-download", default: true,
        callback: (ev, btn) => ({
          types: [...btn.form.querySelectorAll("input[name=types]:checked")].map((i) => i.value),
          settings: [...btn.form.querySelectorAll("input[name=settings]:checked")].map((i) => i.value),
          pretty: btn.form.querySelector("input[name=pretty]").checked,
          users: btn.form.querySelector("input[name=users]").checked,
          msChat: btn.form.querySelector("input[name=msChat]")?.checked ?? false
        }) },
      { action: "cancel", label: "Annuler", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;
  return runExport(result);
}

function msChatRow() {
  const n = game.messages.filter(isMsMsg).length;
  if (game.system.id !== MS && !n) return "";
  return `<label class="lht-row lht-full"><input type="checkbox" name="msChat" ${n ? "checked" : "disabled"}>
    <span>Messagerie et échanges Manhwa seulement (messages privés, trocs, récompenses) — inutile si « Messages de chat » est coché</span><span class="lht-count">${n}</span></label>`;
}

async function runExport({ types, settings, pretty, users = true, msChat = false }) {
  const prog = notify("info", "export en cours…", { progress: true, permanent: true });
  const data = {
    module: MOD, format: FORMAT, exportedAt: Date.now(),
    world: { id: game.world.id, title: game.world.title },
    system: { id: game.system.id, title: game.system.title, version: game.system.version },
    foundry: game.version,
    folders: [], documents: {}, settings: {}
  };

  // Dossiers des types retenus
  data.folders = game.folders.filter((f) => types.includes(f.type)).map((f) => f.toObject());

  let step = 0;
  for (const t of TYPES) {
    if (!types.includes(t.cls)) continue;
    prog.update({ pct: step++ / (types.length + 1), message: `Transfert : ${t.label}…` });
    await new Promise((r) => setTimeout(r, 10));
    data.documents[t.cls] = game[t.coll].map((d) => d.toObject());
  }
  if (msChat && !types.includes("ChatMessage")) {
    data.documents.ChatMessage = game.messages.filter(isMsMsg).map((d) => d.toObject());
    data.chatScope = "manhwa";
  }

  // Joueurs (pour la correspondance à l'import)
  if (users) data.users = game.users.map((u) => ({ _id: u.id, name: u.name, role: u.role, color: u.color?.css ?? String(u.color ?? ""), character: u.character?.id ?? null, flags: JSON.parse(JSON.stringify(u.flags ?? {})) }));

  // Réglages de monde
  const ns = worldSettingsByNamespace();
  for (const id of settings) {
    if (!ns[id]) continue;
    data.settings[id] = {};
    for (const key of ns[id].keys) {
      const v = settingValue(id, key);
      if (v !== undefined) data.settings[id][key] = v;
    }
  }

  const json = JSON.stringify(data, null, pretty ? 2 : 0);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const name = `${game.world.id}_transfert_${stamp}.json`;
  foundry.utils.saveDataToFile(json, "application/json", name);

  prog.update({ pct: 1, message: `Transfert : export terminé (${(json.length / 1048576).toFixed(1)} Mo).` });
  setTimeout(() => removeNotif(prog), 4000);
  const counts = Object.entries(data.documents).map(([k, v]) => `${v.length} ${TYPES.find((t) => t.cls === k).label.toLowerCase()}`).join(", ");
  notify("info", `${name} — ${counts}, ${data.folders.length} dossiers, ${Object.keys(data.settings).length} modules de réglages${data.users ? `, ${data.users.length} joueurs` : ""}.`);
}

/* ------------------------------------------------------------------ */
/*  IMPORT                                                             */
/* ------------------------------------------------------------------ */

async function importDialog() {
  if (!game.user.isGM) return notify("warn", "réservé au MJ.");

  const content = `
  <div class="lht-panel">
    <p class="lht-intro">Choisis le fichier <b>.json</b> exporté depuis l'autre partie. Rien n'est écrit avant l'écran de confirmation suivant.</p>
    <input type="file" name="file" accept=".json,application/json" class="lht-file">
  </div>`;

  const file = await DialogV2().wait({
    window: { title: "Transfert — Importer dans cette partie", icon: "fa-solid fa-file-import" },
    classes: ["lht-dialog"],
    position: { width: 480 },
    content,
    buttons: [
      { action: "ok", label: "Lire le fichier", icon: "fa-solid fa-folder-open", default: true,
        callback: (ev, btn) => btn.form.querySelector("input[name=file]").files[0] ?? null },
      { action: "cancel", label: "Annuler", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!file || file === "cancel") return;

  let data;
  try {
    data = JSON.parse(await foundry.utils.readTextFromFile(file));
  } catch (e) {
    return notify("error", "fichier illisible (JSON invalide).");
  }
  if (data?.module !== MOD || !data.documents) return notify("error", "ce fichier n'est pas un export Last Horizon Transfer.");
  if (data.format > FORMAT) return notify("error", `format ${data.format} plus récent que ce module (${FORMAT}) : mets le module à jour.`);
  return importOptions(data);
}

/* Écran de confirmation : types, correspondance des types, conflits, permissions, réglages. */
async function importOptions(data) {
  const sameSystem = data.system?.id === game.system.id;

  const rows = TYPES.map((t) => {
    const n = data.documents[t.cls]?.length ?? 0;
    const lbl = t.cls === "ChatMessage" && data.chatScope === "manhwa" ? "Messagerie et échanges Manhwa" : t.label;
    return `<label class="lht-row"><input type="checkbox" name="types" value="${t.cls}" ${n && (!t.off || data.chatScope === "manhwa") ? "checked" : ""} ${n ? "" : "disabled"}>
      <span>${lbl}</span><span class="lht-count">${n}</span></label>`;
  }).join("");

  // Correspondance des types Acteur / Objet
  const mapRows = [];
  for (const cls of ["Actor", "Item"]) {
    const docs = data.documents[cls] ?? [];
    if (!docs.length) continue;
    const targets = docTypes(cls);
    const counts = {};
    for (const d of docs) counts[d.type] = (counts[d.type] ?? 0) + 1;
    for (const [src, n] of Object.entries(counts)) {
      let def = targets.includes(src) ? src : (src.startsWith("_") || /template/i.test(src)) ? "" : (targets[0] ?? "");
      if (!sameSystem && cls === "Item" && targets.includes("item") && !targets.includes(src) && def) def = "item";
      const opts = [`<option value="" ${def === "" ? "selected" : ""}>— ignorer —</option>`]
        .concat(targets.map((t) => `<option value="${t}" ${t === def ? "selected" : ""}>${t}</option>`)).join("");
      mapRows.push(`<div class="lht-map"><span class="lht-map-src">${cls === "Actor" ? "Acteur" : "Objet"} · <code>${esc(src)}</code><span class="lht-count">${n}</span></span>
        <i class="fa-solid fa-arrow-right"></i><select name="map:${cls}:${esc(src)}">${opts}</select></div>`);
    }
  }

  const nsRows = Object.entries(data.settings ?? {}).map(([id, keys]) => {
    const present = id === "core" || id === game.system.id || game.modules.get(id)?.active;
    const label = id === "core" ? "Foundry (core)" : id === game.system.id ? `Système (${id})` : (game.modules.get(id)?.title ?? id);
    return `<label class="lht-row"><input type="checkbox" name="settings" value="${esc(id)}" ${present ? "checked" : "disabled"}>
      <span>${esc(label)}${present ? "" : ' <em class="lht-muted">(module absent ou inactif ici)</em>'}</span><span class="lht-count">${Object.keys(keys).length}</span></label>`;
  }).join("") || `<p class="lht-muted">Aucun réglage dans le fichier.</p>`;

  const hasUsers = Array.isArray(data.users) && data.users.length;
  const userRows = hasUsers ? data.users.map((su) => {
    const def = defaultUserFor(su);
    const opts = [`<option value="">— personne —</option>`].concat(game.users.map((u) => `<option value="${u.id}" ${u.id === def ? "selected" : ""}>${esc(u.name)}${u.isGM ? " (MJ)" : ""}</option>`)).join("");
    return `<div class="lht-map"><span class="lht-map-src"><i class="fa-solid ${su.role >= 4 ? "fa-crown" : "fa-user"}" style="color:${esc(su.color || "inherit")}"></i> ${esc(su.name)}</span>
      <i class="fa-solid fa-arrow-right"></i><select name="user:${esc(su._id)}">${opts}</select></div>`;
  }).join("") : "";

  const content = `
  <div class="lht-panel">
    <div class="lht-meta">
      <div><b>Source</b> : ${esc(data.world?.title)} — ${esc(data.system?.title ?? data.system?.id)} ${esc(data.system?.version ?? "")} · exporté le ${new Date(data.exportedAt).toLocaleString("fr-FR")}</div>
      <div><b>Destination</b> : ${esc(game.world.title)} — ${esc(game.system.title)} ${esc(game.system.version)}</div>
    </div>
    ${sameSystem ? "" : `<p class="lht-warn"><i class="fa-solid fa-triangle-exclamation"></i> Les deux parties n'utilisent pas le même système. Les fiches (acteurs, objets) seront recréées avec leur nom, image, token, dossier et permissions, mais leurs données de système (<code>system</code>) ne sont pas compatibles : elles sont <b>conservées intactes dans un flag</b> du document (<code>flags.${MOD}.source</code>) et pourront être converties plus tard. Choisis ci-dessous à quel type de la destination correspond chaque type d'origine.</p>`}

    <h3>Documents</h3>
    <div class="lht-grid">${rows}</div>

    ${mapRows.length ? `<h3>Correspondance des types</h3><div class="lht-maps">${mapRows.join("")}</div>` : ""}

    ${hasUsers ? `<h3>Correspondance des joueurs</h3>
    <p class="lht-muted">Crée d'abord les comptes des joueurs dans cette partie (Paramètres › Joueurs), puis associe-les ici. Permissions, propriétaires (véhicules…), niveaux de boutique, destinataires d'annonces et de messages sont réécrits vers le joueur choisi. « Personne » : les droits de ce joueur sont retirés.</p>
    <div class="lht-maps">${userRows}</div>
    <label class="lht-row lht-full"><input type="checkbox" name="userFlags" checked><span>Copier les préférences des modules de chaque joueur (amis, carnet, réglages Manhwa…) et son personnage attitré s'il n'en a pas</span></label>` : ""}

    <h3>Options</h3>
    <div class="lht-options">
      <div class="lht-field"><span>Si un document avec le même identifiant existe déjà ici</span>
        <select name="conflict">
          <option value="skip" selected>Ignorer (garder celui de cette partie)</option>
          <option value="overwrite">Écraser (remplacer par celui du fichier)</option>
          <option value="duplicate">Dupliquer (nouvel identifiant)</option>
        </select></div>
      <label class="lht-row lht-full"><input type="checkbox" name="keepSystem" ${sameSystem ? "checked" : ""}>
        <span>Conserver les données de système (<code>system</code>) telles quelles ${sameSystem ? "" : "<em class='lht-muted'>— déconseillé entre deux systèmes</em>"}</span></label>
      <label class="lht-row lht-full"><input type="checkbox" name="resetOwnership" ${hasUsers ? "" : "checked"}>
        <span>Réinitialiser les permissions par joueur (seule la permission par défaut est conservée)${hasUsers ? " — inutile : la correspondance des joueurs s'en charge" : " — ce fichier ne contient pas la liste des joueurs"}</span></label>
    </div>

    ${csbConvertible(data) ? csbGenConfigHTML(data) + csbMappingHTML(data) : ""}

    <h3>Réglages de monde des modules</h3>
    <div class="lht-grid">${nsRows}</div>
    <p class="lht-muted">Conseil : fais une sauvegarde de la partie de destination avant un import en mode « Écraser ».</p>
  </div>`;

  const result = await DialogV2().wait({
    window: { title: "Transfert — Confirmer l'import", icon: "fa-solid fa-file-import" },
    classes: ["lht-dialog"],
    position: { width: 640 },
    content,
    buttons: [
      { action: "import", label: "Importer", icon: "fa-solid fa-upload", default: true,
        callback: (ev, btn) => {
          const f = btn.form;
          const map = {};
          for (const sel of f.querySelectorAll("select[name^='map:']")) {
            const [, cls, src] = sel.name.split(":");
            (map[cls] ??= {})[src] = sel.value;
          }
          const users = {};
          for (const sel of f.querySelectorAll("select[name^='user:']")) users[sel.name.slice(5)] = sel.value;
          return {
            users, userFlags: f.querySelector("input[name=userFlags]")?.checked ?? false,
            types: [...f.querySelectorAll("input[name=types]:checked")].map((i) => i.value),
            settings: [...f.querySelectorAll("input[name=settings]:checked")].map((i) => i.value),
            conflict: f.querySelector("select[name=conflict]").value,
            keepSystem: f.querySelector("input[name=keepSystem]").checked,
            resetOwnership: f.querySelector("input[name=resetOwnership]").checked,
            map,
            csb: csbConvertible(data) ? { ...readCsbMapping(f), genConfig: f.querySelector("input[name=csbGenConfig]")?.checked ?? false } : null
          };
        } },
      { action: "cancel", label: "Annuler", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;
  return runImport(data, result);
}

/* ------------------------------------------------------------------ */

async function runImport(data, opt) {
  /* l'import réécrit des réglages entiers (Catalogue, quêtes, groupes, courrier…) : un joueur qui agit pendant ce temps perdrait son action (1.3.0) */
  const others = game.users.filter(u => u.active && u.id !== game.user.id);
  if (others.length) { const ok = await DialogV2().confirm({ window: { title: "Joueurs connectés" }, content: `<p><b>${others.map(u => u.name).join(", ")}</b> ${others.length > 1 ? "sont connectés" : "est connecté"}. Pendant l'import, ce qu'ils font (achats, quêtes, courrier…) peut être écrasé. Importer quand même ?</p>`, rejectClose: false }); if (!ok) return; }
  if (game.users.activeGM && game.users.activeGM !== game.user) { const ok = await DialogV2().confirm({ window: { title: "Autre MJ actif" }, content: `<p>Un autre MJ (<b>${game.users.activeGM.name}</b>) traite les requêtes des joueurs. Importer depuis ce poste peut écraser ses écritures. Continuer ?</p>`, rejectClose: false }); if (!ok) return; }
  const prog = notify("info", "import en cours…", { progress: true, permanent: true });
  opt._srcSystem = data.system?.id;
  if (opt.csb?.genConfig && csbConvertible(data)) {
    try {
      const gen = buildConfigFromCsb(data, globalThis.MANHWA.config());
      if (gen) { await applyConfig(mergeConfig(globalThis.MANHWA.config(), gen.cfg)); notify("info", `configuration Manhwa Sheet générée depuis « ${gen.templateName} » et appliquée (ancienne config sauvegardée).`); for (const n of gen.notes) notify("warn", n); }
    } catch (e) { notify("error", `génération de la config impossible : ${e.message}`); console.error(e); }
  }
  opt._um = buildUserMap(data, opt);
  opt._csb = opt.csb?.convert && csbConvertible(data) ? csbContext(data, opt.csb) : null;
  const report = { created: {}, skipped: {}, overwritten: {}, refiled: {}, ignoredType: {}, errors: [] };
  const idMap = {};            // ancien id -> nouvel id (identité sauf en mode Dupliquer)
  const bump = (bucket, cls, n = 1) => (report[bucket][cls] = (report[bucket][cls] ?? 0) + n);
  const sameSystem = data.system?.id === game.system.id;
  const steps = opt.types.length + 2;
  let step = 0;
  const tick = (msg) => { prog.update({ pct: Math.min(step / steps, 0.99), message: `Transfert : ${msg}` }); return new Promise((r) => setTimeout(r, 15)); };

  /* -- Dossiers -------------------------------------------------- */
  await tick("dossiers…");
  const folders = (data.folders ?? []).filter((f) => opt.types.includes(f.type) && FOLDER_TYPES.includes(f.type));
  // Tri par profondeur pour créer les parents avant les enfants
  const byId = new Map(folders.map((f) => [f._id, f]));
  const depth = (f) => { let d = 0, p = f.folder; while (p && byId.has(p) && d < 20) { d++; p = byId.get(p).folder; } return d; };
  folders.sort((a, b) => depth(a) - depth(b));
  for (const f of folders) {
    try {
      const src = foundry.utils.deepClone(f);
      const parent = src.folder ? (idMap[src.folder] ?? (game.folders.has(src.folder) ? src.folder : null)) : null;
      src.folder = parent;
      const r = await createOne("Folder", src, opt, idMap);
      if (r) bump(r, "Folder");
    } catch (e) { report.errors.push(`Dossier « ${f.name} » : ${e.message}`); }
  }
  step++;

  /* -- Documents ------------------------------------------------- */
  for (const t of TYPES) {
    if (!opt.types.includes(t.cls)) continue;
    const docs = data.documents[t.cls] ?? [];
    await tick(`${t.label.toLowerCase()} (${docs.length})…`);
    const cls = docClass(t.cls);
    let queue = [];
    const backups = new Map();   /* documents supprimés en mode « remplacer », pour les rétablir si leur recréation échoue */
    const flush = async () => {
      if (!queue.length) return;
      const batch = queue; queue = [];
      try {
        const created = await cls.createDocuments(batch.map((b) => b.data), { keepId: true, render: false });
        created.forEach((d, i) => { idMap[batch[i].oldId] = d.id; });
        bump("created", t.cls, created.length);
      } catch (e) {
        // On retente un par un pour isoler les documents fautifs
        for (const b of batch) {
          try { const [d] = await cls.createDocuments([b.data], { keepId: true, render: false }); idMap[b.oldId] = d.id; bump("created", t.cls); }
          catch (e2) { report.errors.push(`${t.label} « ${b.data.name ?? b.oldId} » : ${e2.message}`);
            const bk = backups.get(b.oldId); if (bk) { try { await cls.createDocuments([bk], { keepId: true, render: false }); report.errors.push(`${t.label} « ${bk.name ?? b.oldId} » : l'original a été rétabli.`); } catch (e3) { report.errors.push(`${t.label} « ${bk.name ?? b.oldId} » : original PERDU (${e3.message}) — restaure-le depuis une sauvegarde.`); } } }
        }
      }
    };

    for (const raw of docs) {
      const oldId = raw._id;
      let src;
      try { src = prepare(t.cls, raw, opt, idMap, sameSystem); } catch (e) { report.errors.push(`${t.label} « ${raw.name} » : ${e.message}`); continue; }
      if (!src) { bump("ignoredType", t.cls); continue; }

      const exists = game[t.coll].has(oldId);
      if (exists) {
        if (opt.conflict === "skip") {
          // déjà présent : on le garde, mais on le replace dans son dossier si celui-ci existe maintenant (réimport après un import incomplet)
          const existing = game[t.coll].get(oldId);
          const wantFolder = src.folder ?? null;
          if (existing && (existing.folder?.id ?? null) !== wantFolder && (wantFolder === null || game.folders.has(wantFolder))) {
            try { await existing.update({ folder: wantFolder }, { render: false }); bump("refiled", t.cls); }
            catch (e) { report.errors.push(`${t.label} « ${raw.name} » (dossier) : ${e.message}`); }
          }
          bump("skipped", t.cls); idMap[oldId] = oldId; continue;
        }
        if (opt.conflict === "overwrite") {
          try { const ex = game[t.coll].get(oldId); backups.set(oldId, ex.toObject()); await ex.delete({ render: false }); bump("overwritten", t.cls); }   /* copie gardée : rétablie si la recréation échoue (1.3.0) */
          catch (e) { report.errors.push(`${t.label} « ${raw.name} » (suppression) : ${e.message}`); continue; }
        }
        if (opt.conflict === "duplicate") delete src._id;
      }
      queue.push({ oldId, data: src });
      if (queue.length >= t.batch) await flush();
    }
    await flush();
    step++;
  }

  /* -- Réglages -------------------------------------------------- */
  await tick("réglages de monde…");
  let nSettings = 0;
  for (const ns of opt.settings) {
    for (const [key, value] of Object.entries(data.settings?.[ns] ?? {})) {
      if (!game.settings.settings.has(`${ns}.${key}`)) continue;
      try { await game.settings.set(ns, key, opt._um ? remapUsers(value, opt._um) : value); nSettings++; }
      catch (e) { report.errors.push(`Réglage ${ns}.${key} : ${e.message}`); }
    }
  }

  /* -- Joueurs : préférences des modules, personnage attitré ------ */
  report.users = 0;
  if (opt._um && opt.userFlags) {
    for (const su of data.users ?? []) {
      const dest = game.users.get(opt._um.map[su._id]); if (!dest) continue;
      const upd = {};
      for (const [ns, v] of Object.entries(su.flags ?? {})) if (ns !== "core" && ns !== MOD && (ns === "world" || ns === game.system.id || game.modules.get(ns)?.active)) upd[`flags.${ns}`] = remapUsers(v, opt._um);
      const ch = su.character && (idMap[su.character] ?? su.character);
      if (ch && !dest.character && game.actors.has(ch)) upd.character = ch;
      if (!Object.keys(upd).length) continue;
      try { await dest.update(upd); report.users++; } catch (e) { report.errors.push(`Joueur « ${dest.name} » : ${e.message}`); }
    }
  }

  prog.update({ pct: 1, message: "Transfert : import terminé." });
  setTimeout(() => removeNotif(prog), 3000);
  Object.values(ui.sidebar?.tabs ?? {}).forEach((t) => t?.render?.());
  if (opt._csb) report.unmatched = opt._csb.unmatched;
  showReport(report, nSettings, opt);
}

/* Création d'un document unitaire (dossiers) avec gestion des conflits. */
async function createOne(clsName, src, opt, idMap) {
  const cls = docClass(clsName);
  const coll = game.collections.get(clsName);
  const oldId = src._id;
  if (coll?.has(oldId)) {
    if (opt.conflict === "skip") {
      const ex = coll.get(oldId);
      if (ex && (ex.folder?.id ?? null) !== (src.folder ?? null)) await ex.update({ folder: src.folder ?? null }, { render: false });
      idMap[oldId] = oldId; return "skipped";
    }
    if (opt.conflict === "overwrite") {
      // Un dossier existant : on le met à jour plutôt que de le supprimer (ça supprimerait son contenu)
      await coll.get(oldId).update({ name: src.name, color: src.color, folder: src.folder, sorting: src.sorting, sort: src.sort }, { render: false });
      idMap[oldId] = oldId; return "overwritten";
    }
    delete src._id;
  }
  const [d] = await cls.createDocuments([src], { keepId: true, render: false });
  idMap[oldId] = d.id;
  return "created";
}

/* Prépare un document pour la destination : type, dossier, permissions, références, données de système. */
function prepare(clsName, raw, opt, idMap, sameSystem) {
  const src = foundry.utils.deepClone(raw);

  // Dossier
  if (src.folder) src.folder = idMap[src.folder] ?? (game.folders.has(src.folder) ? src.folder : null);

  // Permissions
  if (opt.resetOwnership && src.ownership) src.ownership = { default: src.ownership.default ?? 0 };

  // Type et données de système (Acteurs / Objets)
  if (clsName === "Actor" || clsName === "Item") {
    const target = opt.map?.[clsName]?.[src.type] ?? src.type;
    if (!target) return null;
    convertSystem(src, clsName, target, opt, sameSystem);
    if (clsName === "Actor" && Array.isArray(src.items)) {
      src.items = src.items.map((it) => {
        const t2 = opt.map?.Item?.[it.type] ?? it.type;
        if (!t2 || !docTypes("Item").includes(t2)) return null;
        const o = foundry.utils.deepClone(it);
        if (opt.resetOwnership && o.ownership) o.ownership = { default: o.ownership.default ?? 0 };
        convertSystem(o, "Item", t2, opt, sameSystem);
        return o;
      }).filter(Boolean);
    }
  }

  // Scènes : tokens → acteurs, notes → journaux (remappés en mode Dupliquer)
  if (clsName === "Scene") {
    for (const tk of src.tokens ?? []) if (tk.actorId && idMap[tk.actorId]) tk.actorId = idMap[tk.actorId];
    for (const n of src.notes ?? []) if (n.entryId && idMap[n.entryId]) n.entryId = idMap[n.entryId];
    if (src.playlist && idMap[src.playlist]) src.playlist = idMap[src.playlist];
    src.active = false;
  }

  // Playlists : rien ne doit démarrer tout seul à l'import
  if (clsName === "Playlist") {
    src.playing = false;
    for (const s of src.sounds ?? []) s.playing = false;
  }

  // Joueurs : ids d'origine → ids de cette partie (permissions, propriétaires, destinataires, flags…)
  let out = opt._um ? remapUsers(src, opt._um) : src;

  // Auteurs (macros, messages) : les comptes diffèrent d'une partie à l'autre
  if (clsName === "Macro" || clsName === "ChatMessage") {
    if (!out.author || !game.users.has(out.author)) out.author = game.user.id;
    if (clsName === "ChatMessage") {
      delete out.user;
      if (Array.isArray(out.whisper)) out.whisper = out.whisper.filter((u) => game.users.has(u));
      if (out.speaker?.actor && idMap[out.speaker.actor]) out.speaker.actor = idMap[out.speaker.actor];
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Correspondance des joueurs                                         */
/* ------------------------------------------------------------------ */

/* joueur proposé par défaut : même nom, sinon le MJ actuel pour un MJ d'origine */
function defaultUserFor(su) {
  const n = String(su.name ?? "").trim().toLowerCase();
  const same = game.users.find((u) => u.name.trim().toLowerCase() === n);
  if (same) return same.id;
  if (su.role >= 4) return game.user.id;
  return "";
}

function buildUserMap(data, opt) {
  if (!Array.isArray(data.users) || !data.users.length) return null;
  const map = {};
  for (const su of data.users) map[su._id] = opt.users?.[su._id] ?? defaultUserFor(su);
  return { map, src: new Set(Object.keys(map)) };
}

/* Réécrit en profondeur tout id de joueur d'origine (valeur ou clé). Les blocs « ownership » perdent les joueurs non associés.
 * Les « _id » des documents ne sont jamais touchés. */
const ID_RE = /^(User\.)?([A-Za-z0-9]{16})$/;
function remapUsers(v, um, key = "") {
  if (typeof v === "string") {
    const m = ID_RE.exec(v); if (!m || !um.src.has(m[2])) return v;
    const to = um.map[m[2]]; return to ? (m[1] ?? "") + to : v;
  }
  if (Array.isArray(v)) return v.map((x) => remapUsers(x, um));
  if (!v || typeof v !== "object") return v;
  const out = {};
  const own = key === "ownership";
  for (const [k, x] of Object.entries(v)) {
    if (k === "_id") { out[k] = x; continue; }
    let k2 = k;
    if (um.src.has(k)) {
      const to = um.map[k];
      if (to) k2 = to; else if (own) continue;
    } else if (own && k !== "default" && !game.users.has(k)) continue;
    out[k2] = own ? x : remapUsers(x, um, k);
  }
  return out;
}

function convertSystem(doc, clsName, targetType, opt, sameSystem) {
  const typeChanged = doc.type !== targetType;
  const strip = !opt.keepSystem || typeChanged;
  if (strip || !sameSystem) {
    foundry.utils.setProperty(doc, `flags.${MOD}.source`, {
      system: opt._srcSystem, type: doc.type, data: doc.system ?? {}
    });
  }
  if (strip) {
    let converted = null;
    if (opt._csb) {
      try { converted = clsName === "Actor" ? convertActor(doc, opt._csb) : convertItem(doc, opt._csb); }
      catch (e) { console.warn(`${MOD} | conversion CSB échouée pour « ${doc.name} »`, e); }
    }
    doc.system = converted ?? {};
  }
  doc.type = targetType;
}

/* ------------------------------------------------------------------ */
/*  Config Manhwa Sheet depuis la fiche CSB                            */
/* ------------------------------------------------------------------ */

function csbGenConfigHTML(data) {
  const tpl = findCsbTemplate(data);
  if (!tpl) return `<h3>Configuration Manhwa Sheet</h3><p class="lht-muted">Aucun acteur <code>_template</code> dans le fichier : la configuration de cette partie est gardée telle quelle (coche « Acteurs » à l'export pour pouvoir la générer).</p>`;
  const gen = buildConfigFromCsb(data, globalThis.MANHWA.config());
  const c = gen?.cfg ?? {};
  const parts = [["stats", "stats"], ["resources", "monnaies"], ["ranks", "rangs"], ["origins", "mondes"], ["awakening", "éveils"], ["identity", "sections d'identité"], ["rarities", "raretés"], ["elements", "éléments"], ["costs", "coûts"], ["ranges", "portées"], ["executions", "exécutions"]]
    .filter(([k]) => Array.isArray(c[k])).map(([k, l]) => `${c[k].length} ${l}`).join(", ");
  return `<h3>Configuration Manhwa Sheet</h3>
    <label class="lht-row lht-full"><input type="checkbox" name="csbGenConfig" checked>
      <span>Recréer la fiche CSB « ${esc(tpl.name)} » dans la configuration Manhwa Sheet <b>avant</b> l'import : ${esc(parts)}. Les catégories d'objets, le mode de jeu, les jauges et l'XP ne changent pas. La config actuelle est sauvegardée (Sécurité → sauvegardes).</span></label>
    ${gen?.notes?.length ? `<p class="lht-warn">${gen.notes.map(esc).join("<br>")}</p>` : ""}`;
}

/* Outil séparé : lire un fichier (export Transfert, ou export d'un acteur _template) et télécharger la config générée. */
async function configFromCsbDialog() {
  if (!game.user.isGM) return notify("warn", "réservé au MJ.");
  if (game.system.id !== "manhwa-sheet") return notify("warn", "à lancer dans la partie Manhwa Sheet.");
  const file = await DialogV2().wait({
    window: { title: "Config Manhwa Sheet depuis la fiche CSB", icon: "fa-solid fa-wand-magic-sparkles" },
    classes: ["lht-dialog"], position: { width: 480 },
    content: `<div class="lht-panel"><p class="lht-intro">Choisis un export Transfert (.json) de la partie CSB, ou l'export JSON de l'acteur <code>_template</code> de la fiche. Rien n'est appliqué : tu obtiens un fichier à importer dans Manhwa Sheet → Configurer → « Import JSON », ou tu peux l'appliquer directement.</p><input type="file" name="file" accept=".json" class="lht-file"></div>`,
    buttons: [
      { action: "download", label: "Télécharger la config", icon: "fa-solid fa-download", default: true, callback: (ev, btn) => ({ mode: "download", file: btn.form.querySelector("input[name=file]").files[0] }) },
      { action: "apply", label: "Appliquer maintenant", icon: "fa-solid fa-check", callback: (ev, btn) => ({ mode: "apply", file: btn.form.querySelector("input[name=file]").files[0] }) },
      { action: "cancel", label: "Annuler", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!file || file === "cancel" || !file.file) return;
  let json;
  try { json = JSON.parse(await foundry.utils.readTextFromFile(file.file)); } catch (e) { return notify("error", "fichier illisible."); }
  // export d'un seul acteur _template → on l'emballe comme un fichier Transfert
  const data = json.module === MOD ? json : { documents: { Actor: [json], Item: [] } };
  const gen = buildConfigFromCsb(data, globalThis.MANHWA.config());
  if (!gen) return notify("error", "aucun acteur _template (fiche CSB) dans ce fichier.");
  const cfg = mergeConfig(globalThis.MANHWA.config(), gen.cfg);
  for (const n of gen.notes) notify("warn", n);
  if (file.mode === "apply") { await applyConfig(cfg); notify("info", "configuration appliquée (ancienne config sauvegardée). Recharge la page."); }
  else { foundry.utils.saveDataToFile(JSON.stringify(cfg, null, 2), "application/json", `manhwa-sheet-config-depuis-csb_${new Date().toISOString().slice(0, 10)}.json`); notify("info", "configuration téléchargée."); }
}

/* ------------------------------------------------------------------ */

function showReport(report, nSettings, opt) {
  const label = (cls) => cls === "Folder" ? "Dossiers" : (TYPES.find((t) => t.cls === cls)?.label ?? cls);
  const line = (bucket, title) => {
    const e = Object.entries(report[bucket]);
    if (!e.length) return "";
    return `<tr><th>${title}</th><td>${e.map(([c, n]) => `${n} ${label(c).toLowerCase()}`).join(", ")}</td></tr>`;
  };
  const errs = report.errors.length
    ? `<h3>Erreurs (${report.errors.length})</h3><ul class="lht-errors">${report.errors.slice(0, 60).map((e) => `<li>${esc(e)}</li>`).join("")}${report.errors.length > 60 ? "<li>…</li>" : ""}</ul>`
    : `<p class="lht-ok"><i class="fa-solid fa-check"></i> Aucune erreur.</p>`;
  const um = Object.entries(report.unmatched ?? {}).sort((a, b) => b[1] - a[1]);
  const umHtml = um.length ? `<h3>Conversion CSB — valeurs sans correspondance dans la config de cette partie (${um.length})</h3>
    <p class="lht-muted">Ces valeurs ont été laissées telles quelles ou vides ; ajoute-les dans la configuration Manhwa Sheet (rangs, raretés, éléments, catégories…) puis réimporte en mode « Écraser », ou corrige à la main.</p>
    <ul class="lht-errors lht-um">${um.slice(0, 80).map(([k, n]) => `<li>${esc(k)} <span class="lht-count">${n}</span></li>`).join("")}</ul>` : "";
  const content = `<div class="lht-panel">
    <table class="lht-report">
      ${line("created", "Créés")}${line("overwritten", "Écrasés")}${line("skipped", "Ignorés (déjà présents)")}${line("refiled", "Replacés dans leur dossier")}${line("ignoredType", "Ignorés (type non retenu)")}
      <tr><th>Réglages</th><td>${nSettings} valeur(s) appliquée(s)</td></tr>
      ${opt._um ? `<tr><th>Joueurs</th><td>${Object.values(opt._um.map).filter(Boolean).length}/${opt._um.src.size} associé(s)${opt.userFlags ? `, ${report.users} mis à jour (préférences, personnage)` : ""}</td></tr>` : ""}
    </table>
    ${errs}
    ${umHtml}
    <p class="lht-muted">Recharge la page (F5) pour que tout s'affiche proprement, en particulier les réglages de modules.</p>
  </div>`;
  DialogV2().wait({
    window: { title: "Transfert — Rapport d'import", icon: "fa-solid fa-clipboard-check" },
    classes: ["lht-dialog"], position: { width: 560 }, content,
    buttons: [{ action: "ok", label: "Fermer", icon: "fa-solid fa-check", default: true }],
    rejectClose: false
  });
  console.log(`${MOD} | rapport d'import`, report);
}

/* ------------------------------------------------------------------ */
/*  Réglages / API                                                     */
/* ------------------------------------------------------------------ */

/* Menu de réglages qui ouvre directement nos boîtes de dialogue */
class MenuShim extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "lht-menu-shim" };
  constructor(fn) { super({}); this.fn = fn; }
  async render() { await this.fn(); return this; }
  async _renderHTML() { return ""; }
  _replaceHTML() {}
}

Hooks.once("init", () => {
  game.settings.registerMenu(MOD, "export", {
    name: "Exporter cette partie",
    label: "Exporter…",
    hint: "Crée un fichier .json avec tout le contenu de la partie (documents, dossiers, playlists, réglages des modules).",
    icon: "fa-solid fa-file-export",
    type: class extends MenuShim { constructor() { super(exportDialog); } },
    restricted: true
  });
  game.settings.registerMenu(MOD, "import", {
    name: "Importer dans cette partie",
    label: "Importer…",
    hint: "Lit un fichier .json exporté depuis une autre partie et recrée son contenu ici.",
    icon: "fa-solid fa-file-import",
    type: class extends MenuShim { constructor() { super(importDialog); } },
    restricted: true
  });
  game.settings.registerMenu(MOD, "csbConfig", {
    name: "Config Manhwa Sheet depuis la fiche CSB",
    label: "Générer…",
    hint: "Lit un export CSB (fichier Transfert ou acteur _template) et recrée stats, monnaies, rangs, mondes, éveils, identité et listes dans la configuration Manhwa Sheet.",
    icon: "fa-solid fa-wand-magic-sparkles",
    type: class extends MenuShim { constructor() { super(configFromCsbDialog); } },
    restricted: true
  });
  game.settings.register(MOD, "sidebarButtons", {
    name: "Boutons dans la barre latérale",
    hint: "Ajoute deux boutons Exporter / Importer en bas de l'onglet Paramètres.",
    scope: "client", config: true, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  const m = game.modules.get(MOD);
  m.api = { export: exportDialog, import: importDialog, importOptions, runExport, runImport, configFromCsb: configFromCsbDialog, buildConfigFromCsb };
});

/* Boutons dans l'onglet Paramètres (v13 : <section class="settings"> dans #settings) */
Hooks.on("renderSettings", (app, html) => {
  if (!game.user.isGM || !game.settings.get(MOD, "sidebarButtons")) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".lht-sidebar")) return;
  const wrap = document.createElement("div");
  wrap.className = "lht-sidebar";
  wrap.innerHTML = `<h4 class="divider">Transfert de partie</h4>
    <button type="button" data-lht="export"><i class="fa-solid fa-file-export"></i> Exporter cette partie</button>
    <button type="button" data-lht="import"><i class="fa-solid fa-file-import"></i> Importer dans cette partie</button>
    ${game.system.id === "manhwa-sheet" ? `<button type="button" data-lht="csb"><i class="fa-solid fa-wand-magic-sparkles"></i> Config depuis la fiche CSB</button>` : ""}`;
  wrap.querySelector("[data-lht=export]").addEventListener("click", exportDialog);
  wrap.querySelector("[data-lht=import]").addEventListener("click", importDialog);
  wrap.querySelector("[data-lht=csb]")?.addEventListener("click", configFromCsbDialog);
  const anchor = root.querySelector("section.settings, #settings-game, .settings") ?? root;
  anchor.append(wrap);
});
