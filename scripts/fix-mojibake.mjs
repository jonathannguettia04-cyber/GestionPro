#!/usr/bin/env node
// Répare le texte « double-encodé » (UTF-8 lu comme Windows-1252 puis ré-enregistré) : « Ã©tape » -> « étape ».
// Usage : node scripts/fix-mojibake.mjs [--check] [dossiers ou fichiers...]   (par défaut : src supabase tests scripts README.md)
// --check : ne modifie rien, liste les fichiers touchés et sort en erreur (code 1) s'il y en a.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const roots = args.filter((a) => !a.startsWith("--"));
const targets = (roots.length ? roots : ["src", "supabase", "tests", "scripts", "README.md"]).filter(existsSync);
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".sql", ".json", ".sh"]);
const SKIP = new Set(["node_modules", ".next", ".git", "fix-mojibake.mjs"]);   // le script contient des exemples de texte corrompu

const cp1252 = new TextDecoder("windows-1252");
const toByte = new Map();
for (let b = 0; b < 256; b++) toByte.set(cp1252.decode(Uint8Array.of(b)), b);
const cont = [...toByte].filter(([, b]) => b >= 0x80 && b <= 0xbf).map(([c]) => c).join("").replace(/[\\\]^-]/g, "\\$&");
const re = new RegExp(`[ÂÃÅâð][${cont}]{1,3}`, "g");
const utf8 = new TextDecoder("utf-8", { fatal: true });

function repairRun(run) {
  for (let len = run.length; len >= 2; len--) {
    try {
      const d = utf8.decode(Uint8Array.from([...run.slice(0, len)].map((c) => toByte.get(c))));
      if ([...d].length === 1) return d + run.slice(len);
    } catch { /* essai plus court */ }
  }
  return run;
}

function fixText(text) {
  let n = 0, s = text;
  const bom = /^(\uFEFF|ï»¿)+/;
  if (bom.test(s)) { s = s.replace(bom, ""); n++; }
  for (let pass = 0; pass < 3; pass++) {            // jusqu'à 3 niveaux de double-encodage
    let changed = 0;
    s = s.replace(re, (m) => { const r = repairRun(m); if (r !== m) changed++; return r; });
    n += changed;
    if (!changed) break;
  }
  return [s, n];
}

function* walk(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const e of readdirSync(path)) if (!SKIP.has(e)) yield* walk(join(path, e));
  } else if (EXT.has(extname(path))) yield path;
}

let files = 0, total = 0;
for (const t of targets) for (const f of walk(t)) {
  const [fixed, n] = fixText(readFileSync(f, "utf8"));
  if (!n) continue;
  files++; total += n;
  console.log(`${check ? "à réparer" : "réparé"} : ${f} (${n})`);
  if (!check) writeFileSync(f, fixed, "utf8");
}
console.log(files ? `${files} fichier(s), ${total} correction(s).` : "Aucun texte corrompu détecté.");
if (check && files) process.exit(1);
