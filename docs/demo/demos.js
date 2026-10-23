// Généré par tools/demo-video/record.mjs — ne pas éditer
window.DEMOS = [
  {
    "name": "alternative-jira",
    "title": "Une alternative open source à JIRA ?",
    "description": "Ce que Squad Board fait sans JIRA, en vrai : créer un ticket, le compléter en place, l'estimer au Planning Poker, affiner le prochain sprint, tenir ses rétrospectives. JIRA devient optionnel. Instance de démo, données fictives.",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3011/",
    "publicUrl": "https://squad-boards.bastou.dev",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "durationS": 73.8,
    "recordedAt": "2026-10-23T22:51:55.253Z",
    "chapters": [
      {
        "t": 2.98,
        "text": "Pas de JIRA ? Pas grave. Le kanban est complet."
      },
      {
        "t": 7,
        "text": "Créer un ticket en une phrase"
      },
      {
        "t": 9.45,
        "text": "Nouveau ticket (touche N)"
      },
      {
        "t": 24.64,
        "text": "Chaque ticket a sa fiche : tout se modifie en place"
      },
      {
        "t": 30.15,
        "text": "Planning Poker intégré : voter, révéler, converger"
      },
      {
        "t": 34.23,
        "text": "Estimer en équipe"
      },
      {
        "t": 57.27,
        "text": "Affinage : préparer le prochain sprint, ticket par ticket"
      },
      {
        "t": 61.31,
        "text": "Rétrospectives et amélioration continue"
      },
      {
        "t": 65.52,
        "text": "Et si JIRA est là ? On synchronise. Sinon, on vit très bien sans."
      }
    ],
    "files": {
      "mp4": 3591715,
      "webp": 0,
      "poster": 46318
    },
    "blur": [],
    "fake": 0,
    "steps": [
      {
        "goto": "#kanban/Vega",
        "wait": 300
      },
      {
        "caption": "Pas de JIRA ? Pas grave. Le kanban est complet.",
        "style": "kinetic"
      },
      {
        "caption": "Créer un ticket en une phrase",
        "wait": 300
      },
      {
        "highlight": "#btn-create",
        "tip": "Nouveau ticket (touche N)",
        "wait": 1300
      },
      {
        "highlight": ""
      },
      {
        "click": "#btn-create",
        "wait": 900
      },
      {
        "type": {
          "sel": "#create-form input[name=\"title\"]",
          "text": "Alerte quand le stock passe sous 10",
          "delay": 40
        },
        "wait": 500
      },
      {
        "click": "#create-form button[type=\"submit\"]",
        "wait": 1400
      },
      {
        "stamp": "✓ Créé",
        "tone": "success",
        "pos": "top-right",
        "wait": 1500
      },
      {
        "caption": "Chaque ticket a sa fiche : tout se modifie en place",
        "wait": 300
      },
      {
        "click": ".board-column:has(.col-todo) .ticket-card",
        "wait": 1300
      },
      {
        "spotlight": ".mdl-props",
        "label": "statut, priorité, estimation, sprint, flux",
        "wait": 2200
      },
      {
        "spotlight": ""
      },
      {
        "caption": "Planning Poker intégré : voter, révéler, converger",
        "wait": 300
      },
      {
        "zoom": "#mdl-poker-btn",
        "scale": 1.5,
        "wait": 700
      },
      {
        "highlight": "#mdl-poker-btn",
        "tip": "Estimer en équipe",
        "wait": 1100
      },
      {
        "highlight": ""
      },
      {
        "zoom": "",
        "wait": 600
      },
      {
        "click": "#mdl-poker-btn",
        "wait": 1500
      },
      {
        "click": ".poker-card[data-val=\"5\"]",
        "wait": 1000
      },
      {
        "click": "#poker-reveal",
        "wait": 1700
      },
      {
        "stamp": "5 points",
        "tone": "info",
        "pos": "top-right",
        "wait": 1000
      },
      {
        "press": "Escape",
        "wait": 600
      },
      {
        "press": "Escape",
        "wait": 700
      },
      {
        "caption": "Affinage : préparer le prochain sprint, ticket par ticket",
        "wait": 300
      },
      {
        "goto": "#refinement/Vega",
        "wait": 600
      },
      {
        "pan": {
          "drift": "in",
          "scale": 1.06,
          "ms": 2200
        }
      },
      {
        "caption": "Rétrospectives et amélioration continue",
        "wait": 300
      },
      {
        "goto": "#retro",
        "wait": 600
      },
      {
        "pan": {
          "drift": "in",
          "scale": 1.06,
          "ms": 2200
        }
      },
      {
        "caption": "Et si JIRA est là ? On synchronise. Sinon, on vit très bien sans.",
        "style": "kinetic"
      },
      {
        "caption": ""
      }
    ],
    "scenario": "alternative-jira.json",
    "voice": true,
    "voiceLines": 9,
    "fps": 30,
    "capture": "screencast",
    "transition": "slide-left",
    "cinema": {},
    "anim": true
  },
  {
    "name": "decouverte",
    "title": "Squad Board, c'est quoi ?",
    "description": "Le tableau de bord des équipes agiles : tickets, sprints, PI planning, roadmap, santé d'équipe et rapports au même endroit. Pour les Scrum Masters, PO, RTE et les équipes. Filmé sur l'instance de démo (données fictives), voix off locale.",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3011/",
    "publicUrl": "https://squad-boards.bastou.dev",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "durationS": 63.6,
    "recordedAt": "2026-10-23T22:45:35.133Z",
    "chapters": [
      {
        "t": 2.98,
        "text": "Le tableau de bord des équipes agiles · Squad Board"
      },
      {
        "t": 9.56,
        "text": "Scrum Masters, PO, RTE : la journée commence ici"
      },
      {
        "t": 17.81,
        "text": "Le Board : le flux du sprint, colonne par colonne"
      },
      {
        "t": 19.66,
        "text": "01 · Le Board"
      },
      {
        "t": 24.03,
        "text": "Scrum ou Kanban : les colonnes suivent le flux de l'équipe"
      },
      {
        "t": 27.26,
        "text": "PI Planning : objectifs et features de chaque équipe du train"
      },
      {
        "t": 28.5,
        "text": "02 · Planifier"
      },
      {
        "t": 36.43,
        "text": "Roadmap : glisser une feature, c'est la reprioriser"
      },
      {
        "t": 43.06,
        "text": "Santé : météo d'équipe, capacité, absences"
      },
      {
        "t": 44.31,
        "text": "03 · Piloter"
      },
      {
        "t": 51.43,
        "text": "Rapports : sprint, PI, flux, support… en un clic"
      },
      {
        "t": 56.35,
        "text": "Un seul outil. Léger, auto-hébergé, en français."
      }
    ],
    "files": {
      "mp4": 2989334,
      "webp": 0,
      "poster": 11938
    },
    "blur": [],
    "fake": 0,
    "steps": [
      {
        "goto": "#dashboard",
        "wait": 300
      },
      {
        "title": "Squad Board",
        "kicker": "Le tableau de bord des équipes agiles",
        "sub": "Tickets, sprints, PI, santé d'équipe et rapports : un seul endroit",
        "say": "Squad Board : tickets, sprints, P I, santé d'équipe et rapports, au même endroit."
      },
      {
        "caption": "Scrum Masters, PO, RTE : la journée commence ici",
        "style": "kinetic",
        "say": "Scrum Masters, P O, R T E : la journée commence ici."
      },
      {
        "spotlight": ".meteo-wrap",
        "label": "la météo de chaque équipe, d'un coup d'œil",
        "wait": 500
      },
      {
        "count": {
          "sel": ".meteo-val",
          "ms": 1300
        },
        "wait": 2000
      },
      {
        "spotlight": ""
      },
      {
        "letterbox": false
      },
      {
        "caption": "Le Board : le flux du sprint, colonne par colonne",
        "style": "pill",
        "voice": false,
        "wait": 400
      },
      {
        "goto": "#kanban",
        "ready": ".ticket-card",
        "wait": 700
      },
      {
        "title": "Le Board",
        "kicker": "01",
        "sub": "Le flux du sprint, colonne par colonne",
        "say": "Le Board : le flux du sprint, colonne par colonne."
      },
      {
        "caption": "Scrum ou Kanban : les colonnes suivent le flux de l'équipe",
        "style": "pill",
        "voice": false,
        "wait": 300
      },
      {
        "pan": {
          "to": ".board-column:has(.col-inprog)",
          "scale": 1.22,
          "ms": 2600
        }
      },
      {
        "caption": "PI Planning : objectifs et features de chaque équipe du train",
        "style": "pill",
        "voice": false,
        "wait": 300
      },
      {
        "goto": "#pi",
        "wait": 400
      },
      {
        "title": "Planifier",
        "kicker": "02",
        "sub": "PI Planning et Roadmap, du trimestre à la feature",
        "say": "Planifier : P I Planning et Roadmap, du trimestre à la feature."
      },
      {
        "pan": {
          "drift": "in",
          "scale": 1.06,
          "ms": 2200
        }
      },
      {
        "caption": "Roadmap : glisser une feature, c'est la reprioriser",
        "style": "pill",
        "say": "La Roadmap : glisser une feature, c'est la reprioriser.",
        "wait": 300
      },
      {
        "goto": "#roadmap",
        "ready": "#feature-drag-list .feature-draggable",
        "wait": 600
      },
      {
        "drag": {
          "from": "#feature-drag-list .feature-draggable",
          "to": "#feature-drag-list .feature-draggable:nth-of-type(4)"
        },
        "wait": 900
      },
      {
        "stamp": "✓ Réordonné",
        "tone": "success",
        "at": "#feature-drag-list .feature-draggable:nth-of-type(2)",
        "wait": 1500
      },
      {
        "caption": "Santé : météo d'équipe, capacité, absences",
        "style": "pill",
        "voice": false,
        "wait": 300
      },
      {
        "goto": "#health",
        "wait": 400
      },
      {
        "title": "Piloter",
        "kicker": "03",
        "sub": "Santé, capacité et rapports prêts à partager",
        "say": "Piloter : santé, capacité, et des rapports prêts à partager."
      },
      {
        "pan": {
          "drift": "in",
          "scale": 1.06,
          "ms": 2200
        }
      },
      {
        "caption": "Rapports : sprint, PI, flux, support… en un clic",
        "style": "pill",
        "say": "Les rapports : sprint, P I, flux, support, en un clic.",
        "wait": 300
      },
      {
        "goto": "#reports",
        "wait": 400
      },
      {
        "pan": {
          "drift": "in",
          "scale": 1.06,
          "ms": 2400
        }
      },
      {
        "letterbox": true
      },
      {
        "caption": "Un seul outil. Léger, auto-hébergé, en français.",
        "style": "kinetic"
      },
      {
        "caption": ""
      }
    ],
    "scenario": "decouverte.json",
    "voice": true,
    "voiceLines": 8,
    "fps": 30,
    "capture": "screencast",
    "transition": "slide-left",
    "cinema": {
      "letterbox": 2.39,
      "vignette": 0.3,
      "tint": "warm"
    },
    "anim": false
  },
  {
    "name": "jira-sync",
    "title": "Synchroniser un ticket avec JIRA depuis sa fiche",
    "description": "Le bouton ↻ compare le ticket local avec JIRA, champ par champ, puis on pousse nos modifications ou on prend la version JIRA, sans quitter la fiche. Instance de démo, réponses JIRA simulées (fixtures/).",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3011/",
    "publicUrl": "https://squad-boards.bastou.dev",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "durationS": 41.6,
    "recordedAt": "2026-10-23T22:37:38.640Z",
    "chapters": [
      {
        "t": 2.97,
        "text": "Un ticket local et son jumeau JIRA ont divergé"
      },
      {
        "t": 6.32,
        "text": "Ouvrir la fiche"
      },
      {
        "t": 9.05,
        "text": "Le bouton ↻ compare la fiche avec JIRA"
      },
      {
        "t": 12.79,
        "text": "Comparer avec JIRA"
      },
      {
        "t": 23.44,
        "text": "Prendre JIRA, ou pousser nos modifications : au choix"
      },
      {
        "t": 27.23,
        "text": "Pousser vers JIRA les champs cochés"
      },
      {
        "t": 34.59,
        "text": "Le ticket est aligné, sans quitter la fiche"
      }
    ],
    "files": {
      "mp4": 1749471,
      "webp": 0,
      "poster": 45166
    },
    "blur": [],
    "fake": 0,
    "steps": [
      {
        "goto": "#kanban",
        "wait": 300
      },
      {
        "caption": "Un ticket local et son jumeau JIRA ont divergé",
        "style": "kinetic"
      },
      {
        "caption": "Ouvrir la fiche",
        "wait": 300
      },
      {
        "click": ".board-column:has(.col-inprog) .ticket-card",
        "wait": 1300
      },
      {
        "caption": "Le bouton ↻ compare la fiche avec JIRA",
        "say": "Le bouton de synchronisation compare la fiche avec Jira.",
        "wait": 300
      },
      {
        "zoom": "#mdl-jira-sync",
        "scale": 1.6,
        "wait": 800
      },
      {
        "highlight": "#mdl-jira-sync",
        "tip": "Comparer avec JIRA",
        "wait": 1500
      },
      {
        "highlight": ""
      },
      {
        "zoom": "",
        "wait": 700
      },
      {
        "click": "#mdl-jira-sync",
        "wait": 1800
      },
      {
        "spotlight": "#mjs-panel",
        "label": "ici · dans JIRA : les écarts, champ par champ",
        "wait": 2800
      },
      {
        "spotlight": ""
      },
      {
        "caption": "Prendre JIRA, ou pousser nos modifications : au choix",
        "wait": 300
      },
      {
        "highlight": "#mjs-push",
        "tip": "Pousser vers JIRA les champs cochés",
        "wait": 1600
      },
      {
        "highlight": ""
      },
      {
        "click": "#mjs-push",
        "wait": 1800
      },
      {
        "stamp": "✓ Poussé vers JIRA",
        "tone": "success",
        "pos": "top-right",
        "wait": 400
      },
      {
        "caption": "Le ticket est aligné, sans quitter la fiche",
        "style": "kinetic"
      },
      {
        "press": "Escape",
        "wait": 700
      },
      {
        "caption": ""
      }
    ],
    "scenario": "jira-sync.json",
    "voice": true,
    "voiceLines": 7,
    "fps": 30,
    "capture": "screencast",
    "transition": "zoom",
    "cinema": {},
    "anim": false
  }
];
