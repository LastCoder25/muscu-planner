<template>
  <component :is="embedded ? 'div' : 'q-page'" class="expe" :class="{ embedded }">
    <GameLoader :show="booting" icon="🗝️" label="Entrée dans le Labyrinthe…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Labyrinthe</div>
      <div class="iconbtn" />
    </header>

    <!-- LOBBY : un palier = une tuile (son gardien en image, le prix en clés, les infos en
         pastilles). Les règles longues vivent dans un volet replié. -->
    <div v-if="phase === 'lobby'" class="lobby">
      <div class="lobby-head">
        <span class="lh-keys" title="Tes clés du Labyrinthe"
          >🗝️ <b>{{ keys }}</b> clé{{ keys > 1 ? 's' : '' }}</span
        >
        <span v-if="labyUnlocked && labyLuck > 0" class="lh-gate"
          >🚪 Porte niv.{{ gateLevel }} · coffres +{{ Math.round(labyLuck * 100) }} %</span
        >
      </div>
      <p v-if="!labyUnlocked" class="lobby-lock">
        🔒 Construis la <b>🚪 Porte du Labyrinthe</b> sur ta base pour le débloquer.
      </p>
      <details class="lobby-rules">
        <summary>Comment ça marche</summary>
        <p>
          Un donjon à <b>étages</b> : salles, coffres, pièges, et un gardien au fond. Tes
          <b>PV se reportent</b> d'une salle à l'autre — c'est l'usure qui te met en danger. À la
          mort tu <b>perds les objets trouvés</b> et une part de l'or, qui grandit avec la
          profondeur. La <b>retraite</b> (départ ou escalier) garde tout le ramassé.
        </p>
        <p class="dim">Les clés 🗝️ tombent sur les donjons, les boss et les archives.</p>
      </details>

      <!-- Paliers de plus en plus profonds, débloqués en chaîne. -->
      <div v-if="labyUnlocked" class="laby-grid">
        <article
          v-for="(t, ti) in shownTiers"
          :key="t.laby.id"
          class="laby-tile"
          :class="{ locked: !t.unlocked, cleared: t.cleared }"
          :style="{ '--tier': RANK_COLOR[t.laby.rank] }"
        >
          <div class="lt-art">
            <img
              v-if="t.unlocked && guardianArt(t.laby)"
              :src="guardianArt(t.laby)!"
              :alt="labyGuardian(t.laby).name"
              class="lt-img"
              loading="lazy"
              @error="artFailed.add(labyGuardian(t.laby).name)"
            />
            <span v-else class="lt-art-emo">{{
              t.unlocked ? labyGuardian(t.laby).emoji : '🔒'
            }}</span>
            <span class="lt-cost" :class="{ short: keys < labyKeyCost(t.laby.id) }"
              >{{ labyKeyCost(t.laby.id) }} 🗝️</span
            >
            <span v-if="t.cleared" class="lt-done" title="Palier nettoyé">✓</span>
          </div>
          <div class="lt-body">
            <div class="lt-name font-display">{{ t.laby.name }}</div>
            <div v-if="t.unlocked" class="lt-guard">
              {{ t.laby.emoji }} {{ labyGuardian(t.laby).name }}
            </div>
            <div class="lt-pills">
              <span>Niv {{ t.laby.recoLevel }}</span>
              <span>{{ t.laby.floors }} étages</span>
              <span
                v-if="t.unlocked && t.success !== null"
                class="lt-pow"
                :class="t.success === null ? 'none' : pctClass(t.success)"
                :title="
                  t.success === null
                    ? 'Jamais tenté'
                    : `Tes runs nettoyés sur ce palier : ${t.success} % sur ${t.runs}`
                "
                >🎯 {{ t.success === null ? '—' : t.success + ' %' }}</span
              >
              <span class="lt-fam" title="Rang du familier garanti au bout"
                >🐾 <b :style="{ color: rankColorOf(t.laby) }">{{ famRankName(t.laby) }}</b></span
              >
              <span class="lt-death" title="Part de l'or gardée si tu tombes"
                >💀 {{ t.deathKeep }} %</span
              >
            </div>
            <div v-if="!t.unlocked" class="lt-lock">
              Nettoie « {{ tiers[ti - 1]?.laby.name }} » d’abord
            </div>
            <div v-else class="lt-actions">
              <button
                type="button"
                class="lt-go"
                :disabled="keys < labyKeyCost(t.laby.id)"
                @click="start(t.laby)"
              >
                {{
                  keys >= labyKeyCost(t.laby.id)
                    ? 'Lancer'
                    : `Il manque ${labyKeyCost(t.laby.id) - keys} 🗝️`
                }}
              </button>
              <!-- Auto : réservé aux paliers DÉJÀ nettoyés (le run se joue tout seul).
                   Admin (mon compte) : disponible dès qu'un palier est débloqué. -->
              <button
                v-if="t.cleared || auth.isAdmin"
                type="button"
                class="lt-go auto"
                :disabled="keys < labyKeyCost(t.laby.id)"
                title="Le run se joue tout seul, en accéléré — tu n’as plus rien à regarder"
                @click="startAuto(t.laby)"
              >
                ⚡ Auto ×{{ SPEED_STEPS[SPEED_STEPS.length - 1] }}
              </button>
            </div>
          </div>
        </article>
      </div>
      <button
        v-if="labyUnlocked && hiddenTiers"
        type="button"
        class="lobby-more"
        @click="showAllTiers = !showAllTiers"
      >
        {{
          showAllTiers
            ? 'Masquer les paliers verrouillés'
            : `Voir les ${hiddenTiers} paliers plus profonds`
        }}
      </button>
    </div>

    <!-- RUNNING : exploration -->
    <template v-else>
      <!-- Barre d'état d'une descente : étages, PV, et ce qui compte pendant l'usure (jauge de
           relique, barrière de départ) — ils ne se voyaient qu'en combat. -->
      <div class="run-hud">
        <div class="rh-top">
          <div class="rh-pips" :aria-label="`Étage ${run.floor + 1} sur ${run.floors}`">
            <span v-for="(p, i) in pips" :key="i" class="rh-pip" :class="p" />
          </div>
          <span class="rh-floor"
            >Étage <b>{{ run.floor + 1 }}</b
            >/{{ run.floors }}</span
          >
          <span class="rh-pv">❤️ {{ displayedPv }}/{{ run.maxPv }}</span>
        </div>
        <div class="pv-bar">
          <div class="pv-fill" :class="{ low: pvPct < 30 }" :style="{ width: pvPct + '%' }" />
        </div>
        <div class="rh-chips">
          <span
            v-if="relicPower"
            class="bag-chip relic"
            :title="relicPower.name + ' — jauge de la relique, reportée d’un combat à l’autre'"
            >{{ relicPower.emoji }} {{ relicGauge }} %</span
          >
          <span v-if="barrierText" class="bag-chip" title="Barrière de départ : une par descente"
            >🔰 {{ barrierText }}</span
          >
          <span class="bag-chip">🪙 {{ gold }}</span>
          <button
            type="button"
            class="bag-chip bag-chip-btn"
            :class="{ bump: lootBump }"
            :disabled="!loot.length"
            title="Voir le butin ramassé"
            @click="lootOpen = true"
          >
            🎒 {{ loot.length }}
          </button>
        </div>
      </div>

      <!-- Contrôles AUTO flottants (téléportés au body → TOUJOURS au-dessus des modales de
           combat/coffre/piège). Vitesse ⏩ + stop en mode AUTO ; en mode MANUEL (après avoir
           repris la main), bouton pour RELANCER l'auto (si le palier est nettoyé). -->
      <Teleport to="body">
        <div v-if="phase === 'running' && !over" class="auto-float">
          <button
            type="button"
            class="af-speed"
            :class="{ on: autoSpeed > 1 }"
            title="Vitesse de l'auto (touche pour accélérer ; jusqu'à ×20 → retour ×1)"
            @click="toggleSpeed"
          >
            ⏩ ×{{ autoSpeed }}
          </button>
          <template v-if="autoMode">
            <span class="af-txt">⚡ Auto</span>
            <button type="button" class="af-stop" @click="stopAuto">✋ Reprendre la main</button>
          </template>
          <button
            v-else-if="labyrinthCleared(selectedLaby?.id ?? '', clearedSet)"
            type="button"
            class="af-stop af-resume"
            @click="resumeAuto"
          >
            ⚡ Relancer l'auto
          </button>
        </div>
      </Teleport>

      <div class="map-wrap">
        <div class="map-stage">
          <!-- Marge : les salles sont décalées aléatoirement (aspect organique) → padding
             pour ne pas rogner celles des bords. -->
          <svg
            :viewBox="`${-MAP_PAD} ${-MAP_PAD} ${cols * CELL + 2 * MAP_PAD} ${rows * CELL + 2 * MAP_PAD}`"
            class="map"
          >
            <!-- Décor du palier (lot 5) : sol dallé, murs, couloirs creusés, et le NOIR partout
                 où l'on n'a rien vu. Les couleurs viennent de la palette du palier. -->
            <defs>
              <pattern :id="PAT_ID" width="11" height="11" patternUnits="userSpaceOnUse">
                <rect width="11" height="11" :fill="theme.floor" />
                <path
                  d="M0 0.5H11M0.5 0V11M0 6H5.5M6 6V11"
                  :stroke="theme.joint"
                  stroke-width="1"
                  fill="none"
                />
              </pattern>
              <radialGradient :id="DARK_ID">
                <stop offset="0" stop-color="#000" />
                <stop offset="0.6" stop-color="#000" />
                <stop offset="1" stop-color="#000" stop-opacity="0" />
              </radialGradient>
              <mask
                :id="FOG_ID"
                maskUnits="userSpaceOnUse"
                :x="-MAP_PAD"
                :y="-MAP_PAD"
                :width="cols * CELL + 2 * MAP_PAD"
                :height="rows * CELL + 2 * MAP_PAD"
              >
                <rect
                  :x="-MAP_PAD"
                  :y="-MAP_PAD"
                  :width="cols * CELL + 2 * MAP_PAD"
                  :height="rows * CELL + 2 * MAP_PAD"
                  fill="#fff"
                />
                <circle
                  v-for="l in lights"
                  :key="'l' + l.id"
                  :cx="l.x"
                  :cy="l.y"
                  :r="l.r"
                  :fill="`url(#${DARK_ID})`"
                />
              </mask>
            </defs>
            <rect
              :x="-MAP_PAD"
              :y="-MAP_PAD"
              :width="cols * CELL + 2 * MAP_PAD"
              :height="rows * CELL + 2 * MAP_PAD"
              class="map-rock"
            />
            <!-- Couloirs creusés : le mur (large) puis le sol (étroit) par-dessus. -->
            <line
              v-for="c in corridors"
              :key="'w' + c.k"
              class="corr-wall"
              :stroke="theme.wall"
              :x1="c.x1"
              :y1="c.y1"
              :x2="c.x2"
              :y2="c.y2"
            />
            <line
              v-for="c in corridors"
              :key="c.k"
              class="corr-floor"
              :stroke="theme.corridor"
              :x1="c.x1"
              :y1="c.y1"
              :x2="c.x2"
              :y2="c.y2"
            />
            <g
              v-for="r in visibleRooms"
              :key="r.id"
              :class="[
                'room',
                roomClass(r.id),
                {
                  auto: autoMode,
                  'fx-chest': roomPulse?.id === r.id && roomPulse.kind !== 'trap',
                  'fx-trap': roomPulse?.id === r.id && roomPulse.kind === 'trap',
                },
              ]"
              @click="autoMode || onRoomClick(r.id)"
            >
              <!-- Cible de toucher : toute la case, même pour une porte étroite. -->
              <rect
                :x="cx(r) - SIZE / 2"
                :y="cy(r) - SIZE / 2"
                :width="SIZE"
                :height="SIZE"
                class="room-hit"
              />
              <template v-if="run.visited.includes(r.id)">
                <!-- Salle connue : murs, sol dallé, arête éclairée en haut. -->
                <rect
                  :x="cx(r) - SIZE / 2 - 4"
                  :y="cy(r) - SIZE / 2 - 4"
                  :width="SIZE + 8"
                  :height="SIZE + 8"
                  rx="6"
                  :fill="theme.wall"
                />
                <rect
                  :x="cx(r) - SIZE / 2"
                  :y="cy(r) - SIZE / 2"
                  :width="SIZE"
                  :height="SIZE"
                  rx="3"
                  :fill="`url(#${PAT_ID})`"
                />
                <rect
                  :x="cx(r) - SIZE / 2 - 4"
                  :y="cy(r) - SIZE / 2 - 4"
                  :width="SIZE + 8"
                  height="3.5"
                  rx="1.75"
                  :fill="theme.wallTop"
                  opacity="0.6"
                />
                <rect
                  :x="cx(r) - SIZE / 2"
                  :y="cy(r) - SIZE / 2"
                  :width="SIZE"
                  :height="SIZE"
                  rx="3"
                  class="room-flash"
                />
                <rect
                  :x="cx(r) - SIZE / 2 - 2"
                  :y="cy(r) - SIZE / 2 - 2"
                  :width="SIZE + 4"
                  :height="SIZE + 4"
                  rx="5"
                  class="room-edge"
                />
                <!-- Torches aux deux coins hauts de la salle. -->
                <circle
                  class="torch"
                  :cx="cx(r) - SIZE / 2 - 1"
                  :cy="cy(r) - SIZE / 2 - 1"
                  r="2.6"
                  :fill="theme.light"
                />
                <circle
                  class="torch t2"
                  :cx="cx(r) + SIZE / 2 + 1"
                  :cy="cy(r) - SIZE / 2 - 1"
                  r="2.6"
                  :fill="theme.light"
                />
                <template v-if="r.id === run.current" />
                <ChestIcon
                  v-else-if="isVisitedChest(r)"
                  :color="chestColorOf(r.id)"
                  :x="cx(r) - 12"
                  :y="cy(r) - 12"
                  width="24"
                  height="24"
                />
                <text v-else :x="cx(r)" :y="cy(r) + 1" class="room-emo">{{ roomGlyph(r) }}</text>
              </template>
              <template v-else>
                <!-- Salle seulement VUE au bout d'un couloir : une porte, et rien derrière. -->
                <rect
                  :x="cx(r) - 12"
                  :y="cy(r) - 15"
                  width="24"
                  height="30"
                  rx="12"
                  class="door"
                  :stroke="theme.wallTop"
                />
                <text :x="cx(r)" :y="cy(r) + 1" class="room-emo door-q">?</text>
              </template>
            </g>
            <!-- Le noir : tout ce que la lumière des salles n'atteint pas. -->
            <rect
              :x="-MAP_PAD"
              :y="-MAP_PAD"
              :width="cols * CELL + 2 * MAP_PAD"
              :height="rows * CELL + 2 * MAP_PAD"
              class="map-fog"
              :mask="`url(#${FOG_ID})`"
            />
            <!-- Effet de la salle qu'on vient d'ouvrir : anneau + texte qui monte (coffre, piège,
               salle secrète). Remplace la modale qui s'ouvrait à chaque salle. -->
            <g
              v-if="roomPulse"
              :key="'pulse' + roomPulse.n"
              class="pulse"
              :class="roomPulse.kind"
              :style="{ '--pulse-ms': pulseMs + 'ms' }"
            >
              <circle
                :cx="cx(floor.rooms[roomPulse.id]!)"
                :cy="cy(floor.rooms[roomPulse.id]!)"
                :r="SIZE / 2 + 2"
                class="pulse-ring"
              />
              <text
                :x="cx(floor.rooms[roomPulse.id]!)"
                :y="cy(floor.rooms[roomPulse.id]!) - SIZE / 2 - 4"
                class="pulse-txt"
              >
                {{ roomPulse.text }}
              </text>
            </g>
          </svg>
          <!-- Le héros, posé dans la salle où il se trouve. Il glisse d'une salle à l'autre
             (y compris quand il retraverse le connu, pas à pas). -->
          <div
            class="hero-tok"
            :class="{ hurt: pvPct < 30 }"
            :style="{
              left: heroPos.left + '%',
              top: heroPos.top + '%',
              width: heroPos.width + '%',
              '--walk-ms': walkMs + 'ms',
            }"
            aria-hidden="true"
          >
            <span class="ht-glow" />
            <AventureAvatar :profile="playerProfile" :equipped="playerEquipped" no-companions />
          </div>
        </div>
      </div>

      <button
        v-if="lastEvent?.item"
        type="button"
        class="event event-btn"
        :class="lastEvent.kind"
        @click="detailItem = lastEvent.item"
      >
        {{ lastEvent.text }} <span class="ev-more">voir ›</span>
      </button>
      <div v-else-if="lastEvent" class="event" :class="lastEvent.kind">{{ lastEvent.text }}</div>

      <div class="actions">
        <q-btn
          v-if="onStairs"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          icon="south"
          label="Descendre à l'étage suivant"
          @click="goDown"
        />
        <q-btn
          v-else-if="onBoss"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          icon="emoji_events"
          label="Vaincre & sortir du labyrinthe"
          @click="finish"
        />
        <div v-else class="hint">
          Touche une salle <b>?</b> reliée pour explorer. Les couloirs mènent vers l'inconnu.
        </div>
        <button v-if="canRetreat" type="button" class="retreat-btn" @click="retreat">
          🚪 Sortir en gardant le butin
        </button>
      </div>
    </template>

    <!-- Animation de salle : combat / coffre / piège -->
    <q-dialog :model-value="!!roomFx" persistent>
      <q-card class="fx-card">
        <template v-if="roomFx?.kind === 'combat'">
          <!-- Animation sautée en AUTO rapide (combatSkipped) → résultat direct, on enchaîne. -->
          <CombatStage
            v-if="!combatSkipped"
            :key="run.current"
            :player-name="char.row?.pseudo ?? 'Toi'"
            :player-max-pv="run.maxPv"
            :player-start-pv="stageStartPv"
            :fights="stageFights"
            :player-profile="playerProfile"
            :player-equipped="playerEquipped"
            @done="onFxDone"
          />
          <template v-if="fxDone">
            <div class="fx-result" :class="roomFx.win ? 'good' : 'bad'">
              {{ roomFx.win ? '🏆 Victoire !' : '💀 Défaite…' }}
            </div>
            <q-btn
              class="fx-cta"
              color="primary"
              text-color="dark"
              no-caps
              unelevated
              label="Continuer"
              @click="closeFx"
            />
          </template>
        </template>

        <template v-else-if="roomFx?.kind === 'descend'">
          <div class="descend-anim">🪜</div>
          <div class="fx-result good">Étage {{ run.floor + 1 }} / {{ run.floors }}</div>
        </template>
      </q-card>
    </q-dialog>

    <!-- Fin de run (bêta) -->
    <q-dialog v-model="over" persistent>
      <q-card class="over-card">
        <div class="over-emo">{{ run.status === 'cleared' ? '🏆' : '💀' }}</div>
        <div class="over-title font-display">
          {{ run.status === 'cleared' ? 'Labyrinthe nettoyé !' : 'Vous êtes tombé…' }}
        </div>
        <div class="over-haul">
          🪙 {{ gold }} · 🎒 {{ run.status === 'dead' ? 0 : loot.length }} objet(s)
        </div>
        <div class="over-sub">
          <template v-if="run.status === 'cleared'"> Butin crédité (+ trésor final) 🎉 </template>
          <template v-else>
            Tu es tombé : l'or et les ressources sont gardés, les objets restent au donjon.
          </template>
        </div>

        <!-- Récap du butin ramené (pour juger la rentabilité du run sans fouiller le sac) -->
        <div v-if="run.status !== 'dead' && loot.length" class="over-loot">
          <div class="ol-title">
            Objets rapportés <span class="ol-hint">(tape pour le détail)</span>
          </div>
          <button
            v-for="(it, i) in loot"
            :key="i"
            type="button"
            class="ol-item"
            :class="'r-' + it.rarity"
            @click="detailItem = it"
          >
            <ItemIcon :item="it" :size="38" />
            <div class="ol-main">
              <span class="ol-name">{{ it.name }}</span>
              <span class="ol-meta"
                >{{ gradeLabel(it) }} · {{ effectLabel(it.effect, it.level) }}</span
              >
            </div>
            <span class="ol-chevron">›</span>
          </button>
        </div>
        <!-- Les clés restantes, là où l'on décide de rejouer : sans ça, il fallait revenir au
             lobby pour savoir si on pouvait relancer. -->
        <div class="over-keys" :class="{ short: !replayKeys.runs }">{{ replayKeys.label }}</div>
        <div class="over-row">
          <q-btn
            flat
            no-caps
            :label="canStart ? `Rejouer (−${replayCost} 🗝️)` : `${replayCost} 🗝️ requises`"
            color="primary"
            :disable="!canStart"
            @click="replay"
          />
          <q-btn
            v-if="labyrinthCleared(selectedLaby?.id ?? '', clearedSet)"
            flat
            no-caps
            label="⚡ Rejouer en auto"
            color="primary"
            :disable="!canStart"
            @click="replayAuto"
          />
          <q-btn flat no-caps label="Retour aux paliers" @click="returnToLobby" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Butin ramassé EN COURS de run (clic sur le 🎒 de la topbar, ticket 8a43ca8c) -->
    <q-dialog v-model="lootOpen" position="bottom">
      <q-card class="fx-loot-card">
        <div class="ol-title">
          🎒 Butin ramassé <span class="ol-hint">(tape pour le détail)</span>
        </div>
        <div v-if="!loot.length" class="ol-hint">Rien pour l'instant — explore les coffres 📦.</div>
        <button
          v-for="(it, i) in loot"
          :key="i"
          type="button"
          class="ol-item"
          :class="'r-' + it.rarity"
          @click="detailItem = it"
        >
          <ItemIcon :item="it" :size="38" />
          <div class="ol-main">
            <span class="ol-name">{{ it.name }}</span>
            <span class="ol-meta"
              >{{ gradeLabel(it) }} · {{ effectLabel(it.effect, it.level) }}</span
            >
          </div>
          <span class="ol-chevron">›</span>
        </button>
        <q-btn
          class="fx-cta"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          label="Fermer"
          @click="lootOpen = false"
        />
      </q-card>
    </q-dialog>

    <!-- Détail d'un objet rapporté (clic sur le récap de butin) -->
    <q-dialog :model-value="!!detailItem" @update:model-value="detailItem = null">
      <q-card v-if="detailItem" class="fx-loot-card im-card" :class="'r-' + detailItem.rarity">
        <ItemIcon :item="detailItem" :size="56" class="fl-icon" />
        <div class="fl-name">{{ detailItem.name }}</div>
        <div class="fl-meta">
          {{ gradeLabel(detailItem) }} · {{ SLOT_LABEL[detailItem.slot] }} · niv
          {{ detailItem.level }}
        </div>
        <div class="fl-eff">✦ {{ effectLabel(detailItem.effect, detailItem.level) }}</div>
        <div v-if="detailItem.effect2" class="fl-eff">
          ✦ {{ effectLabel(detailItem.effect2, detailItem.level) }}
        </div>
        <div v-if="detailItem.effect3" class="fl-eff">
          ✦ {{ effectLabel(detailItem.effect3, detailItem.level) }}
        </div>
        <div v-if="legendaryOf(detailItem)" class="fl-leg">
          {{ legendaryOf(detailItem)!.emoji }} {{ legendaryOf(detailItem)!.name }} —
          {{ legendaryOf(detailItem)!.desc }}
        </div>
        <div v-if="detailItem.setId" class="fl-set">🧩 {{ setName(detailItem.setId) }}</div>
        <!-- Comparatif avec l'objet ÉQUIPÉ du même emplacement + Δ de puissance si équipé. -->
        <div class="fl-cmp">
          <template v-if="detailEquipped">
            <div class="fl-cmp-eq">
              Équipé : {{ gradeLabel(detailEquipped) }} · niv {{ detailEquipped.level }} ·
              {{ effectLabel(detailEquipped.effect, detailEquipped.level) }}
            </div>
          </template>
          <div v-else class="fl-cmp-eq dim">
            Emplacement {{ SLOT_LABEL[detailItem.slot] }} libre
          </div>
          <div
            v-if="detailPowerDelta != null"
            class="fl-cmp-delta"
            :class="detailPowerDelta >= 0 ? 'up' : 'down'"
          >
            ⚔️ {{ detailPowerDelta >= 0 ? '+' : '' }}{{ detailPowerDelta }} puissance si équipé
          </div>
        </div>
        <q-btn
          class="fx-cta"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          label="Fermer"
          @click="detailItem = null"
        />
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { backOr } from '@/lib/nav';
import {
  generateDungeon,
  startRun,
  canMove,
  enterRoom,
  pathTo,
  applyDamage,
  descend,
  isVisible,
  ROOM_EMOJI,
  type Floor,
  type Room,
  type RunState,
} from '@/lib/dungeonCrawl';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import { useGamePanel } from '@/composables/useGamePanel';
import { labyrinthUnlocked, labyrinthLuckBonus } from '@/lib/buildings';
import { woundRemainingMs } from '@/lib/raid';
import {
  LABYRINTHS,
  labyrinthUnlockedTier,
  labyrinthCleared,
  labyClearId,
  labyKeyCost,
  replayKeysInfo,
  deathKeepFraction,
  labySuccessPct,
  type Labyrinth,
} from '@/data/labyrinths';
import { successTier } from '@/lib/runStats';
import { computeCharacter } from '@/lib/character';
import {
  playerWithGear,
  rollDrop,
  rollSetPiece,
  ITEM_SETS,
  effectLabel,
  gradeLabel,
  rarityRank,
  RARITY_RANK,
  fxRarity,
  RANK_COLOR,
  legendaryOf,
  magicFindLuck,
  tierIndexOf,
  SLOT_LABEL,
  RANK_ORDER,
  familiarRankRef,
  relicPowerOf,
  type Item,
} from '@/lib/items';
import { rollActivityFamiliar } from '@/data/familiars';
import { pickLabyFoe, type LabyFoe } from '@/data/labyrinthFoes';
import { rollChestGrade, pickLabyTrap, type ChestGrade, type LabyTrap } from '@/data/labyrinthLoot';
import { talentEffects } from '@/lib/talents';
import {
  simulateCombat,
  combatPower,
  mulberry32,
  type Combatant,
  type CombatEvent,
} from '@/lib/combat';
import {
  LABY_RUN,
  labyDepth,
  labyrinthFighter,
  labyrinthRest,
  labyrinthFoe,
  labyrinthTrapDamage,
  labyTierIndex as tierIndexOfLaby,
} from '@/lib/labyrinthRun';
import CombatStage from '@/components/CombatStage.vue';
import GameLoader from '@/components/GameLoader.vue';
import ChestIcon from '@/components/ChestIcon.vue';
import ItemIcon from '@/components/ItemIcon.vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { floorPips, labyGuardian, barrierLabel } from '@/lib/labyrinthView';
import { labyTheme, roomLightRadius } from '@/lib/labyrinthScene';
import { monsterArt } from '@/data/monsterArt';

