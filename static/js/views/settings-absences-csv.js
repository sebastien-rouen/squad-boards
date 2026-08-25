/**
 * Import CSV des absences (congés RH) — parser pivot, consolidation des jours consécutifs
 * et résumé par membre. Extrait de settings.js (v3.141.7) : logique pure et testable,
 * sans aucune dépendance (pas même utils.js).
 *
 * Le parser PIVOT lit un en-tête de colonnes de dates (dd/mm) et déduit au passage les
 * bornes du PI, qui alimentent `pi-cfg-<N>` (startDateFromCsv / sprintsPerPIFromCsv).
 */

// ── CSV Absences : parser pivot (header = dates dd/mm) ──────────────────────
// Détecte le format RH classique où chaque colonne après les 3-4 colonnes meta
// (Nom, Équipe, Entité, Rôle) représente un jour. La cellule contient le nombre
// de jours d'absence (1 = jour entier, 0.5 = demi-journée, vide = présent).
//
// IMPORTANT : on split sur TAB ou ; uniquement, jamais sur virgule — les noms RH
// sont souvent au format "NOM, Prénom" et la virgule fait partie du nom.
//
// Retourne `{ absences, members }` (les 2 tableaux dérivés du même CSV).
// Les `members` sont uniques par (name|team), avec entity + role capturés depuis
// les colonnes correspondantes du header. Permet de synchroniser la table member
// avec l'entité — sans ça, l'entité du CSV était silencieusement perdue.
//
// Retourne null si le format ne ressemble pas à un pivot (→ fallback ligne).
function _parsePivotAbsencesCsv(raw, year, pipDays = 2) {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const splitLine = (l) => l.split(/[\t;]/).map(c => c.trim());
    const header = splitLine(lines[0]);
    // Cherche des colonnes date dd/mm (avec ou sans année) à partir de la 4e colonne
    const datePattern = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
    const dateCols = [];
    for (let i = 3; i < header.length; i++) {
        const m = header[i].match(datePattern);
        if (m) {
            const dd = m[1].padStart(2, '0');
            const mm = m[2].padStart(2, '0');
            const yy = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : year;
            dateCols.push({ idx: i, iso: `${yy}-${mm}-${dd}` });
        }
    }
    // Heuristique : il faut au moins 3 colonnes date pour considérer que c'est un pivot
    if (dateCols.length < 3) return null;
    // Résolution des colonnes méta (Nom, Équipe, Entité, Rôle) par nom d'en-tête
    const _norm = s => (s || '').toLowerCase().replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ûü]/g, 'u').trim();
    const _findCol = (regex, fallback) => {
        const idx = header.findIndex(h => regex.test(_norm(h)));
        return idx >= 0 ? idx : fallback;
    };
    const nameIdx   = _findCol(/^(noms?|nom[\s,]*prenom|name)/, 0);
    const teamIdx   = _findCol(/^(equipes?|team)s?$/,           1);
    const entityIdx = _findCol(/^(entite|entity|societe|organisation)$/, 2);
    const roleIdx   = _findCol(/^(roles?|fonction|role)s?$/,    3);

    const absences = [];
    const memberByKey = new Map();   // (name|team) → { name, team, entity, role }
    // Ce que le parser écarte — remonté à l'appelant pour être AFFICHÉ, pas avalé.
    let ignoredCells = 0;
    const ignoredSamples = [];
    let skippedRows = 0;
    for (let r = 1; r < lines.length; r++) {
        const cols = splitLine(lines[r]);
        // Trim agressif sur les méta (espaces invisibles dans les exports Excel) — évite des doublons
        // type "Alain Lenom" vs "Alain Lenom " (trailing space).
        const name   = (cols[nameIdx]   || '').replace(/\s+/g, ' ').trim();
        const team   = (cols[teamIdx]   || '').replace(/\s+/g, ' ').trim();
        const entity = (cols[entityIdx] || '').replace(/\s+/g, ' ').trim();
        const role   = (cols[roleIdx]   || '').replace(/\s+/g, ' ').trim();
        if (!name) { skippedRows++; continue; }

        // Member unique par (name|team). Si plusieurs lignes du CSV donnent le même
        // (name, team), on garde la 1re ; pour les valeurs non-vides on enrichit.
        const key = `${name}|${team}`;
        if (!memberByKey.has(key)) {
            memberByKey.set(key, { name, team, entity, role });
        } else {
            const existing = memberByKey.get(key);
            if (!existing.entity && entity) existing.entity = entity;
            if (!existing.role && role)     existing.role   = role;
        }

        for (const dc of dateCols) {
            const v = cols[dc.idx];
            if (!v) continue;
            // Cellule = nombre de jours. "1" plein, "0.5" demi. Ignore "0", "-", "x" textuels.
            const num = parseFloat(v.replace(',', '.'));
            if (!num || num <= 0) {
                // ⚠️ Le cas qui coûtait le plus cher : un export RH qui écrit « CP » ou
                // « RTT » au lieu d'un nombre produisait un import PARFAITEMENT SILENCIEUX
                // — membres créés, zéro absence, aucun message. On collecte donc ce qui est
                // écarté pour le dire, sans changer la règle : seul un nombre compte.
                const txt = v.trim();
                if (txt && !/^[0\s.,;x×–—-]*$/i.test(txt)) {
                    ignoredCells++;
                    if (!ignoredSamples.includes(txt) && ignoredSamples.length < 5) ignoredSamples.push(txt);
                }
                continue;
            }
            absences.push({
                memberName: name,
                team,
                startDate: dc.iso,
                endDate: dc.iso,
                type: 'conge',
                days: num,
            });
        }
    }
    if (!absences.length && memberByKey.size === 0) return null;
    // Consolidation : regroupe les jours consécutifs en UNE absence avec days = somme.
    // Convention RH : vendredi → lundi est considéré contigu (gap calendaire 3j = week-end).
    // Les colonnes date de l'en-tête = jours ouvrés du PI + PIP du PI suivant.
    // Les `pipDays` dernières colonnes = PIP (PI Planning du prochain PI) → exclues du calcul
    // de la fin du PI courant (mais leurs absences restent importées).
    const sortedDates = dateCols.map(dc => dc.iso).sort();
    const nPip = Math.max(0, Math.min(pipDays, sortedDates.length - 1));
    const piDates = nPip > 0 ? sortedDates.slice(0, -nPip) : sortedDates;
    const pipDates = nPip > 0 ? sortedDates.slice(-nPip) : [];
    return {
        absences: _consolidateConsecutive(absences),
        members: [...memberByKey.values()],
        piStartDate: piDates[0] || null,
        piEndDate:   piDates[piDates.length - 1] || null,   // fin du PI courant (hors PIP)
        dayCount:    piDates.length,
        pipDates,                                            // jours PIP du prochain PI
        ignoredCells,                                        // cellules non numériques écartées
        ignoredSamples,                                      // jusqu'à 5 valeurs, pour le message
        skippedRows,                                         // lignes sans nom
    };
}

