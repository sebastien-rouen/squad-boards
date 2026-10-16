/**
 * Sections « à retenir pour estimer » d'une description de ticket (volet Description du Poker).
 *
 * Les descriptions sont du HTML (ADF rendu à la synchro). Une section y est annoncée de deux façons,
 * constatées en base :
 *   • un vrai titre `h1`–`h6`, souvent avec un emoji (« ✅ Critères d'acceptance et TNR ») ;
 *   • un PARAGRAPHE-LIBELLÉ court, en gras ou terminé par « : » (« DOD : », « Critères d'acceptations : »).
 * Une mention dans une phrase (« les critères d'acceptance ont TOUS été validés… ») n'en est pas une.
 * Contenu d'une section = éléments frères suivants, jusqu'au prochain titre de niveau ≤ (sous-titres
 * compris : « Scénario 1 » sous « Critères d'acceptance ») ; un paragraphe-libellé s'arrête au prochain
 * titre ou libellé. Sections vides écartées ; une section incluse dans une autre n'est pas reprise.
 */

/** Familles épinglées, dans l'ordre d'affichage. */
export const DESC_KINDS = [
    { key: 'accept', icon: '✅', label: "Critères d'acceptation", re: /crit[eè]res?\s+d.{0,2}accept|acceptance criteria|crit[eè]res?\s+de\s+(succ[eè]s|validation)|\bTNR\b/i },
    { key: 'rules',  icon: '📏', label: 'Règles de gestion',      re: /r[eè]gles?\s+(de\s+gestion|m[eé]tier)/i },
    { key: 'dod',    icon: '🏁', label: 'Definition of Done',     re: /\bdod\b|definition of done/i },
    { key: 'watch',  icon: '⚠️', label: "Points d'attention",     re: /points?\s+d.{0,2}attention|d[ée]pendances?|\brisques?\b/i },
];

const _txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/** Niveau de titre : 1–6 pour `hN`, 7 pour un paragraphe-libellé, 0 sinon. */
function _level(el) {
    if (!el || el.nodeType !== 1) return 0;
    if (/^H[1-6]$/.test(el.tagName)) return Number(el.tagName[1]);
    if (el.tagName === 'P') {
        const t = _txt(el);
        if (!t || t.length > 70) return 0;
        const bold = _txt(el.querySelector('strong, b'));
        if ((bold && bold.length >= t.length * 0.6) || /:\s*$/.test(t)) return 7;
    }
    return 0;
}

/**
 * @param {string} html  description rendue
 * @returns {{ key, icon, label, title, html, count }[]}  sections épinglées, dans l'ordre de DESC_KINDS
 */
export function descSections(html) {
    if (!html || typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = doc.getElementById('r');
    const consumed = new Set();
    const found = [];
    for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6, p')) {
        if (consumed.has(h)) continue;
        const lvl = _level(h);
        if (!lvl) continue;
        // Emoji de tête retiré : la famille a déjà son icône (« ✅ ✅ Critères… » sinon).
        const title = _txt(h).replace(/\s*:\s*$/, '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '') || _txt(h);
        const kind = DESC_KINDS.find(k => k.re.test(title));
        if (!kind) continue;
        const parts = [];
        for (let sib = h.nextElementSibling; sib; sib = sib.nextElementSibling) {
            const l = _level(sib);
            if (l && (lvl === 7 ? true : l <= lvl)) break;
            parts.push(sib);
        }
        parts.forEach(p => { consumed.add(p); p.querySelectorAll('*').forEach(x => consumed.add(x)); });
        const body = parts.map(p => p.outerHTML).join('');
        const probe = doc.createElement('div'); probe.innerHTML = body;
        if (!_txt(probe) && !probe.querySelector('img')) continue;   // section annoncée mais vide
        // Seul compteur fiable : des « Scénario … » explicites (titre OU paragraphe gras). Pas de compte
        // de puces : le contenu n'est pas forcément une liste (« 29 points » ne voulait rien dire).
        const scen = [...probe.querySelectorAll('h1, h2, h3, h4, h5, h6, p')].filter(x => /^\W*sc[ée]nario\b/i.test(_txt(x))).length;
        const count = scen ? `${scen} scénario${scen > 1 ? 's' : ''}` : '';
        found.push({ ...kind, title, html: body, count });
    }
    return DESC_KINDS.flatMap(k => found.filter(f => f.key === k.key));
}

/**
 * Bloc « 📌 L'essentiel pour estimer » (vide si aucune section) : puces de navigation (une par section,
 * `data-pd-go`) puis sections REPLIABLES — une longue liste de scénarios n'écrase plus les règles.
 * `closed` = rangs repliés par l'utilisateur (l'appelant les garde : la popin Poker se re-rend toutes les 3 s).
 */
export function descSectionsHtml(sections, esc, closed = null) {
    if (!sections.length) return '';
    return `<section class="pd-pinned" aria-label="L'essentiel pour estimer">
        <div class="pd-pinned-title">📌 L'essentiel pour estimer</div>
        ${sections.length > 1 ? `<div class="pd-nav">${sections.map((s, i) => `<button type="button" class="pd-chip pd-sec--${s.key}" data-pd-go="${i}" title="Aller à « ${esc(s.title)} »">${s.icon} ${esc(s.label)}${s.count ? ` · ${esc(s.count)}` : ''}</button>`).join('')}</div>` : ''}
        ${sections.map((s, i) => `<details class="pd-sec pd-sec--${s.key}" data-pd-sec="${i}"${closed?.has(i) ? '' : ' open'}>
            <summary class="pd-sec-head"><span class="pd-sec-ico" aria-hidden="true">${s.icon}</span><b>${esc(s.title)}</b>${s.count ? `<span class="pd-sec-n">${esc(s.count)}</span>` : ''}</summary>
            <div class="pd-sec-body">${s.html}</div>
        </details>`).join('')}
    </section>`;
}

/**
 * Prêt à estimer ? 'empty' = pas de description ; 'missing' = description sans critère d'acceptation
 * repéré ; 'ok' sinon. Même repérage que le volet du Poker (page Affinage : ⚠️ dans la file).
 */
export function acceptanceStatus(html) {
    if (!String(html || '').replace(/<[^>]*>/g, '').trim()) return 'empty';
    return descSections(html).some(s => s.key === 'accept') ? 'ok' : 'missing';
}
