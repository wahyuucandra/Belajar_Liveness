"use client";
import React from "react";

export function Badge({ variant = "neutral", children }: { variant?: "success" | "error" | "neutral"; children: React.ReactNode }) {
  const cls =
    variant === "success"
      ? "bg-green-100 text-green-800"
      : variant === "error"
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-800";
  return <span className={`inline-block text-sm px-3 py-2 rounded-xl ${cls}`}>{children}</span>;
}