require('../_shared/classify.js'); const C = globalThis.TeamCalClassify;
const ev = require(process.argv[2] + '/all-events.json');
const by = {}, other = {};
for (const e of ev) { const k = C.nature(e.title); by[k] = (by[k] || 0) + 1; if (k === 'other') other[e.title] = (other[e.title] || 0) + 1; }
const tot = ev.length;
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${C.NATURES[k].emoji} ${k} ${n}`).join(' | '));
console.log(`\nReconnus : ${tot - (by.other || 0)}/${tot} = ${((1 - (by.other || 0) / tot) * 100).toFixed(1)} %`);
console.log('\nNon classés les plus fréquents :');
for (const [t, n] of Object.entries(other).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(n).padStart(3)} ${t}`);
// Échantillon par nature pour relire les faux positifs
for (const k of Object.keys(C.NATURES)) {
  if (k === 'other') continue;
  const s = [...new Set(ev.filter(e => C.nature(e.title) === k).map(e => e.title))].slice(0, 7);
  console.log(`\n[${k}] ${s.join(' · ')}`);
}
