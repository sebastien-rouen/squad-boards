/**
 * La MATRICE MÉTÉO et ses briques — partagées par le Dashboard (layouts.js) et
 * les pages d'approfondissement (meteo-pages.js). Classes `d3-*` de
 * mockup-3/style.css et deep.css.
 */
const D = require('./data');
const M = require('./data-meteo');
const { esc } = require('./ui-dash');

const timePct = D.TODAY.pct;   // 70 % du sprint
const PI_TIME = 32;             // 32 % du PI

/** Une case : niveau, glyphe, chiffre, unité. */
const cell = (level, big, sub, extra = '') => `<td class="d3-cell d3-cell--${level}${extra}"><i>${M.WEATHER[level]}</i><b>${big}</b><small>${sub}</small></td>`;

/** Les cinq cases d'une équipe. */
const teamCells = (t) => [
    cell(M.weatherRel(t.sprint, timePct), `${t.sprint} %`, 'des points'),
    cell(M.weatherRel(t.pi, PI_TIME), `${t.pi} %`, 'du périmètre'),
    cell(M.weatherOf(t.health), t.health, `${t.blocked} bloqué${t.blocked > 1 ? 's' : ''}`),
    t.support == null ? cell('none', '—', 'pas de SLA') : cell(M.weatherOf(t.support), `${t.support} %`, 'SLA tenu'),
    t.mood == null ? cell('none', '—', 'aucun vote') : cell(M.weatherOf(t.mood * 20), t.mood.toFixed(1), '/5'),
].join('');

/** Niveau global d'une équipe = le pire de ses cinq domaines (une ⛈️ ne se moyenne pas). */
const ORDER = ['storm', 'rain', 'cloud', 'sun', 'none'];
const teamLevel = (t) => {
    const levels = [M.weatherRel(t.sprint, timePct), M.weatherRel(t.pi, PI_TIME), M.weatherOf(t.health), t.support == null ? 'none' : M.weatherOf(t.support), t.mood == null ? 'none' : M.weatherOf(t.mood * 20)].filter((l) => l !== 'none');
    return levels.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] || 'none';
};

/**
 * La matrice. `teams` (défaut : les 4), `grouped` (en-têtes de ligne produit),
 * `selected` (ligne mise en avant), `compact`.
 */
const meteoMatrix = ({ teams = M.TEAMS4, grouped = false, selected = 'Vega', compact = false } = {}) => {
    const row = (t) => `<tr class="${t.name === selected ? 'is-selected' : ''}" style="--team:${t.color}">
      <th><span class="d3-team"><i></i>${esc(t.name)}<small>${t.members} pers.</small></span></th>
      ${teamCells(t)}
      <td class="d3-open"><a class="ui-btn ui-btn--ghost" href="06-equipe.html">Fiche ›</a></td>
    </tr>`;
    let body = '';
    if (grouped) {
        const groups = [...new Set(teams.map((t) => t.group))];
        body = groups.map((g) => {
            const list = teams.filter((t) => t.group === g);
            const worst = list.map(teamLevel).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
            return `<tr class="d3-grp-row"><th colspan="7"><span>${M.WEATHER[worst]} ${esc(g)}</span><small>${list.length} équipes · ${list.reduce((s, t) => s + t.members, 0)} pers.</small></th></tr>${list.map(row).join('')}`;
        }).join('');
    } else body = teams.map(row).join('');
    return `
  <table class="d3-matrix${compact ? ' d3-matrix--compact' : ''}${grouped ? ' d3-matrix--grouped' : ''}">
    <thead><tr><th>Équipe</th>${M.DOMAINS.map((d) => `<th>${d.icon} ${d.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
};

/** L'échelle en légende (toujours visible). */
const scale = ({ withNone = true } = {}) => `<div class="d3-scale">${[['sun', `≥ ${M.THRESHOLDS.sun} · beau`], ['cloud', `${M.THRESHOLDS.cloud}–${M.THRESHOLDS.sun - 1} · variable`], ['rain', `${M.THRESHOLDS.rain}–${M.THRESHOLDS.cloud - 1} · attention`], ['storm', `< ${M.THRESHOLDS.rain} · critique`]].concat(withNone ? [['none', 'pas de donnée']] : []).map(([w, l]) => `<span class="d3-scale-it d3-cell--${w}"><i>${M.WEATHER[w]}</i>${l}</span>`).join('')}</div>`;

/** Les cinq pastilles d'une équipe (en-tête de fiche, panneau) — cliquables vers les sections. */
const pills = (t) => {
    const items = [
        ['sprint', M.weatherRel(t.sprint, timePct), `${t.sprint} %`], ['pi', M.weatherRel(t.pi, PI_TIME), `${t.pi} %`], ['health', M.weatherOf(t.health), t.health],
        ['support', t.support == null ? 'none' : M.weatherOf(t.support), t.support == null ? '—' : `${t.support} %`], ['mood', t.mood == null ? 'none' : M.weatherOf(t.mood * 20), t.mood == null ? '—' : t.mood.toFixed(1)],
    ];
    return `<nav class="d3-pills" aria-label="Domaines">${items.map(([k, lv, v], i) => `<a class="d3-pill d3-cell--${lv}" href="#sec-${k}"><i>${M.WEATHER[lv]}</i><span>${M.DOMAINS[i].icon} ${M.DOMAINS[i].label}</span><b>${v}</b></a>`).join('')}</nav>`;
};

/** Bandeau météo d'une équipe (fiche). */
const teamHero = (t, { text }) => {
    const lv = teamLevel(t);
    return `
  <header class="d3-hero d3-hero--team" style="--team:${t.color}">
    <div class="d3-hero-main"><i>${M.WEATHER[lv]}</i><div><small>Météo de l'équipe</small><h2><span class="d3-team"><i></i>${esc(t.name)}</span> — ${M.WEATHER_LABEL[lv]}</h2><p>${text}</p></div></div>
    ${pills(t)}
  </header>`;
};

/** Frise des prévisions par PI. */
const forecastStrip = () => `
  <div class="d3-fc">${M.PI_FORECAST.map((p) => {
      let lv = 'none', big = '—', sub = p.note;
      if (p.state === 'past') { lv = M.weatherOf(p.pct); big = `${p.pct} %`; sub = `${p.delivered}/${p.committed} pts · ${p.note}`; }
      if (p.state === 'current') { lv = M.weatherRel(p.pct, p.timePct); big = `${p.pct} %`; sub = `${p.delivered}/${p.committed} pts · ${p.note}`; }
      if (p.state === 'planned') { lv = 'rain'; big = `${Math.round((p.committed / p.capacity) * 100)} %`; sub = `${p.committed} engagés / ${p.capacity} de base`; }
      return `<article class="d3-fc-col d3-fc-col--${p.state} d3-cell--${lv}">
        <header><small>${p.state === 'past' ? 'passé' : p.state === 'current' ? 'en cours' : p.state === 'planned' ? 'prévision' : 'à planifier'}</small><b>PI ${p.num}</b></header>
        <i>${M.WEATHER[lv]}</i><strong>${big}</strong><span>${sub}</span>
      </article>`;
  }).join('')}</div>`;

module.exports = { cell, teamCells, teamLevel, meteoMatrix, scale, pills, teamHero, forecastStrip, timePct, PI_TIME };
