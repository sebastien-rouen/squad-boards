/**
 * Archive .zip minimale côté navigateur, SANS compression (méthode « stored ») : assez pour réunir des
 * fichiers déjà compressés (PNG) en un seul téléchargement, au lieu d'une rafale de téléchargements
 * (et des autorisations « plusieurs fichiers » du navigateur). Aucune dépendance.
 * Noms en UTF-8 (drapeau 0x0800), lus correctement par l'explorateur Windows, macOS et unzip.
 */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Date et heure au format MS-DOS (heure locale, secondes paires). */
function dosStamp(d = new Date()) {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/**
 * @param {Array<{name:string, blob:Blob}>} files
 * @returns {Promise<Blob>} archive application/zip
 */
export async function zipStore(files) {
    const enc = new TextEncoder(), { time, date } = dosStamp();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
        const name = enc.encode(f.name), data = new Uint8Array(await f.blob.arrayBuffer()), crc = crc32(data);
        const local = new DataView(new ArrayBuffer(30));
        [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4],
            [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
            .forEach(([o, v, n]) => (n === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
        const cd = new DataView(new ArrayBuffer(46));
        [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4],
            [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2],
            [38, 0, 4], [42, offset, 4]]
            .forEach(([o, v, n]) => (n === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true)));
        parts.push(local, name, data);
        central.push(cd, name);
        offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]
        .forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
