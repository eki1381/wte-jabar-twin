// Scenario parameters shared by the Skenario view and the map's "Status skenario" layer.
import { simulate, BASE } from './sim.js';

export const P = { ...BASE };
let last = null, lastKey = '';
export function run(C, K) {
  const key = JSON.stringify(P);
  if (!last || key !== lastKey) { last = simulate(C, K, P); lastKey = key; }
  return last;
}
