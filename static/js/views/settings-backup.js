/**
 * Paramètres → Données — « 💾 Sauvegarde & restauration de la configuration » (3.198.0).
 *
 * Un fichier `squad-config.local.json` = la configuration CURÉE ({_meta, db, local}) :
 *   - `db`    : domaines de la base hors données JIRA (`GET /api/config/export`, liste unique
 *               `CONFIG_DOMAINS` dans app/routers/config_bundle.py) ;
 *   - `local` : les préférences de CE navigateur (clés localStorage du site, préfixes ci-dessous),
 *               que le serveur ne voit jamais — SAUF les secrets (jeton JIRA, webhook Slack).
 * Restauration : aperçu chiffré → `POST /api/config/import` (fusion, rien n'est effacé) → clés
 * locales réécrites → données rechargées. Tickets / features / epics / sprints : synchro JIRA.
 *
 * Gabarit de projet (3.279.0) : `?mode=template` = la configuration RÉUTILISABLE seule (catalogue Atlas,
 * ateliers, règles d'agenda, réglages génériques, cadence), sans aucune donnée ni préférence du poste —
 * pour démarrer un autre projet. Liste blanche côté serveur ; importé en fusion, jamais en remplacement.
 *
 * ≠ « Export » de la même section (snapshot complet, au choix des catégories).
 * ⚠️ Données personnelles (absences RH) et URL d'agenda : `*.local.json` est ignoré par git.
 */

import * as api from '../api.js';
import { toast, choiceModal } from '../utils.js';

/** Préfixes des clés localStorage sauvegardées : tout ce que le site range chez le navigateur. */
const LOCAL_PREFIXES = ['sb-', 'pi-cfg-', 'rot-', 'sup-'];
/** Jamais exportées : secrets, et état purement technique (horodatage, caches JIRA re-téléchargés). */
const LOCAL_SKIP = new Set(['sb-jira-token', 'sb-slack-webhook', 'sb-lastSync']);
const isSecret = k => LOCAL_SKIP.has(k) || /token|webhook|password|secret/i.test(k);

const DOMAIN_LABELS = {
    teams: '👥 Équipes', groups: '🗂️ Lignes produit', members: '👤 Membres', pi: '⚙️ Config PI',
    absences: '🏖️ Absences', support: '🛟 Rotation support', events: '📌 Faits marquants',
    calendars: '🗓️ Calendriers', calendarRules: '🏷️ Règles d\'agenda', skills: '🧭 Compétences',
    appetences: '💡 Appétences', memberSkills: '🧭 Niveaux', memberAppetences: '💡 Appétences (membres)',
    mobility: '🔀 Mobilité', teamSkillRequirements: '⭐ Compétences requises', teamIdentities: '🪪 Fiches d\'équipe', workshopTemplates: '📋 Ateliers',
    teamWorkshops: '📝 Réponses d\'ateliers', moodVotes: '😊 Votes Mood', fistVotes: '✊ Fist of Five',
    confidenceVotes: '🎯 Confiance', retroItems: '🔁 Actions de rétro', risks: '⚠️ Risques',
    projectSettings: '⚙️ Réglages du projet', piCadence: '🗓️ Cadence (sprints, capacité par rôle)',
};

/** Clés localStorage à sauvegarder → { clé: valeur }. */
export function localConfigSnapshot(storage = localStorage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && LOCAL_PREFIXES.some(p => k.startsWith(p)) && !isSecret(k)) out[k] = storage.getItem(k);
    }
    return out;
}

/** Réécrit les clés d'un bundle (mêmes filtres qu'à l'export : un fichier édité n'injecte pas de secret). */
export function restoreLocalConfig(obj, storage = localStorage) {
    let n = 0;
    for (const [k, v] of Object.entries(obj || {})) {
        if (typeof v !== 'string' || !LOCAL_PREFIXES.some(p => k.startsWith(p)) || isSecret(k)) continue;
        try { storage.setItem(k, v); n++; } catch { /* quota / stockage indisponible */ }
    }
    return n;
}

function _download(obj, name) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const count = v => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? 1 : 0);

export function backupCardHtml() {
    return `
        <div class="backup-card" id="backup-card">
            <span class="backup-ico" aria-hidden="true">💾</span>
            <div class="backup-body">
                <p class="backup-title">Sauvegarde &amp; restauration de la configuration</p>
                <p class="backup-desc">Équipes, lignes produit, membres, config PI (dates, objectifs, capacité par rôle, statuts forcés), absences, rotation support, faits marquants, calendriers et règles d'agenda, Atlas, fiches et ateliers d'équipe, votes — <b>et les préférences de ce navigateur</b>. Sans tickets, features, epics ni sprints : la synchro JIRA les rapatrie.</p>
                <p class="backup-warn">⚠️ Le fichier contient des données personnelles (absences) et les URL des agendas : à garder pour soi, ne pas le partager ni le versionner (<code>*.local.json</code> est ignoré par git). Le jeton JIRA et le webhook Slack n'y sont jamais.</p>
                <p class="backup-desc">🧩 <b>Gabarit de projet</b> : la configuration réutilisable seule (catalogue Atlas, ateliers, règles d'agenda, seuils, correspondance JIRA, modules, cadence), sans aucune donnée d'équipe — pour démarrer un autre projet avec « Restaurer… ».</p>
            </div>
            <div class="backup-actions">
                <button type="button" class="btn btn-primary" id="btn-config-export">⬇️ Sauvegarder</button>
                <button type="button" class="btn btn-secondary" id="btn-config-import">⬆️ Restaurer…</button>
                <button type="button" class="btn btn-ghost" id="btn-config-template" title="Catalogue Atlas, ateliers, règles d'agenda, seuils, correspondance JIRA, modules et cadence — sans équipes, personnes, absences, votes ni tickets. S'importe avec « Restaurer… » dans le nouveau projet.">🧩 Gabarit de projet</button>
                <input type="file" id="config-import-file" accept=".json,application/json" hidden>
            </div>
        </div>`;
}