const props = defineProps<{ embedded?: boolean }>();
const route = useRoute();
const router = useRouter();
const { gameBack } = useGamePanel();
// Retour/Sortir : dans le volet jeu (cockpit) → revient à l'Aventure ; sinon route.
function leave() {
  if (props.embedded) return gameBack();
  backOr(router, '/aventure');
}
// Quitter un run EN COURS = abandon → le butin ramassé (crédité seulement à la fin du
// palier) est perdu. On avertit (le bouton « 🚪 Sortir en gardant le butin » banque, lui).
const runInProgress = () => phase.value === 'running' && !over.value;
function back() {
  if (runInProgress()) {
    $q.dialog({
      title: 'Quitter le labyrinthe ?',
      message:
        'Le run en cours sera <b>abandonné</b> : tu perds tout le butin ramassé (or, ressources, objets). Le butin n’est crédité qu’<b>à la fin du palier</b>. Pour le garder, utilise « 🚪 Sortir en gardant le butin » sur un escalier.',
      html: true,
      cancel: { label: 'Rester', flat: true },
      ok: { label: 'Quitter (perdre le butin)', color: 'negative' },
    }).onOk(leave);
    return;
  }
  leave();
}
// Rafraîchir/fermer l'onglet pendant un run → avertissement natif du navigateur.
function beforeUnload(e: BeforeUnloadEvent) {
  if (runInProgress()) {
    e.preventDefault();
    e.returnValue = '';
  }
}
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const gameFx = useGameFx();
const progress = useProgress();

