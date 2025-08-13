export type BlinkState = {
    closed: boolean;
    closedFrames: number;
    baselineEar: number;
    haveBaseline: boolean;
};

export function createBlinkState(): BlinkState {
    return { closed: false, closedFrames: 0, baselineEar: 0, haveBaseline: false };
}

export function updateEarBaseline(state: BlinkState, ear: number) {
    if (!state.closed) {
      if (!state.haveBaseline) {
        state.baselineEar = ear;
        state.haveBaseline = true;
      } else if (Math.abs(state.baselineEar - ear) < 0.02) {
        state.baselineEar = 0.9 * state.baselineEar + 0.1 * ear;
      }
    }
  }
  

export function evalBlink(state: BlinkState, ear: number, finalFrame = false) {
    if (!state.haveBaseline) return { pass: false, score: 0 };

    const CLOSED_T = state.baselineEar * 0.95;
    const OPEN_T = state.baselineEar * 0.98;
    const MIN_CLOSED_FRAMES = 1;

    const drop = Math.max(0, (state.baselineEar - ear) / Math.max(1e-6, state.baselineEar));
    const score = Math.min(1, drop / 0.05);

    let pass = false;
    if (!state.closed) {
        if (ear < CLOSED_T) {
            state.closed = true;
            state.closedFrames = 1;
        }
    } else {
        if (ear < CLOSED_T) {
            state.closedFrames += 1;
        }
        if ((ear > OPEN_T && state.closedFrames >= MIN_CLOSED_FRAMES) || (finalFrame && state.closedFrames >= MIN_CLOSED_FRAMES)) {
            state.closed = false;
            state.closedFrames = 0;
            pass = true;
        }
    }

    return { pass, score };
}