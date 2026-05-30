# Guide Support

> Gerez la rotation, suivez les tickets support et assurez la continuite.

---

## Rotation support

### Consulter
- Vue **Sprint** (`2`) : la **banniere support** en haut affiche qui est au support cette semaine
- **Panneau info** (droite) : section "Support cette semaine"

### Configurer
1. **Vue Support** (`S`) : timeline PI + boutons **🎲 Générer PI{N}** / **🎲 PI{N+1}** par équipe
2. **Parametres** (`7`) → section Rotation Support : édition fine cellule par cellule
3. **Shuffle** : génération automatique respectant les règles métier (voir ci-dessous)
4. **Verrouillage** : `locked` empêche la modification accidentelle d'une semaine

### Règles métier (appliquées automatiquement)
| # | Règle | Détail |
|---|-------|--------|
| 1 | Absent ≥ 3j → exclu | Source = table absences (CSV RH) |
| 2 | Pas 2 semaines consécutives | Relâché si pool insuffisant |
| 3 | Passé verrouillé | `weekEnd < today` → intact, marqué 🔒 |
| 4 | Verrouillage manuel | `locked: true` → intact même futur |
| 5 | Équité | Compteur d'affectations + random pour ex-aequos |
| 6 | Configurable | `membersPerWeek` par équipe (défaut 2) |

### Modes de semaine
| Mode | Plage |
|------|-------|
| Lun→Ven | Lundi au vendredi (5 jours ouvres) |
| Ven→Jeu | Vendredi au jeudi (7 jours, aligne sprint) |
| Mer→Mar | Mercredi au mardi (rotation milieu de semaine) |

## Tickets support

- Les tickets de type **Support** ou avec le label `support` sont identifies
- La section **Support** dans les rapports (`6`) resume : nombre, priorites, rotation

## Absences et capacite

- Les absences impactent la rotation : un membre absent ne devrait pas etre au support
- Consultez la section **Absences** dans Parametres pour voir les conges en cours
- Le **panneau info** affiche les absents du moment

## Vues cles

| Priorite | Vue | Usage |
|----------|-----|-------|
| Quotidien | Sprint (`2`) | Banniere support, tickets |
| Hebdo | Parametres (`7`) | Rotation, absences |
| Hebdo | Rapports (`6`) | Section Support |