// Phase : lobby (choix de lancer, coûte les clés du palier) → running (exploration).
const phase = ref<'lobby' | 'running'>('lobby');
const credited = ref(false); // butin crédité une seule fois en fin de run
const keys = computed(() => char.row?.keys ?? 0);
// Le Labyrinthe est débloqué en construisant la 🚪 Porte du Labyrinthe sur la carte.
// Chaque niveau de la Porte enrichit le butin des coffres (labyLuck).
const labyUnlocked = computed(() => labyrinthUnlocked(char.row?.buildings ?? []));
const gateLevel = computed(
  () => (char.row?.buildings ?? []).find((b) => b.typeId === 'labyrinth_gate')?.level ?? 0,
);
const labyLuck = computed(() => labyrinthLuckBonus(char.row?.buildings ?? []));
/** Prix du palier qu’on rejouerait depuis la modale de fin. */
const replayCost = computed(() => labyKeyCost((selectedLaby.value ?? LABYRINTHS[0]!).id));
const replayKeys = computed(() => replayKeysInfo(keys.value, replayCost.value));
const canStart = computed(
  () => labyUnlocked.value && keys.value >= replayCost.value && progress.ready.value && !!char.row,
);

// ── Ladder de paliers : chaque palier se débloque en nettoyant le précédent. ──
const clearedSet = computed(() => char.row?.cleared_dungeons ?? []);
const tiers = computed(() =>
  LABYRINTHS.map((l) => ({
    laby: l,
    unlocked: labyrinthUnlockedTier(l.id, clearedSet.value),
    cleared: labyrinthCleared(l.id, clearedSet.value),
    deathKeep: Math.round(deathKeepFraction(l.id) * 100),
    success: labySuccessPct(char.row?.laby_stats ?? {}, l.id),
    runs: char.row?.laby_stats?.[l.id]?.runs ?? 0,
  })),
);
// L'accueil montre les paliers ouverts et LE prochain à ouvrir ; les suivants se déplient
// (huit tuiles verrouillées identiques noyaient celles qu'on peut jouer).
const showAllTiers = ref(false);
const firstLocked = computed(() => {
  const i = tiers.value.findIndex((t) => !t.unlocked);
  return i < 0 ? tiers.value.length : i;
});
const shownTiers = computed(() =>
  showAllTiers.value ? tiers.value : tiers.value.slice(0, firstLocked.value + 1),
);
const hiddenTiers = computed(() => Math.max(0, tiers.value.length - firstLocked.value - 1));
// Palier en cours d'exploration (choisi dans le lobby).
const selectedLaby = ref<Labyrinth | null>(null);

// ── Mode AUTO (paliers déjà nettoyés) : le run se joue TOUT SEUL, visuellement en
// temps réel (clique chaque salle, avance d'étage, combat le boss), puis affiche
// l'écran de fin. On enchaîne les salles via un timer qui appelle les MÊMES actions
// que le joueur (onRoomClick/goDown/finish), en fermant automatiquement les modales.
const autoMode = ref(false);
let autoTimer: ReturnType<typeof setTimeout> | undefined;
const AUTO_STEP_MS = 550;
// Vitesse de l'auto-run / des déplacements : paliers 1→20. Chaque tap monte d'un cran, retour
// à ×1. Mémorisée par compte (localStorage) → persiste entre les runs (ticket 06376fe4).
// Paliers de vitesse : chaque tap monte au suivant, boucle après le dernier. Va jusqu'à ×20
// (auto-run quasi instantané pour re-farmer un palier connu très vite).
const SPEED_STEPS = [1, 2, 3, 5, 8, 12, 20];
const autoSpeed = ref<number>(readSpeed());
function readSpeed(): number {
  try {
    const n = parseInt(localStorage.getItem('muscu:laby:speed') ?? '1', 10);
    return SPEED_STEPS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}
/** Source UNIQUE d'écriture de la vitesse — sinon la mémorisation diverge du réglage. */
function setSpeed(n: number) {
  autoSpeed.value = SPEED_STEPS.includes(n) ? n : 1;
  try {
    localStorage.setItem('muscu:laby:speed', String(autoSpeed.value));
  } catch {
    /* stockage indispo → on garde la valeur en mémoire seulement */
  }
}
function toggleSpeed() {
  const i = SPEED_STEPS.indexOf(autoSpeed.value);
  setSpeed(SPEED_STEPS[(i + 1) % SPEED_STEPS.length] ?? 1);
}

// Perso réel (stats de fond + équipement + talents) → combattant.
const character = computed(() =>
  computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + (char.row?.login_energy ?? 0),
    char.row?.energy_spent ?? 0,
  ),
);
// Effets actifs = talents + passif de VOIE (comme la fiche Héros) → le Labyrinthe combat
// avec ta vraie puissance de build.
const talentFx = computed(() => talentEffects(char.row?.talents ?? []));
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentFx.value,
    character.value.level.level,
    char.row?.voie,
  ),
);
const heroLevel = computed(() => character.value.level.level);
// Rang du familier garanti d'un palier POUR CE JOUEUR (v0.857) : la même référence que le
// tirage (`familiarRankRef`), donc la carte ne peut pas annoncer un autre rang que le butin.
function famRankOf(l: Labyrinth) {
  return RANK_ORDER[
    familiarRankRef({
      level: l.dropLevel,
      playerLevel: heroLevel.value,
      rankCap: RARITY_RANK[l.rank],
    })
  ]!;
}
const famRankName = (l: Labyrinth) => rarityRank(famRankOf(l)).name;
const rankColorOf = (l: Labyrinth) => RANK_COLOR[famRankOf(l)];
// Magic find (stat mineure) de l'équipement → luck bonus sur les coffres du labyrinthe.
const mfLuck = computed(() => magicFindLuck(char.row?.equipped ?? {}));

