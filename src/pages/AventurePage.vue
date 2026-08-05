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
          class="full-width q-mt-md"
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

    <template v-else>
      <!-- Bandeau compact toujours visible -->
      <div class="topbar">
        <div class="tb-left">
          <span class="tb-lvl font-display">Niv. {{ c.level.level }}</span>
          <span class="tb-name font-display">{{ char.row.pseudo }}</span>
          <button class="edit" aria-label="Renommer" @click="renamePseudo">
            <q-icon name="edit" size="14px" />
          </button>
        </div>
        <div class="tb-right">
          <span class="tb-chip">⚡ {{ c.energy }}</span>
          <span class="tb-chip gold">🪙 {{ char.row.gold }}</span>
          <span class="tb-chip dust">✨ {{ char.row.dust }}</span>
        </div>
      </div>

      <div class="seg">
        <button class="seg-b" :class="{ on: tab === 'perso' }" @click="tab = 'perso'">
          <q-icon name="person" size="18px" /> Perso
        </button>
        <button class="seg-b" :class="{ on: tab === 'donjons' }" @click="tab = 'donjons'">
          <q-icon name="castle" size="18px" /> Donjons
        </button>
        <button class="seg-b" :class="{ on: tab === 'boss' }" @click="tab = 'boss'">
          <q-icon name="local_fire_department" size="18px" /> Boss
        </button>
      </div>

      <!-- ONGLET PERSONNAGE -->
      <template v-if="tab === 'perso'">
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
          <div class="hero-info">
            <div class="hero-arch">
              Profil : <b>{{ profileLabel }}</b>
            </div>
            <div class="hero-power">
              <span class="hp-lbl">⚔️ Puissance de combat</span>
              <span class="hp-val font-display">{{ combatPowerVal }}</span>
            </div>
            <div class="hero-xp">
              {{ c.level.xpIntoLevel.toLocaleString('fr-FR') }} /
              {{ c.level.xpForLevel.toLocaleString('fr-FR') }} XP
            </div>
          </div>
        </div>

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
              <b>Muscu + Cardio</b> · <span class="infl">PV · résistance</span>
            </div>
          </div>
          <div class="stat s-agi">
            <div class="top">
              <span class="emo">⚡</span><span class="nm font-display">Agilité</span
              ><span class="n font-display">{{ c.agilite }}</span>
            </div>
            <div class="bar"><span :style="{ width: barW(c.agilite) }" /></div>
            <div class="lines">
              <b>Cardio</b> · <span class="infl">esquive · critiques · initiative</span>
            </div>
          </div>
        </div>
        <div class="pv-line">
          ❤️ <b class="font-display">{{ c.pv + bonusPv }} PV</b>
          <span v-if="bonusPv" class="pv-bonus">(+{{ bonusPv }} bonus)</span>
        </div>

        <div class="sec-title">Talents</div>
        <div v-if="talentPoints > 0" class="talent-choice">
          <div class="tc-head">
            🎓 {{ talentPoints }} talent{{ talentPoints > 1 ? 's' : '' }} à choisir
          </div>
          <div class="tc-opts">
            <button
              v-for="t in offered"
              :key="t.code"
              class="tc-opt"
              @click="doChooseTalent(t.code)"
            >
              <span class="tc-emo">{{ t.icon }}</span>
              <span class="tc-name font-display">{{ t.name }}</span>
              <span class="tc-desc">{{ t.desc }}</span>
            </button>
          </div>
        </div>
        <div v-if="char.row.talents.length" class="talents-list">
          <span v-for="(code, i) in char.row.talents" :key="i" class="talent-badge">
            {{ talentByCode(code)?.icon }} {{ talentByCode(code)?.name }}
          </span>
          <button class="reset-btn" :disabled="char.row.gold < resetCost" @click="doResetTalents">
            ↺ Réinitialiser 🪙{{ resetCost }}
          </button>
        </div>
        <div v-if="!char.row.talents.length && talentPoints === 0" class="talents-empty">
          Prochain talent au niveau {{ nextTalentLevel }}.
        </div>

        <div class="sec-title">Équipement</div>
        <div class="gear">
          <div
            v-for="slot in SLOTS"
            :key="slot"
            class="slot"
            :class="char.row.equipped[slot] ? 'r-' + char.row.equipped[slot]!.rarity : 'empty'"
          >
            <span class="slot-emo">{{ SLOT_EMOJI[slot] }}</span>
            <div class="slot-main">
              <div class="slot-lbl">
                {{ SLOT_LABEL[slot] }}
                <span v-if="char.row.equipped[slot]" class="slot-nv"
                  >Nv {{ char.row.equipped[slot]!.level }}</span
                >
              </div>
              <template v-if="char.row.equipped[slot]">
                <div class="slot-name">{{ char.row.equipped[slot]!.name }}</div>
                <div class="slot-eff">
                  {{ effectLabel(char.row.equipped[slot]!.effect, char.row.equipped[slot]!.level) }}
                </div>
                <div class="slot-actions">
                  <button
                    class="up-btn"
                    :disabled="!canUpgrade(char.row.equipped[slot]!, char.row.dust, c.level.level)"
                    @click="doUpgrade(char.row.equipped[slot]!.id)"
                  >
                    <template v-if="char.row.equipped[slot]!.level >= c.level.level">max</template>
                    <template v-else
                      >⬆
                      {{
                        upgradeCost(char.row.equipped[slot]!.level, char.row.equipped[slot]!.rarity)
                      }}
                      ✨</template
                    >
                  </button>
                  <button class="link-btn" @click="doUnequip(slot)">retirer</button>
                </div>
              </template>
              <div v-else class="slot-vide">vide</div>
            </div>
          </div>
        </div>

        <template v-if="char.row.inventory.length">
          <div class="sec-title">Sac ({{ char.row.inventory.length }})</div>
          <div class="inv">
            <div
              v-for="it in char.row.inventory"
              :key="it.id"
              class="inv-item"
              :class="'r-' + it.rarity"
            >
              <span class="inv-emo">{{ it.emoji }}</span>
              <div class="inv-main">
                <div class="inv-name">
                  {{ it.name }} <span class="inv-nv">Nv {{ it.level }}</span>
                </div>
                <div class="inv-eff">
                  {{ SLOT_LABEL[it.slot] }} · {{ effectLabel(it.effect, it.level) }}
                </div>
                <div class="inv-actions">
                  <button class="equip-btn" @click="doEquip(it.id)">Équiper</button>
                  <button class="link-btn" @click="doSalvage(it)">
                    Casser ✨{{ salvageValue(it) }}
                  </button>
                  <button class="link-btn" @click="doSell(it)">Vendre 🪙{{ sellValue(it) }}</button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="foot">
          <b>Chaque séance fait progresser ton aventurier.</b> Les stats viennent du sport ;
          l'énergie aussi. L'équipement, lui, ne donne pas de stats mais des <b>effets</b> (vol de
          vie, réduction de dégâts, or…) → à toi de composer ton style.
        </div>
      </template>

      <!-- ONGLET DONJONS -->
      <template v-else-if="tab === 'donjons'">
        <div v-if="run" class="result" :class="run.cleared ? 'win' : 'lose'">
          <div class="result-head">
            <span>{{ run.cleared ? '🏆 Donjon nettoyé' : '💀 Échec' }} — {{ run.name }}</span>
            <span class="result-gold">+{{ run.gold }} 🪙 · +{{ run.dust }} ✨</span>
          </div>
          <div class="result-sub">
            {{ run.defeated }}/{{ run.total }} monstres vaincus · PV restants {{ run.finalPv }}
          </div>
          <div class="log">
            <div
              v-for="(f, i) in run.fights"
              :key="i"
              class="fight-row"
              :class="f.win ? 'fw' : 'fl'"
            >
              <span class="fr-emo">{{ f.emoji }}</span>
              <span class="fr-name">{{ f.monster }}</span>
              <span class="fr-out">{{ f.win ? 'vaincu' : 'tu es tombé' }}</span>
              <span class="fr-rounds">{{ f.rounds }} tours</span>
            </div>
          </div>
          <div v-if="run.drops.length" class="drops">
            <div class="drops-lbl">✨ Butin</div>
            <div v-for="d in run.drops" :key="d.id" class="drop" :class="'r-' + d.rarity">
              <span class="inv-emo">{{ d.emoji }}</span>
              <div class="inv-main">
                <div class="inv-name">
                  {{ d.name }} <span class="rarity">{{ RARITY_LABEL[d.rarity] }}</span>
                </div>
                <div class="inv-eff">{{ SLOT_LABEL[d.slot] }} · {{ effectLabel(d.effect) }}</div>
              </div>
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
      </template>

      <!-- ONGLET BOSS COMMUNAUTAIRE -->
      <template v-else>
        <div v-if="!wboss.boss" class="talents-empty">Chargement du boss de la semaine…</div>
        <template v-else>
          <div class="boss-card" :class="{ dead: wboss.boss.status === 'defeated' }">
            <div class="boss-top">
              <span class="boss-emo">{{ wboss.boss.emoji }}</span>
              <div>
                <div class="boss-name font-display">{{ wboss.boss.name }}</div>
                <div class="boss-sub">Boss communautaire · {{ weekLeft }}</div>
              </div>
            </div>
            <div class="boss-hpbar">
              <span :style="{ width: hpPct + '%' }" />
            </div>
            <div class="boss-hptext font-display">
              {{ wboss.boss.hp_remaining.toLocaleString('fr-FR') }} /
              {{ wboss.boss.hp_total.toLocaleString('fr-FR') }} PV
            </div>

            <div v-if="wboss.boss.status === 'defeated'" class="boss-dead">
              🏆 Boss vaincu par la communauté !
              <button v-if="canClaim" class="fight q-mt-sm" :disabled="busy" @click="claimBoss">
                Réclamer ma récompense
              </button>
              <div v-else-if="myContribution" class="talents-empty">Récompense déjà réclamée.</div>
            </div>
            <button
              v-else
              class="fight full-width q-mt-sm"
              :disabled="c.energy < BOSS_HIT_ENERGY || busy"
              @click="hitBoss"
            >
              ⚔️ Frapper ({{ BOSS_HIT_ENERGY }} ⚡ → {{ combatPowerVal }} dégâts)
            </button>
          </div>

          <div class="sec-title">Contributeurs</div>
          <div v-if="!wboss.contributions.length" class="talents-empty">
            Personne n'a encore frappé. Sois le premier !
          </div>
          <div v-else class="ladder">
            <div
              v-for="(ct, i) in wboss.contributions"
              :key="ct.user_id"
              class="ladder-row"
              :class="{ me: ct.user_id === myUid }"
            >
              <span class="lad-rank">{{ i + 1 }}</span>
              <span class="lad-name">{{ ct.pseudo }}</span>
              <span class="lad-dmg">{{ ct.damage.toLocaleString('fr-FR') }}</span>
            </div>
          </div>
          <div class="foot">
            Chaque frappe coûte de l'énergie (gagnée en faisant du sport) et inflige ta
            <b>puissance de combat</b>. Toute la communauté tape le même boss ; s'il tombe avant la
            fin de semaine, chaque contributeur récupère une récompense (bonus au plus actif).
          </div>
        </template>
      </template>
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
import { simulateDungeon, mulberry32, combatPower } from '@/lib/combat';
import { MONSTERS } from '@/data/monsters';
import { DUNGEONS, dungeonFoes, dungeonGold, type Dungeon } from '@/data/dungeons';
import {
  playerWithGear,
  aggregateEffects,
  rollDrop,
  effectLabel,
  canUpgrade,
  upgradeCost,
  salvageValue,
  sellValue,
  SLOTS,
  SLOT_LABEL,
  SLOT_EMOJI,
  RARITY_LABEL,
  type Item,
  type ItemSlot,
} from '@/lib/items';
import { talentsEarned, talentEffects, talentChoices, talentByCode } from '@/lib/talents';
import { useWorldBossStore } from '@/stores/worldBoss';
import { BOSS_HIT_ENERGY } from '@/data/worldBoss';

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
  dust: number;
  finalPv: number;
  fights: RunFight[];
  drops: Item[];
}

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const wboss = useWorldBossStore();

