/**
 * Chart zoom — agrandit n'importe quel graphique du board dans une popin plein écran.
 *
 * Principe :
 *  - Un bouton « agrandir » (icône) est injecté automatiquement dans chaque
 *    `.chart-container` qui contient un `<canvas>` enregistré dans le registre de
 *    `charts.js` (via getChartMeta).
 *  - Au clic, une popin alignée en haut de l'écran s'ouvre (fondu + léger zoom),
 *    redessine le graphique en grand dans un canvas dédié, et affiche une légende
 *    enrichie + une explication contextuelle selon le type de graphique.
 *  - Navigation précédent/suivant entre tous les graphiques zoomables de la page,
 *    SANS animation de transition (changement instantané, conformément à la demande).
 *
 * Aucune dépendance npm : Vanilla JS, réutilise Chart.js déjà chargé.
 */

import { getChartMeta, rerenderChart, getChartControls, getChartCopyList } from './charts.js';
import { copyChartImage } from './chart_copy.js';
import { store } from '../state.js';
import { toast, ticketModalOnTop } from '../utils.js';

// ── Explications contextuelles par type de graphique ───────────────────────────
// `read` : comment lire le graphique. `tip` : interprétation / signal d'alerte.
const _EXPLAIN = {
    burndown: {
        read: 'La courbe <strong>idéale</strong> (pointillés gris) descend linéairement jusqu’à 0. La courbe <strong>réelle</strong> (bleu) suit les points réellement terminés ; la ligne <strong>tickets</strong> (orange) compte le nombre de tickets restants.',
        tip: 'Si le réel reste <em>au-dessus</em> de l’idéal, le sprint prend du retard. Une chute brutale en fin de sprint trahit souvent des tickets clôturés en masse au dernier moment.',
    },
    burnup: {
        read: 'La ligne <strong>Scope</strong> (pointillés) matérialise le total de points engagés ; la zone <strong>Terminé</strong> (vert) monte vers ce scope.',
        tip: 'Un Scope qui grimpe en cours de sprint signale un <em>scope creep</em> (ajout de travail). L’écart entre les deux courbes = ce qu’il reste à livrer.',
    },
    cfd: {
        read: 'Chaque bande colorée représente un statut. L’<strong>épaisseur</strong> d’une bande = nombre de tickets dans ce statut à un instant donné.',
        tip: 'Une bande qui s’élargit (ex. « En cours » ou « Revue ») révèle un <em>goulot d’étranglement</em>. Un flux sain montre des bandes parallèles et régulières.',
    },
    piflow: {
        read: 'Une bande par <strong>état du rapport JIRA</strong> (00.TODO en haut → 05.DEVELOPMENT_DONE en bas), en story points ou en tickets, <strong>jour ouvré par jour ouvré</strong> sur le PI. Chaque jour rejoue l’historique réel des tickets (sprint, statut, points à cette date) : rien n’est interpolé. Le haut de la pile = périmètre du PI ce jour-là ; le dernier jour = le tableau sous le graphique.',
        tip: 'Une bande <strong>03 / 04</strong> qui s’épaissit = travail qui s’accumule en cours ou en test (goulot). Le vert doit monter régulièrement vers le haut de la pile ; une pile qui <em>baisse</em> signale des tickets retirés du PI, une pile qui monte des ajouts.',
    },
    throughput: {
        read: 'Nombre de tickets <strong>terminés par jour</strong>. Les barres grises sont les week-ends ; la courbe bleue est la moyenne glissante sur 3 jours.',
        tip: 'Un débit régulier est meilleur qu’un pic isolé. Des jours à zéro répétés en milieu de sprint annoncent un retard de livraison.',
    },
    cycletime: {
        read: {
            intro: 'vue <strong>Frise</strong> (par défaut) — une ligne par ticket livré, rangée par date de démarrage, sur le calendrier. Toutes les durées sont en <strong>jours ouvrés</strong>.',
            items: [
                '<strong>Segment clair</strong> : l’attente, de la création du ticket à son démarrage.',
                '<strong>Segment coloré</strong> : le cycle time, du démarrage à la livraison — 🟢 ≤ médiane · 🟡 jusqu’au 85ᵉ percentile · 🔴 au-delà.',
                '<strong>Chiffre en bout de ligne</strong> : le cycle time du ticket, puis son lead (responsable).',
                '<strong>Zones grisées</strong> : week-ends et jours fériés, non comptés.',
                '<strong>▸ 31.2</strong> : début d’un sprint — un segment qui le traverse a débordé sur le sprint suivant.',
                '<strong>⚠ devant un ticket</strong> : son lead time (création → livraison) dépasse le 85ᵉ percentile.',
                '<strong>◂ créé le …</strong> : l’attente commence avant la période affichée (coupée au bord).',
                '<strong>Vues Barres et Nuage</strong> (sélecteur « Vue ») : mêmes mesures sans le calendrier — barres = attente + cycle time empilés, triables ; nuage = un point par ticket à sa date de livraison, pour la tendance.',
            ],
        },
        tip: {
            intro: 'ce qu’il faut regarder.',
            items: [
                '<strong>Longs segments clairs</strong> : le travail attend avant d’être commencé (priorisation, files amont).',
                '<strong>Beaucoup de lignes qui se chevauchent</strong> : trop de travail en parallèle — le cycle time s’allonge.',
                '<strong>Segments qui traversent un ▸ début de sprint</strong> : engagements reportés.',
                '<strong>🔴 et ⚠</strong> : tickets à creuser en rétro (découpage, dépendance, blocage) — clic = fiche du ticket.',
                '<strong>Copier la liste</strong> (en-tête) : ces tickets et leurs chiffres, prêts à coller dans Slack ou Confluence.',
            ],
        },
    },
    wipage: {
        read: {
            intro: 'vue <strong>Frise</strong> (par défaut) — chaque ticket <strong>encore en cours</strong>, de sa mise en travail jusqu’à aujourd’hui. Âges en <strong>jours ouvrés</strong>.',
            items: [
                '<strong>Segment clair</strong> : l’attente entre la création et la mise en cours.',
                '<strong>Segment coloré</strong> : le temps en cours — 🟢 sain · 🟡 ≥ 70 % du seuil · 🔴 ≥ seuil (85ᵉ percentile du cycle time des tickets terminés).',
                '<strong>Hachures rouges, 🚫</strong> : ticket bloqué (drapeau JIRA ou statut « bloqué », ex. Retour au demandeur), depuis le début du blocage jusqu’à aujourd’hui — « 🚫 bloqué 4 j » en bout de ligne.',
                '<strong>Chiffre en bout de ligne</strong> : l’âge du ticket, son statut (ou son blocage) et son lead.',
                '<strong>Trait rouge « Aujourd’hui »</strong> : là où s’arrêtent toutes les lignes.',
                '<strong>Zones grisées</strong> : week-ends et fériés, non comptés · <strong>▸ 31.2</strong> : début d’un sprint.',
                '<strong>◂ depuis le …</strong> : ticket commencé avant la fenêtre affichée (12 semaines).',
                '<strong>Vue Barres</strong> (sélecteur « Vue ») : les mêmes âges, du plus ancien au plus récent, seuils tracés.',
            ],
        },
        tip: {
            intro: 'un ticket bien au-delà du seuil rouge est probablement bloqué ou trop gros.',
            items: [
                '<strong>🚫 Hachures longues</strong> : blocage qui dure — escalader (dépendance, demandeur, autre équipe).',
                '<strong>🔴</strong> : à débloquer en priorité (daily) — clic = fiche du ticket.',
                '<strong>Beaucoup de lignes ouvertes en même temps</strong> : limiter le WIP plutôt que démarrer.',
                '<strong>Ligne qui traverse plusieurs ▸</strong> : ticket reporté de sprint en sprint, à redécouper.',
            ],
        },
    },
    velocity: {
        read: 'Vélocité (points livrés) par sprint. La barre violette est le <strong>buffer engagé</strong>, la courbe cyan la moyenne glissante (3 sprints), les pointillés la moyenne globale et l’objectif.',
        tip: {
            items: [
                'Couleur des barres = performance vs moyenne',
                'le dernier sprint est mis en avant',
                'le sprint en cours (gris) n’entre pas dans les stats',
                'Shift+clic pour comparer plusieurs sprints',
            ],
        },
    },
    pivelocity: {
        read: 'Pour chaque sprint du PI : <strong>Estimé</strong> (gris), <strong>Buffer</strong> (violet) et <strong>Réalisé</strong> (vert). La ligne orange est l’objectif de vélocité.',
        tip: 'Comparer Réalisé vs Estimé donne le taux d’avancement du PI. Un buffer systématiquement non consommé suggère une sur-estimation.',
    },
    piburnup: {
        read: 'Cumul des Story Points <strong>livrés</strong> au fil des sprints du PI : une ligne par équipe, la ligne épaisse étant le total. Les pointillés gris matérialisent l’<strong>engagement</strong> du PI.',
        tip: 'La courbe totale doit rejoindre la ligne d’engagement en fin de PI. Un écart qui se creuse en milieu de PI annonce un objectif difficilement atteignable.',
    },
    status: {
        read: 'Répartition des tickets par statut. Le centre affiche le <strong>pourcentage terminé</strong> et le ratio terminés / total.',
        tip: 'Une part importante en « Bloqué » ou « Revue » concentre le risque. Idéalement la majorité bascule progressivement vers « Terminé ».',
    },
    type: {
        read: 'Nombre de tickets par <strong>type</strong> (story, bug, tâche, support…).',
        tip: 'Une forte proportion de bugs ou de support rogne la capacité disponible pour la valeur produit. À surveiller PI après PI.',
    },
};

