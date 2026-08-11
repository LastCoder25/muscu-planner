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

      <!-- Onboarding : mini-guide affiché une seule fois (1re visite) -->
      <div v-if="showIntro" class="intro-card">
        <div class="intro-h font-display">⚔️ Bienvenue dans l'Aventure</div>
        <ul class="intro-list">
          <li>
            💪 Ton <b>niveau et tes stats</b> sont la projection de ton SPORT réel — rien à
            répartir.
          </li>
          <li>
            ⚡ Ton sport génère de l'<b>énergie</b> : dépense-la pour explorer donjons & boss.
          </li>
          <li>🗺️ Onglet <b>Donjons</b> : avance dans la liste pour du butin.</li>
          <li>
            👑 Onglet <b>Boss</b> : un boss tous les 5 niveaux — chacun lâche une pièce de son
            <b>set</b> (bonus à 2/3/4 pièces).
          </li>
        </ul>
        <button class="intro-ok" @click="dismissIntro">Compris, à l'aventure !</button>
      </div>

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
          👑 Boss
        </button>
      </div>

      <!-- ONGLET PERSONNAGE -->
      <template v-if="tab === 'perso'">
        <div class="avatar-wrap">
          <AventureAvatar :profile="c.profile" :equipped="char.row.equipped" />
        </div>
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
              <span class="hp-val font-display">{{ fmtPow(combatPowerVal) }}</span>
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

        <div class="sec-title">Combat : base → équipé</div>
        <div class="gear-fx">
          <div class="gfx">
            <span class="gfx-l">❤️ PV</span>
            <span class="gfx-v">{{ baseFighter.pv }} <i>→</i> <b>{{ fighter.pv }}</b></span>
          </div>
          <div class="gfx">
            <span class="gfx-l">⚔️ Dégâts/coup</span>
            <span class="gfx-v">{{ baseFighter.damage }} <i>→</i> <b>{{ fighter.damage }}</b></span>
          </div>
          <div class="gfx">
            <span class="gfx-l">⚡ Frappes/tour</span>
            <span class="gfx-v"
              >{{ (baseFighter.strikes ?? 1).toFixed(2) }} <i>→</i>
              <b>{{ (fighter.strikes ?? 1).toFixed(2) }}</b></span
            >
          </div>
          <div class="gfx">
            <span class="gfx-l">🎯 Crit</span>
            <span class="gfx-v">{{ pctA(baseFighter.crit) }} <i>→</i> <b>{{ pctA(fighter.crit) }}</b></span>
          </div>
          <div class="gfx">
            <span class="gfx-l">💨 Esquive</span>
            <span class="gfx-v"
              >{{ pctA(baseFighter.dodge) }} <i>→</i> <b>{{ pctA(fighter.dodge) }}</b></span
            >
          </div>
          <div class="gfx">
            <span class="gfx-l">🛡️ Défense</span>
            <span class="gfx-v"
              >{{ pctA(baseFighter.dmgReduction) }} <i>→</i>
              <b>{{ pctA(fighter.dmgReduction) }}</b></span
            >
          </div>
          <div class="gfx">
            <span class="gfx-l">🩸 Vol de vie</span>
            <span class="gfx-v"
              >{{ pctA(baseFighter.lifesteal) }} <i>→</i>
              <b>{{ pctA(fighter.lifesteal) }}</b></span
            >
          </div>
          <div class="gfx total">
            <span class="gfx-l">Puissance de combat</span>
            <span class="gfx-v"
              >{{ fmtPow(combatPower(baseFighter)) }} <i>→</i>
              <b>{{ fmtPow(combatPowerVal) }}</b></span
            >
          </div>
        </div>
        <div class="gear-fx-note">
          Les stats <b>💪❤️⚡</b> viennent du sport ; l'<b>équipement + talents</b> ajoutent les
          effets (→).
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
        <div v-if="talentSummary.length" class="talents-owned">
          <div v-for="ts in talentSummary" :key="ts.code" class="talent-card">
            <span class="talent-card-emo">{{ ts.talent.icon }}</span>
            <div class="talent-card-body">
              <div class="talent-card-name font-display">{{ ts.talent.name }}</div>
              <div class="talent-card-eff">{{ ts.total }}</div>
            </div>
            <span v-if="ts.count > 1" class="talent-card-mult">×{{ ts.count }}</span>
          </div>
        </div>
        <div v-if="char.row.talents.length" class="talents-reset">
          <button class="reset-btn" :disabled="char.row.gold < resetCost" @click="doResetTalents">
            ↺ Réinitialiser 🪙{{ resetCost }}
          </button>
        </div>
        <div v-if="!char.row.talents.length && talentPoints === 0" class="talents-empty">
          Prochain talent au niveau {{ nextTalentLevel }}.
        </div>

        <!-- Codex : bestiaire + journal des sets (méta de collection). -->
        <button class="codex-btn" @click="codexOpen = true">
          <span class="cx-emo">📖</span>
          <span class="cx-main">
            <span class="cx-title">Codex</span>
            <span class="cx-sub">
              👾 {{ codexSum.monstersFound }}/{{ codexSum.monstersTotal }} monstres ·
              🧩 {{ codexSum.setsComplete }}/{{ codexSum.setsTotal }} sets
            </span>
          </span>
          <span class="cx-go">›</span>
        </button>

        <!-- Timeline « À venir » : ce que les prochains niveaux débloquent. -->
        <div v-if="upcoming.length" class="upcoming">
          <div class="up-title">🔮 À venir</div>
          <div v-for="(u, i) in upcoming" :key="i" class="up-row">
            <span class="up-lvl font-display">Niv. {{ u.level }}</span>
            <span class="up-emo">{{ u.emoji }}</span>
            <div class="up-txt">
              <div class="up-name">{{ u.title }}</div>
              <div class="up-detail">{{ u.detail }}</div>
            </div>
          </div>
        </div>

        <div class="foot">
          <b>Chaque séance fait progresser ton aventurier.</b> Les stats et le niveau viennent du
          sport. La connexion quotidienne, elle, ne donne qu'un peu d'énergie pour jouer.
        </div>
      </template>

      <!-- ONGLET ÉQUIPEMENT -->
      <template v-else-if="tab === 'equip'">
        <div class="sec-title">Équipement</div>
        <div class="sec-hint">
          Ton stuff équipé. Gère tes objets dans le sac (filtrable par type ci-dessous).
        </div>
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
            </div>
            <template v-if="char.row.equipped[slot]">
              <div class="slot-name">{{ char.row.equipped[slot]!.name }}</div>
              <div class="pills">
                <span class="gpill lvl">Lvl {{ char.row.equipped[slot]!.level }}</span>
                <span class="gpill" :class="'p-' + char.row.equipped[slot]!.rarity">{{
                  RARITY_LABEL[char.row.equipped[slot]!.rarity]
                }}</span>
                <span v-if="char.row.equipped[slot]!.setId" class="gpill set">🧩 Set</span>
              </div>
              <div class="slot-eff">{{ itemEffects(char.row.equipped[slot]!) }}</div>
              <button
                class="slot-up"
                :disabled="!canUpgrade(char.row.equipped[slot]!, char.row.dust, c.level.level)"
                @click.stop="doUpgrade(char.row.equipped[slot]!.id)"
              >
                <template v-if="char.row.equipped[slot]!.level > c.level.level"
                  >✨ Infusable au niv {{ char.row.equipped[slot]!.level + 1 }}</template
                >
                <template v-else-if="char.row.equipped[slot]!.level >= c.level.level"
                  >✨ Max (ton niveau {{ c.level.level }})</template
                >
                <template v-else
                  >✨ Infuser ·
                  {{
                    upgradeCost(char.row.equipped[slot]!.level, char.row.equipped[slot]!.rarity)
                  }}
                  ✨</template
                >
              </button>
              <button class="slot-remove" @click="doUnequip(slot)">Retirer</button>
            </template>
            <div v-else class="slot-vide">
              vide<template v-if="bagCountForSlot(slot) > 0">
                · {{ bagCountForSlot(slot) }} au sac</template
              >
            </div>
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
          <!-- Filtre par type d'objet -->
          <div class="inv-filter">
            <button
              class="if-chip"
              :class="{ on: invFilter === 'all' }"
              @click="invFilter = 'all'"
            >
              Tous
            </button>
            <button
              v-for="slot in SLOTS"
              :key="slot"
              class="if-chip"
              :class="{ on: invFilter === slot }"
              @click="invFilter = slot"
            >
              {{ SLOT_EMOJI[slot] }} {{ SLOT_LABEL[slot] }}
            </button>
          </div>
          <!-- Nettoyage en masse : objets qui n'améliorent pas ta puissance —
               faibles ET doublons de l'équipé (écart de niveau pris en compte :
               jugés une fois montés à ton niveau) -->
          <div v-if="belowCount > 0" class="bulk">
            <span class="bulk-lbl"
              >{{ belowCount }} objet{{ belowCount > 1 ? 's' : '' }} inutile{{
                belowCount > 1 ? 's' : ''
              }} (faible{{ belowCount > 1 ? 's' : '' }} ou doublon{{
                belowCount > 1 ? 's' : ''
              }})</span
            >
            <div class="bulk-btns">
              <button class="bulk-b" @click="doSalvageBelow">✨ Tout casser</button>
              <button class="bulk-b" @click="doSellBelow">🪙 Tout vendre</button>
            </div>
          </div>
          <div v-if="!filteredInventory.length" class="inv-empty-filter">
            Aucun objet de ce type dans le sac.
          </div>
          <div class="inv">
            <div
              v-for="it in filteredInventory"
              :key="it.id"
              class="inv-item"
              :class="['r-' + it.rarity, { locked: it.locked }]"
            >
              <span class="inv-emo">{{ it.emoji }}</span>
              <button
                class="inv-lock"
                :class="{ on: it.locked }"
                :title="it.locked ? 'Déverrouiller' : 'Protéger de la casse/vente'"
                :aria-label="it.locked ? 'Déverrouiller' : 'Verrouiller'"
                @click="doToggleLock(it)"
              >
                {{ it.locked ? '🔒' : '🔓' }}
              </button>
              <div class="inv-main">
                <div class="inv-name">{{ it.name }}</div>
                <div class="pills">
                  <span class="gpill lvl">Lvl {{ it.level }}</span>
                  <span class="gpill" :class="'p-' + it.rarity">{{ RARITY_LABEL[it.rarity] }}</span>
                  <span v-if="it.setId" class="gpill set">🧩 Set</span>
                </div>
                <div class="inv-eff">{{ SLOT_LABEL[it.slot] }} · {{ itemEffects(it) }}</div>
                <div class="drop-cmp inv-cmp">
                  <span v-if="equippedInSlot(it.slot)"
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(it.slot)!.rarity] }} Nv
                    {{ equippedInSlot(it.slot)!.level }} ·
                    {{ itemEffects(equippedInSlot(it.slot)!) }}</span
                  >
                  <span v-else>Emplacement libre</span>
                  <span class="rarity-verdict" :class="rarityVerdict(it).cls">{{
                    rarityVerdict(it).label
                  }}</span>
                </div>
                <div class="pow-cmp">
                  ⚔️ Puissance {{ fmtPow(combatPowerVal) }} →
                  <b :class="powerIfEquip(it) >= combatPowerVal ? 'up' : 'down'"
                    >{{ fmtPow(powerIfEquip(it)) }} ({{
                      fmtDelta(combatPowerVal, powerIfEquip(it))
                    }})</b
                  >
                </div>
                <div class="inv-actions">
                  <button class="equip-btn" @click="doEquip(it.id)">
                    {{ equippedInSlot(it.slot) ? 'Remplacer' : 'Équiper' }}
                  </button>
                  <button class="link-btn" :disabled="it.locked" @click="doSalvage(it)">
                    Casser ✨{{ salvageValue(it) }}
                  </button>
                  <button class="link-btn" :disabled="it.locked" @click="doSell(it)">
                    Vendre 🪙{{ sellValue(it) }}
                  </button>
                </div>
                <div class="inv-actions ws-inline">
                  <button
                    v-if="it.level < c.level.level"
                    class="link-btn"
                    :disabled="!canUpgrade(it, char.row.dust, c.level.level)"
                    @click="doUpgrade(it.id)"
                  >
                    ✨ Niveau · {{ upgradeCost(it.level, it.rarity) }}✨
                  </button>
                  <button
                    class="link-btn"
                    :disabled="char.row.dust < rerollCost(it)"
                    @click="doReroll(it)"
                  >
                    ♻️ Reroll ✨{{ rerollCost(it) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-inv">
          Ton sac est vide. Explore un donjon pour trouver du butin 🗡️
        </div>

        <!-- Atelier de poussière : investir la poussière autrement que l'infusion de niveau -->
        <div class="sec-title">🔧 Atelier de poussière</div>
        <div class="sec-hint">Investis ta poussière — <b>✨ {{ char.row.dust }}</b> dispo.</div>
        <div class="workshop">
          <button
            class="ws-btn"
            :disabled="char.row.dust < forgeCost(c.level.level, false)"
            @click="doForge()"
          >
            🔨 Forger un objet (aléatoire) · ✨{{ forgeCost(c.level.level, false) }}
          </button>
          <button
            class="ws-btn"
            :disabled="char.row.dust < forgeCost(c.level.level, true)"
            @click="forgeSlotOpen = true"
          >
            🎯 Forger (choisir l'emplacement) · ✨{{ forgeCost(c.level.level, true) }}
          </button>
          <button
            class="ws-btn"
            :disabled="char.row.dust < craftSetCost(c.level.level)"
            @click="openCraft()"
          >
            🧩 Forger une pièce de set · ✨{{ craftSetCost(c.level.level) }}
          </button>
        </div>
        <div class="ws-note">
          Forge un objet neuf <b>à ton niveau</b> (rareté au hasard). <b>♻️ Reroll</b> (change la
          stat) se fait sur un objet du sac. La rareté ne se monte plus au craft : le
          <b>haut de gamme s'obtient en explorant</b> (drops/boss).
        </div>

        <div class="foot">
          L'équipement ne donne pas de stats (elles viennent du sport) mais des <b>effets</b> — vol
          de vie, réduction de dégâts, or… → à toi de composer ton style.
        </div>
      </template>

      <!-- ONGLET DONJONS -->
      <template v-else-if="tab === 'donjons'">
        <!-- Expéditions (nouveau mode, prototype visuel) -->
        <button class="expe-card" @click="router.push('/expedition')">
          <span class="expe-emo">🗝️</span>
          <span class="expe-main">
            <span class="expe-name font-display">Expéditions</span>
            <span class="expe-sub">
              Donjons à étages à explorer ·
              <b>{{ char.row?.keys ?? 0 }}</b> clé{{ (char.row?.keys ?? 0) > 1 ? 's' : '' }}
            </span>
          </span>
          <span class="expe-go">›</span>
        </button>

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

        <!-- Bandeau de RÉGION : où tu es + ce qui t'attend après (biomes). -->
        <div class="region-banner" :style="{ '--rc': curRegion.color }">
          <div class="rb-top">
            <span class="rb-emo">{{ curRegion.emoji }}</span>
            <div class="rb-main">
              <div class="rb-name font-display">{{ curRegion.name }}</div>
              <div class="rb-blurb">{{ curRegion.blurb }}</div>
            </div>
            <span class="rb-prog">{{ curRegionProg.done }}/{{ curRegionProg.total }}</span>
          </div>
          <div class="rb-bar"><span :style="{ width: (curRegionProg.done / curRegionProg.total) * 100 + '%' }" /></div>
          <div v-if="nxtRegion" class="rb-next">
            ⟶ Prochaine région : <span :style="{ color: nxtRegion.color }">{{ nxtRegion.emoji }} {{ nxtRegion.name }}</span>
          </div>
          <div v-else class="rb-next">⭐ Dernière région — tu touches au bout du monde.</div>
        </div>

        <div class="sec-title mboss-title">🗺️ Carte des mondes</div>
        <div class="sec-hint map-hint">Touche une région pour voir ses donjons ↓</div>
        <!-- Carte-monde serpentine : un nœud par région, fil énergisé, cadenas. -->
        <div class="worldmap" :style="{ height: mapGeom.viewH + 'px' }">
          <svg class="wm-svg" :viewBox="`0 0 100 ${mapGeom.viewH}`" preserveAspectRatio="none">
            <path :d="mapGeom.pathD" class="wm-wire" vector-effect="non-scaling-stroke" />
            <path
              :d="mapGeom.pathD"
              class="wm-wire wm-energized"
              pathLength="1"
              stroke-dasharray="1"
              :stroke-dashoffset="1 - mapFill"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <button
            v-for="(r, i) in REGIONS"
            :key="r.id"
            class="wm-node"
            :class="[regionState(r), { sel: selRegion.id === r.id, shatter: shatterId === r.id }]"
            :style="{ ...nodeStyle(i), '--rc': r.color }"
            @click="tapRegion(r)"
          >
            <span class="wm-disc">
              <span v-if="regionState(r) === 'locked' && shatterId !== r.id" class="wm-lockemo">🔒</span>
              <span v-else class="wm-emo">{{ r.emoji }}</span>
              <span v-if="regionState(r) === 'done'" class="wm-star">★</span>
              <!-- Chaînes + cadenas (verrou / explosion) -->
              <span
                v-if="regionState(r) === 'locked' || shatterId === r.id"
                class="wm-chains"
                aria-hidden="true"
              >
                <i class="wm-link l1" />
                <i class="wm-link l2" />
                <i class="wm-lock">🔒</i>
              </span>
            </span>
            <span class="wm-cap">{{ regionState(r) === 'locked' ? '???' : r.name }}</span>
            <span class="wm-pips">
              <i v-for="n in r.dungeonIds.length" :key="n" :class="{ on: n <= regionDone(r) }" />
            </span>
          </button>
        </div>

        <!-- Drawer : donjons de la région sélectionnée -->
        <div ref="drawerEl" class="region-drawer" :style="{ '--rc': selRegion.color }">
          <div class="rd-head">
            <span class="rd-emo">{{ selRegion.emoji }}</span>
            <span class="rd-name font-display">{{ selRegion.name }}</span>
            <span class="rd-prog">{{ regionDone(selRegion) }}/{{ selRegion.dungeonIds.length }}</span>
          </div>
        </div>
        <div class="dungeons">
          <div
            v-for="it in selectedRegionItems"
            :key="it.key"
            class="dgn"
            :class="{ locked: !dungeonUnlocked(it.dungeon) }"
            :style="{ '--rc': regionOfDungeon(it.dungeon.id)?.color ?? 'var(--line)' }"
          >
            <div class="dgn-hd">
              <span class="dgn-emo">{{
                dungeonUnlocked(it.dungeon) ? it.dungeon.emoji : '🔒'
              }}</span>
              <div class="dgn-hd-main">
                <div class="dgn-name font-display">{{ it.dungeon.name }}</div>
              </div>
              <span class="lvl-pill" :class="itemState(it)">Niv {{ it.dungeon.recoLevel }}</span>
            </div>

            <div class="dgn-meta">
              <span class="dgn-chip">⚡ {{ it.dungeon.energyCost }}</span>
              <span class="dgn-chip">👾 {{ it.dungeon.monsterIds.length }}</span>
              <span class="dgn-chip gold">+{{ dungeonGold(it.dungeon) }} 🪙</span>
              <span
                v-if="dungeonUnlocked(it.dungeon)"
                class="dgn-chip winpct"
                :class="winClass(winPct['d:' + it.dungeon.id] ?? 0)"
                >🎯 {{ winPct['d:' + it.dungeon.id] ?? 0 }}%</span
              >
              <button
                v-if="dungeonUnlocked(it.dungeon)"
                class="dgn-loot"
                aria-label="Butin possible"
                @click.stop="openDrops(it.dungeon)"
              >
                🎁 Butin
              </button>
            </div>

            <div v-if="dungeonUnlocked(it.dungeon)" class="dgn-hint">{{ it.dungeon.hint }}</div>
            <div v-else class="dgn-hint dgn-lock">
              🔒 Nettoie d’abord « {{ prevDungeonName(it.dungeon) }} » pour débloquer ce donjon.
            </div>

            <button
              v-if="dungeonUnlocked(it.dungeon)"
              class="fight"
              :disabled="c.energy < it.dungeon.energyCost || busy"
              @click="explore(it.dungeon)"
            >
              Explorer ({{ it.dungeon.energyCost }} ⚡)
            </button>
            <button v-else class="fight" disabled>Verrouillé</button>
          </div>

          <!-- Faille sans fin (end-game infini) — visible sur la dernière région -->
          <div
            v-if="endlessUnlocked && selRegion.id === endRegionId"
            class="dgn mboss endless"
          >
            <div class="dgn-hd">
              <span class="dgn-emo">🌀</span>
              <div class="dgn-hd-main">
                <div class="mboss-eyebrow">♾️ End-game · sans fin</div>
                <div class="dgn-name mboss-name font-display">Faille sans fin</div>
              </div>
              <span class="lvl-pill avail">Palier {{ nextEndlessTier }}</span>
            </div>
            <div class="dgn-meta">
              <span class="dgn-chip">⚡ {{ endlessEnergy(nextEndlessTier) }}</span>
              <span class="dgn-chip gold">+{{ endlessGold(nextEndlessTier) }} 🪙</span>
              <span class="dgn-chip">🎁 niv. {{ endlessDropLevel(nextEndlessTier) }}</span>
              <span class="dgn-chip">🏆 record {{ endlessBest }}</span>
            </div>
            <div class="dgn-hint">
              Chaque palier est plus dur — pousse aussi loin que ton build le permet.
            </div>
            <button
              class="fight mboss-fight"
              :disabled="c.energy < endlessEnergy(nextEndlessTier) || busy"
              @click="fightEndless()"
            >
              🌀 Descendre au palier {{ nextEndlessTier }} ({{ endlessEnergy(nextEndlessTier) }}
              ⚡)
            </button>
          </div>
        </div>
      </template>

      <!-- ONGLET BOSS DE PALIER -->
      <template v-else>
        <div class="sec-title mboss-title">👑 Boss de palier</div>
        <div class="sec-hint">
          Un boss tous les 5 niveaux — chacun lâche une pièce de son <b>set</b> unique. Débloqués en
          chaîne (bats le précédent).
        </div>
        <div class="dungeons">
          <div
            v-for="b in bossChain"
            :key="b.id"
            class="dgn mboss"
            :class="{ locked: !bossUnlocked(b), beaten: isBossBeaten(b) }"
          >
            <div class="dgn-hd">
              <span class="dgn-emo">{{ bossUnlocked(b) ? b.emoji : '🔒' }}</span>
              <div class="dgn-hd-main">
                <div class="dgn-name mboss-name font-display">
                  {{ b.name }}
                  <span v-if="isBossBeaten(b)" class="mboss-badge">⭐</span>
                </div>
              </div>
              <span class="lvl-pill" :class="itemState({ boss: b })">Niv {{ b.unlockLevel }}</span>
            </div>

            <div class="dgn-meta">
              <span class="dgn-chip">⚡ {{ b.energyCost }}</span>
              <span class="dgn-chip gold">+{{ b.gold }} 🪙</span>
              <span
                v-if="bossUnlocked(b)"
                class="dgn-chip winpct"
                :class="winClass(winPct['b:' + b.id] ?? 0)"
                >🎯 {{ winPct['b:' + b.id] ?? 0 }}%</span
              >
            </div>

            <button class="mboss-set" @click="openSetInfo(b)">
              {{ bossSet(b).emoji }} {{ bossSet(b).name }} · <b>{{ bossSetCount(b) }}/4</b> pièces
              <span class="mboss-set-info">ⓘ bonus</span>
            </button>
            <div v-if="bossUnlocked(b)" class="dgn-hint">{{ b.hint }}</div>
            <div v-else class="dgn-hint dgn-lock">🔒 {{ bossLockReason(b) }}</div>

            <button
              v-if="bossUnlocked(b)"
              class="fight mboss-fight"
              :disabled="c.energy < b.energyCost || busy"
              @click="fightBoss(b)"
            >
              ⚔️ {{ isBossBeaten(b) ? 'Réaffronter' : 'Combattre' }} ({{ b.energyCost }} ⚡)
            </button>
            <button v-else class="fight mboss-fight" disabled>🔒 Verrouillé</button>
          </div>
        </div>
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

    <!-- Modale : remplacer un objet équipé → sort de l'ancien au choix -->
    <transition name="salv-fade">
      <div v-if="replaceTarget" class="salv-backdrop" @click.self="replaceTarget = null">
        <div class="salv-card repl-card">
          <div class="salv-title font-display">Remplacer l'équipement</div>

          <div class="repl-item repl-new" :class="'r-' + replaceTarget.rarity">
            <span class="repl-tag">Nouveau</span>
            <span class="salv-emo">{{ replaceTarget.emoji }}</span>
            <div class="salv-main">
              <div class="salv-name">
                {{ replaceTarget.name }}
                <span class="rarity"
                  >{{ RARITY_LABEL[replaceTarget.rarity] }} · Nv {{ replaceTarget.level }}</span
                >
              </div>
              <div class="salv-eff">
                {{ SLOT_LABEL[replaceTarget.slot] }} · {{ itemEffects(replaceTarget) }}
              </div>
            </div>
          </div>

          <div v-if="equippedInSlot(replaceTarget.slot)" class="repl-arrow">remplace ↓</div>

          <div
            v-if="equippedInSlot(replaceTarget.slot)"
            class="repl-item repl-old"
            :class="'r-' + equippedInSlot(replaceTarget.slot)!.rarity"
          >
            <span class="repl-tag">Actuel</span>
            <span class="salv-emo">{{ equippedInSlot(replaceTarget.slot)!.emoji }}</span>
            <div class="salv-main">
              <div class="salv-name">
                {{ equippedInSlot(replaceTarget.slot)!.name }}
                <span class="rarity"
                  >{{ RARITY_LABEL[equippedInSlot(replaceTarget.slot)!.rarity] }} · Nv
                  {{ equippedInSlot(replaceTarget.slot)!.level }}</span
                >
              </div>
              <div class="salv-eff">{{ itemEffects(equippedInSlot(replaceTarget.slot)!) }}</div>
            </div>
          </div>

          <div class="repl-q">Que faire de l'objet remplacé ?</div>
          <div class="repl-choices">
            <button class="repl-choice" @click="confirmReplace('keep')">
              <span class="repl-choice-emo">🎒</span>
              <span class="repl-choice-lbl">Garder</span>
              <small>au sac</small>
            </button>
            <button class="repl-choice" @click="confirmReplace('salvage')">
              <span class="repl-choice-emo">✨</span>
              <span class="repl-choice-lbl">Recycler</span>
              <small v-if="equippedInSlot(replaceTarget.slot)"
                >+{{ salvageValue(equippedInSlot(replaceTarget.slot)!) }} poussière</small
              >
            </button>
            <button class="repl-choice" @click="confirmReplace('sell')">
              <span class="repl-choice-emo">🪙</span>
              <span class="repl-choice-lbl">Vendre</span>
              <small v-if="equippedInSlot(replaceTarget.slot)"
                >+{{ sellValue(equippedInSlot(replaceTarget.slot)!) }} or</small
              >
            </button>
          </div>
          <button class="salv-cancel repl-cancel" @click="replaceTarget = null">Annuler</button>
        </div>
      </div>
    </transition>

    <!-- Animation : passage de niveau -->
    <transition name="lb-fade">
      <div v-if="levelBurst" class="lb-backdrop" @click="levelBurst = null">
        <div class="lb-card major">
          <span class="lb-wave" aria-hidden="true" />
          <span class="lb-bolt">🎉</span>
          <div class="lb-energy font-display">Niveau {{ levelBurst.to }} !</div>
          <div class="lb-lbl">bravo, tu montes en puissance</div>
          <div class="lb-streak">+{{ levelBurst.energy }} ⚡ de bonus</div>
          <div v-if="levelBurstUnlocks.length" class="lb-unlocks">
            <div class="lb-unlocks-h">🎁 Tu débloques</div>
            <div v-for="(u, i) in levelBurstUnlocks" :key="i" class="lb-unlock">
              <span class="lu-emo">{{ u.emoji }}</span>
              <div class="lu-txt">
                <div class="lu-title">{{ u.title }}</div>
                <div class="lu-detail">{{ u.detail }}</div>
              </div>
            </div>
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

    <!-- Reveal : nouvelle région (biome) découverte -->
    <transition name="lb-fade">
      <div v-if="regionBurst" class="lb-backdrop" @click="regionBurst = null">
        <div class="lb-card region" :style="{ '--rc': regionBurst.color }">
          <span class="lb-wave" aria-hidden="true" />
          <span class="lb-bolt">{{ regionBurst.emoji }}</span>
          <div class="rburst-kicker">Nouvelle région</div>
          <div class="rburst-name font-display">{{ regionBurst.name }}</div>
          <div class="lb-lbl">{{ regionBurst.blurb }}</div>
        </div>
      </div>
    </transition>

    <!-- Codex : bestiaire + journal des sets (méta de collection) -->
    <transition name="salv-fade">
      <div v-if="codexOpen" class="shop-backdrop" @click.self="codexOpen = false">
        <div class="shop-card codex-card">
          <div class="shop-head">
            <div class="shop-title font-display">📖 Codex</div>
            <button class="shop-x" aria-label="Fermer" @click="codexOpen = false">✕</button>
          </div>
          <div class="codex-body">
            <!-- Bestiaire -->
            <div class="cx-sec-h">
              👾 Bestiaire
              <span class="cx-count">{{ codexSum.monstersFound }}/{{ codexSum.monstersTotal }}</span>
            </div>
            <div class="bestiary-grid">
              <div
                v-for="m in bestiaryList"
                :key="m.id"
                class="best-tile"
                :class="{ found: m.discovered }"
              >
                <span class="best-emo">{{ m.discovered ? m.emoji : '❔' }}</span>
                <span class="best-name">{{ m.discovered ? m.name : '???' }}</span>
                <span class="best-tier">Palier {{ m.tier }}</span>
              </div>
            </div>

            <!-- Journal des sets -->
            <div class="cx-sec-h cx-sec-h2">
              🧩 Sets d'équipement
              <span class="cx-count">{{ codexSum.setsComplete }}/{{ codexSum.setsTotal }} complets</span>
            </div>
            <div class="setj-list">
              <div
                v-for="s in setsList"
                :key="s.set.id"
                class="setj"
                :class="{ complete: s.complete }"
              >
                <span class="setj-emo">{{ s.set.emoji }}</span>
                <div class="setj-main">
                  <div class="setj-name">
                    {{ s.set.name }}
                    <span v-if="s.complete" class="setj-badge">✓ complet</span>
                  </div>
                  <div class="setj-theme">{{ s.set.theme }}</div>
                  <div v-if="!s.bossDefeated" class="setj-lock">
                    🔒 Bats « {{ bossNameById(s.bossId) }} » pour débloquer ce set.
                  </div>
                </div>
                <div class="setj-pips">
                  <span
                    v-for="n in s.total"
                    :key="n"
                    class="setj-pip"
                    :class="{ on: n <= s.owned }"
                  />
                  <span class="setj-frac">{{ s.owned }}/{{ s.total }}</span>
                </div>
              </div>
            </div>
          </div>
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
              <div class="si-actions">
                <div class="si-qty">
                  <button
                    class="si-step"
                    :disabled="qtyFor(it) <= 1"
                    aria-label="Moins"
                    @click="bumpQty(it, -1)"
                  >
                    −
                  </button>
                  <span class="si-qn font-display">×{{ qtyFor(it) }}</span>
                  <button
                    class="si-step"
                    :disabled="qtyFor(it) >= maxBuy(it)"
                    aria-label="Plus"
                    @click="bumpQty(it, 1)"
                  >
                    +
                  </button>
                </div>
                <button class="si-buy" :disabled="char.row.gold < it.cost" @click="buy(it)">
                  🪙 {{ it.cost * qtyFor(it) }}
                </button>
              </div>
            </div>
          </div>
          <div class="shop-hint">
            Les consommables s'utilisent au lancement d'un donjon (onglet Donjons).
          </div>
        </div>
      </div>
    </transition>

    <!-- Butin possible d'un donjon -->
    <q-dialog :model-value="!!dropInfo" position="bottom" @update:model-value="dropInfo = null">
      <q-card v-if="dropInfo" class="drops-card">
        <div class="drops-title font-display">{{ dropInfo.emoji }} Butin — {{ dropInfo.name }}</div>
        <div class="drops-row">
          <span class="drops-k">Niveau des objets</span>
          <span class="drops-v"
            >{{ Math.max(1, dropInfo.dropLevel - 1) }}–{{ dropInfo.dropLevel }}</span
          >
        </div>
        <div class="drops-row">
          <span class="drops-k">Récompenses</span>
          <span class="drops-v">jusqu'à {{ dungeonGold(dropInfo) }} 🪙 · poussière ✨</span>
        </div>
        <div class="drops-sub">Chances de rareté</div>
        <div class="odds">
          <div v-for="o in rarityOdds(dropInfo.dropLuck)" :key="o.label" class="odd" :class="o.cls">
            <span class="odd-pct font-display">{{ o.pct }}%</span>
            <span class="odd-lbl">{{ o.label }}</span>
          </div>
        </div>
        <div class="drops-note">
          Chaque objet a <b>1 stat</b> (dégâts / PV / critique / vol de vie / réduction). Le
          <b>Divin</b> (rose) est la rareté ultime — 1 stat très puissante, infusable mais coûteuse.
          Les <b>pièces de set</b> ne tombent que sur les <b>boss de palier</b>.
        </div>
        <button class="drops-close" @click="dropInfo = null">Fermer</button>
      </q-card>
    </q-dialog>

    <!-- Bonus de SET d'un boss (au clic sur la ligne de set de la tuile) -->
    <q-dialog :model-value="!!setInfo" position="bottom" @update:model-value="setInfo = null">
      <q-card v-if="setInfo" class="drops-card">
        <div class="drops-title font-display">
          {{ setInfo.set.emoji }} {{ setInfo.set.name }}
        </div>
        <div class="set-theme">{{ setInfo.set.theme }}</div>
        <div class="drops-sub">Bonus par paliers (au niveau {{ setInfo.level }})</div>
        <div class="set-tiers">
          <span
            v-for="t in setInfo.set.tiers"
            :key="t.pieces"
            class="set-tier"
            :class="{ on: setInfo.count >= t.pieces }"
          >
            {{ t.pieces }} pièces : {{ effectLabel({ type: t.type, value: t.base }, setInfo.level) }}
          </span>
        </div>
        <div class="drops-note">
          Tu as <b>{{ setInfo.count }}/4</b> pièces. Chaque victoire sur ce boss lâche une pièce
          (emplacement aléatoire) au niveau du palier.
        </div>
        <button class="drops-close" @click="setInfo = null">Fermer</button>
      </q-card>
    </q-dialog>

    <!-- Récompense de boss AU CHOIX : 3 candidats, on en garde 1. Fallback (reprise
         d'une récompense non choisie) — sinon le CHOIX se fait dans le rapport de
         combat ci-dessous, tant qu'il est ouvert. -->
    <q-dialog :model-value="!!char.row?.pending_reward && !reportOpen" persistent>
      <q-card v-if="char.row?.pending_reward" class="reward-card">
        <div class="reward-title font-display">🎁 Choisis ta récompense</div>
        <div class="reward-sub">Un seul de ces trois butins — à toi de jouer.</div>
        <div class="reward-list">
          <button
            v-for="(cand, i) in char.row.pending_reward.candidates"
            :key="i"
            class="reward-cand"
            :class="[
              cand.kind === 'item' ? 'r-' + cand.item.rarity : 'r-gold',
              { reco: i === recommendedRewardIndex },
            ]"
            :disabled="busy"
            @click="doChooseReward(i)"
          >
            <span v-if="i === recommendedRewardIndex" class="reco-badge">★ Conseillé</span>
            <template v-if="cand.kind === 'item'">
              <span class="rc-emo">{{ cand.item.emoji }}</span>
              <div class="rc-main">
                <div class="rc-name">{{ cand.item.name }}</div>
                <div class="rc-pills">
                  <span class="rc-pill lvl">Lvl {{ cand.item.level }}</span>
                  <span class="rc-pill" :class="'p-' + cand.item.rarity">{{
                    RARITY_LABEL[cand.item.rarity]
                  }}</span>
                  <span v-if="cand.item.setId" class="rc-pill set">🧩 Set</span>
                </div>
                <div class="rc-eff">
                  {{ SLOT_LABEL[cand.item.slot] }} · {{ itemEffects(cand.item) }}
                </div>
                <div class="drop-cmp rc-cmp">
                  <span v-if="equippedInSlot(cand.item.slot)"
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(cand.item.slot)!.rarity] }} Nv
                    {{ equippedInSlot(cand.item.slot)!.level }} ·
                    {{ itemEffects(equippedInSlot(cand.item.slot)!) }}</span
                  >
                  <span v-else>Emplacement libre</span>
                  <span class="rarity-verdict" :class="rarityVerdict(cand.item).cls">{{
                    rarityVerdict(cand.item).label
                  }}</span>
                </div>
                <div class="pow-cmp">
                  ⚔️ Puissance {{ fmtPow(combatPowerVal) }} →
                  <b :class="powerIfEquip(cand.item) >= combatPowerVal ? 'up' : 'down'"
                    >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                      fmtDelta(combatPowerVal, powerIfEquip(cand.item))
                    }})</b
                  >
                </div>
                <div v-if="rewardDupNote(cand.item)" class="rc-dup">
                  {{ rewardDupNote(cand.item) }}
                </div>
              </div>
            </template>
            <template v-else>
              <span class="rc-emo">💰</span>
              <div class="rc-main">
                <div class="rc-name">Trésor</div>
                <div class="rc-eff">+{{ cand.gold }} 🪙 · +{{ cand.dust }} ✨</div>
              </div>
            </template>
          </button>
        </div>
      </q-card>
    </q-dialog>

    <!-- Atelier : forge ciblée → choix de l'emplacement -->
    <q-dialog :model-value="forgeSlotOpen" position="bottom" @update:model-value="forgeSlotOpen = false">
      <q-card class="ws-modal">
        <div class="ws-modal-title font-display">🎯 Forger — choisis l'emplacement</div>
        <div class="ws-slots">
          <button v-for="slot in SLOTS" :key="slot" class="ws-slot" @click="doForge(slot)">
            <span class="ws-slot-emo">{{ SLOT_EMOJI[slot] }}</span>
            <span>{{ SLOT_LABEL[slot] }}</span>
          </button>
        </div>
      </q-card>
    </q-dialog>

    <!-- Atelier : craft d'une pièce de set → choix du set + emplacement -->
    <q-dialog :model-value="craftOpen" position="bottom" @update:model-value="craftOpen = false">
      <q-card class="ws-modal">
        <div class="ws-modal-title font-display">🧩 Forger une pièce de set</div>
        <div v-if="!craftableSets.length" class="ws-empty">
          Aucun set débloqué. Bats un <b>boss de palier</b> pour débloquer son set, puis forge-le ici.
        </div>
        <template v-else>
          <div class="ws-field">
            <span class="ws-lbl">Set (débloqués)</span>
            <div class="ws-chips">
              <button
                v-for="s in craftableSets"
                :key="s.id"
                class="ws-chip"
                :class="{ on: craftSetId === s.id }"
                @click="craftSetId = s.id"
              >
                {{ s.emoji }} {{ s.name }}
              </button>
            </div>
          </div>
        <div class="ws-field">
          <span class="ws-lbl">Emplacement</span>
          <div class="ws-chips">
            <button
              v-for="slot in SLOTS"
              :key="slot"
              class="ws-chip"
              :class="{ on: craftSlot === slot }"
              @click="craftSlot = slot"
            >
              {{ SLOT_EMOJI[slot] }} {{ SLOT_LABEL[slot] }}
            </button>
          </div>
        </div>
          <button
            class="ws-btn"
            :disabled="!char.row || char.row.dust < craftSetCost(c.level.level)"
            @click="doCraftSet"
          >
            Forger · ✨{{ craftSetCost(c.level.level) }}
          </button>
        </template>
      </q-card>
    </q-dialog>

    <!-- Rapport de combat (post-run) en MODALE : toutes les infos + réattaquer /
         inventaire / fermer -->
    <q-dialog v-model="reportOpen" position="top">
      <q-card v-if="run" class="report-modal" :class="run.cleared ? 'win' : 'lose'">
        <div class="rm-head">
          <div class="rm-title font-display">{{ run.name }}</div>
          <button
            v-if="stageDone && !char.row?.pending_reward"
            class="rm-reattack"
            :disabled="!canReattack"
            :title="`Réattaquer (${reattackCost} ⚡)`"
            aria-label="Réattaquer"
            @click="reattackLast"
          >
            ⚔️
          </button>
        </div>
        <!-- Corps scrollable : la carte garde une HAUTEUR FIXE → la tête (avec le
             bouton Réattaquer) et les actions ne bougent pas selon le contenu
             (drop ou non) → on peut spammer Réattaquer sans que le bouton se déplace. -->
        <div class="rm-body">
        <!-- Rejeu animé du combat (auto ; :key relance à chaque run). Le résultat et
             le butin ne sont révélés QU'À LA FIN de l'animation (@done). -->
        <!-- Boss : une fois l'animation finie et le CHOIX de récompense affiché, on
             masque l'arène (sinon elle reste ouverte au-dessus du choix). -->
        <div
          v-if="stageFights.length && !(stageDone && (char.row?.pending_reward || stageSkipped))"
          class="rm-stage-wrap"
        >
          <CombatStage
            :key="runSeq"
            :player-name="char.row?.pseudo ?? 'Toi'"
            :player-max-pv="run.playerMaxPv ?? 100"
            :fights="stageFights"
            :player-profile="c.profile"
            :player-equipped="char.row?.equipped ?? {}"
            @done="stageFinish"
          />
        </div>
        <template v-if="stageDone">
          <div class="result-head">
            <span>{{
              run.cleared ? (run.kind === 'boss' ? '🏆 Vaincu !' : '🏆 Nettoyé !') : '💀 Échec'
            }}</span>
            <span class="result-gains">
              <span class="gain-pill gold">+{{ run.gold }} 🪙</span>
              <span class="gain-pill dust">+{{ run.dust }} ✨</span>
            </span>
          </div>
          <div class="result-sub">
            <template v-if="run.kind === 'dungeon'"
              >{{ run.defeated }}/{{ run.total }} monstres ·
            </template>
            PV restants {{ run.finalPv }}
          </div>
        </template>
        <div v-if="stageDone" class="log">
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
        <div v-if="stageDone && run.drops.length" class="drops">
          <div class="drops-lbl">✨ Butin</div>
          <div v-for="d in run.drops" :key="d.id" class="drop" :class="'r-' + d.rarity">
            <span class="inv-emo">{{ d.emoji }}</span>
            <div class="inv-main">
              <div class="inv-name">{{ d.name }}</div>
              <div class="pills">
                <span class="gpill lvl">Lvl {{ d.level }}</span>
                <span class="gpill" :class="'p-' + d.rarity">{{ RARITY_LABEL[d.rarity] }}</span>
                <span v-if="d.setId" class="gpill set">🧩 Set</span>
              </div>
              <div class="inv-eff">{{ SLOT_LABEL[d.slot] }} · {{ itemEffects(d) }}</div>
              <div v-if="equippedInSlot(d.slot)" class="drop-cmp">
                <span
                  >Équipé : {{ RARITY_LABEL[equippedInSlot(d.slot)!.rarity] }} Nv
                  {{ equippedInSlot(d.slot)!.level }} ·
                  {{ itemEffects(equippedInSlot(d.slot)!) }}</span
                >
                <span class="rarity-verdict" :class="rarityVerdict(d).cls">{{
                  rarityVerdict(d).label
                }}</span>
              </div>
              <div v-else class="drop-cmp"><span class="rarity-verdict up">slot libre</span></div>
              <div class="pow-cmp">
                ⚔️ Puissance {{ fmtPow(combatPowerVal) }} →
                <b :class="powerIfEquip(d) >= combatPowerVal ? 'up' : 'down'"
                  >{{ fmtPow(powerIfEquip(d)) }} ({{ fmtDelta(combatPowerVal, powerIfEquip(d)) }})</b
                >
              </div>
              <div v-if="dropState(d) === 'equipped'" class="drop-done">
                ⚔️ Auto-équipé (slot vide)
              </div>
              <div v-else-if="dropState(d) === 'gone'" class="drop-done">✓ Retiré du sac</div>
              <div v-else class="inv-actions">
                <button
                  class="equip-btn"
                  @click="equippedInSlot(d.slot) ? openReplace(d) : doEquip(d.id)"
                >
                  {{ equippedInSlot(d.slot) ? 'Remplacer' : 'Équiper' }}
                </button>
                <button class="link-btn" @click="doSalvage(d)">Casser ✨{{ salvageValue(d) }}</button>
                <button class="link-btn" @click="doSell(d)">Vendre 🪙{{ sellValue(d) }}</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="stageDone && run.consumable" class="cons-drop">
          {{ run.consumable.emoji }} <b>{{ run.consumable.name }}</b> ajouté à ton sac 🎒
        </div>

        <!-- Récompense de boss AU CHOIX (à la place du butin) : 3 candidats, on en garde 1 -->
        <div v-if="stageDone && char.row?.pending_reward" class="rm-reward">
          <div class="drops-lbl">🎁 Choisis ta récompense</div>
          <div class="reward-list">
            <button
              v-for="(cand, i) in char.row.pending_reward.candidates"
              :key="i"
              class="reward-cand"
              :class="[
                cand.kind === 'item' ? 'r-' + cand.item.rarity : 'r-gold',
                { reco: i === recommendedRewardIndex },
              ]"
              :disabled="busy"
              @click="doChooseReward(i)"
            >
              <span v-if="i === recommendedRewardIndex" class="reco-badge">★ Conseillé</span>
              <template v-if="cand.kind === 'item'">
                <span class="rc-emo">{{ cand.item.emoji }}</span>
                <div class="rc-main">
                  <div class="rc-name">{{ cand.item.name }}</div>
                  <div class="rc-pills">
                    <span class="rc-pill lvl">Lvl {{ cand.item.level }}</span>
                    <span class="rc-pill" :class="'p-' + cand.item.rarity">{{
                      RARITY_LABEL[cand.item.rarity]
                    }}</span>
                    <span v-if="cand.item.setId" class="rc-pill set">🧩 Set</span>
                  </div>
                  <div class="rc-eff">
                    {{ SLOT_LABEL[cand.item.slot] }} · {{ itemEffects(cand.item) }}
                  </div>
                  <div class="pow-cmp">
                    ⚔️ Puissance {{ fmtPow(combatPowerVal) }} →
                    <b :class="powerIfEquip(cand.item) >= combatPowerVal ? 'up' : 'down'"
                      >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                        fmtDelta(combatPowerVal, powerIfEquip(cand.item))
                      }})</b
                    >
                  </div>
                  <div v-if="rewardDupNote(cand.item)" class="rc-dup">
                    {{ rewardDupNote(cand.item) }}
                  </div>
                </div>
              </template>
              <template v-else>
                <span class="rc-emo">💰</span>
                <div class="rc-main">
                  <div class="rc-name">Trésor</div>
                  <div class="rc-eff">+{{ cand.gold }} 🪙 · +{{ cand.dust }} ✨</div>
                </div>
              </template>
            </button>
          </div>
        </div>

        </div>
        <!-- Réglage persistant : sauter l'animation des combats gagnés d'avance -->
        <label class="rm-skip-toggle">
          <q-toggle v-model="autoSkipEasy" color="primary" dense size="sm" />
          <span>⏭ Passer les combats gagnés d'avance (≥ 90 %)</span>
        </label>

        <div class="rm-actions-row">
          <button class="rm-btn" @click="goInventoryFromReport">🎒 Inventaire</button>
          <button class="rm-btn" @click="reportOpen = false">Fermer</button>
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore, PseudoTakenError } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter, isValidPseudo, PROFILE_LABEL } from '@/lib/character';
import AventureAvatar from '@/components/AventureAvatar.vue';
import {
  simulateDungeon,
  simulateCombat,
  mulberry32,
  combatPower,
  fmtPow,
  fmtDelta,
  type CombatEvent,
} from '@/lib/combat';
import CombatStage from '@/components/CombatStage.vue';
import { MONSTERS } from '@/data/monsters';
import { DUNGEONS, dungeonFoes, dungeonGold, type Dungeon } from '@/data/dungeons';
import { BOSSES, type MilestoneBoss } from '@/data/bosses';
import {
  endlessFoe,
  endlessEnergy,
  endlessGold,
  endlessDust,
  endlessDropLevel,
} from '@/data/endless';
import {
  playerWithGear,
  aggregateEffects,
  rollDrop,
  rollSetPiece,
  effectLabel,
  canUpgrade,
  upgradeCost,
  salvageValue,
  sellValue,
  forgeCost,
  rerollCost,
  craftSetCost,
  SLOTS,
  SLOT_LABEL,
  SLOT_EMOJI,
  RARITY_LABEL,
  RARITY_RANK,
  ITEM_SETS,
  SET_BY_ID,
  setCounts,
  type Item,
  type ItemSlot,
  type AggregatedEffects,
  type RewardCandidate,
  type PendingReward,
} from '@/lib/items';
import {
  SHOP_ITEMS,
  CONSUMABLE_ITEMS,
  consumableEffect,
  rollConsumableDrop,
  shopItem,
} from '@/data/shop';
import {
  talentsEarned,
  talentEffects,
  talentChoices,
  talentByCode,
  type Talent,
} from '@/lib/talents';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import { unlocksAtLevel, upcomingUnlocks } from '@/lib/advUnlocks';
import {
  REGIONS,
  currentRegion,
  nextRegion,
  regionProgress,
  regionOfDungeon,
  regionMapGeometry,
  mapFillFraction,
  type Region,
} from '@/lib/regions';
import { bestiary, setCollection, codexSummary } from '@/lib/codex';
import { logicalToday } from '@/lib/challenges';