/**
 * @param {HTMLElement} container racine de la vue Paramètres
 * @param {Function}    onReload  re-rendu de la page (injecté par settings.js, comme pour l'import)
 */
export function wireBackup(container, onReload = () => {}) {
    const input = container.querySelector('#config-import-file');

    container.querySelector('#btn-config-export')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const bundle = await api.exportConfig();
            bundle.local = localConfigSnapshot();
            bundle._meta = { ...(bundle._meta || {}), localKeys: Object.keys(bundle.local).length };
            _download(bundle, 'squad-config.local.json');
            const n = Object.values(bundle.db || {}).reduce((s, v) => s + count(v), 0);
            toast(`Configuration sauvegardée — ${n} éléments + ${bundle._meta.localKeys} préférences`, 'success');
        } catch (err) {
            toast(`Sauvegarde impossible : ${err.message || err}`, 'error');
        } finally { btn.disabled = false; }
    });

    // Gabarit : aucune donnée personnelle, nom en .json simple (partageable d'un projet à l'autre)
    container.querySelector('#btn-config-template')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const tpl = await api.exportConfig('template');
            _download(tpl, 'squad-gabarit.json');
            const n = Object.values(tpl.db || {}).reduce((s, v) => s + count(v), 0);
            toast(`Gabarit exporté — ${n} éléments, sans aucune donnée d'équipe`, 'success');
        } catch (err) {
            toast(`Gabarit impossible : ${err.message || err}`, 'error');
        } finally { btn.disabled = false; }
    });

    container.querySelector('#btn-config-import')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        let bundle;
        try { bundle = JSON.parse(await file.text()); } catch { toast('Fichier illisible : JSON attendu', 'error'); return; }
        if (!bundle || typeof bundle !== 'object' || !bundle.db || typeof bundle.db !== 'object' || (bundle._meta?.app && bundle._meta.app !== 'squad-board')) {
            toast('Ce fichier n\'est pas une sauvegarde de configuration Squad Board', 'error');
            return;
        }
        // Aperçu : ce que le fichier contient, domaine par domaine, avant toute écriture.
        const lines = Object.entries(bundle.db).filter(([, v]) => count(v))
            .map(([k, v]) => `${DOMAIN_LABELS[k] || k} : ${Array.isArray(v) ? v.length : '✓'}`);
        const tpl = bundle._meta?.kind === 'template';
        const nLocal = tpl ? 0 : Object.keys(bundle.local || {}).length;
        const when = bundle._meta?.exportedAt ? new Date(bundle._meta.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
        const choice = await choiceModal(tpl ? 'Appliquer un gabarit de projet' : 'Restaurer la configuration',
            `${tpl ? 'Gabarit' : 'Sauvegarde'} du ${when}\n\n${lines.join('\n') || 'Aucune donnée de base'}\n${nLocal ? `\n🖥️ Préférences du navigateur : ${nLocal}` : ''}\n\n${tpl
                ? 'Fusion : catalogue, ateliers et réglages sont ajoutés ou mis à jour (une compétence de même nom est reprise, pas dupliquée) ; équipes, personnes et numéro de PI ne bougent pas.'
                : 'Fusion : les éléments du fichier sont ajoutés ou mis à jour, rien n\'est effacé.'}`,
            [
                ...(nLocal ? [{ key: 'all', label: 'Restaurer tout', variant: 'primary' }] : []),
                { key: 'db', label: nLocal ? 'Base seulement' : tpl ? 'Appliquer' : 'Restaurer', variant: nLocal ? 'secondary' : 'primary' },
            ]);
        if (!choice) return;
        try {
            const res = await api.importConfig({ _meta: bundle._meta, db: bundle.db, mode: 'merge' });
            const nl = choice === 'all' ? restoreLocalConfig(bundle.local) : 0;
            const total = Object.values(res?.counts || {}).reduce((s, v) => s + (+v || 0), 0);
            toast(`${tpl ? 'Gabarit appliqué' : 'Configuration restaurée'} — ${total} éléments${nl ? ` + ${nl} préférences` : ''}`, 'success', 5000);
            await window.__squadBoard?.reloadData?.();
            onReload();
        } catch (err) {
            toast(`Restauration impossible : ${err.message || err}`, 'error');
        }
    });
}
