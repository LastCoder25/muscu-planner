# Contrat JSON — appli muscu (v1.0)

Format unique partagé par l'appli, le moteur déterministe et l'IA externe.
Tout est versionné par `schema_version` pour pouvoir faire évoluer le format sans casser les imports.

## Le principe : un seul contrat, deux cerveaux interchangeables

```
                 ┌──────────────────────────┐
   profil  ───▶  │  coach_request           │  ───▶  session (le plan)
   historique ─▶ │  (profil + historique)   │        ↑          │
                 └──────────────────────────┘        │          ▼
                          │     │                     │    [ séance live ]
              ┌───────────┘     └───────────┐         │          │
              ▼                             ▼          │          ▼
   ┌─────────────────────┐    ┌─────────────────────┐ │   session_log (bilan)
   │ MOTEUR déterministe │    │  IA (ChatGPT…)      │ │          │
   │ règles progression  │    │  reprogrammation    │ │          │
   └─────────────────────┘    └─────────────────────┘ │          │
              │                             │          │          │
              └────────────┬────────────────┘          └──────────┘
                           ▼
                    nouvelle session  ──── import ────▶ appli
```

Le moteur et l'IA prennent la **même entrée** (`coach_request`) et produisent la **même sortie** (`session`).
L'appli ne voit aucune différence : elle importe une `session`, point.

## Quatre types de documents

| `type` | Rôle | Produit par | Consommé par |
|---|---|---|---|
| `profile` | Qui est l'utilisateur | onboarding | moteur, IA |
| `session` | Le plan d'une séance | moteur, IA, user, templates | appli (séance live), import |
| `session_log` | Le bilan d'une séance réalisée | appli (fin de séance) | moteur, IA |
| `coach_request` | Enveloppe d'export vers le moteur ou l'IA | appli | moteur, IA |

---

## 1. `profile`

```json
{
  "schema_version": "1.0",
  "type": "profile",
  "identity": {
    "name": "Alban",
    "sex": "homme",
    "birth_year": 1990,
    "height_cm": 178,
    "weight_kg": 74
  },
  "experience": {
    "level": "intermediaire",
    "training_months": 30,
    "known_1rm_kg": { "bench": 80, "squat": 110, "deadlift": 130 }
  },
  "objective": "hypertrophie",
  "availability": {
    "sessions_per_week": 4,
    "session_duration_min": 60,
    "preferred_days": ["lun", "mar", "jeu", "ven"]
  },
  "equipment": "salle_complete",
  "constraints": {
    "injuries": ["épaule droite"],
    "avoid_exercises": ["développé militaire barre"]
  },
  "preferences": {
    "priority_muscles": ["pectoraux", "dos"],
    "units": "kg"
  }
}
```

