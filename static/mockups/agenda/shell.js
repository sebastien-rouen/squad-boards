/* ════════════════════════════════════════════════════════════════════════════
   Helpers partagés par les 3 options de maquette.
   Script classique (pas de module) pour rester ouvrable en file:// —
   les modules ES sont bloqués par CORS quand la page n'est pas servie en HTTP.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const D = window.AGENDA_MOCK;

    /** Même rôle que le `esc()` de utils.js — toute donnée passée en innerHTML
     *  y passe, y compris dans une maquette (le code sert de base à l'implémentation). */
    const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    // ── Dates ───────────────────────────────────────────────────────────────
    const DAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const DAY_LONG  = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

    const parse   = iso => new Date(`${iso}T12:00:00`);
    const dayIdx  = iso => parse(iso).getDay();
    const ddmm    = iso => parse(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const dayName = iso => DAY_SHORT[dayIdx(iso)];
    const dayFull = iso => DAY_LONG[dayIdx(iso)];
    const longDate = iso => parse(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

    /** Jours ouvrés de l'itération (l'agenda du site ignore déjà samedi/dimanche). */
    function workDays(startIso, endIso) {
        const out = [];
        const d = parse(startIso), end = parse(endIso);
        while (d <= end) {
            if (d.getDay() !== 0 && d.getDay() !== 6) {
                out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
            }
            d.setDate(d.getDate() + 1);
        }
        return out;
    }

    /** Découpe les jours en semaines CALENDAIRES (lundi → vendredi).
     *  Indispensable : une itération démarre rarement un lundi — Fuego 30.6 court du
     *  vendredi 21/08 au vendredi 04/09, soit 11 jours ouvrés répartis sur 3 semaines.
     *  Un découpage en paquets de 5 placerait les césures n'importe où. */
    function weekGroups(days) {
        const out = [];
        for (const d of days) {
            const dt = parse(d);
            const monday = new Date(dt);
            monday.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1));
            const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
            let g = out.find(x => x.monday === key);
            if (!g) {
                g = { monday: key, days: [] };
                out.push(g);
            }
            g.days.push(d);
        }
        for (const g of out) {
            const first = g.days[0], last = g.days[g.days.length - 1];
            g.label = first === last
                ? `Semaine du ${longDate(first)}`
                : `Semaine du ${longDate(first)} au ${longDate(last)}`;
            g.short = `S. ${ddmm(first)}`;
        }
        return out;
    }

    /** Vrai si ce jour ouvre une nouvelle semaine calendaire dans la frise. */
    const startsWeek = (day, i) => i > 0 && dayIdx(day) === 1;

    // ── Typage ──────────────────────────────────────────────────────────────
    const KINDS = {
        scrum: { label: 'Scrum · équipe',  short: 'Scrum', dot: '🔵', cls: 'k-scrum' },
        safe:  { label: 'SAFe · train ERPC', short: 'SAFe', dot: '🟣', cls: 'k-safe'  },
        ops:   { label: 'Métier & Ops',    short: 'Ops',   dot: '⚪', cls: 'k-ops'   },
    };

    /** Nettoie l'emoji de tête d'un titre Google Calendar (« 🔥 Daily Fuego »). */
    const stripEmoji = t => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();

    /** Durée lisible : 15 min, 1 h, 1 h 30. */
    function durLabel(min) {
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60), m = min % 60;
        return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
    }

    /** Un événement qui dure ≥ 6 h occupe la journée (Journées Innovation, PI Planning). */
    const isFullDay = ev => ev.allDay || ev.durMin >= 360;

    // ── Regroupements ───────────────────────────────────────────────────────
    /** Rituels récurrents dédupliqués : une entrée par (titre, jour de semaine, heure). */
    function recurringRituals(events) {
        const map = new Map();
        for (const ev of events) {
            if (!ev.freq) continue;
            const key = `${ev.title}|${ev.freq === 'tous les jours' ? '*' : dayIdx(ev.day)}|${ev.start}`;
            if (!map.has(key)) map.set(key, { ...ev, days: [] });
            map.get(key).days.push(ev.day);
        }
        const out = [...map.values()];
        const rank = { 'tous les jours': 0, '1x/sem.': 1, '1x/ité.': 2, '1x/mois': 3 };
        out.sort((a, b) => (rank[a.freq] ?? 9) - (rank[b.freq] ?? 9)
            || dayIdx(a.days[0]) - dayIdx(b.days[0])
            || a.startMin - b.startMin);
        return out;
    }

    /** Événements ponctuels — les jalons réels de l'itération. */
    const oneShots = events => events.filter(e => !e.freq)
        .sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);

    /** Map jour → événements triés par heure. */
    function byDay(events) {
        const m = new Map();
        for (const ev of events) {
            if (!m.has(ev.day)) m.set(ev.day, []);
            m.get(ev.day).push(ev);
        }
        for (const list of m.values()) list.sort((a, b) => a.startMin - b.startMin);
        return m;
    }

    /** Cadence d'un rituel, phrasée pour un humain : « 1x/sem., lundi 9h30 ».
     *  Pour les cadences longues (1x/ité., 1x/mois), « lundi » ne suffit pas à situer
     *  l'occurrence — l'itération compte trois lundis. On donne alors les dates. */
    function cadence(ev) {
        if (!ev.freq) return `${dayName(ev.day)} ${ddmm(ev.day)} · ${ev.start}`;
        if (ev.freq === 'tous les jours') return `tous les jours, ${ev.start}`;
        const base = `${ev.freq}, ${dayFull(ev.day)} ${ev.start}`;
        const sparse = ev.freq === '1x/ité.' || ev.freq === '1x/mois';
        if (sparse && ev.days && ev.days.length) return `${base} — ${ev.days.map(ddmm).join(' et ')}`;
        return base;
    }

    // ── Absences ────────────────────────────────────────────────────────────
    /** Nombre de personnes absentes un jour donné (congés saisis + « X - OFF » du calendrier). */
    function absentOn(dayIso) {
        const names = new Set((D.off[dayIso] || []).map(n => n.toLowerCase()));
        for (const a of D.absences) {
            if (a.start <= dayIso && a.end >= dayIso) names.add(a.name.toLowerCase());
        }
        return names.size;
    }
    function absentNames(dayIso) {
        const out = new Set(D.off[dayIso] || []);
        for (const a of D.absences) {
            if (a.start <= dayIso && a.end >= dayIso) {
                // « BOUCHET, Jérôme » → « Jérôme »
                out.add(a.name.includes(',') ? a.name.split(',')[1].trim() : a.name);
            }
        }
        return [...out];
    }

    // ── Filtres ─────────────────────────────────────────────────────────────
    const state = { kinds: new Set(['scrum', 'safe', 'ops']), hideRecurring: false };

    function visible() {
        return D.events.filter(e => state.kinds.has(e.kind) && !(state.hideRecurring && e.freq));
    }

    /** Construit la barre de filtres et rebranche `onChange` à chaque clic. */
    function mountFilters(el, onChange, opts = {}) {
        const counts = { scrum: 0, safe: 0, ops: 0 };
        for (const e of D.events) counts[e.kind]++;
        el.innerHTML = Object.entries(KINDS).map(([k, meta]) => `
            <button class="kind-chip ${meta.cls}" data-kind="${k}" aria-pressed="true">
                ${meta.label} <span class="kind-count">${counts[k]}</span>
            </button>`).join('')
            + (opts.hideRecurringToggle === false ? '' : `
            <button class="kind-chip" data-toggle="hide-recurring" aria-pressed="false"
                    title="Ne garder que les événements ponctuels — les vrais jalons de l'itération">
                Masquer les récurrents
            </button>`);

        el.addEventListener('click', e => {
            const btn = e.target.closest('.kind-chip');
            if (!btn) return;
            if (btn.dataset.toggle === 'hide-recurring') {
                state.hideRecurring = !state.hideRecurring;
                btn.setAttribute('aria-pressed', String(state.hideRecurring));
            } else {
                const k = btn.dataset.kind;
                if (state.kinds.has(k)) state.kinds.delete(k); else state.kinds.add(k);
                btn.setAttribute('aria-pressed', String(state.kinds.has(k)));
            }
            onChange();
        });
    }

    // ── En-tête d'itération ─────────────────────────────────────────────────
    function iterationHead(el, { subtitle }) {
        const it = D.iteration;
        const days = workDays(it.start, it.end);
        const done = days.filter(d => d <= D.today).length;
        const pct  = Math.round(done / days.length * 100);
        el.innerHTML = `
            <div class="it-head-main">
                <div class="it-title">
                    <h2>${it.name}</h2>
                    <span class="it-dates">${longDate(it.start)} → ${longDate(it.end)} · ${days.length} jours ouvrés</span>
                </div>
                <p class="it-goal">${it.goal}</p>
                <div class="it-progress">
                    <div class="it-progress-track"><div class="it-progress-fill" style="width:${pct}%"></div></div>
                    <div class="it-progress-label">Jour ${done} / ${days.length} · ${subtitle}</div>
                </div>
            </div>
            <div class="it-actions">
                <button class="btn btn-secondary btn-sm" id="mk-theme" title="Basculer clair / sombre">🌓 Thème</button>
                <button class="btn btn-secondary btn-sm" id="mk-mobile" title="Basculer la largeur mobile">📱 Mobile</button>
                <button class="btn btn-primary" id="mk-slack">📋 Copier pour Slack</button>
            </div>`;

        el.querySelector('#mk-theme').addEventListener('click', () => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        });
        el.querySelector('#mk-mobile').addEventListener('click', () => {
            document.body.classList.toggle('is-mobile');
        });
    }

    // ── Modale Slack ────────────────────────────────────────────────────────
    function mountSlack(buildText) {
        const overlay = document.createElement('div');
        overlay.className = 'slack-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="slack-modal" role="dialog" aria-modal="true" aria-labelledby="slack-title">
                <div class="slack-modal-head">
                    <h3 id="slack-title">Récapitulatif de l'itération — prêt pour Slack</h3>
                    <button class="btn btn-ghost btn-sm" data-close aria-label="Fermer">✕</button>
                </div>
                <div class="slack-modal-body"><pre class="slack-preview" id="slack-preview"></pre></div>
                <div class="slack-modal-foot">
                    <span class="slack-hint">Texte brut : Slack rend <code>*gras*</code> et <code>:emoji:</code> au collage.</span>
                    <button class="btn btn-secondary btn-sm" data-close>Fermer</button>
                    <button class="btn btn-primary" id="slack-copy">📋 Copier</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => { overlay.hidden = true; };
        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('[data-close]')) close();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !overlay.hidden) close();
        });

        overlay.querySelector('#slack-copy').addEventListener('click', async () => {
            const btn = overlay.querySelector('#slack-copy');
            try {
                await navigator.clipboard.writeText(overlay.querySelector('#slack-preview').textContent);
                btn.textContent = '✓ Copié !';
                setTimeout(() => { btn.textContent = '📋 Copier'; }, 1600);
            } catch {
                btn.textContent = '✗ Copie refusée';
                setTimeout(() => { btn.textContent = '📋 Copier'; }, 1600);
            }
        });

        document.getElementById('mk-slack').addEventListener('click', () => {
            overlay.querySelector('#slack-preview').textContent = buildText();
            overlay.hidden = false;
            overlay.querySelector('#slack-copy').focus();
        });
    }

    // ── En-tête commun des récaps Slack ─────────────────────────────────────
    function slackHeader() {
        const it = D.iteration;
        return `:calendar: *${D.team} · ${it.short}* — ${longDate(it.start)} → ${longDate(it.end)}`;
    }

    window.MK = {
        D, KINDS, DAY_SHORT, DAY_LONG, esc,
        parse, dayIdx, ddmm, dayName, dayFull, longDate, workDays, weekGroups, startsWeek,
        stripEmoji, durLabel, isFullDay,
        recurringRituals, oneShots, byDay, cadence,
        absentOn, absentNames,
        state, visible, mountFilters, iterationHead, mountSlack, slackHeader,
    };
})();