const _ZOOM_CANVAS_ID = 'zoom-chart-canvas';
let _overlay = null;
let _ids = [];        // liste ordonnée des canvasId zoomables présents dans la page
let _idx = -1;        // index courant dans _ids
let _opts = {};       // état des contrôles (mode/tri/filtres) du graphique courant
// Explication en PANNEAU LATÉRAL (bouton « ? », touche « ? ») : fermée par défaut — sous le graphique,
// elle lui prenait sa hauteur (retour utilisateur). État MÉMORISÉ d'une visite à l'autre.
const _LS_EXPLAIN = 'sb-chart-zoom-explain';
let _explainOpen = (() => { try { return localStorage.getItem(_LS_EXPLAIN) === '1'; } catch { return false; } })();
function _setExplainOpen(open) {
    _explainOpen = open;
    try { localStorage.setItem(_LS_EXPLAIN, open ? '1' : '0'); } catch { /* navigation privée : état non mémorisé */ }
    _syncExplain();
    // Le panneau change la LARGEUR du tracé : on redessine une fois la mise en page appliquée, pour que
    // le pas des dates (_dateAxis, charts.js) soit recalculé — sinon elles se chevauchent à nouveau.
    if (_overlay && !_overlay.classList.contains('hidden')) requestAnimationFrame(() => _renderCurrent());
}
/** Panneau + bouton « ? » alignés sur l'état (bouton masqué pour un graphique sans explication). */
function _syncExplain() {
    if (!_overlay) return;
    const panel = _overlay.querySelector('#chart-zoom-explain');
    const btn = _overlay.querySelector('#chart-zoom-help');
    const has = !!panel.innerHTML.trim();
    btn.hidden = !has;
    btn.setAttribute('aria-expanded', String(has && _explainOpen));
    panel.hidden = !(has && _explainOpen);
}

