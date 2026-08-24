/* ════════════════════════════════════════════════════════════════════════════
   Exports du calendrier d'équipe : ICS, CSV, Slack, téléchargement.
   Séparé de calendar.js pour que chacun des deux reste lisible — et parce que
   la validité d'un fichier exporté se teste indépendamment de l'interface.
   Chaque fonction reçoit son contexte (`ctx`), aucune variable globale partagée.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const { KINDS, esc, durLabel, DAY_LONG } = window.MK;
    const { hrs, WEEK_MINUTES } = window.MKParts;

    const pad = n => String(n).padStart(2, '0');
    const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const hFr = m => `${pad(Math.floor(m / 60))}h${pad(m % 60)}`;

    /** Jours de semaine sautés par un rituel quotidien, en toutes lettres. */
    const skippedNames = r => (r.skipDays || [])
        .filter(i => i >= 1 && i <= 5).map(i => DAY_LONG[i]);

    /** Où se pose un rituel : « lundi 09h30 », ou « 09h45 (sauf lundi) ». */
    function whenLabel(r) {
        if (r.dow) return `${DAY_LONG[r.dow]} ${hFr(r.startMin)}`;
        const sk = skippedNames(r);
        return `${hFr(r.startMin)}${sk.length ? ` (sauf ${sk.join(', ')})` : ''}`;
    }

    // ── ICS ─────────────────────────────────────────────────────────────────
    function icsText(model, ctx) {
        const stamp = `${ctx.iteration.start.replace(/-/g, '')}T090000`;
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
                       `PRODID:-//Squad Board//Calendrier ${ctx.team}//FR`, 'CALSCALE:GREGORIAN'];
        for (const r of model) {
            if (!r.enabled) continue;
            const firstIso = ctx.occurrences(r)[0] || ctx.days[0] || ctx.iteration.start;
            const first = firstIso.replace(/-/g, '');
            // Une journée entière s'écrit en DATE, pas en DATE-TIME : sinon l'agenda
            // affiche une réunion de 24 h au lieu d'un bandeau sur la journée.
            const allDay = r.allDay;
            const nextDay = (() => {
                const d = new Date(`${firstIso}T12:00:00`);
                d.setDate(d.getDate() + 1);
                return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
            })();
            const st = `${first}T${pad(Math.floor(r.startMin / 60))}${pad(r.startMin % 60)}00`;
            const endMin = r.startMin + r.durMin;
            const en = `${first}T${pad(Math.floor(endMin / 60))}${pad(endMin % 60)}00`;
            // Un « quotidien » qui saute des jours doit les exclure du BYDAY, sinon
            // l'export réintroduit dans l'agenda des occurrences qui n'existent pas :
            // chez Fuego le daily ne se tient pas le lundi (remplacé par le weekly).
            const byday = [1, 2, 3, 4, 5].filter(i => !(r.skipDays || []).includes(i))
                .map(i => ICS_DAY[i]).join(',');
            const rule = r.freq === 'tous les jours' ? `FREQ=WEEKLY;BYDAY=${byday || 'MO,TU,WE,TH,FR'}`
                : r.freq === '1x/sem.' ? `FREQ=WEEKLY;BYDAY=${ICS_DAY[r.dow]}`
                : r.freq === '1x/ité.' ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${ICS_DAY[r.dow]}`
                : `FREQ=MONTHLY;BYDAY=1${ICS_DAY[r.dow]}`;
            lines.push('BEGIN:VEVENT',
                `UID:${r.id}-${ctx.slug}@squad-board`,
                `DTSTAMP:${stamp}`,
                ...(allDay
                    ? [`DTSTART;VALUE=DATE:${first}`, `DTEND;VALUE=DATE:${nextDay}`]
                    : [`DTSTART;TZID=Europe/Paris:${st}`, `DTEND;TZID=Europe/Paris:${en}`]),
                `RRULE:${rule}`,
                `SUMMARY:${r.title.replace(/[,;\\]/g, m => '\\' + m)}`,
                `CATEGORIES:${KINDS[r.kind].short}${r.locked ? ',Imposé ART' : ''}`,
                'END:VEVENT');
        }
        lines.push('END:VCALENDAR');
        return lines.join('\r\n') + '\r\n';    // RFC 5545 : lignes terminées par CRLF
    }

    // ── CSV ─────────────────────────────────────────────────────────────────
    function csvText(model, ctx) {
        const rows = [['Rituel', 'Famille', 'Cadence', 'Jour', 'Heure', 'Durée (min)',
                       'Occurrences sur l’itération', 'Actif', 'Imposé ART']];
        for (const r of model) {
            const sk = skippedNames(r);
            const jour = r.dow ? DAY_LONG[r.dow]
                : sk.length ? `tous les jours sauf ${sk.join(', ')}` : 'tous les jours';
            rows.push([r.title, KINDS[r.kind].short, r.freq, jour, hFr(r.startMin), r.durMin,
                       ctx.occurrences(r).length, r.enabled ? 'oui' : 'non', r.locked ? 'oui' : 'non']);
        }
        // Point-virgule + BOM : Excel francophone ouvre le fichier sans assistant d'import
        return '﻿' + rows.map(r => r.map(v => {
            const s = String(v);
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(';')).join('\r\n');
    }

    // ── Slack ───────────────────────────────────────────────────────────────
    function slackText(model, ctx) {
        const lines = [`:calendar: *Calendrier de l’équipe ${ctx.team}* — cadence des rituels`];
        if (ctx.iteration.fallback) lines.push('_(pas de sprint actif — fenêtre de référence)_');
        lines.push('');
        for (const f of ['tous les jours', '1x/sem.', '1x/ité.', '1x/mois']) {
            const list = model.filter(r => r.enabled && r.freq === f)
                .sort((a, b) => a.dow - b.dow || a.startMin - b.startMin);
            if (!list.length) continue;
            lines.push(`*${f}*`);
            for (const r of list) {
                lines.push(`  ${KINDS[r.kind].dot} ${r.title} — ${whenLabel(r)} (${durLabel(r.durMin)})${r.locked ? ' 🔒' : ''}`);
            }
            lines.push('');
        }
        const busy = model.filter(r => r.enabled)
            .reduce((s, r) => s + r.durMin * ctx.perWeek(r.freq), 0);
        lines.push(`_${hrs(busy)} de rituels par semaine — reste ${hrs(Math.max(0, WEEK_MINUTES - busy))} sur une base de ${hrs(WEEK_MINUTES)}._`);
        lines.push('_🔒 = imposé par le train, non modifiable par l’équipe._');
        return lines.join('\n');
    }

    // ── Téléchargement ──────────────────────────────────────────────────────
    function download(name, text, mime) {
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    window.TCALX = { icsText, csvText, slackText, download, whenLabel, skippedNames, hFr, esc };
})();