// ── Comparatif d'un objet (coffre/sac) avec l'ÉQUIPÉ du même emplacement ──
// Objet actuellement équipé sur l'emplacement de l'objet détaillé (pour la comparaison).
const detailEquipped = computed(() =>
  detailItem.value ? (char.row?.equipped?.[detailItem.value.slot] ?? null) : null,
);
// Δ de puissance de combat si on équipait l'objet détaillé (vs l'équipement actuel).
const detailPowerDelta = computed<number | null>(() => {
  const it = detailItem.value;
  if (!it) return null;
  const eq = { ...(char.row?.equipped ?? {}), [it.slot]: it };
  const withIt = combatPower(
    playerWithGear(
      char.row?.pseudo ?? 'Toi',
      character.value,
      eq,
      talentFx.value,
      character.value.level.level,
      char.row?.voie,
    ),
  );
  return Math.round(withIt - combatPower(fighter.value));
});

// ── % DE RÉUSSITE d'un palier : celui du JOUEUR (runs nettoyés / runs lancés, v0.884) ──
// Demande de l'utilisateur : plus d'estimation simulée, le vrai bilan de ses runs. Compté au
// lancement (`spendKey`) et au nettoyage (`applyExpedition`), relu dans `laby_stats`.
// Couleur du % de réussite : vert ≥70, orange 40-69, rouge <40.
const pctClass = successTier;

const CELL = 66;
const SIZE = 46; // côté d'une salle (carré arrondi) ; salles alignées sur la grille
const MAP_PAD = 8; // petite marge du viewBox

const floorsWanted = ref(Math.min(5, Math.max(2, Number(route.query.floors) || 3)));
// Seed pseudo-aléatoire (composant → Math.random autorisé, contrairement aux libs).
const seed = ref(Math.floor(Math.random() * 1_000_000) + 1);
const dungeon = ref<Floor[]>(generateDungeon(seed.value, floorsWanted.value));
// Le pool de PV du run = les VRAIS PV max du héros (avant : 140 fixe → incohérent
// avec le combat qui, lui, plafonnait le vol de vie aux PV réels → on remontait au
// max à chaque combat). Ré-initialisé dans onMounted une fois le perso chargé.
const run = ref<RunState>(
  startRun(floorsWanted.value, dungeon.value[0]!, Math.max(60, fighter.value.pv)),
);
// Bandeau sous la carte. `item` : le butin d'un coffre, qui s'ouvre au toucher.
const lastEvent = ref<{ kind: string; text: string; item?: Item } | null>(null);
const over = ref(false);
// Butin cumulé du run (Phase 3b : affiché ; persistance/récompense = Phase 3c).
const gold = ref(0);
// Compteur INTERNE de richesse du run (monstres/coffres/vault − pièges) : plus une devise
// affichée ni créditée (poussière + parchemins d'enchant retirés du jeu) → conservé comme
// proxy de progression du run (intensité des FX de fin, etc.).
const dust = ref(0);
const loot = ref<Item[]>([]);
// Détail d'un objet du récap de butin (modale au clic).
const detailItem = ref<Item | null>(null);
const lootOpen = ref(false); // modale « butin ramassé » en cours de run (ticket 8a43ca8c)
function setName(id?: string): string {
  return id ? (ITEM_SETS.find((s) => s.id === id)?.name ?? 'Set') : '';
}

// Animation de salle (combat / coffre / piège) jouée en overlay avant de continuer.
type StageFight = {
  name: string;
  emoji: string;
  maxPv: number;
  archetype?: string;
  log: CombatEvent[];
};
// Seuls le COMBAT (son rejeu) et la DESCENTE ouvrent un overlay ; coffres, pièges et salles
// secrètes se jouent sur la carte (`roomPulse`) — une modale par salle, en auto ×20, c'était
// une modale toutes les quelques dizaines de millisecondes.
const roomFx = ref<{ kind: 'combat' | 'descend'; win?: boolean } | null>(null);
// Effet posé sur la salle qu'on vient d'ouvrir : anneau + texte qui monte.
const roomPulse = ref<{
  id: number;
  kind: 'chest' | 'trap' | 'vault';
  text: string;
  n: number;
} | null>(null);
let pulseSeq = 0;
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
// Durée de l'effet, raccourcie avec la vitesse de l'auto (jamais sous 250 ms : on doit le voir).
const pulseMs = computed(() => Math.max(250, Math.round(1100 / autoSpeed.value)));
function pulse(id: number, kind: 'chest' | 'trap' | 'vault', text: string) {
  roomPulse.value = { id, kind, text, n: ++pulseSeq };
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => (roomPulse.value = null), pulseMs.value);
}
// Le 🎒 bondit quand un objet y entre.
const lootBump = ref(false);
function bumpLoot() {
  lootBump.value = false;
  requestAnimationFrame(() => (lootBump.value = true));
}
const stageFights = ref<StageFight[]>([]);
const stageStartPv = ref(0); // PV du joueur AU DÉBUT du combat animé (attrition)
const relicGauge = ref(0); // 🔮 jauge de relique, reportée d'un combat à l'autre du run
// 🔰 barrière de départ restante : UNE par descente (absente = pleine, au premier combat)
const barrierLeft = ref<number | undefined>(undefined);
const fxDone = ref(false); // combat : résultat révélé à la fin de l'animation
const combatSkipped = ref(false); // AUTO rapide : animation de combat sautée (résultat direct)
const playerProfile = computed(() => character.value.profile);
const playerEquipped = computed(() => char.row?.equipped ?? {});

// Écran de chargement thématique bref à l'entrée du Labyrinthe (immersion).
const booting = ref(true);
onMounted(async () => {
  setTimeout(() => (booting.value = false), 750);
  window.addEventListener('beforeunload', beforeUnload);
  try {
    await char.fetchMine();
  } catch {
    /* pas bloquant */
  }
  // Perso chargé (équipement/talents inclus) → cale le pool sur les vrais PV max,
  // tant que le run n'a pas commencé (uniquement la salle de départ visitée).
  if (run.value.visited.length <= 1)
    run.value = startRun(floorsWanted.value, dungeon.value[0]!, Math.max(60, fighter.value.pv));
  relicGauge.value = 0;
  barrierLeft.value = undefined;
});

const floor = computed(() => dungeon.value[run.value.floor]!);
const cols = computed(() => floor.value.cols);
const rows = computed(() => floor.value.rows);
// ANTI-SPOIL : la barre de PV au-dessus de la carte suit `displayedPv`, qui LAGGE `run.pv`
// pendant l'animation d'un combat (sinon la barre affiche le résultat avant la fin de
// l'anim → spoil). Elle se resynchronise à la fin du combat (onFxDone). Hors combat, elle
// suit `run.pv` immédiatement (régén, pièges, descente).
const displayedPv = ref(run.value.pv);
watch(
  () => run.value.pv,
  (v) => {
    if (roomFx.value?.kind === 'combat' && !fxDone.value) return; // combat en cours → on attend
    displayedPv.value = v;
  },
);
function onFxDone() {
  fxDone.value = true;
  displayedPv.value = run.value.pv; // combat fini → la barre de la carte peut se mettre à jour
}
const pvPct = computed(() => Math.round((displayedPv.value / run.value.maxPv) * 100));
const currentRoom = computed(() => floor.value.rooms[run.value.current]!);
const onStairs = computed(
  () => currentRoom.value.type === 'stairs' && run.value.status === 'exploring',
);
const onBoss = computed(
  () => currentRoom.value.type === 'boss' && run.value.status === 'exploring',
);
// Retraite possible depuis le départ ou un escalier (banque le butin, pas de trésor final).
const canRetreat = computed(
  () =>
    run.value.status === 'exploring' &&
    (currentRoom.value.type === 'start' || currentRoom.value.type === 'stairs'),
);

const cx = (r: Room) => r.x * CELL + CELL / 2;
const cy = (r: Room) => r.y * CELL + CELL / 2;

// Couloirs visibles (au moins une extrémité visible ; dédup via id croissant).
const corridors = computed(() => {
  const out: { k: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const r of floor.value.rooms) {
    if (!isVisible(floor.value, run.value, r.id)) continue;
    for (const nb of r.links) {
      if (nb <= r.id) continue;
      if (!isVisible(floor.value, run.value, nb)) continue;
      const b = floor.value.rooms[nb]!;
      out.push({ k: `${r.id}-${nb}`, x1: cx(r), y1: cy(r), x2: cx(b), y2: cy(b) });
    }
  }
  return out;
});

function roomClass(id: number): string {
  if (!isVisible(floor.value, run.value, id)) return 'hidden';
  const isVault = floor.value.rooms[id]?.type === 'vault';
  if (id === run.value.current) return isVault ? 'current vault' : 'current';
  if (run.value.visited.includes(id)) return isVault ? 'visited vault' : 'visited';
  const clickable = canMove(run.value, floor.value, id);
  return clickable ? 'frontier open' : 'frontier';
}
function roomGlyph(r: Room): string {
  if (!isVisible(floor.value, run.value, r.id)) return '';
  if (!run.value.visited.includes(r.id)) return '?'; // frontière : type inconnu
  if (r.type === 'chest') return ''; // coffre = image tintée (ChestIcon), pas d'emoji
  if (r.type === 'trap') return trapKindOf(r.id).emoji; // piège découvert = son icône variée
  return ROOM_EMOJI[r.type];
}
// Coffre déjà ouvert (visité) → on affiche l'image de coffre teintée à son grade.
function isVisitedChest(r: Room): boolean {
  return r.type === 'chest' && run.value.visited.includes(r.id);
}
function chestColorOf(id: number): string {
  return chestGradeOf(id).color;
}

