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
  "senyum_netral",
  "anggukan_kepala"
];

export function getRandomChallenges(count: number): ChallengeType[] {
  const wajibPool: ChallengeType[] = ["kedip", "geleng_kepala", "senyum_netral", "anggukan_kepala"];
  const wajib = [...wajibPool].sort(() => Math.random() - 0.5).slice(0, 2);
  const sisa = allChallenges.filter((c) => !wajib.includes(c));
  const tambahan = [...sisa].sort(() => Math.random() - 0.5).slice(0, Math.max(0, count - wajib.length));

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
  if (t === "senyum_netral") return "Senyum Netral";
  if (t === "anggukan_kepala") return "Anggukan Kepala";
  
  return t;
}

export function readableAction(t: ChallengeType) {
  switch (t) {
    case "senyum":
      return "Tersenyum lebar";
    case "senyum_netral":
      return "Senyum lalu kembali netral (2x)";
    case "lihat_kanan":
      return "Lihat ke kanan";
    case "lihat_kiri":
      return "Lihat ke kiri";
    case "lihat_atas":
      return "Lihat ke atas";
    case "lihat_bawah":
      return "Lihat ke bawah";
    case "buka_mulut":
      return "Buka mulut";
    case "kedip":
      return "Kedipkan kedua mata";
    case "geleng_kepala":
      return "Gelengkan kepala (kiri↔kanan)";
    case "anggukan_kepala":
      return "Anggukkan kepala (atas↔bawah)";
    default:
      return readableType(t);
  }
}

export function instructionLines(type: ChallengeType, thresholdDeg: number, thresholdMouth: number) {
  const umum = [
    "Pastikan wajah berada di tengah layar pada jarak ±30–50 cm.",
    "Nyalakan pencahayaan dari depan, hindari backlight.",
    "Jangan memakai masker/kacamata gelap; rapikan rambut dari wajah.",
    "Tahan posisi hingga penghitung selesai atau indikator match muncul.",
  ];

  const spesifik: Record<ChallengeType, string[]> = {
    senyum: [
      "Tersenyum hingga pipi terangkat dan gigi terlihat.",
      "Pertahankan senyum sejenak sampai skor mencukupi.",
    ],
    senyum_netral: [
      "Tersenyum lalu kembali ke ekspresi netral, ulangi dua kali.",
      "Pastikan perubahan ekspresi terlihat jelas setiap kali.",
    ],
    lihat_kanan: [
      `Putar kepala ke kanan ±${thresholdDeg}° tanpa menggerakkan bahu.`,
      "Hentikan saat indikator hijau muncul.",
    ],
    lihat_kiri: [
      `Putar kepala ke kiri ±${thresholdDeg}° tanpa menggerakkan bahu.`,
      "Hentikan saat indikator hijau muncul.",
    ],
    lihat_atas: [
      `Arahkan dagu sedikit naik ±${thresholdDeg}°.`,
      "Fokus tetap ke kamera bila memungkinkan.",
    ],
    lihat_bawah: [
      `Arahkan dagu turun ±${thresholdDeg}°.`,
      "Jaga wajah tetap di frame.",
    ],
    buka_mulut: [
      `Buka mulut hingga rasio bukaan ≥ ${thresholdMouth.toFixed(2)}.`,
      "Tidak perlu berbicara; cukup buka dan tahan sebentar.",
    ],
    kedip: [
      "Tutup dan buka kedua mata sekali dengan jelas.",
      "Jika tidak terdeteksi, kedip sedikit lebih tegas.",
    ],
    geleng_kepala: [
      `Goyangkan kepala kiri↔kanan hingga rentang ≥ ${thresholdDeg * 2}°.`,
      "Lakukan 1–2 ayunan pelan.",
    ],
    anggukan_kepala: [
      `Gerakkan kepala atas↔bawah hingga rentang ≥ ${thresholdDeg * 2}°.`,
      "Lakukan 1–2 ayunan pelan.",
    ],
  } as any;

  return { umum, spesifik: spesifik[type] ?? [] };
}