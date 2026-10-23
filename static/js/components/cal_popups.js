/**
 * 📅 Calques du calendrier : détail d'un évènement au clic (façon Google Agenda), infobulles compacte / Scrum / description.
 *
 * Extrait de cal_banner.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers cal_banner.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { esc } from '../utils.js';
import { _SCRUM_DETAILS, _duration, _isFreeze } from './cal_banner.js';

// ── Popup détail événement au clic — style Google Calendar ───────────────────
let _evPopEl = null;

function _evPopup() {
    if (_evPopEl) return _evPopEl;
    _evPopEl = document.createElement('div');
    _evPopEl.id = 'cal-ev-popup';
    _evPopEl.className = 'cal-ev-popup';
    _evPopEl.setAttribute('role', 'dialog');
    document.body.appendChild(_evPopEl);
    // Fermeture via bouton ×
    _evPopEl.addEventListener('click', e => {
        if (e.target.closest('.cal-ev-popup-close')) _hideEvPopup();
    });
    return _evPopEl;
}

function _hideEvPopup() {
    _evPopEl?.classList.remove('visible');
}

function _showEvPopup(card) {
    const d = card.dataset;
    if (!d.evTitle && !d.evStart) return;

    const ev = {
        title:   d.evTitle   || '',
        start:   d.evStart   || '',
        end:     d.evEnd     || '',
        allDay:  d.evAllday  === '1',
        calName: d.evCalname || '',
        team:    d.evTeam    || '',
        color:   d.evColor   || 'var(--primary)',
        visio:   d.evVisio   || '',
        url:     d.evUrl     || '',
        loc:     d.evLoc     || '',
        rawLoc:  d.evRawloc  || '',
        desc:    d.evDesc    || '',
        recur:   d.evRecur   === '1',
        scrum:   d.evScrum   || '',
    };

    // ── Formatage heure ──────────────────────────────────────────────────────
    const s = new Date(ev.start), e = new Date(ev.end);
    const fmtDate = dt => dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    const fmtTime = dt => `${String(dt.getHours()).padStart(2,'0')}h${String(dt.getMinutes()).padStart(2,'0')}`;
    const dur = ev.allDay ? '' : _duration(ev.start, ev.end);

    let timeHtml;
    if (ev.allDay) {
        const endDay = new Date(e.getTime() - 1);
        timeHtml = fmtDate(s) === fmtDate(endDay)
            ? `${fmtDate(s)} · Journée entière`
            : `${fmtDate(s)} → ${fmtDate(endDay)} · Journée entière`;
    } else {
        const sd = fmtDate(s), ed = fmtDate(e);
        timeHtml = sd === ed
            ? `${sd} · ${fmtTime(s)} – ${fmtTime(e)}${dur ? ` <span class="cal-ev-popup-dur">(${dur})</span>` : ''}`
            : `${sd} ${fmtTime(s)} → ${ed} ${fmtTime(e)}`;
    }

    // ── Extraction contacts depuis la description brute ──────────────────────
    const rawDesc = ev.desc;
    const emails = rawDesc
        ? [...new Set(rawDesc.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])].slice(0, 5)
        : [];
    const phones = rawDesc
        ? [...new Set((rawDesc.match(/(?:\+\d{1,3}[\s.]?)?\(?\d{2,4}\)?[\s.\-]?\d{2,4}[\s.\-]?\d{4}/g) || [])
            .map(p => p.trim()).filter(p => p.replace(/\D/g, '').length >= 8))].slice(0, 3)
        : [];

    // Réunion : ID + passcode (Teams, Zoom, Meet)
    const meetIdMatch  = rawDesc.match(/(?:ID[^\d]*|Meeting ID|R.union ID|ID de la r.union)\s*[:\-]?\s*([\d\s]{8,})/i);
    const passcodeMatch = rawDesc.match(/(?:code|passcode|mot de passe|password)\s*[:\-]?\s*(\d{4,10})/i);
    const meetId   = meetIdMatch  ? meetIdMatch[1].trim()  : '';
    const passcode = passcodeMatch ? passcodeMatch[1]       : '';

    // ── Cérémonie Scrum ──────────────────────────────────────────────────────
    const scrumMeta = ev.scrum ? ({ daily: { icon: '🌅', label: 'Daily Scrum', detail: '15 min · toute l\'équipe' },
        planning: { icon: '🎯', label: 'Sprint Planning', detail: 'Début de sprint · équipe + PO' },
        refinement: { icon: '🔍', label: 'Backlog Refinement', detail: 'Estimation + clarification des US' },
        retro: { icon: '🔁', label: 'Rétrospective', detail: 'Fin de sprint · amélioration continue' },
        review: { icon: '🎤', label: 'Sprint Review', detail: 'Démonstration · parties prenantes invitées' },
    })[ev.scrum] : null;

    // ── Description nettoyée ─────────────────────────────────────────────────
    const desc = rawDesc ? _cleanDescHtml(rawDesc) : '';

    // ── Localisation : on affiche la brute si elle apporte plus que physLoc ──
    const displayLoc = ev.rawLoc && ev.rawLoc !== ev.loc && ev.rawLoc.length > (ev.loc.length + 3)
        ? ev.rawLoc : ev.loc;

    // ── Titre ────────────────────────────────────────────────────────────────
    const title = `${_isFreeze(ev.title) ? '❄️ ' : ''}${esc(ev.title)}`;

    const pop = _evPopup();
    pop.innerHTML = `
        <div class="cal-ev-popup-accent" style="background:${esc(ev.color)}"></div>
        <div class="cal-ev-popup-hdr">
            <div class="cal-ev-popup-title">${title}</div>
            <button class="cal-ev-popup-close" aria-label="Fermer">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
            </button>
        </div>
        <div class="cal-ev-popup-body">
            <div class="cal-ev-popup-row"><span class="cal-ev-popup-icon">🕐</span><span>${timeHtml}</span></div>
            ${ev.calName ? `<div class="cal-ev-popup-row">
                <span class="cal-ev-popup-dot" style="background:${esc(ev.color)}"></span>
                <span>${esc(ev.calName)}${ev.team && ev.team !== ev.calName ? ` · <em>${esc(ev.team)}</em>` : ''}</span>
            </div>` : ''}
            ${displayLoc ? `<div class="cal-ev-popup-row"><span class="cal-ev-popup-icon">📍</span><span class="cal-ev-popup-loc">${esc(displayLoc)}</span></div>` : ''}
            ${ev.recur   ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔄</span><span>Événement récurrent</span></div>` : ''}
            ${scrumMeta  ? `<div class="cal-ev-popup-row cal-ev-popup-row--scrum"><span class="cal-ev-popup-icon">${scrumMeta.icon}</span><span><strong>${esc(scrumMeta.label)}</strong> <span class="cal-ev-popup-muted">— ${esc(scrumMeta.detail)}</span></span></div>` : ''}
            ${ev.visio   ? `<a class="cal-ev-popup-btn cal-ev-popup-btn--visio" href="${esc(ev.visio)}" target="_blank" rel="noopener">🎥 Rejoindre la visio</a>` : ''}
            ${ev.url     ? `<a class="cal-ev-popup-btn" href="${esc(ev.url)}" target="_blank" rel="noopener">🔗 Rejoindre</a>` : ''}
            ${(meetId || passcode) ? `<div class="cal-ev-popup-section">
                ${meetId   ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔑</span><span>ID : <code class="cal-ev-popup-code">${esc(meetId)}</code></span></div>` : ''}
                ${passcode ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔒</span><span>Code : <code class="cal-ev-popup-code">${esc(passcode)}</code></span></div>` : ''}
            </div>` : ''}
            ${(emails.length || phones.length) ? `<div class="cal-ev-popup-section">
                <div class="cal-ev-popup-section-hdr">👤 Contacts</div>
                ${emails.map(e => `<div class="cal-ev-popup-contact"><a href="mailto:${esc(e)}">${esc(e)}</a></div>`).join('')}
                ${phones.map(p => `<div class="cal-ev-popup-contact"><a href="tel:${esc(p.replace(/\s/g,''))}">${esc(p)}</a></div>`).join('')}
            </div>` : ''}
            ${desc ? `<div class="cal-ev-popup-desc">${desc}</div>` : ''}
        </div>`;

    // Positionnement : à droite de la carte, flip si débord
    const POP_W = 340, MARGIN = 8, Z = 10100;
    pop.style.cssText = `position:fixed;z-index:${Z};visibility:hidden`;
    const r   = card.getBoundingClientRect();
    const ww  = window.innerWidth, wh = window.innerHeight;
    const popH = Math.min(pop.scrollHeight || 320, wh - 2 * MARGIN);
    let left = r.right + MARGIN;
    if (left + POP_W > ww - MARGIN) left = r.left - POP_W - MARGIN;
    left = Math.max(MARGIN, left);
    let top = r.top;
    if (top + popH > wh - MARGIN) top = wh - MARGIN - popH;
    top = Math.max(MARGIN, top);
    pop.style.cssText = `position:fixed;z-index:${Z};left:${left}px;top:${top}px;width:${POP_W}px;max-height:${popH}px`;
    requestAnimationFrame(() => pop.classList.add('visible'));
}

// Délégation clic globale sur toutes les cartes event
document.addEventListener('click', e => {
    const card = e.target.closest?.('.cal-ev-row[data-ev-start]');
    if (card) { e.stopPropagation(); _showEvPopup(card); return; }
    // Clic ailleurs (hors popup) → ferme
    if (_evPopEl?.classList.contains('visible') && !_evPopEl.contains(e.target)) _hideEvPopup();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _hideEvPopup();
});

// ── Tooltip mode compact (singleton body, position fixed) ────────────────────
let _compactTtEl = null;
let _compactTtHideT = null;
function _compactTooltipEl() {
    if (_compactTtEl) return _compactTtEl;
    _compactTtEl = document.createElement('div');
    _compactTtEl.className = 'cal-compact-tt';
    document.body.appendChild(_compactTtEl);
    _compactTtEl.addEventListener('mouseenter', () => clearTimeout(_compactTtHideT));
    _compactTtEl.addEventListener('mouseleave', _hideCompactTt);
    return _compactTtEl;
}
function _showCompactTt(card) {
    const time    = card.dataset.time  || '';
    const visio   = card.dataset.visio || '';
    const descRaw = card.dataset.desc  || '';
    const loc     = card.dataset.loc   || '';
    const desc    = descRaw ? _cleanDescHtml(descRaw) : '';
    if (!time && !visio && !desc && !loc) return;
    const tt = _compactTooltipEl();
    tt.innerHTML = [
        time  ? `<div class="cal-compact-tt-time">${esc(time)}</div>` : '',
        loc   ? `<div class="cal-compact-tt-row">📍 ${esc(loc)}</div>` : '',
        visio ? `<div class="cal-compact-tt-row"><a class="cal-compact-tt-visio" href="${esc(visio)}" target="_blank" rel="noopener">🎥 Rejoindre la visio</a></div>` : '',
        desc  ? `<div class="cal-compact-tt-desc">${desc}</div>` : '',
    ].join('');
    tt.classList.add('visible');
    const r = card.getBoundingClientRect();
    const W = 280;
    let left = Math.min(r.left, window.innerWidth - W - 8);
    left = Math.max(8, left);
    const below = r.bottom + 8 + 160 < window.innerHeight;
    tt.style.left = `${left}px`;
    tt.style.top  = below ? `${r.bottom + 4}px` : `${r.top - 4}px`;
    tt.style.transform = below ? 'translateY(0)' : 'translateY(-100%)';
    clearTimeout(_compactTtHideT);
}
function _hideCompactTt() {
    clearTimeout(_compactTtHideT);
    _compactTtHideT = setTimeout(() => _compactTtEl?.classList.remove('visible'), 120);
}
document.addEventListener('mouseover', e => {
    const card = e.target.closest?.('.cal-ev-row--compact');
    if (card) _showCompactTt(card);
});
document.addEventListener('mouseout', e => {
    const card = e.target.closest?.('.cal-ev-row--compact');
    if (card && !card.contains(e.relatedTarget)) _hideCompactTt();
});

// ── Tooltip Scrum globale (singleton attaché au body, position: fixed) ──────
// Évite tout clip parent (overflow:hidden, scroll de la modal, etc.).
let _scrumTtEl = null;
function _scrumTooltipEl() {
    if (_scrumTtEl) return _scrumTtEl;
    _scrumTtEl = document.createElement('div');
    _scrumTtEl.id = 'cal-scrum-tt-global';
    _scrumTtEl.className = 'cal-scrum-tt';
    _scrumTtEl.setAttribute('role', 'tooltip');
    document.body.appendChild(_scrumTtEl);
    // Permet de rentrer dans la tooltip sans la fermer
    _scrumTtEl.addEventListener('mouseenter', () => clearTimeout(_scrumTtHideT));
    _scrumTtEl.addEventListener('mouseleave', _hideScrumTt);
    return _scrumTtEl;
}
let _scrumTtHideT = null;
function _showScrumTt(badge) {
    const key = badge.dataset.scrumKey;
    const details = _SCRUM_DETAILS[key];
    if (!details) return;
    const meta = { daily: { icon: '🌅', label: 'Daily' },
                   planning: { icon: '🎯', label: 'Planning' },
                   refinement: { icon: '🔍', label: 'Refinement' },
                   retro: { icon: '🔁', label: 'Rétro' },
                   review: { icon: '🎤', label: 'Sprint Review' } }[key];

    const tt = _scrumTooltipEl();
    tt.className = `cal-scrum-tt cal-scrum-tt--${key}`;
    tt.innerHTML = `
        <span class="cal-scrum-tt-hdr">
            <span class="cal-scrum-tt-icon">${meta.icon}</span>
            <span class="cal-scrum-tt-title">${esc(meta.label)}</span>
        </span>
        <span class="cal-scrum-tt-row"><b>🎯 Pourquoi —</b> ${esc(details.why)}</span>
        <span class="cal-scrum-tt-row"><b>👥 Qui —</b> ${esc(details.who)}</span>
        <span class="cal-scrum-tt-row"><b>⏱ Fréquence —</b> ${esc(details.frequency)}</span>
        <span class="cal-scrum-tt-row"><b>📦 Output —</b> ${esc(details.output)}</span>
        <span class="cal-scrum-tt-row cal-scrum-tt-row--ex"><b>💡 Exemple —</b> <em>${esc(details.example)}</em></span>
    `;

    // Positionne en fixed selon le badge — préfère "au-dessus à droite", flip si débord
    const r = badge.getBoundingClientRect();
    const TT_W = 320, TT_H = 220; // approx (la vraie hauteur est calculée après display)
    const margin = 8;
    let left = r.right - TT_W;  // aligné à droite du badge
    if (left < 8) left = r.left;             // si débord à gauche, aligne à gauche du badge
    if (left + TT_W > window.innerWidth - 8) left = window.innerWidth - TT_W - 8;
    let top = r.top - margin;                // par défaut : tooltip au-dessus
    let placement = 'top';
    // Si pas assez d'espace en haut → afficher en dessous
    if (r.top < TT_H + margin + 8) {
        top = r.bottom + margin;
        placement = 'bottom';
    }
    tt.dataset.placement = placement;
    tt.style.left = `${Math.max(8, Math.round(left))}px`;
    tt.style.top  = `${Math.round(top)}px`;
    tt.style.transform = placement === 'top' ? 'translateY(-100%)' : 'translateY(0)';
    clearTimeout(_scrumTtHideT);
    requestAnimationFrame(() => tt.classList.add('visible'));
}
function _hideScrumTt() {
    if (!_scrumTtEl) return;
    clearTimeout(_scrumTtHideT);
    _scrumTtHideT = setTimeout(() => _scrumTtEl.classList.remove('visible'), 80);
}
// Délégation globale (mouseenter via mouseover) sur les badges scrum partout dans la page
document.addEventListener('mouseover', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _showScrumTt(badge);
});
document.addEventListener('mouseout', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge && !badge.contains(e.relatedTarget)) _hideScrumTt();
});
document.addEventListener('focusin', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _showScrumTt(badge);
});
document.addEventListener('focusout', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _hideScrumTt();
});

// ── Tooltip description événement (singleton body, position fixed) ──────────
let _descTtEl = null;
let _descTtHideT = null;

function _descTooltipEl() {
    if (_descTtEl) return _descTtEl;
    _descTtEl = document.createElement('div');
    _descTtEl.id = 'cal-desc-tt-global';
    _descTtEl.className = 'cal-desc-tt';
    document.body.appendChild(_descTtEl);
    _descTtEl.addEventListener('mouseenter', () => clearTimeout(_descTtHideT));
    _descTtEl.addEventListener('mouseleave', _hideDescTt);
    return _descTtEl;
}

function _cleanDescHtml(raw) {
    return raw
        .replace(/<(u|b|i|strong|em|span|a)[^>]*>\s*<\/\1>/gi, '') // balises vides
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')  // ul/ol → saut de ligne
        .replace(/<\/li>/gi, '')                  // fermeture li : rien
        .replace(/<li[^>]*>/gi, '\n• ')           // ouverture li : saut + puce
        // Conserve <b> et <strong> → <b>, retire tout le reste
        .replace(/<(b|strong)(\s[^>]*)?>/gi, '<b>')
        .replace(/<\/(b|strong)>/gi, '</b>')
        .replace(/<(?!\/?(b)[ >])[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\n[ \t]+\n/g, '\n\n')          // lignes vides avec espaces
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function _showDescTt(btn) {
    const raw = btn.dataset.desc;
    if (!raw) return;
    const html = _cleanDescHtml(raw);
    if (!html) return;
    const tt = _descTooltipEl();
    tt.innerHTML = html;
    tt.classList.add('visible');

    const r = btn.getBoundingClientRect();
    const W = 280;
    let left = Math.min(r.left, window.innerWidth - W - 8);
    left = Math.max(8, left);
    const below = r.bottom + 8 + 120 < window.innerHeight;
    tt.style.left = `${left}px`;
    tt.style.top  = below ? `${r.bottom + 6}px` : `${r.top - 6}px`;
    tt.style.transform = below ? 'translateY(0)' : 'translateY(-100%)';
    clearTimeout(_descTtHideT);
}

function _hideDescTt() {
    clearTimeout(_descTtHideT);
    _descTtHideT = setTimeout(() => _descTtEl?.classList.remove('visible'), 120);
}

// Délégation globale sur les boutons description
document.addEventListener('mouseover', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn) _showDescTt(btn);
});
document.addEventListener('mouseout', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn && !btn.contains(e.relatedTarget)) _hideDescTt();
});
// Clic sur le bouton : empêche la propagation (évite d'ouvrir la modal)
document.addEventListener('click', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn) { e.stopPropagation(); _showDescTt(btn); return; }
    // clic ailleurs → ferme
    if (_descTtEl?.classList.contains('visible') && !_descTtEl.contains(e.target)) {
        _descTtEl.classList.remove('visible');
    }
});
