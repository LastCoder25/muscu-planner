<template>
  <div class="srp">
    <!-- Les emplacements : posés, puis vides en pointillés (ils disent ce qu'on peut encore
         avoir, comme les emplacements de tourelle de la base). -->
    <div class="srp-slots">
      <div
        v-for="(s, i) in cells"
        :key="i"
        class="srp-slot"
        :class="[s ? 't-' + skillTier(s) : 'empty']"
      >
        <template v-if="s">
          <span class="srp-emo">{{ SKILLS[s.id].emoji }}</span>
          <span class="srp-main">
            <span class="srp-name">
              {{ SKILLS[s.id].name }}
              <b class="srp-lvl"
                >Nv {{ skillLevelTag(s.level)
                }}{{
                  isOverclocked(s.level)
                    ? ' · surchargée'
                    : s.level === SKILL_MAX_LEVEL
                      ? ' · max'
                      : ''
                }}</b
              >
            </span>
            <span class="srp-what">{{ skillEffectText(s) }}</span>
          </span>
          <!-- 🌈 Au niveau 5 : passer à la couleur au-dessus. -->
          <button
            v-if="!riseBlocker(s)"
            type="button"
            class="srp-rise"
            :class="'t-' + riseTier(s)"
            :disabled="busy"
            :aria-label="`Élever ${SKILLS[s.id].name}`"
            @click="askRise(s)"
          >
            🌈<small>{{ RUNE_INFO[riseTier(s)].emoji }}</small>
          </button>
          <!-- ↩️ La rendre au stock, niveaux et couleur gardés. -->
          <button
            type="button"
            class="srp-back"
            :disabled="busy"
            :aria-label="`Récupérer ${SKILLS[s.id].name} au stock`"
            title="Récupérer au stock"
            @click="askBack(s)"
          >
            ↩️
          </button>
        </template>
        <span v-else class="srp-free">Emplacement libre</span>
      </div>
    </div>

    <!-- 🪬 On ne pose rien ICI : la compétence se DONNE depuis la tuile Runes du Panthéon.
         ↩️ la rend au stock (v1.253.0). -->
    <p class="srp-note">
      Donne-lui des compétences depuis la tuile 🪬 Runes du Panthéon<template v-if="stock">
        ({{ stock }} au stock)</template
      >. Au niveau 5, une compétence passe d’elle-même à la couleur au-dessus 🌈 ; ↩️ la rend au
      stock.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useGameFx } from '@/composables/useGameFx';
import {
  RUNE_INFO,
  SKILLS,
  SKILL_MAX_LEVEL,
  isOverclocked,
  riseBlocker,
  riseGain,
  riseOf,
  riseTier,
  skillLevelTag,
  skillEffectText,
  skillTier,
  type ChampSkill,
} from '@/lib/skillRunes';
import { advRuneSkills, advSkillSlots, type Adventurer } from '@/lib/adventurers';

/** `stock` : combien de compétences attendent au stock (pour le rappel). */
const props = defineProps<{ adv: Adventurer; stock?: number }>();

const skills = computed(() => advRuneSkills(props.adv));
const slots = computed(() => advSkillSlots(props.adv));
const cells = computed(() =>
  Array.from(
    { length: Math.max(slots.value, skills.value.length) },
    (_, i) => skills.value[i] ?? null,
  ),
);

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const gameFx = useGameFx();
const busy = ref(false);

/** 🌈 L'élévation ne se défait pas : on dit ce qu'elle change (surcharge perdue comprise). */
function askRise(s: ChampSkill) {
  if (riseBlocker(s)) return;
  const to = RUNE_INFO[riseTier(s)];
  const lost = isOverclocked(s.level)
    ? ' Elle perd sa surcharge ⚡ (le lapidaire pourra la surcharger à nouveau au niveau 5).'
    : '';
  $q.dialog({
    title: `Élever ${SKILLS[s.id].name} ?`,
    message: `${props.adv.name} : elle devient ${to.label.replace('Rune ', '')} ${to.emoji}, niveau 1 — ${riseGain(s)}.${lost}`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: '🌈 Élever', color: 'positive' },
  }).onOk(() => void rise(s));
}

/** ↩️ Rendre au stock : sans question, sauf une surchargée (le stock ne garde pas le ⚡). */
function askBack(s: ChampSkill) {
  if (!isOverclocked(s.level)) return void takeBack(s);
  $q.dialog({
    title: `Récupérer ${SKILLS[s.id].name} ?`,
    message: `Elle revient au stock au niveau ${SKILL_MAX_LEVEL}, sans sa surcharge ⚡.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: '↩️ Récupérer', color: 'negative' },
  }).onOk(() => void takeBack(s));
}

async function takeBack(s: ChampSkill) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const r = await char.takeBackRuneSkill(uid, props.adv.id, s.id);
    if (!r.ok) throw new Error(r.reason);
    $q.notify({
      type: 'positive',
      message: `↩️ ${SKILLS[s.id].name} ${RUNE_INFO[skillTier(r.skill)].emoji} Nv ${r.skill.level} revient au stock`,
    });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    busy.value = false;
  }
}

async function rise(s: ChampSkill) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const r = await char.riseChampionSkill(uid, props.adv.id, s.id);
    if (!r.ok) throw new Error(r.reason);
    gameFx.celebrateRune('rise', s.id, props.adv.name, 1, riseOf(r.skill));
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.srp-slots {
  display: grid;
  gap: 6px;
}
.srp-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid var(--tier, var(--line));
}
.srp-slot.empty {
  border-style: dashed;
  justify-content: center;
}
.srp-free {
  color: var(--dim);
  font-size: 13px;
}
.srp-emo {
  font-size: 22px;
}
.srp-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.srp-rise {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--tier, var(--accent));
  background: color-mix(in srgb, var(--tier, var(--accent)) 16%, transparent);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
}
.srp-back {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: transparent;
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.srp-back:disabled {
  opacity: 0.5;
}
.srp-rise small {
  font-size: 11px;
}
.srp-rise:disabled {
  opacity: 0.5;
}
.srp-name {
  font-weight: 600;
  font-size: 14px;
}
.srp-lvl {
  margin-left: 6px;
  font-size: 12px;
  color: var(--tier, var(--accent));
}
.srp-what {
  font-size: 12.5px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.t-green {
  --tier: #7bc86c;
}
.t-blue {
  --tier: #5aa9ff;
}
.t-violet {
  --tier: #b98cff;
}
.t-gold {
  --tier: #ffb23f;
}
.srp-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