// Monstre de salle scalé au niveau du perso + profondeur de l'étage. Volontairement
// plus faible qu'un boss de palier (une salle = une bouchée) : c'est l'ACCUMULATION
// sur l'étage, PV reportés, qui use → l'Endurance compte. (équilibrage provisoire bêta)
// Monstres calibrés RELATIVEMENT au joueur (le sport rend le perso très fort en
// absolu → une échelle fixe le laissait one-shot tout sans jamais perdre de PV).
// pv = k × dégâts/tour du joueur (⇒ le monstre SURVIT et riposte) ; dégâts = part
// des PV max du joueur (⇒ attrition réelle). Deeper = plus dur (push-your-luck).
// Index de rang du palier courant (0=G … 9=SSS) → thème du roster de monstres.
const labyTierIndex = computed(() => tierIndexOfLaby(selectedLaby.value ?? LABYRINTHS[0]!));
// Décor du palier (lot 5) : sa palette, et la lumière que chaque salle vue répand.
const theme = computed(() => labyTheme(selectedLaby.value));
const visibleRooms = computed(() =>
  floor.value.rooms.filter((r) => isVisible(floor.value, run.value, r.id)),
);
const lights = computed(() =>
  visibleRooms.value.map((r) => ({
    id: r.id,
    x: cx(r),
    y: cy(r),
    r: roomLightRadius(CELL, run.value.visited.includes(r.id)),
  })),
);
// Identifiants SVG propres à la page (le cockpit peut monter l'écran à côté d'autres cartes).
const PAT_ID = 'laby-tiles';
const DARK_ID = 'laby-dark';
const FOG_ID = 'laby-fog';

// ── Affichage (barre d'état, héros sur la carte, tuiles de l'accueil) ──
const pips = computed(() => floorPips(run.value.floor, run.value.floors));
const relicPower = computed(() => relicPowerOf(char.row?.equipped?.relic?.power));
const barrierText = computed(() => barrierLabel(fighter.value.startShield ?? 0, barrierLeft.value));
// Position du héros en % de la carte (le viewBox a une marge MAP_PAD de chaque côté).
const heroPos = computed(() => {
  const r = currentRoom.value;
  const w = cols.value * CELL + 2 * MAP_PAD;
  const h = rows.value * CELL + 2 * MAP_PAD;
  return {
    left: ((cx(r) + MAP_PAD) / w) * 100,
    top: ((cy(r) + MAP_PAD) / h) * 100,
    width: ((SIZE * 0.95) / w) * 100,
  };
});
// Le pas du héros suit celui du déplacement automatique (et la vitesse de l'auto).
const walkMs = computed(() => Math.round(WALK_STEP_MS / autoSpeed.value));
// Illustration du gardien d'un palier, ou null (repli sur son emoji). Un fichier qui ne
// charge pas retombe aussi sur l'emoji.
const artFailed = ref(new Set<string>());
function guardianArt(l: Labyrinth): string | null {
  const g = labyGuardian(l);
  return artFailed.value.has(g.name) ? null : monsterArt(g.name);
}

// Niveau de calibration ABSOLU du palier = son niveau conseillé (comme les donjons).
// → la difficulté ne dépend PLUS de ta puissance : un palier profond est objectivement
// dur, un bas-niveau sur-équipé n'y survit pas (ticket anti-runaway, difficulté absolue).
const palierLevel = computed(() => selectedLaby.value?.recoLevel ?? heroLevel.value);

// Créature d'une salle = base ABSOLUE du palier (attente d'équipement et renfort mesuré
// compris) modulée par son archétype → un FEEL différent à chaque combat. Source unique
// `labyrinthFoe`, que l'estimation du % de réussite joue aussi.
const makeMonster = (isBoss: boolean, depth: number, foe: LabyFoe): Combatant =>
  labyrinthFoe(palierLevel.value, isBoss, depth, foe);
// Seed déterministe par salle (rejouable pour une même carte).
function roomSeed(id: number): number {
  return (seed.value * 131 + run.value.floor * 7919 + id * 17) >>> 0 || 1;
}
const depthOf = () => labyDepth(run.value.floor, run.value.floors);

function fightRoom(id: number, isBoss: boolean) {
  // Créature de la salle (roster du palier + archétype), seedée → rejouable.
  const foe = pickLabyFoe(mulberry32((roomSeed(id) ^ 0x2f6b) >>> 0), labyTierIndex.value, isBoss);
  const monster = makeMonster(isBoss, depthOf(), foe);
  const goldWin = Math.round((6 + 3 * heroLevel.value) * (isBoss ? 4 : 1));
  stageStartPv.value = run.value.pv; // PV AVANT le combat (barre part de là, pas du max)
  // Combattant du labyrinthe : max PLAFONNÉ au pool courant (le vol de vie ne peut
  // pas dépasser les PV reportés → pas de « remontée au max » entre les combats) et
  // vol de vie atténué → l'attrition compte vraiment.
  const combatFighter: Combatant = labyrinthFighter(fighter.value, run.value.pv);
  const res = simulateCombat(combatFighter, monster, {
    seed: roomSeed(id),
    goldOnWin: goldWin,
    startPlayerPv: run.value.pv,
    gauge: relicGauge.value,
    ...(barrierLeft.value !== undefined ? { shield: barrierLeft.value } : {}),
  });
  relicGauge.value = res.gauge ?? relicGauge.value;
  barrierLeft.value = res.shield ?? barrierLeft.value;
  const finalPv = res.log.length ? res.log[res.log.length - 1]!.playerPv : run.value.pv;
  run.value = { ...run.value, pv: finalPv, status: finalPv <= 0 ? 'dead' : run.value.status };
  if (res.win) {
    gold.value += res.gold;
    const dd = Math.round(2 + heroLevel.value * 0.5) * (isBoss ? 3 : 1);
    dust.value += dd;
    lastEvent.value = {
      kind: 'good',
      text: `${foe.emoji} Vaincu ! +${res.gold} 🪙 · ${finalPv} PV`,
    };
  } else {
    lastEvent.value = { kind: 'bad', text: `💀 Battu par ${monster.name}…` };
  }
  // Rejoue le combat animé (log seedé exact) en overlay, avec l'identité de la créature
  // (emoji + archétype → aura + tag « féroce/brutal/colosse/insaisissable » via CombatStage).
  stageFights.value = [
    {
      name: monster.name,
      emoji: foe.emoji,
      maxPv: monster.pv,
      archetype: foe.arch.arch,
      log: res.log,
    },
  ];
  // En AUTO à vitesse élevée (≥ ×3), on SAUTE l'animation de combat (le vrai goulot au ×20 :
  // le pacing entre salles était accéléré mais pas le rejeu) → résultat direct, on enchaîne.
  const skip = autoMode.value && autoSpeed.value >= 3;
  combatSkipped.value = skip;
  fxDone.value = skip; // skip → résultat déjà « révélé » → autoTick ferme tout de suite
  roomFx.value = { kind: 'combat', win: res.win };
}
// Grade d'un coffre (bronze→platine) : seed SÉPARÉ (n'interfère pas avec le tirage du
// butin), dérivé de la frise glissante (rollChestGrade) → se décale avec le niveau du
// palier. Déterministe → identique entre l'ouverture et l'affichage sur la carte.
function chestGradeOf(id: number): ChestGrade {
  return rollChestGrade(
    mulberry32((roomSeed(id) ^ 0xc0ffee) >>> 0),
    runDropLevel(),
    runLuck(),
    heroLevel.value,
  );
}
function openChest(id: number) {
  const grade = chestGradeOf(id);
  const rng = mulberry32(roomSeed(id));
  // Le GRADE du coffre pilote le contenu : luck (rareté), niveau, ressources, objet garanti.
  const luck = Math.min(
    1,
    0.35 + 0.45 * depthOf() + labyLuck.value + grade.luckBonus + mfLuck.value,
  );
  // Niveau du butin = niveau du PALIER (runDropLevel) + bonus de grade du coffre — PAS le
  // niveau du joueur (bug : les coffres des premiers paliers droppaient au niv. joueur, ex.
  // ilvl 22/24 au niv.20). `playerLevel` plafonne ensuite via rollDrop (min(contenu, joueur)).
  const level = Math.max(1, runDropLevel() + grade.levelBonus);
  const tries = grade.guaranteed ? 8 : 4;
  let drop: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < tries && !drop; k++)
    drop = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level,
      luck,
      spread: 1,
      playerLevel: heroLevel.value,
      relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
    });
  const item = drop ? { ...drop, id: crypto.randomUUID() } : null;
  dust.value += 3 + grade.dustBonus;
  if (item) loot.value.push(item);
  const bits = [item?.name].filter(Boolean).join(' + ');
  lastEvent.value = {
    kind: 'good',
    text: `${grade.emoji} Coffre ${grade.label}${bits ? ' — ' + bits : ' ouvert'} !`,
    ...(item ? { item } : {}),
  };
  if (item) bumpLoot();
  pulse(id, 'chest', item ? gradeLabel(item) : 'vide');
}
// Piège de la salle (seed séparé) : type varié (pointes/gaz/flammes = dégâts modulés ;
// trappe = vol d'or ; toile = vol de poussière). Déterministe → même icône à l'affichage.
function trapKindOf(id: number): LabyTrap {
  return pickLabyTrap(mulberry32((roomSeed(id) ^ 0x7a17) >>> 0));
}
function springTrap(id: number) {
  const trap = trapKindOf(id);
  if (trap.kind === 'dmg') {
    const dmg = labyrinthTrapDamage(fighter.value.pv, trap.mult);
    run.value = applyDamage(run.value, dmg); // mort gérée à la fermeture (closeFx)
    lastEvent.value = { kind: 'bad', text: `${trap.emoji} ${trap.label} ! −${dmg} PV` };
    pulse(id, 'trap', `−${dmg} PV`);
    // Piège fatal : on laisse l'effet se voir, puis la fin de run.
    if (run.value.status === 'dead') setTimeout(() => void endRun('dead'), pulseMs.value);
  } else {
    const isGold = trap.kind === 'gold';
    const pool = isGold ? gold : dust;
    const want = isGold
      ? Math.round((10 + heroLevel.value * 4) * (1 + depthOf()))
      : Math.round((4 + heroLevel.value) * (1 + depthOf()));
    const loss = Math.min(pool.value, want);
    pool.value -= loss;
    lastEvent.value = {
      kind: 'bad',
      text:
        loss && isGold
          ? `${trap.emoji} ${trap.label} ! −${loss} 🪙`
          : loss
            ? `${trap.emoji} ${trap.label} ! butin dérobé`
            : `${trap.emoji} ${trap.label} — rien à voler !`,
    };
    pulse(id, 'trap', loss && isGold ? `−${loss} 🪙` : trap.label);
  }
}
// SALLE SECRÈTE : gros butin GARANTI — un objet de HAUT rang (plusieurs tirages, on garde
// le meilleur, niveau+2 et forte luck) + lot d'or/poussière/fragments. Comme les autres
// gains du run, ils passent par les accumulateurs (× fraction si on meurt ensuite).
function openVault(id: number) {
  const rng = mulberry32((roomSeed(id) ^ 0x5a17) >>> 0);
  let best: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 5; k++) {
    const d = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: runDropLevel() + 2,
      luck: Math.min(1, runLuck() + 0.35),
      playerLevel: heroLevel.value,
      relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
    });
    if (d && (!best || RARITY_RANK[d.rarity] > RARITY_RANK[best.rarity])) best = d;
  }
  const item = best ? { ...best, id: crypto.randomUUID() } : null;
  const gGold = 30 + Math.round(heroLevel.value * 6);
  const gDust = 20 + Math.round(heroLevel.value * 0.8);
  gold.value += gGold;
  dust.value += gDust;
  if (item) loot.value.push(item);
  lastEvent.value = {
    kind: 'good',
    text: `💎 Salle secrète ! ${item ? item.name + ' · ' : ''}+${gGold}🪙`,
  };
  gameFx.celebrate({
    kind: 'drop',
    emoji: '💎',
    title: 'Salle secrète !',
    subtitle: item ? `${item.name} · ${gradeLabel(item)}` : 'Coffre au trésor',
    rarity: item ? fxRarity(item.rarity) : 'legendary',
  });
  if (item) {
    lastEvent.value = { ...lastEvent.value, item };
    bumpLoot();
  }
  pulse(id, 'vault', '💎');
}
// Ferme l'overlay de salle ; si le combat a été fatal, on bascule sur la fin de run.
function closeFx() {
  roomFx.value = null;
  if (run.value.status === 'dead') void endRun('dead');
}

