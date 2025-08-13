import { ChallengeType } from "@/interface/challenge";

export const allChallenges: ChallengeType[] = [
  "senyum",
  "lihat_kanan",
  "lihat_kiri",
  "lihat_atas",
  "lihat_bawah",
  "buka_mulut",
  "kedip",
  "geleng_kepala",
];

export function getRandomChallenges(count: number): ChallengeType[] {
  const wajib: ChallengeType[] = ["kedip", "geleng_kepala"];
  const sisa = allChallenges.filter((c) => !wajib.includes(c));
  const shuffledSisa = [...sisa].sort(() => Math.random() - 0.5);
  const tambahan = shuffledSisa.slice(0, Math.max(0, count - wajib.length));
  return [...wajib, ...tambahan].sort(() => Math.random() - 0.5);
}

export function readableType(t: ChallengeType) {
  if (t === "senyum") return "Senyum";
  if (t === "lihat_kanan") return "Lihat Kanan";
  if (t === "lihat_kiri") return "Lihat Kiri";
  if (t === "lihat_atas") return "Lihat Atas";
  if (t === "lihat_bawah") return "Lihat Bawah";
  if (t === "buka_mulut") return "Buka Mulut";
  if (t === "kedip") return "Kedip";
  if (t === "geleng_kepala") return "Geleng Kepala";
  return t;
}