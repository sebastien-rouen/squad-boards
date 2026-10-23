/**
 * Pages au contenu IDENTIQUE d'une direction à l'autre — 03 Modales, 05 Mobilité, et les écrans
 * mobiles communs de 04 (état vide, alerte d'absence). La direction fournit son fond (l'écran
 * signature, assombri sous la modale) et ses notes ; l'identité vient de son pont de tokens.
 */
const U = require('./ui.cjs');
const C = require('./common.cjs');
const { D, screen, topbar, tabbar, sheet, modal, toast, btn, chip, av, esc, desk, deskTop } = U;

const hugo = C.hugo, noah = C.noah;

/** 03 — Modales : fiche membre, évaluer, monter en compétence, qui affecter, retirer (annulable). */
function p03(dir, { backdrop, backdropMobile, notes }) {
    const deskHtml = desk({ mod: dir.mod, top: deskTop('fiche membre', '🗺️ Carte'), body: backdrop() })
        .replace(/<\/div>$/, `${modal(`🧑 Fiche de ${esc(noah.first)}`, C.memberBody(noah, true), `${btn('Fermer', 'ghost')}${btn('✏️ Évaluer', 'primary')}`, 'wide')}</div>`);
    const bg = backdropMobile();
    return {
        key: '03-modales', title: 'Modales',
        sub: 'Fiche membre, évaluation, montée en compétence, « Qui affecter ? », suppression annulable — mêmes contenus partout, habillés par la direction.',
        deskNote: 'fiche membre en modale large par-dessus l\'écran signature',
        desk: deskHtml,
        phones: [
            { tag: 'Fiche membre', cap: 'Fiche de Noah', why: 'Radar comparé à la moyenne de l\'équipe : on voit d\'un coup où il est le seul recours.',
              html: screen({ top: topbar('Atlas'), body: bg + sheet(`🧑 ${esc(noah.name)}`, C.memberBody(noah)), tabbar: tabbar('carte') }) },
            { tag: 'Évaluer', cap: 'Évaluer Kafka pour Hugo', why: 'Le niveau proposé est le suivant (2) : une évaluation sert surtout à constater un progrès. Libellés complets, pas des chiffres nus.',
              html: screen({ top: topbar('Atlas'), body: bg + sheet('✏️ Évaluer une compétence', C.evalBody(hugo, 'kafka'), `${btn('Annuler', 'ghost')}${btn('Enregistrer', 'primary')}`) }) },
            { tag: 'Montée en compétence', cap: 'Ticket prérempli', why: 'Créé depuis la lacune : titre, niveau visé, binôme et échéance déjà posés. Le binôme est choisi AVANT l\'absence du sachant.',
              html: screen({ top: topbar('Monter en compétence', { back: true }), body: C.skillUpBody(hugo, 'kafka', noah) + btn('🚀 Créer le ticket', 'primary block') }) },
            { tag: 'Qui affecter ?', cap: 'Kubernetes pour Delta', why: 'Classement par niveau, puis appétence, avec la charge et les absences : la réponse tient compte de la réalité, pas seulement des compétences.',
              html: screen({ top: topbar('Qui affecter ?', { back: true, sub: 'Kubernetes · Delta' }), body: C.suggestBody('k8s', 'Delta') }) },
            { tag: 'Suppression annulable', cap: 'Retirer « Angular » du catalogue', why: 'Pas de confirmation bloquante : retrait immédiat, évaluations gardées 30 jours, « Annuler » pendant 8 secondes.',
              html: screen({ top: topbar('Catalogue', { sub: '10 compétences' }), body: C.catalogBody() + toast('« Angular » retirée · 13 évaluations conservées 30 j'), tabbar: tabbar('catalogue') }) },
        ],
        notes,
    };
}

