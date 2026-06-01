module.exports = {
    apps: [
        {
            name: 'squad-boards-drafts',
            script: 'main.py',
            interpreter: 'python3',
            cwd: '/sites/drafts/squad-boards',
            instances: 1,
            exec_mode: 'fork',
            env: {
                PORT: 3010
            },

            // Logs
            out_file: 'logs/squad-boards-drafts-out.log',
            error_file: 'logs/squad-boards-drafts-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            // uvicorn gère le hot-reload (reload=True dans main.py) — pas de watch PM2
            watch: false,

            restart_delay: 2000,
            max_restarts: 10,
            min_uptime: '5s',
            max_memory_restart: '300M'
        }
    ]
};