interface RunFight {
  monster: string;
  emoji: string;
  win: boolean;
  rounds: number;
  maxPv?: number; // PV max du monstre (barre du rejeu)
  log?: CombatEvent[]; // détail par coup → rejeu animé
}
interface RunView {
  name: string;
  kind: 'dungeon' | 'boss';
  cleared: boolean;
  defeated: number;
  total: number;
  gold: number;
  dust: number;
  finalPv: number;
  playerMaxPv?: number; // PV max du joueur (barre du rejeu)
  fights: RunFight[];
  drops: Item[];
  consumable?: { emoji: string; name: string };
}

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();

const loading = ref(true);
const saving = ref(false);
const pseudoInput = ref('');
const pseudoError = ref('');
const tab = ref<'perso' | 'equip' | 'donjons' | 'boss'>('perso');

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
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    c.value,
    char.row?.equipped ?? {},
    talentFx.value,
    c.value.level.level,
  ),
);
const combatPowerVal = computed(() => combatPower(fighter.value));
// Combattant SANS équipement ni talents (stats de fond seules) → base de la
// comparaison « avec / sans équipement » sur la fiche perso.
const baseFighter = computed(() =>
  playerWithGear(char.row?.pseudo ?? 'Toi', c.value, {}, {}, c.value.level.level),
);
const pctA = (x?: number) => Math.round((x ?? 0) * 100) + '%';
// Puissance de combat SI on équipait cet objet (remplace son slot) → tied au % de
// victoire : c'est l'indicateur qui dit « ça t'aide à aller plus loin ou pas ».
function powerIfEquip(it: Item): number {
  const eq = { ...(char.row?.equipped ?? {}), [it.slot]: it };
  return combatPower(
    playerWithGear(char.row?.pseudo ?? 'Toi', c.value, eq, talentFx.value, c.value.level.level),
  );
}

