import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Falsy = false | 0 | "" | null | undefined;
export function cx(...items: Array<string | Falsy>) {
  return items.filter(Boolean).join(" ");
}
