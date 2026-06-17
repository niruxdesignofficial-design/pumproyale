// Asset preparation pipeline.
//
// Copies the assets the game needs out of the raw KayKit packs (in ./assets-source
// or ASSETS_SOURCE) into client/public/assets, using deterministic paths that
// match the client asset manifests.
//
// Three kinds of copy:
//  - single GLB files (characters, animation rigs, the crown prop): self-contained
//    GLBs, copied by filename.
//  - whole platformer folders (.gltf + .bin + shared texture): copied as a unit so
//    the GLTF external references resolve.
//  - the legacy PrototypePete animated character, kept as a fallback.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(repoRoot, process.env.ASSETS_SOURCE ?? "assets-source");
const outDir = path.resolve(repoRoot, "client/public/assets");

/** Single self-contained GLB files, matched by lowercased basename. */
const FILE_TARGETS = [
  // KayKit Adventurers (rigged, Rig_Medium).
  { out: "characters/knight.glb", required: true, match: (n) => n === "knight.glb" },
  { out: "characters/barbarian.glb", required: true, match: (n) => n === "barbarian.glb" },
  { out: "characters/mage.glb", required: true, match: (n) => n === "mage.glb" },
  { out: "characters/rogue.glb", required: true, match: (n) => n === "rogue.glb" },
  { out: "characters/ranger.glb", required: true, match: (n) => n === "ranger.glb" },
  // Shared animation clips for the Rig_Medium skeleton.
  {
    out: "animations/Rig_Medium_MovementBasic.glb",
    required: true,
    match: (n) => n === "rig_medium_movementbasic.glb",
  },
  {
    out: "animations/Rig_Medium_General.glb",
    required: true,
    match: (n) => n === "rig_medium_general.glb",
  },
  // Crown / trophy prop (Mini-Game Variety star).
  { out: "props/star.glb", required: false, match: (n) => n === "star.gltf.glb" },
  // Legacy fallback character.
  {
    out: "characters/animated-character.glb",
    required: false,
    match: (n) => n.endsWith(".glb") && n.includes("animatedcharacter"),
  },
];

/** Whole platformer color folders (.gltf + .bin + texture), matched by path suffix. */
const FOLDER_TARGETS = [
  { suffix: path.join("gltf", "neutral"), out: "platformer/neutral" },
  { suffix: path.join("gltf", "blue"), out: "platformer/blue" },
];

async function walkFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function walkDirs(dir) {
  const dirs = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      dirs.push(full);
      dirs.push(...(await walkDirs(full)));
    }
  }
  return dirs;
}

async function copyFolder(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await fs.copyFile(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    count += 1;
  }
  return count;
}

async function main() {
  console.log(`[assets] source: ${sourceDir}`);
  console.log(`[assets] output: ${outDir}`);

  const sourceExists = await fs
    .stat(sourceDir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!sourceExists) {
    console.error(`[assets] source folder not found: ${sourceDir}`);
    process.exitCode = 1;
    return;
  }

  const allFiles = await walkFiles(sourceDir);
  const allDirs = await walkDirs(sourceDir);
  console.log(`[assets] scanned ${allFiles.length} files / ${allDirs.length} dirs`);

  let copied = 0;
  let missingRequired = 0;

  for (const target of FILE_TARGETS) {
    const src = allFiles.find((f) => target.match(path.basename(f).toLowerCase()));
    if (!src) {
      if (target.required) {
        console.log(`[assets] ERROR: not found -> ${target.out}`);
        missingRequired += 1;
      } else {
        console.log(`[assets] skip: not found -> ${target.out}`);
      }
      continue;
    }
    const dest = path.join(outDir, target.out);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    console.log(`[assets] copied ${path.basename(src)} -> ${target.out}`);
    copied += 1;
  }

  for (const target of FOLDER_TARGETS) {
    const src = allDirs.find((d) => d.endsWith(target.suffix));
    if (!src) {
      console.log(`[assets] skip: folder not found -> ${target.out} (${target.suffix})`);
      continue;
    }
    const n = await copyFolder(src, path.join(outDir, target.out));
    console.log(`[assets] copied ${n} files -> ${target.out}/`);
    copied += 1;
  }

  console.log(`[assets] done: ${copied} targets copied, ${missingRequired} required missing`);
  if (missingRequired > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[assets] failed:", err);
  process.exitCode = 1;
});
