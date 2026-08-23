<template>
  <component :is="embedded ? 'div' : 'q-page'" class="adv-page" :class="{ embedded }">
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
          <button class="inbox-btn" aria-label="Messages" @click="openInbox">
            📬<span v-if="unreadMessages" class="inbox-dot">{{ unreadMessages }}</span>
          </button>
          <!-- Plateau de ressources : jauges (⚡ or) · séparateur · matériaux d'amélioration.
               Une seule bordure = groupe lisible au lieu de 8 puces éparses. Chaque ressource
               a une infobulle expliquant ce qu'elle fait monter. -->
          <div class="tb-tray">
            <span
              class="tb-r energy"
              :class="{ deficit: c.energy < 0 }"
              title="Énergie — dépensée pour lancer donjons, labyrinthe et expéditions (gagnée en faisant du sport)"
              >⚡ {{ c.energy }}</span
            >
            <!-- Boutique retirée pour le moment (ticket dc7c746d) : la puce or est un simple indicateur. -->
            <span class="tb-r gold" title="Or — expéditions et construction des bâtiments"
              >🪙 {{ char.row.gold }}</span
            >
            <span class="tb-sep" aria-hidden="true"></span>
            <span
              v-if="char.row.summon_stones"
              class="tb-r summon"
              title="Pierres d’invocation — tenter un boss de palier"
              >🔮 {{ char.row.summon_stones }}</span
            >
          </div>
        </div>
      </div>

      <div v-if="c.energy < 0" class="deficit-banner">
        ⚠️ Déficit d'énergie ({{ c.energy }} ⚡) — refais du sport pour regagner de l'énergie avant
        de rejouer.
      </div>

      <!-- Bannière : héros en expédition (autres modes + équipement gelés) -->
      <button
        v-if="onExpedition && expeHero"
        class="expe-banner"
        @click="openGame('/expedition-map')"
      >
        🧭 Ton héros est en expédition —
        <b v-if="expeHero.phase !== 'done'"
          >{{ expeHero.phase === 'return' ? 'retour' : 'arrivée' }} dans
          {{
            fmtExpeMs(
              expeHero.phase === 'return' ? expeHero.remainTotalMs : expeHero.remainToObjectiveMs,
            )
          }}</b
        >
        <b v-else>de retour !</b>. Donjons, boss et équipement indisponibles.
      </button>

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
        <button class="seg-b" :class="{ on: tab === 'hero' }" @click="tab = 'hero'">
          <q-icon name="person" size="18px" /> Héros
        </button>
        <button class="seg-b" :class="{ on: tab === 'gear' }" @click="tab = 'gear'">
          <q-icon name="checkroom" size="18px" /> Équipement
        </button>
        <button class="seg-b" :class="{ on: tab === 'explore' }" @click="tab = 'explore'">
          <q-icon name="castle" size="18px" /> Explorer
        </button>
      </div>

      <!-- ONGLET HÉROS — accès Talents/Familier UNIQUEMENT par clic sur l'avatar
           (familier à droite, badge talent en bas-gauche), ticket d06b6998. -->
      <template v-if="tab === 'hero'">
        <template v-if="persoSub === 'perso'">
          <!-- PORTRAIT HÉROS : le perso au centre d'un cercle teinté par le RANG ; couronne
               d'ÉTOILES (pleines = gagnées) au premier plan sur l'anneau. Niveau (bas-gauche)
               et Puissance (bas-droite) flanquent le cercle sur la même ligne. -->
          <!-- CARRÉ : perso au centre, 4 cercles aux COINS (gauche alignés, haut calés sur le
               bas → carré). Voie ↖ · Prestige ↗ · Niveau ↙ · Puissance ↘. -->
          <div class="portrait" :style="{ '--rank-c': rank.color }">
            <div class="pt-square">
              <!-- ↖ VOIE (spécialisation) -->
              <button
                class="pt-mini corner tl voie"
                type="button"
                :title="currentVoie ? `Voie : ${currentVoie.name}` : 'Choisir une voie'"
                @click="voieOpen = true"
              >
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle class="ptm-track full" cx="22" cy="22" r="18" />
                  <text
                    class="ptm-emo"
                    x="22"
                    y="23"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ currentVoie ? currentVoie.emoji : '—' }}
                  </text>
                </svg>
                <span class="ptm-ic">🧭</span>
              </button>
              <!-- ↗ PRESTIGE (rang cosmétique) -->
              <button
                class="pt-mini corner tr prestige"
                type="button"
                :title="`${rank.name} · ${rank.star}/5 ★ — voir tous les rangs`"
                @click="ranksOpen = true"
              >
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle class="ptm-track full" cx="22" cy="22" r="18" />
                  <text
                    class="ptm-emo"
                    x="22"
                    y="23"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ rank.emoji }}
                  </text>
                </svg>
                <span class="ptm-ic txt font-display">{{ rank.star }}★</span>
              </button>

              <div class="pt-frame" :title="`${rank.name} ${rank.star}/5`">
                <AventureAvatar
                  class="pt-avatar"
                  :profile="c.profile"
                  :equipped="char.row.equipped"
                  :talent-icon="firstTalentIcon"
                  @familiar-click="familiarsOpen = true"
                  @talent-click="talentsOpen = true"
                />
                <svg class="pt-stars" viewBox="0 0 100 100" aria-hidden="true">
                  <path
                    v-for="i in 5"
                    :key="i"
                    class="pt-star"
                    :class="{ on: i <= rank.star }"
                    :d="STAR_PATH"
                    :transform="starTf(i - 1)"
                  />
                </svg>
              </div>

              <!-- ↙ NIVEAU (anneau de progression) -->
              <div
                class="pt-mini corner bl lvl"
                :title="`Niveau ${c.level.level} · ${c.level.progressPct}%`"
              >
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle class="ptm-track" cx="22" cy="22" r="18" />
                  <circle
                    class="ptm-arc"
                    cx="22"
                    cy="22"
                    r="18"
                    stroke-dasharray="113.1"
                    :stroke-dashoffset="113.1 * (1 - c.level.progressPct / 100)"
                    transform="rotate(-90 22 22)"
                  />
                  <text
                    class="ptm-v font-display"
                    x="22"
                    y="22"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ c.level.level }}
                  </text>
                </svg>
                <span class="ptm-ic txt font-display">LvL</span>
              </div>
              <!-- ↘ PUISSANCE -->
              <div class="pt-mini corner br pow" :title="`Puissance ${fmtPow(combatPowerVal)}`">
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle class="ptm-track full" cx="22" cy="22" r="18" />
                  <text
                    class="ptm-v font-display"
                    x="22"
                    y="22"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ fmtPow(combatPowerVal) }}
                  </text>
                </svg>
                <span class="ptm-ic">⚔️</span>
              </div>
            </div>
            <!-- Nom du rang sous le carré (clic → tous les rangs). -->
            <button
              class="pt-rank font-display"
              type="button"
              title="Voir tous les rangs de prestige"
              @click="ranksOpen = true"
            >
              {{ rank.name }}
            </button>
          </div>

          <!-- Tous les rangs de prestige (clic sur le nom du rang). Cosmétique, dérivé du niveau. -->
          <q-dialog v-model="ranksOpen" position="bottom">
            <q-card class="adv-modal">
              <button
                class="adv-modal-x"
                aria-label="Fermer"
                type="button"
                @click="ranksOpen = false"
              >
                ✕
              </button>
              <div class="sec-title">Rangs de prestige</div>
              <div class="sec-hint">
                Cosmétique, dérivé de ton <b>niveau</b> (1 rang = 10 niveaux, 5 étoiles). N'affecte
                ni les stats ni le combat.
              </div>
              <div class="ranks-list">
                <div
                  v-for="r in rankList"
                  :key="r.name"
                  class="rank-row"
                  :class="{ current: r.current }"
                  :style="{ '--rank-c': r.color }"
                >
                  <span class="rank-emo">{{ r.emoji }}</span>
                  <span class="rank-name font-display">{{ r.name }}</span>
                  <span class="rank-lv">Niv. {{ r.fromLevel }}–{{ r.toLevel }}</span>
                  <span v-if="r.current" class="rank-cur">Actuel · {{ rank.star }}/5 ★</span>
                </div>
              </div>
            </q-card>
          </q-dialog>

          <!-- 3 stats en CERCLES sur une ligne. L'anneau = part du build (somme=100 %),
             le chiffre au centre = la valeur réelle (jamais « pleine » à tort). -->
          <div class="stats-circles">
            <div v-for="s in statCircles" :key="s.key" class="statc" :class="s.key">
              <svg class="ring" viewBox="0 0 36 36" role="img" :aria-label="`${s.name} ${s.value}`">
                <circle class="track" cx="18" cy="18" r="15.9155" />
                <circle
                  class="arc"
                  cx="18"
                  cy="18"
                  r="15.9155"
                  transform="rotate(-90 18 18)"
                  :stroke-dasharray="`${s.share} 100`"
                />
                <text class="rc-emo" x="18" y="13" text-anchor="middle">{{ s.emo }}</text>
                <text class="rc-n font-display" x="18" y="26.5" text-anchor="middle">
                  {{ s.value }}
                </text>
              </svg>
              <div class="statc-nm font-display">{{ s.name }}</div>
              <div class="statc-inf">{{ s.inf }}</div>
            </div>
          </div>
          <div class="pv-line">
            ❤️ <b class="font-display">{{ c.pv + bonusPv }} PV</b>
            <span v-if="bonusPv" class="pv-bonus">(+{{ bonusPv }} bonus)</span>
          </div>
        </template>

        <!-- Stats de combat : fusionnées dans la Fiche (plus de sous-onglet Stats). -->
        <template v-if="persoSub === 'perso'">
          <div class="sec-title">Combat : base → équipé</div>
          <div class="gear-fx">
            <div class="gfx">
              <span class="gfx-l">❤️ PV</span>
              <span class="gfx-v"
                >{{ baseFighter.pv }} <i>→</i> <b>{{ fighter.pv }}</b></span
              >
            </div>
            <div class="gfx">
              <span class="gfx-l">⚔️ Dégâts/coup</span>
              <span class="gfx-v"
                >{{ baseFighter.damage }} <i>→</i> <b>{{ fighter.damage }}</b></span
              >
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
              <span class="gfx-v"
                >{{ pctA(baseFighter.crit) }} <i>→</i> <b>{{ pctA(fighter.crit) }}</b></span
              >
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
        </template>

        <!-- Sélecteur de VOIE (ouvert depuis le cercle 🧭 en haut-gauche du carré) -->
        <q-dialog v-model="voieOpen" position="bottom">
          <q-card class="adv-modal">
            <button class="adv-modal-x" aria-label="Fermer" @click="voieOpen = false">✕</button>
            <div class="sec-title">🧭 Choisis ta voie</div>
            <div class="sec-hint">
              Ta voie ajoute un <b>petit passif</b> et débloque le <b>capstone (4-pièces)</b> du set
              de sa voie. Les drops ne sont <b>pas biaisés</b> : c'est le
              <b>set que tu complètes</b>
              qui définit ton build. Changement libre à tout moment.
            </div>
            <div class="voie-list">
              <button
                v-for="v in VOIES"
                :key="v.id"
                class="voie-opt"
                :class="{ on: char.row.voie === v.id }"
                @click="doSetVoie(v.id)"
              >
                <span class="vo-emo">{{ v.emoji }}</span>
                <div class="vo-main">
                  <div class="vo-name font-display">
                    {{ v.name }}
                    <span v-if="char.row.voie === v.id" class="vo-eq">✓ Active</span>
                  </div>
                  <div class="vo-blurb">{{ v.blurb }}</div>
                  <div class="vo-stats">
                    Stats : {{ voieStatsLabel(v.id) }} · passif {{ voiePassiveLabel(v.id) }}
                  </div>
                </div>
              </button>
            </div>
            <button v-if="char.row.voie" class="voie-clear" @click="doSetVoie(null)">
              Retirer ma voie (aucun passif ni capstone)
            </button>
          </q-card>
        </q-dialog>

        <q-dialog v-model="talentsOpen" position="bottom">
          <q-card class="adv-modal">
            <button class="adv-modal-x" aria-label="Fermer" @click="talentsOpen = false">✕</button>
            <div class="sec-title">
              Talents <span class="tal-slots">{{ equippedTalents.length }}/{{ talentSlots }}</span>
            </div>
            <div class="sec-hint">
              Les talents <b>droppent à un grade</b> (rang + qualité) fixé au drop. Équipe-en
              {{ talentSlots }} (change quand tu veux) ; vends les surplus pour de l'or.
            </div>

            <div v-if="!char.row.talents.length" class="talents-empty">
              Aucun talent pour l'instant — vaincs des donjons pour en faire tomber.
            </div>
            <!-- Talents conseillés (ticket 9f2c6a42) : équipe d'un coup la meilleure combi
                 pour ta puissance ; ils sont encadrés en doré dans la liste (08b10b7f). -->
            <button
              v-if="char.row.talents.length"
              class="voie-btn talent-reco-btn"
              @click="doEquipRecommendedTalents"
            >
              🪄 Équiper les talents conseillés
            </button>
            <div v-if="char.row.talents.length" class="talents-grid">
              <div
                v-for="t in talentsView"
                :key="t.id"
                class="tal-card"
                :class="['p-' + t.rarity, { eq: t.equipped, reco: recommendedTalentIds.has(t.id) }]"
              >
                <button
                  class="tal-emo"
                  title="Explication du talent"
                  aria-label="Expliquer ce talent"
                  @click="explainTalent(t)"
                >
                  {{ t.def.icon }}
                </button>
                <div class="tal-body">
                  <div class="tal-name font-display">
                    <span class="tal-nm">{{ t.def.name }}</span>
                    <span v-if="t.equipped" class="tal-eqbadge">✓ Équipé</span>
                    <span
                      class="rk-badge"
                      :class="'p-' + t.rarity"
                      :title="'Rang ' + RARITY_LABEL[t.rarity]"
                      >{{ t.rarity }}</span
                    >
                    <span class="q-badge" :class="'q-' + t.quality">{{ t.quality }}</span>
                  </div>
                  <div class="tal-eff">+{{ t.effLabel }} {{ t.def.desc }}</div>
                  <!-- Pastille de comparaison (ticket 25091d45) : gain/perte de puissance si
                       équipé. Rien si +0 ou déjà équipé. -->
                  <span
                    v-if="talDeltaMap.get(t.id)"
                    class="cmp-pill"
                    :class="talDeltaMap.get(t.id)! > 0 ? 'up' : 'down'"
                  >
                    {{ talDeltaMap.get(t.id)! > 0 ? '+' : '−'
                    }}{{ fmtPow(Math.abs(talDeltaMap.get(t.id)!)) }}
                  </span>
                </div>
                <div class="tal-actions">
                  <button
                    v-if="!t.equipped"
                    class="tal-b"
                    :disabled="!canEquipMore || talentCodeEquipped(t.def.code)"
                    :title="
                      talentCodeEquipped(t.def.code) ? 'Un talent de ce type est déjà équipé' : ''
                    "
                    @click="doEquipTalent(t.id)"
                  >
                    {{ talentCodeEquipped(t.def.code) ? 'Déjà équipé' : 'Équiper' }}
                  </button>
                  <button v-else class="tal-b" @click="doUnequipTalent(t.id)">Retirer</button>
                  <button v-if="!t.equipped" class="tal-b ghost" @click="doSellTalent(t.id)">
                    🪙 Vendre
                  </button>
                </div>
              </div>
            </div>
          </q-card>
        </q-dialog>

        <!-- FAMILIERS — recycle les surplus → poussière d'âme, puis 🔧 grade (rang/qualité). -->
        <q-dialog v-model="familiarsOpen" position="bottom">
          <q-card class="adv-modal">
            <button class="adv-modal-x" aria-label="Fermer" @click="familiarsOpen = false">
              ✕
            </button>
            <div class="sec-title">
              🐾 Familiers <span class="tal-slots">{{ equippedFamiliar ? 1 : 0 }}/1</span>
            </div>
            <div class="sec-hint">
              Un compagnon (bonus de race + effet <b>✦ signature</b> pour les rares). Les familiers
              <b>droppent à un grade</b> fixé au drop ; équipe-en un ; vends les surplus pour de
              l'or.
            </div>

            <div v-if="!allFamiliars.length" class="talents-empty">
              Aucun familier — <b>clear le Labyrinthe 🗝️</b> pour en trouver un garanti.
            </div>
            <button
              v-if="allFamiliars.length"
              class="voie-btn talent-reco-btn"
              @click="doEquipRecommendedFamiliar"
            >
              🪄 Équiper le familier conseillé
            </button>
            <div v-if="allFamiliars.length" class="talents-grid">
              <div
                v-for="f in allFamiliars"
                :key="f.id"
                class="tal-card"
                :class="['p-' + f.rarity, { eq: f.equipped, reco: recommendedFamiliarId === f.id }]"
              >
                <ItemIcon :item="f" :size="40" role="img" :aria-label="f.name" />
                <div class="tal-body">
                  <div class="tal-name font-display">
                    <span class="tal-nm">{{ f.name }}</span>
                    <span v-if="f.equipped" class="tal-eqbadge">✓ Équipé</span>
                    <span class="rk-badge" :class="'p-' + f.rarity">{{ f.rarity }}</span>
                    <span v-if="itemQuality(f)" class="q-badge" :class="'q-' + itemQuality(f)">{{
                      itemQuality(f)
                    }}</span>
                    <span v-if="f.effect2" class="fam-sig-badge" title="Effet signature">✦</span>
                  </div>
                  <div class="tal-eff">{{ itemEffects(f) }}</div>
                  <!-- Pastille de comparaison (ticket 25091d45) : gain/perte de puissance si
                       équipé à la place du familier actuel. Rien si +0 ou déjà équipé. -->
                  <span
                    v-if="famDeltaMap.get(f.id)"
                    class="cmp-pill"
                    :class="famDeltaMap.get(f.id)! > 0 ? 'up' : 'down'"
                  >
                    {{ famDeltaMap.get(f.id)! > 0 ? '+' : '−'
                    }}{{ fmtPow(Math.abs(famDeltaMap.get(f.id)!)) }}
                  </span>
                </div>
                <div class="tal-actions">
                  <button v-if="f.equipped" class="tal-b" @click="doUnequipFamiliar()">
                    Retirer
                  </button>
                  <button v-else class="tal-b" @click="doEquipFamiliar(f.id)">Équiper</button>
                  <button
                    v-if="!f.equipped"
                    class="tal-b ghost"
                    title="Vendre contre de l'or"
                    @click="doSell(f)"
                  >
                    🪙{{ sellValue(f) }}
                  </button>
                </div>
              </div>
            </div>
          </q-card>
        </q-dialog>

        <template v-if="persoSub === 'perso'">
          <!-- Codex : bestiaire + journal des sets (méta de collection). -->
          <button class="codex-btn" @click="codexOpen = true">
            <span class="cx-emo">📖</span>
            <span class="cx-main">
              <span class="cx-title">Codex</span>
              <span class="cx-sub">
                👾 {{ codexSum.monstersFound }}/{{ codexSum.monstersTotal }} monstres · 🧩
                {{ codexSum.setsComplete }}/{{ codexSum.setsTotal }} sets
              </span>
            </span>
            <span class="cx-go">›</span>
          </button>

          <div class="foot">
            <b>Chaque séance fait progresser ton aventurier.</b> Les stats et le niveau viennent du
            sport. La connexion quotidienne, elle, ne donne qu'un peu d'énergie pour jouer.
          </div>
        </template>
      </template>

      <!-- ONGLET ÉQUIPEMENT -->
      <template v-else-if="tab === 'gear'">
        <!-- En-tête Équipement : titre + accès Sac / Loadouts par ICÔNES
             (plus de sous-onglets ; les stats de combat sont sur la fiche Héros). -->
        <div class="gear-head">
          <div class="sec-title gh-title">Équipement</div>
          <div class="gear-icons">
            <button
              class="gi-b"
              :disabled="onExpedition"
              title="Équipement conseillé — équipe automatiquement la meilleure combinaison de ton stuff (sets inclus)"
              @click="doOptimizeGear()"
            >
              🪄
            </button>
            <button class="gi-b" title="Sac — ton butin" @click="openBag()">
              🎒<span v-if="bagCount" class="gi-badge">{{ bagCount }}</span>
            </button>
            <button
              class="gi-b"
              :disabled="onExpedition"
              :title="
                onExpedition
                  ? '🧭 Indisponible en expédition'
                  : 'Loadouts — ranger un set d\'équipement'
              "
              @click="loadoutOpen = true"
            >
              📦
            </button>
          </div>
        </div>
        <div class="sec-hint">
          Ton stuff équipé. Ton butin est dans le <b>🎒 Sac</b> (icône en haut à droite).
        </div>
        <div v-if="equippedSet" class="equipped-set-banner">
          🧭 Set <b>{{ equippedSet.emoji }} {{ equippedSet.name }}</b> en cours ·
          {{ equippedSet.count }}/4 pièces
        </div>
        <div class="gear">
          <div
            v-for="slot in SLOTS"
            :key="slot"
            class="slot"
            :class="char.row.equipped[slot] ? 'r-' + char.row.equipped[slot]!.rarity : 'empty'"
          >
            <div class="slot-head">
              <ItemIcon
                v-if="char.row.equipped[slot]"
                :item="char.row.equipped[slot]!"
                :size="38"
                :show-stars="false"
              />
              <span v-else class="slot-emo">{{ SLOT_EMOJI[slot] }}</span>
              <span class="slot-lbl">{{ SLOT_LABEL[slot] }}</span>
            </div>
            <template v-if="char.row.equipped[slot]">
              <div class="slot-name">{{ char.row.equipped[slot]!.name }}</div>
              <!-- Méta : rang · qualité · (+enchant) · (🧩 set). Ligne UNIQUE (nowrap) → la
                   présence/absence d'un badge ne décale pas la carte (ticket layout). -->
              <div class="pills">
                <span class="gpill" :class="'p-' + char.row.equipped[slot]!.rarity">{{
                  RARITY_LABEL[char.row.equipped[slot]!.rarity]
                }}</span>
                <span
                  v-if="itemQuality(char.row.equipped[slot])"
                  class="q-badge"
                  :class="'q-' + itemQuality(char.row.equipped[slot])"
                  title="Qualité (5 = meilleur)"
                  >{{ itemQuality(char.row.equipped[slot]) }}</span
                >
                <span v-if="char.row.equipped[slot]!.setId" class="gpill set" title="Pièce de set"
                  >🧩</span
                >
              </div>
              <div class="slot-eff">{{ itemEffects(char.row.equipped[slot]!) }}</div>
              <!-- Actions ancrées EN BAS (slot-eff flexible) → alignées d'une carte à l'autre. -->
              <div class="slot-actions">
                <button class="slot-remove" :disabled="onExpedition" @click="doUnequip(slot)">
                  Retirer
                </button>
              </div>
              <!-- Badge : nb d'objets du SAC (même slot) au potentiel supérieur. Tap →
                     filtre le sac dessus. Cercle avec le 🎒 en fond. -->
              <button
                v-if="betterInBagCount(slot) > 0"
                class="slot-better"
                :title="betterInBagCount(slot) + ' objet(s) du sac meilleur(s) si équipé(s) — voir'"
                @click="showBetterForSlot(slot)"
              >
                <span class="sb-n">{{ betterInBagCount(slot) }}</span>
              </button>
            </template>
            <div v-else class="slot-vide">
              vide<template v-if="bagCountForSlot(slot) > 0">
                · {{ bagCountForSlot(slot) }} au sac</template
              >
            </div>
          </div>
        </div>

        <!-- Sets d'équipement (bonus 2/3/4 pièces) — rattachés à l'équipement -->
        <template v-if="activeSets.length">
          <div class="sec-title">Sets</div>
          <div
            v-for="s in activeSets"
            :key="s.id"
            class="setcard"
            :class="{ full: s.count >= 4 && s.mine }"
          >
            <div class="set-top">
              <span class="set-name">{{ s.emoji }} {{ s.name }}</span>
              <span v-if="s.mine" class="set-mine">🧭 ta voie</span>
              <span class="set-count font-display">{{ s.count }}/4</span>
            </div>
            <div class="set-theme">{{ s.theme }}</div>
            <div class="set-tiers">
              <span
                v-for="t in s.tiers"
                :key="t.pieces"
                class="set-tier"
                :class="{ on: t.on, locked: t.locked }"
              >
                {{ t.pieces }} pièces : {{ t.label }}<template v-if="t.capstone"> ⭐</template>
                <template v-if="t.locked"> 🔒 voie</template>
              </span>
            </div>
          </div>
        </template>

        <!-- Sac : MODALE ouverte par l'icône 🎒 en haut à droite (plus d'inline). -->
        <div v-if="bagOpen" class="shop-backdrop" @click.self="bagOpen = false">
          <div class="shop-card bag-card">
            <div class="shop-head">
              <div class="shop-title font-display">🎒 Sac ({{ bagCount }})</div>
              <button class="shop-x" aria-label="Fermer" @click="bagOpen = false">✕</button>
            </div>
            <template v-if="bagCount">
              <!-- Bannière du filtre « mieux au sac » (posé via le badge d'un item équipé). -->
              <div v-if="betterFilterSlot" class="better-banner">
                🔼 Meilleurs si équipés pour <b>{{ SLOT_LABEL[betterFilterSlot] }}</b>
                <button class="bb-clear" @click="setInvFilter('all')">Tout voir ✕</button>
              </div>
              <!-- Filtre par type d'objet -->
              <div class="inv-filter">
                <button
                  class="if-chip"
                  :class="{ on: invFilter === 'all' && !betterFilterSlot }"
                  @click="setInvFilter('all')"
                >
                  Tous
                </button>
                <button
                  v-for="slot in SLOTS"
                  :key="slot"
                  class="if-chip"
                  :class="{ on: invFilter === slot && !betterFilterSlot }"
                  @click="setInvFilter(slot)"
                >
                  {{ SLOT_EMOJI[slot] }} {{ SLOT_LABEL[slot] }}
                </button>
              </div>
              <!-- Filtre par SET (ticket 986a50b6) — visible seulement si le sac contient des pièces de set. -->
              <div v-if="bagSets.length" class="inv-filter inv-filter-set">
                <button
                  class="if-chip"
                  :class="{ on: invSetFilter === 'all' }"
                  @click="invSetFilter = 'all'"
                >
                  🧩 Tous sets
                </button>
                <button
                  v-for="s in bagSets"
                  :key="s.id"
                  class="if-chip"
                  :class="{ on: invSetFilter === s.id }"
                  @click="invSetFilter = s.id"
                >
                  {{ s.emoji }} {{ s.name }}
                </button>
              </div>
              <!-- Casse/vente en masse : objets qui n'améliorent pas ta puissance (pas
               meilleurs que l'équipé du même emplacement, MÊME montés à ton niveau).
               Les pépites potentielles et le 🔒 sont protégés. Respecte le filtre type. -->
              <div v-if="belowCount > 0" class="bulk">
                <span class="bulk-lbl"
                  >{{ belowCount }} objet{{ belowCount > 1 ? 's' : '' }} sans intérêt
                  <span class="bulk-note">(≤ ton équipement ; pépites &amp; 🔒 gardés)</span></span
                >
                <div class="bulk-btns">
                  <button class="bulk-b" @click="doSellBelow">
                    🪙 Tout vendre ({{ belowCount }})
                  </button>
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
                  <!-- Ligne 1 : visuel + nom + VERDICT de puissance (la décision) -->
                  <div class="ii-head">
                    <ItemIcon :item="it" :size="40" />
                    <div class="ii-name">{{ it.name }}</div>
                    <span class="ii-verdict" :class="powerVerdict(it).cls">{{
                      powerVerdict(it).label
                    }}</span>
                  </div>
                  <!-- Ligne 2 : méta grisée (rang · niveau · slot · qualité · set). Le rang et
                     la qualité sont CLIQUABLES → explication (ticket d094eac6). -->
                  <div class="ii-meta">
                    <span
                      class="ii-rar clk"
                      :class="'p-' + it.rarity"
                      role="button"
                      title="Qu’est-ce que le rang ?"
                      @click="helpTopic = 'rank'"
                      >{{ RARITY_LABEL[it.rarity] }}</span
                    >
                    <span
                      v-if="itemQuality(it)"
                      class="q-badge clk"
                      :class="'q-' + itemQuality(it)"
                      role="button"
                      title="Qu’est-ce que la qualité ?"
                      @click="helpTopic = 'quality'"
                      >{{ itemQuality(it) }}</span
                    >
                    <span class="ii-dot">·</span> {{ SLOT_LABEL[it.slot] }}
                    <span v-if="it.setId" class="gpill set">🧩 Set</span>
                  </div>
                  <!-- Comparaison : rang + qualité + effet, cet objet vs l'équipé (ticket 50f593a2). -->
                  <div class="ii-compare">
                    <div class="ii-cmp-row this">
                      <span class="ii-cmp-lbl">Cet objet</span>
                      <span class="ii-rar" :class="'p-' + it.rarity">{{
                        RARITY_LABEL[it.rarity]
                      }}</span>
                      <span
                        v-if="itemQuality(it)"
                        class="q-badge"
                        :class="'q-' + itemQuality(it)"
                        >{{ itemQuality(it) }}</span
                      >
                      <span class="ii-cmp-val">{{ itemEffects(it) }}</span>
                    </div>
                    <div class="ii-cmp-row eq">
                      <span class="ii-cmp-lbl">Équipé</span>
                      <template v-if="equippedInSlot(it.slot)">
                        <span class="ii-rar" :class="'p-' + equippedInSlot(it.slot)!.rarity">{{
                          RARITY_LABEL[equippedInSlot(it.slot)!.rarity]
                        }}</span>
                        <span
                          v-if="itemQuality(equippedInSlot(it.slot))"
                          class="q-badge"
                          :class="'q-' + itemQuality(equippedInSlot(it.slot))"
                          >{{ itemQuality(equippedInSlot(it.slot)) }}</span
                        >
                        <span class="ii-cmp-val">{{ itemEffects(equippedInSlot(it.slot)!) }}</span>
                      </template>
                      <span v-else class="ii-cmp-val dim">— emplacement libre</span>
                    </div>
                  </div>
                  <!-- PUISSANCE si équipé (rang + qualité) vs l'objet équipé du même slot. -->
                  <div class="ii-cmp2">
                    <span class="ii-cmp2-ic">⚔️</span>
                    <span
                      class="ii-cmp2-chip"
                      :class="powerIfEquip(it) >= combatPowerVal ? 'up' : 'down'"
                    >
                      <b>{{ fmtDelta(combatPowerVal, powerIfEquip(it)) }}</b
                      ><i>{{ equippedInSlot(it.slot) ? 'vs équipé' : 'emplacement libre' }}</i>
                    </span>
                  </div>
                  <!-- Actions : Équiper · icônes vendre/lock -->
                  <div class="ii-actions">
                    <button class="equip-btn" @click="doEquip(it.id)">
                      {{ equippedInSlot(it.slot) ? 'Remplacer' : 'Équiper' }}
                    </button>
                    <button
                      class="ii-ic"
                      :disabled="it.locked"
                      :title="'Vendre → or (' + sellValue(it) + '🪙)'"
                      @click="doSell(it)"
                    >
                      🪙
                    </button>
                    <button
                      class="ii-ic lock"
                      :class="{ on: it.locked }"
                      :title="it.locked ? 'Déverrouiller' : 'Garder pour plus tard (protéger)'"
                      @click="doToggleLock(it)"
                    >
                      {{ it.locked ? '🔒' : '🔓' }}
                    </button>
                    <button
                      v-if="isVoieSetItem(it)"
                      class="ii-ic"
                      :title="'Ranger dans le loadout ' + setVoieName(it.setId!)"
                      @click="doStashSetPiece(it)"
                    >
                      📦
                    </button>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="empty-inv">
              Ton sac est vide. Explore un donjon pour trouver du butin 🗡️
            </div>
          </div>
        </div>
      </template>

      <!-- ONGLET EXPLORER — sous-onglet Donjons (carte) -->
      <template v-else-if="tab === 'explore' && exploreSub === 'donjons'">
        <div class="gear-sub">
          <button class="gs-b on" @click="exploreSub = 'donjons'">🗺️ Donjons</button>
          <button class="gs-b" @click="exploreSub = 'boss'">👑 Boss de palier</button>
        </div>
        <!-- Expédition (mode idle : envoyer le héros explorer la carte) -->
        <button class="expe-card expe-idle" @click="openGame('/expedition-map')">
          <span class="expe-emo">🗺️</span>
          <span class="expe-main">
            <span class="expe-name font-display">Carte & village</span>
            <span class="expe-sub">
              <template v-if="onExpedition && expeHero">
                🧭 En cours — {{ expeHero.phase === 'return' ? 'retour' : 'arrivée' }} dans
                {{
                  fmtExpeMs(
                    expeHero.phase === 'return'
                      ? expeHero.remainTotalMs
                      : expeHero.remainToObjectiveMs,
                  )
                }}
              </template>
              <template v-else
                >Expéditions (or) + filons de production ⛏️💎 autour de la ville</template
              >
            </span>
          </span>
          <span class="expe-go">›</span>
        </button>

        <!-- Labyrinthe (donjon à étages exploré, débloqué par la Porte du Labyrinthe) -->
        <button
          class="expe-card"
          :class="{ locked: !hasLabyGate }"
          :disabled="onExpedition"
          @click="openLabyrinth"
        >
          <span class="expe-emo">{{ hasLabyGate ? '🗝️' : '🔒' }}</span>
          <span class="expe-main">
            <span class="expe-name font-display">Labyrinthe</span>
            <span class="expe-sub">
              <template v-if="!hasLabyGate">
                🚪 Construis la <b>Porte du Labyrinthe</b> (carte) pour le débloquer
              </template>
              <template v-else>
                Donjon à étages à explorer ·
                <b>{{ char.row?.keys ?? 0 }}</b> clé{{ (char.row?.keys ?? 0) > 1 ? 's' : '' }}
              </template>
            </span>
          </span>
          <span class="expe-go">›</span>
        </button>

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
          <div class="rb-bar">
            <span :style="{ width: (curRegionProg.done / curRegionProg.total) * 100 + '%' }" />
          </div>
          <div v-if="nxtRegion" class="rb-next">
            ⟶ Prochaine région :
            <span :style="{ color: nxtRegion.color }"
              >{{ nxtRegion.emoji }} {{ nxtRegion.name }}</span
            >
          </div>
          <div v-else class="rb-next">⭐ Dernière région — tu touches au bout du monde.</div>
        </div>

        <div v-if="!regionView" class="sec-title mboss-title">🗺️ Carte des mondes</div>
        <div v-if="!regionView" class="sec-hint map-hint">
          Touche une région pour ouvrir ses donjons.
          <button
            v-if="currentRegionIndex > 1"
            class="map-toggle"
            @click="showAllRegions = !showAllRegions"
          >
            {{ showAllRegions ? '➖ Réduire' : '🗺️ Voir toutes les zones' }}
          </button>
        </div>
        <!-- Carte-monde serpentine : un nœud par région, fil énergisé, cadenas. -->
        <div
          v-if="!regionView"
          ref="worldmapEl"
          class="worldmap"
          :style="{ height: mapGeom.viewH + 'px' }"
        >
          <svg class="wm-svg" :viewBox="`0 0 100 ${mapGeom.viewH}`" preserveAspectRatio="none">
            <!-- Un segment par paire de zones : BLEU si la zone d'arrivée est
                 accessible (les deux zones ouvertes), NOIR vers une zone verrouillée. -->
            <path
              v-for="(seg, i) in mapGeom.segments"
              :key="i"
              :d="seg"
              class="wm-seg"
              :class="{ open: segmentOpen(i) }"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <button
            v-for="(r, i) in visibleRegions"
            :key="r.id"
            class="wm-node"
            :class="[regionState(r), { sel: selRegion.id === r.id, shatter: shatterId === r.id }]"
            :style="{ ...nodeStyle(i), '--rc': r.color }"
            @click="tapRegion(r)"
          >
            <span class="wm-disc">
              <span v-if="regionState(r) === 'locked' && shatterId !== r.id" class="wm-lockemo"
                >🔒</span
              >
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

        <!-- Vue région : arbre des donjons de la région tapée (remplace la carte). -->
        <div
          v-if="regionView"
          ref="drawerEl"
          class="region-drawer"
          :style="{ '--rc': selRegion.color }"
        >
          <div class="rd-head">
            <button class="rd-back" title="Retour à la carte" @click="closeRegion">‹ Carte</button>
            <span class="rd-emo">{{ selRegion.emoji }}</span>
            <span class="rd-name font-display">{{ selRegion.name }}</span>
            <span class="rd-prog"
              >{{ regionDone(selRegion) }}/{{ selRegion.dungeonIds.length }}</span
            >
          </div>
        </div>
        <div v-if="regionView" class="dungeons">
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
                :class="powClass(it.dungeon.recoLevel)"
                :title="powTitle(it.dungeon.recoLevel)"
                >⚔️ {{ fmtPow(recoPow(it.dungeon.recoLevel)) }}</span
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
          <div v-if="endlessUnlocked && selRegion.id === endRegionId" class="dgn mboss endless">
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

      <!-- ONGLET EXPLORER — sous-onglet Boss de palier -->
      <template v-else-if="tab === 'explore' && exploreSub === 'boss'">
        <div class="gear-sub">
          <button class="gs-b" @click="exploreSub = 'donjons'">🗺️ Donjons</button>
          <button class="gs-b on" @click="exploreSub = 'boss'">👑 Boss de palier</button>
        </div>
        <div class="sec-title mboss-title">👑 Boss de palier</div>
        <div class="sec-hint">
          Un boss tous les 5 niveaux — chacun lâche une <b>pièce de set de voie</b> (au hasard parmi
          les 8). Complète le set de <b>ta voie</b> pour débloquer son capstone. Débloqués en chaîne
          (bats le précédent). Tenter un boss coûte des <b>pierres d’invocation 🔮</b>
          <b>farmées dans les donjons</b>.
        </div>
        <button class="sets-catalog-btn" @click="setsCatalogOpen = true">
          📖 Voir les 8 sets de voie et leurs bonus
        </button>
        <div v-if="hasBossAltar" class="summon-forge">
          <span class="sf-have">🔮 {{ char.row.summon_stones }} pierre(s) d’invocation</span>
        </div>
        <!-- Prérequis : les boss exigent l'Autel des boss (bâtiment) → CTA « où aller ». -->
        <button v-if="!hasBossAltar" class="boss-gate-cta" @click="openGame('/expedition-map')">
          <span class="bg-emo">🔮</span>
          <span class="bg-txt">
            <b>Les boss sont verrouillés</b> — construis l’<b>Autel des boss</b> sur la carte
            d’expédition pour les affronter.
          </span>
          <span class="bg-go">Aller à la carte →</span>
        </button>
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
              <span
                class="dgn-chip"
                :class="{ short: (char.row?.summon_stones ?? 0) < summonCostFor(b) }"
                title="Coût en pierres d’invocation · réserve dont tu disposes"
                >🔮 {{ summonCostFor(b) }}
                <span class="chip-reserve">/ {{ char.row.summon_stones }} en réserve</span></span
              >
              <span class="dgn-chip gold">+{{ b.gold }} 🪙</span>
              <span
                v-if="bossUnlocked(b)"
                class="dgn-chip winpct"
                :class="powClass(b.unlockLevel)"
                :title="powTitle(b.unlockLevel)"
                >⚔️ {{ fmtPow(recoPow(b.unlockLevel)) }}</span
              >
            </div>

            <div class="mboss-set">
              🧩 Butin : une <b>pièce de set de voie</b> au hasard (complète le set de ta voie)
            </div>
            <div v-if="bossUnlocked(b)" class="dgn-hint">{{ b.hint }}</div>
            <div v-else class="dgn-hint dgn-lock">🔒 {{ bossLockReason(b) }}</div>

            <button
              v-if="bossUnlocked(b)"
              class="fight mboss-fight"
              :disabled="(char.row?.summon_stones ?? 0) < summonCostFor(b) || busy"
              @click="fightBoss(b)"
            >
              ⚔️ {{ isBossBeaten(b) ? 'Réaffronter' : 'Combattre' }} ({{ summonCostFor(b) }} 🔮)
            </button>
            <!-- Pas assez de pierres → on dit d'où elles viennent (farm de donjon / forge). -->
            <div
              v-if="bossUnlocked(b) && (char.row?.summon_stones ?? 0) < summonCostFor(b)"
              class="dgn-hint summon-hint"
            >
              🔮 Farme les donjons (drop au nettoyage) ou forge à la poussière ↓
            </div>
            <!-- Verrouillé par l'Autel manquant → bouton qui EMMÈNE le construire. -->
            <button
              v-else-if="!hasBossAltar"
              class="fight mboss-fight lock-go"
              @click="openGame('/expedition-map')"
            >
              🔮 Construire l’Autel →
            </button>
            <!-- Verrouillé par la chaîne → on dit quel boss battre d'abord (juste au-dessus). -->
            <button v-else class="fight mboss-fight" disabled>🔒 {{ bossLockReason(b) }}</button>
          </div>
        </div>
      </template>
    </template>

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
                <span class="rarity">{{ RARITY_LABEL[replaceTarget.rarity] }}</span>
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
                <span class="rarity">{{
                  RARITY_LABEL[equippedInSlot(replaceTarget.slot)!.rarity]
                }}</span>
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

    <!-- Boîte à messages 📬 : rapports d'expédition -->
    <transition name="salv-fade">
      <div v-if="inboxOpen" class="shop-backdrop" @click.self="inboxOpen = false">
        <div class="shop-card">
          <div class="shop-head">
            <div class="shop-title font-display">📬 Messages</div>
            <button class="shop-x" aria-label="Fermer" @click="inboxOpen = false">✕</button>
          </div>
          <div class="inbox-list">
            <div v-if="!(char.row?.messages ?? []).length" class="inbox-empty">
              Aucun message. Les rapports de tes expéditions apparaîtront ici.
            </div>
            <div
              v-for="m in char.row?.messages ?? []"
              :key="m.id"
              class="inbox-msg"
              :class="m.win ? 'win' : 'lose'"
            >
              <div class="im-head">
                <span class="im-emo">{{ m.win ? '🏆' : '💀' }}</span>
                <span class="im-title">{{ POI_MSG_LABEL[m.poiType] }} · niv {{ m.level }}</span>
              </div>
              <div class="im-text">{{ m.text }}</div>
              <div class="im-haul">
                <span v-if="m.gold">🪙 +{{ m.gold }}</span>
                <span v-if="m.energy">⚡ +{{ m.energy }}</span>
                <span v-if="m.key">🗝️ +{{ m.key }}</span>
              </div>
              <!-- Objet gagné : détail complet (rareté / niveau / effet). -->
              <div v-if="m.item" class="im-loot" :class="'p-' + m.item.rarity">
                <ItemIcon :item="m.item" :size="38" />
                <div class="im-loot-main">
                  <div class="im-loot-name">
                    {{ m.item.name }}<span v-if="m.item.setId" class="im-loot-set"> 🧩</span>
                  </div>
                  <div class="im-loot-sub">
                    <span :class="'p-' + m.item.rarity">{{ RARITY_LABEL[m.item.rarity] }}</span> ·
                    {{ SLOT_LABEL[m.item.slot] }}
                  </div>
                  <div class="im-loot-eff">{{ itemEffects(m.item) }}</div>
                  <div v-if="m.itemCount && m.itemCount > 1" class="im-loot-more">
                    🎁 +{{ m.itemCount - 1 }} autre{{ m.itemCount - 1 > 1 ? 's' : '' }} objet{{
                      m.itemCount - 1 > 1 ? 's' : ''
                    }}
                    au sac
                  </div>
                </div>
              </div>
              <span v-else-if="m.itemName" class="im-item">🎁 {{ m.itemName }}</span>
            </div>
          </div>
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
              <span class="cx-count"
                >{{ codexSum.monstersFound }}/{{ codexSum.monstersTotal }}</span
              >
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
              <span class="cx-count"
                >{{ codexSum.setsComplete }}/{{ codexSum.setsTotal }} complets</span
              >
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
                  <div class="setj-voie" :class="{ mine: isMySetId(s.set.id) }">
                    <template v-if="isMySetId(s.set.id)"
                      >🧭 Ta voie — complète-le (4/4) pour ta signature</template
                    >
                    <template v-else>🧭 Voie {{ setVoieName(s.set.id) }}</template>
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

    <!-- MODALE LOADOUTS — accès par l'icône 📦 de l'Équipement. -->
    <div v-if="loadoutOpen" class="shop-backdrop" @click.self="loadoutOpen = false">
      <div class="shop-card">
        <div class="shop-head">
          <div class="shop-title font-display">📦 Loadouts</div>
          <button class="shop-x" aria-label="Fermer" @click="loadoutOpen = false">✕</button>
        </div>
        <div class="sec-hint">
          Range ton stuff équipé (arme / armure / accessoire / relique — le <b>familier reste</b>)
          pour garder un set pendant que tu en testes un autre. Les objets rangés ne sont
          <b>pas</b> dans le sac.
        </div>
        <div class="loadouts">
          <div
            v-for="(lo, i) in loadoutsView"
            :key="i"
            class="loadout"
            :class="{ empty: !lo.count, active: equippedSet?.idx === i }"
          >
            <div class="lo-head">
              <span
                class="lo-name font-display"
                :class="{ mine: loadoutVoie(i) && char.row?.voie === loadoutVoie(i)!.id }"
              >
                <template v-if="loadoutVoie(i)"
                  >{{ loadoutVoie(i)!.emoji }} {{ loadoutVoie(i)!.name }}</template
                >
                <template v-else>Loadout {{ i + 1 }}</template>
                <span v-if="equippedSet?.idx === i" class="lo-active">✓ en cours</span>
              </span>
              <span
                v-if="lo.count"
                class="lo-power"
                :class="lo.delta >= 0 ? 'up' : 'down'"
                title="Puissance si tu équipes ce loadout (familier actuel conservé)"
              >
                ⚔️ {{ fmtPow(lo.power) }} <b>({{ fmtDelta(combatPowerVal, lo.power) }})</b>
              </span>
              <span v-else class="lo-empty-tag">vide</span>
            </div>
            <div v-if="lo.count" class="lo-items">
              <span
                v-for="it in lo.items"
                :key="it.slot"
                class="lo-item"
                :class="'r-' + it.rarity"
                :title="SLOT_LABEL[it.slot] + ' · ' + it.name"
                >{{ SLOT_EMOJI[it.slot] }}</span
              >
            </div>
            <button
              class="lo-btn"
              :disabled="(!lo.count && !hasEquippedGear) || busy"
              @click="doSwapLoadout(i)"
            >
              {{
                lo.count
                  ? hasEquippedGear
                    ? '🔄 Échanger'
                    : '⬆️ Équiper'
                  : '📦 Ranger mon stuff (nu)'
              }}
            </button>
            <!-- Gestion d'un loadout rangé : vider vers le sac (46488974) ou vendre (53a6d487). -->
            <div v-if="lo.count" class="lo-actions">
              <button
                class="lo-mini"
                :disabled="busy"
                title="Remettre ces objets dans le sac"
                @click="doUnpackLoadout(i)"
              >
                🎒 Vider
              </button>
              <button
                class="lo-mini sell"
                :disabled="busy"
                :title="'Vendre ces objets (' + fmtPow(lo.sellGold) + ' or)'"
                @click="doSellLoadout(i)"
              >
                🪙 Vendre ({{ lo.sellGold }})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Butin possible d'un donjon -->
    <!-- Explication RANG / QUALITÉ (clic sur la pastille de rang ou le chiffre de qualité). -->
    <q-dialog :model-value="!!helpTopic" position="bottom" @update:model-value="helpTopic = null">
      <q-card class="help-card">
        <template v-if="helpTopic === 'rank'">
          <div class="help-title font-display">🏅 Le rang de l’objet</div>
          <p class="help-p">
            Le <b>rang</b> va de <b>G</b> (le plus bas) à <b>SSS</b> (le graal). Un rang supérieur
            est <b>toujours meilleur</b> — les valeurs ne se chevauchent jamais. On débloque les
            rangs plus hauts en farmant du contenu plus <b>profond</b> (donjons et boss de plus haut
            niveau).
          </p>
          <div class="help-scale">
            <span v-for="r in RANK_ORDER" :key="r" class="ii-rar" :class="'p-' + r">{{ r }}</span>
          </div>
        </template>
        <template v-else>
          <div class="help-title font-display">✦ La qualité de l’objet</div>
          <p class="help-p">
            La <b>qualité</b> (de <b>1</b> à <b>5</b>, <b>5 = meilleur</b>) est un
            <b>sous-rang</b> dans la bande du rang : la finesse du roll. Un <b>5</b> vaut presque le
            rang au-dessus, un <b>1</b> est le plancher du rang. Couleur du rouge (1) au vert (5).
          </p>
          <div class="help-scale">
            <span v-for="q in [1, 2, 3, 4, 5]" :key="q" class="q-badge" :class="'q-' + q">{{
              q
            }}</span>
          </div>
        </template>
        <button v-close-popup class="help-close">Compris</button>
      </q-card>
    </q-dialog>

    <q-dialog :model-value="!!dropInfo" position="bottom" @update:model-value="dropInfo = null">
      <q-card v-if="dropInfo" class="drops-card">
        <div class="drops-title font-display">{{ dropInfo.emoji }} Butin — {{ dropInfo.name }}</div>
        <div class="drops-row">
          <span class="drops-k">Récompenses</span>
          <span class="drops-v">jusqu'à {{ dungeonGold(dropInfo) }} 🪙</span>
        </div>
        <div class="drops-sub">Chances de rang (selon TON niveau)</div>
        <div class="odds">
          <div
            v-for="o in rarityOdds(dropInfo.dropLuck, dropInfo.dropLevel, heroLevel)"
            :key="o.label"
            class="odd"
            :class="o.cls"
          >
            <span class="odd-pct font-display">{{ o.pct }}%</span>
            <span class="odd-lbl">{{ o.label }}</span>
          </div>
        </div>
        <div class="drops-note">
          Le <b>rang</b> (G→SSS) est tiré en <b>pyramide centrée sur ton niveau</b> : surtout ton
          rang, parfois <b>un cran au-dessus</b> (jackpot, ↑ avec la luck). La <b>qualité</b> (roll)
          varie en continu → farme le meilleur « jet ». Les <b>pièces de set</b> (de voie) tombent
          sur les <b>boss de palier</b>.
        </div>
        <button class="drops-close" @click="dropInfo = null">Fermer</button>
      </q-card>
    </q-dialog>

    <!-- CATALOGUE des 8 SETS DE VOIE (accès depuis l'onglet Boss) -->
    <div v-if="setsCatalogOpen" class="shop-backdrop" @click.self="setsCatalogOpen = false">
      <div class="shop-card sets-cat-card">
        <div class="shop-head">
          <div class="shop-title font-display">📖 Sets de voie (8)</div>
          <button class="shop-x" aria-label="Fermer" @click="setsCatalogOpen = false">✕</button>
        </div>
        <div class="sets-cat-sub">
          Les boss droppent une pièce de <b>n'importe quel</b> set. Complète les 4 pièces du set de
          <b>ta voie</b> pour débloquer son <b>capstone</b> ⭐. Bonus indiqués à leur valeur de base
          (ils montent avec le rang de tes pièces).
        </div>
        <div class="sets-cat-list">
          <div v-for="s in voieSetsCatalog" :key="s.id" class="setcard" :class="{ full: s.mine }">
            <div class="set-top">
              <span class="set-name">{{ s.emoji }} {{ s.name }}</span>
              <span v-if="s.mine" class="set-mine">🧭 ta voie</span>
            </div>
            <div class="set-theme">{{ s.theme }}</div>
            <div class="set-tiers">
              <span v-for="t in s.tiers" :key="t.pieces" class="set-tier on">
                {{ t.pieces }} pièces : {{ t.label
                }}<template v-if="t.capstone"> ⭐ capstone (voie {{ s.voieName }})</template>
              </span>
            </div>
          </div>
        </div>
        <button class="drops-close" @click="setsCatalogOpen = false">Fermer</button>
      </div>
    </div>

    <!-- CONFLIT de rangement de set : le slot du loadout est déjà pris → comparer & choisir. -->
    <q-dialog :model-value="!!stashConflict" @update:model-value="stashConflict = null">
      <q-card v-if="stashConflict" class="drops-card stash-card">
        <div class="drops-title font-display">
          📦 {{ SLOT_LABEL[stashConflict.incoming.slot] }} · {{ VOIES[stashConflict.idx]?.name }}
        </div>
        <div class="stash-sub">
          Ce loadout a déjà une pièce sur cet emplacement (1 set max). Garde la meilleure.
        </div>
        <div class="stash-cmp">
          <div
            class="stash-side"
            :class="{
              best: powerIfEquip(stashConflict.incoming) >= powerIfEquip(stashConflict.stored),
            }"
          >
            <div class="stash-lbl">Nouvelle</div>
            <div class="stash-nm">
              {{ stashConflict.incoming.emoji }} {{ stashConflict.incoming.rarity }}
              <span class="stash-q">★{{ itemQuality(stashConflict.incoming) }}</span>
            </div>
            <div class="stash-eff">{{ itemEffects(stashConflict.incoming) }}</div>
            <div class="stash-pow">⚔️ {{ fmtPow(powerIfEquip(stashConflict.incoming)) }}</div>
          </div>
          <div
            class="stash-side"
            :class="{
              best: powerIfEquip(stashConflict.stored) > powerIfEquip(stashConflict.incoming),
            }"
          >
            <div class="stash-lbl">Rangée <span v-if="stashConflict.stored.locked">🔒</span></div>
            <div class="stash-nm">
              {{ stashConflict.stored.emoji }} {{ stashConflict.stored.rarity }}
              <span class="stash-q">★{{ itemQuality(stashConflict.stored) }}</span>
            </div>
            <div class="stash-eff">{{ itemEffects(stashConflict.stored) }}</div>
            <div class="stash-pow">⚔️ {{ fmtPow(powerIfEquip(stashConflict.stored)) }}</div>
          </div>
        </div>
        <div class="stash-actions">
          <button class="drops-close accent" @click="stashReplace">
            Remplacer —
            {{
              stashConflict.stored.locked
                ? 'ancienne → sac 🔒'
                : 'vendre l’ancienne 🪙 ' + sellValue(stashConflict.stored)
            }}
          </button>
          <button class="drops-close" @click="stashSellIncoming">
            Vendre la nouvelle 🪙 {{ sellValue(stashConflict.incoming) }}
          </button>
          <button class="drops-close ghost" @click="stashConflict = null">Ne rien faire</button>
        </div>
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
              <ItemIcon :item="cand.item" :size="40" />
              <div class="rc-main">
                <div class="rc-name">{{ cand.item.name }}</div>
                <div class="rc-pills">
                  <span class="rc-pill" :class="'p-' + cand.item.rarity">{{
                    RARITY_LABEL[cand.item.rarity]
                  }}</span>
                  <span
                    v-if="itemQuality(cand.item)"
                    class="q-badge"
                    :class="'q-' + itemQuality(cand.item)"
                    title="Qualité (5 = meilleur)"
                    >{{ itemQuality(cand.item) }}</span
                  >
                  <span v-if="cand.item.setId" class="rc-pill set">🧩 Set</span>
                  <span v-if="rewardFitsVoie(cand.item)" class="rc-pill voie">🧭 ta voie</span>
                </div>
                <div class="rc-eff">
                  {{ SLOT_LABEL[cand.item.slot] }} · {{ itemEffects(cand.item) }}
                </div>
                <div class="drop-cmp rc-cmp">
                  <span v-if="equippedInSlot(cand.item.slot)"
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(cand.item.slot)!.rarity] }} ·
                    {{ itemEffects(equippedInSlot(cand.item.slot)!) }}</span
                  >
                  <span v-else>Emplacement libre</span>
                  <span class="rarity-verdict" :class="rarityVerdict(cand.item).cls">{{
                    rarityVerdict(cand.item).label
                  }}</span>
                </div>
                <div class="pow-cmp">
                  ⚔️ vs équipé {{ fmtPow(combatPowerVal) }} →
                  <b :class="powerIfEquip(cand.item) >= combatPowerVal ? 'up' : 'down'"
                    >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                      fmtDelta(combatPowerVal, powerIfEquip(cand.item))
                    }})</b
                  >
                </div>
                <div v-if="rewardDupNote(cand.item)" class="rc-dup">
                  {{ rewardDupNote(cand.item) }}
                </div>
                <div
                  v-if="rewardLoadoutCmp(cand.item)"
                  class="rc-loadcmp"
                  :class="rewardLoadoutCmp(cand.item)!.cls"
                >
                  {{ rewardLoadoutCmp(cand.item)!.text }}
                </div>
              </div>
            </template>
            <template v-else>
              <span class="rc-emo">💰</span>
              <div class="rc-main">
                <div class="rc-name">Trésor</div>
                <div class="rc-eff">+{{ cand.gold }} 🪙</div>
              </div>
            </template>
          </button>
        </div>
      </q-card>
    </q-dialog>

    <!-- Rapport de combat (post-run) en MODALE : toutes les infos + réattaquer /
         inventaire / fermer -->
    <q-dialog v-model="reportOpen" :persistent="!stageDone">
      <q-card
        v-if="run"
        class="report-modal"
        :class="[run.cleared ? 'win' : 'lose', { 'rm-compact': rewardChoiceMode }]"
      >
        <div class="rm-head">
          <div class="rm-title font-display">{{ run.name }}</div>
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
            v-if="stageFights.length && !(stageDone && (stageWasReward || stageSkipped))"
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
                <span
                  v-if="run.summonStones"
                  class="gain-pill summon"
                  title="Pierres d’invocation (pour affronter les boss)"
                  >+{{ run.summonStones }} 🔮</span
                >
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
          <div v-if="stageDone && run.drops.length" ref="dropsEl" class="drops">
            <div class="drops-lbl">✨ Butin</div>
            <div
              v-for="(d, di) in run.drops"
              :key="d.id"
              class="drop drop-reveal"
              :class="'r-' + d.rarity"
              :style="{ animationDelay: di * 0.12 + 's' }"
            >
              <ItemIcon :item="d" :size="40" />
              <div class="inv-main">
                <div class="inv-name">{{ d.name }}</div>
                <div class="pills">
                  <span class="gpill" :class="'p-' + d.rarity">{{ RARITY_LABEL[d.rarity] }}</span>
                  <span
                    v-if="itemQuality(d)"
                    class="q-badge"
                    :class="'q-' + itemQuality(d)"
                    title="Qualité (5 = meilleur)"
                    >{{ itemQuality(d) }}</span
                  >
                  <span v-if="d.setId" class="gpill set">🧩 Set</span>
                </div>
                <div class="inv-eff">{{ SLOT_LABEL[d.slot] }} · {{ itemEffects(d) }}</div>
                <div v-if="equippedInSlot(d.slot)" class="drop-cmp">
                  <span
                    >Équipé : {{ RARITY_LABEL[equippedInSlot(d.slot)!.rarity]
                    }}<span v-if="equippedInSlot(d.slot)!.setId" title="Pièce de set"> 🧩</span> ·
                    {{ itemEffects(equippedInSlot(d.slot)!) }}</span
                  >
                  <span class="rarity-verdict" :class="rarityVerdict(d).cls">{{
                    rarityVerdict(d).label
                  }}</span>
                </div>
                <div v-else class="drop-cmp"><span class="rarity-verdict up">slot libre</span></div>
                <!-- Puissance si équipé (rang + qualité) vs l'objet équipé du même slot. -->
                <div class="ii-cmp2">
                  <span class="ii-cmp2-ic">⚔️</span>
                  <span
                    class="ii-cmp2-chip"
                    :class="powerIfEquip(d) >= combatPowerVal ? 'up' : 'down'"
                  >
                    <b>{{ fmtDelta(combatPowerVal, powerIfEquip(d)) }}</b
                    ><i>{{ equippedInSlot(d.slot) ? 'vs équipé' : 'emplacement libre' }}</i>
                  </span>
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
                  <button class="link-btn" @click="doSell(d)">Vendre 🪙{{ sellValue(d) }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Talent(s) tombé(s) : rangés directement dans la collection Talents (onglet Perso). -->
          <div v-if="stageDone && run.talentDrops?.length" class="drops talent-drops">
            <div class="drops-lbl">
              🧠 {{ run.talentDrops.length > 1 ? 'Talents trouvés' : 'Talent trouvé' }}
              <button
                class="drops-goto"
                title="Ouvrir la collection Talents"
                @click="goTalentsFromReport"
              >
                🧠 Voir mes talents →
              </button>
            </div>
            <div
              v-for="(t, ti) in run.talentDrops"
              :key="t.id"
              class="drop drop-reveal"
              :class="'r-' + talentRankOf(t)"
              :style="{ animationDelay: ti * 0.12 + 's' }"
            >
              <span class="inv-emo">{{ talentIcon(t) }}</span>
              <div class="inv-main">
                <div class="inv-name">{{ talentName(t) }}</div>
                <div class="pills">
                  <span class="rk-badge" :class="'p-' + talentRankOf(t)">{{
                    talentRankOf(t)
                  }}</span>
                  <span class="q-badge" :class="'q-' + talentDropQuality(t)">{{
                    talentDropQuality(t)
                  }}</span>
                  <span class="gpill">→ collection Talents</span>
                </div>
              </div>
            </div>
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
                  <ItemIcon :item="cand.item" :size="40" />
                  <div class="rc-main">
                    <div class="rc-name">{{ cand.item.name }}</div>
                    <div class="rc-pills">
                      <span class="rc-pill" :class="'p-' + cand.item.rarity">{{
                        RARITY_LABEL[cand.item.rarity]
                      }}</span>
                      <span
                        v-if="itemQuality(cand.item)"
                        class="q-badge"
                        :class="'q-' + itemQuality(cand.item)"
                        title="Qualité (5 = meilleur)"
                        >{{ itemQuality(cand.item) }}</span
                      >
                      <span v-if="cand.item.setId" class="rc-pill set">🧩 Set</span>
                      <span v-if="rewardFitsVoie(cand.item)" class="rc-pill voie">🧭 ta voie</span>
                    </div>
                    <div class="rc-eff">
                      {{ SLOT_LABEL[cand.item.slot] }} · {{ itemEffects(cand.item) }}
                    </div>
                    <!-- Effet de l'objet ÉQUIPÉ du même slot (ticket 68ed2250) — masqué si
                         même effet que le candidat (le delta de puissance suffit). -->
                    <div v-if="rewardCmpEquipped(cand.item)" class="drop-cmp rc-cmp">
                      Équipé : {{ rewardCmpEquipped(cand.item) }}
                    </div>
                    <div class="pow-cmp">
                      ⚔️ vs équipé {{ fmtPow(combatPowerVal) }} →
                      <b :class="powerIfEquip(cand.item) >= combatPowerVal ? 'up' : 'down'"
                        >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                          fmtDelta(combatPowerVal, powerIfEquip(cand.item))
                        }})</b
                      >
                    </div>
                    <div v-if="rewardDupNote(cand.item)" class="rc-dup">
                      {{ rewardDupNote(cand.item) }}
                    </div>
                    <div
                      v-if="rewardLoadoutCmp(cand.item)"
                      class="rc-loadcmp"
                      :class="rewardLoadoutCmp(cand.item)!.cls"
                    >
                      {{ rewardLoadoutCmp(cand.item)!.text }}
                    </div>
                  </div>
                </template>
                <template v-else>
                  <span class="rc-emo">💰</span>
                  <div class="rc-main">
                    <div class="rc-name">Trésor</div>
                    <div class="rc-eff">+{{ cand.gold }} 🪙</div>
                  </div>
                </template>
              </button>
            </div>
          </div>
        </div>

        <!-- Actions masquées PENDANT l'animation (on ne peut pas fermer un combat avant
             la fin) ET pendant le CHOIX de récompense (le joueur doit choisir). -->
        <div v-if="stageDone && !rewardChoiceMode" class="rm-actions-row">
          <button
            v-if="stageDone && !char.row?.pending_reward"
            class="rm-btn rm-btn-primary"
            :disabled="!canReattack"
            :title="`Réattaquer — coûte ${reattackCost} ${reattackCostIcon}, tu as ${reattackStock} en stock`"
            aria-label="Réattaquer"
            @click="reattackLast"
          >
            <span class="rm-ic">⚔️</span>
            <span class="rm-cost"
              >{{ reattackCost }} {{ reattackCostIcon }}
              <small class="rm-stock">/ {{ reattackStock }}</small></span
            >
          </button>
          <!-- Combat SUIVANT (donjon/boss suivant de la chaîne, s'il est débloqué) — à droite
               de Réattaquer, avec son coût. Absent pour la Faille (Réattaquer avance déjà). -->
          <button
            v-if="stageDone && !char.row?.pending_reward && nextContent"
            class="rm-btn rm-btn-next"
            :disabled="!nextContent.affordable || busy"
            :title="`Combat suivant : ${nextContent.name} — coûte ${nextContent.cost} ${nextContent.icon}`"
            aria-label="Combat suivant"
            @click="launchNext"
          >
            <span class="rm-ic">⏭️</span>
            <span class="rm-cost">{{ nextContent.cost }} {{ nextContent.icon }}</span>
          </button>
          <button
            class="rm-btn rm-icon"
            title="Inventaire"
            aria-label="Inventaire"
            @click="goInventoryFromReport"
          >
            🎒
          </button>
          <button
            class="rm-btn rm-icon"
            title="Fermer"
            aria-label="Fermer"
            @click="reportOpen = false"
          >
            ✕
          </button>
        </div>
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore, PseudoTakenError } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import { useGamePanel } from '@/composables/useGamePanel';
import { characterRank, CHARACTER_RANKS } from '@/lib/characterRank';
import { computeCharacter, isValidPseudo } from '@/lib/character';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ItemIcon from '@/components/ItemIcon.vue';
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
import { MONSTERS, monsterArchetype } from '@/data/monsters';
import { DUNGEONS, dungeonFoes, dungeonGold, type Dungeon } from '@/data/dungeons';
import { BOSSES, bossSummonCost, type MilestoneBoss } from '@/data/bosses';
import { recommendedPower } from '@/lib/proceduralContent';
import { VOIES, VOIE_BY_ID, voiePassiveEffects, type VoieId } from '@/lib/voies';
import { endlessFoe, endlessEnergy, endlessGold, endlessDropLevel } from '@/data/endless';
import {
  playerWithGear,
  aggregateEffects,
  rollDrop,
  rollSetPiece,
  randomVoieSetId,
  voieSetId,
  MAX_LOADOUTS,
  mergeEffects,
  effectLabelFor,
  setTierLabel,
  rollStars,
  sellValue,
  isFamiliar,
  FAMILIAR_SLOT,
  tierIndexOf,
  rollTier,
  RANK_ORDER,
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
  type Equipped,
  type Rarity,
  type AggregatedEffects,
  type RewardCandidate,
  type PendingReward,
} from '@/lib/items';
import {
  talentsEarned,
  talentEffects,
  talentByCode,
  tierOf,
  talentRank,
  talentRankOf,
  talentQuality,
  talentValue,
  rollTalentDrop,
  type TalentInstance,
} from '@/lib/talents';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import { unlocksAtLevel } from '@/lib/advUnlocks';
import {
  labyrinthUnlocked,
  bossAltarBuilt,
  bossAltarRollFloor,
  bossRewardCount,
  bossTargetingUnlocked,
  summonCostWith,
} from '@/lib/buildings';
import {
  REGIONS,
  currentRegion,
  nextRegion,
  regionProgress,
  regionOfDungeon,
  regionMapGeometry,
  type Region,
} from '@/lib/regions';
import { bestiary, setCollection, codexSummary } from '@/lib/codex';
import { heroPosition } from '@/lib/expedition';
import { logicalToday } from '@/lib/challenges';