const loading = ref(true);
const saving = ref(false);
const pseudoInput = ref('');
const pseudoError = ref('');
const tab = ref<'perso' | 'donjons' | 'boss'>('perso');

const myUid = computed(() => auth.user?.id);
const myContribution = computed(() => wboss.contributions.find((ct) => ct.user_id === myUid.value));
const canClaim = computed(
  () =>
    wboss.boss?.status === 'defeated' && !!myContribution.value && !myContribution.value.claimed,
);
const hpPct = computed(() =>
  wboss.boss ? Math.round((wboss.boss.hp_remaining / wboss.boss.hp_total) * 100) : 0,
);
const weekLeft = computed(() => {
  if (!wboss.boss) return '';
  const days = Math.max(0, Math.ceil((Date.parse(wboss.boss.week_end) - Date.now()) / 86400000));
  return days <= 1 ? 'dernier jour' : `${days} j restants`;
});

async function hitBoss() {
  const uid = auth.user?.id;
  if (!uid || !char.row || busy.value || c.value.energy < BOSS_HIT_ENERGY) return;
  busy.value = true;
  try {
    await char.spendEnergy(uid, BOSS_HIT_ENERGY);
    await wboss.hit(combatPowerVal.value, char.row.pseudo);
  } catch {
    $q.notify({ type: 'negative', message: 'Frappe impossible.' });
  } finally {
    busy.value = false;
  }
}
async function claimBoss() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const r = await wboss.claim();
    if (r) {
      await char.fetchMine();
      $q.notify({
        type: 'positive',
        message: `Récompense : +${r.gold} 🪙 · +${r.dust} ✨${r.top ? ' (top contributeur !)' : ''}`,
      });
    }
  } catch {
    $q.notify({ type: 'negative', message: 'Impossible de réclamer.' });
  } finally {
    busy.value = false;
  }
}

