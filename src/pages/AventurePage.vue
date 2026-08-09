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
          <li>
            🗺️ Onglet <b>Donjons</b> : avance dans la liste (donjons + 👑 boss de palier) pour du
            butin.
          </li>
          <li>🐲 Chaque <b>boss</b> lâche une pièce de son <b>set</b> (bonus à 2/3/4 pièces).</li>
          <li>🌌 Onglet <b>Mondial</b> : frappe le boss communautaire de la semaine.</li>
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
          <q-icon name="public" size="18px" /> Mondial
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
          <!-- Nettoyage en masse : objets de rareté inférieure à l'équipé du même slot -->
          <div v-if="belowCount > 0" class="bulk">
            <span class="bulk-lbl">{{ belowCount }} objet{{ belowCount > 1 ? 's' : '' }} moins rare{{ belowCount > 1 ? 's' : '' }} que l'équipé</span>
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
              :class="'r-' + it.rarity"
            >
              <span class="inv-emo">{{ it.emoji }}</span>
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
        <div v-if="run" ref="reportEl" class="report" :class="run.cleared ? 'win' : 'lose'">
          <div class="report-head">
            <span class="report-title font-display">📋 Rapport de combat</span>
            <button
              v-if="reattack"
              class="reattack"
              :disabled="c.energy < reattack.cost || busy"
              @click="reattack.fn()"
            >
              ⚔️ Réattaquer {{ reattack.name }} ({{ reattack.cost }} ⚡)
            </button>
          </div>
          <div class="result-head">
            <span
              >{{
                run.cleared
                  ? run.kind === 'boss'
                    ? '🏆 Boss vaincu'
                    : '🏆 Donjon nettoyé'
                  : '💀 Échec'
              }}
              — {{ run.name }}</span
            >
            <span class="result-gold">+{{ run.gold }} 🪙 · +{{ run.dust }} ✨</span>
          </div>
          <div class="result-sub">
            <template v-if="run.kind === 'dungeon'"
              >{{ run.defeated }}/{{ run.total }} monstres vaincus ·
            </template>
            PV restants {{ run.finalPv }}
          </div>
          <div class="log">
            <div class="log-lbl">⚔️ Détail du combat</div>
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
                <div class="inv-eff">{{ SLOT_LABEL[d.slot] }} · {{ itemEffects(d) }}</div>
                <div v-if="equippedInSlot(d.slot)" class="drop-cmp">
                  <span
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(d.slot)!.rarity] }} Nv
                    {{ equippedInSlot(d.slot)!.level }}
                    ·
                    {{ itemEffects(equippedInSlot(d.slot)!) }}</span
                  >
                  <span class="rarity-verdict" :class="rarityVerdict(d).cls">{{
                    rarityVerdict(d).label
                  }}</span>
                </div>
                <div v-else class="drop-cmp">
                  <span class="rarity-verdict up">slot libre</span>
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

        <div class="sec-title mboss-title">🗺️ Donjons & boss de palier</div>
        <div class="dungeons">
          <template v-for="it in visibleAdventure" :key="it.key">
            <!-- BOSS DE PALIER : design distinct, ressort dans la liste -->
            <div
              v-if="it.boss"
              class="dgn mboss"
              :class="{ locked: !bossUnlocked(it.boss), beaten: isBossBeaten(it.boss) }"
            >
              <div class="dgn-hd">
                <span class="dgn-emo">{{ bossUnlocked(it.boss) ? it.boss.emoji : '🔒' }}</span>
                <div class="dgn-hd-main">
                  <div class="mboss-eyebrow">👑 Boss de palier</div>
                  <div class="dgn-name mboss-name font-display">
                    {{ it.boss.name }}
                    <span v-if="isBossBeaten(it.boss)" class="mboss-badge">⭐</span>
                  </div>
                </div>
                <span class="lvl-pill" :class="itemState(it)">Niv {{ it.boss.unlockLevel }}</span>
              </div>

              <div class="dgn-meta">
                <span class="dgn-chip">⚡ {{ it.boss.energyCost }}</span>
                <span class="dgn-chip gold">+{{ it.boss.gold }} 🪙</span>
                <span
                  v-if="bossUnlocked(it.boss)"
                  class="dgn-chip winpct"
                  :class="winClass(winPct['b:' + it.boss.id] ?? 0)"
                  >🎯 {{ winPct['b:' + it.boss.id] ?? 0 }}%</span
                >
              </div>

              <div class="mboss-set">
                {{ bossSet(it.boss).emoji }} {{ bossSet(it.boss).name }} ·
                <b>{{ bossSetCount(it.boss) }}/4</b> pièces
              </div>
              <div v-if="bossUnlocked(it.boss)" class="dgn-hint">{{ it.boss.hint }}</div>
              <div v-else class="dgn-hint dgn-lock">🔒 {{ bossLockReason(it.boss) }}</div>

              <button
                v-if="bossUnlocked(it.boss)"
                class="fight mboss-fight"
                :disabled="c.energy < it.boss.energyCost || busy"
                @click="fightBoss(it.boss)"
              >
                ⚔️ {{ isBossBeaten(it.boss) ? 'Réaffronter' : 'Combattre' }} ({{
                  it.boss.energyCost
                }}
                ⚡)
              </button>
              <button v-else class="fight mboss-fight" disabled>🔒 Verrouillé</button>
            </div>

            <!-- DONJON -->
            <div
              v-else-if="it.dungeon"
              class="dgn"
              :class="{ locked: !dungeonUnlocked(it.dungeon) }"
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
          </template>

          <button
            v-if="!showAllDungeons && hiddenCount > 0"
            class="expand-btn"
            @click="showAllDungeons = true"
          >
            ▾ Voir tous les donjons ({{ adventureItems.length }})
          </button>
          <button v-else-if="showAllDungeons" class="expand-btn" @click="showAllDungeons = false">
            ▴ Réduire la liste
          </button>

          <!-- Faille sans fin (end-game infini) — après le dernier donjon -->
          <div v-if="endlessUnlocked" class="dgn mboss endless">
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
        <div class="lb-card">
          <span class="lb-wave" aria-hidden="true" />
          <span class="lb-bolt">🎉</span>
          <div class="lb-energy font-display">Niveau {{ levelBurst.to }} !</div>
          <div class="lb-lbl">bravo, tu montes en puissance</div>
          <div class="lb-streak">+{{ levelBurst.energy }} ⚡ de bonus</div>
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
          Chaque objet a <b>1 stat</b> (dégâts / PV / critique / vol de vie / réduction / or). Les
          <b>pièces de set</b> ne tombent que sur les <b>boss de palier</b>.
        </div>
        <button class="drops-close" @click="dropInfo = null">Fermer</button>
      </q-card>
    </q-dialog>

    <!-- Récompense de boss AU CHOIX : 3 candidats, on en garde 1 -->
    <q-dialog :model-value="!!char.row?.pending_reward" persistent>
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
                <div v-if="cand.item.setId" class="rc-set">
                  <b>{{ SET_BY_ID[cand.item.setId]?.name }}</b>
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore, PseudoTakenError } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter, isValidPseudo, PROFILE_LABEL } from '@/lib/character';
import { simulateDungeon, simulateCombat, mulberry32, combatPower } from '@/lib/combat';
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
  kind: 'dungeon' | 'boss';
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
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    c.value,
    char.row?.equipped ?? {},
    talentFx.value,
    c.value.level.level,
  ),
);
const combatPowerVal = computed(() => combatPower(fighter.value));

