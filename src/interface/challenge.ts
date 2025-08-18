export type ChallengeType =
  | "senyum"
  | "lihat_kanan"
  | "lihat_kiri"
  | "lihat_atas"
  | "lihat_bawah"
  | "buka_mulut"
  | "kedip"
  | "geleng_kepala"
  | "senyum_netral"
  | "anggukan_kepala";

export type ChallengeResult = {
  type: ChallengeType;
  success: boolean;
  score: number;
  frames: number;
  matchedFrames: number;
};

export interface Point { x: number; y: number }

// types & konstanta langkah (dipindah dari page)
export type StepId =
  | "look-left" | "blink" | "look-right" | "smile"
  | "open-mouth" | "nod" | "tilt" | "move-closer";

export interface Step {
  id: StepId;
  title: string;
  detail?: string;
  requiredCount: number;
}

export interface LogItem {
  time: string;
  level: "info" | "success" | "warn" | "error";
  text: string;
}

export const STEPS: Step[] = [
  { id: "look-left",  title: "Lihat ke kiri", detail: "Putar kepala ke kiri", requiredCount: 1 },
  { id: "blink",      title: "Kedipkan mata • Wajib", detail: "Tutup lalu buka kedua mata dengan jelas", requiredCount: 3 },
  { id: "look-right", title: "Lihat ke kanan", detail: "Putar kepala ke kanan", requiredCount: 1 },
  { id: "smile",      title: "Senyum", detail: "Tunjukkan ekspresi senyum", requiredCount: 1 },
  { id: "open-mouth", title: "Buka mulut", detail: "Buka dan tahan sebentar", requiredCount: 1 },
  { id: "nod",        title: "Angguk atas/bawah", detail: "Gerakkan kepala naik–turun", requiredCount: 1 },
  { id: "tilt",       title: "Miringkan kepala", detail: "Rotasi ke kiri/kanan (roll)", requiredCount: 1 },
  { id: "move-closer",title: "Dekatkan wajah", detail: "Gerakkan wajah mendekat kamera", requiredCount: 1 },
];

// util timestamp kecil
export const ts = (d = new Date()) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
