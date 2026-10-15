/**
 * Retour sonore du Planning Poker — OPTIONNEL, coupé par défaut (localStorage `sb-poker-sound`).
 *
 * Synthétisé en Web Audio (aucun fichier à charger) : « flip » = bruit blanc très court filtré
 * (carte qu'on retourne), « chime » = petit arpège pour le consensus. Pensé pour le Poker en visio,
 * écran partagé : chaque participant entend la révélation au moment où SON écran la découvre.
 *
 * Le navigateur n'autorise le son qu'après un geste de l'utilisateur : le contexte audio est créé /
 * réveillé au clic sur le bouton 🔊 (ou sur une carte), puis réutilisé.
 */
const _LS = 'sb-poker-sound';
let _ctx = null;

export const pokerSoundOn = () => {
    try { return localStorage.getItem(_LS) === 'on'; } catch { return false; }
};

function _audio() {
    if (!_ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        _ctx = new AC();
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
}

export function setPokerSound(on) {
    try { localStorage.setItem(_LS, on ? 'on' : 'off'); } catch { /* navigation privée */ }
    if (on) _audio();
}

/** Carte qu'on retourne : ~70 ms de bruit filtré, attaque nette. */
function _flip(c, at) {
    const len = Math.floor(c.sampleRate * 0.07);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.35, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(at); src.stop(at + 0.08);
}

/** Consensus : arpège do – mi – sol (sinus doux). */
function _chime(c, at) {
    [1046.5, 1318.5, 1568].forEach((f, i) => {
        const t = at + i * 0.09;
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + 0.5);
    });
}

/**
 * @param {'flip'|'reveal'} kind
 * @param {object} [opts]  reveal : `count` avatars retournés (un flip chacun, `stepMs` d'écart) puis chime
 */
export function playPokerSound(kind, { count = 1, stepMs = 140 } = {}) {
    if (!pokerSoundOn()) return;
    const c = _audio();
    if (!c) return;
    const t0 = c.currentTime + 0.02;
    if (kind === 'flip') { _flip(c, t0); return; }
    if (kind === 'reveal') {
        for (let i = 0; i < count; i++) _flip(c, t0 + (i * stepMs) / 1000);
        _chime(c, t0 + (count * stepMs) / 1000 + 0.25);
    }
}
