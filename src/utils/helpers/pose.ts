import { Point } from "@/interface/challenge";

export function estimateHeadPoseFrom68(pts: Point[]) {
    if (!pts || pts.length < 68) return { roll: 0, pitch: 0, yaw: 0 };
    const L = pts[36];
    const R = pts[45];
    const N = pts[30];
    const LM = pts[48];
    const RM = pts[54];
    const dxEye = R.x - L.x;
    const dyEye = R.y - L.y;
    const roll = (Math.atan2(dyEye, dxEye) * 180) / Math.PI;
    const eyeMid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
    const mouthMid = { x: (LM.x + RM.x) / 2, y: (LM.y + RM.y) / 2 };
    const faceH = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y) || 1;
    const eyeW = Math.hypot(dxEye, dyEye) || 1;
    const yaw = ((N.x - eyeMid.x) / eyeW) * 60;
    const norm = (N.y - eyeMid.y) / faceH;
    const pitch = (norm - 0.5) * 90 * -1;
    return { roll, pitch, yaw };
  }