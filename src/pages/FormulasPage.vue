<template>
  <q-page class="fx-page">
    <h1 class="page-title font-display">Calculs XP & énergie</h1>
    <p class="page-sub">
      Vue d'ensemble admin. Les constantes sont lues depuis le code (source de vérité) — si un
      barème change, ce tableau suit.
    </p>

    <!-- NIVEAUX -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">📈</span> Niveaux (courbe unique)</div>
      <p class="fx-txt">
        Toutes les pistes partagent la même courbe. Coût pour passer du niveau L à L+1 :
      </p>
      <div class="formula">coût(L) = 200 + (L−1) × 100</div>
      <div class="fx-txt">XP cumulée nécessaire pour atteindre chaque niveau :</div>
      <div class="tbl">
        <div class="tr th"><span>Niveau</span><span>Coût palier</span><span>XP cumulée</span></div>
        <div v-for="r in levelTable" :key="r.lvl" class="tr">
          <span>{{ r.lvl }}</span
          ><span>{{ r.cost }}</span
          ><span>{{ r.cum.toLocaleString('fr-FR') }}</span>
        </div>
      </div>
    </section>

    <!-- MUSCU -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🏋️</span> XP séance muscu</div>
      <p class="fx-txt">La durée porte l'essentiel (une séance rapide reste gratifiante).</p>
      <div class="formula">
        XP = durée_min × {{ MUSCU_MIN_XP }} + reps × {{ REP_XP }} + tonnage ÷ 500
      </div>
      <ul class="notes">
        <li>tonnage = Σ (charge_kg × reps)</li>
        <li>Log rapide (durée seule) : seul le 1<sup>er</sup> terme compte.</li>
      </ul>
    </section>

    <!-- CARDIO -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🏃</span> XP sortie cardio</div>
      <div class="formula">XP = (km × 4 + min × 2,4) × facteur_activité + (D+ + D−) ÷ 10</div>
      <ul class="notes">
        <li>Le temps pèse plus que la distance (meilleur proxy d'effort).</li>
        <li>D+ et D− comptent autant (la descente sollicite d'autres muscles).</li>
        <li>Sorties « miroir » d'un défi (challenge_id) = 0 XP (déjà comptées côté défi).</li>
      </ul>
      <div class="tbl small">
        <div class="tr th"><span>Activité</span><span>Facteur</span></div>
        <div v-for="a in activityFactors" :key="a.k" class="tr">
          <span>{{ a.k }}</span
          ><span>×{{ a.v }}</span>
        </div>
      </div>
    </section>

    <!-- TENNIS / SPÉCIFIQUE -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🎾</span> XP tennis / spécifique</div>
      <div class="formula">XP drill = 40 + durée_min + drills_faits × 8 + ressenti × 10</div>
      <ul class="notes">
        <li>Piste « spécifique » = drills court + séances prépa physique / crossfit / hyrox.</li>
        <li>Les séances spécifiques utilisent le barème muscu (durée + reps + tonnage).</li>
        <li>Le tennis n'entre <b>jamais</b> dans le Global ni dans l'énergie RPG.</li>
      </ul>
    </section>

    <!-- CHALLENGES -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🎯</span> XP challenges (défis solo)</div>
      <p class="fx-txt">
        Modèle « total » : effort au fil de l'eau + prime versée seulement à la complétion.
      </p>
      <div class="formula">
        XP = reps × {{ REP_XP }} × poids_rep <span class="op">+</span> prime (si total atteint)
      </div>
      <div class="formula">prime = 0,25 × effort_planifié × poids_rep × multiplicateur</div>
      <ul class="notes">
        <li>
          <b>Cumulé</b> (volume) : multiplicateur = 1 + fraction d'avance (jours gagnés ÷ durée).
        </li>
        <li>
          <b>X/jour</b> (régularité) : multiplicateur = 1 + min(jours actifs, 120) ÷ 30 (×2 à 30 j,
          ×5 max).
        </li>
        <li>
          Défis en temps : effort = secondes ÷ 4 ; l'XP d'effort par jour n'est comptée qu'à la
          complétion.
        </li>
        <li>« jours actifs » = jours réellement travaillés (anti-abus : pas la durée affichée).</li>
      </ul>
      <div class="sub-h">Poids d'une rep (selon l'exo)</div>
      <div class="formula">poids_rep = facteur_muscles × (chargé ? 1,25 : 1)</div>
      <ul class="notes">
        <li>facteur muscles : 1 muscle → 0,6 · 2 → 1,0 · 3+ → 1,3</li>
        <li>chargé = barre / haltères / kettlebell / machine / poulie</li>
        <li>Ex. mollets 0,6 · pompes 1,0 · squat barre ~1,63</li>
      </ul>
    </section>

    <!-- DÉFI 360 -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🔄</span> XP Défi 360 (combiné)</div>
      <div class="formula">
        XP = Σ (reps × {{ REP_XP }} × poids_rep) + tonnage ÷ 500 + prime bouclage
      </div>
      <ul class="notes">
        <li>tonnage = reps × charge si renseignée (sinon 0).</li>
        <li>prime = 0,25 × volume × (1 + fraction d'avance), versée au bouclage.</li>
        <li>Alimente la piste <b>Muscu</b>.</li>
      </ul>
    </section>

    <!-- PISTES -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🧭</span> Composition des pistes</div>
      <ul class="notes wide">
        <li><b>Muscu</b> = séances muscu + défis muscu + Défi 360</li>
        <li><b>Cardio</b> = sorties cardio + défis cardio (marche/course/vélo)</li>
        <li><b>Spécifique</b> = drills tennis + prépa / crossfit / hyrox</li>
        <li><b>Global</b> = Muscu + Cardio (= niveau du personnage). Tennis exclu.</li>
        <li>
          <b>Challenges</b> = piste méta (tous les défis) — affichée à part, <b>pas</b> ajoutée au
          Global (sinon double compte).
        </li>
      </ul>
    </section>

    <!-- ÉNERGIE -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">⚡</span> Énergie d'aventure</div>
      <div class="formula">
        énergie dispo = XP_fond × {{ ENERGY_PER_XP }} + énergie_connexion − énergie_dépensée
      </div>
      <ul class="notes">
        <li>XP_fond = Global (Muscu + Cardio). Le sport est la seule source de niveau/stats.</li>
        <li>La connexion ne donne <b>que</b> de l'énergie (pour jouer), jamais de niveau.</li>
      </ul>
      <div class="sub-h">Bonus de connexion quotidien</div>
      <div class="formula">
        énergie_jour = base_streak × (1 + (niveau − 1) × {{ LOGIN.levelScale * 100 }} %)
      </div>
      <div class="tbl small">
        <div class="tr th"><span>Jour de streak</span><span>Base</span></div>
        <div v-for="s in streakTable" :key="s.d" class="tr">
          <span>J{{ s.d }}</span
          ><span>{{ s.e }} ⚡</span>
        </div>
      </div>
      <ul class="notes">
        <li>1 jour de déconnexion toléré par semaine (grâce), sinon reset.</li>
      </ul>
    </section>

    <!-- RPG STATS -->
    <section class="fx">
      <div class="fx-h"><span class="fx-emo">🛡️</span> Stats du personnage & combat</div>
      <div class="formula">stat = réservoir ÷ 15 (linéaire)</div>
      <ul class="notes">
        <li>
          Chaque source d'effort répartit son XP dans 3 <b>réservoirs</b> selon la
          <b>signature du sport</b> (muscu → surtout 💪 ; course → ❤️/⚡ ; escalade → 💪/⚡…).
        </li>
        <li>
          💪 Puissance = réservoir power ÷ 15 · ❤️ Endurance = endurance ÷ 15 · ⚡ Agilité = agility
          ÷ 15
        </li>
        <li>Total des 3 réservoirs = XP de fond → niveau global inchangé.</li>
        <li>PV = {{ COMBAT.pvBase }} + Endurance × {{ COMBAT.pvPerEndurance }}</li>
      </ul>
      <div class="sub-h">Signatures (répartition Puiss / End / Agi)</div>
      <div class="tbl small">
        <div class="tr th"><span>Source</span><span>💪 / ❤️ / ⚡</span></div>
        <div v-for="s in signatures" :key="s.k" class="tr">
          <span>{{ s.k }}</span
          ><span>{{ s.v }}</span>
        </div>
      </div>
      <div class="sub-h">Combat</div>
      <ul class="notes wide">
        <li>Dégâts = {{ COMBAT.baseDamage }} + Puissance × {{ COMBAT.damagePerPuissance }}</li>
        <li>
          Critique = Agilité × {{ COMBAT.critPerAgilite * 100 }} % (max
          {{ COMBAT.critCap * 100 }} %)
        </li>
        <li>
          Esquive = Agilité × {{ COMBAT.dodgePerAgilite * 100 }} % (max
          {{ COMBAT.dodgeCap * 100 }} %)
        </li>
        <li>
          Variance des dégâts : ×[{{ COMBAT.varianceMin }} …
          {{ COMBAT.varianceMin + COMBAT.varianceSpan }}]
        </li>
        <li>Régén entre 2 combats d'un donjon : {{ COMBAT.dungeonHealPct * 100 }} % des PV max</li>
        <li>
          Indice de puissance = offense (dégâts × crit × vol de vie) × survie (PV × esquive ×
          réduc.)
        </li>
        <li>L'équipement ne donne <b>que des effets %</b>, jamais de stats brutes.</li>
      </ul>
    </section>

    <div class="fx-foot">Page réservée à l'administrateur.</div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { REP_XP, MUSCU_MIN_XP } from '@/lib/athlete';
import { LOGIN, streakBaseEnergy } from '@/lib/loginStreak';
import { COMBAT } from '@/lib/combat';
import { MUSCU_SIG, cardioSignature, SPORT_SIGNATURES } from '@/lib/statSignature';

const pctTriplet = (w: { power: number; endurance: number; agility: number }) =>
  `${Math.round(w.power * 100)} / ${Math.round(w.endurance * 100)} / ${Math.round(w.agility * 100)}`;
const signatures = [
  { k: 'Muscu', v: pctTriplet(MUSCU_SIG) },
  { k: 'Course', v: pctTriplet(cardioSignature('course')) },
  { k: 'Vélo', v: pctTriplet(cardioSignature('velo')) },
  { k: 'Trail', v: pctTriplet(cardioSignature('trail')) },
  ...Object.entries(SPORT_SIGNATURES).map(([k, w]) => ({ k, v: pctTriplet(w) })),
];

// Reproduit les constantes NON exportées (documentaires ; à garder alignées).
const ENERGY_PER_XP = 1;
const ACTIVITY_XP_FACTOR: Record<string, number> = {
  course: 1,
  trail: 1,
  course_tapis: 1,
  velo: 0.7,
  velo_appart: 0.6,
  rando: 0.55,
  marche: 0.45,
  marche_tapis: 0.45,
};
const activityFactors = Object.entries(ACTIVITY_XP_FACTOR).map(([k, v]) => ({ k, v }));

const levelTable = computed(() => {
  const rows: { lvl: number; cost: number; cum: number }[] = [];
  let cum = 0;
  for (let lvl = 1; lvl <= 10; lvl++) {
    const cost = 200 + (lvl - 1) * 100;
    rows.push({ lvl, cost, cum });
    cum += cost;
  }
  return rows;
});

const streakTable = computed(() =>
  Array.from({ length: LOGIN.streakCap }, (_, i) => ({ d: i + 1, e: streakBaseEnergy(i + 1) })),
);
</script>

<style scoped lang="scss">
.fx-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 40px;
}
.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  color: var(--dim);
  font-size: 13px;
  line-height: 1.5;
  margin: 6px 0 18px;
}
.fx {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 14px;
}
.fx-h {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
  margin-bottom: 8px;
}
.fx-emo {
  font-size: 20px;
}
.fx-txt {
  color: var(--dim);
  font-size: 13px;
  line-height: 1.5;
  margin: 6px 0;
}
.sub-h {
  margin: 14px 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
  font-weight: 700;
}
.formula {
  background: var(--bg);
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0;
  font-family: 'Oswald', monospace;
  font-size: 14px;
  color: var(--text);
  overflow-x: auto;
  white-space: nowrap;
}
.formula .op {
  color: var(--accent);
  margin: 0 4px;
}
.notes {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--dim);
  font-size: 12.5px;
  line-height: 1.6;
}
.notes.wide li {
  margin-bottom: 4px;
}
.notes b {
  color: var(--text);
}
.tbl {
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}
.tbl.small {
  max-width: 280px;
}
.tr {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  font-size: 13px;
  color: var(--text);
}
.tbl.small .tr {
  grid-template-columns: 1fr 1fr;
}
.tr > span {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
.tr:last-child > span {
  border-bottom: none;
}
.tr.th > span {
  background: var(--bg);
  color: var(--dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}
.fx-foot {
  text-align: center;
  color: var(--dim);
  font-size: 11px;
  margin-top: 8px;
}
</style>
