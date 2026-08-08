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
          <span class="tb-chip" :class="{ deficit: c.energy < 0 }">⚡ {{ c.energy }}</span>
          <button class="tb-chip gold shop-btn" aria-label="Boutique" @click="shopOpen = true">
            🪙 {{ char.row.gold }} <q-icon name="storefront" size="14px" />
          </button>
          <span class="tb-chip dust">✨ {{ char.row.dust }}</span>
        </div>
      </div>

      <div v-if="c.energy < 0" class="deficit-banner">
        ⚠️ Déficit d'énergie ({{ c.energy }} ⚡) — refais du sport pour regagner de l'énergie avant
        de rejouer.
      </div>

      <button
        v-if="loginClaimable"
        class="login-card"
        :disabled="claimingLogin"
        @click="claimLogin"
      >
        <span class="lc-emo">🎁</span>
        <div class="lc-main">
          <div class="lc-title font-display">Récompense du jour</div>
          <div class="lc-sub">
            🔥 {{ loginPreview.streak }} j de suite · gagne
            <b>+{{ loginPreview.energy }} ⚡</b>
          </div>
        </div>
        <span class="lc-cta font-display">Récupérer</span>
      </button>

      <div class="seg">
        <button class="seg-b" :class="{ on: tab === 'perso' }" @click="tab = 'perso'">
          <q-icon name="person" size="18px" /> Perso
        </button>
        <button class="seg-b" :class="{ on: tab === 'equip' }" @click="tab = 'equip'">
          <q-icon name="checkroom" size="18px" /> Équip.
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

        <div class="foot">
          <b>Chaque séance fait progresser ton aventurier.</b> Les stats et le niveau viennent du
          sport. La connexion quotidienne, elle, ne donne qu'un peu d'énergie pour jouer.
        </div>
      </template>

      <!-- ONGLET ÉQUIPEMENT -->
      <template v-else-if="tab === 'equip'">
        <div class="sec-title">Équipement</div>
        <div class="gear">
          <div
            v-for="slot in SLOTS"
            :key="slot"
            class="slot"
            :class="char.row.equipped[slot] ? 'r-' + char.row.equipped[slot]!.rarity : 'empty'"
          >
            <div class="slot-head">
              <span class="slot-emo">{{ SLOT_EMOJI[slot] }}</span>
              <span class="slot-lbl">{{ SLOT_LABEL[slot] }}</span>
              <span v-if="char.row.equipped[slot]" class="slot-nv"
                >Nv {{ char.row.equipped[slot]!.level }}</span
              >
            </div>
            <template v-if="char.row.equipped[slot]">
              <div class="slot-name">{{ char.row.equipped[slot]!.name }}</div>
              <div class="rarity slot-rarity">
                {{ RARITY_LABEL[char.row.equipped[slot]!.rarity] }}
              </div>
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

        <!-- Sets d'équipement (bonus 2/3/4 pièces) -->
        <template v-if="activeSets.length">
          <div class="sec-title">Sets</div>
          <div v-for="s in activeSets" :key="s.id" class="setcard" :class="{ full: s.count >= 4 }">
            <div class="set-top">
              <span class="set-name">{{ s.emoji }} {{ s.name }}</span>
              <span class="set-count font-display">{{ s.count }}/4</span>
            </div>
            <div class="set-theme">{{ s.theme }}</div>
            <div class="set-tiers">
              <span
                v-for="t in s.tiers"
                :key="t.pieces"
                class="set-tier"
                :class="{ on: s.count >= t.pieces }"
              >
                {{ t.pieces }} pièces : {{ t.label }}
              </span>
            </div>
          </div>
        </template>

        <template v-if="char.row.inventory.length">
          <div ref="sacTitle" class="sec-title">Sac ({{ char.row.inventory.length }})</div>
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
                  {{ it.name }} <span class="rarity">{{ RARITY_LABEL[it.rarity] }}</span>
                  <span class="inv-nv">Nv {{ it.level }}</span>
                </div>
                <div class="inv-eff">
                  {{ SLOT_LABEL[it.slot] }} · {{ effectLabel(it.effect, it.level) }}
                </div>
                <div class="inv-actions">
                  <button class="equip-btn" @click="doEquip(it.id)">
                    {{ equippedInSlot(it.slot) ? 'Remplacer' : 'Équiper' }}
                  </button>
                  <button class="link-btn" @click="doSalvage(it)">
                    Casser ✨{{ salvageValue(it) }}
                  </button>
                  <button class="link-btn" @click="doSell(it)">Vendre 🪙{{ sellValue(it) }}</button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-inv">
          Ton sac est vide. Explore un donjon pour trouver du butin 🗡️
        </div>

        <div class="foot">
          L'équipement ne donne pas de stats (elles viennent du sport) mais des <b>effets</b> — vol
          de vie, réduction de dégâts, or… → à toi de composer ton style.
        </div>
      </template>

      <!-- ONGLET DONJONS -->
      <template v-else-if="tab === 'donjons'">
        <!-- Rapport de combat : au-dessus des donjons, bouton « Réattaquer » en TÊTE
             (position stable) → on réenchaîne sans que le butin variable décale le bouton. -->
        <div v-if="run" class="report" :class="run.cleared ? 'win' : 'lose'">
          <div class="report-head">
            <span class="report-title font-display">📋 Rapport de combat</span>
            <button
              v-if="lastDungeon"
              class="reattack"
              :disabled="c.energy < lastDungeon.energyCost || busy"
              @click="explore(lastDungeon)"
            >
              ⚔️ Réattaquer {{ lastDungeon.name }} ({{ lastDungeon.energyCost }} ⚡)
            </button>
          </div>
          <div class="result-head">
            <span>{{ run.cleared ? '🏆 Donjon nettoyé' : '💀 Échec' }} — {{ run.name }}</span>
            <span class="result-gold">+{{ run.gold }} 🪙 · +{{ run.dust }} ✨</span>
          </div>
          <div class="result-sub">
            {{ run.defeated }}/{{ run.total }} monstres vaincus · PV restants {{ run.finalPv }}
          </div>
          <button class="report-toggle" @click="reportOpen = !reportOpen">
            {{ reportOpen ? '▴ Masquer le détail' : '▾ Voir le détail du combat' }}
          </button>
          <div v-if="reportOpen" class="log">
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
                <div class="inv-eff">
                  {{ SLOT_LABEL[d.slot] }} · {{ effectLabel(d.effect, d.level) }}
                </div>
                <div v-if="equippedInSlot(d.slot)" class="drop-cmp">
                  <span
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(d.slot)!.rarity] }} Nv
                    {{ equippedInSlot(d.slot)!.level }}
                    ·
                    {{
                      effectLabel(equippedInSlot(d.slot)!.effect, equippedInSlot(d.slot)!.level)
                    }}</span
                  >
                  <span class="rarity-verdict" :class="rarityVerdict(d).cls">{{
                    rarityVerdict(d).label
                  }}</span>
                </div>
                <div v-else class="drop-cmp">
                  <span class="rarity-verdict up">slot libre</span>
                </div>
                <div v-if="dropState(d) === 'equipped'" class="drop-done">⚔️ Équipé</div>
                <div v-else-if="dropState(d) === 'gone'" class="drop-done">✓ Retiré du sac</div>
                <div v-else class="inv-actions">
                  <button class="equip-btn" @click="doEquip(d.id)">
                    {{ equippedInSlot(d.slot) ? 'Remplacer' : 'Équiper' }}
                  </button>
                  <button class="link-btn" @click="doSalvage(d)">
                    Casser ✨{{ salvageValue(d) }}
                  </button>
                  <button class="link-btn" @click="doSell(d)">Vendre 🪙{{ sellValue(d) }}</button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="run.consumable" class="cons-drop">
            {{ run.consumable.emoji }} <b>{{ run.consumable.name }}</b> ajouté à ton sac de
            consommables 🎒
          </div>
        </div>

        <!-- Consommables à utiliser pour le prochain run -->
        <div v-if="ownedConsumables.length" class="consum">
          <div class="consum-lbl">Utiliser pour ce donjon</div>
          <div class="consum-row">
            <button
              v-for="ic in ownedConsumables"
              :key="ic.id"
              class="consum-chip"
              :class="{ on: selectedConsumables.includes(ic.id) }"
              @click="toggleConsumable(ic.id)"
            >
              {{ ic.emoji }} {{ ic.name }} ×{{ char.row.consumables[ic.id] }}
            </button>
          </div>
        </div>

        <div class="dungeons">
          <div
            v-for="d in DUNGEONS"
            :key="d.id"
            class="dgn"
            :class="{ locked: !dungeonUnlocked(d) }"
          >
            <span class="dgn-emo">{{ dungeonUnlocked(d) ? d.emoji : '🔒' }}</span>
            <div class="dgn-main">
              <div class="dgn-top">
                <span class="dgn-name font-display">{{ d.name }}</span>
                <span class="dgn-gold">+{{ dungeonGold(d) }} 🪙</span>
              </div>
              <div class="dgn-stats">
                {{ d.monsterIds.length }} monstres · coûte {{ d.energyCost }} ⚡ · conseillé niv.
                {{ d.recoLevel }}
              </div>
              <div v-if="dungeonUnlocked(d)" class="dgn-hint">{{ d.hint }}</div>
              <div v-else class="dgn-hint dgn-lock">
                🔒 Nettoie d’abord « {{ prevDungeonName(d) }} » pour débloquer ce donjon.
              </div>
            </div>
            <button
              v-if="dungeonUnlocked(d)"
              class="fight"
              :disabled="c.energy < d.energyCost || busy"
              @click="explore(d)"
            >
              Explorer
            </button>
            <button v-else class="fight" disabled>Verrouillé</button>
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

    <!-- Modale : casser un objet → poussière -->
    <transition name="salv-fade">
      <div v-if="salvageTarget" class="salv-backdrop" @click.self="salvageTarget = null">
        <div class="salv-card" :class="'r-' + salvageTarget.rarity">
          <div class="salv-title font-display">Casser cet objet ?</div>
          <div class="salv-item">
            <span class="salv-emo">{{ salvageTarget.emoji }}</span>
            <div class="salv-main">
              <div class="salv-name">
                {{ salvageTarget.name }}
                <span class="rarity"
                  >{{ RARITY_LABEL[salvageTarget.rarity] }} · Nv {{ salvageTarget.level }}</span
                >
              </div>
              <div class="salv-eff">
                {{ SLOT_LABEL[salvageTarget.slot] }} ·
                {{ effectLabel(salvageTarget.effect, salvageTarget.level) }}
              </div>
            </div>
          </div>
          <div class="salv-reward">
            <span class="salv-plus font-display">+{{ salvageValue(salvageTarget) }}</span>
            <span class="salv-dust">✨ poussière d'évolution</span>
          </div>
          <div class="salv-warn">Objet détruit définitivement (poussière investie remboursée).</div>
          <div class="salv-actions">
            <button class="salv-cancel" @click="salvageTarget = null">Annuler</button>
            <button class="salv-break" @click="confirmSalvage">Casser</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Animation : récompense de connexion -->
    <transition name="lb-fade">
      <div v-if="loginBurst" class="lb-backdrop" @click="loginBurst = null">
        <div class="lb-card">
          <span class="lb-wave" aria-hidden="true" />
          <span class="lb-bolt">⚡</span>
          <div class="lb-energy font-display">+{{ loginBurst.energy }}</div>
          <div class="lb-lbl">énergie de connexion</div>
          <div class="lb-streak">
            🔥 {{ loginBurst.streak }} jour{{ loginBurst.streak > 1 ? 's' : '' }} d'affilée
          </div>
          <div v-if="loginBurst.usedGrace" class="lb-grace">🛟 jour manqué rattrapé (grâce)</div>
        </div>
      </div>
    </transition>

    <!-- Boutique : dépenser l'or -->
    <transition name="salv-fade">
      <div v-if="shopOpen && char.row" class="shop-backdrop" @click.self="shopOpen = false">
        <div class="shop-card">
          <div class="shop-head">
            <div class="shop-title font-display">Boutique</div>
            <span class="shop-gold">🪙 {{ char.row.gold }}</span>
            <button class="shop-x" aria-label="Fermer" @click="shopOpen = false">✕</button>
          </div>
          <div class="shop-list">
            <div v-for="it in SHOP_ITEMS" :key="it.id" class="shop-item">
              <span class="si-emo">{{ it.emoji }}</span>
              <div class="si-main">
                <div class="si-name">
                  {{ it.name }}
                  <span
                    v-if="it.kind === 'consumable' && (char.row.consumables[it.id] ?? 0) > 0"
                    class="si-own"
                    >×{{ char.row.consumables[it.id] }}</span
                  >
                </div>
                <div class="si-desc">{{ it.desc }}</div>
              </div>
              <button class="si-buy" :disabled="char.row.gold < it.cost" @click="buy(it)">
                🪙 {{ it.cost }}
              </button>
            </div>
          </div>
          <div class="shop-hint">
            Les consommables s'utilisent au lancement d'un donjon (onglet Donjons).
          </div>
        </div>
      </div>
    </transition>
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
  RARITY_RANK,
  ITEM_SETS,
  setCounts,
  type Item,
  type ItemSlot,
  type AggregatedEffects,
} from '@/lib/items';
import {
  SHOP_ITEMS,
  CONSUMABLE_ITEMS,
  consumableEffect,
  rollConsumableDrop,
  shopItem,
} from '@/data/shop';
import { talentsEarned, talentEffects, talentChoices, talentByCode } from '@/lib/talents';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import { logicalToday } from '@/lib/challenges';
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
  consumable?: { emoji: string; name: string };
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
const tab = ref<'perso' | 'equip' | 'donjons' | 'boss'>('perso');

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
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    // énergie = sport de fond + bonus de connexion cumulé.
    progress.energyEarned.value + (char.row?.login_energy ?? 0),
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

