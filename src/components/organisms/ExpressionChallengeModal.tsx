"use client";
import React from "react";
import { ChallengeResult, ChallengeType } from "@/interface/challenge";
import { instructionLines, readableType } from "@/utils/helpers/challengeHelpers";
import { VideoHUD } from "@/components/molecules/VideoHUD";
import { useExpressionChallenge } from "@/hooks/useExpressionChallenge";
import { OverlayShell } from "@/components/atoms/OverlayShell";
import { InstructionPanel } from "@/components/molecules/InstructionPanel";
import { BottomInfo } from "@/components/atoms/BottomInfo";

export function ExpressionChallengeModal({
  type,
  open = true,
  durationSec = 5,
  threshold = 0.8,
  thresholdDeg = 18,
  thresholdMouth = 0.3,
  onClose,
  onResult,
  onLog,
}: {
  type: ChallengeType;
  open?: boolean;
  durationSec?: number;
  threshold?: number;
  thresholdDeg?: number;
  thresholdMouth?: number;
  onClose: (reason: "auto" | "cancel") => void;
  onResult: (r: ChallengeResult) => void;
  onLog?: (line: string) => void;
}) {
  const { videoRef, state, ready, error } = useExpressionChallenge(type, {
    open,
    durationSec,
    threshold,
    thresholdDeg,
    thresholdMouth,
    onResult,
    onClose,
    onLog,
  });

  if (!open) return null;

  const { umum, spesifik } = instructionLines(type, thresholdDeg, thresholdMouth);

  return (
    <OverlayShell onCancel={() => onClose("cancel")} title={<></>}>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-0"
        muted
        playsInline
        autoPlay
      />

      <div className="absolute inset-x-0 top-0 p-4 md:p-6 text-white z-30">
        <div className="inline-flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 backdrop-blur pointer-events-none">
          <span className="text-sm/5 opacity-80">Verifikasi</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold">{readableType(type)}</span>
        </div>

        <div className="pointer-events-auto">
          <InstructionPanel
            type={type}
            umum={umum}
            spesifik={spesifik}
            hint={state.hint}
          />
        </div>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <VideoHUD countdown={state.countdown} bestScore={state.bestScore} />
      </div>

      <BottomInfo
        ready={!!ready}
        error={error}
        bestScore={state.bestScore}
        frames={state.frames}
        matched={state.matched}
        ear={state.ear}
        baselineEar={state.baselineEar}
      />

      <div className="absolute inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/90 animate-pulse" />
              <span>Kamera aktif selama challenge</span>
            </div>
            <button
              onClick={() => onClose("cancel")}
              className="px-4 py-2 rounded-xl bg-white/90 hover:bg-white text-gray-900 shadow"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </OverlayShell>
  );
}