interface RunFight {
  monster: string;
  emoji: string;
  win: boolean;
  rounds: number;
  maxPv?: number; // PV max du monstre (barre du rejeu)
  archetype?: string; // identité visuelle du monstre (aura/idle du rejeu)
  log?: CombatEvent[]; // détail par coup → rejeu animé
}
interface RunView {
  name: string;
  kind: 'dungeon' | 'boss';
  cleared: boolean;
  defeated: number;
  total: number;
  gold: number;
  finalPv: number;
  playerMaxPv?: number; // PV max du joueur (barre du rejeu)
  fights: RunFight[];
  drops: Item[];
  talentDrops?: TalentInstance[]; // talents tombés (affichés dans le rapport)
  summonStones?: number; // pierres d'invocation 🔮 gagnées (donjon → aller aux boss)
  enchantScrolls?: number; // 📜 parchemins d'enchantement gagnés (carburant de l'enchant)
  protections?: number; // 🛡️ protections d'enchant gagnées
}

// `embedded` : rendu dans le VOLET droit du cockpit (Z Fold déplié) → racine <div>
// au lieu de <q-page> + hauteur fluide (le volet gère le scroll).
const props = defineProps<{ embedded?: boolean }>();

const $q = useQuasar();
const router = useRouter();
const { goGame, viewForPath } = useGamePanel();
// Ouvre un écran jeu profond : en cockpit (embedded) → DANS le volet droit (pas de
// route, sinon on router-ait le volet gauche) ; sinon navigation plein écran normale.
function openGame(path: string) {
  const v = props.embedded ? viewForPath(path) : null;
  if (v) return goGame(v);
  void router.push(path);
}
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();
// Explication « rang » / « qualité » (ouverte en cliquant le pastille de rang ou le
// chiffre de qualité d'un objet — ticket d094eac6). Les 10 rangs pour l'échelle visuelle.
const helpTopic = ref<'rank' | 'quality' | null>(null);
// Rang d'objet (G..SSS) → intensité d'animation (5 crans de GameFx). Les hauts rangs
// déclenchent l'explosion « divin ».
type FxRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'divin';
function fxRarity(r: Rarity): FxRarity {
  const i = RARITY_RANK[r];
  return i >= 9 ? 'divin' : i >= 7 ? 'legendary' : i >= 5 ? 'epic' : i >= 3 ? 'rare' : 'common';
}
// Célébration centrale pour un DROP marquant (rang S+ = éclat, SSS = explosion).
function celebrateRareDrop(it: Item) {
  if (RARITY_RANK[it.rarity] < 7) return; // S / SS / SSS uniquement
  gameFx.celebrate({
    kind: 'drop',
    emoji: it.emoji,
    title: RARITY_RANK[it.rarity] >= 9 ? 'DROP RANG SSS !' : `Drop rang ${it.rarity} !`,
    subtitle: it.name,
    rarity: fxRarity(it.rarity),
  });
}
// Drop de talent : éclat central si rang élevé (moment notable). Le talent apparaît
// dans la collection Perso › Talents.
function celebrateTalentDrop(t: TalentInstance) {
  const def = talentByCode(t.code);
  if (!def) return;
  const rarity = talentRankOf(t);
  if (RARITY_RANK[rarity] >= 4)
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🎓',
      title: `Talent ${RARITY_LABEL[rarity]} !`,
      subtitle: def.name,
      rarity: fxRarity(rarity),
    });
}

