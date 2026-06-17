import * as THREE from "three";
import type { MinigameMap } from "@party-royale/shared";
import { makeProp } from "./VarietyProps";

/**
 * Builds a minigame map's static visuals entirely from KayKit Mini-Game Variety
 * props (tiles, goals, barriers, decor) placed to match the server colliders.
 * Props must be preloaded (preloadVarietyProps) so this is synchronous.
 */
export function buildMapView(map: MinigameMap): THREE.Group {
  const group = new THREE.Group();
  for (const p of map.props) {
    const obj = makeProp(p.model, p.size ?? 2, p.anchor ?? "bottom");
    if (!obj) continue;
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.y = p.yaw ?? 0;
    group.add(obj);
  }
  return group;
}