// ── Clic pour marcher : cliquer une salle atteignable via la zone explorée y déplace le
// héros de case en case (retour arrière sans re-cliquer chaque salle). ──
const WALK_STEP_MS = 190; // plus vif que l'auto-run (on retraverse du connu)
const walking = ref(false);
let walkTimer: ReturnType<typeof setTimeout> | undefined;
function stopWalk() {
  if (walkTimer) clearTimeout(walkTimer);
  walkTimer = undefined;
  walking.value = false;
}
function walkTo(path: number[]) {
  if (!path.length || walking.value) return;
  walking.value = true;
  let i = 0;
  const step = () => {
    if (i >= path.length || run.value.status !== 'exploring') {
      stopWalk();
      return;
    }
    const id = path[i]!;
    const last = i === path.length - 1;
    // Dernière case NEUVE (frontière) → on y déclenche son événement (combat/coffre/…).
    if (last && !run.value.visited.includes(id)) {
      stopWalk();
      onRoomClick(id);
      return;
    }
    run.value = enterRoom(run.value, floor.value, id);
    lastEvent.value = null;
    i++;
    walkTimer = setTimeout(step, Math.round(WALK_STEP_MS / autoSpeed.value)); // ÷ vitesse
  };
  step();
}

function onRoomClick(id: number) {
  if (walking.value) return; // déplacement auto en cours → on ignore les clics
  // Salle NON adjacente : si elle est atteignable via la zone déjà explorée, on y
  // marche automatiquement de case en case (retour arrière sans re-cliquer chaque salle).
  if (!canMove(run.value, floor.value, id)) {
    const path = pathTo(run.value, floor.value, id);
    if (path && path.length) walkTo(path);
    return;
  }
  const wasNew = !run.value.visited.includes(id);
  const target = floor.value.rooms[id]!;
  run.value = enterRoom(run.value, floor.value, id);
  if (!wasNew) {
    lastEvent.value = null;
    return;
  }
  switch (target.type) {
    case 'trap':
      springTrap(id);
      break;
    case 'monster':
      fightRoom(id, false);
      break;
    case 'boss':
      fightRoom(id, true);
      break;
    case 'chest':
      openChest(id);
      regen(LABY_RUN.regen.chest); // le repos d'un coffre soigne un peu
      break;
    case 'vault':
      openVault(id);
      regen(LABY_RUN.regen.vault); // planque sûre → on souffle un peu
      break;
    case 'stairs':
      lastEvent.value = { kind: 'good', text: '🔽 Escalier — descends à l’étage suivant' };
      break;
    default:
      regen(LABY_RUN.regen.empty); // salle vide = on souffle → petite récupération
      lastEvent.value = { kind: 'neutral', text: '· Salle vide — tu récupères un peu' };
  }
}
// Régénère `pct` des PV MAX (salles sûres) → l'attrition reste survivable malgré
// des monstres plus coriaces ; pousser en profondeur (moins de salles sûres) reste risqué.
function regen(pct: number) {
  const max = run.value.maxPv;
  const pv = Math.min(max, run.value.pv + Math.round(max * labyrinthRest(fighter.value, pct)));
  run.value = { ...run.value, pv };
}

function goDown() {
  const next = dungeon.value[run.value.floor + 1] ?? null;
  run.value = descend(run.value, next);
  lastEvent.value = null;
  // Animation de descente d'étage (l'étage suivant est déjà chargé derrière).
  roomFx.value = { kind: 'descend' };
  setTimeout(() => {
    if (roomFx.value?.kind === 'descend') closeFx();
  }, 1200);
}
function finish() {
  void endRun('cleared');
}
function retreat() {
  void endRun('retreat');
}

// Niveau de butin/familier du run = celui du PALIER choisi (croît avec la profondeur),
// borné pour ne pas déborder si un palier profond est atteint sous-nivelé.
function runDropLevel(): number {
  return selectedLaby.value?.dropLevel ?? heroLevel.value + 1;
}
function runLuck(): number {
  return Math.min(1, (selectedLaby.value?.luck ?? 0.5) + labyLuck.value + mfLuck.value);
}
// Trésor final garanti à la victoire (haute chance + haute rareté). ~15 % de
// chance que ce soit une PIÈCE DE SET (2e voie d'accès aux sets, cf. ticket) —
// les boss restent la source garantie/ciblée.
// Trésor final = la « belle récompense » du clear (le seul intérêt de pousser
// jusqu'au bout malgré l'attrition). Objet de HAUT niveau (heroLevel+2), rareté
// GARANTIE épique minimum, ~25 % de chance d'être une pièce de set convoitée.
function rollTreasure(): Item | null {
  const rng = mulberry32((seed.value * 977 + 4242) >>> 0 || 1);
  const lvl = runDropLevel() + 1; // niveau du PALIER (croît avec la profondeur)
  const luck = runLuck();
  if (rng() < 0.25 && ITEM_SETS.length) {
    const set = ITEM_SETS[Math.floor(rng() * ITEM_SETS.length)]!;
    const piece = rollSetPiece(rng, {
      setId: set.id,
      level: lvl,
      luck,
      playerLevel: heroLevel.value,
    });
    return { ...piece, id: crypto.randomUUID() };
  }
  // Garde le MEILLEUR tier (rang+qualité) sur plusieurs tirages → « belle récompense »
  // RELATIVE à la profondeur du PALIER (plus le palier est profond, plus le rang monte).
  let best: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 8; k++) {
    const cand = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: lvl,
      luck,
      spread: 0,
      playerLevel: heroLevel.value,
      relicPower: char.row?.equipped?.relic?.power, // 🔮 affinité 1/3
    });
    if (cand && (!best || tierIndexOf(cand) > tierIndexOf(best))) best = cand;
  }
  return best ? { ...best, id: crypto.randomUUID() } : null;
}

// (Ré)initialise un run sur la carte courante avec les VRAIS PV du perso.
function freshRun() {
  dungeon.value = generateDungeon(seed.value, floorsWanted.value);
  run.value = startRun(floorsWanted.value, dungeon.value[0]!, fighter.value.pv || 140);
  relicGauge.value = 0;
  barrierLeft.value = undefined;
  gold.value = 0;
  dust.value = 0;
  loot.value = [];
  lastEvent.value = null;
  over.value = false;
}

// Lance un PALIER (consomme ses clés) : carte fraîche du palier, PV pleins.
async function start(tier?: Labyrinth) {
  const uid = auth.user?.id;
  if (!uid) return;
  if (!labyUnlocked.value) {
    $q.notify({
      type: 'warning',
      message: 'Construis la 🚪 Porte du Labyrinthe (carte d’expédition) pour le débloquer.',
    });
    return;
  }
  if (!labyUnlocked.value || !progress.ready.value || !char.row) return;
  // ⚠️ L'infirmerie : cette page permet de rejouer sans repasser par l'Aventure (et son
  // `expeBlocked`), donc elle vérifie elle-même. AVANT les clés, qu'on ne perde rien.
  const healIn = woundRemainingMs(char.row.base, Date.now());
  if (healIn > 0) {
    $q.notify({
      type: 'warning',
      message: `🤕 Ton héros est à l’infirmerie — de retour dans ${Math.ceil(healIn / 60000)} min.`,
    });
    return;
  }
  // Palier : celui passé (clic sur une carte) ou le courant (rejouer depuis la modale).
  const laby = tier ?? selectedLaby.value ?? LABYRINTHS[0]!;
  if (!labyrinthUnlockedTier(laby.id, clearedSet.value)) return;
  const cost = labyKeyCost(laby.id);
  const ok = await char.spendKey(uid, cost, laby.id);
  if (!ok) {
    $q.notify({
      type: 'warning',
      message: `Ce palier demande ${cost} clé${cost > 1 ? 's' : ''} 🗝️ (Porte du Labyrinthe, archives, boss).`,
    });
    return;
  }
  selectedLaby.value = laby;
  seed.value = Math.floor(Math.random() * 1_000_000) + 1;
  floorsWanted.value = laby.floors;
  credited.value = false;
  freshRun();
  phase.value = 'running';
}

// ── Auto-run (paliers nettoyés) ──
function stopAuto() {
  autoMode.value = false;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = undefined;
}
// Reprend l'AUTO sur le run EN COURS (après « reprendre la main ») → re-enclenche la boucle
// (sans fermer/relancer le run). Dispo si le palier est déjà nettoyé (auto-éligible).
function resumeAuto() {
  if (over.value || phase.value !== 'running') return;
  if (!labyrinthCleared(selectedLaby.value?.id ?? '', clearedSet.value)) return;
  autoMode.value = true;
  scheduleAuto(200);
}
function scheduleAuto(ms = AUTO_STEP_MS) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(autoTick, Math.round(ms / autoSpeed.value)); // ÷ vitesse (x2 = 2× plus rapide)
}
// Seuil de PV bas : en dessous, si une SORTIE sûre est trouvée, l'auto sort (retraite)
// plutôt que de risquer la mort (qui fait perdre les objets).
const AUTO_SAFE_PV = 0.28;

// Le boss du dernier étage est-il GAGNABLE au PV courant ? (simulation seedée, identique à
// celle de fightRoom → verdict exact). En auto, on ne fuit PAS un boss gagnable : on tente
// le clear (familier + déblocage du palier suivant), au lieu de retraiter bêtement à bas PV.
function bossWinnableNow(): boolean {
  const bossRoom = floor.value.rooms.find((r) => r.type === 'boss');
  if (!bossRoom) return false; // étage intermédiaire (pas de boss) → non concerné
  const foe = pickLabyFoe(
    mulberry32((roomSeed(bossRoom.id) ^ 0x2f6b) >>> 0),
    labyTierIndex.value,
    true,
  );
  const monster = makeMonster(true, depthOf(), foe);
  const combatFighter: Combatant = labyrinthFighter(fighter.value, run.value.pv);
  return simulateCombat(combatFighter, monster, {
    seed: roomSeed(bossRoom.id),
    goldOnWin: 0,
    startPlayerPv: run.value.pv,
    gauge: relicGauge.value,
    ...(barrierLeft.value !== undefined ? { shield: barrierLeft.value } : {}),
  }).win;
}