const loading = ref(true);
const saving = ref(false);
const pseudoInput = ref('');
const pseudoError = ref('');
// Nav « par activité » : 3 onglets — Héros (fiche+stats+talents+familier) /
// Équipement (équipé+sac) / Explorer (donjons+boss de palier).
const tab = ref<'hero' | 'gear' | 'explore'>('hero');
// Équipement : plus de sous-onglets. Sac / Loadouts ouvrent des modales
// (les stats de combat « Force » vivent sur la fiche Héros).
const bagOpen = ref(false);
const loadoutOpen = ref(false);
function openBag() {
  betterFilterSlot.value = null; // ouverture directe = pas de filtre « upgrades »
  invSetFilter.value = 'all'; // pas de filtre set au départ
  bagOpen.value = true;
}
// Filtre « seulement les objets du sac au potentiel supérieur » pour un slot donné
// (posé en cliquant le badge d'un item équipé). null = pas de filtre « mieux ».
const betterFilterSlot = ref<ItemSlot | null>(null);
// Sous-onglet Héros : fiche (stats fusionnées) / talents.
// La fiche Héros est toujours affichée ; Talents et Familier s'ouvrent en MODALE au clic
// (ticket 5efcc6bc, plus de sous-onglets). persoSub reste 'perso' (fiche = seule vue inline).
const persoSub = ref<'perso'>('perso');
const talentsOpen = ref(false);
const familiarsOpen = ref(false);
const ranksOpen = ref(false);
// Liste des 10 rangs de prestige (cosmétiques, dérivés du niveau) : 1 rang = 10 niveaux
// (5 étoiles × 2 niveaux). Marque le rang courant + sa plage de niveaux.
const rankList = computed(() =>
  CHARACTER_RANKS.map((t, i) => ({
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    fromLevel: i * 10 + 1,
    toLevel: i * 10 + 10,
    current: i === rank.value.rankIndex,
  })),
);
// Sous-onglet Explorer : donjons (carte) / boss de palier.
const exploreSub = ref<'donjons' | 'boss'>('donjons');
// Le Labyrinthe est débloqué par la 🚪 Porte du Labyrinthe (bâtiment sur la carte).
const hasLabyGate = computed(() => labyrinthUnlocked(char.row?.buildings ?? []));
// Clic sur la tuile Labyrinthe : bloqué en expédition ; sinon → Labyrinthe si la Porte
// est construite, sinon on redirige vers la carte pour la construire.
function openLabyrinth() {
  if (onExpedition.value) return expeBlocked();
  if (!hasLabyGate.value) {
    $q.notify({
      type: 'warning',
      message: 'Construis la 🚪 Porte du Labyrinthe sur la carte pour le débloquer.',
    });
    return void openGame('/expedition-map');
  }
  void openGame('/expedition');
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
// Niveau du héros (= niveau global de fond) — alias pratique pour les affichages de drop
// centrés sur le joueur (pyramide) + comparaisons.
const heroLevel = computed(() => c.value.level.level);
// Effets cumulés des talents choisis.
const talentFx = computed(() => talentEffects(char.row?.talents ?? []));
// Effets « hors équipement » actifs = talents + PASSIF DE VOIE (spécialisation) → comptés
// partout dans le combat/la puissance (fighter, powerWith, winPct, runExtra).
const activeFx = computed(() =>
  mergeEffects(talentFx.value, voiePassiveEffects(char.row?.voie as VoieId | null)),
);
// ── Voie (spécialisation) : sélecteur + libellés ──
const voieOpen = ref(false);
const currentVoie = computed(() => VOIES.find((v) => v.id === char.row?.voie) ?? null);
function doSetVoie(id: VoieId | null) {
  withUid((uid) => char.setVoie(uid, id), 'Impossible de changer de voie.');
  voieOpen.value = false;
}
const EFFECT_SHORT: Record<string, string> = {
  damage_pct: 'dégâts',
  crit_pct: 'crit',
  lifesteal_pct: 'vol de vie',
  dmg_reduction_pct: 'réduction',
  max_pv_pct: 'PV',
  gold_pct: 'or',
  execute_pct: 'exécution',
  rage_pct: 'rage',
  momentum_pct: 'élan',
  thorns_pct: 'épines',
};
function voieStatsLabel(id: VoieId): string {
  return (VOIE_BY_ID[id]?.preferred ?? []).map((t) => EFFECT_SHORT[t] ?? t).join(' / ');
}
function voiePassiveLabel(id: VoieId): string {
  const p = VOIE_BY_ID[id]?.passive;
  return p ? `+${p.base}% ${EFFECT_SHORT[p.type] ?? p.type}` : '';
}
// Combattant complet (stats + équipement + talents + voie) → puissance de combat affichée.
const fighter = computed(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    c.value,
    char.row?.equipped ?? {},
    activeFx.value,
    c.value.level.level,
    char.row?.voie,
  ),
);
const combatPowerVal = computed(() => combatPower(fighter.value));
// Comparateur de puissance pour talents & familiers (ticket 25091d45), comme les objets.
// Familier : puissance si on l'équipe à la place de l'actuel.
function famPowerIfEquip(f: Item): number {
  return powerWith({ ...(char.row?.equipped ?? {}), [FAMILIAR_SLOT]: f });
}
// Talent : puissance si on l'ajoute à l'ensemble équipé (valeur du talent, même si au cap).
function talPowerIfEquip(inst: TalentInstance): number {
  const talents = [
    ...(char.row?.talents ?? []).filter((t) => t.id !== inst.id),
    { ...inst, equipped: true },
  ];
  return powerWith(char.row?.equipped ?? {}, talentEffects(talents));
}
// Deltas de puissance (arrondis) des familiers/talents NON équipés → pastille +/−.
// Mémoïsés (recalculés seulement quand le perso/l'équipement change), pas par rendu×ligne.
const famDeltaMap = computed(() => {
  const cur = combatPowerVal.value;
  const m = new Map<string, number>();
  for (const f of allFamiliars.value)
    if (!f.equipped) m.set(f.id, Math.round(famPowerIfEquip(f) - cur));
  return m;
});
// FAMILIER CONSEILLÉ (comme les talents) : celui qui MAXIMISE la puissance de combat une
// fois équipé (famPowerIfEquip → powerWith inclut la voie). Renvoie l'id du meilleur parmi
// les familiers possédés (équipé inclus) → si l'équipé est déjà le meilleur, c'est lui.
const recommendedFamiliarId = computed<string | null>(() => {
  let bestId: string | null = null;
  let bestP = -1;
  for (const f of allFamiliars.value) {
    const p = famPowerIfEquip(f);
    if (p > bestP) {
      bestP = p;
      bestId = f.id;
    }
  }
  return bestId;
});
function doEquipRecommendedFamiliar() {
  const id = recommendedFamiliarId.value;
  if (!id) return;
  if (equippedFamiliar.value?.id === id) {
    $q.notify({ message: '🐾 Ton familier est déjà le meilleur pour ta puissance.' });
    return;
  }
  withUid((uid) => char.equip(uid, id), 'Impossible d’équiper le familier conseillé.');
}
const talDeltaMap = computed(() => {
  const cur = combatPowerVal.value;
  const m = new Map<string, number>();
  for (const t of talentsView.value)
    if (!t.equipped) m.set(t.id, Math.round(talPowerIfEquip(t.inst) - cur));
  return m;
});
// PUISSANCE CONSEILLÉE (ticket 6abe4429) : remplace le 🎯 % de victoire (qui « bougeait »)
// par une cible STABLE — la puissance du build équilibré de référence contre lequel le
// contenu est calibré. Le joueur compare SA puissance (combatPowerVal) à celle-ci.
// Mémoïsée : `recommendedPower` (reconstruit un combattant de référence) est STATIQUE par
// niveau, mais recoPow est appelée ~3×/ligne de donjon/boss à chaque rendu → cache par niveau.
const recoPowCache = new Map<number, number>();
function recoPow(recoLevel: number): number {
  let v = recoPowCache.get(recoLevel);
  if (v === undefined) {
    v = recommendedPower(recoLevel);
    recoPowCache.set(recoLevel, v);
  }
  return v;
}
// Vert si tu atteins la puissance conseillée, orange si proche (≥ 80 %), rouge sinon.
function powClass(recoLevel: number): string {
  const r = recoPow(recoLevel);
  const mine = combatPowerVal.value;
  if (mine >= r) return 'wp-good';
  if (mine >= r * 0.8) return 'wp-mid';
  return 'wp-bad';
}
function powTitle(recoLevel: number): string {
  return `Puissance conseillée ${fmtPow(recoPow(recoLevel))} · la tienne ${fmtPow(combatPowerVal.value)}`;
}
// Rang de PRESTIGE (cosmétique, dérivé du niveau) — n'affecte pas le combat.
const rank = computed(() => characterRank(c.value.level.level));
// Couronne d'étoiles du portrait : 5 étoiles en ARC HAUT sur l'anneau (viewBox 100×100).
// Chemin d'une étoile 5 branches (rayon ~6), placée à chaque angle.
const STAR_PATH =
  'M0,-6 L1.76,-2.43 L5.7,-1.85 L2.85,0.94 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.94 L-5.7,-1.85 L-1.76,-2.43 Z';