// ── Récompense de connexion quotidienne ──
const today = logicalToday();
const loginClaimable = computed(() => {
  const r = char.row;
  if (!r) return false;
  return !r.last_login_date || daysBetweenIso(r.last_login_date, today) >= 1;
});
// Aperçu de ce que rapportera le claim du jour (streak + énergie).
const loginPreview = computed(() => {
  const r = char.row;
  const gap = r?.last_login_date ? daysBetweenIso(r.last_login_date, today) : 999;
  const prev = r?.last_login_date
    ? { streak: r.login_streak, graceUsed: r.login_grace_used }
    : null;
  const next = advanceStreak(prev, gap);
  return { streak: next.streak, energy: dailyLoginEnergy(next.streak, c.value.level.level) };
});
const claimingLogin = ref(false);
const loginBurst = ref<{ streak: number; energy: number; usedGrace: boolean } | null>(null);
async function claimLogin() {
  const uid = auth.user?.id;
  if (!uid || claimingLogin.value || !loginClaimable.value) return;
  claimingLogin.value = true;
  try {
    const r = await char.claimDailyLogin(uid, today, c.value.level.level);
    if (r) {
      loginBurst.value = r;
      setTimeout(() => (loginBurst.value = null), 2600);
    }
  } catch {
    $q.notify({ type: 'negative', message: 'Récompense indisponible.' });
  } finally {
    claimingLogin.value = false;
  }
}
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
const lastDungeon = ref<Dungeon | null>(null); // pour « Réattaquer » depuis le rapport
const reportOpen = ref(false); // détail du combat repliable (bouton)
const sacTitle = ref<HTMLElement | null>(null);

