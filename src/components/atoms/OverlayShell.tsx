"use client";
import React from "react";

export function OverlayShell({ children, onCancel, title }: { children: React.ReactNode; onCancel: () => void; title: React.ReactNode; }) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative h-full w-full p-4 md:p-8 flex items-center justify-center">
        <div className="relative h-full w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl bg-black ring-1 ring-white/10">
          {children}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>
      </div>
    </div>
  );
}