const STAR_ANGLES = [-150, -120, -90, -60, -30]; // degrés (0=droite, 90=bas) → arc du haut
// STAR_PATH pointe vers le HAUT : sa pointe haute monte à y=-6 mais les pointes basses ne
// descendent qu'à y=+4,85 → il y a plus d'étoile AU-DESSUS du point d'ancrage qu'en dessous,
// donc elle « paraît basse » posée sur le trait. On la remonte d'un poil (lift optique) pour
// qu'elle SEMBLE centrée sur le trait.
const STAR_LIFT = 1.5;
function starTf(i: number): string {
  const a = ((STAR_ANGLES[i] ?? -90) * Math.PI) / 180;
  // Trait au milieu de l'épaisseur de l'anneau : cadre 172px (border-box) + bordure 4px →
  // 84px du centre ; l'SVG des étoiles (inset -4px) fait 180px pour un viewBox de 100 →
  // échelle 1,8 → 84/1,8 = 46,7 unités. Le point d'ancrage tombe donc pile sur le trait ;
  // STAR_LIFT ne fait que compenser optiquement la pointe haute plus longue.
  const R = 46.7;
  const x = 50 + R * Math.cos(a);
  const y = 50 + R * Math.sin(a) - STAR_LIFT;
  return `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
}
// Combattant SANS équipement ni talents (stats de fond seules) → base de la
// comparaison « avec / sans équipement » sur la fiche perso.
const baseFighter = computed(() =>
  playerWithGear(char.row?.pseudo ?? 'Toi', c.value, {}, {}, c.value.level.level),
);
const pctA = (x?: number) => Math.round((x ?? 0) * 100) + '%';
// Puissance de combat avec un ensemble d'équipement donné (+ effets extra = talents).
// Helper UNIQUE derrière toutes les comparaisons (objet/familier/talent/loadout) → plus de
// plomberie pseudo/niveau/talentFx dupliquée (revue /simplify).
function powerWith(eq: Equipped, fx: Partial<AggregatedEffects> = activeFx.value): number {
  return combatPower(
    playerWithGear(char.row?.pseudo ?? 'Toi', c.value, eq, fx, c.value.level.level, char.row?.voie),
  );
}
// Puissance si `it` remplaçait la pièce du même slot. La magnitude vient du DROP (rang ×
// qualité, bakée dans effect.value) — plus d'axe enchant → comparaison directe.
function powerIfEquip(it: Item): number {
  return powerWith({ ...(char.row?.equipped ?? {}), [it.slot]: it });
}

// Estimation live du % de victoire par donjon/boss selon les stats + le stuff
// ÉQUIPÉ actuel (Monte-Carlo seedé). Recalculé quand le perso/l'équipement change
// → on peut swapper du gear et voir l'effet. Clé : 'd:<id>' / 'b:<id>'.
const WINPCT_SEEDS = 40;
// % de victoire (Monte-Carlo seedé) — calculé À LA DEMANDE pour le DERNIER run seulement
// (le seul consommateur est canSkipStage). Avant on simulait les 22 contenus × 40 seeds à
// chaque changement de stuff (~880 combats, ~95 % jetés depuis que l'affichage est passé à
// la « puissance conseillée »). `combat.ts` est pur → on peut réutiliser le combattant.
function runWinPct(): number {
  const p = playerWithGear(
    char.row?.pseudo ?? 'Toi',
    c.value,
    char.row?.equipped ?? {},
    activeFx.value,
    c.value.level.level,
    char.row?.voie,
  );
  const d = lastDungeon.value;
  if (d) {
    let w = 0;
    for (let s = 0; s < WINPCT_SEEDS; s++)
      if (simulateDungeon(p, dungeonFoes(d), { seed: s * 97 + 1 }).cleared) w++;
    return Math.round((w / WINPCT_SEEDS) * 100);
  }
  const b = lastBoss.value;
  if (b) {
    let w = 0;
    for (let s = 0; s < WINPCT_SEEDS; s++)
      if (simulateCombat(p, b.combatant, { seed: s * 97 + 3, goldOnWin: 0 }).win) w++;
    return Math.round((w / WINPCT_SEEDS) * 100);
  }
  return 0;
}

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
// (Défini APRÈS curRegion/selectedRegionId/shatterId — cf. plus bas — pour éviter tout
// accès en TDZ dans la callback d'armement `immediate`.)
const regionBurst = ref<{ emoji: string; name: string; blurb: string; color: string } | null>(null);
const worldmapEl = ref<HTMLElement | null>(null);
type RegionReveal = { id: string; emoji: string; name: string; blurb: string; color: string };
// Reveal EN ATTENTE : quand on nettoie le dernier donjon d'une zone en combat, on
// attend la FERMETURE du rapport pour jouer l'animation (sinon elle recouvre le combat).
const pendingRegionReveal = ref<RegionReveal | null>(null);
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
  const pct = aggregateEffects(char.row.equipped).maxPvPct + activeFx.value.maxPvPct;
  return Math.round(c.value.pv * pct);
});

// ── Talents (refonte B : drop + infusion + loadout) ──
const talentSlots = computed(() => talentsEarned(c.value.level.level));
const equippedTalents = computed(() => (char.row?.talents ?? []).filter((t) => t.equipped));
// Icône du 1er talent équipé → badge cliquable bas-gauche de l'avatar (ouvre les talents).
const firstTalentIcon = computed(() => {
  const eq = equippedTalents.value[0];
  return eq ? (talentByCode(eq.code)?.icon ?? '') : '';
});
const canEquipMore = computed(() => equippedTalents.value.length < talentSlots.value);
// TALENTS CONSEILLÉS (tickets 9f2c6a42 / 08b10b7f) : la meilleure combinaison de talents
// à équiper pour MAXIMISER la puissance (build réel = gear équipé + passif de voie).
// 1 seule instance par code (le meilleur grade), puis choix GREEDY jusqu'au nb de slots
// (chaque effet de talent est positif → on ajoute à chaque tour celui qui augmente le +).
const recommendedTalentIds = computed<Set<string>>(() => {
  const owned = char.row?.talents ?? [];
  if (!owned.length) return new Set();
  const byCode = new Map<string, TalentInstance>();
  for (const t of owned) {
    const cur = byCode.get(t.code);
    if (!cur || tierOf(t) > tierOf(cur)) byCode.set(t.code, t);
  }
  const pool = [...byCode.values()];
  const N = Math.min(talentSlots.value, pool.length);
  const voieFx = voiePassiveEffects(char.row?.voie as VoieId);
  const eq = char.row?.equipped ?? {};
  const name = char.row?.pseudo ?? 'Toi';
  const lvl = c.value.level.level;
  const powerOf = (combo: TalentInstance[]) =>
    combatPower(
      playerWithGear(
        name,
        c.value,
        eq,
        mergeEffects(talentEffects(combo.map((t) => ({ ...t, equipped: true }))), voieFx),
        lvl,
        char.row?.voie,
      ),
    );
  const chosen: TalentInstance[] = [];
  while (chosen.length < N && pool.length) {
    let bestI = -1;
    let bestP = -1;
    for (let i = 0; i < pool.length; i++) {
      const p = powerOf([...chosen, pool[i]!]);
      if (p > bestP) {
        bestP = p;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    chosen.push(pool.splice(bestI, 1)[0]!);
  }
  return new Set(chosen.map((t) => t.id));
});
function doEquipRecommendedTalents() {
  withUid(
    (uid) => char.setEquippedTalents(uid, [...recommendedTalentIds.value]),
    'Impossible d’équiper les talents conseillés.',
  );
}
// Vue enrichie : équipés d'abord, puis par grade (tier) puis enchant décroissants.
const talentsView = computed(() => {
  return (
    (char.row?.talents ?? [])
      .map((inst) => {
        const def = talentByCode(inst.code);
        if (!def) return null;
        const tier = tierOf(inst); // rang + qualité (grade fixé au drop)
        const enchant = inst.enchant ?? 0; // +N magnitude (gamble)
        return {
          id: inst.id,
          inst,
          def,
          tier,
          enchant,
          rarity: talentRank(tier),
          quality: talentQuality(tier),
          // 1 décimale : les bonus de talent sont petits (armure 4,5 %…) et la courbe de
          // grade est plate → l'arrondi entier faisait paraître D5 et E3 identiques
          // (ticket f7e389e4) alors que leurs valeurs diffèrent (6,2 % vs 5,6 %).
          effLabel: (talentValue(def, tier, enchant) * 100).toFixed(1).replace('.', ',') + ' %',
          equipped: !!inst.equipped,
        };
      })
      .filter((t): t is NonNullable<typeof t> => !!t)
      // Équipés d'abord, puis par RANG/QUALITÉ décroissant, puis par NOM (tickets
      // b552b16f + tri rang) → les meilleurs talents en tête, liste stable.
      .sort(
        (a, b) =>
          Number(b.equipped) - Number(a.equipped) ||
          b.tier - a.tier ||
          a.def.name.localeCompare(b.def.name),
      )
  );
});
function talentName(inst: TalentInstance): string {
  return talentByCode(inst.code)?.name ?? 'Talent';
}
function talentIcon(inst: TalentInstance): string {
  return talentByCode(inst.code)?.icon ?? '✨';
}
// Qualité (1..5) d'un talent tombé, pour le rapport de combat.
function talentDropQuality(inst: TalentInstance): number {
  return talentQuality(tierOf(inst));
}
// Explique un talent (nature de l'effet + comment il monte) au tap sur son icône.
function explainTalent(t: (typeof talentsView.value)[number]) {
  const d = t.def;
  $q.dialog({
    title: `${d.icon} ${d.name}`,
    html: true,
    message:
      `Améliore : <b>${d.desc}</b> — actuellement <b>+${t.effLabel}</b> ` +
      `(rang ${RARITY_LABEL[t.rarity]}${t.quality}).<br><br>` +
      `Son <b>grade</b> (rang + qualité) est fixé au drop : trouve mieux en explorant plus ` +
      `profond ; vends les surplus pour de l'or.`,
  });
}
// Un talent de ce CODE est-il déjà équipé ? (loadout à effets distincts). Sert à
// désactiver « Équiper » sur un doublon d'un talent déjà porté.
function talentCodeEquipped(code: string, exceptId?: string): boolean {
  return (char.row?.talents ?? []).some((t) => t.equipped && t.code === code && t.id !== exceptId);
}
// Auto-équipe un talent DROPPÉ si un emplacement est libre et qu'aucun talent du même
// code n'est déjà équipé (comme l'auto-équipement des objets/familiers sur un slot vide,
// ticket 5efcc6bc). Les drops suivants (slot plein / doublon de code) restent à ranger.
function autoEquipTalentDrops(drops: TalentInstance[]): TalentInstance[] {
  const equipped = (char.row?.talents ?? []).filter((t: TalentInstance) => t.equipped);
  let free = Math.max(0, talentSlots.value - equipped.length);
  const codes = new Set(equipped.map((t: TalentInstance) => t.code));
  return drops.map((d) => {
    if (free > 0 && !codes.has(d.code)) {
      free--;
      codes.add(d.code);
      return { ...d, equipped: true };
    }
    return d;
  });
}
async function doEquipTalent(id: string) {
  const uid = auth.user?.id;
  if (!uid || expeBlocked()) return; // loadout (dont talents) gelé en expédition
  const res = await char.equipTalent(uid, id, c.value.level.level);
  if (res === 'dup')
    $q.notify({
      type: 'warning',
      message: 'Un talent de ce type est déjà équipé (effets distincts uniquement).',
    });
  else if (res === 'full')
    $q.notify({ type: 'warning', message: 'Plus d’emplacement de talent libre.' });
}
async function doUnequipTalent(id: string) {
  const uid = auth.user?.id;
  if (!uid || expeBlocked()) return;
  await char.unequipTalent(uid, id);
}
// Régions / biomes (onglet Donjons) : bandeau de la région courante + teaser de la
// suivante → sensation de « découvrir de nouveaux mondes ».
const clearedIds = computed(() => char.row?.cleared_dungeons ?? []);
const curRegion = computed(() => currentRegion(clearedIds.value));
const curRegionProg = computed(() => regionProgress(curRegion.value, clearedIds.value));
const nxtRegion = computed(() => nextRegion(clearedIds.value));

