<template>
  <q-page class="adv-page">
    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Choix du pseudo (première visite) -->
    <template v-else-if="!char.row">
      <h1 class="page-title font-display">Ton aventurier</h1>
      <p class="page-sub text-dim">Choisis un pseudo unique pour lancer l'aventure.</p>
      <section class="card">
        <q-input
          v-model="pseudoInput"
          filled
          label="Pseudo d'aventurier"
          maxlength="20"
          :error="!!pseudoError"
          :error-message="pseudoError"
          @keyup.enter="savePseudo"
        />
        <div class="hint">3 à 20 caractères · lettres, chiffres, espace, - et _</div>
        <q-btn
          class="save full-width q-mt-md"
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          icon="check"
          label="Créer mon aventurier"
          :loading="saving"
          :disable="!isValidPseudo(pseudoInput)"
          @click="savePseudo"
        />
      </section>
    </template>

    <!-- Fiche personnage -->
    <template v-else>
      <div class="eyebrow">Ton aventurier</div>

      <div class="hero">
        <div class="lvl-ring">
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r="38" fill="none" stroke="#000" stroke-width="5" />
            <circle
              cx="42"
              cy="42"
              r="38"
              fill="none"
              stroke="var(--accent)"
              stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="239"
              :stroke-dashoffset="239 * (1 - c.level.progressPct / 100)"
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div class="ring-txt">
            <div class="num font-display">{{ c.level.level }}</div>
            <div class="cap">Niveau</div>
          </div>
        </div>
        <div class="who">
          <div class="name font-display">
            {{ char.row.pseudo }}
            <button class="edit" aria-label="Renommer" @click="renamePseudo">
              <q-icon name="edit" size="15px" />
            </button>
          </div>
          <div class="sub">
            Profil : <b>{{ profileLabel }}</b> · 🪙 {{ char.row.gold }} or
          </div>
        </div>
      </div>

      <div class="energy">
        <div>
          <div class="lab">Énergie</div>
          <div class="ehint">gagnée en faisant du sport · sert aux aventures</div>
        </div>
        <div class="eval font-display">{{ c.energy }}<small> ⚡</small></div>
      </div>

      <div class="sec-title">Caractéristiques — issues de ton sport</div>
      <div class="stats">
        <div class="stat s-pui">
          <div class="top">
            <span class="emo">💪</span><span class="nm font-display">Puissance</span
            ><span class="n font-display">{{ c.puissance }}</span>
          </div>
          <div class="bar"><span :style="{ width: barW(c.puissance) }" /></div>
          <div class="lines"><b>Musculation</b> · <span class="infl">dégâts</span></div>
        </div>
        <div class="stat s-end">
          <div class="top">
            <span class="emo">❤️</span><span class="nm font-display">Endurance</span
            ><span class="n font-display">{{ c.endurance }}</span>
          </div>
          <div class="bar"><span :style="{ width: barW(c.endurance) }" /></div>
          <div class="lines">
            <b>Muscu + Cardio</b> · <span class="infl">PV · résistance · énergie max</span>
          </div>
        </div>
        <div class="stat s-agi">
          <div class="top">
            <span class="emo">⚡</span><span class="nm font-display">Agilité</span
            ><span class="n font-display">{{ c.agilite }}</span>
          </div>
          <div class="bar"><span :style="{ width: barW(c.agilite) }" /></div>
          <div class="lines">
            <b>Cardio</b> · <span class="infl">esquive · vitesse · critiques · initiative</span>
          </div>
        </div>
      </div>

      <div class="pv-line">
        Points de vie : <b class="font-display">{{ c.pv }} PV</b>
      </div>

      <!-- Donjons (Phase 2b) -->
      <div class="sec-title">Donjons</div>

      <div v-if="run" class="result" :class="run.cleared ? 'win' : 'lose'">
        <div class="result-head">
          <span>{{ run.cleared ? '🏆 Donjon nettoyé' : '💀 Échec' }} — {{ run.name }}</span>
          <span class="result-gold">+{{ run.gold }} 🪙</span>
        </div>
        <div class="result-sub">
          {{ run.defeated }}/{{ run.total }} monstres vaincus · PV restants {{ run.finalPv }}
        </div>
        <div class="log">
          <div v-for="(f, i) in run.fights" :key="i" class="fight-row" :class="f.win ? 'fw' : 'fl'">
            <span class="fr-emo">{{ f.emoji }}</span>
            <span class="fr-name">{{ f.monster }}</span>
            <span class="fr-out">{{ f.win ? 'vaincu' : 'tu es tombé' }}</span>
            <span class="fr-rounds">{{ f.rounds }} tours</span>
          </div>
        </div>
      </div>

      <div class="dungeons">
        <div v-for="d in DUNGEONS" :key="d.id" class="dgn">
          <span class="dgn-emo">{{ d.emoji }}</span>
          <div class="dgn-main">
            <div class="dgn-top">
              <span class="dgn-name font-display">{{ d.name }}</span>
              <span class="dgn-gold">+{{ dungeonGold(d) }} 🪙</span>
            </div>
            <div class="dgn-stats">
              {{ d.monsterIds.length }} monstres · coûte {{ d.energyCost }} ⚡ · conseillé niv.
              {{ d.recoLevel }}
            </div>
            <div class="dgn-hint">{{ d.hint }}</div>
          </div>
          <button class="fight" :disabled="c.energy < d.energyCost || busy" @click="explore(d)">
            Explorer
          </button>
        </div>
      </div>

      <div class="foot">
        <b>Chaque séance fait progresser ton aventurier.</b> Tu ne répartis jamais de points : la
        muscu nourrit la Puissance, le cardio l'Agilité, les deux l'Endurance. Ton sport génère
        aussi l'énergie des donjons. Le tennis (spécifique) n'entre pas dans le personnage.
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore, PseudoTakenError } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter, isValidPseudo, PROFILE_LABEL } from '@/lib/character';
import { playerCombatant, simulateDungeon } from '@/lib/combat';
import { MONSTERS } from '@/data/monsters';
import { DUNGEONS, dungeonFoes, dungeonGold, type Dungeon } from '@/data/dungeons';

