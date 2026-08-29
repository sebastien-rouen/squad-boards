/**
 * PREMIER LANCEMENT — le Dashboard sans aucune équipe.
 *
 * Le site sème un jeu de démo à la première ouverture (app.js) ; on arrive donc ici quand
 * l'utilisateur a tout supprimé, ou après une base vidée. Trois façons de commencer, une phrase
 * chacune : la démo complète, l'import JIRA, ou créer à la main. Pas un écran vide.
 */

import { toast } from '../utils.js';

export function firstLaunchHtml() {
    return `
    <section class="first-launch" aria-labelledby="first-launch-title">
        <span class="first-launch-ico" aria-hidden="true">🌤️</span>
        <h2 id="first-launch-title">Bienvenue sur Squad Board</h2>
        <p>Aucune équipe pour l'instant. La météo a besoin de trois choses : des équipes, un sprint, des tickets. Trois façons de commencer :</p>
        <div class="first-launch-choices">
            <button type="button" class="first-launch-choice" id="first-launch-demo">
                <span aria-hidden="true">🎲</span><b>Données de démo</b><span>Quatre équipes fictives, un PI complet — pour voir la météo tout de suite.</span>
                <small id="first-launch-demo-status" hidden></small>
            </button>
            <a class="first-launch-choice" href="#settings/jira">
                <span aria-hidden="true">🔌</span><b>Importer depuis JIRA</b><span>Jeton + boards : la première sync remplit tout.</span>
            </a>
            <a class="first-launch-choice" href="#settings/equipes">
                <span aria-hidden="true">✏️</span><b>Créer à la main</b><span>Une équipe, un sprint, tes tickets. JIRA restera optionnel.</span>
            </a>
        </div>
    </section>`;
}

export function bindFirstLaunch(container) {
    const btn = container.querySelector('#first-launch-demo');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const status = container.querySelector('#first-launch-demo-status');
        btn.disabled = true;
        if (status) { status.hidden = false; status.textContent = 'Création…'; }
        try {
            const { seedFullDemoData } = await import('../demo.js');
            await seedFullDemoData(msg => { if (status) status.textContent = msg; });
            await window.__squadBoard?.loadAllData?.();
            toast('Démo chargée — bienvenue !', 'success', 4000);
            window.__squadBoard?.rerenderView?.();
        } catch (e) {
            toast(`Erreur : ${e.message}`, 'error');
            btn.disabled = false;
            if (status) status.hidden = true;
        }
    });
}
