/**
 * 🎨 Feuille de style du document « Sprint Review » (sprint_tickets_modal.js → onglet autonome, imprimable,
 * Confluence-ready). Extraite en 3.254.0 : un document ouvert dans un NOUVEL onglet ne peut pas lier les CSS de
 * l'application — le style voyage donc dans le HTML généré. Seule variable : la couleur de l'état du sprint.
 */
/** @param {string} stateColor  couleur de la pastille d'état (en cours / clôturé) */
export function sprintReviewCss(stateColor) {
    return `* { box-sizing: border-box; }
body { font-family: Georgia, "Iowan Old Style", Palatino, serif; max-width: 920px; margin: 32px auto; padding: 0 28px; color: #1a202c; line-height: 1.65; }
/* Toolbar sticky avec bouton Slack */
.cr-toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    justify-content: flex-end;
    padding: 12px 0 14px;
    margin: -12px -28px 18px;
    padding-right: 28px;
    background: linear-gradient(to bottom, #fff 0%, #fff 75%, rgba(255,255,255,0.9) 100%);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid #f1f5f9;
}
.slack-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #4A154B 0%, #611f64 100%);
    color: #fff;
    border: 1px solid #4A154B;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(74,21,75,0.25);
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.slack-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(74,21,75,0.35); }
.slack-btn:active { transform: translateY(0); box-shadow: 0 1px 3px rgba(74,21,75,0.4); }
.slack-btn.is-ok { background: linear-gradient(135deg,#047857,#10b981); border-color: #10b981; box-shadow: 0 4px 14px rgba(16,185,129,0.35); }
.slack-btn.is-err { background: linear-gradient(135deg,#b91c1c,#ef4444); border-color: #ef4444; }
.slack-btn-icon { font-size: 15px; line-height: 1; }
@media print { .cr-toolbar { display: none; } }

.cr-header { border-bottom: 3px double #cbd5e1; padding-bottom: 18px; margin-bottom: 28px; }
.cr-title { margin: 0; font-size: 26px; color: #0f172a; }
.cr-state { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; background: ${stateColor}; text-transform: uppercase; letter-spacing: .08em; margin-left: 8px; vertical-align: 4px; font-family: system-ui, sans-serif; }
.cr-meta { color: #475569; font-size: 14px; margin-top: 8px; }
.cr-meta strong { color: #1a202c; }

h2 { font-size: 18px; color: #0f172a; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
h2 .badge { display: inline-block; margin-left: 8px; padding: 1px 9px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; font-family: system-ui, sans-serif; vertical-align: 3px; }

.goal {
    background: linear-gradient(135deg, #fef3c7, #fffbeb);
    border-left: 4px solid #f59e0b;
    padding: 12px 18px;
    border-radius: 0 8px 8px 0;
    margin: 12px 0;
    font-size: 15px;
    font-style: italic;
}
.goal--empty { background: #f8fafc; border-left-color: #cbd5e1; color: #94a3b8; }

.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 12px 0; font-family: system-ui, sans-serif; }
.metric { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; text-align: center; }
.metric .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.metric .val { font-size: 24px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.metric .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.metric--ok .val { color: #047857; }
.metric--warn .val { color: #b45309; }

/* ── Lead Time / Cycle Time ────────────────────────────────────────────── */
.lct-schema { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 14px 10px; margin: 12px 0; overflow-x: auto; }
.lct-diagram { display: block; max-width: 660px; margin: 0 auto; }
.lct-note { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; color: #475569; background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 10px 16px; border-radius: 0 8px 8px 0; margin: 10px 0; }
.lct-note strong { color: #0f172a; }
.lct-h3 { font-family: system-ui, sans-serif; font-size: 13.5px; font-weight: 700; color: #334155; margin: 18px 0 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.lct-legend { font-weight: 500; font-size: 11.5px; color: #64748b; display: inline-flex; align-items: center; gap: 6px; }
.lct-sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin: 0 3px 0 8px; vertical-align: -1px; }
.lct-sw--cycle { background: #22c55e; }
.lct-sw--wait { background: #fcd34d; }
.lct-tickets { font-family: system-ui, sans-serif; margin: 6px 0; }
.lct-tk { display: grid; grid-template-columns: minmax(0, 210px) 1fr 74px; align-items: center; gap: 10px; padding: 5px 0; }
.lct-tk-meta { min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.lct-tk-id a, .lct-tk-id { font-family: ui-monospace, monospace; font-size: 11.5px; color: #1d4ed8; text-decoration: none; }
.lct-tk-id a:hover { text-decoration: underline; }
.lct-tk-title { font-size: 10.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lct-tk-track { position: relative; display: flex; height: 16px; background: #f1f5f9; border-radius: 4px; overflow: hidden; border: 1px solid #e2e8f0; }
.lct-tk-wait { background: repeating-linear-gradient(45deg, #fde68a 0 5px, #fcd34d 5px 10px); }
.lct-tk-cycle { background: #22c55e; color: #fff; font-size: 9.5px; font-weight: 700; line-height: 16px; text-align: center; min-width: 0; }
.lct-tk-over { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); font-size: 9.5px; font-weight: 800; letter-spacing: .02em; color: #7c2d12; background: rgba(255,255,255,.82); border-radius: 3px; padding: 0 4px; line-height: 1.5; white-space: nowrap; }
.lct-tk-num { font-size: 11.5px; font-variant-numeric: tabular-nums; color: #0f172a; font-weight: 600; text-align: right; }
.lct-tk-num small { color: #22a559; font-weight: 700; }
.lct-tk-num--over { color: #b45309; }

ul.cr-tickets { list-style: none; padding: 0; margin: 8px 0; font-family: system-ui, sans-serif; }
ul.cr-tickets li { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13.5px; }
ul.cr-tickets li:last-child { border-bottom: none; }
ul.cr-tickets a { color: #1d4ed8; text-decoration: none; font-family: ui-monospace, monospace; font-size: 12px; }
ul.cr-tickets a:hover { text-decoration: underline; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; font-family: system-ui, sans-serif; }
.pill-pts { background: #dbeafe; color: #1d4ed8; }
.leader { color: #64748b; font-size: 11.5px; font-family: system-ui, sans-serif; }

.attention { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 18px; border-radius: 0 8px 8px 0; margin: 12px 0; }
.attention strong { color: #b91c1c; }
.attention--ok { background: #ecfdf5; border-left-color: #10b981; }
.attention--ok strong { color: #047857; }

.empty { color: #94a3b8; font-style: italic; padding: 8px 4px; }

.notes-zone {
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    padding: 18px;
    background: #fafafa;
    min-height: 120px;
    color: #1a202c;
    font-style: normal;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
}
.notes-zone:focus {
    border-color: #4A154B;
    border-style: solid;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(74,21,75,0.12);
}
.notes-zone:empty::before {
    content: attr(placeholder);
    color: #94a3b8;
    font-style: italic;
}
.cr-edit-hint { color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 8px; font-style: italic; }

/* Boutons toolbar (PNG, PDF, lien PI) */
.tb-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 12px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
}
.tb-btn:hover { background: #fff; border-color: #94a3b8; color: #0f172a; transform: translateY(-1px); }

.cr-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; font-family: system-ui, sans-serif; }

/* ── PI Objectives ─────────────────────────────────────────────────────── */
.pi-summary {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
    font-size: 12px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    vertical-align: 3px;
}
.pi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; margin: 10px 0; font-family: system-ui, sans-serif; }
.pi-obj {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    border-left: 3px solid #cbd5e1;
    background: #f8fafc;
    font-size: 13px;
}
.pi-obj.is-done    { background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 70%); border-left-color: #10b981; box-shadow: 0 1px 4px rgba(16,185,129,0.15); }
.pi-obj.is-inprog  { background: #eff6ff; border-left-color: #3b82f6; }
.pi-obj.is-blocked { background: #fef2f2; border-left-color: #ef4444; }
.pi-obj.is-stretch { border-style: dashed; opacity: 0.85; }
.pi-obj-state {
    flex-shrink: 0;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%; font-size: 12px; font-weight: 700;
    background: #e2e8f0; color: #475569;
}
.pi-obj.is-done .pi-obj-state    { background: linear-gradient(135deg,#10b981,#34d399); color: #fff; box-shadow: 0 0 0 3px rgba(16,185,129,0.18); }
.pi-obj.is-inprog .pi-obj-state  { background: #3b82f6; color: #fff; }
.pi-obj.is-blocked .pi-obj-state { background: #ef4444; color: #fff; }
.pi-obj-text { flex: 1; line-height: 1.3; }
.pi-obj-bv {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fef3c7;
    color: #b45309;
    font-weight: 700;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.pi-obj.is-done .pi-obj-bv { background: linear-gradient(135deg,#fbbf24,#f97316); color: #fff; }

/* ── Vélocité PI (mini-card + sparkline horizontal) ────────────────────── */
.vel-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin: 10px 0; font-family: system-ui, sans-serif; }
.vel-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.vel-title { font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; }
.vel-title small { font-weight: 500; color: #64748b; text-transform: none; letter-spacing: 0; font-size: 11px; margin-left: 6px; }
.vel-kpis { display: flex; flex-wrap: wrap; gap: 6px; }
.vel-kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 10px; display: flex; flex-direction: column; align-items: flex-end; min-width: 64px; }
.vel-kpi-val { font-size: 14px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.1; }
.vel-kpi-lbl { font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
.vel-kpi--good { border-color: #a7f3d0; }
.vel-kpi--good .vel-kpi-val { color: #047857; }
.vel-kpi--warn { border-color: #fde68a; }
.vel-kpi--warn .vel-kpi-val { color: #b45309; }

.vel-spark { display: flex; align-items: flex-end; gap: 8px; height: 80px; padding: 8px 4px 0; }
.vel-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; min-width: 26px; }
.vel-bar { width: 100%; border-radius: 4px 4px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 3px; }
.vel-bar-pts { font-size: 10px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.25); font-variant-numeric: tabular-nums; }
.vel-bar-name { font-size: 9.5px; color: #475569; margin-top: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
.vel-bar--closed  { background: linear-gradient(to top, #6ee7b7, #047857); }
.vel-bar--current { background: linear-gradient(to top, #93c5fd, #1d4ed8); box-shadow: 0 0 0 1px #3b82f6; }
.vel-bar--best    { background: linear-gradient(to top, #fcd34d, #b45309); box-shadow: 0 0 6px rgba(251,191,36,0.45); }
.vel-bar--breath  { background: linear-gradient(to top, #bbf7d0, #4ade80); border: 1px solid #34d399; }
.vel-bar--future  { background: #f1f5f9; border: 1px dashed #cbd5e1; }
.vel-breath-badge { position: absolute; top: -3px; font-size: 12px; }
.vel-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10.5px; color: #64748b; }
.vel-legend-item { display: inline-flex; align-items: center; gap: 4px; }
.vel-legend-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }

/* ── Réalisations regroupées ───────────────────────────────────────────── */
.wins-group { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; margin: 8px 0; }
.wins-group-title { margin: 0 0 6px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; font-family: system-ui, sans-serif; border: none; padding: 0; }
.wins-group-icon { font-size: 13px; }
.wins-group-count { background: #e2e8f0; color: #1a202c; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: none; }
.wins-group-pts { margin-left: auto; color: #b45309; font-weight: 700; font-size: 11px; }
.wins-group .cr-tickets { margin: 4px 0; }

/* Chip feature parente discrète dans la ligne ticket */
.parent-chip { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; font-style: italic; font-family: system-ui, sans-serif; }

/* ── Climat équipe (Mood + Fist) ─────────────────────────────────────── */
.vote-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 10px 0; font-family: system-ui, sans-serif; }
@media (max-width: 700px) { .vote-grid { grid-template-columns: 1fr; } }
.vote-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
.vote-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vote-card-icon { font-size: 18px; }
.vote-card-title { font-weight: 700; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
.vote-card-count { margin-left: auto; font-size: 11px; color: #64748b; padding: 1px 8px; border-radius: 999px; background: #e2e8f0; }
.vote-card-score { text-align: center; font-size: 32px; padding: 8px 0; }
.vote-card-score strong { font-weight: 800; font-variant-numeric: tabular-nums; }
.vote-card-score small { font-size: 14px; color: #94a3b8; margin-left: 2px; }
.vote-dist { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.vote-dist-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.vote-dist-face { width: 22px; text-align: center; font-size: 14px; }
.vote-dist-fist { width: 22px; text-align: center; font-weight: 700; color: #475569; }
.vote-dist-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.vote-dist-fill { height: 100%; transition: width 0.2s; }
.vote-dist-label { color: #64748b; font-size: 11px; flex-shrink: 0; min-width: 92px; }
.vote-dist-count { width: 22px; text-align: right; font-weight: 600; color: #1a202c; font-variant-numeric: tabular-nums; }

/* ── Actions rétro à passer en revue ───────────────────────────────────── */
.retro-intro { color: #64748b; font-size: 13px; font-style: italic; margin: 6px 0 12px; font-family: system-ui, sans-serif; }
.retro-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; font-family: system-ui, sans-serif; }
.retro-item {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 4px solid #f59e0b;
    border-radius: 8px;
    padding: 10px 14px;
}
.retro-item.is-done { background: #ecfdf5; border-color: #a7f3d0; border-left-color: #10b981; }
.retro-item.is-blocked { background: #fef2f2; border-color: #fecaca; border-left-color: #ef4444; }
.retro-item.is-inprog { background: #eff6ff; border-color: #bfdbfe; border-left-color: #3b82f6; }
.retro-item-hdr { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.retro-item-hdr a { font-family: ui-monospace, monospace; font-size: 12px; color: #1d4ed8; text-decoration: none; }
.retro-item-hdr a:hover { text-decoration: underline; }
.retro-status {
    flex-shrink: 0;
    padding: 2px 9px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #1a202c;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.retro-item.is-done .retro-status    { background: linear-gradient(135deg,#10b981,#34d399); color: #fff; }
.retro-item.is-blocked .retro-status { background: #ef4444; color: #fff; }
.retro-item.is-inprog .retro-status  { background: #3b82f6; color: #fff; }
.retro-title { color: #0f172a; font-weight: 500; }
.retro-owner { color: #64748b; font-size: 12px; font-style: italic; }

/* Description dépliable */
.retro-desc { margin-top: 8px; border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 6px; }
.retro-desc summary {
    cursor: pointer;
    font-size: 11.5px;
    color: #475569;
    padding: 4px 0;
    user-select: none;
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.retro-desc summary::-webkit-details-marker { display: none; }
.retro-desc summary::before {
    content: '▸';
    display: inline-block;
    transition: transform 0.15s;
    color: #94a3b8;
}
.retro-desc[open] summary::before { transform: rotate(90deg); }
.retro-desc summary:hover { color: #0f172a; }
.retro-desc-body {
    margin-top: 8px;
    padding: 10px 12px;
    background: #fff;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    font-size: 13px;
    color: #334155;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: Georgia, "Iowan Old Style", Palatino, serif;
}
.retro-desc-body p { margin: 0.6em 0; }
.retro-desc-body ul, .retro-desc-body ol { padding-left: 1.4em; margin: 0.6em 0; }
.retro-desc-body code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.9em; }
.retro-desc-body a { color: #1d4ed8; }

@media print {
    body { margin: 0; padding: 16px; max-width: none; }
    h2 { break-after: avoid; }
    .notes-zone { background: #fff; min-height: 60px; }
    .pi-obj, .wins-group, .vel-card { break-inside: avoid; }
}
`;
}
