/**
 * BulkManager — sélection multi-tickets + opérations en masse.
 * Séparé pour alléger backlog.js.
 */

import * as api from '../api.js';
import { store } from '../state.js';
import { toast } from '../utils.js';

export class BulkManager {
    constructor(onSelectionChange) {
        this._sel = new Set();
        this._cb  = onSelectionChange;
    }

    toggle(id, checked) {
        if (checked === undefined) checked = !this._sel.has(id);
        if (checked) this._sel.add(id); else this._sel.delete(id);
        this._notify();
    }

    selectMany(ids) {
        ids.forEach(id => this._sel.add(id));
        this._notify();
    }

    clear() {
        this._sel.clear();
        this._notify();
    }

    has(id) { return this._sel.has(id); }
    get count() { return this._sel.size; }
    get ids() { return [...this._sel]; }

    _notify() { this._cb([...this._sel]); }

    async apply(patch, onDone) {
        const ids = this.ids;
        if (!ids.length) return;

        let ok = 0;
        await Promise.all(ids.map(id =>
            api.updateTicket(id, patch).then(() => ok++).catch(() => {})
        ));

        if (ok > 0) {
            toast(`${ok} ticket${ok > 1 ? 's' : ''} mis à jour`, 'success');
            const updated = await api.getTickets().catch(() => null);
            if (updated) store.set('tickets', updated);
        }
        this.clear();
        if (onDone) onDone();
    }
}
