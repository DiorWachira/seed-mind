import type { Advice, PlyAnalysis } from './coach';
import type { RuleOptions } from './ruleset';
import type { Move, Position } from './types';

export type WorkerRequest =
  | { id: number; type: 'think'; pos: Position; level: number; rules: RuleOptions }
  | { id: number; type: 'advise'; pos: Position; rules: RuleOptions }
  | { id: number; type: 'analyse'; positions: Position[]; moves: Move[]; rules: RuleOptions };

/** A request without its id (distributes over the union). */
export type WorkerRequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

export type WorkerResponse =
  | { id: number; type: 'think'; move: Move | null; score: number; depth: number }
  | { id: number; type: 'advise'; advice: Advice | null }
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'analyse'; plies: PlyAnalysis[] }
  | { id: number; type: 'error'; message: string };
