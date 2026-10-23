// Généré par tools/demo-video/record.mjs — ne pas éditer
window.DEMOS = [
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
    "name": "decouverte",
    "title": "Squad Board, c'est quoi ?",
    "description": "Un tableau de bord pour les équipes agiles : tickets, sprints, PI planning, roadmap, santé d'équipe et rapports, au même endroit. Pour les Scrum Masters, PO, RTE et les équipes.",
    "audience": "public",
    "site": "squad-boards",
    "url": "http://127.0.0.1:3010/",
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "durationS": 48.3,
    "recordedAt": "2026-10-22T22:19:33.913Z",
    "chapters": [
      {
        "t": 2.9960000000000004,
        "text": "Pour qui ? Scrum Masters, Product Owners, RTE… et l'équipe entière"
      },
      {
        "t": 6.324000000000001,
        "text": "Le Dashboard : le cap de l'équipe et ses indicateurs clés"
      },
      {
        "t": 9.745000000000001,
        "text": "WIP, bloqués, débit, cycle time"
      },
      {
        "t": 12.748999999999999,
        "text": "Le Board : le flux du sprint, colonne par colonne"
      },
      {
        "t": 17.733,
        "text": "Les tickets viennent de JIRA, ou se créent ici"
      },
      {
        "t": 20.435,
        "text": "PI Planning : objectifs et features de chaque équipe du train"
      },
      {
        "t": 26.601,
        "text": "Roadmap : la trajectoire des features sur plusieurs PI"
      },
      {
        "t": 30.945999999999998,
        "text": "Santé : météo d'équipe, capacité, absences"
      },
      {
        "t": 35.185,
        "text": "Rapports : sprint, PI, flux, support… prêts à partager"
      },
      {
        "t": 42.961999999999996,
        "text": "Un seul outil, léger, auto-hébergé, en français"
      }
    ],
    "files": {
      "mp4": 740481,
      "webp": 10451524,
      "poster": 59234
    },
    "blur": [
      ".ticket-title",
      "#mdl-title-span",
      ".mdl-crumb-title",
      ".ticket-assignee .truncate",
      ".person-picker-name",
      ".pi-obj-ro-text",
      ".pi-obj-text",
      ".mdl-people",
      ".db-oncall-chips",
      ".rm-tl-card-title",
      ".npi-feat-title",
      ".npi-child-title",
      ".rtc-title",
      ".rtc-who",
      ".feature-title"
    ],
    "steps": [
      {
        "goto": "#dashboard",
        "wait": 1200
      },
      {
        "caption": "Pour qui ? Scrum Masters, Product Owners, RTE… et l'équipe entière"
      },
      {
        "caption": "Le Dashboard : le cap de l'équipe et ses indicateurs clés"
      },
      {
        "draw": {
          "sel": ".dashboard-metrics",
          "shape": "box",
          "label": "WIP, bloqués, débit, cycle time",
          "color": "#2563eb"
        },
        "wait": 2600
      },
      {
        "draw": ""
      },
      {
        "caption": "Le Board : le flux du sprint, colonne par colonne",
        "wait": 300
      },
      {
        "goto": "#kanban",
        "ready": ".ticket-card",
        "wait": 2400
      },
      {
        "caption": "Les tickets viennent de JIRA, ou se créent ici"
      },
      {
        "caption": "PI Planning : objectifs et features de chaque équipe du train",
        "wait": 300
      },
      {
        "goto": "#pi",
        "wait": 2600
      },
      {
        "caption": "Roadmap : la trajectoire des features sur plusieurs PI",
        "wait": 300
      },
      {
        "goto": "#roadmap",
        "wait": 2600
      },
      {
        "caption": "Santé : météo d'équipe, capacité, absences",
        "wait": 300
      },
      {
        "goto": "#health",
        "wait": 2600
      },
      {
        "caption": "Rapports : sprint, PI, flux, support… prêts à partager",
        "wait": 300
      },
      {
        "goto": "#reports",
        "wait": 2600
      },
      {
        "caption": "Un seul outil, léger, auto-hébergé, en français"
      },
      {
        "caption": ""
      }
    ],
    "scenario": "decouverte.json"
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
