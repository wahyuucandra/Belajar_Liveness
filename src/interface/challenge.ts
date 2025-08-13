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