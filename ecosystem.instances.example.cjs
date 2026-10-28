/**
 * Gabarit PM2 : UN PROJET = UNE INSTANCE (même code, base et port propres) — cf. docs/multi-instance.md.
 * Copier, renommer `projet-b`, choisir un port libre, puis : pm2 start ecosystem.instances.example.cjs
 */
module.exports = {
    apps: [
        {
            name: 'squad-boards-projet-b',
            script: 'main.py',
            interpreter: 'python3',
            cwd: '/sites/drafts/squad-boards',
            instances: 1,
            exec_mode: 'fork',
            env: {
                PORT: 3012,
                SB_DB_PATH: 'data/projet-b.db',          // créée au premier lancement (tables + catalogue Atlas)
                SB_UPLOADS_DIR: 'data/uploads-projet-b', // pièces jointes séparées
            },
            out_file: 'logs/squad-boards-projet-b-out.log',
            error_file: 'logs/squad-boards-projet-b-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            watch: false,
            restart_delay: 2000,
            max_restarts: 10,
            min_uptime: '5s',
            max_memory_restart: '300M',
        },
    ],
};
