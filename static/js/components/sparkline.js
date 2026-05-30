/**
 * Sparkline SVG ultra-léger — pas de dépendance Chart.js.
 * Génère un mini graph inline (largeur fluide) pour les KPIs.
 *
 * Usage : sparkline([12, 18, 15, 22, 19], { color, areaFill, width, height })
 * Retourne une string SVG prête à innerHTML.
 */

export function sparkline(values, opts = {}) {
    if (!values || values.length < 2) return '';
    const {
        width = 80,
        height = 22,
        color = '#3b82f6',
        areaFill = true,
        showLast = true,
        showMinMax = false,
    } = opts;

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const dx = width / (values.length - 1);
    const yAt = v => height - 2 - ((v - min) / range) * (height - 4);

    const points = values.map((v, i) => `${(i * dx).toFixed(1)},${yAt(v).toFixed(1)}`);
    const path = `M ${points.join(' L ')}`;
    const areaPath = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

    const lastIdx = values.length - 1;
    const lastX = (lastIdx * dx).toFixed(1);
    const lastY = yAt(values[lastIdx]).toFixed(1);

    const maxIdx = values.indexOf(max);
    const minIdx = values.indexOf(min);

    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        ${areaFill ? `<path d="${areaPath}" fill="${color}" fill-opacity="0.12"/>` : ''}
        <path d="${path}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        ${showMinMax && maxIdx !== lastIdx ? `<circle cx="${(maxIdx * dx).toFixed(1)}" cy="${yAt(max).toFixed(1)}" r="1.8" fill="#10b981"/>` : ''}
        ${showMinMax && minIdx !== lastIdx ? `<circle cx="${(minIdx * dx).toFixed(1)}" cy="${yAt(min).toFixed(1)}" r="1.8" fill="#ef4444"/>` : ''}
        ${showLast ? `<circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${color}"/>` : ''}
    </svg>`;
}

/** Calcule la tendance entre 2 dernières valeurs : retourne { delta, pct, dir }. */
export function trend(values) {
    if (!values || values.length < 2) return null;
    const cur = values[values.length - 1];
    const prev = values[values.length - 2];
    const delta = cur - prev;
    const pct = prev !== 0 ? Math.round((delta / Math.abs(prev)) * 100) : null;
    const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return { cur, prev, delta, pct, dir };
}

/** Helper pour rendu inline d'un trend : "↗ +12% (24)" */
export function trendChip(values, opts = {}) {
    const t = trend(values);
    if (!t) return '';
    const { invertGood = false, unit = '' } = opts; // ex. invertGood=true pour blockers (baisse = bien)
    const isGood = invertGood ? t.delta < 0 : t.delta > 0;
    const arrow = t.dir === 'up' ? '↗' : t.dir === 'down' ? '↘' : '→';
    const cls = t.dir === 'flat' ? 'flat' : (isGood ? 'good' : 'bad');
    const pctStr = t.pct != null ? `${t.pct >= 0 ? '+' : ''}${t.pct}%` : '';
    return `<span class="trend-chip trend-chip--${cls}" title="Précédent : ${t.prev}${unit}">${arrow} ${pctStr}</span>`;
}