// Regroupe les absences journalières d'un même membre+équipe quand elles sont contiguës.
// "Contiguës" = gap calendaire ≤ 3 jours entre 2 dates triées (saute le week-end).
function _consolidateConsecutive(rawAbsences) {
    const byKey = new Map();
    for (const a of rawAbsences) {
        const key = `${a.memberName}|${a.team}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(a);
    }
    const out = [];
    for (const list of byKey.values()) {
        list.sort((a, b) => a.startDate.localeCompare(b.startDate));
        let cur = null;
        for (const a of list) {
            if (!cur) { cur = { ...a }; continue; }
            const d1 = new Date(cur.endDate   + 'T00:00:00').getTime();
            const d2 = new Date(a.startDate   + 'T00:00:00').getTime();
            const gapDays = Math.round((d2 - d1) / 86400000);
            if (gapDays > 0 && gapDays <= 3) {
                cur.endDate = a.startDate;
                cur.days   += a.days;
            } else {
                out.push(cur);
                cur = { ...a };
            }
        }
        if (cur) out.push(cur);
    }
    return out;
}

// Calcule l'info absences d'un membre pour affichage compact dans la liste Settings :
// - todayCount : nombre de jours d'absence couvrant aujourd'hui
// - nextStart  : prochaine date d'absence après aujourd'hui (format dd/mm)
// - nextDays   : total de jours sur la prochaine plage
// - stripHtml  : strip 30 prochains jours (1 case par jour, coloriée si absent)
// - tooltip    : récap textuel
function _memberAbsenceInfo(memberName, absences) {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const ms = (d) => new Date(d + 'T00:00:00').getTime();
    const my = (absences || []).filter(a => a.memberName === memberName);

    // Aujourd'hui : absence couvrant la date
    const todayAbs = my.filter(a => (a.startDate || '') <= todayIso && (a.endDate || '') >= todayIso);
    const todayCount = todayAbs.reduce((s, a) => s + (a.days || 0), 0);

    // Prochain congé (postérieur à today)
    const upcoming = my
        .filter(a => (a.startDate || '') > todayIso)
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    const next = upcoming[0];
    const _fmtDDMM = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';

    // Strip 30 jours : 1 case par jour, colorée si dans une plage d'absence
    const DAYS = 30;
    const inAbs = (iso) => my.some(a => (a.startDate || '') <= iso && (a.endDate || '') >= iso);
    const _add = (n) => {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    };
    let stripHtml = '';
    let totalAbsentInWindow = 0;
    for (let i = 0; i < DAYS; i++) {
        const iso = _add(i);
        const dow = new Date(iso + 'T00:00:00').getDay(); // 0=dim, 6=sam
        const isWeekend = dow === 0 || dow === 6;
        const absent = inAbs(iso);
        if (absent && !isWeekend) totalAbsentInWindow++;
        const cls = absent ? 'member-abs-day member-abs-day--off' : (isWeekend ? 'member-abs-day member-abs-day--we' : 'member-abs-day');
        stripHtml += `<span class="${cls}" title="${_fmtDDMM(iso)}${absent ? ' · congé' : ''}"></span>`;
    }
    const tooltip = `${my.length} absence(s) au total · ${totalAbsentInWindow}j sur les 30 prochains jours` + (next ? ` · prochain : ${_fmtDDMM(next.startDate)}` : '');

    return {
        todayCount,
        nextStart: next ? _fmtDDMM(next.startDate) : '',
        nextDays: next ? (next.days || 0) : 0,
        stripHtml,
        tooltip,
    };
}

// Une équipe transverse n'est pas une équipe agile dédiée → ses membres ne sont
// pas comptabilisés dans la rotation support, ni dans la capacité d'une équipe.
// Patterns reconnus : "Team X", "TRV", "Transverse", "Pool", "Shared".
function _isTransverseTeam(team) {
    if (!team) return false;
    const t = team.toLowerCase().trim();
    return /^team\s+x\b/.test(t)
        || /^trv\b/.test(t)
        || /transverse/.test(t)
        || /^pool\b/.test(t)
        || /^shared\b/.test(t);
}


/**
 * Pourquoi ce CSV n'a-t-il pas été reconnu ? Rend un message actionnable plutôt que le
 * « Aucune donnée valide détectée » d'origine, qui recouvrait quatre causes distinctes :
 * séparateur virgule, colonnes de dates absentes, format de date inattendu, en-tête seul.
 * Chercher l'erreur à la main dans un export RH de cinquante colonnes est décourageant.
 *
 * @returns {{titre: string, indice: string}|null} null si rien d'anormal n'est détecté
 */
function diagnosePivotCsv(raw) {
    const lines = String(raw || '').split('\n').filter(l => l.trim());
    if (!lines.length) return { titre: 'Le champ est vide.', indice: 'Collez le contenu du fichier, ou déposez-le directement dans la zone.' };
    if (lines.length < 2) return {
        titre: 'Une seule ligne détectée.',
        indice: 'Le format pivot attend un en-tête de dates PUIS au moins une ligne de personne.',
    };

    const head = lines[0];
    const nbTab = (head.match(/\t/g) || []).length;
    const nbPv  = (head.match(/;/g) || []).length;
    const nbVir = (head.match(/,/g) || []).length;
    // La virgule n'est JAMAIS un séparateur ici : les noms RH sont au format « NOM, Prénom ».
    // Mais un export qui l'utilise quand même est un cas fréquent, et sans ce message il se
    // présente comme un « format non reconnu » sans plus d'explication.
    if (nbTab === 0 && nbPv === 0 && nbVir >= 3) return {
        titre: 'Colonnes séparées par des virgules.',
        indice: 'Seuls la tabulation et le point-virgule sont acceptés — la virgule fait partie des noms (« NOM, Prénom »). Ré-exportez en « CSV séparé par point-virgule », ou collez directement depuis Excel (tabulations).',
    };

    const sep = nbTab >= nbPv ? '\t' : ';';
    const cols = head.split(sep).map(c => c.trim());
    const bonnes = cols.filter(c => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(c)).length;
    if (bonnes >= 3) return null;   // le pivot aurait dû passer : rien à diagnostiquer ici

    const autresDates = cols.filter(c => /^\d{1,2}[-.]\d{1,2}([-.]\d{2,4})?$/.test(c)).length;
    if (autresDates >= 3) return {
        titre: `Dates de l'en-tête au format « ${cols.find(c => /^\d{1,2}[-.]\d{1,2}/.test(c))} ».`,
        indice: 'Le format attendu est jj/mm (ex. 03/04), avec des barres obliques. Un remplacement « - » → « / » dans l\'en-tête suffit.',
    };
    if (bonnes > 0) return {
        titre: `Seulement ${bonnes} colonne(s) de date reconnue(s) dans l'en-tête.`,
        indice: 'Il en faut au moins 3 pour que le format pivot soit détecté — vérifiez que la ligne d\'en-tête est bien la PREMIÈRE ligne collée.',
    };
    return {
        titre: 'Aucune colonne de date jj/mm dans la première ligne.',
        indice: 'Le format pivot attend un en-tête du type « NOMS, Prénom | Équipes | Entité | Rôles | 03/04 | 06/04 | … ». Vérifiez qu\'aucune ligne de titre ne précède l\'en-tête.',
    };
}

export { _parsePivotAbsencesCsv, _consolidateConsecutive, _memberAbsenceInfo, _isTransverseTeam, diagnosePivotCsv };