/** 05 — Mobilité & trajectoires : souhaits par étape, trajectoire, plan, bilan. */
function p05(dir, { notes, deskExtra = '' }) {
    const kanban = `<div class="kanban">${C.STAGES.map(st => `<section class="kanban__col"><h4>${st} <span class="badge">${C.MOBILITY.filter(m => m.stage === st).length}</span></h4>${C.MOBILITY.filter(m => m.stage === st).map(C.mobCard).join('')}</section>`).join('')}</div>`;
    const deskHtml = desk({
        mod: dir.mod, top: deskTop('mobilité & trajectoires', '🧭 Mobilité', btn('＋ Nouveau souhait', 'primary')),
        body: `${kanban}<section class="card">${C.trajectory(true)}</section>`,
        side: `<h3>⚖️ Effets sur les équipes</h3><div class="callout">Cobalt : si Lina devient Scrum Master, Angular passe à 1 sachant.</div><div class="callout">Éole : Théo vise « Expert Kubernetes » — il est aussi le candidat n°1 pour couvrir Delta.</div><h3>📅 Prochains points</h3>${[['14 nov.', 'Rétro Cobalt animée par Lina'], ['21 nov.', 'Bilan de Tom (coach agile)'], ['PI 32', 'Formation PSM I']].map(([d, t]) => `<div class="row"><span class="row__main"><b>${t}</b><span class="row__meta">${d}</span></span></div>`).join('')}${deskExtra}`,
    });
    const tom = C.P('Tom Fontaine');
    return {
        key: '05-mobilite', title: 'Mobilité & trajectoires',
        sub: 'Un sujet qui porte sa propre complexité : souhait, plan, suivi, bilan — et ses effets sur la couverture des équipes.',
        deskNote: 'souhaits par étape, trajectoire détaillée, effets sur les équipes',
        desk: deskHtml,
        phones: [
            { tag: 'Souhaits', cap: 'Les trajectoires du train', why: 'Groupées par étape : on voit ce qui attend une décision (Souhait) et ce qui arrive à son bilan.',
              html: screen({ top: topbar('Mobilité', { sub: '5 trajectoires' }), body: C.STAGES.map(st => `<h4 class="sec-title">${st}</h4>${C.MOBILITY.filter(m => m.stage === st).map(C.mobCard).join('')}`).join(''), tabbar: tabbar('mobilite') }) },
            { tag: 'Trajectoire', cap: 'Lina → Scrum Master', why: 'Radar comparé au profil cible : l\'écart se lit sans tableau. L\'effet sur Cobalt est dit tout de suite, avec une relève proposée.',
              html: screen({ top: topbar('Trajectoire', { back: true }), body: C.trajectory() }) },
            { tag: 'Plan d\'actions', cap: 'Ajouter une étape', why: 'Étapes datées et rattachées à un évènement réel (rétro, formation) : le plan vit dans l\'agenda de l\'équipe.',
              html: screen({ top: topbar('Trajectoire', { back: true }), body: C.trajectory() + sheet('＋ Nouvelle étape', U.field('Action', '<span class="input input--focus">Animer le PI Planning de Cobalt (breakout)</span>') + U.field('Quand', '<span class="input">📅 PI 32 · jour 1</span>') + U.field('Accompagnée par', `<span class="input">${av(C.P('Chloé Durand'), 'xs')} Chloé Durand</span>`), `${btn('Annuler', 'ghost')}${btn('Ajouter', 'primary')}`) }) },
            { tag: 'Bilan', cap: 'Tom : coach agile', why: 'Le bilan se conclut par une décision explicite, et la fiche de l\'équipe se met à jour (rôle, capacité dev).',
              html: screen({ top: topbar('Bilan', { back: true, sub: 'Tom Fontaine' }), body: `<div class="inline">${av(tom, 'lg')}<div class="stack"><b>Tech Lead → Coach agile</b><small>4/4 étapes · 2 PI</small></div></div>${U.bar(100, 'ok')}<div class="callout">Capacité dev de Delta : Tom passe de 70 % à 0 % (rôle coach). Effectif dev : 3,7 → 3 ETP.</div>${U.field('Décision', U.seg(['✓ Valider', 'Prolonger', 'Arrêter'], '✓ Valider'))}${btn('Enregistrer le bilan', 'primary block')}` }) },
        ],
        notes,
    };
}

/** Écrans mobiles communs de l'atelier : état vide et alerte d'absence. */
const phoneEmpty = () => ({ tag: 'État vide', cap: 'Premier passage', why: 'Jamais un écran vide : deux portes d\'entrée (catalogue par défaut, import CSV) et la promesse de ce qu\'on obtiendra.',
    html: screen({ top: topbar('Atlas', { sub: 'Aucune évaluation' }), body: C.emptyMatrix(), tabbar: tabbar('matrice') }) });
const phoneAlert = () => ({ tag: 'Alerte', cap: 'Noah part en congés', why: 'L\'absence d\'un sachant unique devient un signal daté, avec les relais possibles : on agit avant le départ, pas pendant.',
    html: screen({ top: topbar('Atlas', { sub: 'Signal du jour' }), body: C.signalCard(C.SIGNALS[0]) + `<h4 class="sec-title">Relais possibles sur Kafka</h4>` + C.suggestBody('kafka', 'Cobalt', { skipAway: true }), tabbar: tabbar('bord') }) });

module.exports = { p03, p05, phoneEmpty, phoneAlert };