// Premier PAS (salle adjacente) vers la salle la PLUS PROCHE qui satisfait `pred`, en ne
// TRAVERSANT que des salles déjà visitées (le backtracking ne redéclenche rien). Renvoie
// l'id du 1ᵉʳ hop, ou null si aucune cible atteignable. BFS sur le graphe des couloirs.
function hopToNearest(pred: (r: (typeof floor.value.rooms)[number]) => boolean): number | null {
  const start = run.value.current;
  const rooms = floor.value.rooms;
  const visited = new Set(run.value.visited);
  const prev = new Map<number, number>([[start, -1]]);
  const q: number[] = [start];
  let goal = -1;
  while (q.length) {
    const id = q.shift()!;
    for (const nb of rooms[id]!.links) {
      if (prev.has(nb)) continue;
      prev.set(nb, id);
      if (pred(rooms[nb]!)) {
        goal = nb;
        q.length = 0;
        break;
      }
      if (visited.has(nb)) q.push(nb); // on ne marche que sur du connu
    }
  }
  if (goal < 0) return null;
  let cur = goal; // remonte jusqu'au 1ᵉʳ hop depuis `start`
  while (prev.get(cur) !== start) cur = prev.get(cur)!;
  return cur;
}
const isUnvisited = (r: { id: number }) => !run.value.visited.includes(r.id);
const isSafeExit = (r: { type: string; id: number }) =>
  (r.type === 'start' || r.type === 'stairs') && run.value.visited.includes(r.id);
const hasSafeExit = computed(() => floor.value.rooms.some((r) => isSafeExit(r)));
const lowHp = computed(() => run.value.pv / Math.max(1, run.value.maxPv) < AUTO_SAFE_PV);

// Un « tour » d'auto : ferme la modale en cours si prête, sinon agit.
function autoTick() {
  if (!autoMode.value) return;
  if (over.value || phase.value !== 'running') return stopAuto();
  if (roomFx.value) {
    const k = roomFx.value.kind;
    if (k === 'combat' && !fxDone.value) return scheduleAuto(300); // laisse jouer l'animation
    if (k === 'descend') return scheduleAuto(300); // s'auto-ferme déjà
    closeFx(); // combat fini / coffre / piège → on ferme et on enchaîne
    return scheduleAuto();
  }
  if (over.value) return stopAuto();

  // NETTOYAGE COMPLET : on visite TOUTES les salles avant de sortir. On garde
  // escalier/boss pour la fin (sinon on descendrait/affronterait trop tôt).
  const exploreHop = hopToNearest(
    (r) => isUnvisited(r) && r.type !== 'stairs' && r.type !== 'boss',
  );
  const onlyBossLeft = exploreHop == null; // exploration finie → ne reste que l'escalier/boss

  // SÉCURITÉ : PV bas ET une sortie sûre (départ/escalier visité) existe → on SORT en gardant
  // le butin plutôt que de risquer la mort. EXCEPTION : s'il ne reste QUE le boss et qu'il est
  // GAGNABLE au PV courant, on ne fuit pas — on tente le clear (familier + déblocage du palier
  // suivant), sinon l'auto retraitait bêtement à bas PV et ne finissait jamais (tickets
  // c7187901 / 6294811a).
  if (lowHp.value && hasSafeExit.value && !(onlyBossLeft && bossWinnableNow())) {
    if (canRetreat.value) return void retreat(); // déjà sur un point de sortie
    const hop = hopToNearest(isSafeExit);
    if (hop != null) {
      onRoomClick(hop);
      return scheduleAuto(Math.round(AUTO_STEP_MS * 0.7)); // repli un peu plus vif
    }
  }

  if (exploreHop != null) {
    onRoomClick(exploreHop);
    return scheduleAuto();
  }

  // Plus rien de « neutre » à explorer → on s'occupe de l'escalier / du boss.
  if (onBoss.value) return void finish(); // sur le boss (déjà affronté) → écran de fin
  if (onStairs.value) {
    goDown();
    return scheduleAuto(1500);
  }
  // Il reste l'escalier ou le boss non visité → on y va (dernières cases).
  const exitHop = hopToNearest((r) => isUnvisited(r) && (r.type === 'stairs' || r.type === 'boss'));
  if (exitHop != null) {
    onRoomClick(exitHop);
    return scheduleAuto();
  }
  // On a tout visité mais on n'est pas sur l'escalier (étage intermédiaire) → y retourner.
  const backToStairs = hopToNearest((r) => r.type === 'stairs' && run.value.visited.includes(r.id));
  if (backToStairs != null) {
    onRoomClick(backToStairs);
    return scheduleAuto();
  }
  retreat(); // sécurité ultime : on sort avec le butin
}
// Lance un palier NETTOYÉ en mode auto (mêmes règles/coût qu'un run manuel).
async function startAuto(tier: Labyrinth) {
  // ⚠️ Sur un palier DÉJÀ NETTOYÉ, regarder le run n'a plus d'intérêt : c'est du farm.
  // On propose donc la vitesse MAXIMALE d'emblée — elle existait, mais à six appuis du
  // départ et annoncée nulle part. Le sélecteur reste là pour ralentir à volonté.
  if (labyrinthCleared(tier.id, clearedSet.value)) setSpeed(SPEED_STEPS[SPEED_STEPS.length - 1]!);
  await start(tier);
  if (phase.value === 'running') {
    autoMode.value = true;
    scheduleAuto(800);
  }
}
onBeforeUnmount(() => {
  stopAuto();
  stopWalk();
  if (pulseTimer) clearTimeout(pulseTimer);
  window.removeEventListener('beforeunload', beforeUnload);
});

// Termine le run et CRÉDITE le butin au perso. Mort → or+poussière seuls (gear
// perdu) ; nettoyé → + trésor final ; retraite → butin gardé, pas de trésor final.
async function endRun(outcome: 'cleared' | 'dead' | 'retreat') {
  run.value = { ...run.value, status: outcome === 'dead' ? 'dead' : 'cleared' };
  if (!credited.value) {
    credited.value = true;
    if (outcome === 'cleared') {
      const t = rollTreasure();
      if (t) loot.value.push(t);
      // SIGNATURE du Labyrinthe : un FAMILIER garanti au clear, de TON rang (v0.857), borné
      // par le rang du PALIER — un palier peu profond ne donne plus ton rang une fois dépassé.
      const famRng = mulberry32((seed.value * 131 + 91) >>> 0 || 1);
      const fam = rollActivityFamiliar(famRng, {
        level: runDropLevel(),
        luck: runLuck(),
        playerLevel: heroLevel.value,
        ...(selectedLaby.value ? { rankCap: RARITY_RANK[selectedLaby.value.rank] } : {}),
      });
      loot.value.push({ ...fam, id: crypto.randomUUID() });
      gameFx.celebrate({
        kind: 'familiar',
        emoji: fam.emoji,
        title: 'Familier trouvé !',
        subtitle: `${fam.name} · rang ${rarityRank(fam.rarity).name}`,
        rarity: fxRarity(fam.rarity),
      });
    }
    // MORT : on garde une FRACTION des gains liée à la profondeur du palier non terminé
    // (profond = pardonne moins). Les objets restent perdus. Retraite/clear = tout gardé.
    const keep = outcome === 'dead' ? deathKeepFraction(selectedLaby.value?.id ?? '') : 1;
    const uid = auth.user?.id;
    if (uid)
      await char.applyExpedition(uid, {
        gold: Math.floor(gold.value * keep),
        drops: outcome === 'dead' ? [] : loot.value,
        // Dressage d'ATTAQUE : le familier a couru le Labyrinthe avec le héros.
        // Nettoyage → débloque le palier suivant (mort/retraite ne débloquent pas).
        ...(outcome === 'cleared' && selectedLaby.value
          ? { clearedDungeonId: labyClearId(selectedLaby.value.id) }
          : {}),
      });
    // Recale le compteur affiché sur le montant RÉELLEMENT crédité (fraction gardée
    // en cas de mort) → le récap ne ment pas.
    gold.value = Math.floor(gold.value * keep);
  }
  stopAuto(); // fin de run → coupe l'auto (la relance depuis la modale est manuelle)
  over.value = true;
}
// Relance directement le même palier depuis la modale de fin (au prix de ses clés).
function replay() {
  over.value = false;
  void start();
}
// Relance le même palier en AUTO depuis la modale de fin.
function replayAuto() {
  over.value = false;
  if (selectedLaby.value) void startAuto(selectedLaby.value);
}
// Ferme le rapport de fin → RETOUR AU CHOIX DES PALIERS (on reste sur la page du labyrinthe,
// le palier qu'on vient de finir est à jour). Le bouton ‹ du header sert à sortir vers l'Aventure.
function returnToLobby() {
  stopAuto();
  over.value = false;
  phase.value = 'lobby';
  selectedLaby.value = null;
}
</script>

<style scoped>
.expe {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
}
.expe.embedded {
  min-height: 0;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}
.iconbtn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 24px;
  cursor: pointer;
  width: 36px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
