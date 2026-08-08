// useProgress — les 5 niveaux de l'utilisateur, réactifs.
// Muscu / Tennis (drills + prépa) / Cardio (course/vélo/marche) / Challenges / Global.
// Niveaux numériques purs (computeLevel), sans rang ni palier.
import { computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { useSessionsStore } from '@/stores/sessions';
import { useCardioStore } from '@/stores/cardio';
import { useComboStore } from '@/stores/combo';
import { sessionXp, drillSessionXp, cardioSessionXp } from '@/lib/athlete';
import { challengeXpPoints } from '@/lib/challenges';
import { comboXpPoints } from '@/lib/combo';
import { computeLevel } from '@/lib/levels';
import {
  isCardioTrackChallenge,
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,
  defaultActivityForChallenge,
} from '@/data/cardio';
import {
  emptyBuckets,
  addXp,
  MUSCU_SIG,
  CARDIO_CHALLENGE_SIG,
  cardioSignature,
  sportSignature,
} from '@/lib/statSignature';
import type { SportEntry } from '@/lib/sportAchievements';

// Part de l'XP de fond convertie en énergie d'aventure (réglable).
// 1 = « ton énergie = ton XP de fond » (généreux : le sport finance une vraie session de jeu).
const ENERGY_PER_XP = 1;

export function useProgress() {
  const logs = useLogsStore();
  const tennis = useTennisStore();
  const challenges = useChallengesStore();
  const sessions = useSessionsStore();
  const cardio = useCardioStore();
  const combo = useComboStore();

  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
    tennis.fetchLogs().catch(() => undefined);
    challenges.fetchMine().catch(() => undefined);
    sessions.fetchMine().catch(() => undefined);
    cardio.fetchLogs().catch(() => undefined);
    combo.fetchMine().catch(() => undefined);
  });

  // Séances « spécifiques » (hors muscu de fond) → comptent dans le Tennis/Spécifique :
  // prépa physique, crossfit, hyrox. Tag porté par la séance OU directement par le log
  // (log rapide crossfit/hyrox sans séance).
  const specifiqueSessionIds = computed(
    () =>
      new Set(
        sessions.list
          .filter((s) => (s.payload.discipline ?? 'musculation') !== 'musculation')
          .map((s) => s.id),
      ),
  );
  // « Autre sport » (log rapide durée) → compte dans le GLOBAL + énergie (pas muscu,
  // pas cardio, pas spécifique). Bucket dédié.
  const isAutreLog = (r: (typeof logs.all)[number]) => r.payload.discipline === 'autre_sport';
  const isSpecifiqueLog = (r: (typeof logs.all)[number]) => {
    const d = r.payload.discipline;
    if (d === 'autre_sport') return false; // géré à part (global)
    if (d && d !== 'musculation') return true;
    return !!r.payload.session_id && specifiqueSessionIds.value.has(r.payload.session_id);
  };

  const muscuXp = computed(() =>
    logs.all
      .filter((r) => !isSpecifiqueLog(r) && !isAutreLog(r))
      .reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  // XP « autre sport » (durée) → n'alimente QUE le global et l'énergie.
  const autreXp = computed(() =>
    logs.all.filter((r) => isAutreLog(r)).reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const specifiqueSessionXp = computed(() =>
    logs.all.filter((r) => isSpecifiqueLog(r)).reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const tennisXp = computed(
    () =>
      specifiqueSessionXp.value + tennis.logs.reduce((a, r) => a + drillSessionXp(r.payload), 0),
  );

  // Un challenge alimente la DISCIPLINE de son exercice : marche/course/vélo →
  // cardio ; tout le reste (pompes, gainage…) → muscu.
  const isCardioChallenge = (c: (typeof challenges.list)[number]) => isCardioTrackChallenge(c);
  const muscuChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => !isCardioChallenge(c))),
  );
  const cardioChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => isCardioChallenge(c))),
  );

  // Défi 360 (défi combiné) → piste Muscu (XP façon séance : reps + tonnage + prime).
  const comboXp = computed(() => comboXpPoints(combo.list));
  const muscuTotal = computed(() => muscuXp.value + muscuChallengeXp.value + comboXp.value);
  // Les sorties « miroir » d'un défi (challenge_id) apparaissent dans l'historique
  // mais ne comptent PAS d'XP : l'effort est déjà compté via cardioChallengeXp
  // (sinon double compte). Les sorties manuelles, elles, comptent normalement.
  const cardioXp = computed(
    () =>
      cardio.logs
        .filter((r) => !r.payload.challenge_id)
        .reduce((a, r) => a + cardioSessionXp(r.payload), 0) + cardioChallengeXp.value,
  );
  // Piste Challenges = niveau « méta » (tous les défis) — affiché à part, PAS
  // ajouté au Global (l'effort est déjà compté dans muscu / cardio).
  const challengesXp = computed(() => challengeXpPoints(challenges.list));
  // Global = sport de FOND (muscu + cardio + « autre sport ») — niveau du personnage
  // et source de l'énergie. Le tennis (spécifique) reste à part.
  const generalXp = computed(() => muscuTotal.value + cardioXp.value + autreXp.value);
  const globalXp = generalXp;

  // ── 3 réservoirs de stats (chaque source répartie par sa signature) ──
  // La somme des 3 = generalXp → même total, juste réparti Puissance/Endurance/Agilité.
  const statBuckets = computed(() => {
    const acc = emptyBuckets();
    // Muscu (séances + défis muscu + Défi 360) → signature force.
    addXp(acc, muscuTotal.value, MUSCU_SIG);
    // Cardio (sorties non miroir) → signature par activité.
    for (const r of cardio.logs) {
      if (r.payload.challenge_id) continue;
      addXp(acc, cardioSessionXp(r.payload), cardioSignature(r.payload.activity));
    }
    // Défis cardio → signature cardio générique.
    addXp(acc, cardioChallengeXp.value, CARDIO_CHALLENGE_SIG);
    // « Autre sport » → signature du sport choisi (nom du log).
    for (const r of logs.all) {
      if (isAutreLog(r)) addXp(acc, sessionXp(r.payload), sportSignature(r.payload.name));
    }
    return acc;
  });

  // ── Tuiles par SPORT (une par activité réellement pratiquée) ──
  // = séances loggées uniquement (les challenges/Défi 360 ont leur propre entrée).
  const SPORT_ICON: Record<string, string> = {
    Tennis: 'sports_tennis',
    Padel: 'sports_tennis',
    Football: 'sports_soccer',
    Basket: 'sports_basketball',
    Natation: 'pool',
    Course: 'directions_run',
    Vélo: 'directions_bike',
    Escalade: 'terrain',
    Boxe: 'sports_mma',
    Rugby: 'sports_rugby',
    Yoga: 'self_improvement',
    Randonnée: 'hiking',
    Ski: 'downhill_skiing',
    Golf: 'sports_golf',
    Danse: 'music_note',
  };
  const DISC_TILE: Record<string, { label: string; icon: string }> = {
    musculation: { label: 'Muscu', icon: 'fitness_center' },
    crossfit: { label: 'Crossfit', icon: 'sports_gymnastics' },
    hyrox: { label: 'Hyrox', icon: 'sports_score' },
    mobilite: { label: 'Mobilité', icon: 'self_improvement' },
    prepa_physique: { label: 'Prépa physique', icon: 'directions_run' },
  };
  const sportTiles = computed(() => {
    const map = new Map<
      string,
      { key: string; label: string; icon: string; xp: number; ts: number }
    >();
    const bump = (key: string, label: string, icon: string, xp: number, ts: number) => {
      const e = map.get(key);
      if (e) {
        e.xp += xp;
        e.ts = Math.max(e.ts, ts);
      } else {
        map.set(key, { key, label, icon, xp, ts });
      }
    };
    for (const r of logs.all) {
      const d = r.payload.discipline ?? 'musculation';
      const ts = Date.parse(r.performed_at) || 0;
      if (d === 'autre_sport') {
        const name = r.payload.name || 'Autre';
        bump(`sport:${name}`, name, SPORT_ICON[name] ?? 'sports', sessionXp(r.payload), ts);
      } else {
        const t = DISC_TILE[d] ?? DISC_TILE.musculation!;
        bump(`disc:${d}`, t.label, t.icon, sessionXp(r.payload), ts);
      }
    }
    for (const r of cardio.logs) {
      if (r.payload.challenge_id) continue; // sorties miroir = pas d'XP
      const a = r.payload.activity;
      bump(
        `cardio:${a}`,
        ACTIVITY_LABELS[a] ?? 'Cardio',
        ACTIVITY_ICONS[a] ?? 'directions_run',
        cardioSessionXp(r.payload),
        Date.parse(r.performed_at) || 0,
      );
    }
    // Les DÉFIS alimentent aussi la tuile de leur sport → un défi muscu fait
    // apparaître la tuile Muscu même sans séance loggée (défi cardio → activité).
    const challengeTs = (c: (typeof challenges.list)[number]) => {
      const last = (c.progress ?? []).reduce((m, p) => (p.date > m ? p.date : m), '');
      return last ? Date.parse(last) || 0 : 0;
    };
    for (const c of challenges.list) {
      const xp = challengeXpPoints([c]);
      if (xp <= 0) continue;
      if (isCardioChallengeRow(c)) {
        const a = defaultActivityForChallenge(c.exercise_id);
        bump(
          `cardio:${a}`,
          ACTIVITY_LABELS[a] ?? 'Cardio',
          ACTIVITY_ICONS[a] ?? 'directions_run',
          xp,
          challengeTs(c),
        );
      } else {
        bump('disc:musculation', 'Muscu', 'fitness_center', xp, challengeTs(c));
      }
    }
    // Défi 360 → Muscu.
    if (comboXp.value > 0) bump('disc:musculation', 'Muscu', 'fitness_center', comboXp.value, 0);

    return [...map.values()]
      .map((t) => ({ ...t, level: computeLevel(t.xp) }))
      .sort((a, b) => b.ts - a.ts);
  });

  // Séances normalisées (pour les Trophées : records + paliers par sport).
  const CAT: Record<string, SportEntry['category']> = {
    musculation: 'muscu',
    crossfit: 'specifique',
    hyrox: 'specifique',
    mobilite: 'specifique',
    prepa_physique: 'specifique',
    autre_sport: 'autre',
  };
  const sportEntries = computed<SportEntry[]>(() => {
    const out: SportEntry[] = [];
    for (const r of logs.all) {
      const d = r.payload.discipline ?? 'musculation';
      const sport =
        d === 'autre_sport' ? r.payload.name || 'Autre' : (DISC_TILE[d]?.label ?? 'Muscu');
      const tonnage = (r.payload.exercises ?? []).reduce(
        (a, ex) =>
          a + (ex.performed ?? []).reduce((b, s) => b + (s.load_kg || 0) * (s.reps || 0), 0),
        0,
      );
      out.push({
        sport,
        category: CAT[d] ?? 'autre',
        hasDistance: false,
        date: (r.performed_at || '').slice(0, 10),
        durationMin: r.payload.duration_min || 0,
        distanceKm: 0,
        dPlus: 0,
        tonnage,
      });
    }
    for (const r of cardio.logs) {
      if (r.payload.challenge_id) continue;
      const a = r.payload.activity;
      out.push({
        sport: ACTIVITY_LABELS[a] ?? 'Cardio',
        category: 'cardio',
        hasDistance: true,
        date: (r.performed_at || '').slice(0, 10),
        durationMin: r.payload.duration_min || 0,
        distanceKm: r.payload.distance_km || 0,
        dPlus: r.payload.elevation_m || 0,
        tonnage: 0,
      });
    }
    return out;
  });

  return {
    sportTiles,
    sportEntries,
    global: computed(() => computeLevel(globalXp.value)),
    general: computed(() => computeLevel(generalXp.value)),
    specifique: computed(() => computeLevel(tennisXp.value)),
    muscu: computed(() => computeLevel(muscuTotal.value)),
    tennis: computed(() => computeLevel(tennisXp.value)),
    cardio: computed(() => computeLevel(cardioXp.value)),
    challenges: computed(() => computeLevel(challengesXp.value)),
    // Données brutes pour le RPG (fond uniquement).
    muscuXp: computed(() => muscuTotal.value),
    cardioXp: computed(() => cardioXp.value),
    // 3 réservoirs de stats (répartis par signature de sport) → stats du perso.
    powerXp: computed(() => Math.round(statBuckets.value.power)),
    enduranceXp: computed(() => Math.round(statBuckets.value.endurance)),
    agilityXp: computed(() => Math.round(statBuckets.value.agility)),
    // Énergie RPG = fraction de l'XP de fond gagnée (l'XP encode déjà l'effort :
    // reps des challenges, durée/distance/charge des séances). Tennis exclu.
    energyEarned: computed(() => Math.round(generalXp.value * ENERGY_PER_XP)),
  };
}