// ── Carte-monde serpentine des régions (FENÊTRE : précédente · actuelle · suivante) ──
const currentRegionIndex = computed(() => REGIONS.findIndex((r) => r.id === curRegion.value.id));
// Par défaut, fenêtre focalisée de 3 régions autour de la frontière : la précédente
// (faite), la courante, et la suivante (verrouillée). `showAllRegions` (ticket 4a4f1c74)
// déplie TOUTES les zones débloquées + la suivante → on peut retourner farmer une zone
// précédente (avant, seule la zone cur-1 restait accessible).
const showAllRegions = ref(false);
const visibleRegions = computed(() => {
  const cur = currentRegionIndex.value;
  if (showAllRegions.value) return REGIONS.slice(0, cur + 2); // toutes les débloquées + la suivante
  const start = Math.max(0, cur - 1);
  return REGIONS.slice(start, cur + 2); // [cur-1, cur, cur+1] (bornes clampées)
});
const mapGeom = computed(() => regionMapGeometry(visibleRegions.value.length));
// Segment i (nœud i → i+1) « ouvert » (bleu) si la zone d'ARRIVÉE (dans la fenêtre)
// est accessible ; sinon noir (mène vers la zone verrouillée).
function segmentOpen(i: number): boolean {
  const dest = visibleRegions.value[i + 1];
  return !!dest && regionState(dest) !== 'locked';
}
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
  const g = mapGeom.value;
  const n = g.nodes[i]!;
  return { left: n.x + '%', top: (n.y / g.viewH) * 100 + '%' };
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
// La carte des mondes ne montre que les 3 lignes de régions ; taper une région
// « charge » l'arbre de ses donjons (regionView) ; le retour ramène à la carte.
const regionView = ref(false);
function closeRegion() {
  regionView.value = false;
}
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
  regionView.value = true; // ouvre l'arbre des donjons de la région (masque la carte)
  void nextTick(() => drawerEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
// Explosion des chaînes quand une région vient d'être débloquée (piloté par le reveal).
const shatterId = ref<string | null>(null);
// Dernière région (fin de monde) — la Faille sans fin s'y rattache.
const endRegionId = computed(() => REGIONS[REGIONS.length - 1]?.id);

// ── Reveal de nouvelle zone (défini ICI, après curRegion/selectedRegionId/shatterId) ──
// Joue le reveal : bascule onglet Donjons, CENTRE la carte (slide), FAIT EXPLOSER les
// chaînes/cadenas de la nouvelle zone, puis affiche la bannière nommée → zone cliquable.
function triggerRegionReveal(rev: RegionReveal) {
  tab.value = 'explore';
  exploreSub.value = 'donjons';
  regionView.value = false; // le reveal se joue SUR la carte (chaînes qui explosent)
  selectedRegionId.value = rev.id;
  // On attend la fin de la transition de fermeture de la modale (~300 ms), PUIS scroll
  // (slide visible) + explosion + bannière.
  setTimeout(() => {
    void nextTick(() => {
      worldmapEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        shatterId.value = rev.id;
        setTimeout(() => (shatterId.value = null), 1400);
      }, 550);
      setTimeout(() => {
        regionBurst.value = {
          emoji: rev.emoji,
          name: rev.name,
          blurb: rev.blurb,
          color: rev.color,
        };
        setTimeout(() => (regionBurst.value = null), 5200);
      }, 1300);
    });
  }, 380);
}
let lastRegionId = '';
// ARMEMENT : on n'active le reveal qu'une fois le perso chargé, en initialisant
// `lastRegionId` sur la zone courante réelle (sinon, après un reset avec clearedIds=[],
// le tout premier passage de zone était mangé par le garde → aucun reveal).
const revealReady = ref(false);
watch(
  () => char.row?.user_id ?? null,
  (uid) => {
    if (uid) {
      lastRegionId = curRegion.value.id;
      void nextTick(() => {
        lastRegionId = curRegion.value.id;
        revealReady.value = true;
      });
    }
  },
  { immediate: true },
);
watch(
  () => curRegion.value.id,
  (id) => {
    // Uniquement une fois ARMÉ (perso chargé) ET sur un vrai changement de zone. On
    // DIFFÈRE toujours à la fermeture du rapport (cf. watch reportOpen) — le watcher peut
    // s'exécuter avant/après openReport selon l'ordre des microtâches.
    // JAMAIS pour la zone de BASE (index 0, « Terres de l'Aube ») : elle est débloquée
    // d'entrée → un reveal dessus est toujours parasite (course au chargement/reset).
    const idx = REGIONS.findIndex((r) => r.id === id);
    if (revealReady.value && id !== lastRegionId && idx > 0) {
      const r = curRegion.value;
      pendingRegionReveal.value = {
        id,
        emoji: r.emoji,
        name: r.name,
        blurb: r.blurb,
        color: r.color,
      };
    }
    lastRegionId = id;
  },
);

// Codex (méta de collection) : bestiaire + journal des sets. Tout dérivé.
const codexOpen = ref(false);
const codexSum = computed(() =>
  codexSummary(
    clearedIds.value,
    char.row?.equipped ?? {},
    char.row?.inventory ?? [],
    char.row?.set_pieces_seen ?? {},
  ),
);
const bestiaryList = computed(() => bestiary(clearedIds.value));
const setsList = computed(() =>
  setCollection(
    char.row?.equipped ?? {},
    char.row?.inventory ?? [],
    char.row?.set_pieces_seen ?? {},
  ),
);
// Sets de VOIE : lien set↔voie (id = `voie:<id>`).
const isMySetId = (setId: string) => !!char.row?.voie && setId === voieSetId(char.row.voie);
const setVoieName = (setId: string) => VOIE_BY_ID[setId.replace(/^voie:/, '')]?.name ?? '';

// Catalogue des 8 SETS DE VOIE (détail complet, accessible côté Boss) : chaque set avec
// ses 3 paliers (2/3/4 pièces), le 4-pièces = capstone gaté par la voie. Bonus affichés à
// leur valeur de BASE (rang C de référence, cf. setBonusMult). Ma voie surlignée.
const setsCatalogOpen = ref(false);
const voieSetsCatalog = computed(() =>
  ITEM_SETS.map((s) => ({
    id: s.id,
    emoji: s.emoji,
    name: s.name,
    theme: s.theme,
    voieName: setVoieName(s.id),
    mine: isMySetId(s.id),
    tiers: s.tiers.map((t) => ({
      pieces: t.pieces,
      label: effectLabelFor(t.type, t.base),
      capstone: t.pieces >= 4,
    })),
  })),
);
// Déblocages franchis lors du dernier level-up (from → to) → affichés sur l'écran
// de montée de niveau. Peut couvrir plusieurs niveaux d'un coup.
const levelBurstUnlocks = computed(() => {
  const lb = levelBurst.value;
  if (!lb) return [];
  const out = [];
  for (let lvl = lb.from + 1; lvl <= lb.to; lvl++) out.push(...unlocksAtLevel(lvl));
  return out;
});

// Part d'une stat dans le build (les 3 stats somment à 100 %) → « forme du build »
// HONNÊTE : une stat ne paraît « pleine » que si elle est TOUT le build (les autres
// à 0), pas parce qu'elle est simplement la plus haute. (Remplace les barres
// relatives où la plus haute stat semblait « au max » alors qu'elle monte encore.)
function statShare(v: number): number {
  const total = c.value.puissance + c.value.endurance + c.value.agilite;
  return total > 0 ? Math.round((v / total) * 100) : 0;
}
const statCircles = computed(() => [
  {
    key: 's-pui',
    emo: '💪',
    name: 'Puissance',
    inf: 'Muscu · dégâts',
    value: c.value.puissance,
    share: statShare(c.value.puissance),
  },
  {
    key: 's-end',
    emo: '❤️',
    name: 'Endurance',
    inf: 'Muscu+Cardio · PV',
    value: c.value.endurance,
    share: statShare(c.value.endurance),
  },
  {
    key: 's-agi',
    emo: '⚡',
    name: 'Agilité',
    inf: 'Cardio · esquive/crit',
    value: c.value.agilite,
    share: statShare(c.value.agilite),
  },
]);

const busy = ref(false);
const run = ref<RunView | null>(null);
const reportOpen = ref(false); // rapport de combat affiché en MODALE (post-run)
// Mode « choix de récompense de boss » : le butin n'est PAS affiché (le joueur a déjà
// vu les candidats) → modale RÉDUITE et CENTRÉE, sans actions parasites.
const rewardChoiceMode = computed(() => stageDone.value && !!char.row?.pending_reward);
const runSeq = ref(0); // clé de rejeu → remonte CombatStage à chaque run (relance l'anim)
const stageDone = ref(true); // résultat + butin révélés seulement à la FIN de l'animation
// Célébrations (éclats plein écran) DIFFÉRÉES à la FIN de l'animation de combat —
// boss vaincu, donjon nettoyé, drop rare, talent, record… : sinon l'éclat recouvre
// le combat en cours. File jouée dans l'ordre au flush (gameFx enchaîne).
// (Plus de toast de résultat en bas d'écran : le rapport affiche déjà le verdict.)
const pendingCelebrations = ref<(() => void)[]>([]);
function queueFx(fn: () => void) {
  pendingCelebrations.value.push(fn);
}
// À la FERMETURE de la modale de rapport, on purge toute célébration NON jouée (ex.
// modale fermée avant la fin de l'animation) → elles ne s'accumulent plus pour se
// déclencher « toutes d'un coup » lors d'un run suivant (bug : éclats en rafale).
watch(reportOpen, (open) => {
  if (!open) {
    pendingCelebrations.value = [];
    // Le rapport se ferme → si le dernier donjon d'une zone vient d'être nettoyé,
    // on joue MAINTENANT le reveal de la nouvelle zone (slide + explosion sur la carte).
    if (pendingRegionReveal.value) {
      const rev = pendingRegionReveal.value;
      pendingRegionReveal.value = null;
      triggerRegionReveal(rev);
    }
  }
});
function flushCelebrations() {
  if (pendingCelebrations.value.length) {
    const fns = pendingCelebrations.value;
    pendingCelebrations.value = [];
    for (const fn of fns) fn();
  }
}
// Skip = animation occultée (droit au résultat). On l'applique SEULEMENT en
// REJEU : la 1re fois qu'on fait un donjon (pas encore nettoyé), on anime toujours
// (découverte) ; une fois le donjon déjà nettoyé, les réattaques sautent l'anim.
const stageSkipped = ref(false);
const lastRunFirstVisit = ref(true); // ce run était-il la 1re fois sur ce donjon ?
// Boss : la récompense au choix vide `pending_reward` une fois choisie ; sans ce
// verrou latché, l'arène (masquée pendant le choix) se ré-afficherait et REJOUERAIT
// l'animation après coup. On mémorise « ce run avait une récompense » pour la garder
// masquée jusqu'au prochain run.
const stageWasReward = ref(false);
// Réglage persistant : passer automatiquement l'animation des donjons DÉJÀ FAITS
// et gagnés d'avance (≥ 90 %) — le 1er passage d'un donjon reste animé.
// Passer l'animation des combats gagnés d'avance : plus de switch dans l'UI —
// appliqué D'OFFICE pour le compte testeur (admin), qui relance des runs en boucle.
const autoSkipEasy = computed(() => auth.isAdmin);
function stageFinish() {
  stageDone.value = true;
  flushCelebrations();
  revealDrops();
}
// Butin : après révélation du résultat, on fait DÉFILER doucement la modale jusqu'au
// butin (laisse voir le résultat d'abord, puis glisse vers les objets). Respecte
// prefers-reduced-motion (saut direct).
const dropsEl = ref<HTMLElement | null>(null);
function revealDrops() {
  if (!run.value?.drops.length) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  void nextTick(() => {
    setTimeout(
      () => dropsEl.value?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      reduce ? 0 : 480,
    );
  });
}
// Combats rejouables (avec log détaillé) → alimente CombatStage.
const stageFights = computed(() =>
  (run.value?.fights ?? [])
    .filter((f) => f.log?.length)
    .map((f) => ({
      name: f.monster,
      emoji: f.emoji,
      maxPv: f.maxPv ?? 1,
      archetype: f.archetype ?? 'normal',
      log: f.log!,
    })),
);
// Après un run : replie la liste, ouvre la modale de rapport, et l'animation de
// combat se (re)lance automatiquement (runSeq change → CombatStage remonte).
function openReport() {
  runSeq.value++;
  // Résultat/butin masqués tant que l'animation joue (révélés à la fin). Si pas de
  // rejeu (pas de log), on montre tout de suite.
  // Skip SEULEMENT en rejeu : réglage actif + victoire quasi acquise (≥ 90 %) + ce
  // donjon a DÉJÀ été fait (pas la 1re visite) → droit au résultat, sinon on anime.
  const skipAll = autoSkipEasy.value && canSkipStage.value && !lastRunFirstVisit.value;
  stageSkipped.value = skipAll;
  stageWasReward.value = !!char.row?.pending_reward; // boss : latch pour ne pas rejouer
  stageDone.value = !stageFights.value.length || skipAll;
  reportOpen.value = true;
  if (stageDone.value) {
    flushCelebrations(); // pas d'animation → célébrations tout de suite
    revealDrops();
  }
}
// « Passer l'animation » quand la victoire était quasi acquise (≥ 90 %) — donjon
// OU boss (mêmes règles). Le 1er passage reste animé (cf. lastRunFirstVisit).
const canSkipStage = computed(() => runWinPct() >= 90);
// Dernier lieu combattu → « Réattaquer » relance exactement le même run.
const lastDungeon = ref<Dungeon | null>(null);
const lastBoss = ref<MilestoneBoss | null>(null);
const lastEndless = ref(false); // dernier run = Faille sans fin
const reattackCost = computed(() => {
  if (lastEndless.value) return endlessEnergy(nextEndlessTier.value);
  if (lastBoss.value) return summonCostFor(lastBoss.value); // boss = pierres d'invocation 🔮
  if (lastDungeon.value) return lastDungeon.value.energyCost;
  return 0;
});
// La ressource dépend du type de run : le boss se paie en pierres d'invocation 🔮,
// donjon/faille en énergie ⚡ → le logo du bouton Réattaquer suit.
const reattackCostIcon = computed(() => (lastBoss.value ? '🔮' : '⚡'));
// Stock de la ressource nécessaire pour relancer (ticket c6697d9c) → affiché sur le
// bouton « cost / stock » : on voit d'un coup d'œil combien de runs on peut encore lancer.
const reattackStock = computed(() =>
  lastBoss.value ? (char.row?.summon_stones ?? 0) : Math.floor(c.value.energy),
);
const canReattack = computed(() => {
  if (busy.value || char.row?.pending_reward) return false;
  const have = lastBoss.value ? (char.row?.summon_stones ?? 0) : c.value.energy;
  return have >= reattackCost.value;
});
// Réattaque SANS fermer la modale (le run met à jour `run` en place → on peut
// spammer le bouton icône). Les gardes énergie/déblocage/récompense sont dans les
// fonctions de run.
function reattackLast() {
  if (lastEndless.value) void fightEndless();
  else if (lastBoss.value) void fightBoss(lastBoss.value);
  else if (lastDungeon.value) void explore(lastDungeon.value);
}
// « Combat suivant » : le contenu APRÈS le dernier combattu (donjon/boss suivant de la
// chaîne, s'il est DÉBLOQUÉ = le courant vient d'être nettoyé/vaincu). La Faille sans fin
// n'a pas de « suivant » (Réattaquer avance déjà de palier) → null.
const nextContent = computed(() => {
  if (lastEndless.value) return null;
  if (lastBoss.value) {
    const order = bossChain.value;
    const nb = order[order.findIndex((x) => x.id === lastBoss.value!.id) + 1];
    if (!nb || !bossUnlocked(nb)) return null;
    const cost = summonCostFor(nb);
    return {
      kind: 'boss' as const,
      boss: nb,
      name: nb.name,
      cost,
      icon: '🔮',
      affordable: (char.row?.summon_stones ?? 0) >= cost,
    };
  }
  if (lastDungeon.value) {
    const order = dungeonChain.value;
    const nd = order[order.findIndex((x) => x.id === lastDungeon.value!.id) + 1];
    if (!nd || !dungeonUnlocked(nd)) return null;
    return {
      kind: 'dungeon' as const,
      dungeon: nd,
      name: nd.name,
      cost: nd.energyCost,
      icon: '⚡',
      affordable: c.value.energy >= nd.energyCost,
    };
  }
  return null;
});
function launchNext() {
  const n = nextContent.value;
  if (!n) return;
  if (n.kind === 'dungeon') void explore(n.dungeon);
  else void fightBoss(n.boss);
}
function goInventoryFromReport() {
  reportOpen.value = false;
  tab.value = 'gear';
  betterFilterSlot.value = null;
  bagOpen.value = true; // ouvre directement la modale Sac
}
// Depuis le rapport, quand un talent est tombé → ouvre la collection Talents (ticket bb384013).
function goTalentsFromReport() {
  reportOpen.value = false;
  tab.value = 'hero';
  talentsOpen.value = true;
}