// ── Décoration : injecte le bouton « agrandir » dans chaque .chart-container ────
const _COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
const _MAXIMIZE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>';

function _decorateContainer(container) {
    if (container.dataset.zoomReady === '1') return;
    const canvas = container.querySelector('canvas');
    if (!canvas || !canvas.id) return;
    container.dataset.zoomReady = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-zoom-btn';
    btn.title = 'Agrandir le graphique';
    btn.setAttribute('aria-label', 'Agrandir le graphique');
    btn.dataset.zoomTarget = canvas.id;
    btn.innerHTML = _MAXIMIZE_SVG;
    container.appendChild(btn);
    // 📋 Copier l'image (chart_copy.js, clic en délégation) — sauf si la carte porte déjà son bouton
    // d'en-tête (Rapports → Métriques sprint) : deux boutons pour la même action.
    if (!container.closest('.card')?.querySelector(`.card-header [data-chart-copy="${canvas.id}"]`)) {
        const cp = document.createElement('button');
        cp.type = 'button';
        cp.className = 'chart-zoom-btn chart-copy-float';
        cp.title = 'Copier l\'image du graphique (thème affiché)';
        cp.setAttribute('aria-label', 'Copier l\'image du graphique');
        cp.dataset.chartCopy = canvas.id;
        cp.innerHTML = _COPY_SVG;
        container.appendChild(cp);
    }
}

/** Décore tous les conteneurs de graphique de la page (idempotent). */
export function decorateChartZoom(root = document) {
    root.querySelectorAll('.chart-container').forEach(_decorateContainer);
}

