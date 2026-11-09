import { RAMADHAN_KIJUMBE_1994, replayDonkers } from '../src/engine/goldenGames';
import { DONKERS, V1, ZANZIBAR } from '../src/engine/ruleset';
const variants = {
  donkers: DONKERS, donkersSafari6: { ...DONKERS, safariMinSeeds: undefined }, donkersHouseWorking: { ...DONKERS, takasiaHouse: 'working' as const },
  zanzibar: ZANZIBAR, v1: V1,
};
for (const [n, r] of Object.entries(variants)) {
  const res = replayDonkers(RAMADHAN_KIJUMBE_1994.moves, r);
  console.log(n.padEnd(22), res.ok ? `replays all ${res.positions.length - 1} plies` : `fails at ply ${res.ply + 1} (move ${Math.floor(res.ply / 2) + 1} ${res.ply % 2 ? 'North' : 'South'} "${res.token}") with ${res.matches} matches`);
}
