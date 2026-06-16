// Asset preparation pipeline.
//
// Copies the GLB files the game needs out of the raw KayKit packs (dropped in
// ./assets-source, or wherever ASSETS_SOURCE points) into the Vite public asset
// folder (client/public/assets), using deterministic output paths that match
// client/src/game/AssetManifest.ts.
//
// It is intentionally resilient: it scans the source recursively and matches by
// filename, so the exact internal folder layout of each pack does not matter.
// Files that ship only as .fbx/.obj are ignored here; convert them to .glb first
// (FBX2glTF or @gltf-transform) and re-run. Phase 1 only requires the animated
// character GLB.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(repoRoot, process.env.ASSETS_SOURCE ?? "assets-source");
const outDir = path.resolve(repoRoot, "client/public/assets");

/**
 * Each target declares where it should land and how to recognize its source
 * file. `match` receives the lowercased basename.
 */
const TARGETS = [
  {
    out: "characters/animated-character.glb",
    required: true,
    description: "KayKit animated character (PrototypePete + 30 clips)",
    match: (name) => name.endsWith(".glb") && name.includes("animatedcharacter"),
  },
  {
    out: "characters/variety/bear.glb",
    required: false,
    description: "Variety pack bear (static prop/skin, for later phases)",
    match: (name) => name.endsWith(".glb") && name.includes("character_bear"),
  },
  {
    out: "characters/variety/dog.glb",
    required: false,
    description: "Variety pack dog (static prop/skin, for later phases)",
    match: (name) => name.endsWith(".glb") && name.includes("character_dog"),
  },
  {
    out: "characters/variety/duck.glb",
    required: false,
    description: "Variety pack duck (static prop/skin, for later phases)",
    // Note: the source pack misspells this file as "characer_duck".
    match: (name) => name.endsWith(".glb") && /chara?cer_duck/.test(name),
  },
];

async function walk(dir) {
  /** @type {string[]} */
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log(`[assets] source: ${sourceDir}`);
  console.log(`[assets] output: ${outDir}`);

  const sourceExists = await fs
    .stat(sourceDir)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!sourceExists) {
    console.error(
      `[assets] source folder not found: ${sourceDir}\n` +
        `         Drop the KayKit packs there (or set ASSETS_SOURCE) and re-run.`,
    );
    process.exitCode = 1;
    return;
  }

  const allFiles = await walk(sourceDir);
  console.log(`[assets] scanned ${allFiles.length} files`);

  let copied = 0;
  let missingRequired = 0;

  for (const target of TARGETS) {
    const src = allFiles.find((f) => target.match(path.basename(f).toLowerCase()));
    if (!src) {
      const level = target.required ? "ERROR" : "skip";
      console.log(`[assets] ${level}: not found -> ${target.out} (${target.description})`);
      if (target.required) missingRequired += 1;
      continue;
    }
    const dest = path.join(outDir, target.out);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    console.log(`[assets] copied ${path.relative(sourceDir, src)} -> ${target.out}`);
    copied += 1;
  }

  console.log(`[assets] done: ${copied} copied, ${missingRequired} required missing`);
  if (missingRequired > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[assets] failed:", err);
  process.exitCode = 1;
});
