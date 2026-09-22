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
          <!-- ⚠️ Le pseudo ne se modifie plus (v0.847, trigger en base migr. 0066) : plus de
               crayon de renommage.
               ⚠️ La boîte vit avec les ACTIONS, pas avec les ressources : elle
               était dans le même groupe que le plateau, donc AJOUTER une devise la
               déplaçait. Ici, aucune puce ne peut plus la bouger. -->
          <button class="inbox-btn" aria-label="Messages" @click="openInbox">
            📬<span v-if="unreadMessages" class="inbox-dot">{{ unreadMessages }}</span>
          </button>
          <!-- 📖 Codex (bestiaire, champions, sets) : une icône à côté de la boîte, même
               forme — c'est une consultation, comme les messages, pas une action de jeu. -->
          <button
            class="inbox-btn"
            aria-label="Codex"
            :title="`Codex · ${codexSum.championsFound}/${codexSum.championsTotal} champions · ${codexSum.monstersFound}/${codexSum.monstersTotal} monstres · ${codexSum.setsComplete}/${codexSum.setsTotal} sets`"
            @click="codexOpen = true"
          >
            📖
          </button>
        </div>
        <!-- ⚡ et 💠 sur la ligne du pseudo, tout à droite : ce sont les deux devises
             qu'on consulte le plus (jouer, invoquer). Le reste du plateau passe dessous. -->
        <div class="tb-tray tb-main">
          <span
            class="tb-r energy clickable"
            :class="{ deficit: c.energy < 0 }"
            role="button"
            tabindex="0"
            :title="`Énergie : ${c.energy.toLocaleString('fr-FR')} — appuie pour voir l'historique des 3 derniers jours (gagnée en faisant du sport)`"
            @click="energyHistOpen = true"
            @keyup.enter="energyHistOpen = true"
            ><span class="tb-ico">⚡</span>{{ compactNumber(c.energy) }}</span
          >
          <!-- Les pierres de mana sont la monnaie du GACHA : elles décident si l'on peut invoquer. -->
          <span
            class="tb-r mana"
            :title="`Pierres de mana : ${char.row.mana.toLocaleString('fr-FR')} — invoquer un champion (failles refermées, mines de mana)`"
            ><span class="tb-ico">💠</span>{{ compactNumber(char.row.mana) }}</span
          >
        </div>
        <div class="tb-right">
          <!-- Plateau des autres ressources. Une seule bordure = groupe lisible au lieu de
               puces éparses. Chaque ressource a une infobulle expliquant ce qu'elle fait monter. -->
          <div class="tb-tray">
            <!-- Boutique retirée pour le moment (ticket dc7c746d) : la puce or est un simple indicateur. -->
            <span
              class="tb-r gold"
              :title="`Or : ${char.row.gold.toLocaleString('fr-FR')} — expéditions et construction des bâtiments`"
              ><span class="tb-ico">🪙</span>{{ compactNumber(char.row.gold) }}</span
            >
            <span
              class="tb-r summon"
              :title="`Pierres d’invocation : ${char.row.summon_stones.toLocaleString('fr-FR')} — tenter un boss de palier (gagnées en nettoyant des donjons)`"
              ><span class="tb-ico">🔮</span>{{ compactNumber(char.row.summon_stones) }}</span
            >
            <!-- ⚠️ Les CLÉS 🗝️ manquaient au plateau alors qu'elles gardent le
                 Labyrinthe — seule source de familiers — et qu'elles se gagnent sur
                 plusieurs écrans (archives, coffres, boss). Une devise qu'on dépense
                 sans jamais voir sa réserve force à aller la chercher ailleurs. -->
            <span
              class="tb-r keys"
              :title="`Clés : ${char.row.keys.toLocaleString('fr-FR')} — entrer dans le Labyrinthe (archives de la carte, coffres, boss)`"
              ><span class="tb-ico">🗝️</span>{{ compactNumber(char.row.keys) }}</span
            >
            <!-- 🔱 SCEAUX D'ASCENSION (v0.1018) : champions (failles) et objets (boss). Ils ne
                 servent qu'à LEUR rang, d'où le détail par rang dans l'infobulle.
                 ⚠️ TOUJOURS affichés, même à zéro : une devise qui n'apparaît qu'une fois
                 obtenue ne dit ni qu'elle existe, ni qu'on peut aller la chercher. -->
            <span
              class="tb-r seals"
              :title="`Sceaux de champion — ascension d’un champion (gardiens de faille) : ${sealsChamp.detail || 'aucun pour l’instant'}`"
              ><span class="tb-ico">🔱</span>{{ compactNumber(sealsChamp.total) }}</span
            >
            <span
              class="tb-r seals seals-gear"
              :title="`Sceaux d’objet — ascension d’un objet de champion (repaires de la carte) : ${sealsGear.detail || 'aucun pour l’instant'}`"
              ><span class="tb-ico">⚜️</span>{{ compactNumber(sealsGear.total) }}</span
            >
            <!-- 🎟️ Tickets d'invocation, gagnés au SPORT (v0.992). Affichés même à zéro,
                 comme toutes les devises du plateau. -->
            <span
              class="tb-r tickets"
              title="Tickets d'invocation — gagnés au sport (Défi 360, boss entre amis, niveau)"
              ><span class="tb-ico">🎟️</span>{{ compactNumber(char.row.gacha_tickets) }}</span
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
            🔥 {{ loginPreview.streak }} j de suite · gagne <b>+{{ loginPreview.energy }} ⚡</b> et
            <b>+{{ freeMana }} 💠</b>
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
            <b>set</b> (bonus à 2/4/6 pièces).
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
        <button class="seg-b" :class="{ on: tab === 'base' }" @click="tab = 'base'">
          <q-icon name="shield" size="18px" /> Base
          <!-- Pastille d'alerte : une armée en route, des corps à fouiller ou une
               production gelée doivent se voir SANS ouvrir l'onglet. -->
          <span v-if="baseAlert" class="seg-dot" :class="{ warn: !!baseRaid }" />
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

              <!-- Toucher le perso ouvre ses stats de combat ; le familier et le talent
                   (`.hotspot`) gardent leur propre clic. -->
              <div
                class="pt-frame clickable"
                role="button"
                tabindex="0"
                :title="`${rank.name} ${rank.star}/5 — stats de combat`"
                @click="onFrameClick"
                @keydown.enter="combatOpen = true"
              >
                <AventureAvatar
                  class="pt-avatar"
                  :profile="c.profile"
                  :equipped="char.row.equipped"
                  :voie="char.row.voie"
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
              <button
                type="button"
                class="pt-mini corner br pow"
                :title="`Puissance ${fmtPow(combatPowerVal)} — stats de combat`"
                @click="combatOpen = true"
              >
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
              </button>
            </div>
            <!-- Le nom du rang n'est plus répété sous le portrait : le coin haut-droit (★) le
                 porte déjà et ouvre la liste des rangs. -->
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

        <!-- Stats de combat : modale ouverte en touchant le perso ou sa puissance. -->
        <q-dialog v-model="combatOpen" position="bottom">
          <q-card class="adv-modal">
            <button
              class="adv-modal-x"
              aria-label="Fermer"
              type="button"
              @click="combatOpen = false"
            >
              ✕
            </button>
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
              <!-- Barrière de départ : la VRAIE part des PV (après rendement décroissant), et
                   son équivalent en PV — la note « +X % » de l'objet n'est pas cette part. -->
              <div class="gfx">
                <span class="gfx-l">🔰 Barrière de départ</span>
                <span class="gfx-v"
                  >{{ pctA(baseFighter.startShield) }} <i>→</i>
                  <b>{{ pctA(fighter.startShield) }}</b>
                  <template v-if="shieldPv > 0"> ({{ shieldPv }} PV)</template></span
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
            <div class="gear-fx-note">
              🔰 <b>Barrière de départ</b> : au début de chaque combat, une réserve de PV en plus
              qui encaisse les coups avant tes PV, puis disparaît. La note « +X % » d'un objet
              passe par un rendement décroissant (plafond 60 %) : c'est la ligne ci-dessus qui
              compte.
            </div>
          </q-card>
        </q-dialog>

        <!-- Sélecteur de VOIE (ouvert depuis le cercle 🧭 en haut-gauche du carré) -->
        <q-dialog v-model="voieOpen" position="bottom">
          <q-card class="adv-modal">
            <button class="adv-modal-x" aria-label="Fermer" @click="voieOpen = false">✕</button>
            <div class="sec-title">🧭 Choisis ta voie</div>
            <div class="sec-hint">
              Ta voie ajoute un <b>petit passif</b> et débloque le <b>capstone (6 pièces)</b> du set
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
              Les talents <b>droppent à un grade</b> (rang + qualité) fixé au drop. Tu en équipes
              <b>un seul</b>, dès le niveau {{ TALENT_SLOT_LEVEL }} (change quand tu veux) ; vends
              les surplus pour de l'or.
            </div>

            <div v-if="!char.row.talents.length" class="talents-empty">
              Aucun talent pour l'instant — vaincs des donjons pour en faire tomber.
            </div>

            <!-- ── LES CASES ────────────────────────────────────────────────────
                 Une case par emplacement, occupée ou vide, comme au chenil. La liste
                 seule obligeait à la parcourir pour savoir ce qu'on portait ; ici
                 l'état se lit d'un coup, et une case libérée reste VISIBLE. -->
            <div v-if="char.row.talents.length" class="tslots">
              <button
                v-for="(t, i) in talentSlotsView"
                :key="i"
                type="button"
                class="tslot"
                :class="t ? 'p-' + t.rarity : 'empty'"
                :title="
                  t
                    ? t.def.name + ' — toucher pour remplacer'
                    : 'Emplacement libre — toucher pour équiper'
                "
                @click="talPick = i"
              >
                <span v-if="t" class="ts-emo">{{ t.def.icon }}</span>
                <span v-else class="ts-plus">＋</span>
              </button>
            </div>

            <!-- ── CE QUE ÇA DONNE ──────────────────────────────────────────────
                 La SOMME des talents équipés. Chaque talent était bien décrit, mais
                 leur total n'apparaissait nulle part — or c'est lui qui entre en combat. -->
            <div v-if="char.row.talents.length" class="tbonus">
              <div class="tb-h">Ce que tes talents équipés apportent</div>
              <div v-if="talentSummary.length" class="tb-list">
                <span v-for="(g, i) in talentSummary" :key="i" class="tb-chip">{{ g }}</span>
              </div>
              <p v-else class="tb-empty">Aucun talent équipé — les cases ci-dessus sont libres.</p>
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
            <!-- Plus de vente des doublons (v0.862) : les aventuriers emploient ce que le
                 héros ne porte pas. Les exemplaires identiques sont RANGÉS ensemble, du
                 meilleur au pire, sous un titre « ×N ». -->
            <div v-if="char.row.talents.length" class="talents-grid">
              <template v-for="t in talentsView" :key="t.id">
                <!-- ⚠️ REPLIÉ PAR DÉFAUT (demande de l'utilisateur) : on voit un TYPE par
                     ligne — son meilleur exemplaire, rang et stat compris — et on déplie
                     pour les autres. Le titre est le bouton. -->
                <button
                  v-if="t.groupStart && t.groupSize > 1"
                  type="button"
                  class="tal-group"
                  :aria-expanded="openGroups.has(t.groupKey)"
                  @click="toggleGroup(t.groupKey)"
                >
                  <span class="mf-chev" :class="{ open: openGroups.has(t.groupKey) }">▸</span>
                  {{ t.def.icon }} {{ t.def.name }} <span class="tg-n">×{{ t.groupSize }}</span>
                  <span class="tg-hint">{{
                    openGroups.has(t.groupKey) ? 'replier' : `+${t.groupSize - 1} autre(s)`
                  }}</span>
                </button>
                <div
                  v-if="groupRowVisible(t, openGroups, t.equipped)"
                  class="tal-card"
                  :class="[
                    'p-' + t.rarity,
                    { eq: t.equipped, reco: recommendedTalentIds.has(t.id) },
                  ]"
                  :style="{ '--rk': rarityRank(t.rarity).color }"
                >
                  <div class="tal-icon">
                    <button
                      class="tal-emo"
                      title="Explication du talent"
                      aria-label="Expliquer ce talent"
                      @click="explainTalent(t)"
                    >
                      {{ t.def.icon }}
                    </button>
                  </div>
                  <div class="tal-body">
                    <div class="tal-name font-display">
                      <span class="tal-nm">{{ t.def.name }}</span>
                      <span v-if="t.equipped" class="tal-eqbadge">✓ Équipé</span>
                      <!-- ⚠️ RANG ET ÉTOILES ENSEMBLE (`gradeLabel`), comme les objets, les
                           trophées et les pièces d'aventurier : le rang seul laissait deux
                           talents du même rang mais de jets opposés se lire pareil, alors que
                           le jet décide d'une part de leur valeur. -->
                      <span
                        class="rk-grade"
                        :style="{ '--rk': rarityRank(t.rarity).color }"
                        :title="'Rang ' + rarityRank(t.rarity).name"
                        >{{ gradeLabel(t) }}</span
                      >
                      <span class="lvl-badge">Nv {{ t.level }}</span>
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
                      <span
                        v-if="talDeltaMap.get(t.id)! > 0 && talReplaceIcon(t.id)"
                        class="repl-ic"
                        title="Remplacerait ce talent"
                        >⟵ {{ talReplaceIcon(t.id) }}</span
                      >
                    </span>
                  </div>
                  <div class="tal-actions">
                    <!-- Équiper : emplacement libre (rien à remplacer). -->
                    <button
                      v-if="!t.equipped && !talReplaceId(t.id) && canEquipMore"
                      class="tal-b"
                      @click="doEquipTalent(t.id)"
                    >
                      Équiper
                    </button>
                    <!-- Remplacer : UNIQUEMENT si le swap AUGMENTE la puissance (sinon rien —
                       inutile de proposer un remplacement qui baisse la puissance). -->
                    <button
                      v-else-if="
                        !t.equipped && talReplaceId(t.id) && (talDeltaMap.get(t.id) ?? 0) > 0
                      "
                      class="tal-b"
                      title="Remplacer le talent indiqué (⟵ sur la pastille)"
                      @click="doSwapTalent(t.id)"
                    >
                      Remplacer
                    </button>
                    <button v-if="t.equipped" class="tal-b" @click="doUnequipTalent(t.id)">
                      Retirer
                    </button>
                    <button v-if="!t.equipped" class="tal-b ghost" @click="doSellTalent(t.id)">
                      🪙 Vendre
                    </button>
                  </div>
                </div>
              </template>
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
            <!-- Plus de vente des doublons (v0.862) : les aventuriers les emploient. Les
                 familiers d'une même race sont RANGÉS ensemble, du meilleur au pire. -->
            <div v-if="allFamiliars.length" class="talents-grid">
              <template v-for="f in allFamiliars" :key="f.id">
                <button
                  v-if="f.groupStart && f.groupSize > 1"
                  type="button"
                  class="tal-group"
                  :aria-expanded="openGroups.has(f.groupKey)"
                  @click="toggleGroup(f.groupKey)"
                >
                  <span class="mf-chev" :class="{ open: openGroups.has(f.groupKey) }">▸</span>
                  {{ famSpeciesLabel(f) }} <span class="tg-n">×{{ f.groupSize }}</span>
                  <span class="tg-hint">{{
                    openGroups.has(f.groupKey) ? 'replier' : `+${f.groupSize - 1} autre(s)`
                  }}</span>
                </button>
                <div
                  v-if="groupRowVisible(f, openGroups, f.equipped)"
                  class="tal-card"
                  :class="[
                    'p-' + f.rarity,
                    { eq: f.equipped, reco: recommendedFamiliarId === f.id },
                  ]"
                  :style="{ '--rk': rarityRank(f.rarity).color }"
                >
                  <ItemIcon :item="f" :size="40" role="img" :aria-label="f.name" />
                  <div class="tal-body">
                    <div class="tal-name font-display">
                      <span class="tal-nm">{{ f.name }}</span>
                      <span v-if="f.equipped" class="tal-eqbadge">✓ Équipé</span>
                      <span
                        class="rk-grade"
                        :style="{ '--rk': rarityRank(f.rarity).color }"
                        :title="'Rang ' + rarityRank(f.rarity).name"
                        >{{ gradeLabel(f) }}</span
                      >
                      <span class="lvl-badge">Nv {{ f.level }}</span>
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
                      title="Céder ce familier contre de l’or"
                      @click="doSellFamiliar(f)"
                    >
                      🪙{{ sellValue(f) }}
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </q-card>
        </q-dialog>

        <template v-if="persoSub === 'perso'">
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
            <!-- ⚠️ Le calcul prend ~3 s sur un gros sac (il essaie toutes les voies).
                 Sans retour immédiat, le clic paraît sans effet et on reclique. -->
            <button
              class="gi-b"
              :class="{ working: optimizing }"
              :disabled="optimizing"
              title="Équipement conseillé — équipe automatiquement la meilleure combinaison de ton stuff (sets inclus)"
              @click="doOptimizeGear()"
            >
              {{ optimizing ? '⏳' : '🪄' }}
            </button>
            <button class="gi-b" title="Sac — ton butin" @click="openBag()">
              🎒<span v-if="bagCount" class="gi-badge">{{ bagCount }}</span>
            </button>
            <!-- 🏆 Sac à trophées : à part du butin (ils ne tombent que du boss entre amis,
                 et « Tout vendre » ne doit jamais les fondre). Visible dès qu'on en a un. -->
            <button
              v-if="ownsTrophy"
              class="gi-b"
              title="Trophées — tes trophées de boss entre amis"
              @click="openTrophyBag()"
            >
              🏆<span v-if="trophyBag.length" class="gi-badge">{{ trophyBag.length }}</span>
            </button>
            <button
              class="gi-b"
              :title="
                onExpedition
                  ? '🧭 Indisponible en expédition'
                  : 'Loadouts — ranger un set d\'équipement'
              "
              @click="loadoutOpen = true"
            >
              📦<span
                v-if="setUpgradeCount"
                class="gi-badge"
                :aria-label="`${setUpgradeCount} set(s) en stock augmentent ta puissance`"
                >{{ setUpgradeCount }}</span
              >
            </button>
          </div>
        </div>
        <div class="sec-hint">
          Ton stuff équipé. Ton butin est dans le <b>🎒 Sac</b> (icône en haut à droite).
        </div>
        <div v-if="equippedSet" class="equipped-set-banner">
          🧭 Set <b>{{ equippedSet.emoji }} {{ equippedSet.name }}</b> en cours ·
          {{ equippedSet.count }}/{{ SET_SIZE }} pièces
        </div>
        <!-- UNE PIÈCE PAR LIGNE : icône à gauche, nom entier + toutes les stats au milieu,
             « Retirer » et le badge 🎒 dans une colonne fixe à droite. La grille 2×2 coupait
             le nom dès ~16 caractères et masquait la 3ᵉ stat d'un objet Épique+. -->
        <div class="gear">
          <div
            v-for="slot in SLOTS"
            :key="slot"
            class="slot"
            :class="[
              char.row.equipped[slot] ? 'r-' + char.row.equipped[slot]!.rarity : 'empty',
              { clickable: !!char.row.equipped[slot] },
            ]"
            :role="char.row.equipped[slot] ? 'button' : undefined"
            :title="char.row.equipped[slot] ? 'Voir le détail' : undefined"
            @click="char.row.equipped[slot] && (inspectItem = char.row.equipped[slot]!)"
          >
            <div class="slot-ico">
              <!-- Tuile NEUTRE : le rang se lit déjà sur la barre et la pastille de la ligne. -->
              <ItemIcon
                v-if="char.row.equipped[slot]"
                :item="char.row.equipped[slot]!"
                :size="44"
                plain
              />
              <span v-else class="slot-emo">{{ SLOT_EMOJI[slot] }}</span>
            </div>
            <div class="slot-main">
              <div class="slot-head">
                <span class="slot-lbl">{{ SLOT_LABEL[slot] }}</span>
                <span
                  v-if="char.row.equipped[slot]?.setId"
                  class="slot-set-corner"
                  :title="'Pièce de set — ' + setVoieName(char.row.equipped[slot]?.setId ?? '')"
                  >🧩</span
                >
              </div>
              <template v-if="char.row.equipped[slot]">
                <div class="slot-name">{{ char.row.equipped[slot]!.name }}</div>
                <div class="pills">
                  <span class="gpill" :class="'p-' + char.row.equipped[slot]!.rarity">{{
                    gradeLabel(char.row.equipped[slot]!)
                  }}</span>
                  <span class="lvl-badge">Nv {{ char.row.equipped[slot]!.level }}</span>
                </div>
                <div class="slot-eff">
                  <span
                    v-for="(p, si) in itemStatRows(char.row.equipped[slot]!)"
                    :key="si"
                    class="stat-line"
                    >{{ p.pre }}<b v-if="p.value" class="st-v">{{ p.value }}</b
                    >{{ p.post }}</span
                  >
                </div>
              </template>
              <div v-else class="slot-vide">
                Emplacement vide<template v-if="bagCountForSlot(slot) > 0">
                  · <b>{{ bagCountForSlot(slot) }} au sac</b></template
                >
              </div>
            </div>
            <div v-if="char.row.equipped[slot]" class="slot-actions">
              <button class="slot-remove" @click.stop="doUnequip(slot)">Retirer</button>
              <!-- Badge : nb d'objets du SAC (même slot) au potentiel supérieur. Tap →
                     filtre le sac dessus. Cercle avec le 🎒 en fond. -->
              <button
                v-if="betterInBagCount(slot) > 0"
                class="slot-better"
                :title="
                  betterInBagCount(slot) +
                  ' objet(s) du sac meilleur(s) que CELUI-CI, sur ton build actuel. ' +
                  '🪄 L’équipement conseillé compare autre chose : le meilleur build POSSIBLE — ' +
                  'un objet peut donc battre ta pièce actuelle sans figurer dans le build optimal.'
                "
                @click.stop="showBetterForSlot(slot)"
              >
                <span class="sb-n">{{ betterInBagCount(slot) }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 🏆 VITRINE DU TROPHÉE : pas une 5ᵉ tuile de la grille — un trophée se MONTRE.
             Il ne tombe que du boss entre amis, donc on ne l'affiche qu'une fois possédé. -->
        <div
          v-if="ownsTrophy"
          class="trophy-case"
          :class="equippedTrophy ? 'r-' + equippedTrophy.rarity : 'empty'"
        >
          <div class="tc-plinth">
            <div class="tc-glow" aria-hidden="true"></div>
            <ItemIcon v-if="equippedTrophy" :item="equippedTrophy" :size="54" />
            <span v-else class="tc-emo">🏆</span>
          </div>
          <div class="tc-body">
            <div class="tc-kicker">{{ equippedTrophy ? 'Trophée exposé' : 'Vitrine' }}</div>
            <template v-if="equippedTrophy">
              <button
                class="tc-name font-display"
                title="Voir le détail"
                @click="inspectItem = equippedTrophy"
              >
                {{ equippedTrophy.name }}
              </button>
              <div class="pills">
                <span class="gpill" :class="'p-' + equippedTrophy.rarity">{{
                  gradeLabel(equippedTrophy)
                }}</span>
                <span class="lvl-badge">Nv {{ equippedTrophy.level }}</span>
              </div>
              <div class="tc-stats">
                <div v-for="(ln, si) in itemStatLines(equippedTrophy)" :key="si" class="stat-line">
                  {{ ln }}
                </div>
              </div>
            </template>
            <div v-else class="tc-empty">
              Socle vide — {{ trophyBag.length }} trophée{{ trophyBag.length > 1 ? 's' : '' }}
              dans ton sac à trophées.
            </div>
            <div class="tc-actions">
              <button class="tc-b" @click="openTrophyBag()">
                🏆 {{ equippedTrophy ? 'Changer' : 'Exposer un trophée' }}
              </button>
              <button v-if="equippedTrophy" class="tc-b ghost" @click="doUnequip(TROPHY_SLOT)">
                Retirer
              </button>
            </div>
          </div>
        </div>

        <!-- Sets d'équipement (bonus 2/4/6 pièces) — rattachés à l'équipement -->
        <template v-if="activeSets.length">
          <div class="sec-title">Sets</div>
          <div
            v-for="s in activeSets"
            :key="s.id"
            class="setcard"
            :class="{ full: s.count >= SET_SIZE && s.mine }"
          >
            <div class="set-top">
              <span class="set-name">{{ s.emoji }} {{ s.name }}</span>
              <span v-if="s.mine" class="set-mine">🧭 ta voie</span>
              <span class="set-count font-display">{{ s.count }}/{{ SET_SIZE }}</span>
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
              <!-- ⭐ SIGNATURE (v0.835) : l'effet de combat unique du set complet dans sa voie. -->
              <span
                v-if="s.signature"
                class="set-tier set-sig"
                :class="{
                  on: s.count >= SET_SIZE && s.mine,
                  locked: s.count >= SET_SIZE && !s.mine,
                }"
              >
                ⭐ {{ s.signature.emoji }} <b>{{ s.signature.name }}</b> — {{ s.signature.desc }}
                <template v-if="s.count >= SET_SIZE && !s.mine"> 🔒 voie</template>
              </span>
            </div>
          </div>
        </template>

        <!-- TOTAL de l'équipement porté (objets + familier + trophée + bonus de set) : la
             somme que le combat applique, via `aggregateEffects` — jamais recalculée ici. -->
        <template v-if="gearTotal.length">
          <div class="sec-title">Total de l'équipement</div>
          <div class="gear-total">
            <div class="gt-sub">Objets, familier, trophée et bonus de set réunis</div>
            <div class="tb-list">
              <span v-for="(g, i) in gearTotal" :key="i" class="tb-chip">{{ g }}</span>
            </div>
          </div>
        </template>

        <!-- Sac : MODALE ouverte par l'icône 🎒 en haut à droite (plus d'inline). -->
        <div v-if="bagOpen" class="shop-backdrop" @click.self="bagOpen = false">
          <div class="shop-card bag-card">
            <div class="shop-head">
              <div class="shop-title font-display">
                <template v-if="bagMode === 'trophies'"
                  >🏆 Trophées ({{ trophyBag.length }})</template
                >
                <template v-else>🎒 Sac ({{ bagCount }})</template>
              </div>
              <button class="shop-x" aria-label="Fermer" @click="bagOpen = false">✕</button>
            </div>
            <!-- ⚠️ Le classement du sac demande le MEILLEUR BUILD, soit ~3 s. Il rend la
                 main entre chaque voie, donc l’écran reste vivant — encore faut-il DIRE
                 qu’il travaille, sinon on croit à un gel (constaté). -->
            <div v-if="optimizing" class="bag-ranking">
              ⏳ Classement en cours — je compare ton sac à ton meilleur build possible…
            </div>
            <template v-if="bagMode === 'trophies' ? trophyBag.length : bagCount">
              <!-- Bannière du filtre « mieux au sac » (posé via le badge d'un item équipé). -->
              <div v-if="betterFilterSlot && bagMode === 'items'" class="better-banner">
                🔼 Meilleurs si équipés pour <b>{{ SLOT_LABEL[betterFilterSlot] }}</b>
                <button class="bb-clear" @click="setInvFilter('all')">Tout voir ✕</button>
              </div>
              <!-- Filtre par type d'objet -->
              <div v-if="bagMode === 'items'" class="inv-filter">
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
              <!-- Casse/vente en masse : objets qui n'améliorent pas ta puissance (pas
               ⚠️ TOUT, sans condition de puissance (décision de l'utilisateur) : décider
               quoi jeter demandait un calcul de 3 s et ralentissait l'ouverture du Sac. Le
               tri se fait au 🔒. Épargnés : familiers, porté, et les pièces que le 🪄
               retient si l'optimum est déjà connu. Respecte le filtre type. -->
              <div v-if="bagMode === 'items' && belowCount > 0" class="bulk">
                <span class="bulk-lbl"
                  >{{ belowCount }} objet{{ belowCount > 1 ? 's' : '' }} à vendre
                  <span class="bulk-note"
                    >(tout, sauf 🔒 · familiers · porté · retenus par le 🪄)</span
                  ></span
                >
                <!-- ⚠️ Les deux boutons annoncent le GAIN, jamais le compte : le nombre
                     d'objets est déjà dit juste au-dessus, et c'est le montant qui
                     TRANCHE (or ou métal ?). Un bouton qui comptait les objets et
                     l'autre la ferraille laissait croire à deux barèmes différents. -->
                <div class="bulk-btns">
                  <button v-if="belowGold > 0" class="bulk-b" @click="doSellBelow">
                    🪙 Tout vendre (+{{ fmtPow(belowGold) }})
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
                      @click="helpRank = true"
                      >{{ gradeLabel(it) }}</span
                    >
                    <!-- Jet porté par l'icône (badge bas) + les lignes de comparaison ci-dessous ;
                         plus de badge de qualité redondant à côté du rang (ticket UI). -->
                    <span class="ii-dot">·</span> {{ SLOT_LABEL[it.slot] }}
                    <span class="lvl-badge">Nv {{ it.level }}</span>
                    <span v-if="it.setId" class="gpill set">🧩 Set</span>
                  </div>
                  <!-- Comparaison : cet objet vs l'équipé — en-tête (rang/niv/jet) puis stats
                       une par ligne dessous (ticket lisibilité). -->
                  <div class="ii-compare">
                    <div class="cmp-item this">
                      <div class="cmp-head">
                        <span class="cmp-lbl">Cet objet</span>
                        <span class="ii-rar" :class="'p-' + it.rarity">{{ gradeLabel(it) }}</span>
                        <span class="lvl-badge">Nv {{ it.level }}</span>
                      </div>
                      <div class="cmp-stats">
                        <div
                          v-for="(s, li) in itemStatCmp(it, equippedInSlot(it.slot))"
                          :key="li"
                          class="stat-line"
                          :class="s.cls"
                        >
                          {{ s.text }}
                        </div>
                      </div>
                    </div>
                    <div class="cmp-item eq">
                      <div class="cmp-head">
                        <span class="cmp-lbl">Équipé</span>
                        <template v-if="equippedInSlot(it.slot)">
                          <span class="ii-rar" :class="'p-' + equippedInSlot(it.slot)!.rarity">{{
                            gradeLabel(equippedInSlot(it.slot)!)
                          }}</span>
                          <span class="lvl-badge">Nv {{ equippedInSlot(it.slot)!.level }}</span>
                        </template>
                        <span v-else class="cmp-free">— emplacement libre</span>
                      </div>
                      <div v-if="equippedInSlot(it.slot)" class="cmp-stats">
                        <div
                          v-for="(s, li) in itemStatCmp(equippedInSlot(it.slot)!, it)"
                          :key="li"
                          class="stat-line eq"
                          :class="s.cls"
                        >
                          {{ s.text }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- PUISSANCE si équipé (rang + qualité) vs l'objet équipé du même slot. -->
                  <div class="ii-cmp2">
                    <span class="ii-cmp2-ic">⚔️</span>
                    <span
                      class="ii-cmp2-chip"
                      :class="powerIfEquip(it) >= refPower ? 'up' : 'down'"
                    >
                      <b>{{ fmtDelta(refPower, powerIfEquip(it)) }}</b
                      ><i>{{
                        inOptimum(it) ? 'retenu par ton meilleur build' : 'vs ton meilleur build'
                      }}</i>
                    </span>
                  </div>
                  <!-- 🎯 Les chances RÉELLES si on la porte (pas la note brute de l'objet). -->
                  <div v-if="chanceLinesFor(it).length" class="ii-chances">
                    🎯 si portée : {{ chanceLinesFor(it).join(' · ') }}
                  </div>
                  <!-- Actions : Équiper · icônes vendre/lock -->
                  <div class="ii-actions">
                    <button class="equip-btn" @click="doEquip(it.id)">
                      {{ equippedInSlot(it.slot) ? 'Remplacer' : 'Équiper' }}
                    </button>
                    <!-- 🪙 LA VENTE REVIENT (v0.890) : le recyclage en ferraille en donnait
                         bien trop. -->
                    <button
                      v-if="canSell(it)"
                      class="ii-ic"
                      :disabled="it.locked"
                      :title="'Vendre (' + sellValue(it) + ' 🪙)'"
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
                  </div>
                </div>
              </div>
            </template>
            <div v-else-if="bagMode === 'trophies'" class="empty-inv">
              Aucun trophée en réserve — ton trophée est exposé. Abats un boss entre amis pour en
              gagner d’autres 🐉
            </div>
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
        <!-- Arène : mode DIRECT (on lance, on regarde les vagues). Complète l'arène
             idle de la carte, qui ne rend qu'un nombre sans rien à voir.
             MASQUÉE pour l'instant (cf. ARENA_ENABLED) — le mini-jeu ne convainc pas
             encore. Tout le code reste en place : repasser le drapeau à true suffit. -->
        <button
          v-if="ARENA_ENABLED"
          class="expe-card arena-card"
          :disabled="c.energy < arenaCost || busy"
          @click="enterArena"
        >
          <span class="expe-emo">⚔️</span>
          <span class="expe-main">
            <span class="expe-name font-display">Arène</span>
            <span class="expe-sub">
              Des monstres surgissent tout autour de toi, vague après vague. Tu tiens jusqu'à la
              mort. Butin tous les {{ ARENA_PLAY.dropEvery }} paliers.
            </span>
          </span>
          <span class="expe-go">{{ arenaCost }} ⚡</span>
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

        <!-- Bandeau de RÉGION : où tu es + ce qui t'attend après (biomes).
             ⚠️ C'est LUI qui plie/déplie la carte des mondes (demande de l'utilisateur) :
             le bloc qui dit « où j'en suis » est aussi celui qu'on touche pour voir le
             reste du monde — plus de titre « Carte des mondes » séparé qui doublonnait. -->
        <div
          class="region-banner"
          :class="{ foldable: !regionView }"
          :style="{ '--rc': curRegion.color }"
          v-bind="foldAttrs"
          @click="foldToggle"
          @keydown.enter.prevent="foldToggle"
          @keydown.space.prevent="foldToggle"
        >
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
          <!-- Le repère du pli vit DANS le bandeau de la région courante (demande de
               l'utilisateur) : il n'a pas de geste propre — c'est le bandeau entier qui
               plie/déplie, un second gestionnaire basculerait deux fois. -->
          <div v-if="!regionView" class="rb-fold">
            <span class="mf-chev" :class="{ open: worldOpen }">▸</span> 🗺️ Carte des mondes
            <span class="mf-hint">{{ worldOpen ? 'replier' : `${REGIONS.length} régions` }}</span>
          </div>
        </div>
        <template v-if="!regionView && worldOpen">
          <div class="sec-hint map-hint">
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
          <div ref="worldmapEl" class="worldmap" :style="{ height: mapGeom.viewH + 'px' }">
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
        </template>

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
        <div v-if="regionView && selectedRegionItems.length" class="dungeons">
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

          <!-- Portail sans fin (end-game infini) — visible sur la dernière région -->
          <div v-if="endlessUnlocked && selRegion.id === endRegionId" class="dgn mboss endless">
            <div class="dgn-hd">
              <span class="dgn-emo">🌀</span>
              <div class="dgn-hd-main">
                <div class="mboss-eyebrow">♾️ End-game · sans fin</div>
                <div class="dgn-name mboss-name font-display">{{ ENDLESS_NAME }}</div>
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
        <button v-if="!hasBossAltar" class="boss-gate-cta" @click="tab = 'base'">
          <span class="bg-emo">🔮</span>
          <span class="bg-txt">
            <b>Les boss sont verrouillés</b> — construis l’<b>Autel des boss</b> dans ton village
            pour les affronter.
          </span>
          <span class="bg-go">Aller à ma base →</span>
        </button>
        <div class="dungeons">
          <div
            v-for="b in visibleBosses"
            :key="b.id"
            class="dgn mboss"
            :class="{ locked: !bossUnlocked(b), beaten: isBossBeaten(b) }"
          >
            <div class="dgn-hd">
              <!-- 🐉 L'illustration du boss (v0.1011) ; verrouillé → sa SILHOUETTE et un
                   cadenas (on voit ce qui attend, pas qui c'est). Emoji en secours. -->
              <span v-if="bestArt(b.name)" class="mboss-art-wrap">
                <img
                  :src="bestArt(b.name)!"
                  :alt="bossUnlocked(b) ? b.name : ''"
                  class="mboss-art"
                  :class="{ shadow: !bossUnlocked(b) }"
                  loading="lazy"
                  draggable="false"
                  @error="bestArtFailed.add(bestArt(b.name)!)"
                />
                <span v-if="!bossUnlocked(b)" class="mboss-lock">🔒</span>
              </span>
              <span v-else class="dgn-emo">{{ bossUnlocked(b) ? b.emoji : '🔒' }}</span>
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
                :class="powClass(b.unlockLevel, true)"
                :title="powTitle(b.unlockLevel, true)"
                >⚔️ {{ fmtPow(recoPow(b.unlockLevel, true)) }}</span
              >
              <!-- 🎯 % de réussite RÉEL (tentatives comptées depuis v0.1061), comme le Labyrinthe. -->
              <span
                v-if="bossUnlocked(b)"
                class="dgn-chip succ"
                :class="bossSuccess(b) === null ? 'none' : successTier(bossSuccess(b)!)"
                title="Tes victoires sur ce boss, parmi tes tentatives"
                >🎯
                {{
                  bossSuccess(b) === null
                    ? 'jamais tenté'
                    : `${bossSuccess(b)} % réussis (${bossRuns(b)} essai${bossRuns(b) > 1 ? 's' : ''})`
                }}</span
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
            <!-- ⚠️ Rien ne doit s'intercaler entre le bouton ci-dessus et les deux v-else
                 qui suivent : un élément glissé ici devenait la tête de la chaîne, et un
                 boss DÉBLOQUÉ affichait en plus le bouton grisé « 🔒 ». -->
            <!-- Verrouillé par l'Autel manquant → bouton qui EMMÈNE le construire. -->
            <button
              v-else-if="!hasBossAltar"
              class="fight mboss-fight lock-go"
              @click="tab = 'base'"
            >
              🔮 Construire l’Autel →
            </button>
            <!-- Verrouillé par la chaîne → on dit quel boss battre d'abord (juste au-dessus). -->
            <button v-else class="fight mboss-fight" disabled>🔒 {{ bossLockReason(b) }}</button>
            <!-- Pas assez de pierres → on dit d'où elles viennent (nettoyage de donjon). -->
            <div
              v-if="bossUnlocked(b) && (char.row?.summon_stones ?? 0) < summonCostFor(b)"
              class="dgn-hint summon-hint"
            >
              🔮 Nettoie des donjons pour gagner des pierres d'invocation ↓
            </div>
          </div>
        </div>
      </template>

      <!-- ONGLET BASE — l'enceinte, le village et les sièges. La page vit ici en
           `in-tab` : elle n'affiche pas son propre en-tête, la barre de navigation
           de l'Aventure suffit. -->
      <template v-else-if="tab === 'base'">
        <!-- ⚠️ `hero` est PASSÉ, jamais recalculé côté Base : c'est le même combattant
             que celui qui défend réellement (cf. `ctx.hero` du tick). Deux calculs
             divergeraient au premier réglage d'équipement. -->
        <BasePage
          in-tab
          :embedded="embedded"
          :siege="siegeReport"
          :hero="fighter"
          :hero-profile="c.profile"
          @siege-seen="onSiegeSeen"
        />
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
                <span class="rarity">{{ gradeLabel(replaceTarget) }}</span>
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
                <span class="rarity">{{ gradeLabel(equippedInSlot(replaceTarget.slot)!) }}</span>
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
                >+{{ fmtPow(sellValue(equippedInSlot(replaceTarget.slot)!)) }} or</small
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
          <div class="lb-streak">
            +{{ levelBurst.energy }} ⚡ de bonus<template v-if="levelBurst.tickets">
              · +{{ levelBurst.tickets }} 🎟️ ticket{{
                levelBurst.tickets > 1 ? 's' : ''
              }}
              d'invocation</template
            >
          </div>
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
          <!-- 💠 LE TIRAGE OFFERT : il était versé en SILENCE, et 110 pierres de mana
               qui arrivent sans un mot ne se lisent pas comme un cadeau. -->
          <div v-if="loginBurst.mana" class="lb-mana">
            🎰 +{{ loginBurst.mana }} 💠 — de quoi invoquer un champion
          </div>
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
                <span class="im-emo">{{ m.chest ? '🎁' : m.win ? '🏆' : '💀' }}</span>
                <span class="im-title">
                  {{ messageTitle(m) }}<template v-if="!m.chest"> · niv {{ m.level }}</template>
                </span>
              </div>
              <div class="im-text">{{ m.text }}</div>
              <div class="im-haul">
                <span v-for="p in haulPills(m)" :key="p.emoji">{{ p.emoji }} +{{ p.n }}</span>
              </div>
              <!-- ⚔️ Rapport d'un groupe : faction, abattus, XP de chacun, journal. Une
                   INCURSION de faille y propose en plus son rejeu. -->
              <PartyReportView
                v-if="m.party"
                :party="m.party"
                :roster="char.advList"
                @replay="riftReplay = m.party"
              />
              <!-- Butin à ENCAISSER. Tant qu'on n'a pas cliqué, rien n'est crédité : c'est
                   le geste qui donne au retour d'expédition un moment à lui. Un rapport
                   d'avant la récupération manuelle n'a pas de `claimed` → déjà crédité. -->
              <button v-if="isClaimable(m, expeNow)" class="im-claim" @click="doClaimMsg(m)">
                {{ m.chest ? '🎁 Ouvrir le coffre' : '🎁 Récupérer le butin' }}
              </button>
              <div v-else-if="m.claimed === false" class="im-wait">
                🧭 {{ m.party && !m.party.hero ? 'Le groupe est' : 'Le héros est' }} encore sur la
                route — retour dans
                {{ fmtExpeMs((m.claimAt ?? m.resolvedAt) - expeNow) }}
              </div>
              <!-- Objet gagné : détail complet (rareté / niveau / effet). -->
              <div
                v-for="lt in msgLoot(m)"
                :key="'loot-' + lt.item.name"
                class="im-loot"
                :class="'p-' + lt.item.rarity"
              >
                <ItemIcon :item="lt.item" :size="38" />
                <div class="im-loot-main">
                  <div class="im-loot-name">
                    {{ lt.item.name }}<span v-if="lt.item.setId" class="im-loot-set"> 🧩</span>
                  </div>
                  <div class="im-loot-sub">
                    <span :class="'p-' + lt.item.rarity">{{ gradeLabel(lt.item) }}</span> ·
                    {{ SLOT_LABEL[lt.item.slot] }}
                  </div>
                  <div class="im-loot-eff">{{ itemEffects(lt.item) }}</div>
                  <div v-if="lt.more > 0" class="im-loot-more">
                    🎁 +{{ lt.more }} autre{{ lt.more > 1 ? 's' : '' }} objet{{
                      lt.more > 1 ? 's' : ''
                    }}
                    au sac
                  </div>
                </div>
              </div>
              <span v-if="!msgLoot(m).length && m.itemName" class="im-item"
                >🎁 {{ m.itemName }}</span
              >
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
            <!-- 🏅 GALERIE DES CHAMPIONS — en tête, c'est la collection qu'on vient voir. ⚠️ Elle annonce ce qui
                 EXISTE, jamais ce qui est PROBABLE : pas un taux, pas une chance. Les
                 afficher ici court-circuiterait l'écran d'invocation, dont c'est le métier. -->
            <div class="cx-sec-h">
              🏅 Champions
              <span class="cx-count"
                >{{ codexSum.championsFound }}/{{ codexSum.championsTotal }}</span
              >
            </div>
            <ChampionCollection :advs="char.advList" />

            <!-- Bestiaire -->
            <div class="cx-sec-h cx-sec-h2">
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
                <!-- 🐉 L'illustration quand elle existe ; pas encore découvert → sa
                     SILHOUETTE (le teasing du bestiaire, sans révéler couleurs ni détails). -->
                <img
                  v-if="bestArt(m.name)"
                  :src="bestArt(m.name)!"
                  :alt="m.discovered ? m.name : ''"
                  class="best-art"
                  :class="{ shadow: !m.discovered }"
                  loading="lazy"
                  draggable="false"
                  @error="bestArtFailed.add(bestArt(m.name)!)"
                />
                <span v-else class="best-emo">{{ m.discovered ? m.emoji : '❔' }}</span>
                <span class="best-name">{{ m.discovered ? m.name : '???' }}</span>
                <span class="best-tier">Palier {{ m.tier }}</span>
              </div>
            </div>

            <!-- 👑 Boss de palier (v0.1011) — ceux qui donnent les pièces de set. Découvert =
                 VAINCU au moins une fois ; sinon sa silhouette, comme le bestiaire. -->
            <div class="cx-sec-h cx-sec-h2">
              👑 Boss de palier
              <span class="cx-count"
                >{{ bossChain.filter(isBossBeaten).length }}/{{ bossChain.length }}</span
              >
            </div>
            <div class="bestiary-grid">
              <div
                v-for="b in bossChain"
                :key="b.id"
                class="best-tile"
                :class="{ found: isBossBeaten(b) }"
              >
                <img
                  v-if="bestArt(b.name)"
                  :src="bestArt(b.name)!"
                  :alt="isBossBeaten(b) ? b.name : ''"
                  class="best-art"
                  :class="{ shadow: !isBossBeaten(b) }"
                  loading="lazy"
                  draggable="false"
                  @error="bestArtFailed.add(bestArt(b.name)!)"
                />
                <span v-else class="best-emo">{{ isBossBeaten(b) ? b.emoji : '❔' }}</span>
                <span class="best-name">{{ isBossBeaten(b) ? b.name : '???' }}</span>
                <span class="best-tier">Niv {{ b.unlockLevel }}</span>
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
                      >🧭 Ta voie — complète-le ({{ SET_SIZE }}/{{ SET_SIZE }}) pour ta
                      signature</template
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
          <div class="shop-title font-display">🧩 Mes sets</div>
          <button
            v-if="allSparesGold"
            class="lo-mini lo-all-spares"
            :disabled="busy"
            title="Vendre les doublons de tous les sets — les sets ne bougent pas"
            @click="doSellSpares()"
          >
            🗂️ Tous les doublons ({{ fmtPow(allSparesGold) }} 🪙)
          </button>
          <button class="shop-x" aria-label="Fermer" @click="loadoutOpen = false">✕</button>
        </div>
        <div class="sec-hint">
          Un set par <b>voie</b> — les pièces des boss se rangent ici, pièce par pièce.
          <b>Porter</b> un set = passer à sa voie et équiper au mieux (les emplacements manquants
          sont complétés par tes meilleurs objets du sac). Le <b>familier reste</b>.
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
                <template v-else>Set {{ i + 1 }}</template>
                <span
                  class="lo-count"
                  :class="{ full: voieOwnedCount(i) >= SET_SIZE }"
                  title="Pièces POSSÉDÉES pour cette voie (portées, en réserve ou au sac). Seules les pièces PORTÉES donnent le bonus."
                  >{{ voieOwnedCount(i) }}/{{ SET_SIZE }}</span
                >
                <span v-if="equippedSet?.idx === i" class="lo-active">✓ en cours</span>
              </span>
              <span
                v-if="lo.count"
                class="lo-power"
                :class="lo.delta >= 0 ? 'up' : 'down'"
                title="Puissance APRÈS « Porter ce set » : SES pièces imposées, les emplacements restants complétés au mieux, sur sa voie."
              >
                ⚔️ {{ fmtPow(lo.power) }} <b>({{ fmtDelta(combatPowerVal, lo.power) }})</b>
              </span>
              <span v-else class="lo-empty-tag">vide</span>
            </div>
            <div v-if="lo.count" class="lo-items">
              <button
                v-for="e in lo.entries"
                :key="e.item.slot"
                type="button"
                class="lo-item"
                :class="['r-' + e.item.rarity, { worn: e.worn }]"
                :title="
                  SLOT_LABEL[e.item.slot] +
                  ' · ' +
                  e.item.name +
                  (e.worn ? ' — PORTÉE (compte pour le bonus)' : ' — en réserve') +
                  ' · voir les stats'
                "
                @click="inspectItem = e.item"
              >
                {{ SLOT_EMOJI[e.item.slot] }}
                <span v-if="e.worn" class="lo-worn" aria-label="portée">✓</span>
              </button>
            </div>
            <!-- ⚠️ SEULES les pièces PORTÉES donnent le bonus (cf. setEffects). Le dire ici
                 évite le contresens le plus naturel : croire qu'un set « complet » dans la
                 collection est un set actif. -->
            <div v-if="lo.count" class="lo-hint">
              <template v-if="lo.wornCount >= 2">
                <b class="lo-ok">{{ lo.wornCount }} portée{{ lo.wornCount > 1 ? 's' : '' }}</b> —
                bonus actif.
              </template>
              <template v-else-if="lo.wornCount === 1">
                1 seule portée — <b>il en faut 2 du même set</b> pour un bonus.
              </template>
              <template v-else
                >Aucune portée — ce set ne donne aucun bonus pour l’instant.</template
              >
              <template v-if="lo.upgradable">
                <b class="lo-up-note">↑ {{ lo.upgradable }}</b> emplacement(s) où tu portes moins
                bien que ta réserve.
              </template>
              Touche un objet pour ses stats.
            </div>
            <!-- Porter = passer à cette voie + optimiser (le set + les meilleurs objets du sac).
                 Grisé si on ne possède aucune pièce de cette voie. -->
            <button
              class="lo-btn"
              :disabled="voieOwnedCount(i) === 0 || busy || setFullyWorn(i)"
              @click="doWearVoieSet(i)"
            >
              {{
                setFullyWorn(i)
                  ? '✓ Set porté'
                  : equippedSet?.idx === i
                    ? '⬆️ Compléter ce set'
                    : '⬆️ Porter ce set'
              }}
            </button>
            <!-- 🗂️ DOUBLONS (v0.839) : les pièces de ce set battues à leur emplacement. Elles
                 restent ici au lieu de partir à la forge ; toucher un doublon le met dans
                 le set à la place de la pièce en place. -->
            <div v-if="lo.spares.length" class="lo-spares">
              <span class="lo-spares-lab"
                >🗂️ {{ lo.spares.length }} doublon{{ lo.spares.length > 1 ? 's' : '' }}</span
              >
              <button
                v-for="sp in lo.spares"
                :key="sp.id"
                type="button"
                class="lo-item spare"
                :class="'r-' + sp.rarity"
                :title="
                  SLOT_LABEL[sp.slot] +
                  ' · ' +
                  sp.name +
                  ' — doublon · toucher pour ses stats, l’utiliser ou le vendre'
                "
                @click="inspectItem = sp"
              >
                {{ SLOT_EMOJI[sp.slot] }}<span v-if="sp.locked" class="lo-worn">🔒</span>
              </button>
            </div>
            <div v-if="lo.sparesSold || lo.lot.sold.length" class="lo-actions">
              <button
                v-if="lo.sparesSold"
                class="lo-mini"
                :disabled="busy"
                :title="
                  'Vendre les doublons de ce set (' + lo.sparesGold + ' 🪙) — le set ne bouge pas'
                "
                @click="doSellSpares(i)"
              >
                🗂️ Doublons ({{ fmtPow(lo.sparesGold) }} 🪙)
              </button>
              <button
                v-if="lo.lot.sold.length"
                class="lo-mini sell"
                :disabled="busy"
                :title="'Vendre tout ce set, doublons compris (' + lo.sellGold + ' 🪙)'"
                @click="doSellLoadout(i)"
              >
                🪙 Tout le set ({{ fmtPow(lo.sellGold) }})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Détail d'un objet (clic sur un item équipé) -->
    <q-dialog
      :model-value="!!inspectItem"
      position="bottom"
      @update:model-value="inspectItem = null"
    >
      <q-card v-if="inspectItem" class="insp-card">
        <div class="insp-head">
          <ItemIcon :item="inspectItem" :size="52" />
          <div class="insp-id">
            <div class="insp-name">{{ inspectItem.name }}</div>
            <div class="insp-meta">
              <span class="gpill" :class="'p-' + inspectItem.rarity">{{
                gradeLabel(inspectItem)
              }}</span>
              <span class="insp-slot"
                >· {{ SLOT_LABEL[inspectItem.slot] }} · niv {{ inspectItem.level }}</span
              >
            </div>
          </div>
        </div>
        <div class="insp-affixes">
          <div v-for="(ln, i) in itemAffixLines(inspectItem)" :key="i" class="insp-eff">
            ✦ {{ ln }}
          </div>
        </div>
        <div v-if="legendaryOf(inspectItem)" class="insp-leg">
          <span class="insp-leg-name"
            >{{ legendaryOf(inspectItem)!.emoji }} {{ legendaryOf(inspectItem)!.name }}</span
          >
          <span class="insp-leg-desc">{{ legendaryOf(inspectItem)!.desc }}</span>
        </div>
        <div v-if="chanceLinesFor(inspectItem).length" class="insp-chances">
          🎯
          {{
            char.row?.equipped[inspectItem.slot]?.id === inspectItem.id
              ? 'Ce qu’elle t’apporte'
              : 'Si tu la portes'
          }}
          : {{ chanceLinesFor(inspectItem).join(' · ') }}
        </div>
        <div v-if="inspectItem.setId && SET_BY_ID[inspectItem.setId]" class="insp-set">
          🧩 {{ SET_BY_ID[inspectItem.setId]!.emoji }} {{ SET_BY_ID[inspectItem.setId]!.name }}
        </div>
        <div class="insp-actions">
          <!-- 🧩 Pièce RANGÉE dans un set : on peut la fondre seule (v0.867) ; un doublon peut
               aussi prendre la place de la pièce en place. -->
          <template v-if="inspectStored">
            <q-btn
              v-if="inspectStored.spare"
              flat
              no-caps
              dense
              label="⇄ Utiliser dans le set"
              @click="doPromoteSpare(inspectStored.setIndex, inspectItem)"
            />
            <q-btn
              v-if="canSell(inspectItem) || inspectItem.locked"
              flat
              no-caps
              dense
              color="negative"
              :disable="!!inspectItem.locked || busy"
              :label="
                inspectItem.locked
                  ? '🔒 Verrouillée'
                  : `🪙 Vendre (+${fmtPow(sellValue(inspectItem))})`
              "
              @click="doSellSetPiece(inspectItem)"
            />
          </template>
          <q-btn flat no-caps dense label="Fermer" @click="inspectItem = null" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Historique d'énergie (clic sur la puce ⚡) : énergie GAGNÉE par le sport, 3 derniers jours. -->
    <q-dialog v-model="energyHistOpen" position="bottom">
      <q-card class="adv-modal">
        <button
          class="adv-modal-x"
          aria-label="Fermer"
          type="button"
          @click="energyHistOpen = false"
        >
          ✕
        </button>
        <div class="sec-title">⚡ Énergie</div>
        <!-- Composition du SOLDE : il cumule TOUT depuis le début, dépenses comprises →
             sans ça, « j'ai gagné 1205 aujourd'hui mais j'affiche 431 » semble faux. -->
        <div class="enh-bal">
          <div class="enh-brow">
            <span>🏃 Gagné par le sport <small>(depuis le début)</small></span>
            <b class="pos">+{{ energyEarnedTotal }}</b>
          </div>
          <div class="enh-brow">
            <span>🎁 Bonus & bâtiments</span>
            <b class="pos">+{{ energyBonusTotal }}</b>
          </div>
          <div class="enh-brow">
            <span>⚔️ Dépensé en aventure</span>
            <b class="neg">−{{ energySpentTotal }}</b>
          </div>
          <div class="enh-brow total">
            <span>Solde disponible</span>
            <b :class="{ neg: c.energy < 0 }">{{ c.energy }} ⚡</b>
          </div>
        </div>
        <div class="sec-hint enh-sub">
          Gagné ces <b>3 derniers jours</b>, toutes sources (sport, bonus, expéditions) — à ne pas
          confondre avec le solde ci-dessus, qui déduit tout ce que tu as déjà dépensé.
        </div>
        <div class="enh-list">
          <div v-for="d in energyHist" :key="d.date" class="enh-day-block">
            <div class="enh-day-head">
              <span class="enh-day">{{ d.label }}</span>
              <span class="enh-val" :class="{ zero: d.earned === 0 }">+{{ d.earned }} ⚡</span>
            </div>
            <div v-if="d.items.length" class="enh-items">
              <div v-for="(it, i) in d.items" :key="i" class="enh-item">
                <span class="enh-item-lbl">{{ it.emoji }} {{ it.label }}</span>
                <span class="enh-item-val">+{{ it.energy }} ⚡</span>
              </div>
            </div>
            <div v-else class="enh-empty">— aucune activité</div>
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Butin possible d'un donjon -->
    <!-- Explication RANG + ÉTOILES (clic sur la pastille de rang). -->
    <q-dialog :model-value="helpRank" position="bottom" @update:model-value="helpRank = false">
      <q-card class="help-card">
        <div class="help-title font-display">🏅 Le rang et les étoiles</div>
        <p class="help-p">
          Le <b>rang</b> va de <b>{{ rarityRank(RANK_ORDER[0]!).name }}</b> (le plus bas) à
          <b>{{ rarityRank(RANK_ORDER[RANK_ORDER.length - 1]!).name }}</b> (le graal). Un rang
          supérieur est <b>toujours meilleur</b> — les valeurs ne se chevauchent jamais. On débloque
          les rangs plus hauts en montant de <b>niveau</b> (c’est ton sport qui les ouvre).
        </p>
        <p class="help-p">
          Les <b>★</b> (1 à 5) disent où l’on tombe <b>dans la bande du rang</b> : un
          <b>★★★★★</b> frôle le rang au-dessus, un <b>★</b> en est le plancher. Même lecture pour un
          objet, un familier ou un talent.
        </p>
        <div class="help-scale">
          <span
            v-for="r in RANK_ORDER"
            :key="r"
            class="rk-badge"
            :style="{ '--rk': rarityRank(r).color }"
            >{{ rarityRank(r).name }}</span
          >
        </div>
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
          <div v-for="o in dropOdds" :key="o.label" class="odd" :class="o.cls">
            <span class="odd-pct font-display">{{ o.pct }}%</span>
            <span class="odd-lbl">{{ o.label }}</span>
          </div>
        </div>
        <div class="drops-note">
          Le <b>rang</b> (Bronze → Divin ancestral) ne dépasse <b>jamais ton rang</b>. Ton rang
          <b>s'ouvre au fil de ses 10 niveaux</b> : rare au début, de plus en plus fréquent ; le
          reste tombe un cran en dessous. Ses <b>étoiles</b> suivent la tienne (★1 au début, ★5 en
          fin de rang). Les <b>pièces de set</b> (de voie) tombent sur les <b>boss de palier</b>.
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
          Les boss droppent une pièce de <b>n'importe quel</b> set. Complète les 6 pièces du set de
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
              <span v-if="s.signature" class="set-tier set-sig on">
                ⭐ {{ s.signature.emoji }} <b>{{ s.signature.name }}</b> — {{ s.signature.desc }}
              </span>
            </div>
          </div>
        </div>
        <button class="drops-close" @click="setsCatalogOpen = false">Fermer</button>
      </div>
    </div>

    <!-- CONFLIT de rangement de set : le slot du loadout est déjà pris → comparer & choisir. -->
    <!-- ── REVUE DE L'ÉQUIPEMENT CONSEILLÉ ───────────────────────────────────
         Une PROPOSITION, pas un décret : chaque remplacement se lit en détail et
         s'accepte séparément. Le bandeau de puissance et le gain de chaque ligne se
         RECALCULENT à chaque bascule — le plan est un tout cohérent, refuser une ligne
         change la valeur des autres. -->
    <q-dialog v-model="planOpen" position="bottom">
      <q-card class="plan-card">
        <div class="plan-head">
          <div class="plan-title font-display">🪄 Équipement conseillé</div>
          <button class="sh-x" @click="gearPlan = null">✕</button>
        </div>
        <div class="plan-power">
          <span class="pp-cur">⚔️ {{ fmtPow(planPowerNow) }}</span>
          <span class="pp-arrow">→</span>
          <span class="pp-new">{{ fmtPow(planPowerSel) }}</span>
          <span class="pp-delta" :class="planPowerSel >= planPowerNow ? 'up' : 'down'">
            {{ fmtDelta(planPowerNow, planPowerSel) }}
          </span>
        </div>

        <div class="plan-rows">
          <div
            v-for="row in planRows"
            :key="row.key"
            class="plan-row"
            :class="{ off: planOff.has(row.key) }"
          >
            <button
              class="plan-check"
              :aria-pressed="!planOff.has(row.key)"
              @click="togglePlanRow(row.key)"
            >
              {{ planOff.has(row.key) ? '☐' : '☑' }}
            </button>
            <div class="plan-main">
              <div class="plan-lbl">
                <span class="plan-kind">{{ row.label }}</span>
                <span class="plan-gain" :class="rowGain(row.key) >= 0 ? 'up' : 'down'">
                  {{ fmtDelta(0, rowGain(row.key)) }}
                </span>
              </div>

              <!-- OBJET / FAMILIER : l'actuel à gauche, le proposé à droite -->
              <div v-if="row.slot" class="plan-cmp">
                <div class="plan-side">
                  <div class="plan-side-lbl">Actuel</div>
                  <template v-if="row.fromItem">
                    <div class="plan-nm">
                      {{ row.fromItem.emoji }} {{ row.fromItem.name }}
                      <span class="ii-rar" :class="'p-' + row.fromItem.rarity">{{
                        gradeLabel(row.fromItem)
                      }}</span>
                    </div>
                    <div class="plan-sub">Nv {{ row.fromItem.level }}</div>
                    <div class="plan-eff">
                      <span
                        v-for="(st, li) in itemStatCmp(row.fromItem, row.toItem ?? null)"
                        :key="li"
                        class="stat-line"
                        :class="st.cls"
                        >{{ st.text }}</span
                      >
                    </div>
                  </template>
                  <div v-else class="plan-empty">emplacement vide</div>
                </div>
                <div class="plan-side new">
                  <div class="plan-side-lbl">Proposé</div>
                  <template v-if="row.toItem">
                    <div class="plan-nm">
                      {{ row.toItem.emoji }} {{ row.toItem.name }}
                      <span class="ii-rar" :class="'p-' + row.toItem.rarity">{{
                        gradeLabel(row.toItem)
                      }}</span>
                    </div>
                    <div class="plan-sub">Nv {{ row.toItem.level }}</div>
                    <div class="plan-eff">
                      <span
                        v-for="(st, li) in itemStatCmp(row.toItem, row.fromItem ?? null)"
                        :key="li"
                        class="stat-line"
                        :class="st.cls"
                        >{{ st.text }}</span
                      >
                    </div>
                  </template>
                  <div v-else class="plan-empty">retiré</div>
                </div>
              </div>

              <!-- 🧩 SET : ses pièces se proposent ENSEMBLE (demandé par l’utilisateur) — une
                   pièce de set seule ne vaut rien sans ses sœurs (bonus, 6 pièces), donc un
                   gain par pièce mentirait. Un seul interrupteur, un seul gain : celui du set. -->
              <div v-else-if="row.kind === 'set'" class="plan-set">
                <div v-for="pc in row.pieces" :key="pc.slot" class="plan-set-line">
                  <span class="plan-set-slot">{{ SLOT_LABEL[pc.slot] }}</span>
                  <span class="plan-set-from">{{
                    pc.fromItem ? pc.fromItem.emoji + ' ' + pc.fromItem.name : 'vide'
                  }}</span>
                  <span class="plan-set-arrow">→</span>
                  <span v-if="pc.toItem" class="plan-set-to"
                    >{{ pc.toItem.emoji }} {{ pc.toItem.name }}
                    <span class="ii-rar" :class="'p-' + pc.toItem.rarity">{{
                      gradeLabel(pc.toItem)
                    }}</span></span
                  >
                </div>
                <div v-if="row.voieChange" class="plan-sub">
                  Voie → <b>{{ VOIE_BY_ID[row.voie as VoieId]?.name ?? 'aucune voie' }}</b> — le
                  bonus 6 pièces s’applique.
                </div>
                <div class="plan-sub">
                  Gain du set entier : ses pièces ne valent pas ça une à une.
                </div>
              </div>

              <!-- TALENT : un échange 1 pour 1, donc refuser une ligne ne déséquilibre rien -->
              <div v-else-if="row.kind === 'talent'" class="plan-cmp">
                <div class="plan-side">
                  <div class="plan-side-lbl">Retiré</div>
                  <div v-if="row.fromTalent" class="plan-nm">
                    {{ talentIcon(row.fromTalent) }} {{ talentName(row.fromTalent) }}
                  </div>
                  <div v-else class="plan-empty">—</div>
                </div>
                <div class="plan-side new">
                  <div class="plan-side-lbl">Équipé</div>
                  <div v-if="row.toTalent" class="plan-nm">
                    {{ talentIcon(row.toTalent) }} {{ talentName(row.toTalent) }}
                  </div>
                  <div v-else class="plan-empty">—</div>
                </div>
              </div>

              <!-- VOIE : elle conditionne le capstone 6 pièces, donc elle se décide aussi -->
              <div v-else class="plan-voie">
                {{ currentVoie?.name ?? 'aucune voie' }} →
                <b>{{ VOIE_BY_ID[row.voie as VoieId]?.name ?? 'aucune voie' }}</b>
                <div class="plan-sub">
                  Le bonus 6 pièces ne s’applique qu’à la voie du set porté.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="plan-actions">
          <button class="drops-close accent" :disabled="!planAccepted" @click="applyPlan">
            Appliquer {{ planAccepted }} changement{{ planAccepted > 1 ? 's' : '' }}
          </button>
          <button class="drops-close ghost" @click="gearPlan = null">Annuler</button>
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
                    gradeLabel(cand.item)
                  }}</span>
                  <span v-if="cand.item.setId" class="rc-pill set">🧩 Set</span>
                  <span v-if="rewardFitsVoie(cand.item)" class="rc-pill voie">🧭 ta voie</span>
                </div>
                <div class="rc-eff">
                  {{ SLOT_LABEL[cand.item.slot] }} · {{ itemEffects(cand.item) }}
                </div>
                <div class="drop-cmp rc-cmp">
                  <span v-if="equippedInSlot(cand.item.slot)"
                    >Équipé : {{ gradeLabel(equippedInSlot(cand.item.slot)!) }} ·
                    {{ itemEffects(equippedInSlot(cand.item.slot)!) }}</span
                  >
                  <span v-else>Emplacement libre</span>
                  <span class="rarity-verdict" :class="rarityVerdict(cand.item).cls">{{
                    rarityVerdict(cand.item).label
                  }}</span>
                </div>
                <div class="pow-cmp">
                  ⚔️ vs ton meilleur build {{ fmtPow(refPower) }} →
                  <b :class="powerIfEquip(cand.item) >= refPower ? 'up' : 'down'"
                    >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                      fmtDelta(refPower, powerIfEquip(cand.item))
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

    <!-- ARÈNE en PLEIN ÉCRAN : c'est un mini-jeu, pas une vignette. `persistent` car
         le plateau a son propre « Passer » et son écran de fin — on ne veut pas qu'un
         tap à côté coupe le combat avant d'avoir vu le score. -->
    <q-dialog v-model="arenaOpen" maximized persistent>
      <div class="arena-full">
        <ArenaStage
          v-if="arenaWaves && run"
          :key="'a' + runSeq"
          :waves="arenaWaves"
          :player-max-pv="run.playerMaxPv ?? 100"
          :player-profile="c.profile"
          :player-equipped="char.row?.equipped ?? {}"
          @done="onArenaDone"
        />
      </div>
    </q-dialog>

    <!-- 🕳️ Rejeu d'une incursion : la traversée, la porte, la salle du gardien. -->
    <RiftReplayDialog
      v-model:replay="riftReplay"
      :roster="char.advList"
      :hero-profile="c.profile"
      :hero-equipped="char.row?.equipped ?? {}"
    />

    <!-- Rapport de combat (post-run) en MODALE : toutes les infos + réattaquer /
         inventaire / fermer -->
    <q-dialog v-model="reportOpen" :persistent="!stageDone">
      <q-card
        v-if="run"
        class="report-modal"
        :class="[
          run.cleared || (run.kind === 'arena' && run.defeated > 0) ? 'win' : 'lose',
          { 'rm-compact': rewardChoiceMode },
        ]"
      >
        <div class="rm-head">
          <div class="rm-title font-display">{{ run.name }}</div>
          <div v-if="!stageDone" class="rm-skips">
            <button class="rm-skip" @click="skipStage">⏩ Passer</button>
            <button
              class="rm-skip"
              title="Passer l’animation de tous les combats (donjons, boss, portail)"
              @click="skipAlways"
            >
              ⏩ Toujours
            </button>
          </div>
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
            v-if="hasStage && !(stageDone && (stageWasReward || stageSkipped))"
            class="rm-stage-wrap"
          >
            <!-- L'arène ne passe PAS ici : elle se joue en plein écran (cf. la modale
                 `arenaOpen` plus bas), et n'ouvre ce rapport qu'une fois finie. -->
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
                run.kind === 'arena'
                  ? `🌊 ${run.defeated} vague${run.defeated > 1 ? 's' : ''} tenue${
                      run.defeated > 1 ? 's' : ''
                    }`
                  : run.cleared
                    ? run.kind === 'boss'
                      ? '🏆 Vaincu !'
                      : '🏆 Nettoyé !'
                    : '💀 Échec'
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
              <template v-else-if="run.kind === 'arena'"
                >vaincu à la vague {{ run.total }} ·
              </template>
              PV restants {{ run.finalPv }}
            </div>
            <div v-if="skipReason === 'sure'" class="result-skip">
              ⏩ Animation passée : victoire assurée (plus de 90 % de chances).
            </div>
            <div v-if="hasStage" class="result-skip-set">
              <q-toggle
                v-model="alwaysSkipFights"
                dense
                size="sm"
                color="primary"
                label="Toujours passer l’animation des combats"
              />
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
                  <span class="gpill" :class="'p-' + d.rarity">{{ gradeLabel(d) }}</span>
                  <span class="lvl-badge">Nv {{ d.level }}</span>
                  <span v-if="d.setId" class="gpill set">🧩 Set</span>
                </div>
                <div class="inv-slot">{{ SLOT_LABEL[d.slot] }}</div>
                <div class="stat-lines">
                  <div v-for="(ln, si) in itemStatLines(d)" :key="si" class="stat-line">
                    {{ ln }}
                  </div>
                </div>
                <!-- Pièce de set d'un BOSS : filée à ton set de voie (pas au sac). On montre
                     quand même si elle est intéressante (Δ puissance si équipée) + où elle est
                     rangée. Conflit (emplacement occupé) → dialogue de choix par-dessus. -->
                <template v-if="run.kind === 'boss' && d.setId">
                  <div class="ii-cmp2">
                    <span class="ii-cmp2-ic">⚔️</span>
                    <span class="ii-cmp2-chip" :class="powerIfEquip(d) >= refPower ? 'up' : 'down'">
                      <b>{{ fmtDelta(refPower, powerIfEquip(d)) }}</b
                      ><i>si équipée seule</i>
                    </span>
                  </div>
                  <div class="drop-done set-note">
                    🧩 Rangée dans ton set <b>{{ setVoieName(d.setId) }}</b> — porte-le via «
                    Mes&nbsp;sets »
                  </div>
                </template>
                <template v-else>
                  <div v-if="equippedInSlot(d.slot)" class="drop-cmp">
                    <span
                      >Équipé : {{ gradeLabel(equippedInSlot(d.slot)!) }} · niv
                      {{ equippedInSlot(d.slot)!.level
                      }}<span v-if="equippedInSlot(d.slot)!.setId" title="Pièce de set"> 🧩</span> ·
                      {{ itemEffects(equippedInSlot(d.slot)!) }}</span
                    >
                    <span class="rarity-verdict" :class="rarityVerdict(d).cls">{{
                      rarityVerdict(d).label
                    }}</span>
                  </div>
                  <div v-else class="drop-cmp">
                    <span class="rarity-verdict up">slot libre</span>
                  </div>
                  <!-- Puissance si équipé (rang + qualité) vs l'objet équipé du même slot. -->
                  <div class="ii-cmp2">
                    <span class="ii-cmp2-ic">⚔️</span>
                    <span class="ii-cmp2-chip" :class="powerIfEquip(d) >= refPower ? 'up' : 'down'">
                      <b>{{ fmtDelta(refPower, powerIfEquip(d)) }}</b
                      ><i>{{
                        inOptimum(d) ? 'retenu par ton meilleur build' : 'vs ton meilleur build'
                      }}</i>
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
                    <button v-if="canSell(d)" class="link-btn" @click="doSell(d)">
                      Vendre 🪙{{ fmtPow(sellValue(d)) }}
                    </button>
                  </div>
                </template>
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
                  <span class="rk-grade" :style="{ '--rk': rarityRank(talentRankOf(t)).color }">{{
                    gradeLabel({ rarity: talentRankOf(t), roll: talentRollOf(t) })
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
                        gradeLabel(cand.item)
                      }}</span>
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
                      ⚔️ vs ton meilleur build {{ fmtPow(refPower) }} →
                      <b :class="powerIfEquip(cand.item) >= refPower ? 'up' : 'down'"
                        >{{ fmtPow(powerIfEquip(cand.item)) }} ({{
                          fmtDelta(refPower, powerIfEquip(cand.item))
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
               de Réattaquer, avec son coût. Absent pour le Portail (Réattaquer avance déjà). -->
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
          <!-- Un boss lâche des PIÈCES DE SET, rangées d’office dans « Mes sets » : c’est là
               qu’on va les voir, pas au sac (demandé par l’utilisateur). -->
          <button
            v-if="run?.kind === 'boss'"
            class="rm-btn rm-icon"
            title="Mes sets"
            aria-label="Mes sets"
            @click="goSetsFromReport"
          >
            🧩
          </button>
          <button
            v-else
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

    <!-- ── SÉLECTEUR DE TALENT (une case) ─────────────────────────────────────
         On montre TOUT ce qu'on possède, les plus utiles d'abord ; ce qui ne peut
         pas être posé est marqué avec sa raison plutôt que masqué — un talent absent
         sans explication se lit comme un talent perdu. -->
    <q-dialog v-model="talPickOpen" position="bottom">
      <q-card class="adv-modal">
        <button class="adv-modal-x" aria-label="Fermer" @click="talPick = null">✕</button>
        <div class="sec-title">Ton talent</div>
        <button
          v-if="talPick !== null && talentSlotsView[talPick]"
          class="voie-btn talent-dup-btn"
          @click="pickTalent(null)"
        >
          Laisser cet emplacement vide
        </button>
        <p v-if="!talChoices.length" class="talents-empty">
          Tous tes talents sont déjà équipés — libère un emplacement pour en déplacer un.
        </p>
        <div class="talents-grid">
          <button
            v-for="t in talChoices"
            :key="t.id"
            type="button"
            class="tpick"
            :class="[
              'p-' + t.rarity,
              {
                here: talPick !== null && talentSlotsView[talPick]?.id === t.id,
                off: !!talBlocked(t),
              },
            ]"
            :disabled="!!talBlocked(t)"
            @click="pickTalent(t.id)"
          >
            <span class="tp-emo">{{ t.def.icon }}</span>
            <span class="tp-main">
              <span class="tp-name">
                {{ t.def.name }}
                <span class="rk-grade" :style="{ '--rk': rarityRank(t.rarity).color }">{{
                  gradeLabel(t)
                }}</span>
                <span class="lvl-badge">Nv {{ t.level }}</span>
              </span>
              <span class="tp-eff">+{{ t.effLabel }} {{ t.def.desc }}</span>
              <span v-if="talBlocked(t)" class="tp-off">{{ talBlocked(t) }}</span>
            </span>
          </button>
        </div>
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  shallowRef,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { stageSkipReason, type StageSkipReason } from '@/lib/stageSkip';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore, PseudoTakenError, WELCOME_ENERGY } from '@/stores/character';
import { useComboStore } from '@/stores/combo';
import { depositComboChest } from '@/composables/useComboChest';
import { useProgress } from '@/composables/useProgress';
import { useBossTokenAccrual } from '@/composables/useBossTokenAccrual';
import { useEnergyHistory } from '@/composables/useEnergyHistory';
import { useGameFx } from '@/composables/useGameFx';
import { useAdvProgressFx } from '@/composables/useAdvProgressFx';
import type { AdvProgress } from '@/lib/adventurers';
import { useGamePanel } from '@/composables/useGamePanel';
import { isWounded, woundRemainingMs, type RaidReport, defenseLevel } from '@/lib/raid';
import { usePush } from '@/composables/usePush';
const BasePage = defineAsyncComponent(() => import('@/pages/BasePage.vue'));
import { characterRank, CHARACTER_RANKS } from '@/lib/characterRank';
import { computeCharacter, isValidPseudo } from '@/lib/character';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ItemIcon from '@/components/ItemIcon.vue';
import { splitStat, type StatParts } from '@/lib/statText';
import PartyReportView from '@/components/PartyReportView.vue';
import {
  simulateDungeon,
  simulateCombat,
  mulberry32,
  combatPower,
  fmtPow,
  fmtDelta,
  type CombatEvent,
  type Combatant,
} from '@/lib/combat';
import { compactNumber } from '@/lib/compactNumber';
import CombatStage from '@/components/CombatStage.vue';
import ArenaStage from '@/components/ArenaStage.vue';
import RiftReplayDialog from '@/components/RiftReplayDialog.vue';
import { useRiftAutoReplay } from '@/composables/useRiftAutoReplay';
import { buildArenaStage, type StageWave } from '@/lib/arenaStage';
import { MONSTERS, monsterArchetype } from '@/data/monsters';
import { familiarSpecies } from '@/data/familiars';
import {
  DUNGEONS,
  dungeonFoes,
  dungeonGold,
  dungeonSummonStones,
  type Dungeon,
} from '@/data/dungeons';
import { BOSSES, bossSummonCost, type MilestoneBoss } from '@/data/bosses';
import { runSuccessPct, successTier } from '@/lib/runStats';
import { recommendedPower } from '@/lib/proceduralContent';
import { VOIES, VOIE_BY_ID, voiePassiveEffects, type VoieId } from '@/lib/voies';
import {
  endlessFoe,
  endlessEnergy,
  endlessGold,
  endlessDropLevel,
  ENDLESS_NAME,
} from '@/data/endless';
import {
  sellValue,
  playerWithGear,
  chanceChanges,
  aggregateEffects,
  rollDrop,
  rollSetPiece,
  randomVoieSetId,
  voieSetId,
  MAX_LOADOUTS,
  mergeEffects,
  aggregateLines,
  effectLabelFor,
  setTierLabel,
  rollJet,
  legendaryOf,
  relicPowerText,
  magicFindLuck,
  itemLevelMult,
  round1,
  canSell,
  isFamiliar,
  FAMILIAR_SLOT,
  TROPHY_SLOT,
  WORN_SLOTS,
  compareFamiliars,
  groupBestFirst,
  rollTier,
  RANK_ORDER,
  SLOTS,
  SET_SIZE,
  SLOT_LABEL,
  SLOT_EMOJI,
  rarityRank,
  gradeLabel,
  groupRowVisible,
  RARITY_RANK,
  fxRarity,
  ITEM_SETS,
  SET_BY_ID,
  setCounts,
  voieSetRoster,
  setSellLot,
  type SetRosterEntry,
  type Item,
  type ItemSlot,
  type Equipped,
  type AggregatedEffects,
  type RewardCandidate,
  bestGearLoadout,
} from '@/lib/items';
import {
  talentsEarned,
  pickBestTalents,
  TALENT_SLOT_LEVEL,
  talentEffects,
  normalizeTalents,
  talentByCode,
  tierOf,
  talentRank,
  talentRankOf,
  talentStar,
  talentRollOf,
  talentValue,
  rollTalentDrop,
  type TalentInstance,
} from '@/lib/talents';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import {
  setPieceScorer,
  voieSetIndex,
  ownedInLoadouts,
  sparesLot,
  type FiledPiece,
} from '@/lib/setFiling';
import { unlocksAtLevel } from '@/lib/advUnlocks';
import { labyrinthUnlocked, bossAltarBuilt, bossAltarRollFloor } from '@/lib/buildings';
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
import { monsterArt } from '@/data/monsterArt';
import ChampionCollection from '@/components/ChampionCollection.vue';
import { dailyFreeMana } from '@/lib/gacha';
import { emptySeals, sealsSummary } from '@/lib/ascension';
import {
  messageTitle,
  isClaimable,
  type ExpeditionMessage,
  haulPills,
  messageLoot,
  travelPosition,
  runArena,
  arenaEnergyCost,
  arenaRewards,
  ARENA_PLAY,
  type PartyResult,
} from '@/lib/expedition';
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
  kind: 'dungeon' | 'boss' | 'arena';
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
}

// `embedded` : rendu dans le VOLET droit du cockpit (Z Fold déplié) → racine <div>
// au lieu de <q-page> + hauteur fluide (le volet gère le scroll).
const props = defineProps<{ embedded?: boolean }>();

const $q = useQuasar();
const router = useRouter();
const { openPath } = useGamePanel();
// Ouvre un écran jeu profond : en cockpit (embedded) → DANS le volet droit (pas de
// route, sinon on router-ait le volet gauche) ; sinon navigation plein écran normale.
function openGame(path: string) {
  openPath(router, path, props.embedded);
}
const auth = useAuthStore();

const char = useCharacterStore();
const combo = useComboStore();
const progress = useProgress();
useBossTokenAccrual(); // 🎫 jetons de boss gagnés par le sport
const gameFx = useGameFx();
const advFx = useAdvProgressFx();
// Explication « rang » / « qualité » (ouverte en cliquant le pastille de rang ou le
// chiffre de qualité d'un objet — ticket d094eac6). Les 10 rangs pour l'échelle visuelle.
// ⚠️ C'était `'rank' | 'quality' | null`, mais RIEN ne posait jamais `'quality'` : la moitié
// de cette modale était inatteignable, et elle décrivait la qualité 1-5 retirée en v0.576.
const helpRank = ref(false);
// Bonus de luck du magic find (stat mineure) apporté par l'équipement actuel.
function mfLuck(): number {
  return char.row ? magicFindLuck(char.row.equipped, char.row.voie) : 0;
}
// Détail d'un objet (clic sur un item équipé → modale d'inspection).
const inspectItem = ref<Item | null>(null);
// Affixes (1→3) d'un objet, en lignes séparées pour le détail.
// Valeur d'un affixe AFFICHÉE = valeur bakée × multiplicateur de niveau de l'objet (ilvl).
function affixText(
  it: { level: number },
  e: { type: Parameters<typeof effectLabelFor>[0]; value: number },
): string {
  return effectLabelFor(e.type, round1(e.value * itemLevelMult(it.level)));
}
function itemAffixLines(it: Item): string[] {
  if (it.power) return [relicPowerText(it)];
  const lines = [affixText(it, it.effect)];
  if (it.effect2) lines.push(affixText(it, it.effect2));
  if (it.effect3) lines.push(affixText(it, it.effect3));
  return lines;
}
// Célébration centrale pour un DROP marquant (rang S+ = éclat, SSS = explosion).
function celebrateRareDrop(it: Item, quiet = false) {
  if (RARITY_RANK[it.rarity] < 7) return; // S / SS / SSS uniquement
  gameFx.celebrate({
    quiet,
    kind: 'drop',
    emoji: it.emoji,
    // Libellé, jamais l'identifiant brut (« primordial ») ; gradeLabel donne le rang d'un
    // familier et la rareté d'un objet.
    title: `Drop ${gradeLabel(it)} !`,
    subtitle: it.name,
    rarity: fxRarity(it.rarity),
  });
}
// Drop de talent : éclat central si rang élevé (moment notable). Le talent apparaît
// dans la collection Perso › Talents.
function celebrateTalentDrop(t: TalentInstance, quiet = false) {
  const def = talentByCode(t.code);
  if (!def) return;
  const rarity = talentRankOf(t);
  if (RARITY_RANK[rarity] >= 4)
    gameFx.celebrate({
      quiet,
      kind: 'generic',
      emoji: '🎓',
      title: `Talent ${rarityRank(rarity).name} !`,
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
const TAB_IDS = ['hero', 'gear', 'explore', 'base'] as const;
type TabId = (typeof TAB_IDS)[number];
const tab = ref<TabId>('hero');
const route = useRoute();
/** 🔔 `?tab=` = l'écran demandé par une notification push (`planPushes` n'émet que des
 *  URL). Lu à l'arrivée ET à chaque changement de route : en cockpit l'Aventure est déjà
 *  montée à droite, la notification n'arrive donc pas par un montage. Une fois appliqué,
 *  le paramètre est retiré — sinon un retour arrière rejouerait le saut d'onglet. */
watch(
  () => route.query.tab,
  (t) => {
    if (typeof t !== 'string' || !TAB_IDS.includes(t as TabId)) return;
    tab.value = t as TabId;
    const rest = { ...route.query };
    delete rest.tab;
    void router.replace({ path: route.path, query: rest });
  },
  { immediate: true },
);
// Équipement : plus de sous-onglets. Sac / Loadouts ouvrent des modales
// (les stats de combat « Force » vivent sur la fiche Héros).
const bagOpen = ref(false);
const loadoutOpen = ref(false);
function openBag() {
  bagMode.value = 'items';
  betterFilterSlot.value = null; // ouverture directe = pas de filtre « upgrades »
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
// Stats de combat (base → équipé) : modale ouverte depuis le perso ou sa puissance.
const combatOpen = ref(false);
// Le familier et le talent de l'avatar (`.hotspot`) ouvrent leur propre inventaire.
function onFrameClick(e: MouseEvent) {
  if ((e.target as Element | null)?.closest('.hotspot')) return;
  combatOpen.value = true;
}
// Historique d'énergie gagnée sur 3 jours — modale au clic sur la puce ⚡ (energyHist
// défini plus bas, après `c`/`heroLevel`).
const energyHistOpen = ref(false);
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
  if (onExpedition.value || heroWounded.value) return expeBlocked();
  if (!hasLabyGate.value) {
    $q.notify({
      type: 'warning',
      message: 'Construis la 🚪 Porte du Labyrinthe dans ton village pour le débloquer.',
    });
    return void (tab.value = 'base');
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
// Détail de l'énergie (toutes sources datables) sur 3 jours — modale au clic sur ⚡.
const energyHist = useEnergyHistory(3);
// Composition du solde d'énergie (mêmes sources que `c`) : gagné par le sport,
// bonus/bâtiments (login_energy), et dépensé (energy_spent) — tous CUMULÉS.
const energyEarnedTotal = computed(() => progress.energyEarned.value);
const energyBonusTotal = computed(() => char.row?.login_energy ?? 0);
const energySpentTotal = computed(() => char.row?.energy_spent ?? 0);
// Effets cumulés des talents choisis.
const talentFx = computed(() => talentEffects(char.row?.talents ?? []));
/** Barème UNIQUE du rangement des pièces de set (cf. `setFiling`) : ce qu'une pièce vaut
 *  pour SON set, dans la voie du set. Toutes les actions qui rangent le reçoivent. */
const setScore = computed(() =>
  setPieceScorer({
    name: char.row?.pseudo ?? 'Toi',
    stats: c.value,
    level: c.value.level.level,
    fx: talentFx.value,
    equipped: char.row?.equipped ?? {},
    loadouts: char.row?.loadouts ?? [],
  }),
);
// Effets « hors équipement » actifs = talents + PASSIF DE VOIE (spécialisation) → comptés
// partout dans le combat/la puissance (fighter, powerWith, winPct, runExtra).
const activeFx = computed(() =>
  mergeEffects(talentFx.value, voiePassiveEffects(char.row?.voie as VoieId | null)),
);
// Un siège PERDU envoie le héros à l'infirmerie : il est indisponible, comme s'il était
// parti en expédition. Un simple malus de dégâts avait été essayé d'abord — sans mordant,
// puisqu'on farme surtout du contenu qu'on domine largement.
const heroWounded = computed(() => isWounded(char.row?.base, expeNow.value));
const heroHealIn = computed(() => woundRemainingMs(char.row?.base, expeNow.value));
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
// Meilleure façon d'équiper `inst` : renvoie la puissance obtenue ET le talent qu'il faut
// RETIRER (replacedId) pour y arriver.
//  - même code équipé → remplacement FORCÉ de ce talent (effets distincts) ;
//  - slot libre → simple ajout (rien à retirer, replacedId null) ;
//  - slots PLEINS (codes différents) → on teste le retrait de chaque équipé et on garde le
//    meilleur swap → replacedId = le talent à enlever pour ce gain.
function bestTalentSwap(inst: TalentInstance): { power: number; replacedId: string | null } {
  const all = char.row?.talents ?? [];
  const equipped = all.filter((t) => t.equipped);
  const powerOf = (unequipId?: string) => {
    const list = [
      ...all
        .filter((t) => t.id !== inst.id)
        .map((t) => (unequipId && t.id === unequipId ? { ...t, equipped: false } : t)),
      { ...inst, equipped: true },
    ];
    return powerWith(char.row?.equipped ?? {}, talentEffects(list));
  };
  const sameCode = equipped.find((t) => t.code === inst.code);
  if (sameCode) return { power: powerOf(sameCode.id), replacedId: sameCode.id };
  if (equipped.length < talentSlots.value) return { power: powerOf(), replacedId: null };
  let best = { power: -1, replacedId: null as string | null };
  for (const e of equipped) {
    const p = powerOf(e.id);
    if (p > best.power) best = { power: p, replacedId: e.id };
  }
  return best;
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
// Pour chaque talent NON équipé : gain de puissance du meilleur swap + le talent à retirer.
const talSwapMap = computed(() => {
  const cur = combatPowerVal.value;
  const m = new Map<string, { delta: number; replacedId: string | null }>();
  for (const t of talentsView.value)
    if (!t.equipped) {
      const s = bestTalentSwap(t.inst);
      m.set(t.id, { delta: Math.round(s.power - cur), replacedId: s.replacedId });
    }
  return m;
});
const talDeltaMap = computed(() => {
  const m = new Map<string, number>();
  for (const [id, s] of talSwapMap.value) m.set(id, s.delta);
  return m;
});
// Icône du talent que `id` remplacerait (null si ajout sur slot libre).
function talReplaceIcon(id: string): string | null {
  const rid = talSwapMap.value.get(id)?.replacedId;
  if (!rid) return null;
  const t = (char.row?.talents ?? []).find((x) => x.id === rid);
  return t ? talentIcon(t) : null;
}
function talReplaceId(id: string): string | null {
  return talSwapMap.value.get(id)?.replacedId ?? null;
}
// PUISSANCE CONSEILLÉE (ticket 6abe4429) : remplace le 🎯 % de victoire (qui « bougeait »)
// par une cible STABLE — la puissance du build équilibré de référence contre lequel le
// contenu est calibré. Le joueur compare SA puissance (combatPowerVal) à celle-ci.
// Mémoïsée : `recommendedPower` (reconstruit un combattant de référence) est STATIQUE par
// niveau, mais recoPow est appelée ~3×/ligne de donjon/boss à chaque rendu → cache par niveau.
// Cache par (niveau, boss) : les boss supposent un joueur plus fortement équipé → conseillée
// STEEP (bossGearExpect) ; les donjons = attente d'attrition (gearExpect). Cf. recommendedPower.
const recoPowCache = new Map<string, number>();
function recoPow(recoLevel: number, boss = false): number {
  const key = (boss ? 'b' : 'd') + recoLevel;
  let v = recoPowCache.get(key);
  if (v === undefined) {
    v = recommendedPower(recoLevel, boss);
    recoPowCache.set(key, v);
  }
  return v;
}
// Vert si tu atteins la puissance conseillée, orange si proche (≥ 80 %), rouge sinon.
function powClass(recoLevel: number, boss = false): string {
  const r = recoPow(recoLevel, boss);
  const mine = combatPowerVal.value;
  if (mine >= r) return 'wp-good';
  if (mine >= r * 0.8) return 'wp-mid';
  return 'wp-bad';
}
function powTitle(recoLevel: number, boss = false): string {
  return `Puissance conseillée ${fmtPow(recoPow(recoLevel, boss))} · la tienne ${fmtPow(combatPowerVal.value)}`;
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
// Barrière de départ en PV : la formule du combat (`PV max × part`, arrondie).
const shieldPv = computed(() => Math.round(fighter.value.pv * (fighter.value.startShield ?? 0)));
// Puissance de combat avec un ensemble d'équipement donné (+ effets extra = talents).
// Helper UNIQUE derrière toutes les comparaisons (objet/familier/talent/loadout) → plus de
// plomberie pseudo/niveau/talentFx dupliquée (revue /simplify).
function powerWith(eq: Equipped, fx: Partial<AggregatedEffects> = activeFx.value): number {
  return combatPower(
    playerWithGear(char.row?.pseudo ?? 'Toi', c.value, eq, fx, c.value.level.level, char.row?.voie),
  );
}
// ── ⭐ RÉFÉRENCE UNIQUE : LE MEILLEUR BUILD POSSIBLE ────────────────────────────────
//
// ⚠️ Toutes les comparaisons d'objets s'y adossent. Avant, chaque objet du sac était
// comparé à CE QU'ON PORTE, tandis que l'équipement conseillé cherchait le meilleur build
// POSSIBLE : deux étalons, donc deux verdicts contradictoires sur le même objet (mesuré :
// un talisman « +30 » pour la pastille, −15 dans le build optimal — les deux justes, et
// l'écran incompréhensible). Avec UN seul étalon, la contradiction devient impossible.
//
// ⚠️ Le calcul coûte ~3 s : on le CACHE, et on l'invalide quand le sac, l'équipement, les
// talents, la voie ou le niveau changent — c'est-à-dire exactement quand il peut changer.
const optimum = shallowRef<Equipped | null>(null);
const optimumIds = shallowRef<Set<string>>(new Set());
const optimumPower = ref(0);
const optimumKey = computed(
  () =>
    `${char.row?.inventory?.length ?? 0}|${Object.values(char.row?.equipped ?? {})
      .map((i) => i?.id ?? '')
      .join(',')}|${char.row?.voie ?? ''}|${c.value.level.level}|${
      normalizeTalents(char.row?.talents ?? []).filter((t) => t.equipped).length
    }`,
);
let optimumFor = '';
/** Calcule (ou recalcule) la référence.
 *
 *  ⚠️ NE JAMAIS L'APPELER PENDANT LE RENDU. Elle est SYNCHRONE, dure ~3 s, et surtout
 *  elle ÉCRIT dans des refs dont les calculs d'affichage dépendent : l'appeler depuis un
 *  `computed` ou une fonction de template faisait boucler Vue et FIGEAIT l'app (constaté :
 *  Aventure → Base → plus rien ne répondait). Elle se déclenche donc depuis un `watch`,
 *  après peinture. Tant qu'elle n'a pas tourné, les écrans n'affichent simplement AUCUN
 *  verdict — mieux vaut se taire que geler. */
/** Rend la main au navigateur : une image de rendu entre deux voies. */
const respire = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Le plan COMPLET (équipement, talents, voie) du meilleur build — la même computation
 *  sert au 🪄 ET aux marques du Sac. ⚠️ Une seule : le 🪄 recalculait de son côté via
 *  `previewGearPlan` sans jamais remplir la référence, donc « retenu par ton meilleur
 *  build » et la protection au recyclage ne s'allumaient JAMAIS. */
const optimumPlan = shallowRef<{
  equipped: Equipped;
  talentIds: string[];
  voie: string | null;
} | null>(null);
async function ensureOptimum(): Promise<void> {
  if (optimumFor === optimumKey.value && optimum.value) return;
  const plan = await char.bestBuild(
    c.value,
    c.value.level.level,
    char.row?.pseudo ?? 'Toi',
    respire,
  );
  if (!plan) return;
  optimumPlan.value = { equipped: plan.equipped, talentIds: plan.talentIds, voie: plan.voie };
  optimum.value = plan.equipped;
  optimumIds.value = new Set(
    Object.values(plan.equipped)
      .filter(Boolean)
      .map((i) => i.id),
  );
  optimumPower.value = plan.score;
  optimumFor = optimumKey.value;
}
/** `it` fait-il PARTIE du meilleur build ? ⚠️ C'est LA question, et la seule : un objet
 *  peut battre ta pièce actuelle sans figurer dans l'optimum, et c'est ce double discours
 *  qui rendait les écrans incohérents. */
function inOptimum(it: Item): boolean {
  return optimumIds.value.has(it.id);
}
// Puissance si `it` remplaçait la pièce du même slot — RAPPORTÉE À LA RÉFÉRENCE quand
// elle est calculée, à l'équipement porté sinon (premier affichage, avant le calcul).
/** Le combattant du joueur avec l'équipement `eq` (mêmes stats, talents, voie). */
function fighterWith(eq: Equipped): Combatant {
  return playerWithGear(
    char.row?.pseudo ?? 'Toi',
    c.value,
    eq,
    activeFx.value,
    c.value.level.level,
    char.row?.voie,
  );
}
/** 🎯 Les CHANCES réelles qui bougent si on porte `it` à la place de la pièce actuelle — ou,
 *  pour une pièce DÉJÀ portée, ce qu'elle apporte (sans elle → avec elle). Jamais la note brute
 *  de l'objet : elle passe par une courbe à rendement décroissant (refonte, § 11). */
function chanceLinesFor(it: Item): string[] {
  const eq = char.row?.equipped ?? {};
  if (eq[it.slot]?.id === it.id) {
    const without = { ...eq };
    delete without[it.slot];
    return chanceChanges(fighterWith(without), fighter.value);
  }
  return chanceChanges(fighter.value, fighterWith({ ...eq, [it.slot]: it }));
}
function powerIfEquip(it: Item): number {
  return powerWith({ ...(optimum.value ?? char.row?.equipped ?? {}), [it.slot]: it });
}
/** La puissance à laquelle on COMPARE — l'étalon affiché à côté de chaque delta. */
const refPower = computed(() => (optimum.value ? optimumPower.value : combatPowerVal.value));

// Estimation live du % de victoire par donjon/boss selon les stats + le stuff
// ÉQUIPÉ actuel (Monte-Carlo seedé). Recalculé quand le perso/l'équipement change
// → on peut swapper du gear et voir l'effet. Clé : 'd:<id>' / 'b:<id>'.
const WINPCT_SEEDS = 40;
// % de victoire (Monte-Carlo seedé) — calculé À LA DEMANDE pour le DERNIER run seulement
// (le seul consommateur est le passage auto de l'animation, lib/stageSkip). Avant on simulait les 22 contenus × 40 seeds à
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
const loginBurst = ref<{ streak: number; energy: number; mana: number; usedGrace: boolean } | null>(
  null,
);
const levelBurst = ref<{ from: number; to: number; energy: number; tickets: number } | null>(null);
// Reveal de nouvelle région : célèbre le passage dans un biome inédit.
// (Défini APRÈS curRegion/selectedRegionId/shatterId — cf. plus bas — pour éviter tout
// accès en TDZ dans la callback d'armement `immediate`.)
const regionBurst = ref<{ emoji: string; name: string; blurb: string; color: string } | null>(null);
const worldmapEl = ref<HTMLElement | null>(null);
type RegionReveal = { id: string; emoji: string; name: string; blurb: string; color: string };
// Reveal EN ATTENTE : quand on nettoie le dernier donjon d'une zone en combat, on
// attend la FERMETURE du rapport pour jouer l'animation (sinon elle recouvre le combat).
/** 💠 Ce que le bonus de connexion verse en plus de l’énergie — DÉRIVÉ du prix d’un
 *  tirage, jamais un second nombre écrit ici. */
const freeMana = dailyFreeMana();
const sealsChamp = computed(() => sealsSummary(char.row?.seals ?? emptySeals(), 'champion'));
const sealsGear = computed(() => sealsSummary(char.row?.seals ?? emptySeals(), 'gear'));
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
/** Une entrée par EMPLACEMENT de talent : l'équipé, ou `undefined` pour une case vide.
 *  ⚠️ Même parti pris qu'au chenil : des CASES, pas une liste. La liste obligeait à la
 *  parcourir pour savoir ce qu'on portait, et retirer un talent faisait remonter les
 *  suivants au lieu de laisser un trou visible. */
const talentSlotsView = computed(() => {
  // ⚠️ On prend les entrées ENRICHIES (`talentsView`) et non les instances brutes : la
  // case doit afficher l'icône, le rang et le niveau, qui n'existent que là.
  const eq = talentsView.value.filter((t) => t.equipped);
  return Array.from({ length: talentSlots.value }, (_, i) => eq[i]);
});
/** Case de talent en cours d'édition, ou null. */
const talPick = ref<number | null>(null);
const talPickOpen = computed({
  get: () => talPick.value !== null,
  set: (v: boolean) => {
    if (!v) talPick.value = null;
  },
});
/** Ce que les talents ÉQUIPÉS donnent, en clair. ⚠️ Ce total n'était affiché nulle part :
 *  on voyait bien chaque talent, jamais leur somme — or c'est elle qui entre en combat.
 *
 *  ⚠️ Il portait sa PROPRE table de libellés, et elle avait dérivé : quatre canaux
 *  (dégâts, exécution, rage, élan) s'affichaient SANS le ×100, donc un talent à +10 %
 *  de dégâts se lisait « +0.1 % ». C'est le facteur cent que `aggregateLines` existe
 *  pour tuer — une seule table, partagée avec le panneau de la Guilde. */
const talentSummary = computed(() => aggregateLines(talentFx.value, { emoji: true }));
// Somme de TOUT l'équipement porté, bonus de set compris (capstone selon la voie) : la
// même agrégation que le combat, lue par la même table que les talents.
const gearTotal = computed(() =>
  aggregateLines(aggregateEffects(char.row?.equipped ?? {}, char.row?.voie ?? null), {
    emoji: true,
  }),
);

/** Talents proposés pour une case : les DISPONIBLES seulement, plus celui qui occupe déjà
 *  cette case — même règle qu'au chenil. Proposer un talent équipé ailleurs n'aurait mené
 *  qu'à un refus du store : un emplacement ne se remplit qu'avec ce qui est libre. */
/** Les TYPES dépliés dans les listes de talents et de familiers (clé = `groupKey`).
 *  ⚠️ REPLIÉ PAR DÉFAUT : l'ensemble part vide. Une seule liste pour les deux écrans — un
 *  type de talent et une race de familier ne partagent jamais une clé. */
const openGroups = ref<Set<string>>(new Set());
function toggleGroup(key: string) {
  const next = new Set(openGroups.value);
  if (!next.delete(key)) next.add(key);
  openGroups.value = next;
}
const talChoices = computed(() => {
  const here = talPick.value === null ? undefined : talentSlotsView.value[talPick.value]?.id;
  return talentsView.value.filter((t) => !t.equipped || t.id === here);
});
/** Un talent déjà équipé sur une AUTRE case, ou un doublon de code déjà porté : le store
 *  refuse les deux, autant le dire avant le clic plutôt qu'après. */
function talBlocked(t: { id: string; inst: { code: string } }): string {
  const i = talPick.value;
  if (i === null) return '';
  const here = talentSlotsView.value[i];
  if (here?.id === t.id) return '';
  // Seul cas restant : un talent du MÊME TYPE est déjà porté ailleurs. Le store le refuse ;
  // on le dit AVANT le clic plutôt que par une notification après. (« Déjà équipé » n'a
  // plus lieu d'être : le sélecteur ne propose que des talents libres.)
  if (equippedTalents.value.some((x) => x.code === t.inst.code && x.id !== here?.id))
    return 'tu portes déjà un talent de ce type';
  return '';
}
/** Pose `id` sur la case en cours (ou la vide si `null`). */
function pickTalent(id: string | null) {
  const i = talPick.value;
  if (i === null) return;
  const here = talentSlotsView.value[i];
  talPick.value = null;
  withUid(async (uid) => {
    // On libère d'abord la case : sans ça, `equipTalent` bute sur « emplacements pleins ».
    if (here) await char.unequipTalent(uid, here.id);
    if (id) {
      const r = await char.equipTalent(uid, id, c.value.level.level);
      if (r === 'dup')
        $q.notify({ type: 'warning', message: 'Tu portes déjà un talent de ce type.' });
      else if (r === 'full') $q.notify({ type: 'warning', message: 'Plus d’emplacement libre.' });
    }
  }, 'Impossible de changer ce talent.');
}

const canEquipMore = computed(() => equippedTalents.value.length < talentSlots.value);
// Puissance du build RÉEL (gear équipé + passif de voie) si l'on équipe exactement ces
// talents. Arbitre UNIQUE des talents conseillés ET du rognage de l'excédent.
function talentScore(ids: string[]): number {
  const owned = char.row?.talents ?? [];
  const combo = owned.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, equipped: true }));
  return powerWith(
    char.row?.equipped ?? {},
    mergeEffects(talentEffects(combo), voiePassiveEffects(char.row?.voie as VoieId)),
  );
}
// TALENTS CONSEILLÉS (tickets 9f2c6a42 / 08b10b7f) : le(s) talent(s) qui MAXIMISENT la
// puissance, un par code, en remplissant les emplacements (un seul depuis v0.845).
const recommendedTalentIds = computed<Set<string>>(() => {
  const owned = char.row?.talents ?? [];
  if (!owned.length) return new Set();
  return new Set(pickBestTalents(owned, talentSlots.value, talentScore));
});
function doEquipRecommendedTalents() {
  withUid(
    (uid) => char.setEquippedTalents(uid, [...recommendedTalentIds.value]),
    'Impossible d’équiper les talents conseillés.',
  );
}
// AUTO-CORRECTION : si PLUS de talents sont équipés que d'emplacements (ex. le niveau a
// baissé après suppression de séances → `talentSlots` réduit, mais les talents restent
// équipés), `talentEffects` les comptait TOUS → puissance GONFLÉE, et l'auto-équip (qui
// n'en garde que N) faisait « chuter » la puissance (tickets 863c4f04 / 6f3c49a6). On retire
// donc l'excédent → puissance affichée toujours LÉGALE. Cas principal depuis v0.845 : les
// comptes qui avaient plusieurs talents gardent celui qui donne le PLUS DE PUISSANCE (plus
// la « magnitude » : +10 % d'or et +10 % de dégâts ne se comparent pas).
watch(
  [() => char.row?.talents, talentSlots, progress.ready],
  () => {
    const uid = auth.user?.id;
    // ⚠️ `progress.ready` : sans l'XP de fond chargée, le niveau vaut 1 → 0 emplacement, et on
    // retirerait un talent que le joueur a légitimement le droit de porter.
    if (!uid || !progress.ready.value) return;
    const eq = (char.row?.talents ?? []).filter((t) => t.equipped);
    if (eq.length <= talentSlots.value) return;
    void char.setEquippedTalents(uid, pickBestTalents(eq, talentSlots.value, talentScore));
  },
  { immediate: true },
);
// ⚙️ Refonte à 7 emplacements (étape 8) : les cadeaux (pièces de set manquantes, pièces
// de départ) demandent le NIVEAU — donc `progress.ready` — et ne tombent qu'une fois
// (`gear_version`, écrit dans la même requête).
watch(
  [() => char.row?.gear_version, progress.ready],
  () => {
    if (!char.row || !progress.ready.value) return;
    void char.settleGearRefonte(heroLevel.value);
  },
  { immediate: true },
);
// Vue enrichie, RANGÉE PAR TALENT (v0.862) : les exemplaires d'un même talent sont
// regroupés du meilleur au pire, les groupes ordonnés par leur meilleur exemplaire.
const talentsView = computed(() => {
  const entries = (char.row?.talents ?? [])
    .map((inst) => {
      const def = talentByCode(inst.code);
      if (!def) return null;
      const tier = tierOf(inst); // rang + qualité (grade fixé au drop)
      const enchant = inst.enchant ?? 0; // +N magnitude (gamble)
      // Magnitude RÉELLE (rang × jet × niveau d'objet) : départage deux exemplaires du même
      // talent — le jet seul ignore le niveau d'objet.
      const mag = talentValue(def, tier, enchant, talentRollOf(inst), inst.level ?? 1);
      return {
        id: inst.id,
        inst,
        def,
        tier,
        enchant,
        mag,
        rarity: talentRank(tier),
        // Le ROLL brut sert au TRI (plus fin qu'un affichage), l'ÉTOILE à l'affichage.
        roll: talentRollOf(inst),
        star: talentStar(inst),
        level: inst.level ?? 1, // NIVEAU d'objet (ilvl)
        // 1 décimale : les bonus de talent sont petits → l'arrondi entier masquait les écarts.
        effLabel: (mag * 100).toFixed(1).replace('.', ',') + ' %',
        equipped: !!inst.equipped,
      };
    })
    .filter((t): t is NonNullable<typeof t> => !!t);
  return groupBestFirst(
    entries,
    (t) => t.inst.code,
    // RANG d'abord, puis la magnitude entre exemplaires du même talent (le jet entre deux
    // talents différents, dont les magnitudes ne se comparent pas), puis le nom.
    (a, b) =>
      b.tier - a.tier ||
      (a.inst.code === b.inst.code ? b.mag - a.mag : b.roll - a.roll) ||
      a.def.name.localeCompare(b.def.name),
  ).map((g) => ({
    ...g.item,
    groupStart: g.groupStart,
    groupSize: g.groupSize,
    groupKey: g.groupKey,
  }));
});
function talentName(inst: TalentInstance): string {
  return talentByCode(inst.code)?.name ?? 'Talent';
}
function talentIcon(inst: TalentInstance): string {
  return talentByCode(inst.code)?.icon ?? '✨';
}
// Explique un talent (nature de l'effet + comment il monte) au tap sur son icône.
function explainTalent(t: (typeof talentsView.value)[number]) {
  const d = t.def;
  $q.dialog({
    title: `${d.icon} ${d.name}`,
    html: true,
    message:
      `Améliore : <b>${d.desc}</b> — actuellement <b>+${t.effLabel}</b> ` +
      `(${gradeLabel({ rarity: t.rarity, roll: t.roll })}).<br><br>` +
      `Son <b>grade</b> (rang + qualité) est fixé au drop : trouve mieux en explorant plus ` +
      `profond ; vends les surplus pour de l'or.`,
  });
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
  if (!uid) return; // intendance : rien à voir avec la présence du héros
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
  if (!uid) return;
  await char.unequipTalent(uid, id);
}
// REMPLACER : retire le talent désigné par le meilleur swap (même code, ou le moins utile
// si les emplacements sont pleins) puis équipe celui-ci — swap direct.
async function doSwapTalent(id: string) {
  const uid = auth.user?.id;
  if (!uid) return;
  const rid = talReplaceId(id);
  if (rid) await char.unequipTalent(uid, rid);
  await char.equipTalent(uid, id, c.value.level.level);
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
/** Carte des mondes dépliée ? ⚠️ TOUJOURS repliée à l'ouverture, plus mémorisée : dépliée
 *  une fois, elle se rouvrait à chaque lancement de l'app (signalé par l'utilisateur).
 *  Repliée, le prochain donjon s'affiche sous le bandeau — c'est l'état qu'on veut revoir. */
const worldOpen = ref(false);
/** Le bandeau n'est un bouton que hors tiroir de région : ses attributs et son geste
 *  suivent ce seul invariant, écrit une fois. */
const foldAttrs = computed(() =>
  regionView.value ? {} : { role: 'button', tabindex: 0, 'aria-expanded': worldOpen.value },
);
function foldToggle() {
  if (!regionView.value) worldOpen.value = !worldOpen.value;
}
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
// Dernière région (fin de monde) — le Portail sans fin s'y rattache.
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
    char.advList,
  ),
);
const bestiaryList = computed(() => bestiary(clearedIds.value));
// ⚠️ Chemins qui ont échoué au chargement : l'emoji reprend leur place (jamais d'image
// cassée). Un `Set` dans un `ref` reste réactif à `.add`, donc la grille se re-rend.
const bestArtFailed = ref(new Set<string>());
function bestArt(name: string): string | null {
  const a = monsterArt(name);
  return a && !bestArtFailed.value.has(a) ? a : null;
}
/** 🏅 Le roster ENTIER, marqué possédé ou non — le teasing déjà en place pour le
 *  bestiaire. ⚠️ Aucun taux : c'est l'écran d'invocation qui les vend. */
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
// ses 3 paliers (2/4/6 pièces), le 6-pièces = capstone gaté par la voie. Bonus affichés à
// leur valeur de BASE (rang C de référence, cf. setBonusMult). Ma voie surlignée.
const setsCatalogOpen = ref(false);
const voieSetsCatalog = computed(() =>
  ITEM_SETS.map((s) => ({
    id: s.id,
    emoji: s.emoji,
    name: s.name,
    theme: s.theme,
    signature: s.signature,
    voieName: setVoieName(s.id),
    mine: isMySetId(s.id),
    tiers: s.tiers.map((t) => ({
      pieces: t.pieces,
      label: effectLabelFor(t.type, t.base),
      capstone: t === s.tiers[s.tiers.length - 1],
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
    // Le rapport se ferme → si une nouvelle zone vient d'être débloquée, on joue le reveal
    // (slide + explosion sur la carte) UNIQUEMENT si on reste sur l'onglet Explorer (fermeture
    // normale). Si le joueur a cliqué Sac/Talents (tab déjà changé), on GARDE le reveal en
    // attente → il se jouera à son retour sur la carte des donjons (cf. watch ci-dessous) et
    // n'écrase PAS sa navigation (bug : le reveal ramenait le joueur sur la carte).
    if (pendingRegionReveal.value && tab.value === 'explore') {
      const rev = pendingRegionReveal.value;
      pendingRegionReveal.value = null;
      triggerRegionReveal(rev);
    }
  }
});
// Reveal DIFFÉRÉ : si le joueur avait quitté le rapport vers le Sac/Talents, on joue le
// reveal de zone quand il revient sur la carte des donjons (Explorer › Donjons).
watch([tab, exploreSub], ([t, sub]) => {
  if (t === 'explore' && sub === 'donjons' && !reportOpen.value && pendingRegionReveal.value) {
    const rev = pendingRegionReveal.value;
    pendingRegionReveal.value = null;
    triggerRegionReveal(rev);
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
// Passer automatiquement l'animation des combats DÉJÀ FAITS et gagnés d'avance (≥ 90 %) — le
// 1er passage reste animé (découverte) — ou de TOUS les combats si le joueur l'a choisi
// (réglage retenu sur l'appareil). Le rapport DIT pourquoi (`skipReason`), sinon l'absence
// d'animation se lit comme un bug. Règle : `lib/stageSkip`.
const skipReason = ref<StageSkipReason>(null);
const SKIP_FIGHTS_KEY = 'muscu:adv:skip-fights';
function readSkipFights(): boolean {
  try {
    return localStorage.getItem(SKIP_FIGHTS_KEY) === '1';
  } catch {
    return false;
  }
}
const alwaysSkipFights = ref(readSkipFights());
watch(alwaysSkipFights, (v) => {
  try {
    localStorage.setItem(SKIP_FIGHTS_KEY, v ? '1' : '0');
  } catch {
    // Stockage indisponible : le réglage vaut pour la visite.
  }
});
function skipAlways() {
  alwaysSkipFights.value = true;
  skipStage();
}
// Coupe le rejeu en cours : `stageSkipped` démonte CombatStage (donc son interval)
// au lieu de le laisser tourner sous le résultat révélé.
function skipStage() {
  stageSkipped.value = true;
  stageFinish();
}
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
// Chorégraphie spatiale de la dernière run d'arène (null pour les autres modes).
const arenaWaves = ref<StageWave[] | null>(null);
// Y a-t-il quelque chose à rejouer ? (plateau d'arène OU duel de donjon/boss)
// Plein écran de l'arène : le combat s'y joue, le rapport ne vient qu'après.
const arenaOpen = ref(false);
const riftReplay = ref<PartyResult | null>(null);
// ▶️ Il se lance aussi tout seul : à l'arrivée sur la faille, ou à la prochaine ouverture.
useRiftAutoReplay(riftReplay);
function onArenaDone() {
  arenaOpen.value = false;
  openReport();
}
// L'arène est TOUJOURS jouée en plein écran → le rapport ne la rejoue jamais ; il
// s'ouvre directement sur le résultat et le butin.
const hasStage = computed(() =>
  run.value?.kind === 'arena' ? false : stageFights.value.length > 0,
);
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
  const reason = hasStage.value
    ? stageSkipReason({
        always: alwaysSkipFights.value,
        firstVisit: lastRunFirstVisit.value,
        winPct: runWinPct,
      })
    : null;
  const skipAll = reason !== null;
  skipReason.value = reason;
  stageSkipped.value = skipAll;
  stageWasReward.value = !!char.row?.pending_reward; // boss : latch pour ne pas rejouer
  stageDone.value = !hasStage.value || skipAll;
  reportOpen.value = true;
  if (stageDone.value) {
    flushCelebrations(); // pas d'animation → célébrations tout de suite
    revealDrops();
  }
}
// Dernier lieu combattu → « Réattaquer » relance exactement le même run.
const lastDungeon = ref<Dungeon | null>(null);
const lastBoss = ref<MilestoneBoss | null>(null);
const lastEndless = ref(false);
const lastArena = ref(false); // dernier run = Portail sans fin
const reattackCost = computed(() => {
  if (lastArena.value) return arenaCost.value;
  if (lastEndless.value) return endlessEnergy(nextEndlessTier.value);
  if (lastBoss.value) return summonCostFor(lastBoss.value); // boss = pierres d'invocation 🔮
  if (lastDungeon.value) return lastDungeon.value.energyCost;
  return 0;
});
// La ressource dépend du type de run : le boss se paie en pierres d'invocation 🔮,
// donjon/portail en énergie ⚡ → le logo du bouton Réattaquer suit.
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
  if (lastArena.value) void enterArena();
  else if (lastEndless.value) void fightEndless();
  else if (lastBoss.value) void fightBoss(lastBoss.value);
  else if (lastDungeon.value) void explore(lastDungeon.value);
}
// « Combat suivant » : le contenu APRÈS le dernier combattu (donjon/boss suivant de la
// chaîne, s'il est DÉBLOQUÉ = le courant vient d'être nettoyé/vaincu). Le Portail sans fin
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
// Où revenir quand on ferme le Sac/Talents ouvert DEPUIS le rapport (on ne « largue » pas
// le joueur sur l'onglet Équipement/Héros : il retourne à l'écran d'où il venait, ex. Donjons).
const reportNavReturn = ref<{ tab: typeof tab.value; sub: typeof exploreSub.value } | null>(null);
function goInventoryFromReport() {
  reportNavReturn.value = { tab: tab.value, sub: exploreSub.value }; // mémorise l'origine (ex. Donjons)
  reportOpen.value = false;
  tab.value = 'gear';
  betterFilterSlot.value = null;
  bagOpen.value = true; // ouvre directement la modale Sac
}
// Depuis le rapport d’un BOSS → « Mes sets », où ses pièces viennent d’être rangées.
function goSetsFromReport() {
  reportOpen.value = false;
  loadoutOpen.value = true;
}
// Depuis le rapport, quand un talent est tombé → ouvre la collection Talents (ticket bb384013).
function goTalentsFromReport() {
  reportNavReturn.value = { tab: tab.value, sub: exploreSub.value };
  reportOpen.value = false;
  tab.value = 'hero';
  talentsOpen.value = true;
}
// Fermeture du Sac/Talents ouvert depuis le rapport → on RESTAURE l'écran d'origine.
watch([bagOpen, talentsOpen], ([bag, tal]) => {
  if (!bag && !tal && reportNavReturn.value) {
    tab.value = reportNavReturn.value.tab;
    exploreSub.value = reportNavReturn.value.sub;
    reportNavReturn.value = null;
  }
});

// Butin possible d'un donjon (affiché à la demande via 🎁).
const dropInfo = ref<Dungeon | null>(null);
function openDrops(d: Dungeon) {
  dropInfo.value = d;
}
// Distribution des RANGS d'un drop selon la chance ET le niveau du donjon (Monte-Carlo
// sur rollTier → toujours en phase avec le modèle). Ne montre que les rangs qui
// apparaissent, du plus bas au plus haut. ⚠️ Un rang rare (le tien en début de rang : 0,3 à
// 3 %) s'affiche « <1 % » : l'arrondir à 0 cacherait la possibilité même qu'il faut montrer.
// `computed` : 4 000 tirages une fois par donjon ouvert, pas à chaque rendu.
const dropOdds = computed(() => {
  const d = dropInfo.value;
  if (!d) return [];
  const level = d.dropLevel;
  const luck = d.dropLuck;
  const playerLevel = heroLevel.value;
  const rng = mulberry32((Math.round(level * 131 + luck * 997 + playerLevel * 7) >>> 0) + 1);
  const N = 4000;
  const counts = new Array(RANK_ORDER.length).fill(0) as number[];
  for (let i = 0; i < N; i++)
    counts[RARITY_RANK[rollTier(rng, level, luck, 0, playerLevel).rank]]!++;
  return RANK_ORDER.map((r, i) => {
    const p = (counts[i]! / N) * 100;
    return {
      label: rarityRank(r).name,
      pct: p >= 1 ? String(Math.round(p)) : '<1',
      cls: 'r-' + r,
      n: counts[i]!,
    };
  }).filter((o) => o.n > 0);
});

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
      signature: s.signature,
      count,
      mine,
      // Le bonus de set est scalé par le RANG moyen des pièces (cf. setEffects, #3).
      tiers: s.tiers.map((t) => {
        const capstone = t === s.tiers[s.tiers.length - 1];
        return {
          pieces: t.pieces,
          label: setTierLabel(t.type, t.base, pieces),
          capstone,
          // Paliers 2/4 : actifs dès le compte atteint. Dernier palier (capstone) : + voie correspondante.
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
  return `${gradeLabel(eq)} · ${itemEffects(eq)}`;
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
  const idx = voieSetIndex(it);
  if (idx < 0) return null;
  const existing = char.row?.loadouts?.[idx]?.items?.[it.slot];
  if (!existing) return { text: '📦 emplacement libre → rangée', cls: 'good' };
  // Même barème et même règle que le rangement (`fileSetPieces`) : l'annonce ne peut pas
  // promettre autre chose que ce qui se passera.
  return setScore.value(it) > setScore.value(existing)
    ? { text: '📦 meilleure que ta pièce rangée → la remplace', cls: 'good' }
    : { text: '📦 ≤ ta pièce rangée → rangée en doublon', cls: 'bad' };
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
  if (diff > 0) return { label: '↑ rang supérieur', cls: 'up' };
  if (diff < 0) return { label: '↓ rang inférieur', cls: 'down' };
  return { label: '≈ même rang', cls: 'same' };
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

// ⚔️ ARÈNE — MASQUÉE (v0.654). Le mini-jeu plein écran ne convainc pas encore, on
// retire l'entrée plutôt que le code : la simulation (`runArena`), la mise en scène
// (`arenaStage.ts`), le plateau (`ArenaStage.vue`) et leurs tests restent intacts.
// Pour la rouvrir : repasser ce drapeau à `true`, rien d'autre.
const ARENA_ENABLED = false;

// Arène : on rejoue les vagues dans le MÊME rapport que les donjons (donc le rejeu
// animé, les PV reportés et l'affichage du butin sont acquis sans rien réécrire).
const arenaCost = computed(() => arenaEnergyCost(c.value.level.level));
async function enterArena() {
  const uid = auth.user?.id;
  if (expeBlocked()) return;
  if (!uid || !char.row || busy.value || c.value.energy < arenaCost.value) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastDungeon.value = null;
  lastBoss.value = null;
  lastEndless.value = false;
  lastArena.value = true;
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
    const r = runArena(player, c.value.level.level, seed);
    // Mise en scène spatiale : purement dérivée de `r`, elle ne change aucun résultat.
    arenaWaves.value = buildArenaStage(r, seed, c.value.level.level);
    const rw = arenaRewards(r.waves, c.value.level.level);
    const goldPct = aggregateEffects(char.row.equipped).goldPct + talentFx.value.goldPct;
    const gold = Math.round(rw.gold * (1 + goldPct));
    // Un tirage par palier de vagues franchi ; la luck monte avec les vagues tenues.
    const dropRng = mulberry32((seed ^ 0x5bf03635) >>> 0);
    const drops: Item[] = [];
    for (let i = 0; i < rw.drops; i++) {
      const rolled = rollDrop(dropRng, {
        cleared: true,
        defeated: 1,
        level: c.value.level.level,
        spread: 1,
        luck: Math.min(1, rw.luck + (lucky ? 0.5 : 0) + mfLuck()),
        playerLevel: c.value.level.level,
        relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
      });
      if (rolled) {
        const dr: Item = { ...rolled, id: crypto.randomUUID() };
        drops.push(dr);
        queueFx(() => celebrateRareDrop(dr));
      }
    }
    await char.applyRun(uid, {
      energyCost: arenaCost.value,
      gold,
      drops,
    });
    run.value = {
      name: `Arène — ${r.waves} vague${r.waves > 1 ? 's' : ''}`,
      kind: 'arena',
      cleared: false, // on meurt toujours : c'est le principe
      defeated: r.waves,
      total: r.fights.length,
      gold,
      finalPv: r.finalPv,
      playerMaxPv: player.pv,
      fights: r.fights.map((f) => ({
        monster: f.monster,
        emoji: '👹',
        win: f.win,
        rounds: f.rounds,
        maxPv: f.maxPv,
        archetype: 'brute',
        log: f.log,
      })),
      drops,
    };
    // L'arène se joue en PLEIN ÉCRAN, pas dans la modale de rapport (qui la bridait à
    // 244 px de haut). Le rapport — butin, or, réattaque — s'ouvre à la fin du combat.
    // On bump `runSeq` ICI : c'est la clé du plateau, sans quoi un « Réattaquer »
    // réutiliserait le composant monté et l'animation ne repartirait pas.
    runSeq.value++;
    arenaOpen.value = true;
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Arène indisponible.',
    });
  } finally {
    busy.value = false;
  }
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
  lastArena.value = false;
  arenaWaves.value = null;
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
    // Butin (RNG dérivé du seed du run). UN drop possible PAR MONSTRE VAINCU (comme le
    // Labyrinthe) : chaque monstre battu tente un butin (chance interne de rollDrop) → farmer
    // un donjon rapporte plus d'objets, proportionnel au nombre de monstres nettoyés.
    const dropRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const drops: Item[] = [];
    const dropLuck = Math.min(1, d.dropLuck + (lucky ? 0.5 : 0) + mfLuck());
    for (let i = 0; i < r.defeated; i++) {
      const rolled = rollDrop(dropRng, {
        cleared: r.cleared,
        defeated: 1,
        level: d.dropLevel,
        spread: 1, // le donjon peut lâcher un cran sous son niveau (fourrage à upgrader)
        luck: dropLuck,
        playerLevel: c.value.level.level,
        relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
      });
      if (rolled) {
        const dr: Item = { ...rolled, id: crypto.randomUUID() };
        drops.push(dr);
        queueFx(() => celebrateRareDrop(dr));
      }
    }
    // (Les familiers ne tombent PLUS dans les donjons — uniquement au Labyrinthe.)
    // (Les consommables ne DROPPENT plus — peu utiles ; restent achetables en boutique.)
    // Pierres d'invocation 🔮 : lot au NETTOYAGE, ∝ profondeur du donjon → farmer plus
    // profond finance des boss plus hauts. Un boss de palier coûte ~2-6 pierres → 2-6 runs.
    const summonStones = r.cleared ? dungeonSummonStones(d) : 0;
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
      ...(r.cleared ? { clearedDungeonId: d.id } : {}),
      ...(talentDrops.length ? { talentDrops } : {}),
      // Dressage d'ATTAQUE : ∝ la profondeur du donjon et ce qu'on y a abattu.
    });
    // En bandeau, comme au boss : un donjon se refarme, un éclat plein écran bloquerait la suite.
    if (talentDrops.length) queueFx(() => celebrateTalentDrop(talentDrops[0]!, true));
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
          // ⚠️ Les PV du combattant RÉEL (mis à l'échelle), jamais ceux du bestiaire.
          maxPv: f.maxPv,
          archetype: mon ? monsterArchetype(mon) : 'normal',
          log: f.result.log,
        };
      }),
      drops,
      ...(talentDrops.length ? { talentDrops } : {}),
      ...(summonStones ? { summonStones } : {}),
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
// Coût d’un boss en pierres d’invocation 🔮 (∝ palier). ⚠️ L’Autel ne le réduit plus (v0.799).
// % de réussite RÉEL sur un boss (null = jamais tenté depuis que les tentatives sont comptées).
const bossSuccess = (b: MilestoneBoss) => runSuccessPct(char.row?.boss_stats ?? {}, b.id);
const bossRuns = (b: MilestoneBoss) => char.row?.boss_stats?.[b.id]?.runs ?? 0;

function summonCostFor(b: MilestoneBoss): number {
  return bossSummonCost(b.unlockLevel);
}
// Déblocage : Autel des boss construit ET chaîne des BOSS (boss précédent vaincu).
// Pas de gate de niveau → le 🎯 % de victoire indique si le combat est jouable.
function bossUnlocked(b: MilestoneBoss): boolean {
  if (!hasBossAltar.value) return false;
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i <= 0 || defeatedBossSet.value.has(order[i - 1]!.id);
}
// Boss affichés : tous ceux déjà débloqués + le PROCHAIN à débloquer, et pas ceux
// d'après — la liste montre où l'on en est, pas toute la chaîne verrouillée.
const visibleBosses = computed(() => {
  const order = bossChain.value;
  const next = order.findIndex((b) => !bossUnlocked(b));
  return next < 0 ? order : order.slice(0, next + 1);
});
function bossLockReason(b: MilestoneBoss): string {
  if (!hasBossAltar.value) return '🔮 Construis l’Autel des boss (carte)';
  const order = bossChain.value;
  const i = order.findIndex((x) => x.id === b.id);
  return i > 0 ? `Bats d’abord « ${order[i - 1]!.name} »` : '';
}
// Libellé des 2 stats d'un objet (primaire · secondaire). Les anciens objets
// (1 stat) n'affichent que la primaire.
function itemEffects(it: Omit<Item, 'id'>): string {
  if (it.power) return relicPowerText(it);
  // OBJETS ET FAMILIERS : magnitude 100 % définie par le drop (grade × qualité, bakée
  // dans effect.value) → libellé direct, 1 décimale (la qualité reste visible, #6).
  const parts = [affixText(it, it.effect)];
  if (it.effect2) parts.push(affixText(it, it.effect2));
  if (it.effect3) parts.push(affixText(it, it.effect3));
  const leg = legendaryOf(it);
  if (leg) parts.push(`${leg.emoji} ${leg.name}`);
  return parts.join(' · ');
}
/** Les mêmes lignes que `itemStatLines`, découpées autour du CHIFFRE pour le mettre en avant
 *  (v0.1074). ⚠️ Seules les STATS sont découpées : le pouvoir d'une relique et un effet
 *  légendaire sont des phrases, on n'y met pas un nombre en gras au hasard. */
function itemStatRows(it: Omit<Item, 'id'>): StatParts[] {
  const whole = (pre: string): StatParts => ({ pre, value: '', post: '' });
  if (it.power) return [whole(relicPowerText(it))];
  const rows = [it.effect, it.effect2, it.effect3]
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => splitStat(affixText(it, e)));
  const leg = legendaryOf(it);
  if (leg) rows.push(whole(`${leg.emoji} ${leg.name}`));
  return rows;
}
// Stats d'un objet en LIGNES séparées (une stat par ligne) + proc légendaire → affichage clair.
function itemStatLines(it: Omit<Item, 'id'>): string[] {
  if (it.power) return [relicPowerText(it)];
  const lines = [affixText(it, it.effect)];
  if (it.effect2) lines.push(affixText(it, it.effect2));
  if (it.effect3) lines.push(affixText(it, it.effect3));
  const leg = legendaryOf(it);
  if (leg) lines.push(`${leg.emoji} ${leg.name}`);
  return lines;
}
// Valeurs d'affixe (scalées au niveau) d'un objet, indexées par TYPE de stat.
function affixValues(it: Omit<Item, 'id'>): Map<string, number> {
  const m = new Map<string, number>();
  const add = (e?: { type: string; value: number }) => {
    if (e) m.set(e.type, round1(e.value * itemLevelMult(it.level)));
  };
  add(it.effect);
  add(it.effect2);
  add(it.effect3);
  return m;
}
// Stats d'un objet, chacune COMPARÉE au stat du même type de `other` → vert si supérieure,
// rouge si inférieure (toutes les stats sont « + haut = mieux »). Le proc légendaire = neutre.
function itemStatCmp(
  it: Omit<Item, 'id'>,
  other?: Omit<Item, 'id'> | null,
): { text: string; cls: string }[] {
  const om = other ? affixValues(other) : new Map<string, number>();
  const out: { text: string; cls: string }[] = [];
  const push = (e?: { type: Parameters<typeof effectLabelFor>[0]; value: number }) => {
    if (!e) return;
    const v = round1(e.value * itemLevelMult(it.level));
    const ov = om.get(e.type);
    // Stat absente en face → NEUTRE (pas de vert) ; sinon vert si supérieure, rouge si inférieure.
    const cls = ov == null ? '' : v > ov ? 'up' : v < ov ? 'down' : '';
    out.push({ text: effectLabelFor(e.type, v), cls });
  };
  push(it.effect);
  push(it.effect2);
  push(it.effect3);
  const leg = legendaryOf(it);
  if (leg) out.push({ text: `${leg.emoji} ${leg.name}`, cls: '' });
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
      message: 'Construis l’Autel des boss (dans ton village) pour affronter les boss.',
    });
    return void (tab.value = 'base');
  }
  if (!bossUnlocked(b)) return;
  if (char.row.pending_reward) {
    $q.notify({ type: 'warning', message: 'Choisis d’abord ta récompense en attente.' });
    return;
  }
  lastBoss.value = b;
  lastDungeon.value = null;
  lastEndless.value = false;
  lastArena.value = false;
  arenaWaves.value = null;
  // 1re fois sur ce boss ? (capturé AVANT applyBossWin qui l'ajoute à defeated_bosses)
  // → 1er passage toujours animé, réaffrontements gagnés d'avance = skip.
  lastRunFirstVisit.value = !defeatedBossSet.value.has(b.id);
  busy.value = true;
  try {
    const { extra } = runExtra();
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
    // Victoire → UN drop (pièce de set de voie au hasard), comme un donjon (rapport standard,
    // Équiper/Casser/Vendre inline). Plus de choix à 3 candidats ni de lot or-seul.
    const dropRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const rollFloor = bossAltarRollFloor(char.row?.buildings ?? []);
    const drops: Item[] = [];
    if (win) {
      const piece = rollSetPiece(dropRng, {
        setId: randomVoieSetId(dropRng),
        level: b.dropLevel,
        luck: Math.min(1, 0.6 + mfLuck()), // boss généreux (+ magic find)
        rollFloor,
        playerLevel: c.value.level.level,
      });
      const dr: Item = { ...piece, id: crypto.randomUUID() };
      drops.push(dr);
      // Boss = on enchaîne les tentatives : le drop s'annonce en bandeau discret, jamais
      // en overlay bloquant (plusieurs overlays d'affilée gelaient « Réattaquer »).
      queueFx(() => celebrateRareDrop(dr, true));
    }
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
    // La pièce de set attend au sac que le drop soit RÉVÉLÉ : `autoFileSetPieces` ne range
    // rien pendant un combat (`busy`) ni pendant son animation (cf. plus bas).
    await char.applyBossWin(uid, {
      bossId: b.id,
      summonCost,
      gold,
      defeated: win,
      drops,
      ...(talentDrops.length ? { talentDrops } : {}),
      // Dressage d'ATTAQUE : le familier se bat aussi contre les boss.
    });
    if (talentDrops.length) queueFx(() => celebrateTalentDrop(talentDrops[0]!, true));
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
      drops,
      ...(talentDrops.length ? { talentDrops } : {}),
    };
    // Victoire de boss de palier = jalon MAJEUR → célébration centrale (gros éclat),
    // DIFFÉRÉE à la fin de l'animation de combat. ⚠️ Seulement la PREMIÈRE fois : un
    // boss refarmé n'est plus un jalon, et l'overlay bloquait l'écran à chaque tentative.
    const firstWin = lastRunFirstVisit.value;
    if (win)
      queueFx(() =>
        gameFx.celebrate({
          quiet: !firstWin,
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

// ── Portail sans fin (end-game infini) ──
// Le Portail sans fin est le TOUT dernier maillon : débloqué une fois le DERNIER
// donjon de la chaîne nettoyé (le contenu procédural fini va jusqu'à reco ~94 →
// le Portail infini prend le relais). Repli : au moins l'Archidémon vaincu.
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
  lastArena.value = false;
  arenaWaves.value = null;
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
          luck: Math.min(1, 0.6 + (lucky ? 0.4 : 0) + mfLuck()),
          playerLevel: c.value.level.level,
          relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
        });
      }
      if (rolled) {
        const dr: Item = { ...rolled, id: crypto.randomUUID() };
        drops.push(dr);
        queueFx(() => celebrateRareDrop(dr));
      }
      // (Les familiers ne tombent PLUS au Portail — uniquement au Labyrinthe.)
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
    // Nouveau palier RECORD du Portail → célébration (progression end-game),
    // différée à la fin de l'animation de combat.
    if (win && tier > prevBest)
      queueFx(() =>
        gameFx.celebrate({
          kind: 'generic',
          emoji: '🌀',
          title: `${ENDLESS_NAME} · palier ${tier} !`,
          subtitle: 'Nouveau record de profondeur',
          rarity: 'legendary',
        }),
      );
    run.value = {
      name: `${ENDLESS_NAME} · palier ${tier}`,
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

/** ⚠️ NE GÈLE PLUS RIEN pendant une expédition. **Les stocks sont en VILLE, pas sur le
 *  héros** : trier son sac, verrouiller une pièce, recycler du fourrage, céder un familier
 *  ou changer ses talents sont des gestes d'intendance qui n'exigent la présence de
 *  personne. Les geler ne protégeait aucune règle — ça bloquait le joueur pendant des
 *  heures, précisément sur l'écran où il a le plus de choses à faire en attendant.
 *  Ce qui reste interdit, c'est ce qui demande le HÉROS lui-même : donjons, boss, portail,
 *  arène, Labyrinthe, nouvelle expédition. Un seul garde pour ça : `expeBlocked`. */
function withUid(fn: (uid: string) => Promise<unknown>, errMsg: string) {
  const uid = auth.user?.id;
  if (!uid) return;
  fn(uid).catch(() => $q.notify({ type: 'negative', message: errMsg }));
}

// ── Mode idle « Expédition » : gel des autres modes + cycle de vie + messagerie ──
const onExpedition = computed(() => !!char.row?.expedition);
/** Le héros est-il indisponible ? Deux causes, un seul garde — tous les modes de jeu
 *  passent déjà par lui, la convalescence s'y greffe donc sans toucher un call site. */
function expeBlocked(): boolean {
  if (heroWounded.value) {
    $q.notify({
      type: 'warning',
      message: `🤕 Ton héros est à l’infirmerie — de retour dans ${fmtExpeMs(heroHealIn.value)}.`,
    });
    return true;
  }
  if (!onExpedition.value) return false;
  $q.notify({
    type: 'warning',
    message: '🧭 Ton héros est en expédition — indisponible jusqu’à son retour.',
  });
  return true;
}
const expeNow = ref(Date.now());
const expeHero = computed(() =>
  char.row?.expedition ? travelPosition(char.row.expedition, expeNow.value) : null,
);
const unreadMessages = computed(
  () => (char.row?.messages ?? []).filter((m) => !m.read || isClaimable(m, expeNow.value)).length,
);
const inboxOpen = ref(false);
function openInbox() {
  inboxOpen.value = true;
  const uid = auth.user?.id;
  if (uid) void char.expeMarkRead(uid);
}
// ── DÉFENSE DE LA BASE ──
// Le siège se résout par HORLOGE, comme les expéditions : le tick d'une seconde suffit,
// et si l'app est restée fermée, la première ouverture rattrape tout d'un coup.
const baseRaid = computed(() => char.row?.base?.raid ?? null);
const baseFrozen = computed(() => !!char.row?.base?.freeze);
/** Ce qui doit se voir SANS ouvrir l'onglet : une armée en route, une production à
 *  l'arrêt, un héros à l'infirmerie.
 *  ⚠️ PLUS LES CORPS : le butin est crédité à la résolution et figure dans le rapport
 *  (demandé). Le champ de bataille n'appelle plus aucune action — appeler pour du
 *  décor, c’est user la pastille pour rien. */
/** Rapport dont l'assaut n'a pas encore été REJOUÉ. Tant qu'il est posé, le plateau
 *  s'ouvre : on découvre l'issue par l'animation, jamais par une notification. */
const siegeReport = ref<RaidReport | null>(null);
/** ⭐ Ce que le siège a changé pour les défenseurs, annoncé à la FERMETURE du rejeu :
 *  pendant, l'annonce recouvrirait l'animation et révélerait l'issue qu'elle doit dévoiler. */
const siegeAdvProgress = ref<AdvProgress[]>([]);
function onSiegeSeen() {
  siegeReport.value = null;
  advFx.announce(siegeAdvProgress.value);
  siegeAdvProgress.value = [];
}
const baseAlert = computed(() => !!baseRaid.value || baseFrozen.value || heroWounded.value);

/** SÉANCES des 7 derniers jours — c'est ce qui règle la fréquence des sièges : une
 *  séance, un siège (`raidIntervalMs`).
 *
 *  ⚠️ On compte les SÉANCES, plus les JOURS DISTINCTS. L'ancien calcul plafonnait à 7 :
 *  quelqu'un qui s'entraîne trois fois par jour était au même régime que quelqu'un qui
 *  bouge une fois par jour, et tout son volume supplémentaire ne lui rapportait aucun
 *  contenu. Le siège étant un ROBINET (butin, cadavres, ferraille), « plus actif = plus
 *  attaqué » se lit comme plus de jeu, jamais comme une punition de l'entraînement. */
/** Les jours d'entraînement de la semaine écoulée — ce qui règle le rythme des sièges.
 *  ⚠️ Des JOURS, pas des séances : cf. `activityDays.ts`. */
const activeDays7 = computed(() => progress.activeDaysInLast(7));

/** Dépose le coffre des Défis 360 terminés qui n'en ont pas encore.
 *
 *  ⚠️ Un BALAYAGE, pas un événement. Un 360 peut se boucler depuis trois écrans
 *  différents (détail, onglet, séance générée), et le coffre vit dans la boîte de
 *  l'Aventure : accrocher le versement à un seul de ces chemins en aurait fait perdre.
 *  On repasse donc en revue à chaque ouverture — `grantComboChest` étant idempotent
 *  (l'id du message dérive de celui du défi), repasser ne coûte rien.
 *
 *  Les séries comptées sont celles que le jeu compte DÉJÀ pour l'XP (`comboCountedSets`,
 *  plafonnées au palier maximal) : pas de second barème, donc pas de divergence possible. */
async function grantPendingComboChests() {
  const uid = auth.user?.id;
  // ⚠️ `progress.ready` est OBLIGATOIRE ici : le niveau vient de l'XP de fond, chargée en
  // tâche de fond. Sans cette garde, un balayage au montage versait un coffre de NIVEAU 1
  // — et le versement étant idempotent, l'erreur ne se serait jamais rattrapée.
  if (!uid || !char.row || !progress.ready.value) return;
  try {
    await combo.fetchMine();
    // ⚠️ FENÊTRE COURTE, ET C'EST LE CŒUR DU CORRECTIF. Sans borne, ce filet a raflé
    // TOUT l'historique : cinq 360 terminés bien avant que le coffre n'existe ont produit
    // cinq coffres d'un coup (~1 600 🔩 et 190 🔮 d'aubaine). Un défi bouclé avant la
    // règle n'a rien gagné sous cette règle. Le filet ne sert qu'à rattraper un versement
    // qui vient d'échouer (réseau coupé au moment de la dernière série) — pas à récompenser
    // le passé. Le chemin normal est le signal immédiat (`useComboChest`).
    // On date le défi par sa DERNIÈRE SÉRIE — l'instant où il s'est réellement bouclé.
    // (`updated_at` existe en base mais pas dans le type métier : la date des séries est
    // à la fois disponible et plus juste.)
    const JOURS = 2;
    const limite = new Date(Date.now() - JOURS * 86400_000).toISOString().slice(0, 10);
    for (const co of combo.list) {
      if (co.status !== 'done') continue;
      const dates = co.legs.flatMap((l) => (l.sets ?? []).map((x) => x.date)).filter(Boolean);
      const derniere = dates.length ? dates.reduce((m, d) => (d > m ? d : m)) : '';
      if (derniere < limite) continue;
      await depositComboChest(uid, co, c.value.level.level);
    }
  } catch (e) {
    console.error('coffre 360', e);
  }
}

/** Aligne les notifications programmées sur l’état du jeu.
 *  ⚠️ FREINÉ : `baseLifecycle` tourne à la seconde, or synchroniser écrit en base.
 *  Toutes les 5 min suffit — les échéances qu’on annonce se comptent en heures. */
const push = usePush();
let lastPushSync = 0;
const PUSH_SYNC_MS = 5 * 60_000;
async function syncPush(force = false) {
  const uid = auth.user?.id;
  if (!uid || !char.row) return;
  const now = Date.now();
  if (!force && now - lastPushSync < PUSH_SYNC_MS) return;
  lastPushSync = now;
  await push
    .sync(uid, {
      base: char.row.base ?? null,
      expedition: char.row.expedition ? { returnAt: char.row.expedition.returnAt } : null,
      caravans: char.caravanList,
      // ⚔️ Les groupes partis SANS le héros (un groupe avec le héros est son expédition).
      parties: char.partyList.map((g) => ({ id: g.id, returnAt: g.returnAt })),
      watchtowerLevel: defenseLevel(char.row.base?.defenses ?? [], 'watchtower'),
      activeDays7: activeDays7.value,
      playerLevel: c.value.level.level,
    })
    .catch((e) => console.error('push sync', e));
}

let baseBusy = false;
async function baseLifecycle() {
  const uid = auth.user?.id;
  if (!uid || baseBusy || !char.row) return;
  baseBusy = true;
  try {
    const r = await char.baseTick(uid, Date.now(), {
      playerLevel: c.value.level.level,
      activeDays7: activeDays7.value,
      // XP de fond : strictement croissante, donc « a-t-il fait du sport depuis ? » se lit
      // d'une simple comparaison — c'est ce qui dégèle la production.
      globalXp: progress.energyEarned.value,
      hero: fighter.value,
    });
    if (r.detected)
      $q.notify({
        type: 'warning',
        message: `⚠️ Une armée approche de ta base — ${fmtExpeMs(
          Math.max(0, r.detected.arrivesAt - Date.now()),
        )}`,
      });
    // ⚠️ SURTOUT PAS de notification annonçant l'issue : elle spoilerait le siège et
    // retirerait tout enjeu au rejeu. On ouvre le plateau, qui révèle le résultat à la
    // fin. C'est aussi pour ça que l'animation se lance d'office, sans le demander.
    if (r.report) {
      siegeAdvProgress.value = r.advProgress;
      siegeReport.value = r.report;
      tab.value = 'base';
    }
    // Un tick a pu déplacer l’échéance du prochain siège → on réaligne.
    void syncPush(!!r.detected || !!r.report);
  } finally {
    baseBusy = false;
  }
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
    // Le héros rentre : il redevient disponible tout de suite, mais son chargement
    // ATTEND dans la boîte 📬 qu'on vienne le prendre (`doClaim`).
    const settled = await char.expeSettle(uid, Date.now());
    if (settled)
      $q.notify({
        type: 'positive',
        message: '🎉 Héros rentré — son butin t’attend dans 📬.',
      });
    // ⚔️ Les groupes partis sans le héros vivent leur voyage ici aussi : rapport à l'arrivée
    // sur le camp, retour en ville ; le butin attend dans la boîte 📬 (`expeClaim`).
    const partyMsgs = await char.partyTick(uid, Date.now());
    if (partyMsgs.length) {
      $q.notify({
        type: partyMsgs.some((m) => m.win) ? 'positive' : 'warning',
        // ⚠️ App fermée pendant le voyage : le rapport et le retour tombent dans le même tick —
        // le butin n'« attendra » pas, il attend déjà. UNE définition de « prêt »
        // (`isClaimable`) : la moitié DATE de la règle était recopiée ici.
        message: partyMsgs.every((m) => isClaimable(m, Date.now()))
          ? '📬 Ton groupe est rentré — son butin t’attend dans 📬.'
          : '📬 Rapport de ton groupe — le butin t’attendra au retour.',
      });
      // Un groupe en route a changé : l'échéance de son retour se réaligne.
      void syncPush(true);
    }
    await char.expeSyncMap(uid, Date.now(), c.value.level.level);
    await baseLifecycle();
  } finally {
    expeBusy = false;
  }
}
/** Encaisse le butin d'un rapport. La célébration est ici : c'est en prenant le butin
 *  qu'on le découvre, pas pendant qu'on regardait un autre écran. */
async function doClaimMsg(m: ExpeditionMessage) {
  const uid = auth.user?.id;
  if (!uid) return;
  const done = await char.expeClaim(uid, m.id, Date.now());
  if (!done) return;
  advFx.announce(done.advProgress);
  const haul = haulPills(done)
    .map((h) => `${h.emoji} +${h.n}`)
    .join(' · ');
  if (done.chest) {
    // ⚠️ L'animation appartient à l'OUVERTURE, pas à la livraison : le coffre attend dans
    // la boîte, et c'est le geste du joueur qui le déballe. Le butin est dans le
    // sous-titre — un coffre qui s'ouvre sur rien ne raconte rien (trophée compris).
    const loot = messageLoot(done);
    gameFx.celebrate({
      kind: 'chest',
      emoji: '🎁',
      title: messageTitle(done),
      subtitle:
        [loot ? `${SLOT_EMOJI[loot.item.slot]} ${loot.item.name}` : '', haul]
          .filter(Boolean)
          .join(' · ') || undefined,
      rarity: 'legendary',
    });
  } else {
    $q.notify({ type: 'positive', message: `🎁 Butin récupéré ! ${haul || '—'}` });
  }
  const drops = done.items && done.items.length ? done.items : done.item ? [done.item] : [];
  const top = drops.slice().sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity])[0];
  if (top) celebrateRareDrop({ ...top, id: '' }); // même éclat que les drops de donjon
}