Valeurs cadrées (enums) :
- `level` : `debutant` · `intermediaire` · `avance`
- `objective` : `force` · `hypertrophie` · `endurance` · `remise_en_forme` · `perte_de_gras`
- `equipment` : `salle_complete` · `home_gym` · `halteres` · `poids_du_corps`
- `units` : `kg` · `lb` (stockage interne toujours en kg, conversion à l'affichage)

C'est le bloc qui **pilote** la génération : `objective` → fourchettes de reps + repos ; `availability` → découpage (full-body / half / PPL) ; `level` → schéma de progression par défaut ; `equipment` + `constraints` → filtrage du pool d'exos.

---

## 2. `session` — le plan

```json
{
  "schema_version": "1.0",
  "type": "session",
  "id": "sess_push_a",
  "name": "Push A — Pecs / Triceps",
  "split": "push",
  "objective": "hypertrophie",
  "level": "intermediaire",
  "estimated_duration_min": 55,
  "source": "ai",
  "created_at": "2026-06-25T18:00:00Z",
  "exercises": [
    {
      "id": "ex_bench_barbell",
      "name": "Développé couché",
      "muscle_primary": "pectoraux",
      "muscle_secondary": ["triceps", "deltoïde antérieur"],
      "equipment": "barre",
      "progression": "double",
      "rest_seconds": 120,
      "target": {
        "sets": 4,
        "reps_min": 8,
        "reps_max": 10,
        "load_kg": 40,
        "rir_target": 2
      },
      "alternatives": ["ex_bench_dumbbell", "ex_incline_machine"],
      "notes": ""
    },
    {
      "id": "ex_dips",
      "name": "Dips lestés",
      "muscle_primary": "pectoraux",
      "muscle_secondary": ["triceps"],
      "equipment": "poids_du_corps",
      "progression": "double",
      "rest_seconds": 90,
      "target": {
        "sets": 3,
        "reps_min": 6,
        "reps_max": 10,
        "load": "bodyweight",
        "added_kg": 10,
        "rir_target": 2
      },
      "alternatives": ["ex_pushup_weighted"],
      "notes": ""
    }
  ]
}
```

Notes de modèle :
- `id` d'exo **stable** entre les séances → c'est la clé qui relie l'historique et permet la progression.
- `progression` par exo : `double` · `linear` · `rir` · `fixed`. Un exo isolé peut être en `double` pendant qu'un de base est en `linear`.
- Fourchette de reps via `reps_min`/`reps_max` (pour un objectif fixe, `min == max`).
- Poids du corps : `"load": "bodyweight"` + `added_kg` optionnel. Charges classiques : `load_kg`.
- `alternatives` = pré-câblage des switchs « machine occupée ».

---

## 3. `session_log` — le bilan

Produit en fin de séance. Contient **prévu vs réalisé** + les notes 1–4 + commentaires. C'est ce qui part vers le moteur ou l'IA.

```json
{
  "schema_version": "1.0",
  "type": "session_log",
  "id": "log_20260625",
  "session_id": "sess_push_a",
  "name": "Push A — Pecs / Triceps",
  "started_at": "2026-06-25T18:02:00Z",
  "ended_at": "2026-06-25T18:54:00Z",
  "duration_min": 52,
  "global_difficulty": 3,
  "global_comment": "Bonne séance, épaule ok. Triceps cuits en fin.",
  "exercises": [
    {
      "id": "ex_bench_barbell",
      "name": "Développé couché",
      "swapped_from": null,
      "planned": { "sets": 4, "reps_min": 8, "reps_max": 10, "load_kg": 40 },
      "performed": [
        { "set": 1, "load_kg": 40, "reps": 10, "difficulty": 1, "comment": "propre" },
        { "set": 2, "load_kg": 40, "reps": 10, "difficulty": 2, "comment": "" },
        { "set": 3, "load_kg": 40, "reps": 9,  "difficulty": 3, "comment": "dur sur la fin" },
        { "set": 4, "load_kg": 40, "reps": 8,  "difficulty": 4, "comment": "échec rep 8" }
      ],
      "exercise_comment": ""
    },
    {
      "id": "ex_incline_machine",
      "name": "Développé incliné machine",
      "swapped_from": "ex_dips",
      "planned": { "sets": 3, "reps_min": 6, "reps_max": 10, "added_kg": 10 },
      "performed": [
        { "set": 1, "load_kg": 35, "reps": 10, "difficulty": 2, "comment": "dips occupés" },
        { "set": 2, "load_kg": 35, "reps": 9,  "difficulty": 3, "comment": "" },
        { "set": 3, "load_kg": 35, "reps": 8,  "difficulty": 3, "comment": "" }
      ],
      "exercise_comment": "Dips occupés, basculé sur machine."
    }
  ]
}
```

- `difficulty` = la note **1–4** de la maquette (1 facile → 4 max/échec). Signal d'autorégulation **universel**, présent quel que soit le niveau.
- `rir` (optionnel) = réserve de reps estimée. **Affiché uniquement en niveau avancé** (`level_config.effort_signal = "rir"`). Pour un débutant on garde la note 1–4 seule, l'estimation du RIR n'étant pas fiable avant un certain temps de pratique.
- `swapped_from` trace les changements d'exo en live : ici l'historique des dips est conservé, mais cette séance compte pour l'exo machine.
- `planned` figé au moment du log → on peut toujours comparer la dérive prévu/réalisé.

---

## 4. `coach_request` — l'enveloppe d'export

Ce que l'appli sérialise pour le moteur **ou** pour l'IA. Pour l'IA, l'utilisateur le copie vers ChatGPT ; l'IA répond avec un objet `session` que l'appli réimporte après validation.

```json
{
  "schema_version": "1.0",
  "type": "coach_request",
  "profile": { "...": "objet profile" },
  "history": [ "... 1 à N session_log récents" ],
  "last_session": { "...": "session planifiée précédente (optionnel)" },
  "instruction": "Génère la prochaine séance Push. Respecte la double progression et l'objectif hypertrophie. Tiens compte de l'échec sur le développé couché et de l'épaule droite sensible. Réponds uniquement avec un objet JSON de type session, sans texte autour."
}
```

L'`instruction` est générée par l'appli (l'utilisateur n'a rien à rédiger). La consigne « réponds uniquement avec un JSON `session` » garantit un retour réimportable.

---

## Règles du moteur déterministe (le « sans IA »)

Lecture du dernier `session_log`, application par exo, émission d'une `session` :

| Condition sur le dernier passage de l'exo | Action séance suivante |
|---|---|
| Haut de fourchette atteint sur **toutes** les séries **et** difficulté moyenne ≤ 2 | **+charge** (+2,5 kg, ou +1,25 kg en isolation / +added_kg en lesté), reps remises à `reps_min` |
| Reps dans la fourchette, difficulté 2–3 | charge maintenue, **+1 rep** vers `reps_max` |
| Difficulté 4 sur ≥ moitié des séries, ou échec sous `reps_min` | charge **maintenue** |
| Échec sous `reps_min` **2 séances de suite** | **−5 %** de charge (deload léger) |
| Exo `swapped_from` non nul | historique suivi sous l'exo réellement réalisé |

Pour `progression: linear` (défaut débutant), la règle se simplifie : **reps cibles atteintes → +charge à la séance suivante**, sans attendre le haut de fourchette. Échec deux séances de suite → deload −10 %. C'est ce qui colle aux gains rapides de début de pratique.

Le moteur couvre la routine. L'IA reprend la main pour : casser un plateau, changer la sélection d'exos, restructurer un bloc, intégrer une contrainte nouvelle (blessure).

---

## Couche d'adaptation par niveau

Le même contrat sert un grand débutant **et** un pratiquant de 15 ans. Tout le comportement variable est centralisé dans un objet `level_config`, **dérivé** de `experience.level` et **surchargeable** par l'utilisateur.

| Axe | `debutant` | `intermediaire` | `avance` |
|---|---|---|---|
| Progression par défaut | `linear` (+charge souvent) | `double` | `double` + autorégulation RIR |
| Signal d'effort | note 1–4 seule | 1–4 (RIR optionnel) | 1–4 **+ RIR affiché** |
| Historique envoyé au coach | 1 séance | 2 séances | 3–4 séances |
| Création de séance | templates proposés, charges auto | templates + édition | import / construction libre |
| Deload | rare, au besoin | périodique léger | surveillé par le moteur (fatigue) |
| Densité UI | guidée (conseils, charges suggérées) | standard | dense (tonnage, tendances, saisie rapide) |

```json
{
  "schema_version": "1.0",
  "type": "level_config",
  "derived_from": "intermediaire",
  "default_progression": "double",
  "effort_signal": "rir_optional",
  "coach_history_depth": 2,
  "program_mode": "assisted",
  "ui_density": "standard",
  "auto_deload": false,
  "overridable": true
}
```

Valeurs cadrées : `effort_signal` ∈ `simple` · `rir_optional` · `rir` ; `program_mode` ∈ `guided` · `assisted` · `free` ; `ui_density` ∈ `comfortable` · `standard` · `dense`.

Concrètement pour les deux cas réels de l'app :
- **Quasi débutant** : progression linéaire, +2,5 kg dès les reps bouclées, l'appli génère un Full-Body et suggère les charges de départ, UI qui explique. Le moteur seul suffit longtemps, sans jamais toucher à une IA.
- **15 ans de pratique** : double progression + RIR, import/construction libre des séances, tonnage et tendances affichés, le moteur surveille la fatigue et propose un deload — et c'est typiquement ce profil qui exporte le bilan vers une IA pour franchir un plateau.

Dérivé mais surchargeable : un débutant motivé peut activer le RIR, un avancé peut tout simplifier.

---

## Notes d'implémentation (Laravel + Vue/Quasar)

- **Stockage** : colonnes JSON canoniques (`sessions.payload`, `session_logs.payload`) + colonnes indexées extraites (`user_id`, `type`, `performed_at`, `session_id`) pour les requêtes. On garde le JSON brut pour le round-trip parfait.
- **Validation d'import** : JSON Schema (`opis/json-schema`) ou Form Request dédié. On rejette si `type` inattendu ou `schema_version` non géré. Message d'erreur clair côté UI (« JSON non reconnu — attendu : une séance »).
- **Versioning** : `schema_version` lu en premier ; pipeline d'upgraders `1.0 → 1.1 → …` pour migrer les vieux payloads à la lecture.
- **Sécurité du collage IA** : on parse en sandbox, on valide le schéma, on ne fait jamais confiance aux champs en trop (on ignore les clés inconnues).
- **Pont avec la maquette** : l'objet `state.sets` de l'écran live = un exo de `session` à l'aller, un bloc `exercises[].performed` au retour. Mapping direct.
