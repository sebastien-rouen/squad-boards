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
    "durationS": 81.2,
    "recordedAt": "2026-10-24T06:58:42.738Z",
    "chapters": [
      {
        "t": 6.48,
        "text": "Pas de JIRA ? Pas grave. Le kanban est complet."
      },
      {
        "t": 10.76,
        "text": "Créer un ticket en une phrase"
      },
      {
        "t": 12.92,
        "text": "Nouveau ticket (touche N)"
      },
      {
        "t": 28.47,
        "text": "Chaque ticket a sa fiche : tout se modifie en place"
      },
      {
        "t": 35.17,
        "text": "Planning Poker intégré : voter, révéler, converger"
      },
      {
        "t": 39.28,
        "text": "Estimer en équipe"
      },
      {
        "t": 64.21,
        "text": "Affinage : préparer le prochain sprint, ticket par ticket"
      },
      {
        "t": 68.25,
        "text": "Rétrospectives et amélioration continue"
      },
      {
        "t": 72.42,
        "text": "Et si JIRA est là ? On synchronise. Sinon, on vit très bien sans."
      }
    ],
    "files": {
      "mp4": 4590628,
      "webp": 0,
      "poster": 20742
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
        "style": "kinetic",
        "wait": 4200
      },
      {
        "caption": "Créer un ticket en une phrase",
        "wait": 300
      },
      {
        "highlight": "#btn-create",
        "tip": "Nouveau ticket (touche N)",
        "wait": 2000
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
        "wait": 2200
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
        "wait": 3600
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
        "wait": 2000
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
        "wait": 2200
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
        "style": "kinetic",
        "wait": 5600
      },
      {
        "caption": ""
      }
    ],
    "scenario": "alternative-jira.json",
    "voice": true,
    "voiceLines": 9,
    "music": "lumineux",
    "fps": 30,
    "capture": "screencast",
    "transition": "slide-left",
    "cinema": {},
    "anim": true,
    "audio": {
      "cues": [
        {
          "atS": 6.476,
          "text": "Pas de JIRA ? Pas grave. Le kanban est complet."
        },
        {
          "atS": 10.755,
          "text": "Créer un ticket en une phrase"
        },
        {
          "atS": 12.917,
          "text": "Nouveau ticket (touche N)"
        },
        {
          "atS": 28.47,
          "text": "Chaque ticket a sa fiche : tout se modifie en place"
        },
        {
          "atS": 35.174,
          "text": "Planning Poker intégré : voter, révéler, converger"
        },
        {
          "atS": 39.276,
          "text": "Estimer en équipe"
        },
        {
          "atS": 64.206,
          "text": "Affinage : préparer le prochain sprint, ticket par ticket"
        },
        {
          "atS": 68.248,
          "text": "Rétrospectives et amélioration continue"
        },
        {
          "atS": 72.421,
          "text": "Et si JIRA est là ? On synchronise. Sinon, on vit très bien sans."
        }
      ],
      "voice": {
        "rate": 1.05
      }
    }
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
    "durationS": 50.9,
    "recordedAt": "2026-10-24T06:56:22.530Z",
    "chapters": [
      {
        "t": 2.98,
        "text": "Un ticket local et son jumeau JIRA ont divergé"
      },
      {
        "t": 8.39,
        "text": "Ouvrir la fiche"
      },
      {
        "t": 11.28,
        "text": "Le bouton ↻ compare la fiche avec JIRA"
      },
      {
        "t": 14.97,
        "text": "Comparer avec JIRA"
      },
      {
        "t": 30.33,
        "text": "Prendre JIRA, ou pousser nos modifications : au choix"
      },
      {
        "t": 34.14,
        "text": "Pousser vers JIRA les champs cochés"
      },
      {
        "t": 42.73,
        "text": "Le ticket est aligné, sans quitter la fiche"
      }
    ],
    "files": {
      "mp4": 2593517,
      "webp": 0,
      "poster": 45468
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
        "click": ".ticket-card[data-ticket-id=\"LYR-103\"]",
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
        "wait": 2200
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
        "wait": 6000
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
        "wait": 2200
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
        "wait": 1200
      },
      {
        "caption": "Le ticket est aligné, sans quitter la fiche",
        "style": "kinetic",
        "wait": 4200
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
    "music": null,
    "fps": 30,
    "capture": "screencast",
    "transition": "zoom",
    "cinema": {},
    "anim": false,
    "audio": {
      "cues": [
        {
          "atS": 2.982,
          "text": "Un ticket local et son jumeau JIRA ont divergé"
        },
        {
          "atS": 8.387,
          "text": "Ouvrir la fiche"
        },
        {
          "atS": 11.276,
          "text": "Le bouton de synchronisation compare la fiche avec Jira."
        },
        {
          "atS": 14.973,
          "text": "Comparer avec JIRA"
        },
        {
          "atS": 30.328,
          "text": "Prendre JIRA, ou pousser nos modifications : au choix"
        },
        {
          "atS": 34.137,
          "text": "Pousser vers JIRA les champs cochés"
        },
        {
          "atS": 42.728,
          "text": "Le ticket est aligné, sans quitter la fiche"
        }
      ],
      "voice": {
        "rate": 1.05
      }
    }
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
    "durationS": 77.6,
    "recordedAt": "2026-10-24T06:54:53.777Z",
    "chapters": [
      {
        "t": 8.5,
        "text": "Le tableau de bord des équipes agiles · Squad Board"
      },
      {
        "t": 15.49,
        "text": "Scrum Masters, PO, RTE : la journée commence ici"
      },
      {
        "t": 26.58,
        "text": "Le Board : le flux du sprint, colonne par colonne"
      },
      {
        "t": 28.44,
        "text": "01 · Le Board"
      },
      {
        "t": 33.21,
        "text": "Scrum ou Kanban : les colonnes suivent le flux de l'équipe"
      },
      {
        "t": 36.66,
        "text": "PI Planning : objectifs et features de chaque équipe du train"
      },
      {
        "t": 37.83,
        "text": "02 · Planifier"
      },
      {
        "t": 46.15,
        "text": "Roadmap : glisser une feature, c'est la reprioriser"
      },
      {
        "t": 53.77,
        "text": "Santé : météo d'équipe, capacité, absences"
      },
      {
        "t": 55,
        "text": "03 · Piloter"
      },
      {
        "t": 62.5,
        "text": "Rapports : sprint, PI, flux, support… en un clic"
      },
      {
        "t": 67.34,
        "text": "Un seul outil. Léger, auto-hébergé, en français."
      }
    ],
    "files": {
      "mp4": 5895509,
      "webp": 0,
      "poster": 17956
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
        "wait": 900
      },
      {
        "count": {
          "sel": ".meteo-val",
          "ms": 1300
        },
        "wait": 3200
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
        "wait": 2200
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
        "style": "kinetic",
        "wait": 5200
      },
      {
        "caption": ""
      }
    ],
    "scenario": "decouverte.json",
    "voice": true,
    "voiceLines": 8,
    "music": "cinema",
    "fps": 30,
    "capture": "screencast",
    "transition": "slide-left",
    "cinema": {
      "letterbox": 2.39,
      "vignette": 0.3,
      "tint": "warm"
    },
    "anim": false,
    "audio": {
      "cues": [
        {
          "atS": 8.503,
          "text": "Squad Board : tickets, sprints, P I, santé d'équipe et rapports, au même endroit."
        },
        {
          "atS": 15.492,
          "text": "Scrum Masters, P O, R T E : la journée commence ici."
        },
        {
          "atS": 28.444,
          "text": "Le Board : le flux du sprint, colonne par colonne."
        },
        {
          "atS": 37.826,
          "text": "Planifier : P I Planning et Roadmap, du trimestre à la feature."
        },
        {
          "atS": 46.145,
          "text": "La Roadmap : glisser une feature, c'est la reprioriser."
        },
        {
          "atS": 54.999,
          "text": "Piloter : santé, capacité, et des rapports prêts à partager."
        },
        {
          "atS": 62.504,
          "text": "Les rapports : sprint, P I, flux, support, en un clic."
        },
        {
          "atS": 67.337,
          "text": "Un seul outil. Léger, auto-hébergé, en français."
        }
      ],
      "voice": {
        "rate": 1.05
      }
    }
  }
];
