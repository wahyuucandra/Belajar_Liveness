import { ChallengeType, Point } from "@/interface/challenge";
import { estimateHeadPoseFrom68 } from "@/utils/helpers/pose";
import { eyeAspectRatio, LEFT_EYE, RIGHT_EYE } from "@/utils/helpers/landmarks";
import { evalBlink, updateEarBaseline } from "./blink";

export type SimpleBlinkState = {
  closed: boolean;
  baselineEar: number;
  haveBaseline: boolean;
  closedFrames: number;
};

export type RepeatCounter = {
  count: number;
  latched?: boolean;
  phase?: "needSmile" | "needNeutral";
};

export type RepeatState = Partial<Record<ChallengeType, RepeatCounter>>;

export type FrameInputs = {
  pts: Point[];
  expressions?: Record<string, number> | null;
  blink?: SimpleBlinkState;
  yawHistory?: number[];
  pitchHistory?: number[];
  repeatState?: RepeatState;
};

export type Thresholds = {
  threshold: number;
  thresholdDeg: number;
  thresholdMouth: number;
  requiredRepeats?: number;
  neutralThreshold?: number;
};

export type FrameResult = {
  score: number;
  passFrame: boolean;
  hint: string;
  debug?: {
    ear?: number;
    baseline?: number;
    repeats?: number;
    phase?: string;
  };
};

function getCounter(inputs: FrameInputs, type: ChallengeType) {
  if (!inputs.repeatState) inputs.repeatState = {};
  if (!inputs.repeatState[type]) inputs.repeatState[type] = { count: 0 };
  return inputs.repeatState[type]!;
}