// ── Construction / ouverture de la popin ───────────────────────────────────────
function _buildOverlay() {
    const ov = document.createElement('div');
    ov.id = 'chart-zoom-overlay';
    ov.className = 'chart-zoom-overlay hidden';
    ov.innerHTML = `
        <div class="chart-zoom-backdrop" data-zoom-close></div>
        <div class="chart-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="chart-zoom-title">
            <header class="chart-zoom-header">
                <button class="chart-zoom-nav" id="chart-zoom-prev" title="Graphique précédent (←)" aria-label="Précédent">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <h2 class="chart-zoom-title" id="chart-zoom-title"></h2>
                <span class="chart-zoom-count" id="chart-zoom-count"></span>
                <button class="chart-zoom-nav" id="chart-zoom-next" title="Graphique suivant (→)" aria-label="Suivant">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button class="chart-zoom-nav chart-zoom-help" id="chart-zoom-help" aria-expanded="false" aria-controls="chart-zoom-explain" title="Comment lire ce graphique (touche ?)" aria-label="Comment lire ce graphique">?</button>
                <button class="chart-zoom-nav chart-zoom-copy-list" id="chart-zoom-copy-list" hidden title="Copier la liste des tickets affichés, avec leurs chiffres (Slack, Confluence, Teams…)" aria-label="Copier la liste des tickets">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>
                </button>
                <button class="chart-zoom-nav chart-zoom-copy" id="chart-zoom-copy" title="Copier l'image avec son explication (thème affiché) — Maj+clic : le graphique seul" aria-label="Copier l'image du graphique">
                    ${_COPY_SVG}
                </button>
                <button class="chart-zoom-nav chart-zoom-export" id="chart-zoom-export" title="Exporter en PNG" aria-label="Exporter en PNG">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="chart-zoom-close" id="chart-zoom-close" title="Fermer (Échap)" aria-label="Fermer" data-zoom-close>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </header>
            <div class="chart-zoom-toolbar" id="chart-zoom-toolbar" hidden></div>
            <div class="chart-zoom-main">
                <div class="chart-zoom-canvas-wrap">
                    <canvas id="${_ZOOM_CANVAS_ID}"></canvas>
                </div>
                <aside class="chart-zoom-explain" id="chart-zoom-explain" aria-label="Comment lire ce graphique" hidden></aside>
            </div>
        </div>`;
    document.body.appendChild(ov);

    ov.querySelectorAll('[data-zoom-close]').forEach(el =>
        el.addEventListener('click', closeChartZoom));
    ov.querySelector('#chart-zoom-prev').addEventListener('click', () => _navigate(-1));
    ov.querySelector('#chart-zoom-next').addEventListener('click', () => _navigate(1));
    ov.querySelector('#chart-zoom-export').addEventListener('click', _exportPng);
    ov.querySelector('#chart-zoom-copy').addEventListener('click', e => _copyExplained(!e.shiftKey));
    ov.querySelector('#chart-zoom-copy-list').addEventListener('click', _copyList);
    ov.querySelector('#chart-zoom-help').addEventListener('click', () => _setExplainOpen(!_explainOpen));
    return ov;
}

/**
 * Exporte le graphique agrandi en PNG. On dessine le canvas sur un fond opaque
 * (le canvas Chart.js est transparent) pour un rendu lisible hors de l'app.
 */
function _exportPng() {
    const canvas = _overlay?.querySelector('.chart-zoom-canvas-wrap canvas');
    if (!canvas) return;
    const meta = getChartMeta(_ids[_idx]);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const cx = out.getContext('2d');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, out.width, out.height);
    cx.drawImage(canvas, 0, 0);

    // Slug de nom de fichier : décompose les accents (NFD) puis ne garde que
    // [a-z0-9], le reste (accents combinants, espaces, ponctuation) devient `-`.
    const slug = (meta?.title || 'graphique')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `squad-board-${slug}-${date}.png`;
    a.click();
}

/** Explication en SECTIONS pour l'encadré de l'image copiée — même contenu que le panneau « ? ». */
function _explainSections(kind) {
    const e = _EXPLAIN[kind];
    if (!e) return [];
    const sec = (icon, title, val) => (typeof val === 'string'
        ? { icon, title, intro: val, items: [] }
        : { icon, title, intro: val.intro || '', items: val.items || [] });
    return [sec('👁', 'Lecture', e.read), sec('💡', 'Interprétation', e.tip)];
}

