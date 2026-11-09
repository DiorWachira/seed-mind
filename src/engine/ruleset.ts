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
}

export type RulesetId = 'zanzibar' | 'v1';

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

export const DEFAULT_RULES = ZANZIBAR;

export const RULESETS: { id: RulesetId; name: string; note: string; rules: RuleOptions }[] = [
  { id: 'zanzibar', name: 'Zanzibar (de Voogt)', note: 'Full rules: the nyumba works in both stages while it holds 6+, mtaji taxing, takasia.', rules: ZANZIBAR },
  { id: 'v1', name: 'Simplified (Seed Mind 0.1)', note: 'The nyumba only matters during namua; no takasia.', rules: V1 },
];

export function rulesFor(id: RulesetId | undefined): RuleOptions {
  return RULESETS.find((r) => r.id === id)?.rules ?? V1;
}