// Estimation live du % de victoire par donjon/boss selon les stats + le stuff
// ÉQUIPÉ actuel (Monte-Carlo seedé). Recalculé quand le perso/l'équipement change
// → on peut swapper du gear et voir l'effet. Clé : 'd:<id>' / 'b:<id>'.
const WINPCT_SEEDS = 40;
const winPct = computed<Record<string, number>>(() => {
  const stats = c.value;
  const eq = char.row?.equipped ?? {};
  const name = char.row?.pseudo ?? 'Toi';
  const fx = talentFx.value;
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
const reportEl = ref<HTMLElement | null>(null);
// Après un run : replie la liste (retour à la vue par défaut) et remonte au rapport.
async function focusReport() {
  showAllDungeons.value = false;
  await nextTick();
  reportEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const lastDungeon = ref<Dungeon | null>(null); // pour « Réattaquer » depuis le rapport
const lastBoss = ref<MilestoneBoss | null>(null); // idem pour un boss de palier

// Butin possible d'un donjon (affiché à la demande via 🎁).
const dropInfo = ref<Dungeon | null>(null);
function openDrops(d: Dungeon) {
  dropInfo.value = d;
}
// Chances de rareté d'un drop selon la chance du donjon (miroir de rollRarity, items.ts).
function rarityOdds(luck: number) {
  const l = Math.min(1, Math.max(0, luck));
  const leg = 0.02 + l * 0.08;
  const epic = 0.1 + l * 0.12;
  const rare = 0.28 + l * 0.12;
  const common = Math.max(0, 1 - leg - epic - rare);
  return [
    { label: 'Commun', pct: Math.round(common * 100), cls: 'r-common' },
    { label: 'Rare', pct: Math.round(rare * 100), cls: 'r-rare' },
    { label: 'Épique', pct: Math.round(epic * 100), cls: 'r-epic' },
    { label: 'Légendaire', pct: Math.round(leg * 100), cls: 'r-legendary' },
  ];
}

// Liste UNIFIÉE donjons + boss de palier, ordonnée par niveau. Le boss d'un
// palier (+0.5) apparaît juste après le donjon du même niveau → progression
// naturelle, boss intégrés dans la liste mais au design distinct.
const adventureItems = computed(() => {
  const items: { key: string; lvl: number; dungeon?: Dungeon; boss?: MilestoneBoss }[] = [
    ...DUNGEONS.map((d) => ({ key: 'd:' + d.id, lvl: d.recoLevel, dungeon: d })),
    ...BOSSES.map((b) => ({ key: 'b:' + b.id, lvl: b.unlockLevel + 0.5, boss: b })),
  ];
  return items.sort((a, b) => a.lvl - b.lvl);
});
// État visuel d'un item (pour la pastille de niveau colorée + le repli).
function itemState(it: { dungeon?: Dungeon; boss?: MilestoneBoss }): 'done' | 'avail' | 'locked' {
  if (itemDone(it)) return 'done';
  const unlocked = it.boss ? bossUnlocked(it.boss) : dungeonUnlocked(it.dungeon!);
  return unlocked ? 'avail' : 'locked';
}
// Repli : par défaut on n'affiche que les 2 derniers faits + le(s) déblocable(s).
const showAllDungeons = ref(false);
const frontierIndex = computed(() => {
  const i = adventureItems.value.findIndex((it) => !itemDone(it));
  return i === -1 ? adventureItems.value.length : i;
});
const visibleAdventure = computed(() => {
  if (showAllDungeons.value) return adventureItems.value;
  const f = frontierIndex.value;
  return adventureItems.value.slice(
    Math.max(0, f - 2),
    Math.min(adventureItems.value.length, f + 1),
  );
});
const hiddenCount = computed(() => adventureItems.value.length - visibleAdventure.value.length);

// « Réattaquer » unifié : boss (prioritaire) ou donjon selon le dernier run.
const reattack = computed<{ name: string; cost: number; fn: () => void } | null>(() => {
  if (lastBoss.value) {
    const b = lastBoss.value;
    return { name: b.name, cost: b.energyCost, fn: () => void fightBoss(b) };
  }
  if (lastDungeon.value) {
    const d = lastDungeon.value;
    return { name: d.name, cost: d.energyCost, fn: () => void explore(d) };
  }
  return null;
});
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
      fights: r.fights.map((f) => ({
        monster: f.monster,
        emoji: MONSTERS.find((m) => m.name === f.monster)?.emoji ?? '👾',
        win: f.win,
        rounds: f.result.rounds,
      })),
      drops,
      ...(consDrop ? { consumable: { emoji: consDrop.emoji, name: consDrop.name } } : {}),
    };
    void focusReport();
    if (r.cleared) $q.notify({ type: 'positive', message: `Donjon nettoyé — +${gold} 🪙` });
  } catch {
    $q.notify({ type: 'negative', message: 'Échec de l’exploration.' });
  } finally {
    busy.value = false;
  }
}