// ── Boutique & consommables ──
const shopOpen = ref(false);
const selectedConsumables = ref<string[]>([]);
const ownedConsumables = computed(() =>
  CONSUMABLE_ITEMS.filter((i) => (char.row?.consumables[i.id] ?? 0) > 0),
);
function toggleConsumable(id: string) {
  const i = selectedConsumables.value.indexOf(id);
  if (i >= 0) selectedConsumables.value.splice(i, 1);
  else selectedConsumables.value.push(id);
}
// Effets cumulés (talents + consommables sélectionnés) + chance de butin pour le run.
function runExtra(): { extra: AggregatedEffects; lucky: boolean } {
  const extra = { ...talentFx.value };
  let lucky = false;
  for (const id of selectedConsumables.value) {
    const e = consumableEffect(id);
    if (e.lucky) lucky = true;
    if (e.extra) {
      extra.damagePct += e.extra.damagePct ?? 0;
      extra.maxPvPct += e.extra.maxPvPct ?? 0;
      extra.critAdd += e.extra.critAdd ?? 0;
      extra.dodgeAdd += e.extra.dodgeAdd ?? 0;
      extra.dmgReduction += e.extra.dmgReduction ?? 0;
      extra.lifesteal += e.extra.lifesteal ?? 0;
      extra.goldPct += e.extra.goldPct ?? 0;
    }
  }
  return { extra, lucky };
}
async function buy(item: (typeof SHOP_ITEMS)[number]) {
  const uid = auth.user?.id;
  if (!uid) return;
  if ((char.row?.gold ?? 0) < item.cost) {
    $q.notify({ type: 'warning', message: "Pas assez d'or." });
    return;
  }
  try {
    const ok = await char.buyItem(uid, item);
    if (ok) $q.notify({ type: 'positive', message: `${item.emoji} ${item.name} acheté !` });
  } catch {
    $q.notify({ type: 'negative', message: 'Achat impossible.' });
  }
}