/* Accueil : en-tête (clés), règles repliées, grille de tuiles de paliers. */
.lobby {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 16px;
}
.lobby-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.lh-keys,
.lh-gate {
  font-size: 12.5px;
  font-weight: 700;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
}
.lh-keys {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
}
.lh-keys b {
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 15px;
}
.lobby-lock {
  margin: 0;
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
}
.lobby-rules {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 1.55;
}
.lobby-rules summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  font-weight: 700;
  color: var(--dim);
}
.lobby-rules p {
  margin: 0 0 10px;
}
.lobby-rules p.dim {
  color: var(--dim);
  font-size: 12.5px;
}
/* Une tuile par palier : 2 colonnes sur téléphone, plus au-delà. */
.laby-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.lobby-more {
  min-height: 44px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--dim);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.laby-tile {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tier) 35%, var(--line));
  background: var(--surface);
  overflow: hidden;
  min-width: 0;
}
.laby-tile.cleared {
  border-color: color-mix(in srgb, var(--d1) 55%, var(--line));
}
.laby-tile.locked {
  opacity: 0.55;
  border-color: var(--line);
}
.lt-art {
  position: relative;
  height: 96px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(
      circle at 50% 68%,
      color-mix(in srgb, var(--tier) 45%, transparent),
      transparent 70%
    ),
    linear-gradient(180deg, #0f0c09, color-mix(in srgb, var(--tier) 18%, #0f0c09));
}
.laby-tile.locked .lt-art {
  background: linear-gradient(180deg, #0f0c09, #1a1612);
}
.lt-img {
  height: 88px;
  width: auto;
  max-width: 90%;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 244, 220, 0.25));
}
.lt-art-emo {
  font-size: 44px;
  line-height: 1;
}
.lt-cost {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--text);
}
.lt-cost.short {
  color: var(--d3);
}
.lt-done {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 800;
  background: var(--d1);
  color: #10200c;
}
.lt-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px 10px;
  flex: 1;
}
.lt-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--text);
}
.lt-guard {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
.lt-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.lt-pills > span {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lt-pills .lt-pow.ok {
  color: color-mix(in srgb, #7bc86c 85%, var(--dim));
}
.lt-pills .lt-pow.mid {
  color: color-mix(in srgb, #ffb23f 85%, var(--dim));
}
.lt-pills .lt-pow.bad {
  color: color-mix(in srgb, #ff6a45 80%, var(--dim));
}
.lt-pills .lt-death {
  color: color-mix(in srgb, #ff6a45 70%, var(--dim));
}
.lt-lock {
  font-size: 11px;
  color: var(--dim);
  margin-top: auto;
}
.lt-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
.lt-go {
  min-height: 40px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border-radius: 9px;
  padding: 6px 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
.lt-go.auto {
  background: transparent;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  color: color-mix(in srgb, var(--accent) 80%, var(--text));
}
.lt-go:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.lt-go:not(:disabled):active {
  transform: scale(0.96);
}
/* Bandeau AUTO pendant un run auto. */
/* Contrôles AUTO flottants (téléportés au body) : TOUJOURS au-dessus des modales
   (q-dialog ~6000 → z-index 7000). Barre compacte en haut, centrée. */
.auto-float {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  max-width: 94vw;
}
.af-txt {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 12px;
  color: var(--accent);
}
.af-speed,
.af-stop {
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 999px;
  padding: 5px 10px;
  font-weight: 800;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.af-speed.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.af-resume {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-weight: 800;
}
/* En auto, les salles ne sont pas cliquables → curseur neutre. */
.room.auto {
  cursor: default;
}
/* Barre d'état d'une descente. */
.run-hud {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.rh-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rh-pips {
  display: flex;
  gap: 4px;
}
.rh-pip {
  width: 18px;
  height: 7px;
  border-radius: 3px;
  background: var(--line);
}
.rh-pip.done {
  background: var(--dim);
}
.rh-pip.cur {
  background: var(--accent);
}
.rh-floor {
  font-size: 12.5px;
  color: var(--dim);
}
.rh-floor b {
  color: var(--text);
  font-size: 14px;
}
.rh-pv {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pv-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-3, var(--line));
  overflow: hidden;
}
.pv-fill {
  height: 100%;
  background: var(--d1);
  border-radius: 4px;
  transition: width 0.3s;
}
.pv-fill.low {
  background: var(--d4);
}
.rh-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bag-chip {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 10px;
  font-variant-numeric: tabular-nums;
}
.bag-chip.relic {
  border-color: #8f6bff;
  color: #c6b4ff;
}
.bag-chip-btn {
  cursor: pointer;
  margin-left: auto;
}
.bag-chip-btn:not(:disabled):hover {
  border-color: var(--primary);
}
.bag-chip-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.bag-chip-btn.bump {
  animation: bag-bump 0.45s ease-out;
}
@keyframes bag-bump {
  40% {
    transform: scale(1.25);
    border-color: var(--accent);
  }
}
.map-wrap {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px;
}
.map-stage {
  position: relative;
}
.map {
  width: 100%;
  height: auto;
  display: block;
}
/* Le héros sur la carte : il glisse d'une salle à l'autre au rythme de ses pas. */
.hero-tok {
  position: absolute;
  aspect-ratio: 120 / 148;
  transform: translate(-50%, -58%);
  transition:
    left var(--walk-ms, 190ms) ease-in-out,
    top var(--walk-ms, 190ms) ease-in-out;
  pointer-events: none;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
}
.ht-glow {
  position: absolute;
  inset: 20% -30% -10%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 196, 107, 0.4), transparent 65%);
  z-index: -1;
}
.hero-tok.hurt .ht-glow {
  background: radial-gradient(circle, rgba(255, 106, 69, 0.45), transparent 65%);
}
/* Effet de la salle qu'on vient d'ouvrir. */
.pulse {
  pointer-events: none;
}
.pulse-ring {
  fill: none;
  stroke: var(--d1);
  stroke-width: 3;
  transform-box: fill-box;
  transform-origin: center;
  animation: pulse-ring var(--pulse-ms, 1100ms) ease-out forwards;
}
.pulse.trap .pulse-ring {
  stroke: var(--d4);
}
.pulse.vault .pulse-ring {
  stroke: #ffd23f;
}
.pulse-txt {
  text-anchor: middle;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  fill: var(--d1);
  paint-order: stroke;
  stroke: #0b0907;
  stroke-width: 3px;
  animation: pulse-txt var(--pulse-ms, 1100ms) ease-out forwards;
}
.pulse.trap .pulse-txt {
  fill: var(--d4);
}
.pulse.vault .pulse-txt {
  fill: #ffd23f;
}
@keyframes pulse-ring {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.6);
  }
}
@keyframes pulse-txt {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  20% {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}
.room.fx-chest,
.room.fx-trap {
  transform-box: fill-box;
  transform-origin: center;
}
.room.fx-chest {
  animation: room-pop 0.5s ease-out;
}
.room.fx-trap {
  animation: room-shake 0.45s ease-in-out;
}
.room.fx-trap .room-flash {
  animation: room-flash 0.6s ease-out;
}
@keyframes room-flash {
  from {
    fill: rgba(255, 106, 69, 0.55);
  }
  to {
    fill: transparent;
  }
}
@keyframes room-pop {
  40% {
    transform: scale(1.15);
  }
}
@keyframes room-shake {
  20% {
    transform: translateX(-4px);
  }
  40% {
    transform: translateX(4px);
  }
  60% {
    transform: translateX(-3px);
  }
  80% {
    transform: translateX(3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-tok {
    transition: none;
  }
  .room.fx-chest,
  .room.fx-trap,
  .bag-chip-btn.bump {
    animation: none;
  }
  .pulse-ring {
    animation: none;
    opacity: 0;
  }
  .pulse-txt {
    animation: none;
  }
}
/* Décor du palier : roche, couloirs creusés, salles dallées, noir hors de la lumière. */
.map-rock {
  fill: #0b0907;
}
.corr-wall {
  stroke-width: 20;
}
.corr-floor {
  stroke-width: 12;
}
.map-fog {
  fill: #050403;
  opacity: 0.92;
  pointer-events: none;
}
.room {
  cursor: default;
}
.room-hit {
  fill: transparent;
}
.room .room-emo {
  text-anchor: middle;
  dominant-baseline: central;
  font-size: 20px;
  fill: var(--text);
}
.room-edge {
  fill: none;
  stroke: transparent;
  stroke-width: 2.5;
}
.room.current .room-edge {
  stroke: var(--accent);
}
.room.vault .room-edge {
  stroke: #ffd23f;
}
.room.current.vault .room-edge {
  stroke: var(--accent);
}
.room-flash {
  fill: transparent;
}
.door {
  fill: #050403;
  stroke-width: 1.3;
  stroke-dasharray: 3 3;
}
.room .door-q {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  fill: var(--dim);
}
.room.frontier.open {
  cursor: pointer;
}
.room.frontier.open .door {
  stroke: var(--accent);
  stroke-width: 2;
  stroke-dasharray: none;
}
.room.frontier.open .door-q {
  fill: var(--accent);
}
.room.frontier.open:hover .door {
  fill: color-mix(in srgb, var(--accent) 14%, #050403);
}
/* Torches des salles connues : petites flammes qui vacillent. */
.torch {
  filter: drop-shadow(0 0 2px currentColor);
  animation: torch-flicker 0.9s ease-in-out infinite;
}
.torch.t2 {
  animation-delay: 0.45s;
}
@keyframes torch-flicker {
  0%,
  100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .torch {
    animation: none;
  }
}
.event {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
}
.event-btn {
  display: block;
  width: 100%;
  border: none;
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}
.ev-more {
  font-size: 12px;
  opacity: 0.8;
  margin-left: 4px;
}
.event.bad {
  background: color-mix(in srgb, var(--d4) 20%, transparent);
  color: var(--d4);
}
.event.good {
  background: color-mix(in srgb, var(--d1) 20%, transparent);
  color: var(--d1);
}
.event.fight {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}
.event.neutral {
  background: var(--surface-2);
  color: var(--dim);
}
.actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.retreat-btn {
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
}
.hint {
  font-size: 12.5px;
  color: var(--dim);
  text-align: center;
  line-height: 1.5;
}
/* Overlay d'animation de salle (combat / coffre / piège) */
.fx-card {
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  padding: 16px;
  width: 100%;
  max-width: 440px;
  text-align: center;
}
.fx-result {
  font-size: 18px;
  font-weight: 800;
  margin-top: 12px;
}
.fx-result.good {
  color: var(--d1);
}
.fx-result.bad {
  color: var(--d4);
}
.fx-result.neutral {
  color: var(--dim);
}
.fx-cta {
  margin-top: 14px;
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-weight: 700;
}
/* Carte détaillée de l'objet gagné (coffre) */
.fx-loot-card {
  margin: 12px auto 0;
  max-width: 300px;
  border: 2px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: var(--surface-2);
  animation: fx-pop 0.4s ease-out 0.5s both;
}
.fl-emoji {
  font-size: 34px;
}
.fl-icon {
  margin: 0 auto 6px;
}
.fl-name {
  font-size: 16px;
  font-weight: 800;
  margin-top: 2px;
}
.fl-meta {
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 2px;
}
.fl-eff {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  margin-top: 8px;
}
.fl-set {
  font-size: 11.5px;
  color: var(--accent);
  margin-top: 4px;
}
.fl-leg {
  font-size: 12px;
  font-weight: 700;
  color: #ff9e3f;
  margin-top: 6px;
  line-height: 1.35;
}
/* Comparatif avec l'équipé du même emplacement. */
.fl-cmp {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  width: 100%;
}
.fl-cmp-eq {
  font-size: 11.5px;
  color: var(--text);
}
.fl-cmp-eq.dim {
  color: var(--dim);
}
.fl-cmp-delta {
  margin-top: 4px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.fl-cmp-delta.up {
  color: var(--d1);
}
.fl-cmp-delta.down {
  color: var(--d4);
}
/* Raretés (8) : couleur portée par --rk (classes r-* globales, app.scss). */
.fx-loot-card[class*='r-'] {
  border-color: var(--rk, var(--line));
}
/* Descente d'étage */
.descend-anim {
  font-size: 76px;
  animation: descend 1s ease-in;
}
@keyframes descend {
  0% {
    transform: translateY(-40px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateY(30px);
    opacity: 0.85;
  }
}
@keyframes fx-pop {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.over-card {
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  padding: 22px;
  text-align: center;
  min-width: 260px;
}
.over-emo {
  font-size: 44px;
}
.over-title {
  font-size: 20px;
  font-weight: 700;
  margin: 6px 0;
}
.over-haul {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
}
.over-sub {
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.5;
  margin-bottom: 14px;
}
.over-keys {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 10px 0 4px;
}
/* Pas de quoi rejouer : en orange (une marge qui manque), pas en rouge d'alerte. */
.over-keys.short {
  color: var(--d3);
}
.over-loot {
  text-align: left;
  max-height: 200px;
  overflow-y: auto;
  margin: 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ol-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dim);
  font-weight: 700;
  margin-bottom: 2px;
}
.ol-hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  opacity: 0.75;
}
.ol-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  border-left-width: 3px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ol-item[class*='r-'] {
  border-left-color: var(--rk, var(--line));
}
.ol-item:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.ol-item:active {
  transform: scale(0.99);
}
.ol-chevron {
  margin-left: auto;
  font-size: 18px;
  color: var(--dim);
}
/* Modale de détail d'objet : la carte de butin, un peu plus large. */
.im-card {
  min-width: 260px;
  max-width: 92vw;
}
.ol-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ol-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.ol-meta {
  font-size: 11px;
  color: var(--dim);
}
.over-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