// Butin possible d'un donjon (affiché à la demande via 🎁).
const dropInfo = ref<Dungeon | null>(null);
function openDrops(d: Dungeon) {
  dropInfo.value = d;
}
// Distribution des RANGS d'un drop selon la chance ET le niveau du donjon (Monte-Carlo
// sur rollTier → toujours en phase avec le modèle). Ne montre que les rangs qui
// apparaissent (≥1 %), du plus bas au plus haut.
function rarityOdds(luck: number, level = 1, playerLevel?: number) {
  const rng = mulberry32((Math.round(level * 131 + luck * 997 + (playerLevel ?? 0) * 7) >>> 0) + 1);
  const N = 600;
  const counts = new Array(10).fill(0) as number[];
  for (let i = 0; i < N; i++) {
    const idx = RARITY_RANK[rollTier(rng, level, luck, 0, playerLevel).rank];
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return RANK_ORDER.map((r, i) => ({
    label: r,
    pct: Math.round((counts[i]! / N) * 100),
    cls: 'r-' + r,
  })).filter((o) => o.pct > 0);
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

// Effets bonus d'un run = uniquement les TALENTS (la boutique et les consommables ont
// été retirés — code inatteignable). `lucky` conservé (toujours false) pour la signature
// des runs (drops / récompenses de boss).
function runExtra(): { extra: AggregatedEffects; lucky: boolean } {
  return { extra: { ...activeFx.value }, lucky: false }; // talents + passif de voie
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
  const myVoie = char.row?.voie ?? null;
  return ITEM_SETS.filter((s) => (counts[s.id] ?? 0) >= 1).map((s) => {
    const pieces = SLOTS.map((sl) => eq[sl]).filter((it): it is Item => it?.setId === s.id);
    const count = counts[s.id] ?? 0;
    // Ce set est-il celui de MA voie ? (→ le capstone 4-pièces s'active).
    const mine = !!myVoie && s.id === voieSetId(myVoie);
    return {
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      theme: s.theme,
      count,
      mine,
      // Le bonus de set est scalé par le RANG moyen des pièces (cf. setEffects, #3).
      tiers: s.tiers.map((t) => {
        const capstone = t.pieces >= 4;
        return {
          pieces: t.pieces,
          label: setTierLabel(t.type, t.base, pieces),
          capstone,
          // 2/3-pièces : actif dès le compte atteint. 4-pièces (capstone) : + voie correspondante.
          on: count >= t.pieces && (!capstone || mine),
          // capstone atteint en pièces mais bloqué faute de la bonne voie.
          locked: capstone && count >= t.pieces && !mine,
        };
      }),
    };
  });
});
// Verdict de rareté du drop vs l'objet équipé (potentiel long terme : la rareté
// fixe la magnitude de base, la poussière fait ensuite monter le niveau).
// Avertit si une pièce de set proposée en récompense fait DOUBLON : soit le slot
// porte déjà cette pièce de set (aucun gain de palier), soit une copie traîne déjà
// dans le sac. Évite de « choisir un doublon sans le savoir ».
// Effet de l'objet ÉQUIPÉ du même slot, pour comparer à un candidat de récompense
// (ticket 68ed2250). Vide si aucun objet équipé, OU si l'équipé porte le MÊME effet
// que le candidat (alors le delta de puissance suffit → pas de redite).
function rewardCmpEquipped(item: Item): string {
  const eq = equippedInSlot(item.slot);
  if (!eq) return '';
  if (eq.effect.type === item.effect.type) return '';
  return `${RARITY_LABEL[eq.rarity]} · ${itemEffects(eq)}`;
}
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
  // Récompense de boss = KEEPER long terme → on conseille le MEILLEUR POTENTIEL (objet
  // monté à TON niveau max, pas au niveau de l'équipé). Une pièce de set (niv.1 au
  // drop) est jugée à sa vraie valeur une fois infusée à fond (2026‑08‑18 : la
  // comparaison « à armes égales » sous-évaluait le potentiel → mauvais conseil).
  const base = combatPowerVal.value;
  if (cand.kind === 'gold') {
    // Or : ne change pas la puissance → à peine au-dessus du statu quo.
    return base + cand.gold * 0.01;
  }
  const it = cand.item;
  let s = powerIfEquip(it); // puissance si équipé (inclut le passif de voie via activeFx)
  if (it.setId && !rewardDupNote(it)) s += base * 0.05; // petit bonus « avance un set »
  if (rewardFitsVoie(it)) s += base * 0.03; // petit bonus « colle à ta voie » (départage, ticket 59e45386)
  return s;
}
// L'effet de l'objet correspond-il aux stats de la voie choisie ? (indicateur + départage)
function rewardFitsVoie(it: Item): boolean {
  const v = currentVoie.value;
  return !!v && v.preferred.includes(it.effect.type);
}
// Comparaison d'une pièce de set (candidat de récompense) vs son ÉQUIVALENT dans le loadout
// de sa voie → dit ce qui se passera si on la choisit (rangée / remplace / vendue). Même
// logique que chooseReward (magnitude d'effet). Null si ce n'est pas une pièce de set de voie.
function rewardLoadoutCmp(it: Item): { text: string; cls: string } | null {
  if (!it.setId?.startsWith('voie:')) return null;
  const idx = VOIES.findIndex((v) => v.id === it.setId!.slice('voie:'.length));
  if (idx < 0) return null;
  const existing = char.row?.loadouts?.[idx]?.items?.[it.slot];
  if (!existing) return { text: '📦 emplacement libre → rangée', cls: 'good' };
  return (it.effect?.value ?? 0) > (existing.effect?.value ?? 0)
    ? { text: '📦 meilleure que ta pièce rangée → remplace', cls: 'good' }
    : { text: '📦 ≤ ta pièce rangée → sera vendue', cls: 'bad' };
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
// Verdict par PUISSANCE (si équipé) = la vraie décision « je l'équipe ? ». En tête de carte.
function powerVerdict(it: Item): { label: string; cls: string } {
  if (!equippedInSlot(it.slot)) return { label: '＋ à équiper', cls: 'up' };
  const d = powerIfEquip(it) - combatPowerVal.value;
  if (d > 0) return { label: '↑ Meilleur', cls: 'up' };
  if (d < 0) return { label: '↓ Inférieur', cls: 'down' };
  return { label: '≈ Égal', cls: 'same' };
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
  if (expeBlocked()) return;
  if (!uid || !char.row || busy.value || c.value.energy < d.energyCost) return;
  if (!dungeonUnlocked(d)) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastDungeon.value = d;
  lastBoss.value = null;
  lastEndless.value = false;
  // 1re visite ? (capturé AVANT applyRun, qui va ajouter d.id à cleared_dungeons).
  lastRunFirstVisit.value = !clearedSet.value.has(d.id);
  busy.value = true;
  try {
    // Consommables sélectionnés pour ce run (buffs + chance de butin).
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(
      char.row.pseudo,
      c.value,
      char.row.equipped,
      extra,
      c.value.level.level,
      char.row.voie,
    );
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
      playerLevel: c.value.level.level,
    });
    if (rolled) {
      const dr: Item = { ...rolled, id: crypto.randomUUID() };
      drops.push(dr);
      queueFx(() => celebrateRareDrop(dr));
    }
    // (Les familiers ne tombent PLUS dans les donjons — uniquement au Labyrinthe.)
    // (Les consommables ne DROPPENT plus — peu utiles ; restent achetables en boutique.)
    // Pierres d'invocation 🔮 : lot au NETTOYAGE, ∝ profondeur du donjon → farmer plus
    // profond finance des boss plus hauts. Un boss de palier coûte ~2-6 pierres → 2-6 runs.
    const summonStones = r.cleared ? 1 + Math.floor(d.recoLevel / 8) : 0;
    // Parchemins d'ENCHANT 📜 : le carburant des tentatives d'enchant, filet régulier au
    // nettoyage (∝ profondeur). Source principale avec les boss (qui donnent aussi 🛡️).
    const enchantScrolls = r.cleared ? 2 + Math.floor(d.recoLevel / 4) : 0;
    // Drop de TALENT (drop-only) : ~6 % sur un donjon nettoyé ; RANG gaté par le niveau
    // du donjon (`dropLevel`), biaisé par sa luck → farmer profond = talents plus hauts.
    const talentDrops =
      r.cleared && dropRng() < 0.06
        ? autoEquipTalentDrops([
            rollTalentDrop(dropRng, {
              level: d.dropLevel,
              luck: d.dropLuck,
              idSeed: seed,
              playerLevel: c.value.level.level,
            }),
          ])
        : [];
    await char.applyRun(uid, {
      energyCost: d.energyCost,
      gold,
      drops,
      summonStones,
      enchantScrolls,
      ...(r.cleared ? { clearedDungeonId: d.id } : {}),
      ...(talentDrops.length ? { talentDrops } : {}),
    });
    if (talentDrops.length) queueFx(() => celebrateTalentDrop(talentDrops[0]!));
    run.value = {
      name: d.name,
      kind: 'dungeon',
      cleared: r.cleared,
      defeated: r.defeated,
      total: r.total,
      gold,
      finalPv: r.finalPv,
      playerMaxPv: player.pv,
      fights: r.fights.map((f) => {
        const mon = MONSTERS.find((m) => m.name === f.monster);
        return {
          monster: f.monster,
          emoji: mon?.emoji ?? '👾',
          win: f.win,
          rounds: f.result.rounds,
          maxPv: mon?.pv,
          archetype: mon ? monsterArchetype(mon) : 'normal',
          log: f.result.log,
        };
      }),
      drops,
      ...(talentDrops.length ? { talentDrops } : {}),
      ...(summonStones ? { summonStones } : {}),
      ...(enchantScrolls ? { enchantScrolls } : {}),
    };
    // 1er nettoyage d'un donjon (débloque le suivant) = moment de progression →
    // éclat, mais SEULEMENT à la fin de l'animation de combat (sinon il recouvre
    // le combat). Différé via queueFx → flush dans stageFinish/openReport.
    if (r.cleared && lastRunFirstVisit.value)
      queueFx(() =>
        gameFx.celebrate({
          kind: 'unlock',
          emoji: d.emoji,
          title: `${d.name} nettoyé !`,
          subtitle: 'Nouveau donjon débloqué',
          rarity: 'epic',
        }),
      );
    openReport();
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
// L'Autel des boss (bâtiment) est REQUIS pour affronter les boss de palier.
const hasBossAltar = computed(() => bossAltarBuilt(char.row?.buildings ?? []));
// Coût effectif d'un boss en pierres d'invocation 🔮 (base ∝ palier, réduite par l'Autel).
function summonCostFor(b: MilestoneBoss): number {
  return summonCostWith(bossSummonCost(b.unlockLevel), char.row?.buildings ?? []);
}
// Déblocage : Autel des boss construit ET chaîne des BOSS (boss précédent vaincu).
// Pas de gate de niveau → le 🎯 % de victoire indique si le combat est jouable.
function bossUnlocked(b: MilestoneBoss): boolean {
  if (!hasBossAltar.value) return false;
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i <= 0 || defeatedBossSet.value.has(order[i - 1]!.id);
}
function bossLockReason(b: MilestoneBoss): string {
  if (!hasBossAltar.value) return '🔮 Construis l’Autel des boss (carte)';
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i > 0 ? `Bats d’abord « ${order[i - 1]!.name} »` : '';
}
// Libellé des 2 stats d'un objet (primaire · secondaire). Les anciens objets
// (1 stat) n'affichent que la primaire.
function itemEffects(it: Omit<Item, 'id'>): string {
  // OBJETS ET FAMILIERS : magnitude 100 % définie par le drop (grade × qualité, bakée
  // dans effect.value) → libellé direct, 1 décimale (la qualité reste visible, #6).
  const a = effectLabelFor(it.effect.type, it.effect.value);
  return it.effect2 ? `${a} · ${effectLabelFor(it.effect2.type, it.effect2.value)}` : a;
}
// Qualité du roll en étoiles pleines/vides (« ★★★★☆ ») ; vide si objet legacy (pas de roll).
// Qualité en CHIFFRE (1→5, 5 = meilleur) affiché à côté du rang, code couleur
// rouge (1) → vert (5) via la classe `.q-<n>`. 0 = objet legacy sans roll (masqué).
function itemQuality(it: { roll?: number } | null | undefined): number {
  return rollStars(it?.roll);
}
// Slots d'un set déjà possédés (équipé + sac) → pour le ciblage anti-doublon de l'Autel.
function ownedSetSlots(setId: string): Set<ItemSlot> {
  const s = new Set<ItemSlot>();
  for (const slot of SLOTS) if (char.row?.equipped[slot]?.setId === setId) s.add(slot);
  for (const it of char.row?.inventory ?? [])
    if (it.setId === setId && (SLOTS as string[]).includes(it.slot)) s.add(it.slot);
  return s;
}
// Tire les récompenses au CHOIX d'un boss (mixte : pièce de set / objet de donjon /
// lot or+poussière), aléatoire complet et seedé (anti-reroll). L'AUTEL DES BOSS
// améliore : nombre de candidats, plancher de qualité de roll, et ciblage du slot
// de set MANQUANT (anti-doublon → on complète le set plus vite).
function rollBossRewards(b: MilestoneBoss, rng: () => number, lucky: boolean): RewardCandidate[] {
  const luck = Math.min(1, 0.3 + (lucky ? 0.5 : 0));
  const buildings = char.row?.buildings ?? [];
  const rollFloor = bossAltarRollFloor(buildings);
  const count = bossRewardCount(buildings);
  const targeting = bossTargetingUnlocked(buildings);
  // Les boss droppent TOUS les sets (de voie) au hasard → on chasse/complète son set de
  // voie au fil des boss ; changer de voie exploite ce qu'on a accumulé (v0.565).
  const rollAnySet = (): RewardCandidate => {
    const setId = randomVoieSetId(rng);
    // Ciblage (Autel) : vise un slot MANQUANT de CE set → aide à compléter.
    const missing = targeting ? SLOTS.filter((s) => !ownedSetSlots(setId).has(s)) : [];
    const preferSlot = missing.length ? missing[Math.floor(rng() * missing.length)] : undefined;
    const p = rollSetPiece(rng, {
      setId,
      level: b.dropLevel,
      luck,
      rollFloor,
      playerLevel: c.value.level.level,
      ...(preferSlot ? { preferSlot } : {}),
    });
    return { kind: 'item', item: { ...p, id: crypto.randomUUID() } };
  };
  const out: RewardCandidate[] = [];
  for (let n = 0; n < count; n++) {
    const roll = rng();
    // Proba de SET réduite (0.4) : une pièce de set est un butin rare et important.
    if (roll < 0.4) {
      out.push(rollAnySet());
    } else if (roll < 0.8) {
      let d: ReturnType<typeof rollDrop> = null;
      for (let i = 0; i < 5 && !d; i++)
        d = rollDrop(rng, {
          cleared: true,
          defeated: 1,
          level: b.dropLevel,
          luck,
          rollFloor,
          playerLevel: c.value.level.level,
        });
      if (d) out.push({ kind: 'item', item: { ...d, id: crypto.randomUUID() } });
      else out.push(rollAnySet());
    } else {
      // Cache d'OR : doit rivaliser avec une pièce d'équipement (or plein du palier).
      out.push({ kind: 'gold', gold: b.gold });
    }
  }
  return out;
}

async function fightBoss(b: MilestoneBoss) {
  const uid = auth.user?.id;
  if (expeBlocked()) return;
  const summonCost = summonCostFor(b);
  if (!uid || !char.row || busy.value || char.row.summon_stones < summonCost) return;
  if (!hasBossAltar.value) {
    $q.notify({
      type: 'warning',
      message: 'Construis l’Autel des boss (carte d’expédition) pour affronter les boss.',
    });
    return void openGame('/expedition-map');
  }
  if (!bossUnlocked(b)) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastBoss.value = b;
  lastDungeon.value = null;
  lastEndless.value = false;
  // 1re fois sur ce boss ? (capturé AVANT applyBossWin qui l'ajoute à defeated_bosses)
  // → 1er passage toujours animé, réaffrontements gagnés d'avance = skip.
  lastRunFirstVisit.value = !defeatedBossSet.value.has(b.id);
  busy.value = true;
  try {
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(
      char.row.pseudo,
      c.value,
      char.row.equipped,
      extra,
      c.value.level.level,
      char.row.voie,
    );
    const r = simulateCombat(player, b.combatant, { seed, goldOnWin: b.gold });
    const win = r.win;
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = win ? Math.round(b.gold * (1 + goldPct)) : 0;
    // Victoire → 3 récompenses au CHOIX (posées en attente ; réclamées via la modale).
    const pending: PendingReward | null = win
      ? {
          source: `boss:${b.id}`,
          candidates: rollBossRewards(b, mulberry32((seed ^ 0x9e3779b9) >>> 0), lucky),
        }
      : null;
    const finalPv = r.log.length ? r.log[r.log.length - 1]!.playerPv : player.pv;
    // Drop de TALENT au boss (source plus généreuse que les donjons) : ~25 % à la
    // victoire, RANG gaté par le palier du boss (`dropLevel`) et luck rehaussée (0.6) —
    // les boss lâchent des talents plus hauts que les donjons de même profondeur.
    const bossTalentRng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    const talentDrops =
      win && bossTalentRng() < 0.25
        ? autoEquipTalentDrops([
            rollTalentDrop(bossTalentRng, {
              level: b.dropLevel,
              luck: 0.6,
              idSeed: seed,
              playerLevel: c.value.level.level,
            }),
          ])
        : [];
    await char.applyBossWin(uid, {
      bossId: b.id,
      summonCost,
      gold,
      defeated: win,
      pending,
      enchantScrolls: 4 + Math.floor(b.unlockLevel / 4), // jalon boss → parchemins d'enchant 📜
      protections: 1 + Math.floor(b.unlockLevel / 10), // 🛡️ protections — la source précieuse
      ...(talentDrops.length ? { talentDrops } : {}),
    });
    if (talentDrops.length) queueFx(() => celebrateTalentDrop(talentDrops[0]!));
    run.value = {
      name: b.name,
      kind: 'boss',
      cleared: win,
      defeated: win ? 1 : 0,
      total: 1,
      gold,
      finalPv,
      playerMaxPv: player.pv,
      fights: [
        {
          monster: b.name,
          emoji: b.emoji,
          win,
          rounds: r.rounds,
          maxPv: b.combatant.pv,
          archetype: monsterArchetype(b.combatant),
          log: r.log,
        },
      ],
      drops: [],
      ...(talentDrops.length ? { talentDrops } : {}),
      ...(win ? { enchantScrolls: 4 + Math.floor(b.unlockLevel / 4) } : {}),
      ...(win ? { protections: 1 + Math.floor(b.unlockLevel / 10) } : {}),
    };
    // Victoire de boss de palier = jalon MAJEUR → célébration centrale (gros éclat),
    // DIFFÉRÉE à la fin de l'animation de combat.
    if (win)
      queueFx(() =>
        gameFx.celebrate({
          kind: 'generic',
          emoji: b.emoji,
          title: `${b.name} vaincu !`,
          subtitle: 'Boss de palier terrassé 🏆',
          rarity: 'divin',
        }),
      );
    openReport();
  } catch {
    $q.notify({ type: 'negative', message: 'Échec du combat.' });
  } finally {
    busy.value = false;
  }
}
// Choix d'une récompense parmi les 3 candidats en attente.
function doChooseReward(index: number) {
  // La récompense de boss est RÉCUPÉRÉE (drop) → va au sac (ou slot vide). PAS
  // d'animation de palier de set ici : elle est réservée à l'ÉQUIPEMENT délibéré
  // (sac → équipé). Le joueur équipe ensuite depuis l'onglet Équip. (bug 63c392dd).
  withUid((uid) => char.chooseReward(uid, index), 'Impossible de récupérer la récompense.');
}

// ── Faille sans fin (end-game infini) ──
// La Faille sans fin est le TOUT dernier maillon : débloquée une fois le DERNIER
// donjon de la chaîne nettoyé (le contenu procédural fini va jusqu'à reco ~94 →
// la Faille infinie prend le relais). Repli : au moins l'Archidémon vaincu.
const endlessUnlocked = computed(() => {
  const last = dungeonChain.value[dungeonChain.value.length - 1];
  return last ? clearedIds.value.includes(last.id) : defeatedBossSet.value.has('archidemon');
});
const endlessBest = computed(() => char.row?.endless_best ?? 0);
const nextEndlessTier = computed(() => endlessBest.value + 1);

async function fightEndless() {
  const uid = auth.user?.id;
  if (expeBlocked()) return;
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
    const { extra, lucky } = runExtra();
    const seed = Math.floor(Math.random() * 1e9);
    const player = playerWithGear(
      char.row.pseudo,
      c.value,
      char.row.equipped,
      extra,
      c.value.level.level,
      char.row.voie,
    );
    const foe = endlessFoe(tier);
    const r = simulateCombat(player, foe, { seed, goldOnWin: endlessGold(tier) });
    const win = r.win;
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = win ? Math.round(endlessGold(tier) * (1 + goldPct)) : 0;
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
          playerLevel: c.value.level.level,
        });
      }
      if (rolled) {
        const dr: Item = { ...rolled, id: crypto.randomUUID() };
        drops.push(dr);
        queueFx(() => celebrateRareDrop(dr));
      }
      // (Les familiers ne tombent PLUS à la Faille — uniquement au Labyrinthe.)
    }
    const finalPv = r.log.length ? r.log[r.log.length - 1]!.playerPv : player.pv;
    const prevBest = endlessBest.value;
    await char.applyEndless(uid, {
      tier,
      energyCost: cost,
      gold,
      drops,
      cleared: win,
    });
    // Nouveau palier RECORD de la Faille → célébration (progression end-game),
    // différée à la fin de l'animation de combat.
    if (win && tier > prevBest)
      queueFx(() =>
        gameFx.celebrate({
          kind: 'generic',
          emoji: '🌀',
          title: `Faille · palier ${tier} !`,
          subtitle: 'Nouveau record de profondeur',
          rarity: 'legendary',
        }),
      );
    run.value = {
      name: `Faille sans fin · palier ${tier}`,
      kind: 'boss',
      cleared: win,
      defeated: win ? 1 : 0,
      total: 1,
      gold,
      finalPv,
      playerMaxPv: player.pv,
      fights: [
        {
          monster: foe.name,
          emoji: '🌀',
          win,
          rounds: r.rounds,
          maxPv: foe.pv,
          archetype: monsterArchetype(foe),
          log: r.log,
        },
      ],
      drops,
    };
    openReport();
  } catch {
    $q.notify({ type: 'negative', message: 'Échec du combat.' });
  } finally {
    busy.value = false;
  }
}

function withUid(fn: (uid: string) => Promise<unknown>, errMsg: string) {
  const uid = auth.user?.id;
  if (!uid) return;
  // Héros en expédition = équipement GELÉ (il est parti avec son barda).
  if (onExpedition.value) {
    $q.notify({ type: 'warning', message: '🧭 Ton héros est en expédition — indisponible.' });
    return;
  }
  fn(uid).catch(() => $q.notify({ type: 'negative', message: errMsg }));
}

