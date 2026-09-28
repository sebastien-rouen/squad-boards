/* Galerie : mise à l'échelle des cadres desktop (mesure le CONTENEUR, jamais la fenêtre),
 * panneau de contrôle flottant (équipe, thème, directions), thème propagé aux iframes. */
(function () {
    'use strict';
    const LS = 'sb-mockup-team-cal-gallery';
    const prefs = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
    const save = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch { /* privé */ } };

    function scale() {
        document.querySelectorAll('.bureau-fenetre').forEach(f => {
            f.style.setProperty('--echelle', Math.min(1, f.clientWidth / 1280).toFixed(4));
        });
    }

    /** Réécrit le src des iframes selon le thème et, si demandé, l'équipe. */
    function applyToFrames() {
        document.documentElement.dataset.theme = prefs.theme === 'light' ? 'light' : 'dark';
        document.querySelectorAll('iframe[data-src]').forEach(fr => {
            const u = new URL(fr.dataset.src, location.href);
            if (prefs.theme === 'light') u.searchParams.set('theme', 'light'); else u.searchParams.delete('theme');
            if (prefs.team && fr.dataset.teamlock !== '1') u.searchParams.set('team', prefs.team);
            if (fr.src !== u.href) fr.src = u.href;
        });
    }

    function panel() {
        const host = document.querySelector('.gal-fcp');
        if (!host) return;
        host.dataset.open = prefs.fcp === false ? 'false' : 'true';
        host.querySelector('.gal-fcp-toggle').addEventListener('click', () => {
            prefs.fcp = host.dataset.open === 'false'; host.dataset.open = String(prefs.fcp); save();
        });
        const sel = host.querySelector('select[data-team]');
        if (sel) {
            sel.value = prefs.team || '';
            sel.addEventListener('change', () => { prefs.team = sel.value || null; save(); applyToFrames(); });
        }
        host.querySelector('[data-theme-toggle]').addEventListener('click', () => {
            prefs.theme = prefs.theme === 'light' ? 'dark' : 'light'; save(); applyToFrames();
        });
    }

    window.addEventListener('resize', scale);
    document.addEventListener('DOMContentLoaded', () => { scale(); panel(); applyToFrames(); });
})();
