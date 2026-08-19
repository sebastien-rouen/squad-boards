/**
 * Rappels de cérémonies — définitions + lecture des préférences localStorage.
 * Extrait de views/settings.js : consommé par l'info-panel à chaque rendu, il ne doit
 * pas tirer les 300 KB de la vue Paramètres (lazy loading des vues, cf app.js).
 */

const _LS_REMINDERS = 'sb-reminders';

export const REMINDER_DEFS = [
    { id: 'demo',    icon: '🎬', label: 'DEMO Sprint',          dBefore: 0,  enabled: true  },
    { id: 'retro',   icon: '🔄', label: 'Rétrospective',        dBefore: 1,  enabled: true  },
    { id: 'mood',    icon: '🎭', label: 'Mood Meter',           dBefore: 2,  enabled: true  },
    { id: 'fist',    icon: '✊', label: 'Vote de confiance',    dBefore: 0,  enabled: true  },
    { id: 'sondage', icon: '📊', label: 'Sondage équipe',       dBefore: 2,  enabled: false },
    { id: 'planning',icon: '📋', label: 'Sprint Planning',      dBefore: 0,  enabled: false },
];

export function loadReminders() {
    try {
        const saved = JSON.parse(localStorage.getItem(_LS_REMINDERS) || '{}');
        const result = {};
        for (const def of REMINDER_DEFS) {
            result[def.id] = {
                dBefore: saved[def.id]?.dBefore ?? def.dBefore,
                enabled: saved[def.id]?.enabled ?? def.enabled,
            };
        }
        return result;
    } catch { return Object.fromEntries(REMINDER_DEFS.map(d => [d.id, { dBefore: d.dBefore, enabled: d.enabled }])); }
}

export function saveReminders(data) {
    localStorage.setItem(_LS_REMINDERS, JSON.stringify(data));
}