// ── Mode idle « Expédition » : gel des autres modes + cycle de vie + messagerie ──
const onExpedition = computed(() => !!char.row?.expedition);
function expeBlocked(): boolean {
  if (!onExpedition.value) return false;
  $q.notify({
    type: 'warning',
    message: '🧭 Ton héros est en expédition — indisponible jusqu’à son retour.',
  });
  return true;
}
const expeNow = ref(Date.now());
const expeHero = computed(() =>
  char.row?.expedition ? heroPosition(char.row.expedition, expeNow.value) : null,
);
const unreadMessages = computed(() => (char.row?.messages ?? []).filter((m) => !m.read).length);
const inboxOpen = ref(false);
function openInbox() {
  inboxOpen.value = true;
  const uid = auth.user?.id;
  if (uid) void char.expeMarkRead(uid);
}
let expeBusy = false;
async function expeLifecycle() {
  const uid = auth.user?.id;
  if (!uid || expeBusy) return;
  expeBusy = true;
  try {
    const msg = await char.expeTick(uid, Date.now());
    if (msg)
      $q.notify({
        type: msg.win ? 'positive' : 'warning',
        message: '📬 Nouveau rapport d’expédition.',
      });
    const o = await char.expeCollect(uid, Date.now());
    if (o)
      $q.notify({
        type: 'positive',
        message: `🎉 Héros rentré ! +${o.gold} 🪙${o.item ? ' · ' + o.item.name : ''}`,
      });
    await char.expeSyncMap(uid, Date.now(), c.value.level.level);
  } finally {
    expeBusy = false;
  }
}
function fmtExpeMs(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
const POI_MSG_LABEL: Record<string, string> = {
  mine: 'Mine',
  camp: 'Camp',
  lair: 'Repaire',
  arena: 'Arène',
};

// ── Sac : filtre par type d'objet + tri (meilleurs d'abord) ──
const invFilter = ref<ItemSlot | 'all'>('all');
const invSetFilter = ref<string>('all'); // filtre par SET ('all' ou un setId, ticket 986a50b6)
function bagCountForSlot(slot: ItemSlot): number {
  return (char.row?.inventory ?? []).filter((i) => i.slot === slot).length;
}
// Sets présents dans le sac (pour les chips de filtre par set) → id + nom + emoji.
const bagSets = computed(() => {
  const seen = new Map<string, { id: string; name: string; emoji: string }>();
  for (const i of char.row?.inventory ?? []) {
    if (isFamiliar(i) || !i.setId || seen.has(i.setId)) continue;
    const def = SET_BY_ID[i.setId];
    seen.set(i.setId, { id: i.setId, name: def?.name ?? i.setId, emoji: def?.emoji ?? '🧩' });
  }
  return [...seen.values()];
});
const filteredInventory = computed<Item[]>(() => {
  const inv = (char.row?.inventory ?? []).filter((i) => !isFamiliar(i));
  const bf = betterFilterSlot.value;
  let list: Item[];
  if (bf) {
    // Filtre « badge » : uniquement les objets de ce slot MEILLEURS si équipés.
    const cur = combatPowerVal.value;
    list = inv.filter((i) => i.slot === bf && powerIfEquip(i) > cur);
  } else {
    list = inv.filter((i) => invFilter.value === 'all' || i.slot === invFilter.value);
  }
  if (invSetFilter.value !== 'all') list = list.filter((i) => i.setId === invSetFilter.value);
  return list.sort(
    (a, b) =>
      RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
      rollStars(b.roll ?? 0) - rollStars(a.roll ?? 0),
  );
});
// Objets du sac (même slot) MEILLEURS si équipés (puissance fixe grade+enchant) → badge
// sur l'item équipé + filtre « mieux au sac ». Cohérent avec le verdict affiché.
function betterInBagForSlot(slot: ItemSlot): Item[] {
  if (!equippedInSlot(slot)) return []; // slot vide → rien à comparer, pas de badge
  const cur = combatPowerVal.value;
  return (char.row?.inventory ?? []).filter(
    (i) => !isFamiliar(i) && i.slot === slot && powerIfEquip(i) > cur,
  );
}
function betterInBagCount(slot: ItemSlot): number {
  return betterInBagForSlot(slot).length;
}
// Clic sur le badge d'un item équipé → ouvre le Sac (modale) filtré sur ses upgrades.
function showBetterForSlot(slot: ItemSlot) {
  betterFilterSlot.value = slot;
  invFilter.value = slot;
  bagOpen.value = true;
}
// Les chips de filtre du sac annulent le filtre « mieux » (navigation normale).
function setInvFilter(f: ItemSlot | 'all') {
  betterFilterSlot.value = null;
  invFilter.value = f;
}
// Nb d'objets RÉELLEMENT dans le Sac = hors familiers (rangés dans leur propre section)
// → sinon le badge « Sac » comptait un familier fantôme (ticket e3d61676).
const bagCount = computed(() => (char.row?.inventory ?? []).filter((i) => !isFamiliar(i)).length);

// ── Loadouts (sets d'équipement rangés) — 1 par VOIE (8 slots) ──
// Slot i ↔ voie i : chaque loadout est l'endroit où ranger le set de cette voie.
const loadoutVoie = (i: number): (typeof VOIES)[number] | null => VOIES[i] ?? null;
const hasEquippedGear = computed(() => SLOTS.some((s) => !!char.row?.equipped[s]));
// SET DE VOIE ACTUELLEMENT ÉQUIPÉ (≥2 pièces) → marque le loadout correspondant « en cours »
// + bannière dans la vue Équipement. Dominant parmi les 4 slots gear équipés.
const equippedSet = computed<{ idx: number; name: string; emoji: string; count: number } | null>(
  () => {
    const counts = setCounts(char.row?.equipped ?? {});
    let bestId = '';
    let bestN = 0;
    for (const [id, n] of Object.entries(counts))
      if (id.startsWith('voie:') && n > bestN) {
        bestN = n;
        bestId = id;
      }
    if (bestN < 2) return null; // moins de 2 pièces → pas de set « en cours »
    const v = VOIE_BY_ID[bestId.slice('voie:'.length)];
    const idx = VOIES.findIndex((x) => `voie:${x.id}` === bestId);
    return v ? { idx, name: v.name, emoji: v.emoji, count: bestN } : null;
  },
);
// Puissance SI on équipe ce loadout : ses 4 objets gear + le FAMILIER actuel (non rangé).
function loadoutPower(items: Equipped): number {
  const fam = char.row?.equipped[FAMILIAR_SLOT];
  return powerWith({ ...items, ...(fam ? { [FAMILIAR_SLOT]: fam } : {}) });
}
const loadoutsView = computed(() => {
  const los = char.row?.loadouts ?? [];
  return Array.from({ length: MAX_LOADOUTS }, (_, i) => {
    const stored = los[i]?.items ?? {};
    const items = SLOTS.map((s) => stored[s]).filter((it): it is Item => !!it);
    const power = items.length ? loadoutPower(stored) : 0;
    const sellGold = items.reduce((s, it) => s + sellValue(it), 0);
    return { items, count: items.length, power, delta: power - combatPowerVal.value, sellGold };
  });
});
async function doSwapLoadout(i: number) {
  const uid = auth.user?.id;
  if (!uid || busy.value || expeBlocked()) return; // gelé en expédition (héros parti avec son stuff)
  await char.swapLoadout(uid, i);
}
// Vider un loadout rangé → ses objets retournent dans le sac (ticket 46488974).
function doUnpackLoadout(i: number) {
  withUid(async (uid) => {
    const n = await char.unpackLoadout(uid, i);
    if (n) $q.notify({ type: 'positive', message: `🎒 ${n} objet(s) remis dans le sac.` });
  }, 'Impossible de vider le loadout.');
}
// Vendre un loadout rangé → or (ticket 53a6d487).
function doSellLoadout(i: number) {
  withUid(async (uid) => {
    const gold = await char.sellLoadout(uid, i);
    if (gold) $q.notify({ type: 'positive', message: `🪙 Loadout vendu (+${gold} or).` });
  }, 'Impossible de vendre le loadout.');
}

// ── Familier (compagnon) ──
const equippedFamiliar = computed<Item | null>(() => char.row?.equipped[FAMILIAR_SLOT] ?? null);
const bagFamiliars = computed<Item[]>(() =>
  (char.row?.inventory ?? [])
    .filter((i) => isFamiliar(i))
    // Par RANG/QUALITÉ décroissant, puis par NOM (tickets b552b16f + tri rang) → les
    // meilleurs familiers en tête (l'équipé est mis en tête par allFamiliars).
    .sort((a, b) => tierIndexOf(b) - tierIndexOf(a) || a.name.localeCompare(b.name)),
);
// TOUS les familiers (équipé d'abord, puis le sac) → une seule grille de cartes, comme
// les talents. `equipped` marque celui porté (au plus 1). Affichage homogène avec Talents.
const allFamiliars = computed<Array<Item & { equipped: boolean }>>(() => {
  const eq = equippedFamiliar.value;
  const list: Array<Item & { equipped: boolean }> = [];
  if (eq) list.push({ ...eq, equipped: true });
  for (const f of bagFamiliars.value) list.push({ ...f, equipped: false });
  return list;
});
function doEquipFamiliar(itemId: string) {
  withUid((uid) => char.equip(uid, itemId), 'Impossible d’équiper le familier.');
}
function doUnequipFamiliar() {
  withUid((uid) => char.unequip(uid, FAMILIAR_SLOT), 'Impossible de déséquiper.');
}
// Talents & familiers en trop se VENDENT contre de l'or (ticket 0ec48637 : plus de recyclage
// ni d'infusion de grade — le grade est fixé au drop, on trouve mieux en explorant).
function doSellTalent(id: string) {
  withUid(async (uid) => {
    const g = await char.sellTalent(uid, id);
    if (g) $q.notify({ type: 'positive', message: `🪙 Talent vendu (+${g} or)` });
  }, 'Vente impossible.');
}
// Animation de PALIER DE SET : si équiper `setId` a fait franchir un palier (2/3/4
// pièces), on célèbre en montrant le set + le bonus tout juste débloqué.
function celebrateSetTier(setId: string | undefined, before: number, after: number) {
  if (!setId || after <= before) return;
  const set = SET_BY_ID[setId];
  if (!set) return;
  const crossed = set.tiers.filter((t) => before < t.pieces && after >= t.pieces);
  if (!crossed.length) return;
  const top = crossed[crossed.length - 1]!;
  // Pièces de set équipées (le bonus est scalé par leur RANG, cf. setEffects, #3).
  const eq = char.row?.equipped ?? {};
  const pieces = SLOTS.map((sl) => eq[sl]).filter((it): it is Item => it?.setId === setId);
  gameFx.celebrate({
    kind: 'unlock',
    emoji: set.emoji,
    title: `${set.emoji} ${set.name} — ${after}/4 pièces`,
    subtitle: `Bonus ${top.pieces} pièces : ${setTierLabel(top.type, top.base, pieces)}`,
    rarity: top.pieces >= 4 ? 'divin' : top.pieces >= 3 ? 'legendary' : 'epic',
  });
}
// Équipe un objet du sac + déclenche l'animation de palier de set le cas échéant.
async function equipWithSetFx(uid: string, itemId: string) {
  const item = char.row?.inventory.find((i) => i.id === itemId);
  const setId = item?.setId;
  const before = setId ? (setCounts(char.row?.equipped ?? {})[setId] ?? 0) : 0;
  await char.equip(uid, itemId);
  if (setId) celebrateSetTier(setId, before, setCounts(char.row?.equipped ?? {})[setId] ?? 0);
}
function doEquip(itemId: string) {
  withUid((uid) => equipWithSetFx(uid, itemId), 'Impossible d’équiper.');
}
// OPTIMISEUR (ticket 6d69c2fc) : équipe d'un coup la meilleure combi (sets inclus) de
// tout ton stuff (équipé + sac) ; les écartés retournent au sac. Familier inchangé.
function doOptimizeGear() {
  withUid(async (uid) => {
    const changed = await char.optimizeGear(
      uid,
      c.value,
      c.value.level.level,
      char.row?.pseudo ?? 'Toi',
    );
    $q.notify({
      type: changed ? 'positive' : 'info',
      message: changed
        ? '🪄 Équipement optimisé — meilleure combinaison équipée !'
        : 'Ton équipement est déjà optimal. 👍',
    });
  }, 'Optimisation impossible.');
}
// Remplacement d'un objet équipé : le joueur choisit dans une modale ce qu'il
// advient de l'ancien (garder au sac / recycler → poussière / vendre → or).
const replaceTarget = ref<Item | null>(null);
function openReplace(drop: Item) {
  replaceTarget.value = drop;
}
function confirmReplace(disposal: 'sell' | 'keep') {
  const drop = replaceTarget.value;
  if (!drop) return;
  replaceTarget.value = null;
  const setId = drop.setId;
  const before = setId ? (setCounts(char.row?.equipped ?? {})[setId] ?? 0) : 0;
  withUid(
    (uid) =>
      char.equipReplacing(uid, drop.id, disposal).then(() => {
        if (setId) celebrateSetTier(setId, before, setCounts(char.row?.equipped ?? {})[setId] ?? 0);
      }),
    'Action impossible.',
  );
}
function doUnequip(slot: ItemSlot) {
  withUid((uid) => char.unequip(uid, slot), 'Impossible de déséquiper.');
}

function doSell(it: Item) {
  withUid((uid) => char.sell(uid, it.id), 'Vente impossible.');
}
function doToggleLock(it: Item) {
  withUid((uid) => char.toggleLock(uid, it.id), 'Action impossible.');
}
// Pièce de set (de voie) → bouton 📦 pour la ranger dans le loadout de SA voie (loadout i↔voie i).
const isVoieSetItem = (it: Item) => !!it.setId && it.setId.startsWith('voie:');
// Conflit de rangement : le slot visé du loadout est déjà occupé → on compare et on choisit.
const stashConflict = ref<{ incoming: Item; stored: Item; idx: number } | null>(null);
function loadoutTargetFor(it: Item): { idx: number; stored: Item | undefined } {
  const idx = VOIES.findIndex((v) => v.id === (it.setId ?? '').slice('voie:'.length));
  const stored = idx >= 0 ? char.row?.loadouts?.[idx]?.items?.[it.slot] : undefined;
  return { idx, stored };
}
function doStashSetPiece(it: Item) {
  const { idx, stored } = loadoutTargetFor(it);
  if (idx < 0) return;
  if (stored) {
    // Emplacement déjà occupé (≤ 1 set complet/loadout) → comparatif + choix.
    stashConflict.value = { incoming: it, stored, idx };
    return;
  }
  withUid(async (uid) => {
    await char.stashSetPiece(uid, it.id);
    $q.notify({ type: 'positive', message: `📦 Rangé dans le loadout ${VOIES[idx]?.name ?? ''}.` });
  }, 'Impossible de ranger cette pièce.');
}
// Remplacer : range la nouvelle, vend l'ancienne (ou la renvoie au sac si 🔒).
function stashReplace() {
  const cf = stashConflict.value;
  if (!cf) return;
  const locked = cf.stored.locked;
  withUid(async (uid) => {
    await char.stashSetPiece(uid, cf.incoming.id, true);
    $q.notify({
      type: 'positive',
      message: locked
        ? '📦 Rangée — ancienne 🔒 renvoyée au sac.'
        : '📦 Rangée — ancienne vendue 🪙.',
    });
  }, 'Action impossible.');
  stashConflict.value = null;
}
// Garder la rangée, vendre la nouvelle.
function stashSellIncoming() {
  const cf = stashConflict.value;
  if (!cf) return;
  withUid((uid) => char.sell(uid, cf.incoming.id), 'Vente impossible.');
  stashConflict.value = null;
}
// Nettoyage en masse : objets du sac moins rares que l'équipé du même slot.
// Slot ciblé par le nettoyage en masse = le filtre du sac actif (sinon tous).
const bulkSlot = computed<ItemSlot | undefined>(() =>
  invFilter.value === 'all' ? undefined : invFilter.value,
);
// Objets du sac qui N'AMÉLIORENT PAS ta puissance si équipés → candidats à la casse/vente
// en masse. Puissance FIXE (grade + enchant) → comparaison directe « si équipé ». Slot vide
// → l'objet est utile (à équiper), gardé. 🔒 protège ; familiers = piste à part.
const powerLossItems = computed<Item[]>(() => {
  const r = char.row;
  if (!r) return [];
  const cur = combatPowerVal.value;
  return r.inventory.filter((it) => {
    if (it.locked) return false;
    if (isFamiliar(it)) return false;
    if (bulkSlot.value && it.slot !== bulkSlot.value) return false;
    if (!equippedInSlot(it.slot)) return false; // slot vide → à équiper, on garde
    return powerIfEquip(it) <= cur; // pas meilleur que l'équipé → candidat
  });
});
const belowCount = computed(() => powerLossItems.value.length);
// Libellé du périmètre (« du sac » ou « [type] ») pour être explicite.
const bulkScope = computed(() =>
  bulkSlot.value ? SLOT_LABEL[bulkSlot.value].toLowerCase() : 'ton sac',
);
function doSellBelow() {
  const ids = powerLossItems.value.map((i) => i.id);
  $q.dialog({
    title: 'Tout vendre',
    message: `Vendre les ${ids.length} objet(s) sans intérêt de ${bulkScope.value} → or ? Les objets meilleurs (potentiel) ou verrouillés 🔒 sont conservés.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Tout vendre', color: 'negative' },
  }).onOk(() => withUid((uid) => char.sellMany(uid, ids), 'Vente impossible.'));
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
        // Animation centrale (overlay plein écran) : montée de niveau + un éclat par
        // déblocage (chaîne). La carte .lb-card.major reste le détail lisible en dessous.
        gameFx.celebrate({
          kind: 'levelup',
          emoji: '⭐',
          title: `Niveau ${r.to} !`,
          ...(r.to > r.from + 1 ? { subtitle: `+${r.to - r.from} niveaux` } : {}),
          rarity: 'epic',
        });
        for (const u of levelBurstUnlocks.value.slice(0, 3))
          gameFx.celebrate({
            kind: 'unlock',
            emoji: u.emoji,
            title: u.title,
            subtitle: u.detail,
            rarity: 'legendary',
          });
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
  // Expédition idle : synchro carte + cycle de vie (rapport/collecte) au fil du temps.
  void expeLifecycle();
  expeTimer = setInterval(() => {
    expeNow.value = Date.now();
    void expeLifecycle();
  }, 1000);
});
let expeTimer: ReturnType<typeof setInterval> | null = null;
onUnmounted(() => {
  if (expeTimer) clearInterval(expeTimer);
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
/* Rendu dans le volet droit du cockpit : le volet gère le scroll → pas de min-height. */
.adv-page.embedded {
  min-height: 0;
  padding-bottom: 40px;
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
  gap: 10px 6px;
  flex-wrap: wrap; /* écrans étroits (Z Fold plié ~344 px) : les puces passent à la ligne */
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
/* Plateau de ressources : un seul contenant bordé qui regroupe toutes les puces. */
.tb-tray {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 12px;
}
.tb-sep {
  width: 1px;
  align-self: stretch;
  min-height: 14px;
  background: var(--line);
}
.tb-r {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.tb-r.energy {
  color: #8fd0ff;
}
.tb-r.gold {
  color: var(--accent);
}
.tb-r.stones {
  color: #4ec6d6;
}
.tb-r.frag {
  color: #6dd28f;
}
.tb-r.parch {
  color: #d8b46a;
}
.tb-r.summon {
  color: #e08bd8;
}
.tb-r.energy.deficit {
  color: var(--d4, #ff6a45);
}
/* Bouton messages : action distincte des ressources (self-stylé, ex-.tb-chip). */
.inbox-btn {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
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
/* Modale générique (boutique retirée ; classes réutilisées par messages + Codex) */
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
.shop-x {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
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

/* Sous-navigation de l'onglet Équip. (Équipement / Sac). */
.gear-sub {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line-soft, var(--line));
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 14px;
}
.gs-b {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 5px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dim);
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.gs-b.on {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
}
.gs-badge {
  margin-left: 4px;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 999px;
  font-size: 10px;
  padding: 0 5px;
  font-family: var(--font-display);
}

/* Modale d'aventure (Talents / Familier ouverts par clic sur l'avatar). */
.adv-modal {
  position: relative;
  width: 100%;
  max-width: var(--app-max-width, 560px);
  max-height: 88vh;
  overflow-y: auto;
  padding: 16px 14px 24px;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
}
.adv-modal-x {
  position: sticky;
  top: 0;
  float: right;
  margin: -4px -4px 0 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
  z-index: 2;
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

/* Stats — 3 cercles sur une ligne (anneau = part du build, chiffre = valeur réelle) */
.stats-circles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.statc {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 6px 9px;
  text-align: center;
}
.statc .ring {
  width: 78px;
  height: 78px;
  display: block;
  margin: 0 auto 4px;
}
.ring .track {
  fill: none;
  stroke: #000;
  stroke-opacity: 0.55;
  stroke-width: 3;
}
.ring .arc {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}
.ring .rc-emo {
  font-size: 7.5px;
}
.ring .rc-n {
  font-size: 11px;
  font-weight: 700;
}
.statc-nm {
  font-size: 13px;
  font-weight: 600;
}
.statc-inf {
  font-size: 10px;
  color: var(--dim);
  line-height: 1.25;
}
.s-pui .arc {
  stroke: var(--d4);
}
.s-pui .rc-n,
.s-pui .statc-nm {
  fill: var(--d4);
  color: var(--d4);
}
.s-end .arc {
  stroke: var(--d1);
}
.s-end .rc-n,
.s-end .statc-nm {
  fill: var(--d1);
  color: var(--d1);
}
.s-agi .arc {
  stroke: var(--accent);
}
.s-agi .rc-n,
.s-agi .statc-nm {
  fill: var(--accent);
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .ring .arc {
    transition: none;
  }
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
/* PORTRAIT HÉROS : le perso dans un cercle teinté par le RANG + couronne d'étoiles. */
.portrait {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  text-align: center;
}
.pt-frame {
  position: relative;
  width: 172px;
  height: 172px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 42%,
    color-mix(in srgb, var(--rank-c, var(--accent)) 22%, var(--surface)),
    color-mix(in srgb, var(--rank-c, var(--accent)) 6%, var(--surface)) 70%
  );
  border: 4px solid color-mix(in srgb, var(--rank-c, var(--accent)) 80%, transparent);
  box-shadow:
    0 0 20px color-mix(in srgb, var(--rank-c, var(--accent)) 34%, transparent),
    inset 0 0 24px color-mix(in srgb, var(--rank-c, var(--accent)) 16%, transparent);
}
.pt-avatar {
  position: absolute;
  left: 50%;
  top: 53%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 148px;
}
.pt-stars {
  position: absolute;
  inset: -4px; /* couvre aussi l'épaisseur de l'anneau → étoiles centrées dessus */
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  overflow: visible;
  pointer-events: none; /* laisse cliquer le familier/talent de l'avatar dessous */
}
/* Étoiles VIDES : noires opaques (+ liseré) → on voit une étoile, pas l'anneau au travers. */
.pt-star {
  fill: #14100a;
  stroke: color-mix(in srgb, var(--rank-c, var(--accent)) 55%, var(--dim));
  stroke-width: 1;
}
.pt-star.on {
  fill: var(--rank-c, var(--accent));
  stroke: #14100a;
  stroke-width: 1.4;
  paint-order: stroke; /* contour SOUS le remplissage → étoile nette qui ressort */
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--rank-c, var(--accent)) 70%, transparent));
}
.pt-rank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.4px;
  color: color-mix(in srgb, var(--rank-c, var(--accent)) 62%, var(--text));
}
/* Liste des rangs de prestige (modale) */
.ranks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.rank-row.current {
  border-color: color-mix(in srgb, var(--rank-c) 70%, transparent);
  background: color-mix(in srgb, var(--rank-c) 14%, var(--surface));
}
.rank-emo {
  font-size: 20px;
  line-height: 1;
}
.rank-name {
  font-weight: 800;
  font-size: 15px;
  color: var(--rank-c);
}
.rank-lv {
  margin-left: auto;
  font-size: 12px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.rank-cur {
  font-size: 11px;
  font-weight: 700;
  color: var(--rank-c);
  white-space: nowrap;
}
/* Bloc central : cercle centré + Niveau (bas-gauche) / Puissance (bas-droite). */
/* CARRÉ : le cadre du perso au centre, 4 médaillons aux COINS (absolus). Les coins
   gauches partagent `left:0` (alignés verticalement), les coins hauts partagent `top:0`
   (alignés horizontalement) → un carré parfait autour du perso. */
.pt-square {
  position: relative;
  width: 280px;
  max-width: 90vw;
  aspect-ratio: 1;
  margin: 4px auto 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pt-square .pt-frame {
  /* légèrement réduit pour laisser respirer les coins */
  width: 150px;
  height: 150px;
}
.pt-mini.corner {
  position: absolute;
  width: 68px;
  height: 68px;
}
.corner.tl {
  top: 0;
  left: 0;
}
.corner.tr {
  top: 0;
  right: 0;
}
.corner.bl {
  bottom: 0;
  left: 0;
}
.corner.br {
  bottom: 0;
  right: 0;
}
/* Les coins « bouton » (voie / prestige) : pas de style bouton par défaut. */
button.pt-mini {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
button.pt-mini:active {
  transform: scale(0.96);
}
.pt-mini {
  position: relative;
  flex: 0 0 auto;
  width: 80px;
  height: 80px;
}
/* Emoji central des médaillons Voie / Prestige. */
.ptm-emo {
  font-size: 17px;
}
.pt-mini svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ptm-track {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 3.5;
}
.ptm-track.full {
  stroke: color-mix(in srgb, var(--accent) 60%, var(--line));
}
.ptm-arc {
  fill: none;
  stroke: var(--rank-c, var(--accent));
  stroke-width: 3.5;
  stroke-linecap: round;
}
.ptm-v {
  font-weight: 700;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.pt-mini.lvl .ptm-v {
  fill: var(--rank-c, var(--accent));
}
.pt-mini.pow .ptm-v {
  fill: var(--accent);
  font-size: 15px;
}
/* Badge d'icône (LvL / ⚔️) CENTRÉ verticalement sur l'ÉPAISSEUR du trait de l'anneau
   (top en % du médaillon : viewBox y=4 sur 44 → 9 % de la hauteur → suit toute taille de
   médaillon ; translateY(-50%) → centré sur le trait). Pastille sombre encadrée (liseré),
   petit espace HOMOGÈNE tout autour de l'icône. */
.ptm-ic {
  position: absolute;
  top: 9%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  line-height: 1;
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--rank-c, var(--accent)) 60%, transparent);
}
/* Puissance : encadrement accent (comme le liseré rang du LvL, mais à sa couleur). */
.pt-mini.pow .ptm-ic {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
}
/* Badge texte « LvL » : même gabarit que l'icône ⚔️ (taille alignée → homogène). */
.ptm-ic.txt {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--rank-c, var(--accent));
}

/* Talents */
.tal-slots {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--accent);
  margin-left: 6px;
}
.talents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
/* .tal-card prend une classe p-<rareté> (color = teinte de rareté via currentColor). */
.tal-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  border-left: 3px solid currentColor;
  border-radius: 12px;
  padding: 9px 11px;
  min-width: 0;
}
/* Talent ÉQUIPÉ : nettement plus visible — liseré + fond accent (voltage) et léger halo,
   pour le distinguer d'un coup d'œil des talents en réserve. */
.tal-card.eq {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  border-left-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}
/* Puce « ✓ Équipé » accent. */
.tal-eqbadge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
/* Badge « effet signature » (✦) sur une carte familier, harmonisé avec les talents. */
.fam-sig-badge {
  flex: 0 0 auto;
  color: #ffd23f;
  font-weight: 800;
  font-size: 12px;
}
.tal-emo {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: none;
  background: color-mix(in srgb, currentColor 20%, transparent);
  font-size: 19px;
  cursor: pointer;
  color: inherit;
}
.tal-emo:active {
  transform: scale(0.92);
}
.tal-body {
  min-width: 0;
  flex: 1 1 auto;
}
.tal-name {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
}
.tal-nm {
  min-width: 0;
}
/* Le niveau est « décollé » du couple rang+qualité : poussé à droite de la ligne. */
.tal-lv {
  margin-left: auto;
  font-size: 11px;
  color: var(--dim);
}
.tal-eff {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  margin-top: 1px;
}
/* Pastille de comparaison de puissance (familiers/talents) : +vert / −rouge. */
.cmp-pill {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  line-height: 1.5;
}
.cmp-pill.up {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.cmp-pill.down {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 18%, transparent);
}
/* Voie (spécialisation) — sélecteur ouvert depuis le cercle 🧭 du carré. */
.voie-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.voie-opt {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.voie-opt.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.vo-emo {
  font-size: 24px;
}
.vo-main {
  flex: 1;
  min-width: 0;
}
.vo-name {
  font-weight: 700;
  font-size: 14.5px;
}
.vo-eq {
  margin-left: 6px;
  font-size: 11px;
  color: var(--accent);
}
.vo-blurb {
  font-size: 12px;
  color: var(--dim);
  margin: 2px 0;
}
.vo-stats {
  font-size: 11.5px;
  color: var(--text);
}
.voie-clear {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.talent-reco-btn {
  width: 100%;
  margin: 4px 0 12px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
/* Talent conseillé (maximise la puissance) : liseré doré (ticket 08b10b7f). */
.tal-card.reco {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.tal-xp {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  margin-top: 5px;
  overflow: hidden;
}
.tal-xp span {
  display: block;
  height: 100%;
  background: currentColor;
}
.tal-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px; /* espacé (ticket 8bfe2262) → moins de taps accidentels */
}
.tal-b {
  font-size: 11.5px;
  font-weight: 700;
  min-height: 34px; /* cible tactile confortable */
  padding: 6px 11px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}
.tal-b:disabled {
  opacity: 0.4;
  cursor: default;
}
/* Actions de gestion (grade / recycle) : séparées visuellement de l'action primaire
   (Équiper/Retirer) par un liseré discret → on ne recycle plus par erreur (8bfe2262). */
.tal-b.ghost {
  color: var(--dim);
  border-style: dashed;
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
  /* Hauteur fixe : toutes les cartes identiques quel que soit le contenu (set/enchant/
     effet à 1 ou 2 lignes) → l'affichage ne « bouge » plus d'une carte à l'autre. */
  min-height: 118px;
  /* Cellule de grille : autoriser le rétrécissement (sinon un nom de set long
     force la colonne large → débordement à droite). */
  min-width: 0;
}
/* Badge « N objets du sac au potentiel supérieur » — cercle avec le 🎒 en fond,
   en bas à droite de l'item équipé. Tap → filtre le sac. */
.slot-better {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #15120e;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.slot-better::before {
  content: '🎒';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 20px;
  opacity: 0.35;
}
.slot-better .sb-n {
  position: relative;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
}
/* En-tête Équipement : titre à gauche, icônes Sac/Loadout à droite. */
.gear-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 18px 2px 4px;
}
.gh-title {
  margin: 0;
}
.gear-icons {
  display: flex;
  gap: 6px;
  flex: none;
}
.gi-b {
  position: relative;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 19px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.gi-b:active {
  background: var(--surface-2);
  border-color: var(--accent);
}
/* Compteur d'objets sur l'icône Sac. */
.gi-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
/* Modale Sac : scrollable (l'inventaire peut être long). */
.bag-card {
  max-height: 86vh;
  overflow-y: auto;
}
/* Bannière du filtre « upgrades potentielles » (posé via le badge d'un item équipé). */
.better-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 7px 12px;
  margin: 4px 0 8px;
  font-size: 13px;
}
.bb-clear {
  flex: none;
  border: none;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
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
/* Effet flexible + clampé à 2 lignes → hauteur stable, pousse les actions en bas. */
.slot-eff {
  font-size: 11px;
  color: var(--dim);
  flex: 1 1 auto;
  min-height: 26px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Actions ancrées en bas → alignées d'une carte à l'autre. */
.slot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}
.slot-up {
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
/* Flèche ↑ du bouton de grade (⭐↑) : hérite de la couleur du texte, collée à l'étoile. */
.gu-up {
  font-weight: 900;
  margin: 0 1px 0 -1px;
  font-size: 0.92em;
}
/* Bouton « À fond » (infuser au cap) : accent plein pour le distinguer du +1. */
.slot-up.alt {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.slot-up.alt:disabled {
  background: transparent;
  color: var(--dim);
}
/* Note « une fois infusé · ~N ✨ » sous un comparateur de puissance. */
.pow-cost {
  display: block;
  font-size: 10px;
  color: var(--dim);
  margin-top: 2px;
}
/* Bouton bag « à fond » mis en avant. */
.link-btn.strong {
  color: var(--accent);
  font-weight: 700;
}
.slot-up:disabled {
  border-color: var(--line);
  background: transparent;
  color: var(--dim);
  cursor: not-allowed;
}
.slot-remove {
  border: none;
  background: none;
  color: var(--dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.slot-remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.slot-vide {
  font-size: 12px;
  color: var(--dim);
  opacity: 0.7;
}
.fam-incub-locked {
  width: 100%;
  text-align: left;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
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
/* Capstone (4-pièces) atteint en pièces mais bloqué faute de la bonne voie. */
.set-tier.locked {
  color: var(--d4);
  opacity: 0.8;
}
.set-mine {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: auto;
  margin-right: 6px;
}
/* Bouton « voir les 8 sets » + catalogue (onglet Boss) */
.sets-catalog-btn {
  width: 100%;
  margin: 4px 0 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.sets-catalog-btn:hover {
  border-color: var(--accent);
}
.sets-cat-sub {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
  line-height: 1.35;
}
.sets-cat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}
/* Conflit de rangement de set (comparatif nouvelle vs rangée) */
.stash-sub {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}
.stash-cmp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.stash-side {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--surface);
}
.stash-side.best {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.stash-lbl {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dim);
}
.stash-nm {
  font-weight: 700;
  font-size: 13px;
  margin-top: 2px;
}
.stash-q {
  color: var(--accent);
  font-weight: 800;
}
.stash-eff {
  font-size: 11.5px;
  color: var(--text);
  margin-top: 2px;
}
.stash-pow {
  font-size: 12px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  margin-top: 3px;
}
.stash-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stash-actions .drops-close.accent {
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
}
.stash-actions .drops-close.ghost {
  background: none;
  color: var(--dim);
}
/* ── Loadouts (sets d'équipement rangés) ── */
.loadouts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
.loadout {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 9px 11px;
}
.loadout.empty {
  border-style: dashed;
}
.lo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lo-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}
.lo-name.mine {
  color: var(--accent);
}
.loadout.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.lo-active {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 800;
  color: var(--bg);
  background: var(--accent);
  border-radius: 6px;
  padding: 1px 6px;
  vertical-align: middle;
}
.equipped-set-banner {
  margin: 4px 0 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
}
.lo-power {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--dim);
}
.lo-power.up b {
  color: var(--d1);
}
.lo-power.down b {
  color: var(--d4);
}
.lo-empty-tag {
  font-size: 11px;
  color: var(--dim);
}
.lo-items {
  display: flex;
  gap: 6px;
  margin: 7px 0;
}
.lo-item {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 8px;
  border: 1px solid var(--rk, var(--line));
  background: color-mix(in srgb, var(--rk, var(--line)) 12%, var(--surface));
}
.lo-btn {
  width: 100%;
  margin-top: 4px;
  padding: 8px 0;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
.lo-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: var(--line);
  color: var(--dim);
}
.lo-btn:not(:disabled):active {
  transform: scale(0.98);
}
.lo-actions {
  display: flex;
  gap: 6px;
  margin-top: 5px;
}
.lo-mini {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 11.5px;
  cursor: pointer;
}
.lo-mini.sell {
  color: var(--text);
}
.lo-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.lo-mini:not(:disabled):active {
  transform: scale(0.98);
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
/* Dans une carte d'équipement : méta sur UNE ligne (pas de retour → pas de décalage). */
.slot .pills {
  flex-wrap: nowrap;
  overflow: hidden;
  min-height: 16px;
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
/* Pastille d'enchant +N (objet). */
.gpill.ench {
  color: #15120e;
  background: var(--accent);
  border-color: var(--accent);
  font-weight: 800;
}
.ii-ench {
  color: var(--accent);
}
/* Barre d'enchant en tête du sac : ressources + toggle protection. */
.ench-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 12px;
  margin: 4px 0 10px;
  font-size: 13px;
}
.ench-prot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
}
.ench-prot.off {
  opacity: 0.5;
  cursor: default;
}
.gpill.p-G,
.gpill.p-F,
.gpill.p-E,
.gpill.p-D,
.gpill.p-C,
.gpill.p-B,
.gpill.p-A,
.gpill.p-S,
.gpill.p-SS,
.gpill.p-SSS {
  color: var(--rk);
  border-color: var(--rk);
}
.gpill.set {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
.gpill.sig {
  color: #ffd23f;
  border-color: #ffd23f;
  background: rgba(255, 210, 63, 0.12);
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
.inv-filter-set {
  margin-top: -4px;
  padding-top: 8px;
  border-top: 1px dashed var(--line);
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
/* Apparition animée du butin (pop-in en cascade, léger « éclat » de la bordure). */
.drop-reveal {
  animation: drop-in 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
@keyframes drop-in {
  0% {
    transform: scale(0.7) translateY(8px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .drop-reveal {
    animation: none;
  }
}
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
/* Carte objet du sac : vraie carte (fond + bordure + liseré de rareté à gauche),
   organisée en colonne pour une hiérarchie claire (verdict → méta → effet → compare). */
.inv-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 12px;
}
/* Objet verrouillé : liseré accent pour le repérer. */
.inv-item.locked {
  box-shadow: inset 0 0 0 1px var(--accent);
}
/* Ligne 1 : emoji + nom + verdict de puissance (la décision). */
.ii-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inv-emo {
  font-size: 22px;
  flex: none;
}
.ii-name {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
}
/* Verdict : chip coloré, l'élément le plus visible de la carte. */
.ii-verdict {
  flex: none;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.ii-verdict.up {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.ii-verdict.down {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.ii-verdict.same {
  color: var(--dim);
  background: color-mix(in srgb, var(--dim) 16%, transparent);
}
/* Ligne 2 : méta discrète. */
.ii-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11.5px;
  color: var(--dim);
}
.ii-rar {
  font-weight: 800;
  color: var(--rk, var(--dim));
}
.ii-dot {
  opacity: 0.5;
}
/* Cadenas : petit bouton inline en fin de ligne méta. */
.inv-lock {
  margin-left: auto;
  width: 30px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.inv-lock.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.inv-lock:active {
  transform: scale(0.92);
}
/* Ligne 3 : EFFET mis en avant (ce que l'objet fait). */
/* Comparaison d'EFFET : cet objet vs équipé, en 2 lignes alignées et lisibles. */
.ii-compare {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--line) 22%, transparent);
}
.ii-cmp-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
}
.ii-cmp-lbl {
  flex: none;
  width: 62px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--dim);
}
.ii-cmp-row.this .ii-cmp-val {
  font-weight: 800;
  color: var(--accent); /* l'objet du sac = mis en avant */
}
.ii-cmp-row.eq .ii-cmp-val {
  color: var(--text);
}
.ii-cmp-val.dim {
  color: var(--dim);
}
.ii-cmp-val {
  flex: 1;
}
/* Rang / qualité CLIQUABLES (méta) → curseur + affordance discrète. */
.clk {
  cursor: pointer;
}
.clk:active {
  transform: scale(0.94);
}
.ii-rar.clk {
  text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent);
  text-underline-offset: 2px;
}
.q-badge.clk {
  outline: 1px dashed color-mix(in srgb, #15120e 45%, transparent);
  outline-offset: 1px;
}
/* Modale d'explication rang / qualité. */
.help-card {
  width: 100%;
  max-width: 460px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px 16px 0 0;
  padding: 16px 16px 14px;
  color: var(--text);
}
.help-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
}
.help-p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dim);
  margin: 0 0 12px;
}
.help-p b {
  color: var(--text);
}
.help-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 14px;
}
.help-scale .ii-rar {
  min-width: 24px;
  text-align: center;
  padding: 3px 6px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--rk) 45%, var(--line));
  background: color-mix(in srgb, var(--rk) 12%, transparent);
  font-size: 12px;
}
.help-close {
  width: 100%;
  padding: 11px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
/* PUISSANCE — comparaison sur UNE LIGNE : verdict « vs équipé » (à armes égales) +
   « maintenant » (si sous-leveled). Chips colorées vert/rouge, la 2ᵉ atténuée. */
.ii-cmp2 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
}
.ii-cmp2-ic {
  font-size: 13px;
  line-height: 1;
}
.ii-cmp2-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 11px;
}
.ii-cmp2-chip b {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ii-cmp2-chip i {
  font-style: normal;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 9.5px;
}
.ii-cmp2-chip.up {
  border-color: color-mix(in srgb, var(--d1) 55%, var(--line));
  background: color-mix(in srgb, var(--d1) 12%, transparent);
}
.ii-cmp2-chip.up b {
  color: var(--d1);
}
.ii-cmp2-chip.down {
  border-color: color-mix(in srgb, var(--d4) 50%, var(--line));
  background: color-mix(in srgb, var(--d4) 10%, transparent);
}
.ii-cmp2-chip.down b {
  color: var(--d4);
}
.ii-cmp2-chip.sub {
  opacity: 0.72;
  transform: scale(0.96);
}
/* Rentabilité : palier d'infusion où l'objet dépasse l'équipé actuel. */
.ii-be {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--d3);
}
.ii-be.ok {
  color: var(--d1);
}
.ii-be-have {
  font-weight: 400;
  color: var(--dim);
}
/* Actions : Équiper (+ Infuser puis équiper) · icônes casser/vendre/lock · ⋯. */
.ii-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
}
.ii-actions .equip-btn {
  flex: 1 1 auto;
}
.equip-btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
}
.equip-btn.ghost:disabled {
  opacity: 0.45;
}
.ii-ic {
  flex: none;
  width: 38px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.ii-ic:disabled {
  opacity: 0.4;
}
.ii-ic:active {
  border-color: var(--accent);
}
.ii-ic.lock.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
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
  color: var(--text);
  font-weight: 600;
}
.bulk-note {
  color: var(--dim);
  font-weight: 400;
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
/* Qualité en chiffre (1→5) collé au rang : pastille ronde colorée rouge→vert. */
.q-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 2px;
  margin-left: 3px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 11px;
  line-height: 1;
  color: #15120e;
}
/* Rang en pastille ronde (comme la qualité), fond = couleur du rang --rk. */
.rk-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 10.5px;
  line-height: 1;
  color: #15120e;
  background: var(--rk, var(--dim));
}
.q-1 {
  background: #ff6a45;
}
.q-2 {
  background: #ff9a3f;
}
.q-3 {
  background: #ffd23f;
}
.q-4 {
  background: #c6d24a;
}
.q-5 {
  background: #7bc86c;
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

/* ── Rangs G→SSS : une couleur unique par rang, portée par la variable --rk
   (posée par les classes de rang r- et p-). Les consommateurs (liseré, texte,
   pastilles) lisent var(--rk) → plus besoin d'une règle par rang et par composant. ── */
.r-G,
.p-G {
  --rk: #9a8f7e;
}
.r-F,
.p-F {
  --rk: #8f9c86;
}
.r-E,
.p-E {
  --rk: #6bd18a;
}
.r-D,
.p-D {
  --rk: #4ec6d6;
}
.r-C,
.p-C {
  --rk: #5a9bff;
}
.r-B,
.p-B {
  --rk: #b07cff;
}
.r-A,
.p-A {
  --rk: var(--accent);
}
.r-S,
.p-S {
  --rk: #ff9a3f;
}
.r-SS,
.p-SS {
  --rk: #ff5b5b;
}
.r-SSS,
.p-SSS {
  --rk: #ff5cd8;
}
/* Cartes à liseré gauche (r-*) : le bord suit le rang ; le texte .rarity aussi. */
.r-G,
.r-F,
.r-E,
.r-D,
.r-C,
.r-B,
.r-A,
.r-S,
.r-SS,
.r-SSS {
  border-left-color: var(--rk);
}
.rarity {
  color: var(--rk);
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
.rc-loadcmp {
  margin-top: 3px;
  font-size: 10.5px;
  font-weight: 700;
}
.rc-loadcmp.good {
  color: var(--d1);
}
.rc-loadcmp.bad {
  color: var(--dim);
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
.rc-pill.p-G,
.rc-pill.p-F,
.rc-pill.p-E,
.rc-pill.p-D,
.rc-pill.p-C,
.rc-pill.p-B,
.rc-pill.p-A,
.rc-pill.p-S,
.rc-pill.p-SS,
.rc-pill.p-SSS {
  color: var(--rk);
  border-color: var(--rk);
}
.rc-pill.set {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
.rc-pill.voie {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
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
/* Bande de drop : teintée par le rang HAUT de la bande (var(--rk) via .p-<rang>). */
.dgn-chip.band {
  color: var(--rk, var(--accent));
  border-color: color-mix(in srgb, var(--rk, var(--accent)) 45%, var(--line));
  background: color-mix(in srgb, var(--rk, var(--accent)) 10%, var(--bg));
}
.dgn-chip.gold {
  color: var(--accent);
}
/* Réserve de pierres affichée à côté du coût du boss (plus discrète). */
.chip-reserve {
  color: var(--dim);
  font-weight: 600;
}
/* Coût en pierres d'invocation quand on n'en a pas assez → alerte douce. */
.dgn-chip.short {
  color: #ff6a45;
  border-color: color-mix(in srgb, #ff6a45 45%, var(--line));
}
.dgn-hint {
  font-size: 11.5px;
  color: var(--dim);
  opacity: 0.9;
  line-height: 1.35;
}
.dgn-hint.summon-hint {
  color: color-mix(in srgb, var(--accent) 70%, var(--dim));
  opacity: 1;
}
/* Forge de pierres d'invocation (poussière → 🔮). */
.summon-forge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin: 4px 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.summon-forge .sf-have {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}
.summon-forge .sf-craft {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 9px;
  padding: 6px 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.summon-forge .sf-craft:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.summon-forge .sf-craft:not(:disabled):active {
  transform: scale(0.96);
}
/* ── Carte d'entrée « Expéditions » (nouveau mode) ── */
.expe-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Activité verrouillée (bâtiment requis non construit) : grisée, liseré neutre. */
.expe-card.locked {
  background: var(--surface);
  border-color: var(--line);
  opacity: 0.75;
}
.expe-idle {
  background: color-mix(in srgb, #4a9eff 12%, var(--surface)) !important;
  border-color: #4a9eff !important;
}
/* Boîte à messages (topbar) */
.inbox-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--d4);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: grid;
  place-items: center;
}
/* Bannière héros en expédition */
.expe-banner {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #4a9eff 14%, var(--surface));
  border: 1px solid #4a9eff;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
.inbox-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px;
}
.inbox-empty {
  color: var(--dim);
  font-size: 13px;
  text-align: center;
  padding: 20px;
}
.inbox-msg {
  border: 1px solid var(--line);
  border-left: 3px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg);
}
.inbox-msg.win {
  border-left-color: #7bc86c;
}
.inbox-msg.lose {
  border-left-color: var(--d4);
}
.im-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 13.5px;
}
.im-text {
  font-size: 12px;
  color: var(--dim);
  margin: 4px 0;
  line-height: 1.3;
}
.im-haul {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
}
.im-item {
  color: var(--accent);
}
/* Objet gagné : mini-carte détaillée (bordure teintée par la rareté via currentColor). */
.im-loot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
}
.im-loot-emo {
  font-size: 22px;
  flex: none;
}
.im-loot-main {
  flex: 1;
  min-width: 0;
}
.im-loot-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
}
.im-loot-sub {
  font-size: 11px;
  color: var(--dim);
  margin-top: 1px;
}
.im-loot-eff {
  font-size: 12px;
  color: var(--accent);
  margin-top: 2px;
}
.im-loot-more {
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 3px;
}
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
  flex: none;
  font-size: 26px;
  line-height: 1;
}
.expe-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.expe-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.25;
}
.expe-sub {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
}
.expe-go {
  flex: none;
  font-size: 22px;
  line-height: 1;
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
  width: 100%;
  text-align: left;
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 4px;
  padding: 4px 0;
  line-height: 1.3;
}
.mboss-set b {
  color: var(--accent);
}
.mboss.locked .mboss-set {
  opacity: 0.7;
}
.mboss-badge {
  font-size: 13px;
  margin-left: 4px;
}
.mboss-fight {
  padding: 11px;
  font-size: 14px;
}
/* Bouton d'un boss verrouillé PAR L'AUTEL : actionnable (emmène le construire). */
.lock-go {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  color: var(--accent);
  cursor: pointer;
}
.lock-go:active {
  transform: scale(0.98);
}
/* Bandeau « où aller » en tête de l'onglet Boss quand l'Autel manque. */
.boss-gate-cta {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  margin: 2px 0 10px;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--text);
  cursor: pointer;
}
.boss-gate-cta:active {
  transform: scale(0.99);
}
.boss-gate-cta .bg-emo {
  font-size: 22px;
  line-height: 1;
  flex: none;
}
.boss-gate-cta .bg-txt {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.35;
}
.boss-gate-cta .bg-go {
  flex: none;
  align-self: center;
  font-weight: 800;
  font-size: 11.5px;
  color: var(--accent);
  white-space: nowrap;
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
  /* HAUTEUR FIXE (82vh) → la carte ne change PAS de taille selon le butin (0 ou 5 objets) :
     la ligne d'actions en bas (Réattaquer / suivant) reste TOUJOURS à la même position, on
     peut la spammer sans qu'elle bouge (ticket bc329a0b). Le corps (rm-body) scrolle si besoin.
     `rm-compact` (choix de récompense de boss) repasse en auto. */
  height: 82vh;
  max-height: 82vh;
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
/* Choix de récompense de boss : pas de butin à afficher → modale AJUSTÉE au contenu
   (plus la hauteur fixe 82vh) et centrée (position="standard"). */
.report-modal.rm-compact {
  height: auto;
  max-height: 82vh;
}
.report-modal > .rm-head,
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
}
/* Boutons ICÔNE seuls (Inventaire, Fermer) : carrés, ne s'étirent pas. */
.rm-btn.rm-icon {
  flex: none;
  width: 46px;
  font-size: 18px;
  line-height: 1;
}
.rm-btn:active {
  transform: scale(0.96);
}
/* Réattaquer = action principale : prend la largeur, icône + coût énergie. */
.rm-btn-primary {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
/* Combat suivant = action secondaire à droite de Réattaquer (contour discret). */
.rm-btn-next {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  color: color-mix(in srgb, var(--accent) 80%, var(--text));
}
.rm-ic {
  font-size: 18px;
  line-height: 1;
}
.rm-cost {
  font-family: var(--font-display);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.rm-btn:disabled {
  opacity: 0.4;
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
/* Gains en pastilles colorées (or / poussière / 🔮 / 💎), empilables sur petit écran. */
.result-gains {
  display: flex;
  flex-wrap: wrap;
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
.gain-pill.summon {
  color: #ffd23f;
  background: color-mix(in srgb, #ffd23f 16%, transparent);
  border: 1px solid #ffd23f;
}
.gain-pill.stones {
  color: #5fd0e0;
  background: color-mix(in srgb, #5fd0e0 16%, transparent);
  border: 1px solid #5fd0e0;
}
.gain-pill.parch {
  color: #d8b46a;
  background: color-mix(in srgb, #d8b46a 16%, transparent);
  border: 1px solid #d8b46a;
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
.drops-goto {
  margin-left: 8px;
  padding: 3px 9px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
}
.rm-stock {
  opacity: 0.65;
  font-size: 0.82em;
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
/* Segment entre deux zones : noir (vers une zone verrouillée) ou bleu (les deux
   zones accessibles, trait plein de bout en bout). */
.wm-seg {
  fill: none;
  stroke: var(--line);
  stroke-width: 5;
  stroke-linecap: round;
}
.wm-seg.open {
  stroke: #4a9eff;
  filter: drop-shadow(0 0 4px rgba(74, 158, 255, 0.55));
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
.map-toggle {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.map-toggle:hover {
  border-color: var(--primary);
}
.rd-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rd-back {
  flex: none;
  padding: 4px 10px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.rd-back:active {
  transform: scale(0.96);
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
.setj-voie {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
}
.setj-voie.mine {
  color: var(--accent);
  font-weight: 600;
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
.salv-cancel {
  flex: 1;
  border-radius: 12px;
  padding: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
}
.salv-cancel:active {
  transform: scale(0.97);
}
/* Rang = liseré gauche de la carte (règle générique .r-* via var(--rk)) */
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
/* couleur de rang gérée par la règle générique .r-* (var(--rk)) */
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
  grid-template-columns: 1fr 1fr;
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