/**
 * 📋 Copie « version explicative » : le graphique AGRANDI (vue, tri, filtres compris), son titre, les
 * filtres actifs et « Comment lire ce graphique », pour l'envoyer à des coéquipiers qui ne connaissent
 * pas l'outil — TOUJOURS, que la légende soit pliée ou non à l'écran (l'image est composée hors écran,
 * elle ne rétrécit rien) ; Maj+clic = graphique seul. Fond et couleurs = thème affiché (chart_copy.js).
 */
function _copyExplained(withExplain = true) {
    const meta = getChartMeta(_ids[_idx]);
    if (!meta) return;
    const active = [_opts.filterType && `type ${_opts.filterType}`, _opts.filterLeader && `lead ${_opts.filterLeader}`].filter(Boolean);
    const title = `${meta.title || 'Graphique'}${active.length ? ` · ${active.join(', ')}` : ''}`;
    copyChartImage(_ZOOM_CANVAS_ID, title, {
        bgEl: _overlay.querySelector('.chart-zoom-dialog'),
        explain: withExplain ? _explainSections(meta.kind) : [],
    });
}

/**
 * 📋 « Copier la liste » : les tickets AFFICHÉS par la vue agrandie (même tri, mêmes filtres) avec leurs
 * chiffres — pour en discuter en rétro. Deux formats d'un coup : texte à puces (Slack) et tableau HTML
 * (Confluence, Teams), clés liées à JIRA si l'URL est configurée. Liste fournie par charts.js
 * (`getChartCopyList`), posée au rendu : rien n'est recalculé ici.
 */
