/**
 * Rapprochement d'une personne entre JIRA et l'import RH (Congés) — SOURCE UNIQUE.
 *
 * JIRA écrit « Prénom Nom » (« Inès Ait Lhadj »), l'export RH « NOM, Prénom » (« AIT LHADJ, Inès »).
 * Une égalité stricte n'apparie quasiment personne (1 leader sur 86 en base) : on compare donc une
 * clé insensible à la casse, aux accents et à l'ordre des mots, avec un repli pour les noms composés
 * collés d'un côté seulement (« Ines AITLHADJ »).
 */

const _tokens = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[\s,.'’-]+/).filter(Boolean);

/** Clé d'une personne : mots normalisés, triés (« AIT LHADJ, Inès » ≡ « Inès Ait Lhadj »). */
export const personKey = n => _tokens(n).sort().join(' ');

/** Formes compactes (sans séparateur) : « NOM, Prénom » donne les deux ordres. */
function _compacts(n) {
    const s = String(n || '');
    if (s.includes(',')) {
        const [last, first] = s.split(',', 2).map(x => _tokens(x).join(''));
        return [first + last, last + first];
    }
    return [_tokens(s).join('')];
}

/** Même personne ? */
export function samePerson(a, b) {
    if (!a || !b) return false;
    if (personKey(a) === personKey(b)) return true;
    const cb = _compacts(b);
    return _compacts(a).some(x => x && cb.includes(x));
}

/** Comptes techniques (« Automation for Jira »…) : ni une personne, ni un congé à chercher. */
export const isBotName = n => /automation|\bbot\b|^jira\b|system|service account/i.test(String(n || ''));

/**
 * Nom tel qu'écrit dans `names` (ex. noms des absences) correspondant à `name`, ou null.
 * `aliases` (`piInfo.personAliases`, Paramètres → Absences) passe EN PREMIER : une correspondance
 * saisie à la main l'emporte sur le rapprochement automatique ; "" = « pas dans l'import ».
 */
export function findPerson(name, names, aliases = null) {
    if (!name) return null;
    const list = [...new Set(names || [])];
    if (aliases && Object.prototype.hasOwnProperty.call(aliases, name)) {
        const rh = aliases[name];
        return rh && list.includes(rh) ? rh : null;
    }
    const k = personKey(name);
    return list.find(n => personKey(n) === k) || list.find(n => samePerson(name, n)) || null;
}
