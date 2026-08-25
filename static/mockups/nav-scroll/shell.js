/* Chrome commun : onglets réels, bascule de device, thème, sonde de mesure.
   Script classique (pas de module) — les maquettes s'ouvrent aussi en file://. */

/* Les 14 onglets RÉELS de la vue Paramètres — mêmes libellés, mêmes icônes, mêmes
   groupes que `_settingsTabIcon` / `TAB_GROUPS` dans views/settings.js. Inventer des
   libellés plus courts ferait mentir la maquette exactement là où elle doit trancher. */
const TABS = [
    { g: 'Équipe',       icon: '🌳', title: 'Lignes produit / Groupes' },
    { g: 'Équipe',       icon: '👥', title: 'Équipes' },
    { g: 'Équipe',       icon: '🧑', title: 'Membres' },
    { g: 'Équipe',       icon: '⚙️', title: 'Capacité dev' },
    { g: 'Équipe',       icon: '🌴', title: 'Absences / Congés' },
    { g: 'Planning',     icon: '🚀', title: 'Sprint & PI' },
    { g: 'Planning',     icon: '🛎️', title: 'Rotation Support' },
    { g: 'Planning',     icon: '⚡', title: 'Faits marquants' },
    { g: 'Planning',     icon: '⏰', title: 'Rappels & Cérémonies' },
    { g: 'Intégrations', icon: '📅', title: 'Calendriers ICS' },
    { g: 'Intégrations', icon: '🔗', title: 'Plugin JIRA' },
    { g: 'Intégrations', icon: '⚙️', title: 'Slack' },
    { g: 'Système',      icon: '📦', title: 'Données' },
    { g: 'Système',      icon: '⚙️', title: 'A propos' },
];
const PALETTE = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
    '#a855f7', '#22c55e', '#f97316', '#3b82f6', '#ec4899', '#14b8a6'];

/* Viewports réels, pas des paliers ronds : c'est sur ces largeurs-là que le wrap
   se décide. 375 = iPhone SE/13 mini, encore très présent. */
const DEVICES = [
    { id: 'se',     label: 'iPhone SE · 375', w: 375,  h: 667 },
    { id: 'ip14',   label: 'iPhone 14 · 390', w: 390,  h: 720 },
    { id: 'pixel',  label: 'Pixel 7 · 412',   w: 412,  h: 750 },
    { id: 'fold',   label: 'Fold fermé · 344', w: 344, h: 700 },
    { id: 'tablet', label: 'iPad mini · 768', w: 768,  h: 700, wide: true },
    { id: 'desk',   label: 'Desktop · 1100',  w: 1100, h: 620, wide: true },
];

function tabButtonHtml(t, i, extraClass = '') {
    return `<button class="stg-tab ${extraClass}" style="--tab-color:${PALETTE[i % PALETTE.length]}" title="${t.title}">
        <span class="stg-tab-icon">${t.icon}</span>
        <span class="stg-tab-label">${t.title}</span>
    </button>`;
}

/**
 * Barre actuelle, reproduite À L'IDENTIQUE : 4 groupes en colonne, chacun avec son
 * label 9 px et ses onglets qui wrappent (`.stg-tab-group` / `.stg-tab-group-items`
 * dans views/settings.css). Une reproduction à plat — 14 boutons dans un seul wrap —
 * donnerait des lignes en trop et surestimerait le problème qu'on cherche à mesurer.
 */
function refNavHtml() {
    const groupes = [...new Set(TABS.map(t => t.g))];
    let i = -1;
    const idx = new Map(TABS.map(t => [t, ++i]));
    return groupes.map(g => `
        <div class="stg-tab-group">
            <span class="stg-tab-group-label">${g}</span>
            <div class="stg-tab-group-items">
                ${TABS.filter(t => t.g === g).map(t => tabButtonHtml(t, idx.get(t), idx.get(t) === 1 ? 'is-active' : '')).join('')}
            </div>
        </div>`).join('');
}