// Estimation live du % de victoire par donjon/boss selon les stats + le stuff
// ÉQUIPÉ actuel (Monte-Carlo seedé). Recalculé quand le perso/l'équipement change
// → on peut swapper du gear et voir l'effet. Clé : 'd:<id>' / 'b:<id>'.
const WINPCT_SEEDS = 40;
const winPct = computed<Record<string, number>>(() => {
  const stats = c.value;
  const eq = char.row?.equipped ?? {};
  const name = char.row?.pseudo ?? 'Toi';
  // Talents + consommables sélectionnés → le % reflète les buffs choisis pour le run.
  const fx = runExtra().extra;
  const lvl = c.value.level.level;
  const out: Record<string, number> = {};
  for (const d of DUNGEONS) {
    let w = 0;
    for (let s = 0; s < WINPCT_SEEDS; s++) {
      const p = playerWithGear(name, stats, eq, fx, lvl);
      if (simulateDungeon(p, dungeonFoes(d), { seed: s * 97 + 1 }).cleared) w++;
    }
    out['d:' + d.id] = Math.round((w / WINPCT_SEEDS) * 100);
  }
  for (const b of BOSSES) {
    let w = 0;
    for (let s = 0; s < WINPCT_SEEDS; s++) {
      const p = playerWithGear(name, stats, eq, fx, lvl);
      if (simulateCombat(p, b.combatant, { seed: s * 97 + 3, goldOnWin: 0 }).win) w++;
    }
    out['b:' + b.id] = Math.round((w / WINPCT_SEEDS) * 100);
  }
  return out;
});
function winClass(pct: number): string {
  if (pct >= 70) return 'wp-good';
  if (pct >= 30) return 'wp-mid';
  return 'wp-bad';
}
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
const levelBurst = ref<{ from: number; to: number; energy: number } | null>(null);
// Reveal de nouvelle région : célèbre le passage dans un biome inédit.
const regionBurst = ref<{ emoji: string; name: string; blurb: string; color: string } | null>(null);
let lastRegionId = '';
watch(
  () => curRegion.value.id,
  (id) => {
    // Pas au chargement initial : uniquement quand on ENTRE dans une nouvelle région.
    if (lastRegionId && id !== lastRegionId) {
      const r = curRegion.value;
      regionBurst.value = { emoji: r.emoji, name: r.name, blurb: r.blurb, color: r.color };
      setTimeout(() => (regionBurst.value = null), 5200);
      // La carte : le cadenas de la région fraîchement débloquée explose.
      shatterId.value = id;
      selectedRegionId.value = id; // ouvre la nouvelle région dans le drawer
      setTimeout(() => (shatterId.value = null), 1400);
    }
    lastRegionId = id;
  },
);
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