// Butin géré directement dans la carte de résultat (pas de va-et-vient vers le sac).
// État d'un objet lâché, calculé en direct depuis le perso (source de vérité).
function dropState(it: Item): 'bag' | 'equipped' | 'gone' {
  const r = char.row;
  if (!r) return 'gone';
  if (r.inventory.some((i) => i.id === it.id)) return 'bag';
  if (SLOTS.some((s) => r.equipped[s]?.id === it.id)) return 'equipped';
  return 'gone';
}
// Objet actuellement équipé dans le slot d'un drop → comparaison sur place.
function equippedInSlot(slot: ItemSlot): Item | undefined {
  return char.row?.equipped[slot];
}
// Sets d'équipement en cours (≥1 pièce), avec libellés des paliers scalés au niv. moyen.
const activeSets = computed(() => {
  const eq = char.row?.equipped ?? {};
  const counts = setCounts(eq);
  return ITEM_SETS.filter((s) => (counts[s.id] ?? 0) >= 1).map((s) => {
    const pieces = SLOTS.map((sl) => eq[sl]).filter((it): it is Item => it?.setId === s.id);
    const avg = pieces.length
      ? Math.round(pieces.reduce((a, it) => a + it.level, 0) / pieces.length)
      : 1;
    return {
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      theme: s.theme,
      count: counts[s.id] ?? 0,
      tiers: s.tiers.map((t) => ({
        pieces: t.pieces,
        label: effectLabel({ type: t.type, value: t.base }, avg),
      })),
    };
  });
});
// Verdict de rareté du drop vs l'objet équipé (potentiel long terme : la rareté
// fixe la magnitude de base, la poussière fait ensuite monter le niveau).
function rarityVerdict(d: Item): { label: string; cls: string } {
  const eq = equippedInSlot(d.slot);
  if (!eq) return { label: 'slot libre', cls: 'up' };
  const diff = RARITY_RANK[d.rarity] - RARITY_RANK[eq.rarity];
  if (diff > 0) return { label: '↑ rareté supérieure', cls: 'up' };
  if (diff < 0) return { label: '↓ rareté inférieure', cls: 'down' };
  return { label: '≈ même rareté', cls: 'same' };
}

