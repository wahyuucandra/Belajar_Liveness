"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getGestures, createSession, startSession, type Gesture } from "@/lib/api";

export default function Home() {
  const [availableGestures, setAvailableGestures] = useState<Gesture[]>([]);
  const [selectedGestures, setSelectedGestures] = useState<Gesture[]>([]);
  const [challengeCount, setChallengeCount] = useState(3);
  const [timeoutMs, setTimeoutMs] = useState(20000);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    getGestures().then(setAvailableGestures).catch(console.error);
  }, []);

  async function handleCreateSession() {
    if (!selectedGestures.length) {
      alert("Pilih minimal 1 gesture");
      return;
    }

    const payload = {
      user_id: "string",
      gestures: selectedGestures,
      challenge_count: challengeCount,
      challenge_min_duration_ms: 1500,
      challenge_max_duration_ms: 3000,
      overall_timeout_ms: timeoutMs,
      allow_retries: 0,
      metadata: { additionalProp1: {} },
    };

    const s = await createSession(payload);
    setLog((l) => [...l, "Created session: " + JSON.stringify(s)]);
    await startSession(s.session_id);
    setLog((l) => [...l, "Session started"]);
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Create Liveness Session</h1>

        {/* Card Form */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-4 shadow-lg">
          {/* Gestures */}
          <div>
            <div className="flex items-center justify-between">
              <label className="font-semibold">Select Gestures:</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-2 py-1 text-xs bg-gray-700 rounded"
                  onClick={() => setSelectedGestures(availableGestures)}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs bg-gray-700 rounded"
                  onClick={() => setSelectedGestures([])}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-2">
              {availableGestures.map((g) => (
                <label key={g} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-blue-500"
                    value={g}
                    checked={selectedGestures.includes(g)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGestures((prev) => [...prev, g]);
                      } else {
                        setSelectedGestures((prev) => prev.filter((x) => x !== g));
                      }
                    }}
                  />
                  <span>{g}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Challenge Count */}
          <div>
            <label className="font-semibold">Challenge Count:</label>
            <input
              type="number"
              value={challengeCount}
              min={1}
              max={selectedGestures.length || 5}
              onChange={(e) => setChallengeCount(Number(e.target.value))}
              className="ml-3 w-20 p-1 rounded bg-gray-700 border border-gray-600 text-white"
            />
            <span className="ml-2 text-sm text-gray-400">
              (max {selectedGestures.length || 0})
            </span>
          </div>

          {/* Timeout */}
          <div>
            <label className="font-semibold">Overall Timeout (ms):</label>
            <input
              type="number"
              value={timeoutMs}
              min={5000}
              step={1000}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              className="ml-3 w-32 p-1 rounded bg-gray-700 border border-gray-600 text-white"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleCreateSession}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
            >
              Create + Start Session
            </button>
            <Link
              href="/demo"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
            >
              Demo Mode
            </Link>
          </div>
        </div>

        {/* Log */}
        <div className="bg-gray-800 rounded-xl p-4 shadow-lg">
          <h3 className="font-semibold mb-2">Log</h3>
          <div className="bg-gray-900 rounded p-2 h-64 overflow-y-auto text-sm font-mono whitespace-pre-wrap">
            {log.length ? log.join("\n") : "No logs yet"}
          </div>
        </div>
      </div>
    </main>
  );
}