// ── Boss de palier ──
const defeatedBossSet = computed(() => new Set(char.row?.defeated_bosses ?? []));
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
function bossSetCount(b: MilestoneBoss): number {
  const r = char.row;
  if (!r) return 0;
  const all = [...r.inventory, ...SLOTS.map((s) => r.equipped[s]).filter((it): it is Item => !!it)];
  return all.filter((it) => it.setId === b.setId).length;
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
      fights: [{ monster: b.name, emoji: b.emoji, win, rounds: r.rounds }],
      drops: [],
    };
    void focusReport();
    $q.notify(
      win
        ? { type: 'positive', message: `${b.emoji} ${b.name} vaincu — choisis ta récompense !` }
        : { type: 'warning', message: `${b.name} t’a terrassé… reviens plus fort.` },
    );
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
      fights: [{ monster: foe.name, emoji: '🌀', win, rounds: r.rounds }],
      drops,
    };
    void focusReport();
    $q.notify(
      win
        ? { type: 'positive', message: `Palier ${tier} franchi — +${gold} 🪙` }
        : { type: 'warning', message: `Palier ${tier} : la Faille t'a repoussé.` },
    );
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
function doSell(it: Item) {
  withUid(
    (uid) =>
      char
        .sell(uid, it.id)
        .then(() => $q.notify({ type: 'positive', position: 'top', message: `+${sellValue(it)} 🪙` })),
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
const belowCount = computed(() => {
  const r = char.row;
  if (!r) return 0;
  return r.inventory.filter((it) => {
    if (bulkSlot.value && it.slot !== bulkSlot.value) return false;
    const eq = r.equipped[it.slot];
    return eq && RARITY_RANK[it.rarity] < RARITY_RANK[eq.rarity];
  }).length;
});
// Libellé du périmètre (« du sac » ou « [type] ») pour être explicite.
const bulkScope = computed(() =>
  bulkSlot.value ? SLOT_LABEL[bulkSlot.value].toLowerCase() : 'ton sac',
);
function doSalvageBelow() {
  const slot = bulkSlot.value;
  $q.dialog({
    title: 'Tout casser',
    message: `Casser les ${belowCount.value} objet(s) de ${bulkScope.value} moins rares que l'équipé (→ poussière) ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Casser', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid(
      (uid) =>
        char
          .salvageBelowEquipped(uid, slot)
          .then((n) =>
            $q.notify({ type: 'positive', position: 'top', message: `${n} objet(s) cassé(s) en poussière.` }),
          ),
      'Recyclage impossible.',
    ),
  );
}
function doSellBelow() {
  const slot = bulkSlot.value;
  $q.dialog({
    title: 'Tout vendre',
    message: `Vendre les ${belowCount.value} objet(s) de ${bulkScope.value} moins rares que l'équipé (→ or) ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Vendre', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid(
      (uid) =>
        char
          .sellBelowEquipped(uid, slot)
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
        setTimeout(() => (levelBurst.value = null), 3200);
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
  wboss.refresh().catch(() => undefined);
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
.rc-set {
  font-size: 11px;
  color: var(--accent);
  margin-top: 3px;
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
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
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
  font-size: 12.5px;
  color: var(--accent);
  font-weight: 600;
  margin-top: 4px;
}
.mboss.locked .mboss-set {
  color: var(--dim);
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

/* Rapport de combat (au-dessus des donjons) */
.report {
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  scroll-margin-top: 72px;
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