export function detectForType(
  type: ChallengeType,
  inputs: FrameInputs,
  th: Thresholds
): FrameResult {
  const required = th.requiredRepeats ?? 2;
  const neutralThreshold = th.neutralThreshold ?? 0.2;
  const pose = estimateHeadPoseFrom68(inputs.pts);
  const happy = inputs.expressions?.happy ?? 0;

  const topInner = inputs.pts[62];
  const bottomInner = inputs.pts[66];
  const leftM = inputs.pts[48];
  const rightM = inputs.pts[54];
  const mouthOpen =
    Math.hypot(topInner.x - bottomInner.x, topInner.y - bottomInner.y) /
    (Math.hypot(rightM.x - leftM.x, rightM.y - leftM.y) || 1);

  let score = 0;
  let passFrame = false;
  let hint = "";

  switch (type) {
    case "senyum":
      score = happy;
      passFrame = score >= th.threshold;
      hint = passFrame
        ? "Mantap! Pertahankan senyumnya."
        : "Senyum lebih lebar hingga pipi terangkat.";
      break;

    case "lihat_kanan": {
      const deg = -pose.yaw;
      score = clamp01(deg / th.thresholdDeg);
      passFrame = deg >= th.thresholdDeg;
      const sisa = Math.max(0, th.thresholdDeg - deg).toFixed(0);
      hint = passFrame
        ? "Sudah cukup ke kanan."
        : `Putar ${sisa}° lagi ke kanan.`;
      break;
    }

    case "lihat_kiri": {
      const deg = pose.yaw;
      score = clamp01(deg / th.thresholdDeg);
      passFrame = deg >= th.thresholdDeg;
      const sisa = Math.max(0, th.thresholdDeg - deg).toFixed(0);
      hint = passFrame
        ? "Sudah cukup ke kiri."
        : `Putar ${sisa}° lagi ke kiri.`;
      break;
    }

    case "lihat_bawah": {
      const deg = -pose.pitch;
      score = clamp01(deg / th.thresholdDeg);
      passFrame = deg >= th.thresholdDeg;
      const sisa = Math.max(0, th.thresholdDeg - deg).toFixed(0);
      hint = passFrame
        ? "Sudah cukup menunduk."
        : `Turunkan dagu ${sisa}° lagi.`;
      break;
    }

    case "lihat_atas": {
      const deg = pose.pitch;
      score = clamp01(deg / th.thresholdDeg);
      passFrame = deg >= th.thresholdDeg;
      const sisa = Math.max(0, th.thresholdDeg - deg).toFixed(0);
      hint = passFrame
        ? "Sudah cukup menengadah."
        : `Naikkan dagu ${sisa}° lagi.`;
      break;
    }

    case "buka_mulut":
      score = clamp01(mouthOpen / th.thresholdMouth);
      passFrame = mouthOpen >= th.thresholdMouth;
      hint = passFrame ? "Cukup, tahan sebentar." : "Buka mulut sedikit lagi.";
      break;

    case "kedip": {
      if (!inputs.blink) throw new Error("Blink state required");
      const leftEAR = eyeAspectRatio(inputs.pts, LEFT_EYE);
      const rightEAR = eyeAspectRatio(inputs.pts, RIGHT_EYE);
      const ear = (leftEAR + rightEAR) / 2;
      const bs = inputs.blink;
      const counter = getCounter(inputs, type);

      if (!bs.closed && Math.abs(bs.baselineEar - ear) < 0.02) {
        updateEarBaseline(bs, ear);
      } else if (!bs.haveBaseline) {
        updateEarBaseline(bs, ear);
      }

      const { pass, score: blinkScore } = evalBlink(bs, ear);
      score = blinkScore;

      if (pass && !counter.latched) {
        counter.count += 1;
        counter.latched = true;
      }
      if (!pass) counter.latched = false;

      passFrame = counter.count >= required;
      hint = passFrame
        ? `Kedip terdeteksi ${counter.count}x.`
        : `Kedip lagi ${Math.max(required - counter.count, 0)}x.`;

      return {
        score,
        passFrame,
        hint,
        debug: { ear, baseline: bs.baselineEar, repeats: counter.count }
      };
    }

    case "geleng_kepala": {
      if (!inputs.yawHistory) inputs.yawHistory = [];
      const counter = getCounter(inputs, type);
      inputs.yawHistory.push(pose.yaw);
      if (inputs.yawHistory.length > 20) inputs.yawHistory.shift();

      const minYaw = Math.min(...inputs.yawHistory);
      const maxYaw = Math.max(...inputs.yawHistory);
      const yawRange = maxYaw - minYaw;
      score = Math.min(1, yawRange / (th.thresholdDeg * 2));

      const swingEnough = yawRange >= th.thresholdDeg * 2;
      if (swingEnough && !counter.latched) {
        counter.count++;
        counter.latched = true;
      }
      if (!swingEnough) counter.latched = false;

      passFrame = counter.count >= required;
      hint = passFrame
        ? `Geleng ${counter.count}x terdeteksi.`
        : `Goyang kiri↔kanan ${required - counter.count}x lagi.`;
      break;
    }

    case "anggukan_kepala": {
      if (!inputs.pitchHistory) inputs.pitchHistory = [];
      const counter = getCounter(inputs, type);
      inputs.pitchHistory.push(pose.pitch);
      if (inputs.pitchHistory.length > 20) inputs.pitchHistory.shift();

      const minPitch = Math.min(...inputs.pitchHistory);
      const maxPitch = Math.max(...inputs.pitchHistory);
      const pitchRange = maxPitch - minPitch;
      score = Math.min(1, pitchRange / (th.thresholdDeg * 2));

      const swingEnough = pitchRange >= th.thresholdDeg * 2;
      if (swingEnough && !counter.latched) {
        counter.count++;
        counter.latched = true;
      }
      if (!swingEnough) counter.latched = false;

      passFrame = counter.count >= required;
      hint = passFrame
        ? `Anggukan ${counter.count}x terdeteksi.`
        : `Anggukkan kepala ${required - counter.count}x lagi.`;
      break;
    }

    case "senyum_netral": {
      const counter = getCounter(inputs, type);
      if (!counter.phase) counter.phase = "needSmile";

      if (counter.phase === "needSmile" && happy >= th.threshold) {
        counter.phase = "needNeutral";
      } else if (
        counter.phase === "needNeutral" &&
        happy <= neutralThreshold
      ) {
        counter.count++;
        counter.phase = "needSmile";
      }

      score = happy;
      passFrame = counter.count >= required;
      hint = passFrame
        ? `Senyum→netral ${counter.count}x terdeteksi.`
        : `Ulangi senyum→netral ${required - counter.count}x lagi.`;

      return {
        score,
        passFrame,
        hint,
        debug: { repeats: counter.count, phase: counter.phase }
      };
    }
  }

  return { score, passFrame, hint, debug: { repeats: getCounter(inputs, type).count } };
}

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}