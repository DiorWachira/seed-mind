/**
 * Rule options. Every place where the sources disagree is a switch here, so the engine
 * can play either reading and saved games replay under the rules they were played with.
 * See RULES.md for the sources behind each default.
 */
export interface RuleOptions {
  /** D3: stages in which the nyumba keeps its special powers. */
  nyumbaStages: 'namua' | 'both';
  /** D3: the nyumba only works while it holds at least this many kete (0 = any amount). */
  nyumbaMinSeeds: number;
  /** D3b: in mtaji, a turn started from a working nyumba sows only two kete (taxing). */
  mtajiTaxing: boolean;
  /** D8: takasia / mtaji moja (a lone threatened pit may not be emptied by its owner). */
  takasia: 'off' | 'mtaji' | 'always';
  /**
   * D8b: which house is exempt from takasia. 'working' (default): a working nyumba.
   * 'pit': the nyumba pit always (Donkers 4.1a "if it is the house").
   */
  takasiaHouse?: 'working' | 'pit';
  /**
   * D9: in namua, a takasa may not start from a pit holding a single kete while another
   * front pit holds 2+, unless the house is still owned (Donkers 2.4c, K.I.B.A. 2.3.3). Default off.
   */
  namuaSingleKete?: boolean;
  /**
   * D12: a takasa from a lone kichwa toward the back row empties the front row.
   * 'loses' (default): legal, and loses at once (D7). 'illegal': not allowed (Donkers 2.4a, 3.5b).
   */
  kichwaToBack?: 'loses' | 'illegal';
  /**
   * D13: in a capture turn that ends in the owned nyumba, the stop/safari choice needs at least
   * this many kete there (default: nyumbaMinSeeds). Donkers 2.5b gives the choice with no minimum.
   */
  safariMinSeeds?: number;
}

export type RulesetId = 'zanzibar' | 'v1' | 'donkers';

/** Default: Zanzibar rules as transcribed by de Voogt (via rulespal, Wikipedia, K.I.B.A.). */
export const ZANZIBAR: RuleOptions = {
  nyumbaStages: 'both',
  nyumbaMinSeeds: 6,
  mtajiTaxing: true,
  takasia: 'mtaji',
};

/** The simplified rules Seed Mind 0.1.0 shipped with. Kept so old saved games replay exactly. */
export const V1: RuleOptions = {
  nyumbaStages: 'namua',
  nyumbaMinSeeds: 0,
  mtajiTaxing: false,
  takasia: 'off',
};

/**
 * Zanzibar rules as adapted for computer play by Donkers (PhD thesis "Nosce Hostem", 2003,
 * appendix C), from de Voogt's 1995 thesis: the nyumba only works in namua, no taxing in mtaji,
 * the single-kete namua restriction, no suicide from a lone kichwa. It replays the published
 * master game Ramadhan v Kijumbe (Zanzibar 1994) move for move (rules.donkers.test.ts).
 */
export const DONKERS: RuleOptions = {
  nyumbaStages: 'namua',
  nyumbaMinSeeds: 6,
  mtajiTaxing: false,
  takasia: 'mtaji',
  takasiaHouse: 'pit',
  namuaSingleKete: true,
  kichwaToBack: 'illegal',
  safariMinSeeds: 0,
};

export const DEFAULT_RULES = ZANZIBAR;

export const RULESETS: { id: RulesetId; name: string; note: string; rules: RuleOptions }[] = [
  { id: 'zanzibar', name: 'Zanzibar (de Voogt)', note: 'Full rules: the nyumba works in both stages while it holds 6+, mtaji taxing, takasia.', rules: ZANZIBAR },
  { id: 'donkers', name: 'Zanzibar, computer rules (Donkers)', note: 'De Voogt’s rules as written for computer play: the nyumba works only in namua, single-kete starts restricted, takasia.', rules: DONKERS },
  { id: 'v1', name: 'Simplified (Seed Mind 0.1)', note: 'The nyumba only matters during namua; no takasia.', rules: V1 },
];

export function rulesFor(id: RulesetId | undefined): RuleOptions {
  return RULESETS.find((r) => r.id === id)?.rules ?? V1;
}