interface RunFight {
  monster: string;
  emoji: string;
  win: boolean;
  rounds: number;
}
interface RunView {
  name: string;
  cleared: boolean;
  defeated: number;
  total: number;
  gold: number;
  finalPv: number;
  fights: RunFight[];
}

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();

const loading = ref(true);
const saving = ref(false);
const pseudoInput = ref('');
const pseudoError = ref('');

const c = computed(() =>
  computeCharacter(
    progress.muscuXp.value,
    progress.cardioXp.value,
    progress.fondMinutes.value,
    char.row?.energy_spent ?? 0,
  ),
);
const profileLabel = computed(() => PROFILE_LABEL[c.value.profile]);

const busy = ref(false);
const run = ref<RunView | null>(null);

async function explore(d: Dungeon) {
  const uid = auth.user?.id;
  if (!uid || busy.value || c.value.energy < d.energyCost) return;
  busy.value = true;
  try {
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerCombatant(char.row?.pseudo ?? 'Toi', c.value);
    const r = simulateDungeon(player, dungeonFoes(d), { seed });
    await char.applyCombat(uid, d.energyCost, r.gold);
    run.value = {
      name: d.name,
      cleared: r.cleared,
      defeated: r.defeated,
      total: r.total,
      gold: r.gold,
      finalPv: r.finalPv,
      fights: r.fights.map((f) => ({
        monster: f.monster,
        emoji: MONSTERS.find((m) => m.name === f.monster)?.emoji ?? '👾',
        win: f.win,
        rounds: f.result.rounds,
      })),
    };
    if (r.cleared) $q.notify({ type: 'positive', message: `Donjon nettoyé — +${r.gold} 🪙` });
  } catch {
    $q.notify({ type: 'negative', message: 'Échec de l’exploration.' });
  } finally {
    busy.value = false;
  }
}

// Barres relatives : montrent la FORME du build (stat / plus haute des trois).
function barW(v: number): string {
  const max = Math.max(c.value.puissance, c.value.endurance, c.value.agilite, 1);
  return `${Math.round((v / max) * 100)}%`;
}

async function savePseudo() {
  const uid = auth.user?.id;
  if (!uid || !isValidPseudo(pseudoInput.value)) return;
  saving.value = true;
  pseudoError.value = '';
  try {
    await char.setPseudo(uid, pseudoInput.value);
    $q.notify({ type: 'positive', message: 'Aventurier créé — bon voyage !' });
  } catch (e) {
    pseudoError.value =
      e instanceof PseudoTakenError
        ? 'Ce pseudo est déjà pris.'
        : e instanceof Error
          ? e.message
          : 'Échec.';
  } finally {
    saving.value = false;
  }
}

function renamePseudo() {
  $q.dialog({
    title: 'Renommer ton aventurier',
    prompt: {
      model: char.row?.pseudo ?? '',
      type: 'text',
      isValid: (v: string) => isValidPseudo(v),
    },
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Renommer', color: 'primary', textColor: 'dark' },
  }).onOk((v: string) => {
    const uid = auth.user?.id;
    if (!uid) return;
    char
      .setPseudo(uid, v)
      .then(() => $q.notify({ type: 'positive', message: 'Pseudo mis à jour.' }))
      .catch((e: unknown) =>
        $q.notify({
          type: 'negative',
          message: e instanceof PseudoTakenError ? 'Ce pseudo est déjà pris.' : 'Échec.',
        }),
      );
  });
}

