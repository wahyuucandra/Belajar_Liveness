"use client";
import { Badge } from "@/components/atoms/Badge";
import ChallengeDetail from "@/components/molecules/ChallengeDetail";
import { ExpressionChallengeModal } from "@/components/organisms/ExpressionChallengeModal";
import { ChallengeResult, ChallengeType } from "@/interface/challenge";
import { getRandomChallenges, readableType } from "@/utils/helpers/challengeHelpers";
import React, { useMemo, useState } from "react";

export default function Page() {
  const [selected, setSelected] = useState<ChallengeType>("senyum");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<null | ChallengeResult>(null);
  const [log, setLog] = useState<string[]>([]);

  const [queue, setQueue] = useState<ChallengeType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [allResults, setAllResults] = useState<ChallengeResult[]>([]);

  const keyForModal = useMemo(
    () => (queue.length ? `${queue[currentIndex]}-${currentIndex}` : `${selected}-single`),
    [queue, currentIndex, selected]
  );

  const reset = () => { setLog([]); setResult(null); setAllResults([]); };

  const start = () => { reset(); setQueue([]); setCurrentIndex(0); setOpen(true);};
  const startTriple = () => { reset(); setQueue(getRandomChallenges(3)); setCurrentIndex(0); setOpen(true);};
  const startN = (n: number) => { reset(); setQueue(getRandomChallenges(n)); setCurrentIndex(0); setOpen(true);};

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Face Challenge (Popup)</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Pilih challenge, lalu mulai. Kamera aktif hanya saat popup terbuka.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto,1fr] items-start">
          <label htmlFor="challenge" className="text-sm pt-2 sm:pt-0">Pilih challenge:</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select
              id="challenge"
              aria-label="Pilih jenis challenge"
              className="px-3 py-2 rounded-xl bg-white shadow border text-sm w-full"
              value={selected}
              onChange={(e) => {
                const val = e.target.value as ChallengeType;
                setSelected(val);
                setLog([]);
                setResult(null);
              }}
            >
              <option value="senyum">Senyum</option>
              <option value="lihat_kanan">Lihat Kanan</option>
              <option value="lihat_kiri">Lihat Kiri</option>
              <option value="lihat_atas">Lihat Atas</option>
              <option value="lihat_bawah">Lihat Bawah</option>
              <option value="buka_mulut">Buka Mulut</option>
              <option value="kedip">Kedip</option>
              <option value="geleng_kepala">Geleng Kepala</option>
            </select>

            <button
              className="w-full px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              onClick={start}
            >
              Mulai Challenge
            </button>
            <button
              className="w-full px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700"
              onClick={startTriple}
            >
              3 Challenge Acak
            </button>
            <button
              className="w-full px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700"
              onClick={() => startN(5)}
            >
              5 Challenge Acak
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/40 min-h-[140px] flex items-center justify-center text-gray-400 text-sm">
            Klik “Mulai Challenge” untuk membuka kamera
          </div>

          <div className="bg-white rounded-2xl shadow p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Log</h3>
              <button
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200"
                onClick={() => setLog([])}
              >
                Bersihkan
              </button>
            </div>

            <ul className="text-sm text-gray-700 space-y-1 max-h-[38vh] sm:max-h-[50vh] lg:max-h-[60vh] overflow-auto mt-2">
              {log.map((l, i) => (
                <li key={i} className="whitespace-pre-wrap">{l}</li>
              ))}
            </ul>

            {result && log.length > 1 &&(
              <div className="mt-4">
                {allResults.length > 1 ? (
                  ChallengeDetail(allResults)
                ) : (
                  <Badge variant={result.success ? "success" : "error"}>
                    Hasil {readableType(result.type)} → {result.success ? "Lolos" : "Gagal"} — score {result.score.toFixed(2)}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <ExpressionChallengeModal
          key={keyForModal}
          type={queue.length ? queue[currentIndex] : selected}
          durationSec={4}
          threshold={0.8}
          thresholdDeg={18}
          thresholdMouth={0.3}
          onClose={(reason) => {
            if (reason === "cancel") { setOpen(false); setQueue([]); setCurrentIndex(0); return; }
            setOpen(false);
          }}
          onResult={(r) => {
            setLog((L) => [
              `Selesai: ${readableType(r.type)} — ${r.success ? "LOLOS" : "GAGAL"} | bestScore=${r.score.toFixed(2)} | frames=${r.frames} | matched=${r.matchedFrames}`,
              ...L,
            ]);

            if (queue.length) {
              setAllResults((prev) => {
                const updated = [...prev, r];
                if (currentIndex < queue.length - 1) {
                  setCurrentIndex(currentIndex + 1);
                  setTimeout(() => setOpen(true), 0);
                } else {
                  const finalSuccess = updated.every((ch) => ch.success);
                  setResult({ type: r.type, success: finalSuccess, score: 0, frames: 0, matchedFrames: 0 });
                  setOpen(false); setQueue([]); setCurrentIndex(0);
                }
                return updated;
              });
            } else {
              setResult(r);
            }
          }}
          onLog={(line) => setLog((L) => [line, ...L])}
        />
      )}
    </div>
  );
}