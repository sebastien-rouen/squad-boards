# Backlog Features

Fonctionnalites prevues, classees par persona et priorite.

---

## Scrum Master

| Priorite | Feature | Description |
|----------|---------|-------------|
| ~~haute~~ | ~~Drag & drop sur le board~~ | ~~Deplacer les tickets entre colonnes par glisser-deposer~~ **DONE** |
| ~~haute~~ | ~~Scope creep detection~~ | ~~Detecter les tickets ajoutes en cours de sprint~~ **DONE** |
| ~~haute~~ | ~~Velocity trend alert~~ | ~~Alerte quand la velocity baisse de >15% sur 3 sprints~~ **DONE** |
| ~~moyenne~~ | ~~Retro board integre~~ | ~~Kanban 4 swimlanes (Retro, Post-mortem, CoP, Adapt)~~ **DONE** |
| ~~moyenne~~ | ~~Mood meter / ROTI~~ | ~~Vote de satisfaction (1-5) par equipe~~ **DONE** |
| ~~moyenne~~ | ~~Fist of Five~~ | ~~Vote de confiance PI par equipe~~ **DONE** |
| basse | Standup assistant | Vue dediee au daily avec activite du jour et tickets par membre |
| basse | Sprint comparison | Comparer 2 sprints cote a cote (velocity, cycle time, throughput) |

## Product Owner

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | Feature dependency graph | Visualiser les dependances inter-features / inter-equipes |
| haute | Backlog ranking | Trier le backlog par priorite avec drag & drop |
| haute | PI objective business value | Champ "BV" (business value) sur les objectifs, distinguer committed vs stretch |
| moyenne | Release forecast | Projection de completion des features basee sur la velocity |
| moyenne | Epic burndown | Burndown par epic (pas seulement par sprint) |
| moyenne | Stakeholder dashboard | Vue simplifiee pour les parties prenantes (features + objectifs uniquement) |
| basse | OKR tracking | Lier les objectifs PI a des OKR (Objectives & Key Results) |

## Release Train Engineer

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | ROAM board | Matrice Risks/Owned/Accepted/Mitigated avec CRUD complet |
| haute | Dependency mapping inter-equipes | Visualiser les dependances entre equipes sur un PI |
| haute | PI calendar | Vue calendrier avec sprints, events, jalons, rotations |
| moyenne | Capacity planning | Matrice equipe x sprint avec capacite (membres - absences) vs charge (points) |
| moyenne | PI readiness checklist | Liste de verification pre-PI (features prets, risques identifies, etc.) |
| moyenne | Events on charts | Afficher les faits marquants (incidents, gels) en overlay sur les charts |
| basse | Multi-PI view | Comparer les metriques sur plusieurs PIs |
| basse | Train-level velocity | Velocite aggregee sur toutes les equipes du train |

## Developpeur

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | Notification de changement | Badge "nouveau" sur les tickets modifies depuis la derniere visite |
| moyenne | Time tracking | Saisie du temps passe par ticket (optionnel) |
| moyenne | Code review links | Liens vers les PRs / MRs depuis le ticket |
| basse | Personal board | Vue "mes tickets" filtree automatiquement |
| basse | Worklog | Journal de travail quotidien par membre |

## Support

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | SLA tracking | Suivi des SLA par ticket support (temps de reponse, resolution) |
| haute | Support dashboard | Vue dediee avec tickets par priorite, rotation, metriques |
| moyenne | Escalation rules | Regles d'escalade automatique (ticket ouvert > X jours) |
| moyenne | On-call calendar | Vue calendrier de la rotation support |
| basse | Incident post-mortem | Template de post-mortem lie aux events "incident" |

## Project Manager

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | Export PDF | Export des rapports en PDF pour partage offline |
| haute | Gantt / timeline | Vue Gantt des features avec dates et dependances |
| moyenne | Budget tracking | Suivi budget par feature / par equipe |
| moyenne | Risk register | Registre des risques avec probabilite, impact, mitigation |
| basse | Custom dashboards | Widgets configurables pour composer un dashboard personnel |

## Transverse (tous les roles)

| Priorite | Feature | Description |
|----------|---------|-------------|
| haute | Webhook / notifications | Notifications push sur changements de statut (email, Slack) |
| haute | Multi-user / auth | Authentification utilisateur, roles, permissions |
| haute | Audit trail | Historique complet de toutes les modifications |
| moyenne | Dark mode perfectionne | Ajustements fins des contrastes et couleurs en mode sombre |
| moyenne | PWA / offline | Progressive Web App pour utilisation hors-ligne |
| moyenne | i18n | Internationalisation (francais/anglais) |
| basse | Plugin API | API pour extensions tierces (webhooks, integrations) |
| basse | Themes personnalisables | Themes de couleurs au-dela de light/dark |

---

## Legende priorite

- **haute** : impact fort sur l'usage quotidien, demande frequente
- **moyenne** : amelioration significative mais non bloquante
- **basse** : nice-to-have, usage ponctuel

## Statistiques

| Persona | Haute | Moyenne | Basse | Total |
|---------|-------|---------|-------|-------|
| Scrum Master | 3 | 3 | 2 | 8 |
| Product Owner | 3 | 3 | 1 | 7 |
| RTE | 3 | 3 | 2 | 8 |
| Developpeur | 1 | 2 | 2 | 5 |
| Support | 2 | 2 | 1 | 5 |
| Project Manager | 2 | 2 | 1 | 5 |
| Transverse | 3 | 3 | 2 | 8 |
| **Total** | **17** | **18** | **11** | **46** |
