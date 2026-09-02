import { computed } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { sessionXp, otherSportXp, cardioSessionXp, REP_XP, assistMult } from '@/lib/athlete';
import { challengeDayXp } from '@/lib/challenges';
import { legSets } from '@/lib/combo';
import { isCardioOutingChallenge } from '@/data/cardio';

// Énergie d'aventure = XP de FOND (muscu + cardio + autre sport + défis muscu/cardio).
// Le tennis/prépa/crossfit… comptent leur XP mais PAS l'énergie. Même règle que l'Agenda
// (source unique de vérité de l'affichage par jour → mêmes chiffres qu'à l'Agenda).
const SPECIFIQUE_DISC = new Set(['crossfit', 'hyrox', 'mobilite', 'prepa_physique']);

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export interface EnergyDay {
  date: string; // YYYY-MM-DD
  label: string; // « Aujourd'hui » / « Hier » / « lun. 1 sept. »
  earned: number; // énergie gagnée ce jour-là (⚡)
}

/** Énergie GAGNÉE (sport) par jour sur les `nDays` derniers jours (aujourd'hui inclus),
 *  du plus récent au plus ancien. Lit les stores déjà chargés (via useProgress). */
export function useEnergyHistory(nDays = 3) {
  const logs = useLogsStore();
  const cardio = useCardioStore();
  const challenges = useChallengesStore();
  const combo = useComboStore();

  return computed<EnergyDay[]>(() => {
    const byDay = new Map<string, number>();
    const add = (day: string, e: number) => {
      if (e > 0) byDay.set(day, (byDay.get(day) ?? 0) + e);
    };

    // Séances muscu / autre sport (les disciplines « spécifiques » ne donnent pas d'énergie).
    for (const r of logs.all) {
      const disc = r.payload.discipline ?? 'musculation';
      if (SPECIFIQUE_DISC.has(disc)) continue;
      const xp =
        disc === 'autre_sport'
          ? otherSportXp(r.payload.duration_min ?? 0, r.payload.name)
          : sessionXp(r.payload);
      add(isoDay(new Date(Date.parse(r.performed_at))), xp);
    }
    // Sorties cardio MANUELLES (les sorties miroir issues d'un défi ne comptent pas ici —
    // leur énergie est portée par le défi lui-même).
    for (const r of cardio.logs) {
      if (r.payload.challenge_id) continue;
      add(isoDay(new Date(Date.parse(r.performed_at))), cardioSessionXp(r.payload));
    }
    // Défis (hors vraies sorties cardio, déjà couvertes ci-dessus), jour par jour.
    for (const c of challenges.list) {
      if (isCardioOutingChallenge(c)) continue;
      for (const p of c.progress) {
        if (p.done > 0) add(p.date, challengeDayXp(c, p));
      }
    }
    // Défi 360 : chaque série de chaque exo, jour par jour (reps × poids-de-rep + tonnage).
    for (const c of combo.list) {
      for (const leg of c.legs) {
        for (const s of legSets(leg)) {
          if (!s.date) continue;
          const reps = s.reps || 0;
          let xp = reps * REP_XP * (leg.rep_weight || 1) * assistMult(s.assisted);
          if (s.weight) xp += (reps * s.weight) / 500;
          add(s.date, Math.round(xp));
        }
      }
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const out: EnergyDay[] = [];
    for (let i = 0; i < nDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = isoDay(d);
      const label =
        i === 0
          ? "Aujourd'hui"
          : i === 1
            ? 'Hier'
            : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      out.push({ date, label, earned: Math.round(byDay.get(date) ?? 0) });
    }
    return out;
  });
}