// Progression séquentielle : un donjon n'est déblocable qu'après avoir nettoyé
// le précédent. Le premier est toujours ouvert.
const clearedSet = computed(() => new Set(char.row?.cleared_dungeons ?? []));
function dungeonUnlocked(d: Dungeon): boolean {
  const i = DUNGEONS.findIndex((x) => x.id === d.id);
  const prev = i > 0 ? DUNGEONS[i - 1] : undefined;
  return !prev || clearedSet.value.has(prev.id);
}
function prevDungeonName(d: Dungeon): string {
  const i = DUNGEONS.findIndex((x) => x.id === d.id);
  return (i > 0 ? DUNGEONS[i - 1]?.name : '') ?? '';
}

async function explore(d: Dungeon) {
  const uid = auth.user?.id;
  if (!uid || !char.row || busy.value || c.value.energy < d.energyCost) return;
  if (!dungeonUnlocked(d)) return;
  lastDungeon.value = d;
  busy.value = true;
  try {
    // Consommables sélectionnés pour ce run (buffs + chance de butin).
    const consumed = [...selectedConsumables.value];
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(char.row.pseudo, c.value, char.row.equipped, extra);
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
      level: d.dropLevel,
      luck: Math.min(1, d.dropLuck + (lucky ? 0.5 : 0)),
      ...(d.setId && d.setChance ? { set: { id: d.setId, chance: d.setChance } } : {}),
    });
    if (rolled) drops.push({ ...rolled, id: crypto.randomUUID() });
    // Butin consommable (en plus de l'équipement).
    const consDropId = rollConsumableDrop(dropRng, r.cleared);
    const consDrop = consDropId ? shopItem(consDropId) : undefined;
    const dust = r.defeated * 2; // petit filet de poussière par run
    await char.applyRun(uid, {
      energyCost: d.energyCost,
      gold,
      dust,
      drops,
      ...(r.cleared ? { clearedDungeonId: d.id } : {}),
      ...(consumed.length ? { consumed } : {}),
      ...(consDropId ? { gained: [consDropId] } : {}),
    });
    selectedConsumables.value = []; // consommés
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
      ...(consDrop ? { consumable: { emoji: consDrop.emoji, name: consDrop.name } } : {}),
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
const salvageTarget = ref<Item | null>(null);
function doSalvage(it: Item) {
  salvageTarget.value = it;
}
function confirmSalvage() {
  const it = salvageTarget.value;
  if (!it) return;
  salvageTarget.value = null;
  withUid(
    (uid) =>
      char
        .salvage(uid, it.id)
        .then(() => $q.notify({ type: 'positive', message: `+${salvageValue(it)} ✨ poussière` })),
    'Recyclage impossible.',
  );
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
.tb-chip.deficit {
  color: var(--d4, #ff6a45);
  border-color: var(--d4, #ff6a45);
}
.deficit-banner {
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--d4, #ff6a45) 15%, transparent);
  border: 1px solid var(--d4, #ff6a45);
  color: var(--d4, #ff6a45);
  font-size: 12.5px;
  line-height: 1.4;
}
.shop-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

/* Consommables (onglet Donjons) */
.consum {
  margin-bottom: 14px;
}
.consum-lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 6px;
}
.consum-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.consum-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.consum-chip.on {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--accent);
}

/* Boutique */
.shop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.shop-card {
  width: 100%;
  max-width: 440px;
  max-height: 84vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
}
.shop-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.shop-title {
  font-size: 20px;
  font-weight: 700;
  flex: 1;
}
.shop-gold {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.shop-x {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.shop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.shop-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
}
.si-emo {
  font-size: 24px;
  flex: none;
}
.si-main {
  flex: 1;
  min-width: 0;
}
.si-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.si-own {
  color: var(--accent);
  font-size: 12px;
  margin-left: 4px;
}
.si-desc {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
}
.si-buy {
  flex: none;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.si-buy:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: transparent;
  color: var(--dim);
}
.shop-hint {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.4;
}

/* Onglets */
.seg {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 18px;
}
.seg-b {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 9px 5px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.seg-b .q-icon {
  flex: none;
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 18px;
}
.slot {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
  min-height: 92px;
}
.slot.empty {
  border-style: dashed;
  border-left-color: var(--line);
}
.slot-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.slot-emo {
  font-size: 18px;
}
.slot-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
  flex: 1;
}
.slot-nv {
  color: var(--accent);
  font-weight: 700;
  font-size: 11px;
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
.slot-rarity {
  margin-top: 1px;
  margin-bottom: 2px;
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
/* Sets d'équipement */
.setcard {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--dim);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.setcard.full {
  border-left-color: var(--accent);
}
.set-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.set-name {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text);
}
.set-count {
  font-weight: 800;
  color: var(--accent);
}
.set-theme {
  font-size: 11.5px;
  color: var(--dim);
  margin: 2px 0 6px;
}
.set-tiers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.set-tier {
  font-size: 11.5px;
  color: var(--dim);
  opacity: 0.55;
}
.set-tier.on {
  color: var(--accent);
  opacity: 1;
  font-weight: 600;
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
.dgn.locked {
  opacity: 0.6;
}
.dgn.locked .dgn-name {
  color: var(--dim);
}
.dgn-lock {
  color: var(--dim);
  font-style: italic;
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

/* Rapport de combat (au-dessus des donjons) */
.report {
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
}
.report.win {
  border-left-color: var(--d1);
}
.report.lose {
  border-left-color: var(--d4);
}
.report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.report-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.report-toggle {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
}
.reattack {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 999px;
  padding: 7px 14px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
.reattack:disabled {
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
.drops .drop {
  align-items: flex-start;
}
.drop-cmp {
  font-size: 10.5px;
  color: var(--dim);
  font-style: italic;
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.rarity-verdict {
  font-style: normal;
  font-weight: 700;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
}
.rarity-verdict.up {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.rarity-verdict.down {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 18%, transparent);
}
.rarity-verdict.same {
  color: var(--dim);
  background: color-mix(in srgb, var(--dim) 18%, transparent);
}
.drop-done {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
.cons-drop {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  font-size: 12.5px;
  color: var(--text);
}
.cons-drop b {
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

/* Sac vide (onglet Équipement) */
.empty-inv {
  margin-top: 6px;
  padding: 18px 14px;
  text-align: center;
  color: var(--dim);
  font-size: 13px;
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 12px;
}

/* Carte de récompense de connexion */
.login-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2, var(--surface));
  cursor: pointer;
}
.login-card:disabled {
  opacity: 0.6;
  cursor: default;
}
.login-card:active {
  transform: scale(0.99);
}
.lc-emo {
  font-size: 26px;
  flex: none;
}
.lc-main {
  flex: 1;
  min-width: 0;
}
.lc-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.lc-sub {
  font-size: 12px;
  color: var(--dim);
}
.lc-sub b {
  color: var(--accent);
}
.lc-cta {
  flex: none;
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  font-weight: 700;
  font-size: 13px;
}

/* Animation de récompense de connexion */
.lb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
}
.lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 30px 40px;
}
.lb-wave {
  position: absolute;
  top: 44px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  animation: lb-pulse 1.1s ease-out 2;
}
@keyframes lb-pulse {
  from {
    opacity: 0.9;
    transform: scale(0.4);
  }
  to {
    opacity: 0;
    transform: scale(9);
  }
}
.lb-bolt {
  font-size: 46px;
  animation: lb-pop 0.5s ease-out both;
}
.lb-energy {
  font-size: 52px;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
  animation: lb-pop 0.5s ease-out 0.08s both;
}
.lb-lbl {
  font-size: 12px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.lb-streak {
  margin-top: 8px;
  font-size: 15px;
  color: var(--text);
  font-weight: 600;
}
.lb-grace {
  margin-top: 2px;
  font-size: 12px;
  color: var(--dim);
}
@keyframes lb-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}

/* Modale de cassage d'objet */
.salv-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.salv-card {
  width: 100%;
  max-width: 360px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 4px;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.salv-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-bottom: 14px;
}
.salv-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}
.salv-emo {
  font-size: 30px;
}
.salv-main {
  min-width: 0;
}
.salv-name {
  font-weight: 600;
  color: var(--text);
}
.salv-name .rarity {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.85;
  margin-left: 4px;
}
.salv-eff {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.salv-reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 16px 0 6px;
}
.salv-plus {
  font-size: 34px;
  font-weight: 700;
  color: #b07cff;
  line-height: 1;
  text-shadow: 0 0 20px rgba(176, 124, 255, 0.4);
}
.salv-dust {
  font-size: 12px;
  color: var(--dim);
}
.salv-warn {
  font-size: 11px;
  color: var(--dim);
  text-align: center;
  margin-bottom: 16px;
}
.salv-actions {
  display: flex;
  gap: 10px;
}
.salv-cancel,
.salv-break {
  flex: 1;
  border-radius: 12px;
  padding: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--line);
}
.salv-cancel {
  background: transparent;
  color: var(--dim);
}
.salv-break {
  background: var(--d4);
  border-color: var(--d4);
  color: #15120e;
}
.salv-break:active,
.salv-cancel:active {
  transform: scale(0.97);
}
/* Rareté = liseré gauche de la carte */
.salv-card.r-common {
  border-left-color: var(--dim);
}
.salv-card.r-rare {
  border-left-color: #4ec6d6;
}
.salv-card.r-epic {
  border-left-color: #b07cff;
}
.salv-card.r-legendary {
  border-left-color: var(--accent);
}
.salv-fade-enter-active,
.salv-fade-leave-active {
  transition: opacity 0.18s ease;
}
.salv-fade-enter-from,
.salv-fade-leave-to {
  opacity: 0;
}
</style>