const c = computed(() =>
  computeCharacter(
    progress.muscuXp.value,
    progress.cardioXp.value,
    progress.energyEarned.value,
    char.row?.energy_spent ?? 0,
  ),
);
// Effets cumulés des talents choisis.
const talentFx = computed(() => talentEffects(char.row?.talents ?? []));
// Combattant complet (stats + équipement + talents) → puissance de combat affichée.
const fighter = computed(() =>
  playerWithGear(char.row?.pseudo ?? 'Toi', c.value, char.row?.equipped ?? {}, talentFx.value),
);
const combatPowerVal = computed(() => combatPower(fighter.value));
const profileLabel = computed(() => PROFILE_LABEL[c.value.profile]);
// PV bonus (équipement + talents) — affiché à titre indicatif.
const bonusPv = computed(() => {
  if (!char.row) return 0;
  const pct = aggregateEffects(char.row.equipped).maxPvPct + talentFx.value.maxPvPct;
  return Math.round(c.value.pv * pct);
});

// Talents : combien à choisir, et les 3 proposés pour le prochain choix.
const talentPoints = computed(() =>
  char.row ? talentsEarned(c.value.level.level) - char.row.talents.length : 0,
);
const offered = computed(() => talentChoices(char.row?.talents.length ?? 0));
const nextTalentLevel = computed(() => (talentsEarned(c.value.level.level) + 1) * 5);

