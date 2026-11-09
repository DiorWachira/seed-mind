import type { Advice, PlyAnalysis } from '../engine/coach';
import type { WorkerRequest, WorkerRequestBody, WorkerResponse } from '../engine/protocol';
import { DEFAULT_RULES, type RuleOptions } from '../engine/ruleset';
import type { Move, Position } from '../engine/types';

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void };

/** Promise wrapper around one engine Web Worker. Requests run one at a time, in order. */
class EngineClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('../engine/engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.onProgress?.(m.done, m.total); return; }
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
  }

  private send(req: WorkerRequestBody, onProgress?: Pending['onProgress']): Promise<WorkerResponse> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async think(pos: Position, level: number, rules: RuleOptions = DEFAULT_RULES): Promise<Move | null> {
    const r = await this.send({ type: 'think', pos, level, rules });
    return r.type === 'think' ? r.move : null;
  }

  async advise(pos: Position, rules: RuleOptions = DEFAULT_RULES): Promise<Advice | null> {
    const r = await this.send({ type: 'advise', pos, rules });
    return r.type === 'advise' ? r.advice : null;
  }

  async analyse(positions: Position[], moves: Move[], rules: RuleOptions, onProgress?: Pending['onProgress']): Promise<PlyAnalysis[]> {
    const r = await this.send({ type: 'analyse', positions, moves, rules }, onProgress);
    return r.type === 'analyse' ? r.plies : [];
  }
}

const clients = new Map<string, EngineClient>();
/** Separate workers per job so a long review never blocks the game. */
export function engine(name: 'play' | 'coach' | 'review' = 'play'): EngineClient {
  let c = clients.get(name);
  if (!c) { c = new EngineClient(); clients.set(name, c); }
  return c;
}
