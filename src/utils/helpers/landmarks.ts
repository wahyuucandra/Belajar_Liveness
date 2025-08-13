import { Point } from "@/interface/challenge";

export const LEFT_EYE = [36, 37, 38, 39, 40, 41];
export const RIGHT_EYE = [42, 43, 44, 45, 46, 47];

export function eyeAspectRatio(pts: Point[], idx: number[]) {
  const p = idx.map((i) => pts[i]);
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]) || 1);
}