async function doChooseTalent(code: string) {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    await char.chooseTalent(uid, code, talentsEarned(c.value.level.level));
    $q.notify({ type: 'positive', message: 'Talent acquis !' });
  } catch {
    $q.notify({ type: 'negative', message: 'Impossible de choisir ce talent.' });
  }
}

function barW(v: number): string {
  const max = Math.max(c.value.puissance, c.value.endurance, c.value.agilite, 1);
  return `${Math.round((v / max) * 100)}%`;
}

const busy = ref(false);
const run = ref<RunView | null>(null);

async function explore(d: Dungeon) {
  const uid = auth.user?.id;
  if (!uid || !char.row || busy.value || c.value.energy < d.energyCost) return;
  busy.value = true;
  try {
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(char.row.pseudo, c.value, char.row.equipped, talentFx.value);
    const r = simulateDungeon(player, dungeonFoes(d), { seed });
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = Math.round(r.gold * (1 + goldPct));
    // Butin (RNG dérivé du seed du run).
    const dropRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const drops: Item[] = [];
    const rolled = rollDrop(dropRng, {
      playerLevel: c.value.level.level,
      cleared: r.cleared,
      defeated: r.defeated,
    });
    if (rolled) drops.push({ ...rolled, id: crypto.randomUUID() });
    const dust = r.defeated * 2; // petit filet de poussière par run
    await char.applyRun(uid, { energyCost: d.energyCost, gold, dust, drops });
    run.value = {
      name: d.name,
      cleared: r.cleared,
      defeated: r.defeated,
      total: r.total,
      gold,
      dust,
      finalPv: r.finalPv,
      fights: r.fights.map((f) => ({
        monster: f.monster,
        emoji: MONSTERS.find((m) => m.name === f.monster)?.emoji ?? '👾',
        win: f.win,
        rounds: f.result.rounds,
      })),
      drops,
    };
    if (r.cleared) $q.notify({ type: 'positive', message: `Donjon nettoyé — +${gold} 🪙` });
  } catch {
    $q.notify({ type: 'negative', message: 'Échec de l’exploration.' });
  } finally {
    busy.value = false;
  }
}

