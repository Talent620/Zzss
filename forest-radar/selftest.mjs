import { makeNodes, makeLinks, RTI, Sim, PLOT } from "./engine.mjs";
const nodes = makeNodes(), links = makeLinks(nodes);
const rti = new RTI(nodes, links, { lambda: 3 });
const sim = new Sim(nodes, links, { noise: 0.35 });
let errs = [], detected = 0, frames = 60;
for (let i = 0; i < frames; i++) {
  const f = sim.frame(0.2, true);
  const r = rti.step(f.drops, 1.0);
  if (r.person && f.truth) { detected++; errs.push(Math.hypot(r.person.x - f.truth.x, r.person.y - f.truth.y)); }
  if (i % 12 === 0 && r.person) console.log(`f${i}: truth=(${f.truth.x.toFixed(1)},${f.truth.y.toFixed(1)}) est=(${r.person.x.toFixed(1)},${r.person.y.toFixed(1)}) err=${(errs[errs.length-1]).toFixed(2)}m conf=${r.max.toFixed(2)}`);
}
const mean = errs.reduce((a,b)=>a+b,0)/errs.length;
console.log(`\nDetekcja: ${detected}/${frames} klatek · średni błąd lokalizacji: ${mean.toFixed(2)} m (plot ${PLOT.W}×${PLOT.H} m, 8 węzłów, 28 łączy)`);
// clear-area test (no person): should rarely detect
let falsePos = 0; for (let i=0;i<40;i++){ const f=sim.frame(0.2,false); if(rti.step(f.drops,1.0).person) falsePos++; }
console.log(`Fałszywe alarmy gdy CZYSTO: ${falsePos}/40`);
