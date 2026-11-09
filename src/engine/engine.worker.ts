/// <reference lib="webworker" />
import { advise, analysePly } from './coach';
import type { PlyAnalysis } from './coach';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { chooseMove } from './search';

const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'think') {
      const r = chooseMove(req.pos, req.level, req.rules);
      post({ id: req.id, type: 'think', move: r.best?.move ?? null, score: r.score, depth: r.depth });
    } else if (req.type === 'advise') {
      post({ id: req.id, type: 'advise', advice: advise(req.pos, undefined, req.rules) });
    } else {
      const plies: PlyAnalysis[] = [];
      for (let k = 0; k < req.moves.length; k++) {
        plies.push(analysePly(req.positions[k], req.moves[k], k, undefined, req.rules));
        post({ id: req.id, type: 'progress', done: k + 1, total: req.moves.length });
      }
      post({ id: req.id, type: 'analyse', plies });
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