const resetCost = computed(() => 80 + 40 * (char.row?.talents.length ?? 0));

function withUid(fn: (uid: string) => Promise<unknown>, errMsg: string) {
  const uid = auth.user?.id;
  if (!uid) return;
  fn(uid).catch(() => $q.notify({ type: 'negative', message: errMsg }));
}

function doEquip(itemId: string) {
  withUid((uid) => char.equip(uid, itemId), 'Impossible d’équiper.');
}
function doUnequip(slot: ItemSlot) {
  withUid((uid) => char.unequip(uid, slot), 'Impossible de déséquiper.');
}
function doUpgrade(itemId: string) {
  withUid((uid) => char.upgradeItem(uid, itemId, c.value.level.level), 'Amélioration impossible.');
}
function doSell(it: Item) {
  withUid(
    (uid) =>
      char
        .sell(uid, it.id)
        .then(() => $q.notify({ type: 'positive', message: `+${sellValue(it)} 🪙` })),
    'Vente impossible.',
  );
}
function doSalvage(it: Item) {
  $q.dialog({
    title: 'Casser l’objet',
    message: `« ${it.name} » sera détruit contre ${salvageValue(it)} ✨ de poussière. Continuer ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Casser', color: 'negative' },
  }).onOk(() => withUid((uid) => char.salvage(uid, it.id), 'Recyclage impossible.'));
}
function doResetTalents() {
  $q.dialog({
    title: 'Réinitialiser les talents',
    message: `Tous tes talents seront remis à zéro (tu les rechoisiras) contre ${resetCost.value} 🪙. Continuer ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Réinitialiser', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid(
      (uid) =>
        char
          .resetTalents(uid, resetCost.value)
          .then(() => $q.notify({ type: 'positive', message: 'Talents réinitialisés.' })),
      'Réinitialisation impossible.',
    ),
  );
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
  wboss.refresh().catch(() => undefined);
});
</script>

<style scoped lang="scss">
.adv-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 18px 16px 40px;
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