onMounted(async () => {
  try {
    await char.fetchMine();
  } catch {
    /* pas bloquant */
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.adv-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 40px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
}
.hint {
  font-size: 11px;
  color: var(--dim);
  margin-top: 6px;
}
.eyebrow {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 3px;
  font-size: 11px;
  color: var(--dim);
  font-weight: 600;
}
.hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: center;
  margin: 6px 0 18px;
}
.lvl-ring {
  position: relative;
  width: 84px;
  height: 84px;
  display: grid;
  place-items: center;
}
.lvl-ring svg {
  position: absolute;
  inset: 0;
}
.ring-txt {
  text-align: center;
}
.lvl-ring .num {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
}
.lvl-ring .cap {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--dim);
  text-transform: uppercase;
}
.who .name {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  margin: 4px 0 4px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}
.edit {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  padding: 2px;
}
.who .sub {
  font-size: 13px;
  color: var(--dim);
}
.who .sub b {
  color: var(--d1);
  font-weight: 600;
  text-transform: capitalize;
}
.energy {
  background: linear-gradient(180deg, var(--surface-2, #2b241b), var(--surface));
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.energy .lab {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 12px;
  color: var(--dim);
}
.energy .ehint {
  font-size: 11px;
  color: var(--dim);
  margin-top: 3px;
}
.energy .eval {
  font-size: 40px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.energy .eval small {
  font-size: 15px;
  color: var(--dim);
  font-weight: 400;
}
.sec-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 12px;
  color: var(--dim);
  margin: 0 2px 10px;
  font-weight: 600;
}
.stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 18px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
}
.stat .top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stat .emo {
  font-size: 22px;
  width: 26px;
  text-align: center;
}
.stat .nm {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  flex: 1;
}
.stat .n {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 7px;
  border-radius: 999px;
  background: #000;
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 9px 0 6px;
}
.bar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.stat .lines {
  font-size: 11px;
  color: var(--dim);
}
.stat .lines b {
  color: var(--text);
  font-weight: 600;
}
.s-pui .n,
.s-pui .nm {
  color: var(--d4);
}
.s-pui .bar > span {
  background: var(--d4);
}
.s-end .n,
.s-end .nm {
  color: var(--d1);
}
.s-end .bar > span {
  background: var(--d1);
}
.s-agi .n,
.s-agi .nm {
  color: var(--accent);
}
.s-agi .bar > span {
  background: var(--accent);
}
.pv-line {
  text-align: center;
  font-size: 13px;
  color: var(--dim);
  margin-bottom: 22px;
}
.pv-line b {
  font-size: 20px;
  color: var(--d1);
}
.dungeons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
}
.dgn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
}
.dgn-emo {
  font-size: 28px;
  line-height: 1;
}
.dgn-main {
  flex: 1;
  min-width: 0;
}
.dgn-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.dgn-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.dgn-gold {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}
.dgn-stats {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.dgn-hint {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.85;
  margin-top: 4px;
}
.fight-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dim);
}
.fight-row .fr-emo {
  font-size: 16px;
}
.fight-row .fr-name {
  color: var(--text);
  font-weight: 600;
}
.fight-row .fr-out {
  font-weight: 600;
}
.fight-row.fw .fr-out {
  color: var(--d1);
}
.fight-row.fl .fr-out {
  color: var(--d4);
}
.fight-row .fr-rounds {
  margin-left: auto;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}
.fight {
  flex-shrink: 0;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 10px;
  padding: 9px 14px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.fight:disabled {
  background: transparent;
  color: var(--dim);
  border-color: var(--line);
  cursor: not-allowed;
}
.result {
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-left-width: 3px;
}
.result.win {
  border-left-color: var(--d1);
}
.result.lose {
  border-left-color: var(--d4);
}
.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
}
.result.win .result-head {
  color: var(--d1);
}
.result.lose .result-head {
  color: var(--d4);
}
.result-gold {
  color: var(--accent);
}
.result-sub {
  font-size: 12px;
  color: var(--dim);
  margin: 2px 0 8px;
}
.log {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.log-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.lg-who {
  color: var(--text);
  font-weight: 600;
  min-width: 34px;
}
.log-line.lg-crit {
  color: var(--accent);
}
.log-line.lg-dodge {
  font-style: italic;
}
.lg-pv {
  margin-left: auto;
  opacity: 0.8;
}
.foot {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.55;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.foot b {
  color: var(--text);
}
</style>
