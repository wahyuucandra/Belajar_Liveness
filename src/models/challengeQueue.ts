import { ChallengeResult, ChallengeType } from "@/interface/challenge";

export class ChallengeQueue {
    private queue: ChallengeType[] = [];
    private index = 0;
    private results: ChallengeResult[] = [];
  
    constructor(initial?: ChallengeType[]) {
      if (initial) this.setQueue(initial);
    }
  
    setQueue(items: ChallengeType[]) {
      this.queue = items;
      this.index = 0;
      this.results = [];
    }
  
    get current(): ChallengeType | null {
      return this.queue.length ? this.queue[this.index] : null;
    }
  
    get hasNext(): boolean {
      return this.index < this.queue.length - 1;
    }
  
    pushResult(r: ChallengeResult) {
      this.results.push(r);
    }
  
    next() {
      if (this.hasNext) this.index += 1;
    }
  
    clear() {
      this.queue = [];
      this.index = 0;
      this.results = [];
    }
  
    finalize(): { success: boolean; results: ChallengeResult[] } {
      const success = this.results.every((r) => r.success);
      return { success, results: this.results };
    }
  
    get length() { return this.queue.length; }
    get position() { return this.index; }
  }