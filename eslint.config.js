import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config ESLint — frontend vanilla ES modules (pas de build).
 * Objectif : filet de sécurité correctness, pas un carcan stylistique
 * (le style est délégué à Prettier).
 */
export default [
    // Fichiers ignorés (libs tierces minifiées, pages de debug standalone)
    {
        ignores: ['static/js/vendor/**', 'static/tests/**'],
    },

    js.configs.recommended,

    {
        files: ['static/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Librairie chargée globalement via <script> (vendor/chart.umd.min.js)
                Chart: 'readonly',
            },
        },
        rules: {
            // Correctness — on garde en erreur
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            // Espaces fines insécables (U+202F) / insécables (U+00A0) légitimes dans
            // les libellés FR — on ne les autorise que dans strings/templates/commentaires.
            'no-irregular-whitespace': [
                'error',
                { skipStrings: true, skipTemplates: true, skipComments: true },
            ],

            // Hygiène — en warning pour adoption progressive sans bloquer
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            // Échappements défensifs dans les regex (\-, \!) : sans effet mais inoffensifs.
            'no-useless-escape': 'warn',
            'no-console': 'off',
        },
    },
];
