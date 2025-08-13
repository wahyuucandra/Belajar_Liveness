export type Gesture =
  | "HEAD_SHAKE"
  | "HEAD_NOD"
  | "LOOK_LEFT"
  | "LOOK_RIGHT"
  | "BLINK"
  | "MOUTH_OPEN"
  | "SMILE";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;
const BEARER = process.env.NEXT_PUBLIC_DEV_BEARER!;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BEARER}`,
  };
}

export async function getGestures(): Promise<Gesture[]> {
  const r = await fetch(`${BASE}/v1/gestures`, { headers: headers() });
  const j = await r.json();
  return j.items.map((g: any) => g);
}

export interface CreateSessionPayload {
  user_id?: string;
  gestures: Gesture[];
  challenge_count: number;
  challenge_min_duration_ms?: number;
  challenge_max_duration_ms?: number;
  overall_timeout_ms: number;
  allow_retries?: number;
  metadata?: Record<string, any>;
}

export async function createSession(payload: {
    user_id?: string;
    gestures: Gesture[];
    challenge_count: number;
    challenge_min_duration_ms?: number;
    challenge_max_duration_ms?: number;
    overall_timeout_ms: number;
    allow_retries?: number;
    metadata?: Record<string, any>;
  }) {
    const r = await fetch(`${BASE}/v1/sessions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return r.json();
  }
  

export async function startSession(sessionId: string) {
  const r = await fetch(`${BASE}/v1/sessions/${sessionId}/start`, {
    method: "POST",
    headers: headers(),
  });
  return r.json();
}