async function _copyList() {
    const list = getChartCopyList(_ZOOM_CANVAS_ID);
    if (!list?.rows?.length) return;
    const base = String(store.get('jiraUrl') || '').replace(/\/+$/, '');
    const href = id => (base ? `${base}/browse/${encodeURIComponent(id)}` : '');
    const text = [`*${list.heading}*`, list.subtitle, '',
        ...list.rows.map(r => `• ${r.icon} ${r.id} — ${r.title}${r.flag ? `  ${r.flag}` : ''}\n    ${list.columns.map((c, i) => r.cells[i] ? `${c} : ${r.cells[i]}` : '').filter(Boolean).join(' · ')}`),
    ].join('\n');
    const html = `<p><strong>${_esc(list.heading)}</strong><br>${_esc(list.subtitle)}</p>
        <table><thead><tr><th>Ticket</th><th>Titre</th>${list.columns.map(c => `<th>${_esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>
        ${list.rows.map(r => `<tr><td>${r.icon} ${href(r.id) ? `<a href="${_esc(href(r.id))}">${_esc(r.id)}</a>` : _esc(r.id)}</td><td>${_esc(r.title)}</td>`
            + `${r.cells.map(v => `<td>${_esc(v || '')}</td>`).join('')}<td>${_esc(r.flag || '')}</td></tr>`).join('')}
        </tbody></table>`;
    try {
        await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
        })]);
        toast(`Liste copiée — ${list.rows.length} ticket${list.rows.length > 1 ? 's' : ''}`, 'success');
    } catch {
        try { await navigator.clipboard.writeText(text); toast('Liste copiée (texte seul)', 'success'); }
        catch (e) { toast(`Copie impossible : ${e.message}`, 'error'); }
    }
}

// Rend une partie d'explication. `val` est soit une string (un paragraphe),
// soit { intro, items: [...] } → l'intro en paragraphe + les items en liste
// (une ligne par item, plus propre qu'un texte à rallonge avec des puces).
function _part(label, val) {
    if (typeof val === 'string') {
        return `<p><strong>${label} -</strong> ${val}</p>`;
    }
    const intro = val.intro ? `<p><strong>${label} -</strong> ${val.intro}</p>` : `<p><strong>${label}</strong></p>`;
    const list = (val.items || []).map(it => `<li>${it}</li>`).join('');
    return `${intro}<ul class="chart-zoom-explain-list">${list}</ul>`;
}

function _explainHtml(kind) {
    const e = _EXPLAIN[kind];
    if (!e) return '';
    // Contenu du panneau latéral (ouvert / fermé par le bouton « ? », cf. _syncExplain).
    return `
        <h3 class="chart-zoom-explain-title">Comment lire ce graphique</h3>
        <div class="chart-zoom-explain-body">
            <div class="chart-zoom-explain-row">
                <span class="chart-zoom-explain-ico" aria-hidden="true">👁</span>
                <div>${_part('Lecture', e.read)}</div>
            </div>
            <div class="chart-zoom-explain-row">
                <span class="chart-zoom-explain-ico" aria-hidden="true">💡</span>
                <div>${_part('Interprétation', e.tip)}</div>
            </div>
        </div>`;
}

// Échappe un texte destiné à un attribut HTML (valeurs de filtre issues des données).
function _esc(s) {
    return String(s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/**
 * Construit la barre d'outils (mode / tri / filtres) pour les graphiques qui la
 * déclarent (cf. getChartControls). Affichée uniquement en vue zoom. Les sélections
 * vivent dans `_opts` et déclenchent un re-render via `_renderCurrent`.
 */
function _renderToolbar(sourceId) {
    const tb = _overlay.querySelector('#chart-zoom-toolbar');
    const ctrls = getChartControls(sourceId);
    if (!ctrls) { tb.hidden = true; tb.innerHTML = ''; return; }
    tb.hidden = false;

    const mode = _opts.mode || (ctrls.modes?.[0]?.value ?? 'bars');
    const sortBy = _opts.sortBy || (ctrls.sorts?.[0]?.value ?? 'date');
    const noSort = mode !== 'bars';   // le tri ne concerne que les barres (frise : ordre = démarrage)

    // Groupe de chips de filtre (un seul actif à la fois, "Tous" = aucun filtre).
    const filterGroup = (key, optKey, label, values) => {
        if (!values?.length) return '';
        const active = _opts[optKey] || '';
        const chip = (val, txt) =>
            `<button type="button" class="chart-zoom-chip${active === val ? ' is-active' : ''}" data-filter="${optKey}" data-value="${_esc(val)}">${_esc(txt)}</button>`;
        return `<div class="chart-zoom-tb-group" role="group" aria-label="${label}">
            <span class="chart-zoom-tb-label">${label}</span>
            ${chip('', 'Tous')}
            ${values.map(v => chip(v, v)).join('')}
        </div>`;
    };

    const modeBtns = (ctrls.modes || []).map(m =>
        `<button type="button" class="chart-zoom-seg${m.value === mode ? ' is-active' : ''}" data-mode="${m.value}">${m.label}</button>`
    ).join('');

    // Le tri ne concerne que le mode barres.
    const sortSel = (!noSort && ctrls.sorts?.length)
        ? `<div class="chart-zoom-tb-group">
                <span class="chart-zoom-tb-label">Tri</span>
                <select class="chart-zoom-select" id="chart-zoom-sort">
                    ${ctrls.sorts.map(s => `<option value="${s.value}"${s.value === sortBy ? ' selected' : ''}>${_esc(s.label)}</option>`).join('')}
                </select>
           </div>`
        : '';

    tb.innerHTML = `
        ${ctrls.modes?.length ? `<div class="chart-zoom-tb-group"><span class="chart-zoom-tb-label">Vue</span><div class="chart-zoom-seg-group">${modeBtns}</div></div>` : ''}
        ${sortSel}
        ${filterGroup('type', 'filterType', 'Type', ctrls.filters?.type)}
        ${filterGroup('leader', 'filterLeader', 'Lead', ctrls.filters?.leader)}`;

    // Wiring : mode (segmenté)
    tb.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        _opts.mode = b.dataset.mode;
        _renderCurrent();
    }));
    // Tri
    tb.querySelector('#chart-zoom-sort')?.addEventListener('change', e => {
        _opts.sortBy = e.target.value;
        _renderCurrent();
    });
    // Filtres (toggle : recliquer la valeur active la retire)
    tb.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
        const { filter, value } = b.dataset;
        _opts[filter] = (_opts[filter] === value) ? '' : value;
        _renderCurrent();
    }));
}

/** (Re)dessine le graphique courant dans la popin — SANS animation de transition. */
function _renderCurrent() {
    const sourceId = _ids[_idx];
    const meta = getChartMeta(sourceId);
    if (!meta) return;

    // Détruit l'éventuelle instance Chart.js précédente avant de recréer le canvas
    // (Chart.js attache le contexte au canvas — sinon fuite mémoire à la navigation).
    const wrap = _overlay.querySelector('.chart-zoom-canvas-wrap');
    const old = wrap.querySelector('canvas');
    if (old && window.Chart?.getChart) window.Chart.getChart(old)?.destroy();
    wrap.innerHTML = `<canvas id="${_ZOOM_CANVAS_ID}"></canvas>`;
    rerenderChart(sourceId, _ZOOM_CANVAS_ID, _opts);

    _overlay.querySelector('#chart-zoom-title').textContent = meta.title || 'Graphique';
    _overlay.querySelector('#chart-zoom-count').textContent =
        _ids.length > 1 ? `${_idx + 1} / ${_ids.length}` : '';
    _overlay.querySelector('#chart-zoom-explain').innerHTML = _explainHtml(meta.kind);
    _syncExplain();
    _renderToolbar(sourceId);
    // « Copier la liste » : seulement pour les graphiques qui exposent leurs tickets (Cycle Time, WIP Age).
    _overlay.querySelector('#chart-zoom-copy-list').hidden = !getChartCopyList(_ZOOM_CANVAS_ID)?.rows?.length;

    const prev = _overlay.querySelector('#chart-zoom-prev');
    const next = _overlay.querySelector('#chart-zoom-next');
    const multi = _ids.length > 1;
    prev.hidden = !multi;
    next.hidden = !multi;
}

function _navigate(dir) {
    if (_ids.length < 2) return;
    _idx = (_idx + dir + _ids.length) % _ids.length;
    _opts = {};        // réinitialise les contrôles en changeant de graphique
    _renderCurrent(); // pas d'animation : on remplace directement
}

/** Recense, dans l'ordre du DOM, tous les canvas zoomables actuellement présents. */
function _collectIds() {
    const ids = [];
    document.querySelectorAll('.chart-container canvas[id]').forEach(c => {
        if (getChartMeta(c.id)) ids.push(c.id);
    });
    return ids;
}

export function openChartZoom(canvasId) {
    if (!getChartMeta(canvasId)) return;
    _overlay = _overlay || _buildOverlay();
    _ids = _collectIds();
    _idx = _ids.indexOf(canvasId);
    if (_idx < 0) { _ids = [canvasId]; _idx = 0; }
    _opts = {};        // démarre sans surcharge de contrôles

    _overlay.classList.remove('hidden');
    // Force le reflow puis active la classe d'entrée → transition fondu + zoom.
    void _overlay.offsetWidth;
    _overlay.classList.add('chart-zoom-overlay--open');
    document.body.classList.add('chart-zoom-lock');
    _renderCurrent();
}

export function closeChartZoom() {
    if (!_overlay) return;
    _overlay.classList.remove('chart-zoom-overlay--open');
    document.body.classList.remove('chart-zoom-lock');
    // Laisse la transition de sortie se jouer avant de masquer + purger le canvas.
    const ov = _overlay;
    setTimeout(() => {
        ov.classList.add('hidden');
        const wrap = ov.querySelector('.chart-zoom-canvas-wrap');
        const old = wrap?.querySelector('canvas');
        if (old && window.Chart?.getChart) window.Chart.getChart(old)?.destroy();
        if (wrap) wrap.innerHTML = `<canvas id="${_ZOOM_CANVAS_ID}"></canvas>`;
    }, 200);
}

// ── Initialisation : délégation des clics + observation du DOM ──────────────────
export function initChartZoom() {
    // Clic sur un bouton « agrandir » (délégation : survit aux re-renders de vue).
    document.addEventListener('click', e => {
        const btn = e.target.closest('.chart-zoom-btn[data-zoom-target]');   // pas le bouton « copier » voisin
        if (btn) { e.preventDefault(); openChartZoom(btn.dataset.zoomTarget); }
    });

    // Raccourcis clavier quand la popin est ouverte.
    document.addEventListener('keydown', e => {
        if (!_overlay || _overlay.classList.contains('hidden')) return;
        if (ticketModalOnTop()) return;   // un ticket ouvert depuis la vue agrandie a la main sur le clavier
        if (e.key === 'Escape') { e.preventDefault(); closeChartZoom(); }
        else if (e.key === '?' && !e.target.closest?.('input, select, textarea')) { e.preventDefault(); _setExplainOpen(!_explainOpen); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); _navigate(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); _navigate(1); }
    });

    // Les vues sont re-rendues dynamiquement dans #content : on (re)décore à chaque
    // mutation. Throttle via rAF pour éviter les passes redondantes.
    const content = document.getElementById('content') || document.body;
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; decorateChartZoom(); });
    });
    observer.observe(content, { childList: true, subtree: true });

    // Décoration initiale.
    decorateChartZoom();
}