// Prochains déblocages (timeline « À venir » de l'onglet Perso) — donne envie de
// monter (« encore 2 niveaux et j'ouvre le Dragon »).
const upcoming = computed(() => upcomingUnlocks(c.value.level.level, 3));

// Régions / biomes (onglet Donjons) : bandeau de la région courante + teaser de la
// suivante → sensation de « découvrir de nouveaux mondes ».
const clearedIds = computed(() => char.row?.cleared_dungeons ?? []);
const curRegion = computed(() => currentRegion(clearedIds.value));
const curRegionProg = computed(() => regionProgress(curRegion.value, clearedIds.value));
const nxtRegion = computed(() => nextRegion(clearedIds.value));

// ── Carte-monde serpentine des régions ──
const mapGeom = regionMapGeometry(REGIONS.length);
const currentRegionIndex = computed(() => REGIONS.findIndex((r) => r.id === curRegion.value.id));
const mapFill = computed(() =>
  mapFillFraction(
    currentRegionIndex.value,
    curRegionProg.value.total ? curRegionProg.value.done / curRegionProg.value.total : 0,
    REGIONS.length,
  ),
);
// État d'une région : 'done' (tous nettoyés) / 'current' (frontière) / 'locked'.
function regionCleared(r: Region): boolean {
  const cleared = clearedSet.value;
  return r.dungeonIds.every((id) => cleared.has(id));
}
function regionState(r: Region): 'done' | 'current' | 'locked' {
  if (regionCleared(r)) return 'done';
  const i = REGIONS.findIndex((x) => x.id === r.id);
  if (i > currentRegionIndex.value) return 'locked';
  return 'current';
}
// Nœud : position en % dans la viewBox de la carte.
function nodeStyle(i: number) {
  const n = mapGeom.nodes[i]!;
  return { left: n.x + '%', top: (n.y / mapGeom.viewH) * 100 + '%' };
}
function regionDone(r: Region): number {
  return regionProgress(r, clearedIds.value).done;
}
// Région sélectionnée (drawer de donjons dessous). Défaut = région courante.
const selectedRegionId = ref<string | null>(null);
const selRegion = computed(
  () => REGIONS.find((r) => r.id === selectedRegionId.value) ?? curRegion.value,
);
const selectedRegionItems = computed(() =>
  adventureItems.value.filter((it) => selRegion.value.dungeonIds.includes(it.dungeon.id)),
);
const drawerEl = ref<HTMLElement | null>(null);
function tapRegion(r: Region) {
  if (regionState(r) === 'locked') {
    const prev = REGIONS[REGIONS.findIndex((x) => x.id === r.id) - 1];
    $q.notify({
      type: 'warning',
      message: prev
        ? `Brise les chaînes en terminant « ${prev.name} » d'abord.`
        : 'Région verrouillée.',
    });
    return;
  }
  selectedRegionId.value = r.id;
  // Fait défiler vers les donjons de la région (sinon le drawer, sous la carte,
  // reste hors écran → on croit que le clic ne fait rien).
  void nextTick(() => drawerEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
// Explosion des chaînes quand une région vient d'être débloquée (piloté par le reveal).
const shatterId = ref<string | null>(null);
// Dernière région (fin de monde) — la Faille sans fin s'y rattache.
const endRegionId = computed(() => REGIONS[REGIONS.length - 1]?.id);

// Codex (méta de collection) : bestiaire + journal des sets. Tout dérivé.
const codexOpen = ref(false);
const codexSum = computed(() =>
  codexSummary(
    clearedIds.value,
    char.row?.equipped ?? {},
    char.row?.inventory ?? [],
    char.row?.defeated_bosses ?? [],
  ),
);
const bestiaryList = computed(() => bestiary(clearedIds.value));
const setsList = computed(() =>
  setCollection(char.row?.equipped ?? {}, char.row?.inventory ?? [], char.row?.defeated_bosses ?? []),
);
const bossNameById = (id: string | undefined) => BOSSES.find((b) => b.id === id)?.name ?? '';
// Déblocages franchis lors du dernier level-up (from → to) → affichés sur l'écran
// de montée de niveau. Peut couvrir plusieurs niveaux d'un coup.
const levelBurstUnlocks = computed(() => {
  const lb = levelBurst.value;
  if (!lb) return [];
  const out = [];
  for (let lvl = lb.from + 1; lvl <= lb.to; lvl++) out.push(...unlocksAtLevel(lvl));
  return out;
});

// Talents acquis regroupés (empilables) → carte par talent avec effet CUMULÉ.
const talentSummary = computed(() => {
  const counts = new Map<string, number>();
  for (const code of char.row?.talents ?? []) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()]
    .map(([code, count]) => {
      const t = talentByCode(code);
      return t ? { code, count, talent: t, total: talentTotalLabel(t, count) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
});

// Libellé de l'effet cumulé : « +20 % dégâts » pour un talent pris 2 fois.
function talentTotalLabel(t: Talent, count: number): string {
  if (count <= 1) return t.desc;
  const eff = t.effect as Record<string, number | undefined>;
  const key = Object.keys(eff)[0];
  const base = key ? (eff[key] ?? 0) : 0;
  const pct = Math.round(base * count * 100);
  const noun = t.desc.replace(/^\+\s*[\d.]+\s*%?\s*/, '');
  return `+${pct} % ${noun}`.trim();
}

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
const reportOpen = ref(false); // rapport de combat affiché en MODALE (post-run)
const runSeq = ref(0); // clé de rejeu → remonte CombatStage à chaque run (relance l'anim)
const stageDone = ref(true); // résultat + butin révélés seulement à la FIN de l'animation
// Notif de résultat (victoire/défaite) DIFFÉRÉE : elle ne s'affiche qu'à la fin de
// l'animation de combat (sinon elle « spoile » avant la fin — cf. ticket).
const pendingNotify = ref<{ type: string; message: string } | null>(null);
function flushNotify() {
  if (pendingNotify.value) {
    $q.notify(pendingNotify.value);
    pendingNotify.value = null;
  }
}
const stageSkipped = ref(false); // animation passée (auto sur donjon facile)
// Réglage persistant : passer automatiquement l'animation des combats gagnés
// d'avance (≥ 90 %) → droit au résultat + butin.
const AUTOSKIP_KEY = 'muscu:adv:autoskip';
const autoSkipEasy = ref(localStorage.getItem(AUTOSKIP_KEY) === '1');
watch(autoSkipEasy, (v) => localStorage.setItem(AUTOSKIP_KEY, v ? '1' : '0'));
function stageFinish() {
  stageDone.value = true;
  flushNotify();
}
// Combats rejouables (avec log détaillé) → alimente CombatStage.
const stageFights = computed(() =>
  (run.value?.fights ?? [])
    .filter((f) => f.log?.length)
    .map((f) => ({ name: f.monster, emoji: f.emoji, maxPv: f.maxPv ?? 1, log: f.log! })),
);
// Après un run : replie la liste, ouvre la modale de rapport, et l'animation de
// combat se (re)lance automatiquement (runSeq change → CombatStage remonte).
function openReport() {
  runSeq.value++;
  // Résultat/butin masqués tant que l'animation joue (révélés à la fin). Si pas de
  // rejeu (pas de log), on montre tout de suite.
  // Auto-skip si le réglage est actif ET la victoire était quasi acquise (≥ 90 %).
  const auto = autoSkipEasy.value && canSkipStage.value;
  stageDone.value = !stageFights.value.length || auto;
  stageSkipped.value = auto;
  reportOpen.value = true;
  if (stageDone.value) flushNotify(); // pas d'animation → notif tout de suite
}
// « Passer l'animation » proposé quand la victoire était quasi acquise (≥ 90 %)
// sur un donjon → pas de suspense à regarder.
const canSkipStage = computed(() => {
  const d = lastDungeon.value;
  return !!d && (winPct.value['d:' + d.id] ?? 0) >= 90;
});
// Dernier lieu combattu → « Réattaquer » relance exactement le même run.
const lastDungeon = ref<Dungeon | null>(null);
const lastBoss = ref<MilestoneBoss | null>(null);
const lastEndless = ref(false); // dernier run = Faille sans fin
const reattackCost = computed(() => {
  if (lastEndless.value) return endlessEnergy(nextEndlessTier.value);
  if (lastBoss.value) return lastBoss.value.energyCost;
  if (lastDungeon.value) return lastDungeon.value.energyCost;
  return 0;
});
const canReattack = computed(
  () => !busy.value && !char.row?.pending_reward && c.value.energy >= reattackCost.value,
);
// Réattaque SANS fermer la modale (le run met à jour `run` en place → on peut
// spammer le bouton icône). Les gardes énergie/déblocage/récompense sont dans les
// fonctions de run.
function reattackLast() {
  if (lastEndless.value) void fightEndless();
  else if (lastBoss.value) void fightBoss(lastBoss.value);
  else if (lastDungeon.value) void explore(lastDungeon.value);
}
function goInventoryFromReport() {
  reportOpen.value = false;
  tab.value = 'equip';
}

// Butin possible d'un donjon (affiché à la demande via 🎁).
const dropInfo = ref<Dungeon | null>(null);
function openDrops(d: Dungeon) {
  dropInfo.value = d;
}
// Chances de rareté d'un drop selon la chance du donjon (miroir de rollRarity, items.ts).
function rarityOdds(luck: number) {
  const l = Math.min(1, Math.max(0, luck));
  // Aligné sur rollRarity : seuils cumulés divin < légendaire < épique < rare.
  const divin = 0.004 + l * 0.02;
  const leg = 0.02 + l * 0.08 - divin;
  const epic = 0.12 + l * 0.2 - (0.02 + l * 0.08);
  const rare = 0.4 + l * 0.32 - (0.12 + l * 0.2);
  const common = Math.max(0, 1 - 0.4 - l * 0.32);
  return [
    { label: 'Commun', pct: Math.round(common * 100), cls: 'r-common' },
    { label: 'Rare', pct: Math.round(rare * 100), cls: 'r-rare' },
    { label: 'Épique', pct: Math.round(epic * 100), cls: 'r-epic' },
    { label: 'Légendaire', pct: Math.round(leg * 100), cls: 'r-legendary' },
    { label: 'Divin', pct: Math.round(divin * 100), cls: 'r-divin' },
  ];
}

// Liste des DONJONS (onglet Donjons), ordonnée par niveau. Les boss de palier ont
// leur propre onglet « Boss » (cf. bossChain).
const adventureItems = computed(() =>
  [...DUNGEONS]
    .sort((a, b) => a.recoLevel - b.recoLevel)
    .map((d) => ({ key: 'd:' + d.id, lvl: d.recoLevel, dungeon: d })),
);
// État visuel d'un item (pour la pastille de niveau colorée + le repli).
function itemState(it: { dungeon?: Dungeon; boss?: MilestoneBoss }): 'done' | 'avail' | 'locked' {
  if (itemDone(it)) return 'done';
  const unlocked = it.boss ? bossUnlocked(it.boss) : dungeonUnlocked(it.dungeon!);
  return unlocked ? 'avail' : 'locked';
}

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
// Achat par lot : quantité choisie par article, PAR DÉFAUT le max abordable
// (évite de spammer le bouton). `shopQty` ne stocke que les choix explicites ;
// sinon on retombe sur le max abordable courant (auto-recalculé après achat).
const shopQty = ref<Record<string, number>>({});
function maxBuy(item: (typeof SHOP_ITEMS)[number]): number {
  return Math.max(1, Math.floor((char.row?.gold ?? 0) / item.cost));
}
function qtyFor(item: (typeof SHOP_ITEMS)[number]): number {
  const chosen = shopQty.value[item.id];
  return Math.min(chosen ?? maxBuy(item), maxBuy(item));
}
function bumpQty(item: (typeof SHOP_ITEMS)[number], delta: number) {
  shopQty.value = {
    ...shopQty.value,
    [item.id]: Math.min(maxBuy(item), Math.max(1, qtyFor(item) + delta)),
  };
}
async function buy(item: (typeof SHOP_ITEMS)[number]) {
  const uid = auth.user?.id;
  if (!uid) return;
  const n = qtyFor(item);
  if ((char.row?.gold ?? 0) < item.cost * n) {
    $q.notify({ type: 'warning', message: "Pas assez d'or." });
    return;
  }
  try {
    const ok = await char.buyItem(uid, item, n);
    if (ok) {
      delete shopQty.value[item.id]; // réinitialise → redéfaut au nouveau max
      $q.notify({
        type: 'positive',
        position: 'top',
        message: `${item.emoji} ${item.name} ×${n} acheté${n > 1 ? 's' : ''} !`,
      });
    }
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
// Avertit si une pièce de set proposée en récompense fait DOUBLON : soit le slot
// porte déjà cette pièce de set (aucun gain de palier), soit une copie traîne déjà
// dans le sac. Évite de « choisir un doublon sans le savoir ».
function rewardDupNote(item: Item): string {
  if (!item.setId) return '';
  const eq = equippedInSlot(item.slot);
  if (eq?.setId === item.setId) return '⚠ Cette pièce de set est déjà équipée sur cet emplacement';
  const inBag = (char.row?.inventory ?? []).some(
    (i) => i.setId === item.setId && i.slot === item.slot,
  );
  if (inBag) return '⚠ Tu as déjà cette pièce de set dans ton sac';
  return '';
}
// Valeur d'un candidat de récompense → PROFIL-AWARE : on mesure la PUISSANCE DE
// COMBAT du joueur s'il équipait l'objet (avec ses vraies stats + ses sets + ses
// talents). La reco conseille donc l'objet qui le rend le plus fort POUR SON BUILD
// (un coureur préférera PV/vol de vie/crit, un muscu les dégâts…), pas la plus
// grosse magnitude brute. → aide à aller le plus loin possible.
function rewardScore(cand: RewardCandidate): number {
  const base = combatPowerVal.value; // puissance actuelle (loadout courant)
  if (cand.kind === 'gold') {
    // Ressources : ne changent pas la puissance → à peine au-dessus du statu quo,
    // donc conseillées seulement si aucun objet n'est une vraie amélioration.
    return base + cand.dust * 0.05 + cand.gold * 0.01;
  }
  const it = cand.item;
  const eq = { ...(char.row?.equipped ?? {}), [it.slot]: it };
  const p = playerWithGear(char.row?.pseudo ?? 'Toi', c.value, eq, talentFx.value, c.value.level.level);
  let s = combatPower(p);
  if (it.setId && !rewardDupNote(it)) s += base * 0.05; // petit bonus « avance un set »
  return s;
}
// Index du candidat conseillé (meilleur score). -1 si pas de récompense en attente.
const recommendedRewardIndex = computed(() => {
  const cands = char.row?.pending_reward?.candidates ?? [];
  if (!cands.length) return -1;
  let best = 0;
  for (let i = 1; i < cands.length; i++)
    if (rewardScore(cands[i]!) > rewardScore(cands[best]!)) best = i;
  return best;
});
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
// Déblocage DÉCOUPLÉ (2 chaînes indépendantes) : les donjons se débloquent ENTRE
// EUX (donjon précédent nettoyé), les boss ENTRE EUX (boss précédent vaincu). Un
// boss ne bloque plus jamais les donjons → plus de farm forcé. AUCUN gate de
// niveau : battre le précédent suffit (le 🎯 % de victoire prévient si c'est perdu
// d'avance). Le niveau affiché reste indicatif (conseillé).
const dungeonChain = computed(() => [...DUNGEONS].sort((a, b) => a.recoLevel - b.recoLevel));
const bossChain = computed(() => [...BOSSES].sort((a, b) => a.unlockLevel - b.unlockLevel));
function itemDone(it: { dungeon?: Dungeon; boss?: MilestoneBoss }): boolean {
  return it.boss ? defeatedBossSet.value.has(it.boss.id) : clearedSet.value.has(it.dungeon!.id);
}
function dungeonUnlocked(d: Dungeon): boolean {
  const order = dungeonChain.value;
  const i = order.findIndex((x) => x.id === d.id);
  return i <= 0 || clearedSet.value.has(order[i - 1]!.id);
}
function prevDungeonName(d: Dungeon): string {
  const order = dungeonChain.value;
  const i = order.findIndex((x) => x.id === d.id);
  return i > 0 ? order[i - 1]!.name : '';
}

async function explore(d: Dungeon) {
  const uid = auth.user?.id;
  if (!uid || !char.row || busy.value || c.value.energy < d.energyCost) return;
  if (!dungeonUnlocked(d)) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastDungeon.value = d;
  lastBoss.value = null;
  lastEndless.value = false;
  busy.value = true;
  try {
    // Consommables sélectionnés pour ce run (buffs + chance de butin).
    const consumed = [...selectedConsumables.value];
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(char.row.pseudo, c.value, char.row.equipped, extra, c.value.level.level);
    const r = simulateDungeon(player, dungeonFoes(d), { seed });
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = Math.round(r.gold * (1 + goldPct));
    // Butin (RNG dérivé du seed du run).
    const dropRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const drops: Item[] = [];
    const rolled = rollDrop(dropRng, {
      cleared: r.cleared,
      defeated: r.defeated,
      level: d.dropLevel,
      spread: 1, // le donjon peut lâcher un cran sous son niveau (fourrage à upgrader)
      luck: Math.min(1, d.dropLuck + (lucky ? 0.5 : 0)),
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
      kind: 'dungeon',
      cleared: r.cleared,
      defeated: r.defeated,
      total: r.total,
      gold,
      dust,
      finalPv: r.finalPv,
      playerMaxPv: player.pv,
      fights: r.fights.map((f) => ({
        monster: f.monster,
        emoji: MONSTERS.find((m) => m.name === f.monster)?.emoji ?? '👾',
        win: f.win,
        rounds: f.result.rounds,
        maxPv: MONSTERS.find((m) => m.name === f.monster)?.pv,
        log: f.result.log,
      })),
      drops,
      ...(consDrop ? { consumable: { emoji: consDrop.emoji, name: consDrop.name } } : {}),
    };
    pendingNotify.value = r.cleared
      ? { type: 'positive', message: `Donjon nettoyé — +${gold} 🪙` }
      : null;
    openReport();
  } catch {
    $q.notify({ type: 'negative', message: 'Échec de l’exploration.' });
  } finally {
    busy.value = false;
  }
}

// ── Boss de palier ──
const defeatedBossSet = computed(() => new Set(char.row?.defeated_bosses ?? []));
// Sets DÉBLOQUÉS = ceux dont le boss de palier a été vaincu → seuls forgeables à
// l'atelier (on ne fabrique pas un set qu'on n'a pas encore gagné en combat).
const craftableSets = computed(() =>
  ITEM_SETS.filter((s) => BOSSES.some((b) => b.setId === s.id && defeatedBossSet.value.has(b.id))),
);
function isBossBeaten(b: MilestoneBoss): boolean {
  return defeatedBossSet.value.has(b.id);
}
// Déblocage : chaîne des BOSS uniquement (boss précédent vaincu). Pas de gate de
// niveau → le 🎯 % de victoire indique si le combat est jouable.
function bossUnlocked(b: MilestoneBoss): boolean {
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i <= 0 || defeatedBossSet.value.has(order[i - 1]!.id);
}
function bossLockReason(b: MilestoneBoss): string {
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i > 0 ? `Bats d’abord « ${order[i - 1]!.name} »` : '';
}
function bossSet(b: MilestoneBoss) {
  return SET_BY_ID[b.setId]!; // garanti par les données (cf. test bosses.test.ts)
}

// Libellé des 2 stats d'un objet (primaire · secondaire). Les anciens objets
// (1 stat) n'affichent que la primaire.
function itemEffects(it: Item): string {
  const a = effectLabel(it.effect, it.level);
  return it.effect2 ? `${a} · ${effectLabel(it.effect2, it.level)}` : a;
}
// Nombre de pièces du set d'un boss possédées (équipées + sac).
// Pièces du set du boss ACTUELLEMENT ÉQUIPÉES (≤ 4 slots) — pas celles du sac,
// pour que le compteur colle aux paliers 2/3/4 (jamais « 6/4 »).
function bossSetCount(b: MilestoneBoss): number {
  const r = char.row;
  if (!r) return 0;
  return SLOTS.map((s) => r.equipped[s]).filter((it) => it?.setId === b.setId).length;
}

// Aperçu du bonus de set d'un boss (modale ouverte au clic sur la ligne de set).
const setInfo = ref<{ set: ReturnType<typeof bossSet>; level: number; count: number } | null>(null);
function openSetInfo(b: MilestoneBoss) {
  setInfo.value = { set: bossSet(b), level: b.unlockLevel, count: bossSetCount(b) };
}

// Tire les 3 récompenses au CHOIX d'un boss (mixte : pièce de set / objet de
// donjon / lot or+poussière), aléatoire complet et seedé (anti-reroll).
function rollBossRewards(b: MilestoneBoss, rng: () => number, lucky: boolean): RewardCandidate[] {
  const luck = Math.min(1, 0.3 + (lucky ? 0.5 : 0));
  const out: RewardCandidate[] = [];
  for (let n = 0; n < 3; n++) {
    const roll = rng();
    // Proba de SET réduite (0.4) : une pièce de set est un butin rare et important.
    if (roll < 0.4) {
      const p = rollSetPiece(rng, { setId: b.setId, level: b.dropLevel, luck });
      out.push({ kind: 'item', item: { ...p, id: crypto.randomUUID() } });
    } else if (roll < 0.8) {
      let d: ReturnType<typeof rollDrop> = null;
      for (let i = 0; i < 5 && !d; i++)
        d = rollDrop(rng, { cleared: true, defeated: 1, level: b.dropLevel, luck });
      const p = d ?? rollSetPiece(rng, { setId: b.setId, level: b.dropLevel, luck });
      out.push({ kind: 'item', item: { ...p, id: crypto.randomUUID() } });
    } else {
      // Cache de ressources : doit rivaliser avec une pièce d'équipement. Or plein
      // + poussière de l'ordre de ~3 niveaux d'amélioration d'un légendaire à ce
      // palier → vaut le coup quand ton stuff est déjà bon et que tu veux le monter.
      const dustLump = upgradeCost(b.dropLevel, 'legendary') * 3;
      out.push({ kind: 'gold', gold: b.gold, dust: dustLump });
    }
  }
  return out;
}

async function fightBoss(b: MilestoneBoss) {
  const uid = auth.user?.id;
  if (!uid || !char.row || busy.value || c.value.energy < b.energyCost) return;
  if (!bossUnlocked(b)) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastBoss.value = b;
  lastDungeon.value = null;
  lastEndless.value = false;
  busy.value = true;
  try {
    const consumed = [...selectedConsumables.value];
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(char.row.pseudo, c.value, char.row.equipped, extra, c.value.level.level);
    const r = simulateCombat(player, b.combatant, { seed, goldOnWin: b.gold });
    const win = r.win;
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = win ? Math.round(b.gold * (1 + goldPct)) : 0;
    const dust = win ? 15 : 0;
    // Victoire → 3 récompenses au CHOIX (posées en attente ; réclamées via la modale).
    const pending: PendingReward | null = win
      ? {
          source: `boss:${b.id}`,
          candidates: rollBossRewards(b, mulberry32((seed ^ 0x9e3779b9) >>> 0), lucky),
        }
      : null;
    const finalPv = r.log.length ? r.log[r.log.length - 1]!.playerPv : player.pv;
    await char.applyBossWin(uid, {
      bossId: b.id,
      energyCost: b.energyCost,
      gold,
      dust,
      defeated: win,
      pending,
      ...(consumed.length ? { consumed } : {}),
    });
    selectedConsumables.value = [];
    run.value = {
      name: b.name,
      kind: 'boss',
      cleared: win,
      defeated: win ? 1 : 0,
      total: 1,
      gold,
      dust,
      finalPv,
      playerMaxPv: player.pv,
      fights: [
        { monster: b.name, emoji: b.emoji, win, rounds: r.rounds, maxPv: b.combatant.pv, log: r.log },
      ],
      drops: [],
    };
    // Rapport toujours ouvert : sur victoire, il affiche le CHOIX de récompense en
    // bas (à la place du butin) ; sur défaite, juste le résultat.
    pendingNotify.value = win
      ? { type: 'positive', message: `${b.emoji} ${b.name} vaincu — choisis ta récompense !` }
      : { type: 'warning', message: `${b.name} t’a terrassé… reviens plus fort.` };
    openReport();
  } catch {
    $q.notify({ type: 'negative', message: 'Échec du combat.' });
  } finally {
    busy.value = false;
  }
}
// Choix d'une récompense parmi les 3 candidats en attente.
function doChooseReward(index: number) {
  withUid(
    (uid) =>
      char
        .chooseReward(uid, index)
        .then(() => $q.notify({ type: 'positive', message: 'Récompense récupérée !' })),
    'Impossible de récupérer la récompense.',
  );
}

// ── Faille sans fin (end-game infini) ──
// La Faille sans fin est le tout dernier maillon : débloquée une fois le boss
// final (Archidémon) vaincu — soit après toute la chaîne donjons + boss.
const endlessUnlocked = computed(() => defeatedBossSet.value.has('archidemon'));
const endlessBest = computed(() => char.row?.endless_best ?? 0);
const nextEndlessTier = computed(() => endlessBest.value + 1);

async function fightEndless() {
  const uid = auth.user?.id;
  const tier = nextEndlessTier.value;
  const cost = endlessEnergy(tier);
  if (!uid || !char.row || busy.value || c.value.energy < cost || !endlessUnlocked.value) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastBoss.value = null;
  lastDungeon.value = null;
  lastEndless.value = true;
  busy.value = true;
  try {
    const consumed = [...selectedConsumables.value];
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(char.row.pseudo, c.value, char.row.equipped, extra, c.value.level.level);
    const foe = endlessFoe(tier);
    const r = simulateCombat(player, foe, { seed, goldOnWin: endlessGold(tier) });
    const win = r.win;
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = win ? Math.round(endlessGold(tier) * (1 + goldPct)) : 0;
    const dust = win ? endlessDust(tier) : 0;
    const drops: Item[] = [];
    if (win) {
      // Butin GARANTI de haut niveau (niv > 25) : plusieurs tirages pour éviter le null.
      let rolled: ReturnType<typeof rollDrop> = null;
      for (let i = 0; i < 6 && !rolled; i++) {
        rolled = rollDrop(mulberry32((seed ^ (0x51ed270b + i)) >>> 0), {
          cleared: true,
          defeated: 1,
          level: endlessDropLevel(tier),
          luck: Math.min(1, 0.6 + (lucky ? 0.4 : 0)),
        });
      }
      if (rolled) drops.push({ ...rolled, id: crypto.randomUUID() });
    }
    const finalPv = r.log.length ? r.log[r.log.length - 1]!.playerPv : player.pv;
    await char.applyEndless(uid, {
      tier,
      energyCost: cost,
      gold,
      dust,
      drops,
      cleared: win,
      ...(consumed.length ? { consumed } : {}),
    });
    selectedConsumables.value = [];
    run.value = {
      name: `Faille sans fin · palier ${tier}`,
      kind: 'boss',
      cleared: win,
      defeated: win ? 1 : 0,
      total: 1,
      gold,
      dust,
      finalPv,
      playerMaxPv: player.pv,
      fights: [{ monster: foe.name, emoji: '🌀', win, rounds: r.rounds, maxPv: foe.pv, log: r.log }],
      drops,
    };
    pendingNotify.value = win
      ? { type: 'positive', message: `Palier ${tier} franchi — +${gold} 🪙` }
      : { type: 'warning', message: `Palier ${tier} : la Faille t'a repoussé.` };
    openReport();
  } catch {
    $q.notify({ type: 'negative', message: 'Échec du combat.' });
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

// ── Sac : filtre par type d'objet + tri (meilleurs d'abord) ──
const invFilter = ref<ItemSlot | 'all'>('all');
function bagCountForSlot(slot: ItemSlot): number {
  return (char.row?.inventory ?? []).filter((i) => i.slot === slot).length;
}
const filteredInventory = computed<Item[]>(() => {
  const inv = char.row?.inventory ?? [];
  return inv
    .filter((i) => invFilter.value === 'all' || i.slot === invFilter.value)
    .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.level - a.level);
});

function doEquip(itemId: string) {
  withUid((uid) => char.equip(uid, itemId), 'Impossible d’équiper.');
}
// Remplacement d'un objet équipé : le joueur choisit dans une modale ce qu'il
// advient de l'ancien (garder au sac / recycler → poussière / vendre → or).
const replaceTarget = ref<Item | null>(null);
function openReplace(drop: Item) {
  replaceTarget.value = drop;
}
function confirmReplace(disposal: 'salvage' | 'sell' | 'keep') {
  const drop = replaceTarget.value;
  if (!drop) return;
  replaceTarget.value = null;
  const old = equippedInSlot(drop.slot);
  let message = 'Équipé';
  if (old && disposal === 'salvage') message = `Équipé · ancien cassé (+${salvageValue(old)} ✨)`;
  else if (old && disposal === 'sell') message = `Équipé · ancien vendu (+${sellValue(old)} 🪙)`;
  else if (old) message = 'Équipé · ancien rangé au sac';
  withUid(
    (uid) =>
      char
        .equipReplacing(uid, drop.id, disposal)
        .then(() => $q.notify({ type: 'positive', position: 'top', message })),
    'Action impossible.',
  );
}
function doUnequip(slot: ItemSlot) {
  withUid((uid) => char.unequip(uid, slot), 'Impossible de déséquiper.');
}
function doUpgrade(itemId: string) {
  withUid((uid) => char.upgradeItem(uid, itemId, c.value.level.level), 'Amélioration impossible.');
}

// ── Atelier de poussière (forge / reroll / sublimer / craft de set) ──
const forgeSlotOpen = ref(false);
const craftOpen = ref(false);
const craftSetId = ref<string>(ITEM_SETS[0]?.id ?? '');
const craftSlot = ref<ItemSlot>('weapon');
function doForge(slot?: ItemSlot) {
  forgeSlotOpen.value = false;
  withUid(
    (uid) =>
      char
        .forge(uid, { level: c.value.level.level, ...(slot ? { slot } : {}) })
        .then(() =>
          $q.notify({ type: 'positive', position: 'top', message: 'Objet forgé — au sac 🎒' }),
        ),
    'Forge impossible.',
  );
}
function doReroll(it: Item) {
  withUid(
    (uid) =>
      char
        .rerollEffect(uid, it.id)
        .then(() => $q.notify({ type: 'positive', position: 'top', message: 'Effet rerollé ♻️' })),
    'Reroll impossible.',
  );
}
function openCraft() {
  // Garantit un set sélectionné valide (parmi les débloqués) avant d'ouvrir.
  if (!craftableSets.value.some((s) => s.id === craftSetId.value))
    craftSetId.value = craftableSets.value[0]?.id ?? '';
  craftOpen.value = true;
}
function doCraftSet() {
  craftOpen.value = false;
  withUid(
    (uid) =>
      char
        .craftSet(uid, {
          level: c.value.level.level,
          setId: craftSetId.value,
          slot: craftSlot.value,
        })
        .then(() =>
          $q.notify({ type: 'positive', position: 'top', message: 'Pièce de set forgée 🧩' }),
        ),
    'Forge de set impossible.',
  );
}
function doSell(it: Item) {
  withUid(
    (uid) =>
      char
        .sell(uid, it.id)
        .then(() => $q.notify({ type: 'positive', position: 'top', message: `+${sellValue(it)} 🪙` })),
    'Vente impossible.',
  );
}
function doToggleLock(it: Item) {
  withUid((uid) => char.toggleLock(uid, it.id), 'Action impossible.');
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
        .then(() =>
          $q.notify({ type: 'positive', position: 'top', message: `+${salvageValue(it)} ✨ poussière` }),
        ),
    'Recyclage impossible.',
  );
}
// Nettoyage en masse : objets du sac moins rares que l'équipé du même slot.
// Slot ciblé par le nettoyage en masse = le filtre du sac actif (sinon tous).
const bulkSlot = computed<ItemSlot | undefined>(() =>
  invFilter.value === 'all' ? undefined : invFilter.value,
);
// Puissance de l'objet MONTÉ À TON NIVEAU (poussière) → on prend en compte
// l'écart de niveau : un objet bas niveau n'est « faible » que s'il l'est ENCORE
// une fois monté au max possible (= ton niveau). Évite de casser une pépite
// sous-leveled.
function itemMaxedPower(it: Item): number {
  const lvl = c.value.level.level;
  return powerIfEquip(it.level >= lvl ? it : { ...it, level: lvl });
}
// Objets du sac qui N'AMÉLIORENT PAS ta puissance si équipés (même montés à ton
// niveau) → candidats à la casse/vente en masse. Le `<=` inclut les DOUBLONS de
// l'équipé (égalité de puissance) en plus des objets plus faibles ; un doublon
// montable AU-DESSUS de l'équipé donne, lui, plus de puissance → conservé.
const powerLossItems = computed<Item[]>(() => {
  const r = char.row;
  if (!r) return [];
  return r.inventory.filter((it) => {
    if (it.locked) return false; // 🔒 protégé de la casse/vente en masse
    if (bulkSlot.value && it.slot !== bulkSlot.value) return false;
    return itemMaxedPower(it) <= combatPowerVal.value;
  });
});
const belowCount = computed(() => powerLossItems.value.length);
// Libellé du périmètre (« du sac » ou « [type] ») pour être explicite.
const bulkScope = computed(() =>
  bulkSlot.value ? SLOT_LABEL[bulkSlot.value].toLowerCase() : 'ton sac',
);
function doSalvageBelow() {
  const ids = powerLossItems.value.map((i) => i.id);
  $q.dialog({
    title: 'Casser les objets inutiles',
    message: `Casser les ${ids.length} objet(s) de ${bulkScope.value} qui n'améliorent pas ta puissance — faibles ou doublons de l'équipé (même montés à ton niveau) → poussière ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Casser', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid(
      (uid) =>
        char
          .salvageMany(uid, ids)
          .then((n) =>
            $q.notify({ type: 'positive', position: 'top', message: `${n} objet(s) cassé(s) en poussière.` }),
          ),
      'Recyclage impossible.',
    ),
  );
}
function doSellBelow() {
  const ids = powerLossItems.value.map((i) => i.id);
  $q.dialog({
    title: 'Vendre les objets inutiles',
    message: `Vendre les ${ids.length} objet(s) de ${bulkScope.value} qui n'améliorent pas ta puissance — faibles ou doublons de l'équipé (même montés à ton niveau) → or ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Vendre', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid(
      (uid) =>
        char
          .sellMany(uid, ids)
          .then((n) => $q.notify({ type: 'positive', position: 'top', message: `${n} objet(s) vendu(s).` })),
      'Vente impossible.',
    ),
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

// Bonus de passage de niveau : réclamé dès que les données de fond sont prêtes
// (niveau réel) et qu'un perso existe. Idempotent (reward_level persisté).
let claimingLevel = false;
watch(
  () => [progress.ready.value, char.row ? c.value.level.level : 0] as [boolean, number],
  async ([rdy, lvl]: [boolean, number]) => {
    const uid = auth.user?.id;
    if (!rdy || !char.row || lvl < 1 || claimingLevel || !uid) return;
    claimingLevel = true;
    try {
      const r = await char.claimLevelUps(uid, lvl);
      if (r) {
        levelBurst.value = r;
        // Plus long s'il y a des déblocages à lire (sinon simple montée).
        const hasUnlocks = levelBurstUnlocks.value.length > 0;
        setTimeout(() => (levelBurst.value = null), hasUnlocks ? 7000 : 3200);
      }
    } finally {
      claimingLevel = false;
    }
  },
  { immediate: true },
);

// Onboarding : mini-guide affiché une seule fois (persisté en localStorage).
const INTRO_KEY = 'muscu:adv:intro';
const showIntro = ref(false);
function dismissIntro() {
  showIntro.value = false;
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  try {
    await char.fetchMine();
  } catch {
    /* pas bloquant */
  } finally {
    loading.value = false;
  }
  try {
    showIntro.value = !localStorage.getItem(INTRO_KEY);
  } catch {
    /* ignore */
  }
});
</script>

<style scoped lang="scss">
.adv-page {
  background: var(--bg);
  min-height: 100vh;
  /* Marge basse généreuse (+ safe-area iOS) : le contenu ne doit pas être coupé
     ni passer sous le FAB feedback / le badge de version. */
  padding: 18px 16px calc(96px + env(safe-area-inset-bottom, 0px));
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
.si-actions {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.si-qty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.si-step {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.si-step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.si-qn {
  min-width: 34px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
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
/* Combat : base → équipé (effet de l'équipement + talents) — une colonne pour
   rester lisible sur mobile (label à gauche, « base → équipé » à droite). */
.gear-fx {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 12px 14px;
}
.gfx {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
}
.gfx.total {
  border-top: 1px solid var(--line-soft);
  padding-top: 8px;
  margin-top: 4px;
}
.gfx-l {
  color: var(--dim);
  white-space: nowrap;
}
.gfx-v {
  color: var(--text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}
.gfx-v i {
  color: var(--dim);
  font-style: normal;
  margin: 0 2px;
}
.gfx-v b {
  color: var(--accent);
  font-weight: 700;
}
.gear-fx-note {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.5;
  margin: 8px 0 4px;
}

/* Héro (anneau + archétype + puissance) */
.avatar-wrap {
  width: 128px;
  height: 150px;
  margin: 0 auto 6px;
}
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
.talents-owned {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.talent-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 12%, var(--surface)),
    var(--surface)
  );
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  padding: 9px 11px;
  min-width: 0;
}
.talent-card-emo {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  font-size: 19px;
}
.talent-card-body {
  min-width: 0;
  flex: 1 1 auto;
}
.talent-card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
}
.talent-card-eff {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  margin-top: 1px;
}
.talent-card-mult {
  flex: 0 0 auto;
  align-self: flex-start;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  color: var(--dark, #15120e);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 7px;
}
.talents-reset {
  margin-bottom: 18px;
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
.sec-hint {
  font-size: 12px;
  color: var(--dim);
  margin: -4px 2px 10px;
}
.slot {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
  min-height: 92px;
  /* Cellule de grille : autoriser le rétrécissement (sinon un nom de set long
     force la colonne large → débordement à droite). */
  min-width: 0;
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
.link-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
.slot-up {
  margin-top: 6px;
  align-self: flex-start;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  border-radius: 999px;
  padding: 3px 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
}
.slot-up:disabled {
  border-color: var(--line);
  background: transparent;
  color: var(--dim);
  cursor: not-allowed;
}
.slot-remove {
  margin-top: 4px;
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
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
/* Pastilles génériques rareté / niveau (équipé + sac) */
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 3px 0;
}
.gpill {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--dim);
  background: var(--surface);
}
.gpill.lvl {
  color: var(--text);
}
.gpill.p-common {
  color: var(--dim);
  border-color: var(--dim);
}
.gpill.p-rare {
  color: #4ec6d6;
  border-color: #4ec6d6;
}
.gpill.p-epic {
  color: #b07cff;
  border-color: #b07cff;
}
.gpill.p-legendary {
  color: var(--accent);
  border-color: var(--accent);
}
.gpill.p-divin {
  color: #ff5cd8;
  border-color: #ff5cd8;
}
.gpill.set {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
.winpct {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.winpct.wp-good {
  color: var(--d1);
}
.winpct.wp-mid {
  color: var(--d3, #ffb23f);
}
.winpct.wp-bad {
  color: var(--d4, #ff6a45);
}
.inv-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.if-chip {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.if-chip.on {
  border-color: var(--accent);
  color: var(--accent-ink, #15120e);
  background: var(--accent);
}
.inv-empty-filter {
  color: var(--dim);
  font-size: 13px;
  padding: 8px 2px 14px;
}
.inv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
.inv-item,
.drop {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
}
/* Le sac réserve la gouttière droite pour le cadenas (pas de chevauchement). */
.inv-item {
  padding-right: 48px;
}
/* Objet verrouillé : liseré accent pour le repérer. */
.inv-item.locked {
  box-shadow: inset 0 0 0 1px var(--accent);
}
/* Cadenas : à l'écart (coin haut-droit), grande cible tactile, bien visible. */
.inv-lock {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
.inv-lock.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.inv-lock:active {
  transform: scale(0.92);
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
.bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.bulk-lbl {
  font-size: 11.5px;
  color: var(--dim);
}
.bulk-btns {
  display: flex;
  gap: 6px;
}
.bulk-b {
  border: 1px solid var(--line);
  background: var(--surface-2, #2b241b);
  color: var(--text);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.bulk-b:active {
  border-color: var(--accent);
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
.r-divin {
  border-left-color: #ff5cd8;
}
.r-divin .rarity {
  color: #ff5cd8;
}
/* Bouton « butin possible » d'un donjon */
.dgn-loot {
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dim);
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
}
.drops-card {
  width: 100%;
  background: var(--surface);
  border-top: 2px solid var(--accent);
  border-radius: 16px 16px 0 0;
  padding: 16px 18px calc(24px + env(safe-area-inset-bottom, 0px));
  color: var(--text);
}
/* Récompense de boss au choix (3 candidats) */
.reward-card {
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border: 2px solid var(--accent);
  border-radius: 16px;
  padding: 18px;
  color: var(--text);
}
.reward-title {
  font-size: 19px;
  font-weight: 700;
  color: var(--accent);
}
.reward-sub {
  font-size: 12px;
  color: var(--dim);
  margin: 2px 0 12px;
}
.reward-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reward-cand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  background: var(--bg);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  color: var(--text);
  transition: transform 0.08s;
}
.reward-cand.reco {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.reco-badge {
  position: absolute;
  top: -9px;
  right: 12px;
  font-size: 10px;
  font-weight: 700;
  color: var(--dark, #15120e);
  background: var(--accent);
  border-radius: 999px;
  padding: 2px 9px;
}
/* Modale détail du combat */
.fight-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 18px;
  color: var(--text);
}
.fight-title {
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 12px;
}
.fight-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 55vh;
  overflow-y: auto;
}
.fight-close {
  width: 100%;
  margin-top: 14px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  font-weight: 600;
  cursor: pointer;
}
.reward-cand:active {
  transform: scale(0.98);
}
.reward-cand.r-gold {
  border-left-color: var(--accent);
}
.rc-emo {
  font-size: 28px;
  flex-shrink: 0;
}
.rc-main {
  flex: 1;
  min-width: 0;
}
.rc-name {
  font-weight: 600;
}
.rc-nv {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;
}
.rc-eff {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.rc-cmp {
  text-align: left;
}
.rc-dup {
  margin-top: 3px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--d4);
}
.rc-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 3px 0;
}
.rc-pill {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--dim);
  background: var(--surface);
}
.rc-pill.lvl {
  color: var(--text);
}
.rc-pill.p-common {
  color: var(--dim);
  border-color: var(--dim);
}
.rc-pill.p-rare {
  color: #4ec6d6;
  border-color: #4ec6d6;
}
.rc-pill.p-epic {
  color: #b07cff;
  border-color: #b07cff;
}
.rc-pill.p-legendary {
  color: var(--accent);
  border-color: var(--accent);
}
.rc-pill.p-divin {
  color: #ff5cd8;
  border-color: #ff5cd8;
}
.rc-pill.set {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
/* Emplacement cliquable : hint « gérer » */
.slot-manage {
  margin-top: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}
/* Modale de gestion d'un emplacement */
.manage-card {
  width: 100%;
  background: var(--surface);
  border-top: 2px solid var(--accent);
  border-radius: 16px 16px 0 0;
  padding: 16px 18px calc(24px + env(safe-area-inset-bottom, 0px));
  color: var(--text);
  max-height: 82vh;
  overflow-y: auto;
}
.manage-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 12px;
}
.manage-eq,
.manage-cand {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 12px 14px;
}
.manage-eq {
  border-color: var(--accent);
  border-left-color: var(--accent);
  position: relative;
}
.manage-eq-tag {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent);
  font-weight: 700;
}
.manage-empty-eq {
  color: var(--dim);
  font-size: 13px;
  padding: 6px 2px;
}
.manage-sub {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
  margin: 14px 0 8px;
}
.manage-none {
  color: var(--dim);
  font-size: 13px;
  padding: 4px 2px;
}
.manage-cand {
  margin-bottom: 8px;
}
.manage-eq-actions,
.manage-cand-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.manage-eq-hint {
  font-size: 10.5px;
  color: var(--dim);
}
.manage-close {
  width: 100%;
  margin-top: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  font-weight: 600;
  cursor: pointer;
}
.drops-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 10px;
}
.drops-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  padding: 4px 0;
}
.drops-k {
  color: var(--dim);
}
.drops-v {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.drops-sub {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
  margin: 12px 0 8px;
}
.odds {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 5px;
}
.odd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 8px;
  padding: 6px 2px;
}
.odd-pct {
  font-size: 15px;
  font-weight: 700;
}
.odd-lbl {
  font-size: 9px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.drops-note {
  font-size: 11px;
  color: var(--dim);
  margin-top: 12px;
  line-height: 1.4;
}
.drops-close {
  width: 100%;
  margin-top: 14px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px;
  font-weight: 600;
  cursor: pointer;
}

/* Donjons */
.dungeons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
}
/* Pastille de niveau (mise en avant, colorée par état) */
.lvl-pill {
  flex-shrink: 0;
  align-self: flex-start;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
  padding: 4px 7px;
  border-radius: 8px;
  white-space: nowrap;
  background: var(--line);
  color: var(--dim);
}
.lvl-pill.avail {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.lvl-pill.done {
  background: color-mix(in srgb, var(--d1, #7bc86c) 80%, #000);
  color: #0c1a0c;
}
.lvl-pill.locked {
  background: var(--line);
  color: var(--dim);
}
.expand-btn {
  width: 100%;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--dim);
  border-radius: 10px;
  padding: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 2px;
}
/* Carte donjon/boss : layout EN COLONNE (en-tête · chips · conseil · bouton) */
.dgn {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
/* En-tête : emoji + nom (flex) + pastille de niveau */
.dgn-hd {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dgn-emo {
  font-size: 28px;
  flex-shrink: 0;
  line-height: 1;
}
.dgn-hd-main {
  flex: 1;
  min-width: 0;
}
.dgn-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
/* Rangée de chips (coût énergie · monstres · or · % victoire · butin) */
.dgn-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dgn-chip {
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dgn-chip.gold {
  color: var(--accent);
}
.dgn-hint {
  font-size: 11.5px;
  color: var(--dim);
  opacity: 0.9;
  line-height: 1.35;
}
/* ── Carte d'entrée « Expéditions » (nouveau mode) ── */
.expe-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  cursor: pointer;
}
.expe-emo {
  font-size: 26px;
}
.expe-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.expe-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.expe-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.expe-go {
  font-size: 22px;
  color: var(--accent);
}
/* ── Boss de palier : cartes NETTEMENT plus grandes & dramatiques ── */
.mboss-title {
  margin-top: 16px;
  font-size: 15px;
  color: var(--accent);
}
.mboss {
  gap: 9px;
  padding: 15px 16px;
  border-width: 2px;
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
  border-radius: 16px;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--accent) 13%, var(--surface)),
    var(--surface) 70%
  );
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent),
    0 8px 22px -12px color-mix(in srgb, var(--accent) 60%, transparent);
}
.mboss.locked {
  background: var(--surface);
  border-color: var(--line);
  box-shadow: none;
  opacity: 0.75;
}
.mboss.beaten {
  border-color: color-mix(in srgb, var(--d1, #7bc86c) 60%, var(--line));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--d1, #7bc86c) 25%, transparent);
}
.mboss .dgn-emo {
  font-size: 38px;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.5));
}
.mboss-eyebrow {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent);
  margin-bottom: 2px;
}
.mboss.locked .mboss-eyebrow {
  color: var(--dim);
}
.mboss-name {
  font-size: 19px;
}
.mboss-set {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--accent);
  font-weight: 600;
  margin-top: 4px;
  padding: 4px 0;
}
.mboss-set-info {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 7px;
}
.mboss.locked .mboss-set {
  color: var(--dim);
}
.mboss.locked .mboss-set-info {
  background: var(--dim);
}
.mboss-badge {
  font-size: 13px;
  margin-left: 4px;
}
.mboss-fight {
  padding: 11px;
  font-size: 14px;
}
/* Faille sans fin : teinte « néant » violette pour la distinguer des boss */
.mboss.endless {
  margin-top: 4px;
  border-color: color-mix(in srgb, #b07cff 60%, var(--line));
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #b07cff 15%, var(--surface)),
    var(--surface) 70%
  );
  box-shadow:
    0 0 0 1px color-mix(in srgb, #b07cff 22%, transparent),
    0 8px 22px -12px color-mix(in srgb, #b07cff 55%, transparent);
}
.mboss.endless .mboss-eyebrow {
  color: #c9a6ff;
}
.fight {
  width: 100%;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 10px;
  padding: 10px 14px;
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

/* Rapport de combat en MODALE (post-run). */
.report-modal {
  width: 420px;
  max-width: 92vw;
  /* Ancrée en HAUT (position="top") + hauteur bornée → la tête (bouton Réattaquer)
     reste à la même place quel que soit le contenu ; seul le CORPS scrolle. */
  height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  padding: 16px 18px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  border-top-width: 3px;
}
.rm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.report-modal > .rm-head,
.report-modal > .rm-skip-toggle,
.report-modal > .rm-actions-row {
  flex: none;
}
.report-modal.win {
  border-top-color: var(--d1);
}
.report-modal.lose {
  border-top-color: var(--d4);
}
.rm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.rm-title {
  font-size: 17px;
  font-weight: 700;
}
/* Réattaquer : bouton icône en haut à droite (spam-able, ne ferme pas la modale). */
.rm-reattack {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 18px;
  cursor: pointer;
}
.rm-reattack:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.rm-reward {
  margin-top: 14px;
}
.rm-stage-wrap {
  margin: 12px 0;
  padding: 10px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: var(--bg);
}
.rm-skip-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--dim);
  cursor: pointer;
}
.rm-stage-btn {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.rm-actions-row {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  position: sticky;
  bottom: -16px;
  background: var(--surface);
  padding-top: 10px;
}
.rm-btn {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}
.rm-btn:active {
  transform: scale(0.98);
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
/* Gains en pastilles colorées (or / poussière). */
.result-gains {
  display: flex;
  gap: 6px;
}
.gain-pill {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.gain-pill.gold {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid var(--accent);
}
.gain-pill.dust {
  color: #b07cff;
  background: color-mix(in srgb, #b07cff 16%, transparent);
  border: 1px solid #b07cff;
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
  margin-top: 10px;
}
.log-lbl {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
  margin-bottom: 2px;
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
.pow-cmp {
  font-size: 11px;
  color: var(--dim);
  margin-top: 3px;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.pow-cmp b {
  font-weight: 800;
}
.pow-cmp b.up {
  color: var(--d1);
}
.pow-cmp b.down {
  color: var(--d4);
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

/* Atelier de poussière */
.ws-inline {
  margin-top: 6px;
}
.workshop {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ws-btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}
.ws-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: transparent;
  color: var(--dim);
  border-color: var(--line);
}
.ws-note {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.5;
  margin: 8px 0 14px;
}
.ws-note b {
  color: var(--text);
}
.ws-modal {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  color: var(--text);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 16px;
}
.ws-modal-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 12px;
}
.ws-empty {
  font-size: 13px;
  color: var(--dim);
  line-height: 1.5;
  padding: 8px 0 4px;
}
.ws-empty b {
  color: var(--text);
}
.ws-slots {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.ws-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}
.ws-slot-emo {
  font-size: 20px;
}
.ws-field {
  margin-bottom: 12px;
}
.ws-lbl {
  font-size: 12px;
  color: var(--dim);
}
.ws-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.ws-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.ws-chip.on {
  border-color: var(--accent);
  color: var(--accent);
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
.intro-card {
  margin-bottom: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent) 10%, var(--surface)),
    var(--surface) 75%
  );
}
.intro-h {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
}
.intro-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
}
.intro-ok {
  width: 100%;
  margin-top: 12px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 10px;
  padding: 10px;
  font-family: var(--font-display);
  font-weight: 700;
  cursor: pointer;
}
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
/* Level-up « majeur » : liste des déblocages franchis */
.lb-card.major .lb-bolt {
  font-size: 54px;
}
.lb-unlocks {
  margin-top: 16px;
  width: min(86vw, 340px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--accent);
  animation: lb-pop 0.5s ease-out 0.2s both;
}
.lb-unlocks-h {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
  text-align: center;
}
.lb-unlock {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.lu-emo {
  font-size: 24px;
  line-height: 1.1;
  flex: none;
}
.lu-txt {
  min-width: 0;
}
.lu-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.lu-detail {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.3;
}
/* Timeline « À venir » (onglet Perso) */
.upcoming {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.up-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
}
.up-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.up-lvl {
  flex: none;
  min-width: 52px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}
.up-emo {
  font-size: 22px;
  flex: none;
}
.up-txt {
  min-width: 0;
}
.up-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}
.up-detail {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
/* Bandeau de région (biome) — onglet Donjons */
.region-banner {
  margin: 4px 0 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface); /* fallback si color-mix non supporté */
  background: color-mix(in srgb, var(--rc) 12%, var(--surface));
  border: 1px solid var(--rc);
  border-color: color-mix(in srgb, var(--rc) 45%, var(--line));
}
.rb-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rb-emo {
  font-size: 30px;
  flex: none;
}
.rb-main {
  min-width: 0;
  flex: 1;
}
.rb-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--rc);
  line-height: 1.1;
}
.rb-blurb {
  font-size: 12px;
  color: var(--dim);
}
.rb-prog {
  flex: none;
  font-weight: 700;
  color: var(--rc);
  font-size: 14px;
}
.rb-bar {
  height: 6px;
  border-radius: 4px;
  background: var(--line);
  margin: 10px 0 8px;
  overflow: hidden;
}
.rb-bar > span {
  display: block;
  height: 100%;
  background: var(--rc);
  transition: width 0.4s ease;
}
.rb-next {
  font-size: 12px;
  color: var(--dim);
}
.rb-next span {
  font-weight: 700;
}
/* Teinte de région sur la tuile de donjon (liseré gauche) */
.dgn {
  border-left: 3px solid var(--rc, var(--line));
}

/* ── Carte-monde serpentine ── */
.worldmap {
  position: relative;
  width: 100%;
  margin: 6px 0 4px;
}
.wm-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.wm-wire {
  fill: none;
  stroke: var(--line);
  stroke-width: 5;
  stroke-linecap: round;
}
.wm-energized {
  stroke: var(--accent);
  filter: drop-shadow(0 0 4px var(--accent));
  transition: stroke-dashoffset 0.6s ease;
}
.wm-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  cursor: pointer;
  width: 96px;
}
.wm-disc {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 28px;
  background: color-mix(in srgb, var(--rc) 20%, var(--surface));
  border: 2px solid var(--rc);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.wm-node.locked .wm-disc {
  background: var(--surface);
  border-color: var(--line);
  filter: grayscale(1);
}
.wm-node.current .wm-disc {
  animation: wm-pulse 1.6s ease-in-out infinite;
}
.wm-node.sel .wm-disc {
  outline: 3px solid var(--rc);
  outline-offset: 2px;
}
@keyframes wm-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--rc) 60%, transparent);
  }
  50% {
    box-shadow: 0 0 0 8px transparent;
  }
}
.wm-lockemo {
  font-size: 24px;
  filter: grayscale(1);
}
.wm-star {
  position: absolute;
  right: -4px;
  top: -6px;
  font-size: 16px;
  color: var(--accent);
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
}
.wm-cap {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  line-height: 1.1;
  max-width: 96px;
}
.wm-node.locked .wm-cap {
  color: var(--dim);
}
.wm-pips {
  display: flex;
  gap: 3px;
}
.wm-pips i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line);
}
.wm-pips i.on {
  background: var(--rc);
}
/* Chaînes + cadenas sur une région verrouillée + explosion au déblocage */
.wm-chains {
  position: absolute;
  inset: -6px;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.wm-chains .wm-lock {
  font-size: 22px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
.wm-link {
  position: absolute;
  width: 10px;
  height: 16px;
  border: 3px solid #9a8f7e;
  border-radius: 5px;
  background: transparent;
}
.wm-link.l1 {
  transform: rotate(38deg) translate(-16px, 0);
}
.wm-link.l2 {
  transform: rotate(38deg) translate(16px, 0);
}
/* Explosion : les maillons volent + le cadenas éclate, arc voltage */
.wm-node.shatter .wm-chains {
  animation: wm-flash 0.5s ease-out;
}
.wm-node.shatter .wm-link.l1 {
  animation: wm-fly-l 0.6s ease-out forwards;
}
.wm-node.shatter .wm-link.l2 {
  animation: wm-fly-r 0.6s ease-out forwards;
}
.wm-node.shatter .wm-lock {
  animation: wm-burst 0.5s ease-out forwards;
}
@keyframes wm-flash {
  0% {
    box-shadow: 0 0 0 0 var(--accent);
  }
  40% {
    box-shadow: 0 0 22px 10px var(--accent);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
@keyframes wm-fly-l {
  to {
    transform: rotate(220deg) translate(-46px, -30px);
    opacity: 0;
  }
}
@keyframes wm-fly-r {
  to {
    transform: rotate(-180deg) translate(46px, 30px);
    opacity: 0;
  }
}
@keyframes wm-burst {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  40% {
    transform: scale(1.6) rotate(12deg);
  }
  100% {
    transform: scale(0.2) rotate(-20deg);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wm-node.current .wm-disc,
  .wm-node.shatter .wm-chains,
  .wm-node.shatter .wm-link,
  .wm-node.shatter .wm-lock {
    animation: none;
  }
}
/* Drawer de région (en-tête au-dessus des donjons) */
.region-drawer {
  margin: 14px 0 8px;
  scroll-margin-top: 64px; /* décale sous le header fixe au scrollIntoView */
}
.map-hint {
  text-align: center;
  margin-top: -2px;
}
.rd-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rd-emo {
  font-size: 20px;
}
.rd-name {
  font-size: 17px;
  font-weight: 800;
  color: var(--rc);
  flex: 1;
}
.rd-prog {
  font-weight: 700;
  color: var(--rc);
  font-size: 14px;
}
/* Reveal de région : carte teintée par le biome */
.lb-card.region .lb-wave {
  border-color: var(--rc);
}
.rburst-kicker {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dim);
  margin-top: 4px;
}
.rburst-name {
  font-size: 40px;
  font-weight: 800;
  line-height: 1.05;
  color: var(--rc);
  text-align: center;
}
/* Bouton d'entrée du Codex (onglet Perso) */
.codex-btn {
  width: 100%;
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  text-align: left;
  cursor: pointer;
}
.cx-emo {
  font-size: 26px;
  flex: none;
}
.cx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cx-title {
  font-weight: 700;
  color: var(--text);
  font-size: 15px;
}
.cx-sub {
  font-size: 12px;
  color: var(--dim);
}
.cx-go {
  color: var(--dim);
  font-size: 22px;
}
/* Modale Codex */
.codex-card {
  max-height: 84vh;
}
.codex-body {
  overflow-y: auto;
  padding: 4px 2px 8px;
}
.cx-sec-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-weight: 700;
  color: var(--text);
  font-size: 14px;
  margin: 6px 2px 10px;
}
.cx-sec-h2 {
  margin-top: 18px;
}
.cx-count {
  font-size: 12px;
  color: var(--accent);
  font-weight: 700;
}
.bestiary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}
.best-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  opacity: 0.55;
}
.best-tile.found {
  opacity: 1;
  border-color: var(--accent);
}
.best-emo {
  font-size: 26px;
}
.best-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.15;
}
.best-tier {
  font-size: 9.5px;
  color: var(--dim);
}
.setj-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.setj {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.setj.complete {
  border-color: var(--accent);
}
.setj-emo {
  font-size: 26px;
  flex: none;
}
.setj-main {
  flex: 1;
  min-width: 0;
}
.setj-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
}
.setj-badge {
  font-size: 11px;
  color: var(--accent);
  font-weight: 700;
  margin-left: 4px;
}
.setj-theme {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.25;
}
.setj-lock {
  font-size: 11px;
  color: var(--d3);
  margin-top: 2px;
}
.setj-pips {
  flex: none;
  display: flex;
  align-items: center;
  gap: 3px;
}
.setj-pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--line);
}
.setj-pip.on {
  background: var(--accent);
}
.setj-frac {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;
  font-weight: 600;
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
  /* Au-dessus des q-dialog Quasar (z-index 6000) : la confirmation de recyclage
     doit rester devant la modale de gestion d'emplacement d'où elle est lancée. */
  z-index: 7000;
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
.salv-card.r-divin {
  border-left-color: #ff5cd8;
}
.salv-fade-enter-active,
.salv-fade-leave-active {
  transition: opacity 0.18s ease;
}
.salv-fade-enter-from,
.salv-fade-leave-to {
  opacity: 0;
}

/* Modale de remplacement d'équipement */
.repl-card {
  border-left: none;
}
.repl-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
}
.repl-item.r-common {
  border-left-color: var(--dim);
}
.repl-item.r-rare {
  border-left-color: #4ec6d6;
}
.repl-item.r-epic {
  border-left-color: #b07cff;
}
.repl-item.r-legendary {
  border-left-color: var(--accent);
}
.repl-item.r-divin {
  border-left-color: #ff5cd8;
}
.repl-new {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}
.repl-old {
  opacity: 0.82;
}
.repl-tag {
  position: absolute;
  top: -8px;
  left: 10px;
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--dim);
}
.repl-new .repl-tag {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
.repl-arrow {
  text-align: center;
  font-size: 11px;
  color: var(--dim);
  margin: 2px 0;
}
.repl-q {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
}
.repl-choices {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.repl-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 6px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
}
.repl-choice:active {
  transform: scale(0.97);
  border-color: var(--accent);
}
.repl-choice-emo {
  font-size: 20px;
}
.repl-choice-lbl {
  font-size: 12px;
  font-weight: 700;
}
.repl-choice small {
  font-size: 9.5px;
  color: var(--dim);
}
.repl-cancel {
  width: 100%;
}
</style>