/** Barre d'outils device + thème, insérée en tête de chaque maquette. */
function mountToolbar(onDevice) {
    const host = document.getElementById('mk-toolbar');
    if (!host) return;
    host.innerHTML =
        `<span class="mk-toolbar-label">Appareil</span>` +
        DEVICES.map(d => `<button class="mk-dev" data-dev="${d.id}">${d.label}</button>`).join('') +
        `<button class="mk-dev mk-spacer" id="mk-theme">🌓 Thème</button>`;

    const apply = (id) => {
        const d = DEVICES.find(x => x.id === id) || DEVICES[1];
        const stage = document.querySelector('.mk-stage');
        if (stage) {
            stage.style.width = d.w + 'px';
            stage.style.height = d.h + 'px';
            stage.dataset.wide = d.wide ? '1' : '0';
        }
        host.querySelectorAll('.mk-dev[data-dev]').forEach(b =>
            b.classList.toggle('is-active', b.dataset.dev === d.id));
        // La mesure se fait APRÈS la transition de largeur : lue tout de suite, elle
        // renverrait l'état de départ de l'interpolation, pas la largeur finale.
        setTimeout(() => onDevice?.(d), 300);
    };
    host.addEventListener('click', e => {
        const b = e.target.closest('.mk-dev');
        if (!b) return;
        if (b.id === 'mk-theme') {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            return;
        }
        apply(b.dataset.dev);
    });
    apply('ip14');
    return apply;
}

/**
 * Sonde : combien de lignes la barre occupe-t-elle, et combien de pixels prend-elle
 * au contenu ? C'est la seule question qui tranche entre les options — « ça déborde »
 * ou « c'est plus joli » ne se compare pas d'une maquette à l'autre.
 *
 * Le nombre de lignes se déduit des positions verticales distinctes des enfants : un
 * `flex-wrap` ne dit nulle part combien de lignes il a produites.
 */
function measureNav(navSelector) {
    const nav = document.querySelector(navSelector);
    const stage = document.querySelector('.mk-stage');
    const content = document.querySelector('.mk-content');
    if (!nav || !stage) return null;

    const enfants = [...nav.querySelectorAll('.stg-tab, .nav-sheet-trigger')];
    const tops = new Set(enfants.map(el => Math.round(el.getBoundingClientRect().top)));
    const navH = Math.round(nav.getBoundingClientRect().height);
    const stageH = stage.getBoundingClientRect().height;
    const contentH = content ? content.getBoundingClientRect().height : 0;

    return {
        largeur: Math.round(stage.getBoundingClientRect().width),
        lignes: tops.size || 1,
        hauteurNav: navH,
        // Ce que le main garde réellement, en % de l'écran : la mesure qui répond à
        // « sur de petits écrans, on doit voir au mieux le main ».
        mainPct: stageH ? Math.round((contentH / stageH) * 100) : 0,
        deborde: nav.scrollWidth > nav.clientWidth + 1,
        cache: Math.max(0, nav.scrollWidth - nav.clientWidth),
    };
}

/** Rend le tableau de la sonde pour tous les devices, en les parcourant vraiment. */
async function runProbe(navSelector, applyDevice, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const lignes = [];
    for (const d of DEVICES) {
        applyDevice(d.id);
        // Laisser la transition de largeur finir AVANT de lire : sans cette attente,
        // toutes les lignes du tableau rendraient la même mesure.
        await new Promise(r => setTimeout(r, 340));
        const m = measureNav(navSelector);
        if (m) lignes.push({ d, m });
    }
    tbody.innerHTML = lignes.map(({ d, m }) => `
        <tr>
            <td>${d.label}</td>
            <td class="${m.lignes > 1 ? 'mk-bad' : 'mk-good'}">${m.lignes}</td>
            <td class="${m.hauteurNav > 60 ? 'mk-bad' : 'mk-good'}">${m.hauteurNav} px</td>
            <td class="${m.mainPct < 75 ? 'mk-bad' : 'mk-good'}">${m.mainPct} %</td>
            <td>${m.deborde ? `${m.cache} px hors champ` : '—'}</td>
        </tr>`).join('');
    applyDevice('ip14');
}

/** Contenu factice du main — présent pour qu'on voie ce qui reste réellement visible. */
function contentHtml(n = 6) {
    let out = '';
    for (let i = 0; i < n; i++) {
        out += `<div class="mk-card">
            <h4>Section ${i + 1}</h4>
            <div class="mk-line w80"></div><div class="mk-line w60"></div><div class="mk-line w40"></div>
        </div>`;
    }
    return out;
}