/** L'objet d'un message sous forme de liste (0 ou 1) — pour le poser dans un `v-for`. */
function msgLoot(m: ExpeditionMessage) {
  const l = messageLoot(m);
  return l ? [l] : [];
}

function fmtExpeMs(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

// ── Sac : filtre par type d'objet + tri (meilleurs d'abord) ──
const invFilter = ref<ItemSlot | 'all'>('all');
// 🏆 TROPHÉES : ni dans la grille, ni dans le sac du butin. Ils ne tombent que du boss
// entre amis — ils ont leur VITRINE (sous la grille) et leur propre sac (bouton 🏆), et
// « Tout vendre » ne doit jamais les fondre avec le bric-à-brac.
const isTrophy = (i: Item) => i.slot === TROPHY_SLOT;
const equippedTrophy = computed<Item | null>(() => char.row?.equipped[TROPHY_SLOT] ?? null);
const trophyBag = computed<Item[]>(() =>
  (char.row?.inventory ?? [])
    .filter(isTrophy)
    .sort(
      (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || rollJet(b.roll) - rollJet(a.roll),
    ),
);
const ownsTrophy = computed(() => !!equippedTrophy.value || trophyBag.value.length > 0);
/** Ce que la modale du sac montre : le butin, ou les trophées. Un seul rendu de carte
 *  d'objet pour les deux — deux copies de ce bloc divergeraient. */
const bagMode = ref<'items' | 'trophies'>('items');
function openTrophyBag() {
  betterFilterSlot.value = null;
  bagMode.value = 'trophies';
  bagOpen.value = true;
}
function bagCountForSlot(slot: ItemSlot): number {
  return (char.row?.inventory ?? []).filter((i) => i.slot === slot).length;
}
// (Filtre par SET retiré du sac — les pièces de set vivent dans « Mes sets », plus au sac.)
const filteredInventory = computed<Item[]>(() => {
  if (bagMode.value === 'trophies') return trophyBag.value;
  const inv = (char.row?.inventory ?? []).filter((i) => !isFamiliar(i) && !isTrophy(i));
  const bf = betterFilterSlot.value;
  let list: Item[];
  if (bf) {
    // Filtre « badge » : uniquement les objets de ce slot MEILLEURS si équipés.
    const cur = combatPowerVal.value;
    list = inv.filter((i) => i.slot === bf && powerIfEquip(i) > cur);
  } else {
    list = inv.filter((i) => invFilter.value === 'all' || i.slot === invFilter.value);
  }
  return list.sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || rollJet(b.roll) - rollJet(a.roll),
  );
});
// Objets du sac (même slot) MEILLEURS si équipés → badge sur l'item équipé.
//
// ⚠️ LA BASE DE COMPARAISON EST « TON BUILD ACTUEL », et il faut le DIRE. Signalé par
// l'utilisateur : un talisman marqué « +30 » que l'équipement conseillé n'équipait pas.
// Les deux avaient raison — mesuré, il vaut bien +30 sur le build porté, mais −15 dans
// le build OPTIMAL, qui change d'autres pièces et de voie. Deux questions différentes,
// deux réponses justes, et un libellé qui laissait croire à une contradiction. Même
// classe de défaut que le gris de la carte (v0.738) : le calcul était juste, c'est le
// LANGAGE qui trompait.
function betterInBagForSlot(slot: ItemSlot): Item[] {
  const veut = optimum.value?.[slot];
  // ⚠️ 0 ou 1, et c'est le POINT : la pastille annonce désormais « la pièce que le
  // meilleur build veut ici n'est pas celle que tu portes », et rien d'autre. L'ancienne
  // comptait tout ce qui bat la pièce actuelle — souvent plusieurs objets dont AUCUN ne
  // figurait dans l'optimum, d'où deux écrans qui se contredisaient.
  if (!veut || veut.id === equippedInSlot(slot)?.id) return [];
  return (char.row?.inventory ?? []).filter((i) => i.id === veut.id);
}
function betterInBagCount(slot: ItemSlot): number {
  return betterInBagForSlot(slot).length;
}
// Clic sur le badge d'un item équipé → ouvre le Sac (modale) filtré sur ses upgrades.
function showBetterForSlot(slot: ItemSlot) {
  bagMode.value = 'items';
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
const bagCount = computed(
  () => (char.row?.inventory ?? []).filter((i) => !isFamiliar(i) && !isTrophy(i)).length,
);

// ── Loadouts (sets d'équipement rangés) — 1 par VOIE (8 slots) ──
// Slot i ↔ voie i : chaque loadout est l'endroit où ranger le set de cette voie.
const loadoutVoie = (i: number): (typeof VOIES)[number] | null => VOIES[i] ?? null;
// SET DE VOIE ACTUELLEMENT ÉQUIPÉ (≥2 pièces) → marque le loadout correspondant « en cours »
// + bannière dans la vue Équipement. Dominant parmi les 7 emplacements équipés.
/** « Set porté » = les 6 pièces portées ET la voie du set active. ⚠️ Pas seulement « un
 *  set en cours » (2 pièces suffisent) : le bouton se grisait avec 3 pièces sur 4, la
 *  dernière en réserve, sans plus aucun moyen de compléter le set ni de passer à sa voie. */
function setFullyWorn(i: number): boolean {
  const v = VOIES[i];
  return (
    !!v &&
    equippedSet.value?.idx === i &&
    equippedSet.value.count >= SET_SIZE &&
    char.row?.voie === v.id
  );
}
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
// Puissance SI on porte ce set : ses 4 objets gear + le FAMILIER actuel, ET la VOIE DU SET
// (voieId) — car porter le set équipe aussi sa voie → on prend en compte son passif + son
// CAPSTONE (6 pièces). La comparaison au combatPower actuel reflète donc le vrai gain « set +
// bascule de voie » (la voie qui remplacera l'actuelle).
/** Puissance SI on appuie sur « Porter ce set ».
 *
 *  ⚠️ ELLE DOIT SIMULER L'ACTION, PAS LE SET NU. La version précédente n'évaluait que les
 *  4 pièces du set (+ le familier) : elle jetait donc les bons objets HORS set que le
 *  joueur porte, alors que le bouton, lui, lance l'optimiseur qui COMPLÈTE au mieux avec
 *  le sac et la réserve de la voie. Mesuré sur un compte réel : l'aperçu annonçait −890 à
 *  −3798 quand l'action donnait −232 à **+122**. Trois sets affichés comme des pertes
 *  étaient en fait des GAINS. Un aperçu qui dissuade d'une action bénéfique est pire que
 *  pas d'aperçu du tout.
 *
 *  Restant volontairement pessimiste d'un cheveu : l'action re-choisit aussi les TALENTS
 *  pour ce gear, ce qu'on ne refait pas ici (coût). Le résultat réel ne peut donc qu'être
 *  ≥ à ce qu'on annonce — jamais l'inverse. */
function loadoutPower(voieId: string | null): number {
  const row = char.row;
  if (!row) return 0;
  const fx = mergeEffects(talentFx.value, voiePassiveEffects(voieId as VoieId | null));
  // ⚠️ TOUTES les réserves, comme l'action : depuis que l'optimiseur peut croiser deux
  // demi-sets venus de deux réserves différentes, un aperçu limité à une seule réserve
  // recommencerait à annoncer autre chose que ce que le bouton fait.
  const pool = [...row.inventory, ...ownedInLoadouts(row.loadouts ?? [])];
  // ⚠️ Les pièces du SET sont IMPOSÉES, comme le fait le bouton. Sans ce pin, l'aperçu
  // annonçait le meilleur build sur cette VOIE — un chiffre juste, mais qui ne décrivait
  // pas « porter ce set » : on pouvait lire « +558 » et se retrouver équipé de trois
  // autres sets. Le nombre et le libellé doivent parler du même build.
  const r = voieSetRoster(`voie:${voieId ?? ''}`, row.equipped, undefined, pool);
  const pin: Partial<Record<ItemSlot, Item>> = {};
  for (const sl of SLOTS) if (r[sl]) pin[sl] = r[sl].item;
  const best = bestGearLoadout(
    row.pseudo ?? 'Toi',
    c.value,
    row.equipped,
    pool,
    c.value.level.level,
    fx,
    voieId,
    Object.keys(pin).length ? pin : undefined,
  );
  return combatPower(
    playerWithGear(row.pseudo ?? 'Toi', c.value, best, fx, c.value.level.level, voieId),
  );
}
/** Une carte de « Mes sets » = le ROSTER de la voie (meilleure pièce possédée par
 *  emplacement, portée ou non), et non plus la seule RÉSERVE. Voir `voieSetRoster` :
 *  lister ce qu'on ne porte PAS était l'exact contraire d'une collection. */
const loadoutsView = computed(() => {
  const los = char.row?.loadouts ?? [];
  const eq = char.row?.equipped ?? {};
  const inv = char.row?.inventory ?? [];
  return Array.from({ length: MAX_LOADOUTS }, (_, i) => {
    const vid = `voie:${loadoutVoie(i)?.id ?? ''}`;
    // ⚠️ `powerIfEquip` et non le score d'objet : c'est l'arbitre du jeu, et c'est lui
    // qui a décidé de ce qu'on porte. Sans ça, la carte pouvait mettre en avant une pièce
    // que l'optimiseur avait justement écartée, et faire disparaître celle qu'on a sur soi.
    const roster = voieSetRoster(vid, eq, los[i]?.items, inv, powerIfEquip);
    const entries = SLOTS.map((s) => roster[s]).filter((e): e is SetRosterEntry => !!e);
    // Puissance « si je porte ce set » : calculée sur le ROSTER complet, donc sur ce
    // qu'on possède vraiment de mieux — l'ancienne version ignorait les pièces portées
    // et sous-estimait donc systématiquement le set en cours.
    const power = entries.length ? loadoutPower(loadoutVoie(i)?.id ?? null) : 0;
    // Vendre prend réserve + doublons + sac (`setSellLot`, le lot même que le store
    // vend). On ne vend jamais ce qu’on porte.
    const lot = setSellLot(vid, los[i], inv);
    const spares = los[i]?.spares ?? [];
    const spareLot = sparesLot(los, i);
    return {
      entries,
      count: entries.length,
      spares,
      sparesGold: spareLot.sold.reduce((s, it) => s + sellValue(it), 0),
      sparesSold: spareLot.sold.length,
      wornCount: entries.filter((e) => e.worn).length,
      // Emplacements où l'on porte une pièce de ce set MOINS bonne que celle de la réserve.
      upgradable: entries.filter((e) => !e.worn && e.wornItem).length,
      power,
      delta: power - combatPowerVal.value,
      sellGold: lot.sold.reduce((s, it) => s + sellValue(it), 0),
      lot,
    };
  });
});
// Nb de pièces de set POSSÉDÉES pour la voie i (équipées + rangées dans la réserve + au sac)
// → complétion x/6 (distinctes par emplacement, où qu'elles soient).
// ⚠️ DÉRIVÉ du roster affiché, jamais recompté à part : c'est la divergence entre ce
// compteur (qui comptait partout) et la liste (qui ne montrait que la réserve) qui rendait
// « Mes sets » illisible — 4/4 annoncé au-dessus de deux objets.
/** Or des doublons de TOUS les sets (bouton de l’en-tête de « Mes sets »). */
const allSparesGold = computed(() =>
  sparesLot(char.row?.loadouts ?? []).sold.reduce((s, it) => s + sellValue(it), 0),
);
const voieOwnedCount = (i: number): number => loadoutsView.value[i]?.count ?? 0;

/** Badge de l'icône 📦 : combien de sets EN STOCK augmentent la puissance si on les porte.
 *  « Augmente » = `loadoutPower` — la MÊME fonction que les cartes de « Mes sets », dans la
 *  voie du set (passif + capstone) : le badge ne peut pas annoncer un gain que la carte dément.
 *  « En stock » = au moins une pièce du set qu'on ne porte pas (réserve ou sac).
 *
 *  ⚠️ JAMAIS PENDANT LE RENDU, ET UN SET PAR IMAGE. `loadoutPower` lance l'optimiseur
 *  (~160 ms par set sur un sac de ~770 objets, mesuré v0.741) : huit d'affilée dans un
 *  `computed` referaient figer l'onglet, le défaut exact de la v0.744. On calcule depuis un
 *  `watch`, après peinture, en rendant la main entre deux sets, et seulement quand l'onglet
 *  Équipement est ouvert. Un nouveau déclenchement annule le calcul en cours (`setGainRun`). */
const setUpgradeCount = ref(0);
let setGainRun = 0;
async function refreshSetUpgrades() {
  const run = ++setGainRun;
  let n = 0;
  for (let i = 0; i < MAX_LOADOUTS; i++) {
    await respire();
    const row = char.row;
    const v = loadoutVoie(i);
    if (run !== setGainRun || !row) return;
    if (!v) continue;
    const roster = voieSetRoster(
      `voie:${v.id}`,
      row.equipped,
      row.loadouts?.[i]?.items,
      row.inventory,
    );
    const inStock = SLOTS.some((s) => roster[s] && !roster[s].worn);
    if (inStock && loadoutPower(v.id) > combatPowerVal.value) n++;
  }
  if (run === setGainRun) setUpgradeCount.value = n;
}
watch(
  () => [
    tab.value,
    char.row?.inventory,
    char.row?.equipped,
    char.row?.loadouts,
    char.row?.voie,
    char.row?.talents,
    c.value.level.level,
  ],
  () => {
    if (tab.value === 'gear') void refreshSetUpgrades();
  },
  { immediate: true },
);
// Porter le set d'une voie : FORCE cette voie (l'optimiseur ne re-choisit pas) et équipe son
// set complété au mieux avec le sac (un seul appel, capstone de la voie inclus).
function doWearVoieSet(i: number) {
  const v = loadoutVoie(i);
  if (!v || busy.value) return; // porter un set rangé : de l'intendance, pas une sortie
  withUid(async (uid) => {
    const changed = await char.optimizeGear(
      uid,
      c.value,
      c.value.level.level,
      char.row?.pseudo ?? 'Toi',
      v.id,
      `voie:${v.id}`, // ⚠️ le SET est imposé, pas seulement sa voie — cf. computeGearPlan
    );
    $q.notify({
      type: 'positive',
      message: changed
        ? `⬆️ Set ${v.name} porté (complété au mieux).`
        : `Déjà au mieux pour ${v.name}. 👍`,
    });
  }, 'Impossible de porter ce set.');
}
// Vendre un loadout rangé → or (ticket 53a6d487).
function doSellLoadout(i: number) {
  const view = loadoutsView.value[i];
  const items = view?.lot.sold ?? [];
  if (!items.length) return;
  const gain = items.reduce((a, it) => a + sellValue(it), 0);
  // ⚠️ On DIT ce qui reste, sinon on croit avoir tout fondu et une pièce semble oubliée —
  // exactement le défaut signalé.
  const restent: string[] = [];
  if (view?.wornCount) restent.push(`${view.wornCount} portée(s)`);
  if (view?.lot.keep.length) restent.push(`${view.lot.keep.length} verrouillée(s) 🔒`);
  $q.dialog({
    title: 'Vendre tout ce set ?',
    message:
      `${items.length} pièce(s) de la réserve et du sac seront vendues pour ${fmtPow(gain)} 🪙 : ` +
      items.map((it) => it.name).join(', ') +
      (restent.length ? `. Restent : ${restent.join(' et ')}.` : '.'),
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Vendre (+${fmtPow(gain)} 🪙)`, color: 'negative' },
  }).onOk(() => doSellLoadoutConfirmed(i));
}
function doSellLoadoutConfirmed(i: number) {
  withUid(async (uid) => {
    await char.sellLoadout(uid, i, setScore.value); // l'éclat d'or annonce le montant
  }, 'Impossible de vendre ce set.');
}

// ── Familier (compagnon) ──
const equippedFamiliar = computed<Item | null>(() => char.row?.equipped[FAMILIAR_SLOT] ?? null);
// TOUS les familiers (le porté compris) → une seule grille de cartes, comme les talents,
// RANGÉE PAR RACE (v0.862) : les familiers d'une même race sont regroupés du meilleur au
// pire (rareté, puis la STAT RÉELLEMENT PORTÉE, puis la signature — cf. `compareFamiliars`),
// les groupes ordonnés par leur meilleur exemplaire. `equipped` marque celui porté.
const allFamiliars = computed(() => {
  const eq = equippedFamiliar.value;
  const list: Array<Item & { equipped: boolean }> = [];
  if (eq) list.push({ ...eq, equipped: true });
  for (const f of char.row?.inventory ?? [])
    if (isFamiliar(f)) list.push({ ...f, equipped: false });
  return groupBestFirst(list, (f) => f.species ?? f.effect.type, compareFamiliars).map((g) => ({
    ...g.item,
    groupKey: g.groupKey,
    groupStart: g.groupStart,
    groupSize: g.groupSize,
  }));
});
function doEquipFamiliar(itemId: string) {
  withUid((uid) => char.equip(uid, itemId), 'Impossible d’équiper le familier.');
}
function doUnequipFamiliar() {
  withUid((uid) => char.unequip(uid, FAMILIAR_SLOT), 'Impossible de déséquiper.');
}
/** Titre d'un groupe de familiers identiques : la race (emoji + nom), repli sur le nom. */
function famSpeciesLabel(f: Item): string {
  const sp = f.species ? familiarSpecies(f.species) : undefined;
  return sp ? `${sp.emoji} ${sp.name}` : f.name;
}
// Talents & familiers en trop se VENDENT contre de l'or (ticket 0ec48637 : plus de recyclage
// ni d'infusion de grade — le grade est fixé au drop, on trouve mieux en explorant).
function doSellTalent(id: string) {
  withUid(async (uid) => {
    const g = await char.sellTalent(uid, id);
    // En BANDEAU en haut (comme les boss, v0.820) : une notification du bas recouvrait l'écran.
    if (g)
      gameFx.celebrate({
        quiet: true,
        kind: 'generic',
        emoji: '🪙',
        title: 'Talent vendu',
        subtitle: `+${g} or`,
      });
  }, 'Vente impossible.');
}
// Animation de PALIER DE SET : si équiper `setId` a fait franchir un palier (2/4/6
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
    title: `${set.emoji} ${set.name} — ${after}/${SET_SIZE} pièces`,
    subtitle: `Bonus ${top.pieces} pièces : ${setTierLabel(top.type, top.base, pieces)}`,
    rarity:
      top === set.tiers[set.tiers.length - 1] ? 'divin' : top.pieces >= 4 ? 'legendary' : 'epic',
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
// ── OPTIMISEUR : PROPOSITION, PAS DÉCRET (v0.688) ────────────────────────────────
// Le geste était un fait accompli : un clic, tout changeait, et on découvrait après coup
// ce qui avait bougé. On propose désormais chaque remplacement, avec son détail et son
// gain, et le joueur accepte ligne par ligne.
//
// ⚠️ LE GAIN DE CHAQUE LIGNE EST RECALCULÉ, jamais figé. Le plan de l'optimiseur est un
// TOUT COHÉRENT — les talents sont choisis POUR ce gear, la voie POUR son capstone — donc
// refuser une ligne change la valeur de toutes les autres. Afficher un « +312 » calculé
// une fois pour toutes serait un mensonge dès le premier refus.
type PlanPiece = { slot: ItemSlot; fromItem: Item | null; toItem: Item | null };
type PlanRow = {
  key: string;
  kind: 'gear' | 'familiar' | 'talent' | 'voie' | 'set';
  /** Les pièces d'un SET proposées ensemble (`kind: 'set'`). */
  pieces?: PlanPiece[];
  /** Le set emporte aussi le changement de voie (son bonus 6 pièces en dépend). */
  voieChange?: boolean;
  label: string;
  slot?: ItemSlot;
  fromItem?: Item | null;
  toItem?: Item | null;
  fromTalent?: TalentInstance | null;
  toTalent?: TalentInstance | null;
  voie?: string | null;
};
const gearPlan = ref<{ equipped: Equipped; talentIds: string[]; voie: string | null } | null>(null);
/** Lignes REFUSÉES (tout est accepté par défaut : le plan proposé est le meilleur). */
const planOff = ref<Set<string>>(new Set());
const planOpen = computed({
  get: () => !!gearPlan.value,
  set: (v: boolean) => {
    if (!v) gearPlan.value = null;
  },
});

const planRows = computed<PlanRow[]>(() => {
  const plan = gearPlan.value;
  const r = char.row;
  if (!plan || !r) return [];
  const rows: PlanRow[] = [];
  for (const slot of WORN_SLOTS) {
    const from = r.equipped[slot] ?? null;
    const to = plan.equipped[slot] ?? null;
    if ((from?.id ?? null) === (to?.id ?? null)) continue;
    rows.push({
      key: 's:' + slot,
      kind: slot === FAMILIAR_SLOT ? 'familiar' : 'gear',
      label: SLOT_LABEL[slot],
      slot,
      fromItem: from,
      toItem: to,
    });
  }
  // TALENTS : on apparie sorties et entrées → chaque ligne est un échange 1 pour 1, donc
  // en refuser une ne déséquilibre jamais le nombre d'emplacements.
  const all = normalizeTalents(r.talents);
  const nowIds = new Set(all.filter((t) => t.equipped).map((t) => t.id));
  const outs = all.filter((t) => nowIds.has(t.id) && !plan.talentIds.includes(t.id));
  const ins = all.filter((t) => !nowIds.has(t.id) && plan.talentIds.includes(t.id));
  const n = Math.max(outs.length, ins.length);
  for (let i = 0; i < n; i++) {
    const o = outs[i] ?? null;
    const t = ins[i] ?? null;
    rows.push({
      key: 't:' + (t?.id ?? o?.id ?? i),
      kind: 'talent',
      label: 'Talent',
      fromTalent: o,
      toTalent: t,
    });
  }
  const voieChanges = (r.voie ?? null) !== (plan.voie ?? null);
  // 🧩 Les pièces proposées d'un MÊME set de voie (au moins deux) forment UNE ligne : leur
  // valeur tient à leur réunion (bonus de set, 4-pièces), pas à chacune. Si le plan change
  // aussi de voie pour CE set, la voie part avec lui.
  const bySet = new Map<string, PlanRow[]>();
  for (const row of rows) {
    const sid = row.kind === 'gear' ? row.toItem?.setId : undefined;
    if (!sid?.startsWith('voie:')) continue;
    bySet.set(sid, [...(bySet.get(sid) ?? []), row]);
  }
  const groups: PlanRow[] = [];
  let voieTaken = false;
  for (const [sid, list] of bySet) {
    if (list.length < 2) continue;
    const withVoie = voieChanges && `voie:${plan.voie ?? ''}` === sid;
    voieTaken ||= withVoie;
    groups.push({
      key: 'set:' + sid,
      kind: 'set',
      label: `🧩 ${SET_BY_ID[sid]?.name ?? 'Set'} · ${list.length} pièces`,
      pieces: list.map((x) => ({
        slot: x.slot!,
        fromItem: x.fromItem ?? null,
        toItem: x.toItem ?? null,
      })),
      voieChange: withVoie,
      voie: plan.voie,
    });
  }
  const grouped = new Set(groups.flatMap((g) => g.pieces!.map((pc) => 's:' + pc.slot)));
  const out = [...groups, ...rows.filter((x) => !grouped.has(x.key))];
  if (voieChanges && !voieTaken)
    out.push({ key: 'voie', kind: 'voie', label: 'Voie', voie: plan.voie });
  return out;
});

/** L'ÉTAT RETENU : l'équipement, les talents et la voie tels que les lignes acceptées
 *  les définissent. C'est lui qu'on applique, et c'est sur lui qu'on mesure. */
function planStateWithout(skip?: string) {
  const r = char.row;
  const plan = gearPlan.value;
  const equipped: Equipped = { ...(r?.equipped ?? {}) };
  let talentIds = normalizeTalents(r?.talents ?? [])
    .filter((t) => t.equipped)
    .map((t) => t.id);
  let voie = r?.voie ?? null;
  if (!plan || !r) return { equipped, talentIds, voie };
  for (const row of planRows.value) {
    if (planOff.value.has(row.key) || row.key === skip) continue;
    if (row.slot) equipped[row.slot] = row.toItem ?? undefined;
    else if (row.kind === 'set') {
      for (const pc of row.pieces ?? []) equipped[pc.slot] = pc.toItem ?? undefined;
      if (row.voieChange) voie = row.voie ?? null;
    } else if (row.kind === 'talent') {
      talentIds = talentIds.filter((id) => id !== row.fromTalent?.id);
      if (row.toTalent) talentIds = [...talentIds, row.toTalent.id];
    } else if (row.kind === 'voie') voie = row.voie ?? null;
  }
  return { equipped, talentIds, voie };
}
function planPowerOf(st: { equipped: Equipped; talentIds: string[]; voie: string | null }): number {
  const talents = normalizeTalents(char.row?.talents ?? []).map((t) => ({
    ...t,
    equipped: st.talentIds.includes(t.id),
  }));
  const fx = mergeEffects(talentEffects(talents), voiePassiveEffects(st.voie as VoieId | null));
  return combatPower(
    playerWithGear(
      char.row?.pseudo ?? 'Toi',
      c.value,
      st.equipped,
      fx,
      c.value.level.level,
      st.voie,
    ),
  );
}
const planPowerNow = computed(() => planPowerOf(planStateWithout('__all__')));
const planPowerSel = computed(() => planPowerOf(planStateWithout()));
/** Ce que CETTE ligne apporte, dans le contexte des lignes actuellement acceptées. */
function rowGain(key: string): number {
  if (planOff.value.has(key)) {
    // Refusée : on mesure ce qu'elle apporterait si on l'acceptait.
    const off = new Set(planOff.value);
    off.delete(key);
    const saved = planOff.value;
    planOff.value = off;
    const withIt = planPowerOf(planStateWithout());
    planOff.value = saved;
    return withIt - planPowerSel.value;
  }
  return planPowerSel.value - planPowerOf(planStateWithout(key));
}
function togglePlanRow(key: string) {
  const next = new Set(planOff.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  planOff.value = next;
}
const planAccepted = computed(() => planRows.value.filter((r) => !planOff.value.has(r.key)).length);

const optimizing = ref(false);
// ⚠️ AUCUN DÉCLENCHEMENT AUTOMATIQUE. Le calcul est SYNCHRONE et bloque le fil ~3 s :
// le lancer sur un simple changement d'onglet, c'est figer l'app sans que personne ne
// l'ait demandé — et c'est très exactement ce qui a été signalé. Il part donc d'un GESTE
// (ouvrir le Sac, ou le bouton 🪄), où l'on peut montrer un ⏳ et où l'attente se
// comprend. Tant qu'il n'a pas tourné, les écrans se taisent.
async function doOptimizeGear() {
  if (optimizing.value) return;
  optimizing.value = true;
  try {
    // ⚠️ Le calcul rend la main entre chaque voie (`respire`) : l'interface reste
    // vivante et le ⏳ s'affiche vraiment, au lieu d'un onglet qui ne répond plus.
    await ensureOptimum();
    const plan = optimumPlan.value;
    // GARDE-FOU ANTI-RÉGRESSION : on ne propose que du STRICTEMENT meilleur — même règle
    // que `previewGearPlan`, mais portée ici pour que la référence soit remplie dans
    // TOUS les cas, y compris quand il n'y a rien à gagner.
    if (!plan || optimumPower.value <= combatPowerVal.value) {
      $q.notify({ type: 'info', message: 'Ton équipement est déjà optimal. 👍' });
      return;
    }
    planOff.value = new Set();
    gearPlan.value = { equipped: plan.equipped, talentIds: plan.talentIds, voie: plan.voie };
  } finally {
    optimizing.value = false;
  }
}
function applyPlan() {
  const st = planStateWithout();
  gearPlan.value = null;
  withUid(async (uid) => {
    await char.applyGearPlan(uid, st, setScore.value);
    $q.notify({ type: 'positive', message: '🪄 Build mis à jour.' });
  }, 'Application impossible.');
}
// Remplacement d'un objet équipé : le joueur choisit dans une modale ce qu'il
// advient de l'ancien (garder au sac / vendre → or).
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

/** Un familier se CÈDE (ses garde-fous vivent dans `sellFamiliars`). */
function doSellFamiliar(f: Item) {
  const gain = sellValue(f);
  $q.dialog({
    title: 'Céder ce familier ?',
    message: `« ${f.name} » partira définitivement contre ${gain} 🪙.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Céder (+${gain} 🪙)`, color: 'negative' },
  }).onOk(() =>
    withUid(async (uid) => {
      await char.sellFamiliar(uid, f.id); // l'éclat d'or annonce le montant (useGoldFx)
    }, 'Cession impossible.'),
  );
}
function doSell(it: Item) {
  const gain = sellValue(it);
  $q.dialog({
    title: 'Vendre cet objet ?',
    message: `« ${it.name} » partira définitivement contre ${fmtPow(gain)} 🪙.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Vendre (+${fmtPow(gain)} 🪙)`, color: 'negative' },
  }).onOk(() =>
    withUid(async (uid) => {
      await char.sellItem(uid, it.id); // l'éclat d'or annonce le montant
    }, 'Vente impossible.'),
  );
}
function doToggleLock(it: Item) {
  withUid((uid) => char.toggleLock(uid, it.id), 'Action impossible.');
}
// 🧩 RANGEMENT AUTOMATIQUE DES PIÈCES DE SET (v0.839 ; conception validée avec l'utilisateur).
// Toute pièce de set de voie qui arrive au sac — boss, Labyrinthe, expédition, récompense —
// est rangée dans son set : la meilleure à l'emplacement ; l'autre, un DOUBLON, est VENDUE
// aussitôt (v0.890, demandé : « au lieu de les accumuler »), sauf si elle est 🔒. Le sac ne
// garde que les objets hors set.
// ⚠️ Jamais pendant un combat (`busy`) ni pendant son animation : l'annonce « set renforcé »
// ne doit pas recouvrir le combat qu'on regarde. Le drop révélé, le rangement suit.
let filing = false;
async function autoFileSetPieces() {
  const uid = auth.user?.id;
  const row = char.row;
  // ⚠️ `progress.ready` : sans l’XP de fond chargée, le barème jugerait les pièces avec
  // un héros de niveau 1 — et garderait peut-être la moins bonne à l’emplacement.
  if (!uid || !row || filing || busy.value || !progress.ready.value) return;
  if (reportOpen.value && !stageDone.value) return;
  if (
    !row.inventory.some((it) => voieSetIndex(it) >= 0) &&
    !sparesLot(row.loadouts ?? []).sold.length
  )
    return;
  filing = true;
  try {
    const r = await char.fileBagSetPieces(uid, setScore.value);
    announceFiled(r.filed, r.gold);
  } catch {
    // Rien de perdu : les pièces restent au sac, le prochain passage réessaie.
  } finally {
    filing = false;
  }
}
watch(
  () => [char.row?.inventory, busy.value, reportOpen.value, stageDone.value, progress.ready.value],
  () => void autoFileSetPieces(),
  { immediate: true },
);
// 🪙 VENTE AUTOMATIQUE DES TALENTS ET FAMILIERS EN TROP (demandé par l'utilisateur : « ne
// garder que le meilleur de chaque catégorie et vendre les autres automatiquement ; le seul
// doublon est celui équipé »). La règle vit dans `familiarSurplus` / `talentSurplus`.
// ⚠️ Jamais pendant un combat ni tant que son rapport est ouvert : le butin s'y affiche avec
// ses boutons, un familier ne doit pas disparaître sous le doigt de celui qui l'équipe.
let sellingSurplus = false;
async function autoSellSurplus() {
  const uid = auth.user?.id;
  if (!uid || !char.row || sellingSurplus || busy.value || reportOpen.value) return;
  sellingSurplus = true;
  try {
    const r = await char.sellSurplusCompanions(uid);
    const n = r.familiars + r.talents;
    if (n)
      gameFx.celebrate({
        quiet: true,
        kind: 'drop',
        emoji: '🪙',
        title: `${n} doublon${n > 1 ? 's' : ''} vendu${n > 1 ? 's' : ''} +${fmtPow(r.gold)} 🪙`,
        subtitle:
          [
            r.talents ? `${r.talents} talent${r.talents > 1 ? 's' : ''}` : '',
            r.familiars ? `${r.familiars} familier${r.familiars > 1 ? 's' : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ') + ' — tu gardes le meilleur de chaque',
      });
  } catch {
    // Rien de perdu : le prochain passage réessaie.
  } finally {
    sellingSurplus = false;
  }
}
watch(
  () => [char.row?.inventory, char.row?.talents, char.row?.equipped, busy.value, reportOpen.value],
  () => void autoSellSurplus(),
  { immediate: true },
);
/** Une seule annonce, discrète. ⚠️ Un doublon ne s'annonce PAS seul (v0.696) : annoncer
 *  « ta pièce était moins bonne » à chaque boss transformait une bonne nouvelle en
 *  reproche. Il se lit dans « Mes sets ». Plusieurs pièces d'un coup (retour du Labyrinthe,
 *  premier passage après la mise à jour) → un seul bandeau récapitulatif. */
function announceFiled(filed: FiledPiece[], gold = 0) {
  if (!filed.length) return;
  const soldNote = gold ? ` · doublon vendu +${fmtPow(gold)} 🪙` : '';
  const setName = (f: FiledPiece) => VOIES[f.setIndex]?.name ?? '';
  if (filed.length > 1) {
    const spares = filed.filter((f) => f.outcome === 'spare').length;
    gameFx.celebrate({
      quiet: true,
      kind: 'drop',
      emoji: '🧩',
      title: `${filed.length} pièces rangées dans Mes sets`,
      subtitle:
        (spares ? `dont ${spares} doublon(s) vendu(s)` : 'la meilleure à chaque emplacement') +
        (gold ? ` · +${fmtPow(gold)} 🪙` : ''),
    });
    return;
  }
  const f = filed[0]!;
  if (f.outcome === 'added')
    gameFx.celebrate({
      quiet: true,
      kind: 'drop',
      emoji: '🧩',
      title: `Ajoutée à ton set ${setName(f)}`,
      subtitle: "l'emplacement était libre" + soldNote,
    });
  else if (f.outcome === 'upgraded' && f.displaced) {
    const gain = Math.round(setScore.value(f.item) - setScore.value(f.displaced));
    gameFx.celebrate({
      quiet: true,
      kind: 'drop',
      emoji: f.item.emoji,
      title: `Set ${setName(f)} renforcé`,
      subtitle: `${f.item.name} · ⚔️ ${fmtDelta(0, gain)} · l'ancienne est vendue`,
      rarity: fxRarity(f.item.rarity),
    });
  }
}
// Doublon → dans le set, à la place de la pièce en place (qui devient doublon à son tour).
function doPromoteSpare(setIndex: number, spare: Item) {
  const held = char.row?.loadouts?.[setIndex]?.items?.[spare.slot];
  $q.dialog({
    title: 'Utiliser ce doublon ?',
    message: held
      ? `« ${spare.name} » prendra la place de « ${held.name} », qui passera en doublon.`
      : `« ${spare.name} » occupera l'emplacement ${SLOT_LABEL[spare.slot]}.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: '⇄ Échanger', color: 'primary', textColor: 'dark' },
  }).onOk(() =>
    withUid((uid) => char.promoteSetSpare(uid, setIndex, spare.id), 'Échange impossible.'),
  );
}
/** Où vit la pièce ouverte dans le détail, si elle est RANGÉE dans un set (doublon ou pièce
 *  en place). Une pièce portée ou du sac → null : elles ont leurs propres sorties. */
const inspectStored = computed<{ setIndex: number; spare: boolean } | null>(() => {
  const it = inspectItem.value;
  const los = char.row?.loadouts ?? [];
  if (!it) return null;
  for (let k = 0; k < los.length; k++) {
    if (los[k]?.spares?.some((s) => s.id === it.id)) return { setIndex: k, spare: true };
    if (SLOTS.some((s) => los[k]?.items?.[s]?.id === it.id)) return { setIndex: k, spare: false };
  }
  return null;
});
function doSellSetPiece(it: Item) {
  const gain = sellValue(it);
  const replaced =
    inspectStored.value && !inspectStored.value.spare
      ? (char.row?.loadouts?.[inspectStored.value.setIndex]?.spares ?? []).some(
          (s) => s.slot === it.slot,
        )
      : false;
  $q.dialog({
    title: 'Vendre cette pièce ?',
    message:
      `« ${it.name} » partira contre ${fmtPow(gain)} 🪙.` +
      (replaced ? ' Ton meilleur doublon de cet emplacement prendra sa place dans le set.' : ''),
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Vendre (+${fmtPow(gain)} 🪙)`, color: 'negative' },
  }).onOk(() =>
    withUid(async (uid) => {
      const g = await char.sellSetPiece(uid, it.id, setScore.value);
      if (g) inspectItem.value = null;
    }, 'Vente impossible.'),
  );
}
// Vendre les doublons d'un set (ou de tous). Les 🔒 restent — l'écran le dit.
function doSellSpares(setIndex?: number) {
  const { sold, keep } = sparesLot(char.row?.loadouts ?? [], setIndex);
  if (!sold.length) return;
  const gain = sold.reduce((s, it) => s + sellValue(it), 0);
  $q.dialog({
    title: setIndex === undefined ? 'Vendre tous les doublons ?' : 'Vendre ces doublons ?',
    message:
      `${sold.length} doublon(s) seront vendus pour ${fmtPow(gain)} 🪙. Les pièces rangées dans ` +
      `les sets ne bougent pas.` +
      (keep.length ? ` ${keep.length} doublon(s) verrouillé(s) 🔒 restent.` : ''),
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Vendre (+${fmtPow(gain)} 🪙)`, color: 'negative' },
  }).onOk(() =>
    withUid(async (uid) => {
      await char.sellSpares(uid, setIndex);
    }, 'Vente impossible.'),
  );
}
// Nettoyage en masse : objets du sac moins rares que l'équipé du même slot.
// Slot ciblé par le nettoyage en masse = le filtre du sac actif (sinon tous).
const bulkSlot = computed<ItemSlot | undefined>(() =>
  invFilter.value === 'all' ? undefined : invFilter.value,
);
// Objets du sac qui N'AMÉLIORENT PAS ta puissance si équipés → candidats à la casse/vente
// en masse. Puissance FIXE (grade + enchant) → comparaison directe « si équipé ». Slot vide
// → l'objet est utile (à équiper), gardé. 🔒 protège ; familiers = piste à part.
// ⚠️ « TOUT VENDRE » VEND TOUT — sans condition de puissance (décision de
// l'utilisateur). Les deux règles précédentes (« pas meilleur que l'équipé », puis « ne
// contribue pas à l'optimum ») avaient le même défaut : elles demandaient un CALCUL —
// et le second, 3 s — pour décider quoi jeter, donc ouvrir le Sac ramait. Le tri se fait
// avec le 🔒, qui existe pour ça. On épargne ce qui n'est pas un choix : les familiers (on
// ne démonte pas un animal) et, SI l'optimum est déjà connu, les pièces qu'il retient —
// gratuit (un Set), et ça évite de fondre ce que le 🪄 s'apprêtait à équiper.
const powerLossItems = computed<Item[]>(() => {
  const r = char.row;
  if (!r) return [];
  return r.inventory.filter((it) => {
    if (it.locked) return false;
    if (isFamiliar(it) || isTrophy(it)) return false;
    if (bulkSlot.value && it.slot !== bulkSlot.value) return false;
    return !(optimum.value && inOptimum(it));
  });
});
const belowCount = computed(() => powerLossItems.value.length);
// Ce que rendrait la purge, en or (v0.890 : la vente remplace le recyclage).
const belowGold = computed(() =>
  powerLossItems.value.filter(canSell).reduce((a, i) => a + sellValue(i), 0),
);
// Libellé du périmètre (« du sac » ou « [type] ») pour être explicite.
const bulkScope = computed(() =>
  bulkSlot.value ? SLOT_LABEL[bulkSlot.value].toLowerCase() : 'ton sac',
);
function doSellBelow() {
  const ids = powerLossItems.value.filter(canSell).map((i) => i.id);
  const gain = belowGold.value;
  $q.dialog({
    title: 'Tout vendre',
    message: `Vendre les ${ids.length} objet(s) de ${bulkScope.value} pour ${fmtPow(gain)} 🪙 ? Tout y passe, sauf les objets verrouillés 🔒, tes familiers, ce que tu portes et les pièces retenues par ton meilleur build.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Tout vendre (+${fmtPow(gain)} 🪙)`, color: 'negative' },
  }).onOk(() =>
    withUid(async (uid) => {
      await char.sellMany(uid, ids); // l'éclat d'or annonce le montant
    }, 'Vente impossible.'),
  );
}
async function savePseudo() {
  const uid = auth.user?.id;
  if (!uid || !isValidPseudo(pseudoInput.value)) return;
  saving.value = true;
  pseudoError.value = '';
  const isFirstCreation = !char.row; // avant l'appel : pas encore de perso = 1re création
  try {
    await char.setPseudo(uid, pseudoInput.value);
    $q.notify({ type: 'positive', message: 'Aventurier créé — bon voyage !' });
    // Pécule de bienvenue (énergie offerte à la 1re création) : animation dédiée pour
    // que le joueur comprenne d'où vient son énergie de départ.
    if (isFirstCreation) {
      gameFx.celebrate({
        kind: 'generic',
        emoji: '⚡',
        title: `+${WELCOME_ENERGY} ⚡`,
        subtitle: 'Pécule de bienvenue — de quoi lancer tes premiers donjons !',
        rarity: 'legendary',
      });
    }
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

// Bonus de passage de niveau : réclamé dès que les données de fond sont prêtes
// (niveau réel) et qu'un perso existe. Idempotent (reward_level persisté).
let claimingLevel = false;
watch(
  () => [progress.ready.value, char.row ? c.value.level.level : 0] as [boolean, number],
  async ([rdy, lvl]: [boolean, number]) => {
    const uid = auth.user?.id;
    if (!rdy || !char.row || lvl < 1 || claimingLevel || !uid) return;
    claimingLevel = true;
    // Filet des coffres de Défi 360 : ceux bouclés avant cette version, ou pendant que
    // l'app n'était pas ouverte. Idempotent, donc repasser ne coûte rien.
    void grantPendingComboChests();
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
/* Plein écran de l'arène : le plateau prend TOUT, sans carte ni gouttière — c'est un
   mini-jeu, il ne doit pas ressembler à une boîte de dialogue. */
.arena-full {
  width: 100vw;
  height: 100vh;
  height: 100dvh; /* mobile : évite que la barre d'URL rogne le bas du terrain */
  background: var(--bg);
}
/* Arène : même gabarit que la carte d'expédition, teintée pour la distinguer. */
.arena-card {
  border-color: color-mix(in srgb, var(--d4) 45%, var(--line));
}
.arena-card:disabled {
  opacity: 0.55;
}

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
/* Ligne 1 : niveau · pseudo · 📬 à gauche, ⚡ 💠 collés à droite. Le pseudo cède la place
   (ellipse) plutôt que de faire passer ⚡ 💠 à la ligne. */
.tb-left {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tb-name {
  min-width: 0;
}
/* ⚠️ `.tb-tray.tb-main` et non `.tb-main` : `.tb-tray` (plus bas) pose `width: 100%` pour que
   le plateau du dessous tienne sur UNE ligne — sans cette spécificité la pastille ⚡ 💠
   prenait toute la largeur et passait SOUS le pseudo. */
.tb-tray.tb-main {
  flex: 0 0 auto;
  width: auto;
  overflow: visible;
}
/* Ligne 2 : le reste du plateau, pleine largeur, calé à droite. */
.tb-right {
  flex-basis: 100%;
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
/* ⚠️ LES RESSOURCES SUR UNE SEULE LIGNE (demandé) : le plateau prend sa PROPRE rangée,
   pleine largeur, et ne passe JAMAIS à la ligne. Les nombres sont courts (`compactNumber` :
   12,3k, 400k, 4,2M), la valeur exacte vit dans l'infobulle. Filet de sécurité : si les
   8 devises ne tiennent toujours pas (Z Fold plié), la rangée DÉFILE sur le côté au lieu
   de se casser en deux. */
.tb-right {
  flex: 1 0 100%;
  min-width: 0;
}
.tb-tray {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 8px;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 12px;
}
.tb-tray::-webkit-scrollbar {
  display: none;
}
/* Écrans étroits : un cran plus serré pour que les 8 devises tiennent sans défiler. */
@media (max-width: 420px) {
  .tb-tray {
    gap: 4px;
    padding: 4px 8px;
  }
  .tb-tray .tb-r {
    font-size: 12px;
  }
}
/* ⚠️ L'icône vit dans une BOÎTE FIXE : les emojis n'ont pas tous la même hauteur ni la
   même ligne de base selon la police du téléphone (⚜️ et 🔱 décrochaient de la rangée).
   Centrer une boîte carrée aligne toutes les puces, quelle que soit la police. */
.tb-r {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}
.tb-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25em;
  height: 1.25em;
  line-height: 1;
  flex-shrink: 0;
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
.tb-r.keys {
  color: #d9c48a;
}
/* 💠 Le violet du mana, celui des tracés de convoi et de l’invocation. */
.tb-r.mana {
  color: #b57bff;
}
.tb-r.tickets {
  color: var(--accent);
}
.tb-r.seals {
  color: #7fd4c1;
}
.tb-r.seals-gear {
  color: #e0b36a;
}
.tb-r.energy.deficit {
  color: var(--d4, #ff6a45);
}
/* Puce ⚡ cliquable → historique d'énergie (léger repère : souligné pointillé + curseur). */
.tb-r.clickable {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
/* Composition du solde (en tête de la modale énergie). */
.enh-bal {
  margin-top: 10px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: var(--surface-2);
  padding: 4px 12px;
}
.enh-brow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;
  color: var(--dim);
}
.enh-brow + .enh-brow {
  border-top: 1px solid var(--line-soft);
}
.enh-brow small {
  color: var(--dim-2);
}
.enh-brow b {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  color: var(--text);
  white-space: nowrap;
}
.enh-brow b.pos {
  color: #8fd0ff;
}
.enh-brow b.neg {
  color: var(--d4);
}
.enh-brow.total {
  color: var(--text);
  font-weight: 700;
}
.enh-brow.total b {
  font-size: 18px;
  color: var(--accent);
}
.enh-sub {
  margin-top: 14px;
}
/* Historique d'énergie (modale) : un bloc par jour, détail par activité dedans. */
.enh-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.enh-day-block {
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  padding: 8px 12px 10px;
}
.enh-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line-soft);
}
.enh-day {
  font-weight: 700;
  color: var(--text);
  text-transform: capitalize;
}
.enh-val {
  font-family: var(--font-display);
  font-weight: 700;
  color: #8fd0ff;
  font-variant-numeric: tabular-nums;
}
.enh-val.zero {
  color: var(--dim);
}
.enh-items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}
.enh-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}
.enh-item-lbl {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.enh-item-val {
  color: #8fd0ff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.enh-empty {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--dim);
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
/* Pastille d'alerte de l'onglet Base : accent pour « il y a à faire », orange pour
   « une armée arrive » — la seule des deux qui ait une échéance. */
.seg-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent, #ffd23f);
  flex: none;
}
.seg-dot.warn {
  background: #ffb23f;
  box-shadow: 0 0 0 3px rgba(255, 178, 63, 0.25);
}
.seg-b {
  flex: 1;
  min-width: 0;
  position: relative;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
.statc {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 7px 4px 6px;
  text-align: center;
}
.statc .ring {
  width: 60px;
  height: 60px;
  display: block;
  margin: 0 auto 2px;
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
  margin-bottom: 12px;
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
  margin-bottom: 8px;
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
.pt-frame.clickable {
  cursor: pointer;
}
.pt-frame.clickable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
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
  width: 260px;
  max-width: 86vw;
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
/* ── Talents : cases d'emplacement ──────────────────────────────────────
   Même langage visuel que le chenil : des CASES, liseré à la rareté, une case
   vide reste dessinée en pointillés pour qu'on voie ce qui reste à pourvoir. */
.tslots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.tslot {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 12px;
  border: 2px solid var(--rk, var(--line));
  background: #1d1913;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.tslot.empty {
  border-style: dashed;
  border-color: var(--line);
  background: transparent;
}
.ts-emo {
  font-size: 24px;
  line-height: 1;
}
.ts-plus {
  font-size: 20px;
  color: var(--dim);
}
/* La SOMME des talents équipés — elle n'était affichée nulle part. */
.tbonus {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #1a1611;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.tb-h {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.gear-total {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.gt-sub {
  font-size: 11.5px;
  color: var(--dim);
  margin-bottom: 8px;
}
.tb-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tb-chip {
  border: 1px solid #7bc86c;
  color: #7bc86c;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.tb-empty {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
/* Sélecteur de talent */
.tpick {
  display: flex;
  gap: 10px;
  width: 100%;
  align-items: flex-start;
  text-align: left;
  background: transparent;
  border: 1px solid var(--rk, var(--line));
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 6px;
  color: var(--text);
  cursor: pointer;
}
.tpick.here {
  box-shadow: 0 0 0 2px #7bc86c inset;
}
.tpick.off {
  opacity: 0.45;
  cursor: default;
}
.tp-emo {
  font-size: 22px;
}
.tp-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tp-name {
  font-size: 13px;
}
.tp-eff {
  font-size: 12px;
  color: var(--dim);
}
.tp-off {
  font-size: 11px;
  color: #ff6a45;
}
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
/* Badge « doublon » : exemplaire en surplus d'un talent (vendable). */
/* Titre d'un groupe d'exemplaires identiques (talent ou race de familier), sur toute la
   largeur de la grille : on voit d'un coup d'œil ce qui va ensemble. */
/* ⚠️ C'est un BOUTON depuis que les types se replient : il lui faut le reset d'un bouton,
   une cible de 44 px et un curseur — sans quoi il gardait l'allure d'un titre inerte. */
.tal-group {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  margin-top: 6px;
  padding: 0 2px 2px;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border: 0;
  border-bottom: 1px solid var(--line);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}
.tal-group:first-child {
  margin-top: 0;
}
.tal-group:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.tal-group .tg-n {
  color: var(--accent);
}
.tal-group .tg-hint {
  margin-left: auto;
  font-weight: 500;
  font-size: 11px;
  color: var(--dim);
}
/* Badge « effet signature » (✦) sur une carte familier, harmonisé avec les talents. */
.fam-sig-badge {
  flex: 0 0 auto;
  color: #ffd23f;
  font-weight: 800;
  font-size: 12px;
}
/* Icône de talent + pastille de JET dessous (comme les items). */
.tal-icon {
  position: relative;
  flex: 0 0 auto;
  padding-bottom: 6px;
}
.ic-jet {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 999px;
  color: #15120e;
  background: var(--dim);
  white-space: nowrap;
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
/* Icône du talent remplacé, dans la pastille de gain de puissance. */
.repl-ic {
  margin-left: 4px;
  font-family: var(--font-body);
  font-weight: 400;
  opacity: 0.85;
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
/* Bouton « Vendre les doublons » — discret (bordure grise, pas accent). */
.talent-dup-btn {
  width: 100%;
  margin: -6px 0 12px;
  padding: 9px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
/* Talent conseillé (maximise la puissance) : liseré doré (ticket 08b10b7f). */
.tal-card.reco {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
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
.tal-posted {
  font-size: 11px;
  color: var(--dim);
  white-space: nowrap;
}
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
/* Une pièce par ligne (v0.1048) : la grille 2×2 coupait les noms et masquait des stats. */
.gear {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
/* 🏆 Vitrine du trophée : un socle éclairé à gauche, le trophée dans la couleur de sa
   rareté (--rk), le cartel à droite. Or par défaut, quand le socle est vide. */
.trophy-case {
  --tc: var(--rk, #ffd23f);
  display: flex;
  gap: 14px;
  align-items: stretch;
  margin: -6px 0 18px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tc) 55%, var(--line));
  background:
    radial-gradient(
      120% 140% at 0% 50%,
      color-mix(in srgb, var(--tc) 22%, transparent),
      transparent 60%
    ),
    linear-gradient(160deg, color-mix(in srgb, var(--tc) 8%, var(--surface)), var(--surface));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--tc) 30%, transparent);
}
.trophy-case.empty {
  --tc: #ffd23f;
  border-style: dashed;
}
.tc-plinth {
  position: relative;
  flex: 0 0 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    transparent 55%,
    color-mix(in srgb, var(--tc) 18%, #0000) 100%
  );
}
.tc-plinth::after {
  /* le socle : une marche sous le trophée */
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 6px;
  height: 7px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tc) 45%, #2a241c);
}
.tc-glow {
  position: absolute;
  inset: 10% 14% 22%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--tc) 55%, transparent),
    transparent 70%
  );
  filter: blur(6px);
  animation: tc-pulse 3.2s ease-in-out infinite;
}
.tc-plinth > :not(.tc-glow) {
  position: relative;
  margin-bottom: 10px;
}
.tc-emo {
  font-size: 40px;
  opacity: 0.45;
}
@keyframes tc-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tc-glow {
    animation: none;
  }
}
.tc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tc-kicker {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tc);
  font-weight: 700;
}
.tc-name {
  all: unset;
  cursor: pointer;
  font-size: 17px;
  line-height: 1.15;
  color: var(--text);
  overflow-wrap: anywhere;
}
.tc-stats {
  font-size: 12px;
  color: var(--dim);
}
.tc-empty {
  font-size: 12.5px;
  color: var(--dim);
}
.tc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 6px;
}
.tc-b {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tc) 60%, var(--line));
  background: color-mix(in srgb, var(--tc) 16%, var(--surface));
  color: var(--text);
  font-weight: 600;
  font-size: 12.5px;
}
.tc-b.ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--dim);
}
.sec-hint {
  font-size: 12px;
  color: var(--dim);
  margin: -4px 2px 10px;
}
/* Ligne : icône | nom + rang + stats | actions. La colonne centrale peut rétrécir
   (minmax(0, 1fr)) → un nom long passe en ellipse au lieu de pousser les actions dehors. */
.slot {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 11px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 12px;
  padding: 10px 10px 10px 11px;
  min-height: 72px;
  min-width: 0;
}
.slot.empty {
  border-style: dashed;
}
.slot-ico {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
}
.slot-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
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
/* Le ⏳ pulse : on voit que ça travaille, pas que c'est cassé. */
.gi-b.working {
  opacity: 1;
  animation: gi-pulse 1s ease-in-out infinite;
}
@keyframes gi-pulse {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gi-b.working {
    animation: none;
  }
}
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
.bag-ranking {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12.5px;
  color: var(--dim);
}
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
.slot.clickable {
  cursor: pointer;
}
.slot.clickable:active {
  transform: scale(0.98);
}
.slot-emo {
  font-size: 22px;
  opacity: 0.55;
  filter: grayscale(1);
}
.slot-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
  flex: 1;
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
.slot-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Toutes les stats, côte à côte, qui passent à la ligne au besoin (plus de coupe). */
.slot-eff {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
/* Une PASTILLE par stat (demandé) : les stats se lisent séparément au lieu d'une
   ligne continue où l'on ne voit plus où l'une finit et l'autre commence. */
.slot-eff .stat-line {
  padding: 2px 8px;
  border: 1px solid var(--line);
  /* 10 px et non 999 : pilule sur une ligne, mais un pouvoir de relique qui passe sur
     plusieurs lignes reste un bloc arrondi au lieu d'un ovale. */
  border-radius: 10px;
  background: var(--surface-2, color-mix(in srgb, var(--text) 6%, var(--surface)));
  line-height: 1.35;
  font-size: 11.5px;
  /* ⚠️ PAS de `nowrap` : le pouvoir d'une relique (« 🤺 Riposte parfaite — une riposte
     critique entière de… ») faisait 567 px et faisait glisser tout l'écran de côté. */
  min-width: 0;
  max-width: 100%;
  overflow-wrap: break-word;
  /* Le libellé s'adoucit, le CHIFFRE ressort (v0.1074) : sans couleur de plus, pour ne
     pas refaire du jaune après la passe sobre. */
  color: color-mix(in srgb, var(--text) 78%, var(--dim));
}
.slot-eff .st-v {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}
/* Colonne d'actions à droite : « Retirer » en haut, le badge 🎒 en bas. */
.slot-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  align-self: stretch;
  margin-top: 0;
}
/* Dans la colonne d'actions, le badge 🎒 suit le flux au lieu d'être posé en coin. */
.slot-actions .slot-better {
  position: relative;
  right: auto;
  bottom: auto;
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
}
.slot-vide b {
  color: var(--text);
  font-weight: 600;
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
/* La signature se lit comme une ligne à part : c'est un effet, pas une stat de plus. */
.set-tier.set-sig {
  margin-top: 3px;
  line-height: 1.3;
}
.set-tier.set-sig b {
  font-weight: 800;
}
/* Capstone (6 pièces) atteint en pièces mais bloqué faute de la bonne voie. */
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
/* ── Revue de l'équipement conseillé ──────────────────────────────────────
   Une ligne = un remplacement. Colonne gauche l'actuel, droite le proposé, et le
   GAIN de la ligne en tête : c'est lui qu'on lit d'abord. */
.plan-card {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  padding: 14px;
  border-radius: 16px 16px 0 0;
}
.plan-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.plan-title {
  flex: 1;
  font-size: 17px;
}
.plan-power {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--bg);
  font-variant-numeric: tabular-nums;
}
.pp-cur {
  color: var(--dim);
}
.pp-arrow {
  color: var(--dim-2);
}
.pp-new {
  font-family: var(--font-display, inherit);
  font-size: 22px;
  color: var(--accent);
}
.pp-delta {
  margin-left: auto;
  font-weight: 700;
}
.pp-delta.up,
.plan-gain.up {
  color: var(--d1, #7bc86c);
}
.pp-delta.down,
.plan-gain.down {
  color: var(--d4, #ff6a45);
}
.plan-rows {
  flex: 1;
  overflow-y: auto;
  display: grid;
  gap: 10px;
}
.plan-row {
  display: flex;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
}
.plan-row.off {
  opacity: 0.45;
}
.plan-check {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.plan-main {
  flex: 1;
  min-width: 0;
}
.plan-lbl {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.plan-kind {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
}
.plan-gain {
  margin-left: auto;
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.plan-cmp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.plan-side {
  min-width: 0;
  padding: 7px 8px;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid transparent;
}
.plan-side.new {
  border-color: var(--accent);
}
.plan-side-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim-2);
  margin-bottom: 2px;
}
.plan-nm {
  font-size: 12.5px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: baseline;
}
.plan-sub {
  font-size: 11px;
  color: var(--dim);
}
.plan-eff {
  display: grid;
  gap: 1px;
  margin-top: 3px;
}
.plan-empty {
  font-size: 12px;
  color: var(--dim-2);
  font-style: italic;
}
.plan-voie {
  font-size: 13px;
}
.plan-set {
  display: grid;
  gap: 4px;
  font-size: 12.5px;
}
.plan-set-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 6px;
}
.plan-set-slot {
  color: var(--dim);
  min-width: 70px;
}
.plan-set-from {
  color: var(--dim);
  text-decoration: line-through;
}
.plan-set-arrow {
  color: var(--dim);
}
.plan-set-to {
  font-weight: 600;
}
.plan-actions {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.stash-side.best {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
/* La PUISSANCE est le verdict de cette modale : elle se lit avant tout le reste. */
.stash-pow {
  font-family: var(--font-display, inherit);
  font-size: 20px;
  line-height: 1.1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  margin: 2px 0 5px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.stash-side.best .stash-pow {
  color: var(--accent);
}
.stash-delta.up {
  color: var(--d1, #7bc86c);
}
.stash-delta.down {
  color: var(--d4, #ff6a45);
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
  position: relative;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 8px;
  border: 1px solid var(--rk, var(--line));
  background: color-mix(in srgb, var(--rk, var(--line)) 12%, var(--surface));
  cursor: pointer;
  padding: 0;
}
.lo-item:active {
  transform: scale(0.92);
}
.lo-item.worn {
  box-shadow: 0 0 0 2px #7bc86c inset;
}
.lo-worn {
  position: absolute;
  right: 1px;
  bottom: 0;
  font-size: 9px;
  color: #7bc86c;
}
.lo-ok {
  color: #7bc86c;
}
.lo-hint {
  font-size: 10.5px;
  color: var(--dim);
  margin: -2px 0 6px;
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
/* Doublons d’un set (v0.839) : en pointillés, ils ne comptent pas au set. */
.lo-spares {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
}
.lo-spares-lab {
  font-size: 10.5px;
  color: var(--dim);
  margin-right: 2px;
}
.lo-item.spare {
  border-style: dashed;
  opacity: 0.85;
}
.lo-all-spares {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 6px 10px;
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
/* Pastille de NIVEAU d'objet — NEUTRE (v0.1073). Elle était en accent plein, quel que soit
   le rang : en stuff full Or, ce jaune se confondait avec celui du rang, et l'accent dit
   partout ailleurs « il y a quelque chose à faire ». */
.lvl-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  background: var(--surface-2, var(--surface));
  border: 1px solid var(--line);
  letter-spacing: 0.2px;
}
/* Stats d'un objet, une par ligne (affichage clair). */
.stat-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}
/* ⚠️ En couleur de TEXTE (v0.1073), plus en accent : le jaune d'accent se confondait avec
   celui du rang Or, et une ligne de stats n'est pas une action. */
.stat-line {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}
/* Pastille d'enchant +N (objet). */
.gpill.ench {
  color: #15120e;
  background: var(--accent);
  border-color: var(--accent);
  font-weight: 800;
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
.ench-prot.off {
  opacity: 0.5;
  cursor: default;
}
.gpill.p-commun,
.gpill.p-inhabituel,
.gpill.p-magique,
.gpill.p-rare,
.gpill.p-epique,
.gpill.p-legendaire,
.gpill.p-mythique,
.gpill.p-primordial {
  color: var(--rk);
  border-color: var(--rk);
}
.gpill.set {
  color: var(--dark, #15120e);
  background: var(--accent);
  border-color: var(--accent);
}
/* Badge « pièce de set » 🧩 en HAUT À DROITE de la tuile d'équipement (ticket c0b3547f) :
   libère la ligne des pastilles (rareté/niveau) qui débordait. */
.slot-set-corner {
  font-size: 13px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
  pointer-events: none;
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
/* Ligne 3 : EFFET mis en avant (ce que l'objet fait). */
/* Comparaison d'EFFET : cet objet vs équipé, en 2 lignes alignées et lisibles. */
.ii-compare {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--line) 22%, transparent);
}
/* Un bloc par objet : en-tête (label + rang + niv + jet) puis stats sous-jacentes. */
.cmp-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cmp-item.eq {
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
}
.cmp-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.cmp-lbl {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--dim);
}
.cmp-free {
  font-size: 12px;
  color: var(--dim);
}
.cmp-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 2px;
}
/* L'objet du sac = mis en avant (accent) ; l'équipé = plus discret. */
.cmp-item.eq .stat-line {
  color: var(--text);
  font-weight: 600;
}
/* Comparaison stat par stat : vert si supérieure, rouge si inférieure (les 2 côtés). */
.stat-line.up,
.cmp-item.eq .stat-line.up {
  color: #7bc86c;
}
.stat-line.down,
.cmp-item.eq .stat-line.down {
  color: #ff6a45;
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
/* Détail d'un objet (inspection) */
.insp-card {
  width: 100%;
  max-width: 460px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px 16px 0 0;
  padding: 16px;
  color: var(--text);
}
.insp-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.insp-name {
  font-size: 15px;
  font-weight: 800;
}
.insp-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 3px;
  font-size: 11px;
}
.insp-slot {
  color: var(--dim);
}
.insp-affixes {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.insp-eff {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
}
.insp-leg {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #ff9e3f 45%, var(--line));
  background: color-mix(in srgb, #ff9e3f 10%, var(--surface));
}
.insp-leg-name {
  display: block;
  font-weight: 800;
  color: #ff9e3f;
  font-size: 13px;
}
.insp-leg-desc {
  display: block;
  font-size: 12px;
  color: var(--text);
  margin-top: 2px;
  line-height: 1.35;
}
.insp-chances,
.ii-chances {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.4;
}
.insp-set {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent);
}
.insp-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
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
/* Qualité en ÉTOILE (★1→★5) collée au rang : pastille ronde. */
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
  background: var(--dim);
}
/* Rang en pastille ronde (comme la qualité), fond = couleur du rang --rk. */
/* La pastille « rang ★★★☆☆ » des listes de talents et de familiers. CONTOUR coloré et non
   aplat : le libellé est long (un nom de rang plus cinq étoiles) et un bloc de couleur pleine
   de cette largeur écraserait le nom du talent juste à côté. Même langage que la pastille de
   rang des tuiles d'équipement de la Guilde. ⚠️ « .rk-badge » (fond plein) reste pour l'ÉCHELLE
   d'aide, où huit aplats côte à côte SONT la lecture. */
.rk-grade {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  white-space: nowrap;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--rk, var(--dim));
  border: 1px solid var(--rk, var(--dim));
}
.rk-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  white-space: nowrap;
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

/* ── Rangs : la couleur --rk est posée par les classes r- et p- (bloc GLOBAL de app.scss,
   couleurs lues de RANK_COLOR au démarrage). Les consommateurs lisent var(--rk). ── */
/* Cartes à liseré gauche (r-*) : le bord suit la rareté ; le texte .rarity aussi. */
.r-commun,
.r-inhabituel,
.r-magique,
.r-rare,
.r-epique,
.r-legendaire,
.r-mythique,
.r-primordial {
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
/* ⚠️ CE N'ÉTAIT PAS QUE DE LA CSS MORTE, C'ÉTAIT UN BUG. La règle énumérait les DIX
   anciens rangs G→SSS, remplacés depuis par les 8 raretés nommées (`RANK_ORDER`) : elle
   ne matchait donc plus RIEN, et les pastilles de récompense de boss avaient perdu leur
   couleur de rareté sans que personne ne le voie. On cible désormais la présence d'une
   classe `p-*` — laquelle pose `--rk` — au lieu de réénumérer des valeurs qui changent. */
.rc-pill[class*='p-'] {
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
/* % de réussite réel sur un boss — mêmes teintes que le Labyrinthe (`successTier`). */
.dgn-chip.succ.ok {
  color: color-mix(in srgb, #7bc86c 78%, var(--dim));
}
.dgn-chip.succ.mid {
  color: color-mix(in srgb, #ffb23f 78%, var(--dim));
}
.dgn-chip.succ.bad {
  color: color-mix(in srgb, #ff6a45 70%, var(--dim));
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
.im-claim {
  margin-top: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.im-wait {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dim);
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
/* 🐉 Illustration du boss dans la liste (v0.1011) : même taille visuelle que la tuile
   la permet, halo clair pour les boss presque noirs (Titan du Néant, Éclipse). */
.mboss-art-wrap {
  position: relative;
  flex-shrink: 0;
  width: 60px;
  height: 60px;
}
.mboss-art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: bottom;
  filter: drop-shadow(0 0 2px rgba(255, 236, 200, 0.35));
}
.mboss-art.shadow {
  filter: brightness(0);
  opacity: 0.45;
}
.mboss-lock {
  position: absolute;
  right: -2px;
  bottom: -2px;
  font-size: 16px;
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
/* Portail sans fin : teinte « néant » violette pour la distinguer des boss */
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
.rm-skips {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
}
.result-skip-set {
  margin: -2px 0 8px;
  font-size: 12px;
  color: var(--dim);
}
.rm-skip {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
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
/* Écrans étroits (téléphones, Samsung Z Fold PLIÉ ~344 px → modale ≈ 316 px) : les 4 boutons
   d'action (Réattaquer + coût, Combat suivant + coût, Inventaire, Fermer) sont tassés sur une
   seule ligne. On passe en GRILLE 2×2 (chaque bouton ≈ 50 %) → cibles tactiles confortables,
   coûts lisibles. Au-dessus de 440 px (tablette, Z Fold DÉPLIÉ), la ligne unique est conservée. */
@media (max-width: 440px) {
  .rm-actions-row {
    flex-wrap: wrap;
  }
  .rm-actions-row .rm-btn {
    flex: 1 1 calc(50% - 4px);
  }
  .rm-actions-row .rm-btn.rm-icon {
    width: auto;
  }
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
  flex-wrap: wrap; /* écran étroit (Z Fold plié) : les gains passent sous le titre au lieu de se tasser */
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
.gain-pill.seals {
  color: #e0b36a;
  background: color-mix(in srgb, #e0b36a 16%, transparent);
  border: 1px solid #e0b36a;
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
.result-skip {
  font-size: 11.5px;
  color: var(--dim);
  margin: -4px 0 8px;
}
.log {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
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
  flex: 1 1 auto; /* nom long → tronqué (…) plutôt que d'écraser l'issue/les tours sur écran étroit */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.boss-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
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
.ladder-row.me {
  border-color: var(--accent);
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
/* 💠 Le tirage offert du jour, sous l'énergie : il était versé en silence, et 110 pierres
   de mana qui arrivent sans un mot ne se lisent pas comme un cadeau. */
.lb-mana {
  margin-top: 4px;
  font-size: 12px;
  color: #b57bff;
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

/* Le bandeau est le pli de la carte des mondes : une rangée-titre en bas du bloc. */
.region-banner.foldable {
  cursor: pointer;
  user-select: none;
}
.region-banner.foldable:focus-visible {
  outline: 2px solid var(--rc);
  outline-offset: 2px;
}
/* Le repère du pli, DANS le bandeau : un filet le sépare du reste du bloc. Pas de focus
   propre — c'est le bandeau entier qui est le bouton (et qui fait la cible tactile). */
.rb-fold {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--rc) 30%, var(--line));
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}
.mf-chev {
  display: inline-block;
  transition: transform 0.2s ease;
  color: var(--dim);
}
.mf-chev.open {
  transform: rotate(90deg);
}
.mf-hint {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--dim);
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
.best-art {
  width: 52px;
  height: 52px;
  object-fit: contain;
  object-position: bottom;
  /* Halo clair : les ennemis presque noirs se fondraient dans la tuile sombre. */
  filter: drop-shadow(0 0 2px rgba(255, 236, 200, 0.35));
}
.best-art.shadow {
  filter: brightness(0);
  opacity: 0.45;
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
