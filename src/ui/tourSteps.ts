/**
 * Mwongozo (the guide): the steps of the first-run tour. Each step names the route it lives
 * on and a [data-tour] target; the tour navigates there and waits for the target. Text is in
 * English and translated via t() at render time.
 */
export interface TourStep {
  route: string;
  target: string;
  title: string;
  body: string;
}

export const TOUR: TourStep[] = [
  {
    route: '/', target: 'hero-board', title: 'A Bao board',
    body: 'Four rows of eight pits and 64 kete (seeds). You sit at the bottom: rows A (front) and B (back) are yours, C and D are Fundi’s. Point at any pit to read it.',
  },
  {
    route: '/', target: 'hero-coach', title: 'The coach light',
    body: 'Ochre means one thing in Seed Mind: the move a fundi (master) would make. It rings the pit to start from and rakes along the sowing path.',
  },
  {
    route: '/play', target: 'play-board', title: 'Your move',
    body: 'Pick a pit in your rows, then choose how to play it: which way to sow, or which kichwa (end pit) to sow captured kete from.',
  },
  {
    route: '/play', target: 'play-hand', title: 'Kete in hand',
    body: 'Each player starts with 22 kete mkononi (in hand). While you hold some, every turn begins by placing one into your front row. This first stage is namua.',
  },
  {
    route: '/play', target: 'play-coach', title: 'Ask the coach',
    body: 'The coach explains its pick in plain words. Select a pit and press “Why not?” on any option to see what that move would cost.',
  },
  {
    route: '/play', target: 'play-level', title: 'Choose Fundi’s strength',
    body: 'Nine levels, from Mwanafunzi (pupil) to Fundi (master). Low levels make human mistakes on purpose.',
  },
  {
    route: '/play', target: 'play-record', title: 'The game record',
    body: 'Every turn is written down. Select any ply to look back at the board then, take back a move, or start a pass-and-play game with a friend.',
  },
  {
    route: '/review', target: 'review-main', title: 'Review your game',
    body: 'Every move is scored against the engine. Your game grows like a tree: wide rings for strong moves, narrow ones where it cost you, and an ochre scar on each turning point.',
  },
  {
    route: '/reader', target: 'reader-photo', title: 'Bring in a real board',
    body: 'Photograph a real board from your seat, mark its four corners, and Seed Mind counts the seeds. Everything stays on your device.',
  },
  {
    route: '/reader', target: 'reader-grid', title: 'Check the counts',
    body: 'Pits the reader is unsure of get a dashed ring. Fix any count, check all 64 kete are there, then analyse or play on from the position.',
  },
  {
    route: '*', target: 'help-key', title: 'Find the guide again',
    body: 'Open Help here, or press ? anywhere, for the rules, a glossary of Bao words, the keyboard keys and this tour.',
  },
];

/** The steps for one screen ("tour this screen"); the last step is always kept. */
export function tourFor(route: string): number[] {
  const idx = TOUR.map((s, i) => (s.route === route ? i : -1)).filter((i) => i >= 0);
  return [...idx, TOUR.length - 1];
}