/* Topbar compacte */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.tb-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.tb-lvl {
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 8px;
  padding: 2px 8px;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.tb-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.tb-right {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.tb-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.tb-chip.gold {
  color: var(--accent);
}
.tb-chip.dust {
  color: #b07cff;
}

/* Onglets */
.seg {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 18px;
}
.seg-b {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.seg-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
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

/* Stats */
.stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 11px 14px;
}
.stat .top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stat .emo {
  font-size: 20px;
  width: 24px;
  text-align: center;
}
.stat .nm {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}
.stat .n {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 6px;
  border-radius: 999px;
  background: #000;
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 8px 0 5px;
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
  margin-bottom: 20px;
}
.pv-line b {
  font-size: 20px;
  color: var(--d1);
}
.pv-bonus {
  color: var(--d1);
  font-size: 11px;
}

/* Héro (anneau + archétype + puissance) */
.hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
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
.hero-info {
  min-width: 0;
}
.hero-arch {
  font-size: 13px;
  color: var(--dim);
}
.hero-arch b {
  color: var(--d1);
  text-transform: capitalize;
  font-weight: 600;
}
.hero-power {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 6px 0 2px;
}
.hp-lbl {
  font-size: 12px;
  color: var(--dim);
}
.hp-val {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.hero-xp {
  font-size: 11px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}

/* Talents */
.talent-choice {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 14px;
}
.tc-head {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--accent);
  margin-bottom: 10px;
}
.tc-opts {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.tc-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 6px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
}
.tc-opt:active {
  transform: scale(0.97);
  border-color: var(--accent);
}
.tc-emo {
  font-size: 22px;
}
.tc-name {
  font-size: 12px;
  font-weight: 600;
}
.tc-desc {
  font-size: 10.5px;
  color: var(--dim);
}
.talents-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.talent-badge {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text);
}
.talents-empty {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 18px;
}

/* Équipement */
.gear {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}
.slot {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
  min-height: 62px;
}
.slot.empty {
  border-style: dashed;
  border-left-color: var(--line);
}
.slot-emo {
  font-size: 20px;
}
.slot-main {
  flex: 1;
  min-width: 0;
}
.slot-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
.slot-nv {
  color: var(--accent);
  font-weight: 700;
}
.slot-actions,
.inv-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}
.up-btn {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 8px;
  padding: 4px 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
}
.up-btn:disabled {
  border-color: var(--line);
  color: var(--dim);
  cursor: not-allowed;
}
.link-btn {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 2px;
}
.link-btn:active {
  color: var(--text);
}
.reset-btn {
  background: none;
  border: 1px solid var(--line);
  color: var(--dim);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.inv-nv {
  font-size: 10px;
  color: var(--accent);
  font-weight: 700;
}
.slot-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-eff {
  font-size: 11px;
  color: var(--dim);
}
.slot-vide {
  font-size: 12px;
  color: var(--dim);
  opacity: 0.7;
}
.slot-x {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  font-size: 13px;
}

/* Sac / inventaire */
.inv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
.inv-item,
.drop {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
}
.inv-emo {
  font-size: 20px;
}
.inv-main {
  flex: 1;
  min-width: 0;
}
.inv-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.inv-eff {
  font-size: 11px;
  color: var(--dim);
}
.rarity {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
}
.equip-btn {
  flex-shrink: 0;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 9px;
  padding: 7px 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}

/* Raretés */
.r-common {
  border-left-color: var(--dim);
}
.r-rare {
  border-left-color: #4ec6d6;
}
.r-rare .rarity {
  color: #4ec6d6;
}
.r-epic {
  border-left-color: #b07cff;
}
.r-epic .rarity {
  color: #b07cff;
}
.r-legendary {
  border-left-color: var(--accent);
}
.r-legendary .rarity {
  color: var(--accent);
}

/* Donjons */
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

/* Résultat de run */
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
  display: flex;
  flex-direction: column;
  gap: 3px;
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
.drops {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drops-lbl {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--accent);
}

/* Boss communautaire */
.boss-card {
  background: linear-gradient(180deg, var(--surface-2, #2b241b), var(--surface));
  border: 1px solid var(--d4);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 18px;
}
.boss-card.dead {
  border-color: var(--d1);
}
.boss-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.boss-emo {
  font-size: 40px;
  line-height: 1;
}
.boss-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.boss-sub {
  font-size: 12px;
  color: var(--dim);
}
.boss-hpbar {
  height: 14px;
  border-radius: 999px;
  background: #000;
  border: 1px solid var(--line);
  overflow: hidden;
}
.boss-hpbar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--d4);
  transition: width 0.3s ease;
}
.boss-card.dead .boss-hpbar > span {
  background: var(--d1);
}
.boss-hptext {
  text-align: center;
  font-size: 13px;
  color: var(--dim);
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.boss-dead {
  text-align: center;
  color: var(--d1);
  font-weight: 600;
  margin-top: 12px;
}
.ladder {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 18px;
}
.ladder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
}
.ladder-row.me {
  border-color: var(--accent);
}
.lad-rank {
  width: 20px;
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lad-name {
  flex: 1;
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lad-dmg {
  color: var(--d4);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
