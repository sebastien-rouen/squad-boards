// Généré par tools/demo-video/record.mjs — ne pas éditer
window.DEMOS = [
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
    "durationS": 62.4,
    "recordedAt": "2026-10-23T22:36:08.023Z",
    "chapters": [
      {
        "t": 2.97,
        "text": "Le tableau de bord des équipes agiles · Squad Board"
      },
      {
        "t": 9.61,
        "text": "Scrum Masters, PO, RTE : la journée commence ici"
      },
      {
        "t": 17.83,
        "text": "Le Board : le flux du sprint, colonne par colonne"
      },
      {
        "t": 19.71,
        "text": "01 · Le Board"
      },
      {
        "t": 24.16,
        "text": "Une carte glisse vers « En cours »"
      },
      {
        "t": 28.96,
        "text": "PI Planning : objectifs et features de chaque équipe du train"
      },
      {
        "t": 30.3,
        "text": "02 · Planifier"
      },
      {
        "t": 38.23,
        "text": "Roadmap : la trajectoire des features sur plusieurs PI"
      },
      {
        "t": 42.03,
        "text": "Santé : météo d'équipe, capacité, absences"
      },
      {
        "t": 43.2,
        "text": "03 · Piloter"
      },
      {
        "t": 50.31,
        "text": "Rapports : sprint, PI, flux, support… en un clic"
      },
      {
        "t": 55.2,
        "text": "Un seul outil. Léger, auto-hébergé, en français."
      }
    ],
    "files": {
      "mp4": 2828331,
      "webp": 0,
      "poster": 8978
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
        "sub": "Glisser une carte, c'est changer son statut",
        "say": "Le Board : glisser une carte, c'est changer son statut."
      },
      {
        "caption": "Une carte glisse vers « En cours »",
        "style": "pill",
        "voice": false,
        "wait": 300
      },
      {
        "drag": {
          "from": ".board-column:has(.col-todo) .ticket-card",
          "to": ".board-column:has(.col-inprog) .column-cards"
        },
        "wait": 1000
      },
      {
        "stamp": "→ En cours",
        "tone": "info",
        "at": ".board-column:has(.col-inprog) .column-header",
        "wait": 1500
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
        "caption": "Roadmap : la trajectoire des features sur plusieurs PI",
        "style": "pill",
        "say": "La Roadmap : la trajectoire des features sur plusieurs P I.",
        "wait": 300
      },
      {
        "goto": "#roadmap",
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
    "name": "alternative-jira",
    "title": "Une alternative open source à JIRA ?",
    "description": "Ce que Squad Board fait sans JIRA : tickets, kanban, estimation en poker, affinage, rétrospectives et PI planning. JIRA devient optionnel : on synchronise si on en a un, on vit sans sinon.",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3010/",
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "durationS": 39.2,
    "recordedAt": "2026-10-22T22:20:50.881Z",
    "chapters": [
      {
        "t": 2.9959999999999996,
        "text": "Un kanban complet : créer, déplacer, prioriser, sans JIRA"
      },
      {
        "t": 5.873999999999999,
        "text": "Nouveau ticket en une touche (N)"
      },
      {
        "t": 8.704,
        "text": "Chaque ticket a sa fiche : statut, priorité, estimation, porteur"
      },
      {
        "t": 14.22,
        "text": "tout se modifie en place"
      },
      {
        "t": 17.029999999999998,
        "text": "Planning Poker intégré pour estimer en équipe"
      },
      {
        "t": 18.514,
        "text": "Voter, révéler, converger"
      },
      {
        "t": 23.159,
        "text": "Affinage : préparer le prochain sprint, ticket par ticket"
      },
      {
        "t": 27.323,
        "text": "Rétrospectives et amélioration continue"
      },
      {
        "t": 31.727,
        "text": "Et si JIRA est là : on synchronise. Sinon, on vit très bien sans"
      }
    ],
    "files": {
      "mp4": 716075,
      "webp": 9544950,
      "poster": 51468
    },
    "blur": [
      ".mdl-description",
      ".mdl-people"
    ],
    "steps": [
      {
        "goto": "#kanban"
      },
      {
        "caption": "Un kanban complet : créer, déplacer, prioriser, sans JIRA"
      },
      {
        "highlight": "#btn-create",
        "tip": "Nouveau ticket en une touche (N)",
        "wait": 2400
      },
      {
        "highlight": ""
      },
      {
        "caption": "Chaque ticket a sa fiche : statut, priorité, estimation, porteur"
      },
      {
        "click": ".ticket-card",
        "wait": 1400
      },
      {
        "draw": {
          "sel": ".mdl-props",
          "shape": "box",
          "label": "tout se modifie en place",
          "color": "#2563eb"
        },
        "wait": 2400
      },
      {
        "draw": ""
      },
      {
        "caption": "Planning Poker intégré pour estimer en équipe",
        "wait": 300
      },
      {
        "zoom": "#mdl-poker-btn",
        "scale": 1.6,
        "wait": 800
      },
      {
        "highlight": "#mdl-poker-btn",
        "tip": "Voter, révéler, converger",
        "wait": 2600
      },
      {
        "highlight": ""
      },
      {
        "zoom": "",
        "wait": 800
      },
      {
        "press": "Escape",
        "wait": 800
      },
      {
        "caption": "Affinage : préparer le prochain sprint, ticket par ticket",
        "wait": 300
      },
      {
        "goto": "#refinement",
        "wait": 2600
      },
      {
        "caption": "Rétrospectives et amélioration continue",
        "wait": 300
      },
      {
        "goto": "#retro",
        "wait": 2600
      },
      {
        "caption": "Et si JIRA est là : on synchronise. Sinon, on vit très bien sans"
      },
      {
        "caption": ""
      }
    ],
    "scenario": "alternative-jira.json"
  },
  {
    "name": "jira-sync",
    "title": "Synchroniser un ticket avec JIRA depuis sa popin",
    "description": "Le bouton ↻ compare le ticket local avec JIRA : on met à jour en local ou on pousse les modifications, sans quitter la fiche.",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3010/",
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "durationS": 34.7,
    "recordedAt": "2026-10-22T22:18:04.714Z",
    "chapters": [
      {
        "t": 3.03,
        "text": "Le tableau de l'équipe, synchronisé avec JIRA"
      },
      {
        "t": 5.384,
        "text": "un ticket"
      },
      {
        "t": 7.41,
        "text": "Ouvrir un ticket"
      },
      {
        "t": 11.876999999999999,
        "text": "Un bouton discret compare le ticket avec JIRA"
      },
      {
        "t": 13.354,
        "text": "Comparer avec JIRA : mettre à jour ou pousser"
      },
      {
        "t": 17.91,
        "text": "statut, priorité, points… poussés vers JIRA"
      },
      {
        "t": 20.522,
        "text": "Mettre à jour en local, ou pousser vers JIRA : au choix"
      },
      {
        "t": 25.459,
        "text": "Vue PI : toutes les équipes du train"
      }
    ],
    "files": {
      "mp4": 585812,
      "webp": 7071574,
      "poster": 49824
    },
    "blur": [
      ".ticket-title",
      "#mdl-title-span",
      ".mdl-crumb-title",
      ".mdl-description",
      ".ticket-assignee",
      ".person-picker-name",
      ".mdl-people",
      ".pi-obj-ro-text",
      ".pi-obj-text"
    ],
    "steps": [
      {
        "goto": "#kanban"
      },
      {
        "caption": "Le tableau de l'équipe, synchronisé avec JIRA"
      },
      {
        "draw": {
          "sel": ".ticket-card",
          "shape": "circle",
          "label": "un ticket",
          "color": "#f59e0b"
        },
        "wait": 1600
      },
      {
        "draw": ""
      },
      {
        "caption": "Ouvrir un ticket"
      },
      {
        "click": ".ticket-card",
        "wait": 1400
      },
      {
        "caption": "Un bouton discret compare le ticket avec JIRA",
        "wait": 300
      },
      {
        "zoom": "#mdl-jira-sync",
        "scale": 1.7,
        "wait": 900
      },
      {
        "highlight": "#mdl-jira-sync",
        "tip": "Comparer avec JIRA : mettre à jour ou pousser",
        "wait": 3000
      },
      {
        "highlight": ""
      },
      {
        "zoom": "",
        "wait": 900
      },
      {
        "draw": {
          "sel": ".mdl-props",
          "shape": "underline",
          "label": "statut, priorité, points… poussés vers JIRA",
          "color": "#16a34a"
        },
        "wait": 2600
      },
      {
        "caption": "Mettre à jour en local, ou pousser vers JIRA : au choix"
      },
      {
        "caption": ""
      },
      {
        "draw": ""
      },
      {
        "press": "Escape",
        "wait": 900
      },
      {
        "caption": "Vue PI : toutes les équipes du train",
        "wait": 300
      },
      {
        "goto": "#pi",
        "wait": 2600
      },
      {
        "caption": ""
      }
    ],
    "scenario": "jira-sync.json"
  }
];
