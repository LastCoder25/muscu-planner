<template>
  <component :is="embedded ? 'div' : 'q-page'" class="emap" :class="{ embedded }">
    <GameLoader :show="booting" icon="🗺️" label="Chargement de la carte…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Carte des expéditions</div>
      <div class="iconbtn" />
    </header>

    <!-- UNE seule ligne pour le trajet et les filtres (demandé : voir les deux premières
         lignes de voyages en bas de l'écran). Le niveau, « En expédition » et l'or sont
         retirés : la tuile du héros, en bas, dit déjà qu'il voyage, et envoyer ne coûte
         plus d'or (v0.1069). -->
    <!-- 🧭 QUI PEUT PARTIR (demandé : voir d'un coup d'œil les effectifs qu'on peut envoyer),
         les champions détaillés par rang : c'est le rang qui décide du lieu à viser. -->
    <div class="dispo-row"><AvailabilityLine :now="now" by-rank /></div>

    <!-- 🎚️🗺️ Filtres par rang et par type (état + mémorisation : `usePoiFilters`). -->
    <MapFilterBar
      :rank-options="rankOptions"
      :hidden-ranks="hiddenRanks"
      :type-chips="typeChips"
      :type-filter="typeFilterShown"
      @toggle-rank="toggleRank"
      @cycle-type="cycleTypeChip"
      @reset="resetFilters"
    />

    <!-- Avant-poste requis pour envoyer des expéditions. Les emplacements vivent
         désormais sur l'écran « Ma base » (v0.664) → on y renvoie explicitement. -->
    <div v-if="!outpostBuilt" class="outpost-hint">
      🧭 Construis un <b>Avant-poste d’expédition</b> depuis <b>Ma base</b> pour envoyer des héros.
      Chaque niveau réduit les temps de trajet.
    </div>

    <!-- Carte -->
    <div class="map-outer">
      <div
        ref="scrollEl"
        class="map-scroll"
        :class="{ 'with-trips': trips.length }"
        @scroll="onScroll"
      >
        <svg
          :viewBox="`${V.min} ${V.min} ${V.size} ${V.size}`"
          class="map"
          :style="{ width: mapPx + 'px', height: mapPx + 'px' }"
        >
          <!-- Le SOL : mer, côte, prairie, reliefs — même langage que la Base (v0.749). -->
          <MapTerrain :terrain="terrain" :view="V" />

          <!-- 🌫️ BROUILLARD DE GUERRE (v0.1047) : l'Avant-poste révèle un disque autour de la
               ville, qui grandit à chaque niveau. Au-delà, on devine le relief sans voir
               aucun lieu. Bord fondu (dégradé radial), liseré pointillé pour lire la limite. -->
          <defs>
            <radialGradient
              id="fog-edge"
              gradientUnits="userSpaceOnUse"
              :cx="TOWN.x"
              :cy="TOWN.y"
              :r="fogR + FOG_SOFT"
            >
              <stop :offset="fogInner" stop-color="#15120e" stop-opacity="0" />
              <stop offset="1" stop-color="#15120e" stop-opacity="0.9" />
            </radialGradient>
          </defs>
          <rect
            :x="V.min"
            :y="V.min"
            :width="V.size"
            :height="V.size"
            fill="url(#fog-edge)"
            class="fog"
          />
          <circle
            :cx="TOWN.x"
            :cy="TOWN.y"
            :r="fogR"
            class="fog-rim"
            :class="{ lifting: fogPlan }"
          />
          <!-- ⏱️ Un cercle par heure de trajet aller du héros (v0.1238). -->
          <g class="hour-rings">
            <template v-for="ring in hourRings" :key="ring.hours">
              <circle :cx="TOWN.x" :cy="TOWN.y" :r="ring.r" class="hour-ring" />
              <text :x="TOWN.x" :y="TOWN.y - ring.r - 0.8" class="hour-lab">
                {{ ring.hours }} h
              </text>
            </template>
          </g>

          <!-- Cadre décoratif + boussole (visibles carte dézoomée) -->
          <rect
            :x="V.min + 1.5"
            :y="V.min + 1.5"
            :width="V.size - 3"
            :height="V.size - 3"
            rx="2"
            class="map-frame"
          />
          <rect
            :x="V.min + 3.5"
            :y="V.min + 3.5"
            :width="V.size - 7"
            :height="V.size - 7"
            rx="1"
            class="map-frame thin"
          />
          <g class="compass" :transform="`translate(${V.min + V.size - 100} ${V.min})`">
            <circle cx="90" cy="10" r="5.5" class="comp-bg" />
            <path d="M 90 5 L 91.4 10 L 90 8.7 L 88.6 10 Z" class="comp-needle" />
            <text x="90" y="4" class="comp-n">N</text>
          </g>

          <!-- Trajet du héros (aller/retour, noir=parcouru, bleu=restant) -->
          <template v-if="active && hero">
            <line
              :x1="active.poi.x"
              :y1="active.poi.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="hero.phase === 'return' ? 'done' : 'todo'"
            />
            <line
              :x1="TOWN.x"
              :y1="TOWN.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="hero.phase === 'return' ? 'todo' : 'done'"
            />
            <!-- Chevrons de direction : s'allument un à un du héros vers la cible
               (sens du déplacement), orientés dans la direction, en boucle. -->
            <path
              v-for="a in travelArrows"
              :key="'arr' + a.i"
              class="dir-arrow"
              d="M -1 -1.5 L 1.4 0 L -1 1.5 Z"
              :transform="`translate(${a.x} ${a.y}) rotate(${a.angle})`"
              :style="{ animationDelay: a.delay + 's' }"
            />
          </template>

          <!-- Trajets des CONVOIS et des GROUPES : même tracé aller/retour que le héros, en
             violet et en pointillés — la couleur seule ne suffit pas à distinguer deux routes.
             ⚠️ Un groupe (⚔️) a son PROPRE motif (tiret-point) : même violet qu'un convoi, sans
             lui les deux routes ne se distinguaient que par un glyphe de 3 unités. -->
          <template v-for="v in travelersOnMap" :key="'vt' + v.id">
            <line
              :x1="v.poi.x"
              :y1="v.poi.y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="[v.at.phase === 'return' ? 'done' : 'todo', v.kind]"
            />
            <line
              :x1="v.origin?.x ?? TOWN.x"
              :y1="v.origin?.y ?? TOWN.y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="[v.at.phase === 'return' ? 'todo' : 'done', v.kind]"
            />
          </template>

          <!-- 🕳️ L'AURÉOLE D'UNE EMBUSCADE — les monstres restés autour d'une faille qui a
             DÉBORDÉ (v0.1009 ; une faille ouverte ne harcèle plus rien). Lisible SANS rien
             sélectionner : le joueur voit un disque, et les destinations dedans.
             ⚠️ Dessinée AVANT les POI (donc dessous) et en `pointer-events: none` : elle
             ne doit ni recouvrir un glyphe ni voler son clic. -->
          <circle
            v-for="r in ambushHalos"
            :key="'halo-' + r.id"
            :cx="r.x"
            :cy="r.y"
            :r="r.radius"
            class="rift-halo"
          />

          <!-- 🔴 Le lieu du voyage qu'on a touché sous la carte : un halo DERRIÈRE lui, pour voir
               duquel on parle. Posé aux coordonnées que porte le voyage — le lieu d'un convoi
               est retiré de la carte au départ, il doit se retrouver quand même. -->
          <circle v-if="focusPoi" :cx="focusPoi.x" :cy="focusPoi.y" r="8" class="trip-focus-halo" />

          <!-- 🗺️ Les lieux (à prendre, cible du héros, cibles des équipes) : un composant à part
               pour ne pas se re-diffuser à chaque seconde (cf. `MapPoiLayer`). -->
          <MapPoiLayer
            :pois="shownPois"
            :selected-id="selected?.id ?? null"
            :dimmed-key="dimmedKey"
            :veiled-key="veiledKey"
            :imminent-key="imminentKey"
            :target="active?.poi ?? null"
            :travel-targets="travelTargets"
            @select="selectPoi"
          />

          <!-- Héros -->
          <g v-for="v in travelersOnMap" :key="'vm' + v.id">
            <circle :cx="v.at.x" :cy="v.at.y" r="3" class="van-mark" :class="v.kind" />
            <text :x="v.at.x" :y="v.at.y + 1.1" class="van-emo">{{ v.emo }}</text>
          </g>

          <!-- ⚔️ La bande qu'on intercepte marche VERS le point de rencontre pendant que le
               groupe y court : on voit les deux colonnes converger, et le choc s'annonce là
               où elles se croiseront. -->
          <g v-for="b in bandsOnMap" :key="'band' + b.id" class="band-march">
            <line :x1="b.x" :y1="b.y" :x2="b.meetX" :y2="b.meetY" class="band-path" />
            <circle :cx="b.meetX" :cy="b.meetY" r="6.5" class="clash-ring" />
            <circle :cx="b.x" :cy="b.y" r="3.2" class="band-mark" />
            <text :x="b.x" :y="b.y + 1.1" class="van-emo">{{ b.emo }}</text>
          </g>

          <g v-if="active && hero">
            <circle :cx="hero.x" :cy="hero.y" r="3.4" class="hero" />
            <text :x="hero.x" :y="hero.y + 1.2" class="hero-emo">🧝</text>
          </g>

          <!-- Ville (centre) : la MÊME enceinte que l'écran Base, en miniature — terre
               battue, octogone, tourelles aux sommets, corps de garde au nord, porte au
               sud et son chemin. On reconnaît sa base depuis la carte. -->
          <g class="town">
            <circle :cx="TOWN.x" :cy="TOWN.y" r="12.5" class="town-earth" />
            <circle :cx="TOWN.x" :cy="TOWN.y" r="10.5" class="town-glow" />
            <path :d="townRoad" class="town-road" />
            <polygon :points="townWall" class="town-wall" />
            <polygon :points="townYard" class="town-yard" />
            <circle
              v-for="(p, i) in townPts"
              :key="'tt' + i"
              :cx="p.x"
              :cy="p.y"
              r="1.15"
              class="town-turret"
            />
            <!-- Corps de garde au nord, porte au sud : posés SUR le pan de mur (l'octogone
                 est décalé d'un demi-pas, donc les milieux de pans tombent pile en haut et
                 en bas) — mêmes repères que l'écran Base, en miniature. -->
            <rect
              :x="TOWN.x - 1.7"
              :y="TOWN.y - TOWN_AP - 2.6"
              width="3.4"
              height="4.2"
              rx="0.5"
              class="town-keep"
            />
            <rect
              :x="TOWN.x - 1.3"
              :y="TOWN.y + TOWN_AP - 1.2"
              width="2.6"
              height="2.6"
              rx="0.8"
              class="town-gate"
            />
          </g>
        </svg>
      </div>

      <!-- Indicateurs de bord : flèche vers les activités hors écran -->
      <button
        v-for="e in edgeIndicators"
        :key="'edge' + e.id"
        class="edge-ind"
        :style="{ left: e.x + 'px', top: e.y + 'px', '--rk': rankOf(e.poi).color }"
        @click="panToPoi(e.poi)"
      >
        <span class="ei-arrow" :style="{ transform: `rotate(${e.deg}deg)` }">➤</span>
        <span v-if="isRiftPoi(e.poi)" class="ei-emo ei-rift">
          <RiftPortal :color="rankOf(e.poi).color" :seed="seedOf(e.poi.id)" still />
        </span>
        <span v-else class="ei-emo">{{ POI_EMO[e.poi.type] }}</span>
      </button>

      <!-- Zoom -->
      <div class="zoom-ctl">
        <!-- 🗂️ Les points fixes, en liste (juste au-dessus du dézoom, demandé). La pastille dit
             combien appellent : attaque imminente, sans défense, ou butin à récolter. -->
        <button
          class="zoom-b ctl-list-b"
          aria-label="Places fortes"
          title="Places fortes"
          @click="ctlListOpen = true"
        >
          🏰<span v-if="ctlCalls" class="ctl-list-dot">{{ ctlCalls }}</span>
        </button>
        <button class="zoom-b" aria-label="Dézoomer" @click="zoom(-1)">−</button>
        <button class="zoom-b" aria-label="Recentrer" @click="centerTown">⌂</button>
        <button class="zoom-b" aria-label="Zoomer" @click="zoom(1)">+</button>
      </div>
    </div>

    <ControlPointsSheet
      v-model="ctlListOpen"
      :rows="ctlRoster"
      :advs="char.advList"
      @open="openFromList"
    />

    <!-- 🧭 Les voyages en cours et l'équipe du voyage touché (cf. `TripsPanel`). -->
    <TripsPanel v-model:focus="focusTrip" :trips="trips" :hero-profile="character.profile" />

    <!-- Panneau POI sélectionné -->
    <transition name="sheet">
      <div v-if="selected" ref="sheetEl" class="sheet">
        <!-- 🗂️ LA FICHE DU LIEU (demandé : « toutes ses infos dans une grande tuile propre,
             au-dessus du choix des membres ») : ce qui s'y trouve, ce que ça rapporte, ce que ça
             coûte et ce qu'on risque, EN UN SEUL ENDROIT. En dessous, il ne reste que des
             ACTIONS (envoyer le héros, composer l'équipe). ⚠️ Aucune valeur n'est recalculée
             ici : la grille lit les MÊMES `computed` qu'avant (`poiFacts`). -->
        <PoiCard
          :poi="selected"
          :rank="selectedRank"
          :sub="poiSub"
          :facts="poiFacts"
          :ambush-left="selectedAmbushLeft"
          :is-rift="!!selectedRift"
          :warband="selectedWarband"
          :seal-stock="sealStock"
          :busy-seal="busySeal"
          @close="selected = null"
          @seal="doSeal"
        />
        <!-- 🏰 UN POINT DE CONTRÔLE TENU : sa garnison, ce qu'il produit, quand l'ennemi
             revient. On récolte, on ramène, on renforce. -->
        <div v-if="liveControl?.owner === 'player'" class="ctl-panel">
          <!-- 🏰 QUI L'OCCUPE (demandé) : la garnison et les renforts en route, en tuiles.
               Toucher un champion le sélectionne pour le RAMENER. -->
          <p class="ctl-line">
            🏰 <b>Garnison {{ controlCount }}/{{ MILITIA.perPoint }}</b>
            <span class="ctl-dim">
              · {{ controlMembers.length }}/{{ seatsOf(liveControl.kind) }} champion{{
                seatsOf(liveControl.kind) > 1 ? 's' : ''
              }}</span
            >
            <span class="ctl-dim"> · touche un membre pour le ramener</span>
          </p>
          <div class="car-pick">
            <AdvPickTile
              v-for="m in controlMembers"
              :key="m.adv.id"
              :adv="m.adv"
              :on="ctlRecallSel.includes(m.adv.id)"
              :reason="m.arriveIn > 0 ? `🧭 en route · ${formatDuration(m.arriveIn)}` : null"
              @toggle="toggleRecall(m.adv.id)"
            />
            <!-- 🛡️ Les miliciens : anonymes, une tuile chacun, ramenables comme un champion. -->
            <button
              v-for="m in controlMilitia"
              :key="m.id"
              type="button"
              class="mil-tile"
              :class="{ on: ctlRecallSel.includes(m.id) }"
              :aria-pressed="ctlRecallSel.includes(m.id)"
              @click="toggleRecall(m.id)"
            >
              <span class="mil-emo">{{ MILITIA_EMO }}</span>
              <span class="mil-name">{{ MILITIA_NAME }}</span>
              <span v-if="m.arriveIn > 0" class="mil-sub">🧭 {{ formatDuration(m.arriveIn) }}</span>
            </button>
          </div>
          <button
            v-if="ctlRecallSel.length"
            type="button"
            class="ctl-recall ctl-back"
            :disabled="ctlBusy"
            @click="releaseCtl"
          >
            ↩️ Ramener {{ ctlRecallSel.length }} membre{{ ctlRecallSel.length > 1 ? 's' : '' }}
          </button>
          <!-- ⇄ TRANSFERT (2026-09-29, demandé) : la sélection part directement renforcer un
               AUTRE point tenu, comme un renfort parti de la base. Une tuile par point, grisée
               AVEC la raison (`transferBlocker`, la règle du store). -->
          <div v-if="transferTargets.length" class="xfer">
            <p class="car-cap">⇄ <b>ou transférer</b> vers un autre point :</p>
            <div class="xfer-grid">
              <button
                v-for="t in transferTargets"
                :key="t.id"
                type="button"
                class="xfer-tile"
                :disabled="!!t.why || ctlBusy"
                :title="t.why ?? ''"
                @click="transferCtl(t.id)"
              >
                <span class="xfer-emo">{{ t.emo }}</span>
                <span class="xfer-main">
                  <span class="xfer-name">{{ t.label }}</span>
                  <span class="xfer-sub">{{
                    t.why ??
                    `🧭 ${formatDurationMin(t.min)} · ${t.free} place${t.free > 1 ? 's' : ''}`
                  }}</span>
                </span>
              </button>
            </div>
          </div>
          <!-- ⚠️ SANS DÉFENSE : la mine reste à nous, mais la prochaine attaque la reprendra
               (décision de l'utilisateur) — sauf si un renfort arrive avant. -->
          <p v-if="!liveControl.garrison.length" class="ctl-line ctl-warn">
            ⚠️ <b>Sans défense</b> : il ne produit plus, et l’ennemi le reprendra à sa prochaine
            attaque — sauf si un renfort arrive avant.
          </p>
          <p class="ctl-line">{{ controlProd }}</p>
          <!-- ⚒️ LA JAUGE DE CHAQUE CHAMPION (demandé) : ils n'arrivent pas en même temps, donc
               chacun a sa propre réserve — elle se remplit en 24 h de présence. -->
          <div v-if="forgeGauges.length" class="forge-gauges">
            <div v-for="g in forgeGauges" :key="g.id" class="forge-g">
              <span class="forge-g-name">{{ g.name }}</span>
              <span class="forge-g-bar"><i :style="{ width: g.pct + '%' }" /></span>
              <span class="forge-g-val">{{ g.xp }} XP · {{ g.time }}</span>
            </div>
          </div>
          <p v-if="controlNote" class="ctl-line ctl-dim">{{ controlNote }}</p>
          <!-- ⚔️ Dans les dernières heures seulement, on prévient — jamais l'heure (v0.1254). -->
          <p v-if="livePoi && attackImminent(livePoi, coarseNow)" class="ctl-line ctl-alert">
            ⚠️ <b>Bataille imminente</b> : une troupe ennemie marche sur ce lieu. Un renfort proche
            peut encore arriver à temps.
          </p>
          <!-- ⚠️ Sinon l'instant de la reprise n'est PAS annoncé (v0.1239, décision de
               l'utilisateur) : on sait seulement qu'elle viendra, plus tôt si l'on s'entraîne. -->
          <p v-else-if="liveControl.owner === 'player'" class="ctl-line ctl-warn">
            ⚔️ L’ennemi reviendra, prévenu au dernier moment — plus souvent si tu t’entraînes
            beaucoup. Force inconnue : ta garnison ne gagnera pas toujours.
          </p>
          <div class="send-bar">
            <button
              v-if="liveControl.kind !== 'tower'"
              class="sh-send"
              :disabled="!controlReady || ctlBusy"
              @click="collectCtl"
            >
              {{ controlCollectLabel }}
            </button>
          </div>
          <!-- ➕ RENFORT : une place est libre (ou vient de se libérer). Les renforts marchent,
               puis rejoignent la garnison ; en route, ils ne produisent ni ne combattent. -->
          <template v-if="controlFree > 0">
            <p class="ctl-line ctl-reinf">
              ➕
              <b
                >{{ controlFree }} place{{ controlFree > 1 ? 's' : '' }} libre{{
                  controlFree > 1 ? 's' : ''
                }}</b
              >
              — envoie un renfort
              <span v-if="ctlReinfSel.length" class="ctl-dim">
                · arrivée dans {{ formatDurationMin(reinforceLegMin) }}</span
              >
            </p>
            <div v-if="freeSorted.length" class="car-pick">
              <AdvPickTile
                v-for="a in freeSorted"
                :key="a.id"
                :adv="a"
                :on="ctlReinfSel.includes(a.id)"
                @toggle="toggleReinf(a.id)"
              />
            </div>
            <p v-else class="ctl-line ctl-dim">Aucun champion disponible pour l’instant.</p>
            <div v-if="ctlReinfSel.length" class="send-bar">
              <button class="sh-send" :disabled="ctlBusy" @click="reinforceCtl">
                ➕ Envoyer {{ ctlReinfSel.length }} en renfort
              </button>
            </div>
          </template>
          <!-- 🛡️ DES MILICIENS (Caserne) : ils complètent la garnison jusqu'à 5, champions
               compris. Ils font tourner le lieu, mais n'apprennent rien et meurent s'ils
               tombent. -->
          <template v-if="militiaBuilt || milHome > 0">
            <div class="mil-send">
              <span class="mil-send-lab"
                >{{ MILITIA_EMO }} Miliciens
                <span class="ctl-dim"
                  >· {{ milHome }} à la base · {{ militiaFreeSeats(liveControl) }} place{{
                    militiaFreeSeats(liveControl) > 1 ? 's' : ''
                  }}
                  libre{{ militiaFreeSeats(liveControl) > 1 ? 's' : '' }}</span
                ></span
              >
            </div>
            <!-- 🛡️ Une tuile par milicien de la base, comme les champions au-dessus (demandé :
                 « voir les icônes des miliciens au lieu de saisir un chiffre »). Ils sont
                 anonymes : toucher la N-ième en choisit N, la retoucher en retire une. Au-delà
                 des places libres, la tuile est grisée et le dit. -->
            <div v-if="milHome > 0" class="mil-pick">
              <button
                v-for="i in milHome"
                :key="'mil' + i"
                type="button"
                class="mil-tile"
                :class="{ on: i <= milSend, off: i > milSendMax }"
                :disabled="i > milSendMax"
                :aria-pressed="i <= milSend"
                :title="
                  i > milSendMax ? 'plus de place pour un milicien sur ce lieu' : MILITIA_NAME
                "
                @click="pickMilitia(i)"
              >
                <span class="mil-tile-emo">{{ MILITIA_EMO }}</span>
                <span class="mil-tile-n">{{ i }}</span>
              </button>
            </div>
            <p v-else class="ctl-line ctl-dim">Aucun milicien à la base pour l’instant.</p>
            <div v-if="milSend > 0" class="send-bar">
              <button class="sh-send" :disabled="ctlBusy" @click="sendMilitia">
                {{ MILITIA_EMO }} Envoyer {{ milSend }} milicien{{ milSend > 1 ? 's' : '' }} ·
                {{ formatDurationMin(militiaLegMin) }}
              </button>
            </div>
          </template>
          <button
            v-if="controlCount"
            type="button"
            class="ctl-recall"
            :disabled="ctlBusy"
            @click="recallCtl"
          >
            Rappeler toute la garnison
          </button>
        </div>
        <p v-else-if="liveControl?.assault" class="sh-note">⚔️ Une équipe marche sur ce lieu.</p>
        <p v-else-if="liveControl" class="sh-note">
          🏰 Prends-le avec 1 à 3 champions, sans le héros :
          {{ seatsOf(liveControl.kind) === 1 ? 'un seul y restera' : 'ils y resteront' }} en
          garnison ({{ CONTROL_YIELD[liveControl.kind] }}), jusqu’à ce que l’ennemi le reprenne
          (entre 1 et 3 jours). Chaque ennemi abattu, à la prise comme en défense, rapporte de l’XP.
          <template v-if="militiaBuilt"
            >Une fois pris, des miliciens de ta Caserne peuvent y remplacer tes champions.</template
          >
        </p>
        <!-- 🧝 LE HÉROS SEUL : son expédition solo (partout sauf camps, failles et armées, qui
             se prennent en équipe). Sur un lieu de RÉCOLTE, l’équipe est proposée juste dessous. -->
        <template v-if="offers.hero && !partyTarget">
          <p v-if="riskHero && riskHero.worsens" class="sh-risk" :class="{ bad: riskHero.risky }">
            ⚠️ Une armée arrive : sans le héros, « {{ ODDS_LABEL[riskHero.after] }} » au lieu de «
            {{ ODDS_LABEL[riskHero.before] }} ».
          </p>
          <p v-else-if="riskHero && riskHero.covered" class="sh-ok">
            ✅ Une armée arrive, mais il sera rentré avant elle.
          </p>
          <div class="send-bar">
            <button class="sh-send" :disabled="!canSend" @click="send">
              {{ sendLabel }}
            </button>
          </div>
        </template>
        <!-- 👥 UNE ÉQUIPE — 3 places, le héros en prend 2 (2026-09-21 : les équipes remplacent les
             convois). Elle part sur un camp, une faille, une armée ou un lieu de RÉCOLTE. ⚠️ UN SEUL bloc pour les deux : le choix du groupe,
             la tuile du héros, le risque de départ et le bouton sont identiques — en écrire deux
             garantirait qu’ils divergent. Seuls la rangée de chips et la note changent.
             Les règles vivent dans `camp.ts` / `rift.ts` et `party.ts` ; l’écran les montre,
             et dit POURQUOI quelqu’un ne peut pas venir. -->
        <template v-if="partyTarget">
          <div v-if="offers.hero && !partyTarget" class="car-sep">ou bien — une équipe</div>
          <!-- Le héros : une tuile comme les autres. Il est plafonné à HERO_PARTY_WORTH
               champions au combat (v0.980), mais l'écran ne le dit plus (décision de
               l'utilisateur, v0.1263) : seul « sans XP » reste. Grisée avec la raison plutôt que cachée. -->
          <!-- 📐 Le héros et « tout le vivier » sur UNE ligne : deux boutons empilés
               prenaient ~100 px pour deux gestes. -->
          <!-- 🏰 SORTIE (2026-09-29, demandé) : l'équipe peut partir d'un point fixe tenu — sa
               garnison y fournit les champions, et ils y reviennent. -->
          <div v-if="originOptions.length" class="origin-pick">
            <p class="car-cap">🧭 <b>Départ</b> · depuis un point, l’équipe y revient</p>
            <div class="xfer-grid">
              <button
                type="button"
                class="xfer-tile"
                :class="{ on: !originPoi }"
                :aria-pressed="!originPoi"
                @click="partyOrigin = null"
              >
                <span class="xfer-emo">🏰</span>
                <span class="xfer-main"><span class="xfer-name">Base</span></span>
              </button>
              <button
                v-for="o in originOptions"
                :key="o.id"
                type="button"
                class="xfer-tile"
                :class="{ on: originPoi?.id === o.id }"
                :aria-pressed="originPoi?.id === o.id"
                @click="partyOrigin = o.id"
              >
                <span class="xfer-emo">{{ o.emo }}</span>
                <span class="xfer-main">
                  <span class="xfer-name">{{ o.label }}</span>
                  <span class="xfer-sub"
                    >{{ o.n }} champion{{ o.n > 1 ? 's' : '' }} prêt{{ o.n > 1 ? 's' : '' }}</span
                  >
                </span>
              </button>
            </div>
          </div>
          <div class="party-top">
            <button
              type="button"
              class="party-hero"
              :class="{ on: partyHeroOn, off: !!partyHeroBlock || !!originPoi }"
              :disabled="!!partyHeroBlock || !!originPoi"
              :aria-pressed="partyHeroOn"
              @click="partyHero = !partyHero"
            >
              <span class="ph-emo">🧝</span>
              <span class="ph-main">
                <span class="ph-name">Ton héros</span>
                <span class="ph-sub">{{
                  originPoi
                    ? 'il part de la base'
                    : partyHeroBlock
                      ? PARTY_HERO_BLOCK_LABEL[partyHeroBlock]
                      : 'sans XP'
                }}</span>
              </span>
              <span class="ph-check">{{ partyHeroOn ? '✓' : '＋' }}</span>
            </button>
            <button
              v-if="char.advList.length"
              class="car-auto"
              :disabled="!partyPoolSorted.length"
              @click="togglePartyAll"
            >
              {{ partyAllOn ? 'Retirer tous' : `✨ Tous (${partyAllIds.length})` }}
            </button>
          </div>
          <!-- 🕳️ ⚠️ ON DIT LA LIMITE AVANT qu'on butte dessus : sans ça, des tuiles qui
               ne répondent plus se lisent comme une panne (leçon du gris de la carte). -->
          <!-- 👥 v0.1035 : plus de plafond de 3 — seulement celui du Panthéon. Ce que le nombre
               coûte, c'est l'XP : on le DIT avant l'envoi, avec le partage en cours. -->
          <p
            class="car-cap"
            title="Le plafond vient du Panthéon. L'XP du lieu se partage entre les champions (le héros n'en prend pas). Sans le héros, ils apprennent 25 % de plus."
          >
            👥 <b>{{ partyAdvs.length }}/{{ partyMax }}</b> champions · XP partagée
            <b>×{{ partyXpSplit.toFixed(2).replace('.', ',') }}</b> chacun
            <span v-if="!partyHeroOn"> · 🧭 seuls, ils apprennent plus</span>
          </p>
          <div v-if="stayChoice" class="stay-pick">
            <p class="car-cap">
              🏰 <b>Qui reste ?</b> {{ stayIds.length }}/{{ stayCap }} en garnison · les autres
              rentrent après la prise
            </p>
            <button
              v-for="a in partyAdvs"
              :key="a.id"
              type="button"
              class="stay-chip"
              :class="{ on: stayIds.includes(a.id) }"
              :aria-pressed="stayIds.includes(a.id)"
              @click="toggleStay(a.id)"
            >
              {{ stayIds.includes(a.id) ? '🏰' : '↩' }} {{ a.name }}
              <span v-if="stayHoldOf[a.id] !== undefined" class="stay-hold"
                >🛡️ {{ stayHoldOf[a.id] }} %</span
              >
            </button>
          </div>
          <!-- 🛡️ Ce que la garnison choisie tiendra face aux reprises. ⚠️ Jamais plus de 90 % :
               au-delà, l'ennemi envoie plus de monde (`retakeBoost`) — il reste du suspense. -->
          <p v-if="stayHold !== null" class="car-cap stay-hold-line">
            🛡️ Garnison : repousse environ <b>{{ stayHold }} %</b> des attaques
            <span class="stay-hold-note">· jamais plus de 90 %, l’ennemi s’adapte</span>
          </p>
          <div v-if="char.advList.length" class="car-pick">
            <AdvPickTile
              v-for="a in partyPoolSorted"
              :key="a.id"
              :adv="a"
              :on="partyEscort.includes(a.id)"
              :xp="partyXp[a.id]"
              @toggle="togglePartyAdv(a.id)"
            />
            <!-- ⚠️ LES INDISPONIBLES SONT MASQUÉS PAR DÉFAUT (demandé) : ils prenaient la moitié
                 de la grille pour des tuiles qu'on ne peut pas toucher. Le bouton dit combien il
                 y en a, et pourquoi chacun est indisponible reste écrit sur sa tuile. -->
            <template v-if="showBlocked && !originPoi">
              <AdvPickTile
                v-for="b in partyBlocked"
                :key="b.adv.id"
                :adv="b.adv"
                :on="false"
                :reason="ADV_UNAVAILABLE_LABEL[b.why]"
              />
            </template>
          </div>
          <!-- 🔮 LA RÈGLE QUE PERSONNE NE POUVAIT DEVINER, dite une seule fois : sous son
               niveau, un champion apprend beaucoup moins (mesuré v0.1102 : du simple au
               quadruple selon la destination). Affichée seulement s'il y a quelqu'un que ça
               concerne — sinon c'est du bruit. -->
          <p v-if="partyLowXp" class="car-xp-note">
            📉 XP atténuée = lieu <b>sous son niveau</b> : il y apprend beaucoup moins.
          </p>
          <button
            v-if="char.advList.length && partyBlocked.length && !originPoi"
            type="button"
            class="car-blocked-toggle"
            :aria-expanded="showBlocked"
            @click="showBlocked = !showBlocked"
          >
            {{
              showBlocked
                ? `Masquer les indisponibles`
                : `Voir les ${partyBlocked.length} indisponible${partyBlocked.length > 1 ? 's' : ''}`
            }}
          </button>
          <!-- ⚠️ Était un `v-else` du bouton des indisponibles : il s'affichait donc dès que
               personne n'était indisponible, champions ou pas. -->
          <p v-if="!char.advList.length" class="sh-away">
            🏅 Aucun champion : invoque-les au Panthéon de ta base pour attaquer sans le héros.
          </p>
          <!-- 🎒 RAVITAILLEMENT — un de chaque consommable, pris dans le stock. ⚠️ Ils entrent
               dans le kit du groupe (`partyRoad`), donc le 🎯 % ci-dessus les voit comme le
               combat les verra. Ceux qui ne servent à rien ICI sont grisés AVEC la raison. -->
          <!-- 🎒 Ravitaillement (cf. `SupplyPicker`) : le 🎯 % ci-dessus en tient compte. -->
          <SupplyPicker :rows="supplyRows" @toggle="toggleSupply" />
          <!-- 📐 Les règles de l'expédition, repliées : trois lignes de texte à chaque ouverture. -->
          <details class="sh-rules">
            <summary>ⓘ Règles de cette expédition</summary>
            <p v-if="selectedCamp" class="sh-note">
              Sans le héros : de l’or (et des pierres chez les morts-vivants) — l’équipe prend un
              créneau de l’Avant-poste. En cas de défaite, les champions tombés partent à
              l’infirmerie ; le héros, lui, rentre sans butin.
            </p>
            <p v-else-if="!teamOnly" class="sh-note">
              Des gardes tiennent le lieu : il faut les abattre pour récolter. Repoussée, l’équipe
              ne ramène rien et les champions tombés partent à l’infirmerie. Sur la route, des
              bandits peuvent tendre une embuscade — plus l’équipe est complète, mieux elle tient.
              Sans le héros, elle prend un créneau de l’Avant-poste.
            </p>
            <p v-else class="sh-note">
              Sans le héros, l’équipe prend un créneau de l’Avant-poste — et une faille ne rend que
              du 💠, jamais d’objet.
            </p>
          </details>
          <p
            v-if="partyRisk && partyRisk.worsens"
            class="sh-risk"
            :class="{ bad: partyRisk.risky }"
          >
            ⚠️ Une armée arrive : sans eux, « {{ ODDS_LABEL[partyRisk.after] }} » au lieu de «
            {{ ODDS_LABEL[partyRisk.before] }} ».
          </p>
          <p v-else-if="partyRisk && partyRisk.covered" class="sh-ok">
            ✅ Une armée arrive, mais ils seront rentrés avant elle.
          </p>
          <p v-if="partySlotsFull" class="sh-risk">
            🐫 {{ PARTY_SEND_BLOCK_LABEL.slots }} : sans le héros, une équipe en prend un. Emmène
            ton héros, ou attends le retour d’une équipe.
          </p>
          <!-- 💀 ON DIT POURQUOI (demandé : « empêche d'envoyer une expédition à 0 % ») :
               un bouton qui se grise en silence se lit comme une panne, et le joueur ne
               saurait pas quoi changer. La parade est donc écrite avec le refus. -->
          <p v-if="partySendBlock === 'hopeless'" class="sh-risk">
            💀 {{ PARTY_SEND_BLOCK_LABEL.hopeless }}. Emmène plus de champions, monte-les, ou vise
            un lieu d’un rang plus bas.
          </p>
          <!-- 📌 COLLANT en bas de l'écran : on ne défile plus jusqu'au bout pour envoyer. -->
          <div class="send-bar">
            <button class="sh-send car-send" :disabled="!canSendPartyNow" @click="doSendParty">
              {{ partySendLabel }}
            </button>
          </div>
        </template>
        <div v-if="!offers.hero && !partyTarget && heroHealIn > 0" class="sh-away">
          🤕 Ton héros est à l’infirmerie — de retour dans {{ formatDuration(heroHealIn) }}.
        </div>
        <div v-else-if="!offers.hero && !partyTarget" class="sh-away">
          🧭 Ton héros est en expédition. Une équipe de champions, elle, peut partir sans lui.
        </div>
      </div>
    </transition>

    <!-- Emplacement de filon (construire / récolter / améliorer) — MODALE centrée
         (clic-dehors ou croix pour fermer ; plus de scroll en bas de page). -->
    <!-- Modale de collecte au retour -->
    <q-dialog v-model="collectOpen">
      <q-card v-if="lastOutcome" class="van-card">
        <div class="van-kicker">📬 Retour de mission</div>
        <MissionReportCard
          :card="messageCard(lastOutcome, char.advList)"
          :state="lastPending ? 'claim' : 'none'"
          :now="now"
          claim-label="🎁 Récupérer le butin"
          @claim="doClaim"
          @replay="
            lastOutcome.overflow ? (ovfMsg = lastOutcome) : (riftReplay = lastOutcome.party ?? null)
          "
        />
        <div class="van-actions">
          <q-btn flat no-caps label="Fermer" @click="collectOpen = false" />
        </div>
      </q-card>
    </q-dialog>

    <!-- 🕳️ Rejeu d'une incursion : la traversée, la porte, la salle du gardien. -->
    <RiftReplayDialog
      v-model:replay="riftReplay"
      :roster="char.advList"
      :hero-profile="character.profile"
      @report="openRiftReport"
      :hero-equipped="char.row?.equipped ?? {}"
    />
    <!-- 🕳️💥 Rejeu d'un débordement de faille. -->
    <OverflowReplayDialog v-model="ovfMsg" @report="openOvfReport" />

    <!-- ⚠️ LA GUILDE S'OUVRE ICI, au retour d'un convoi dont la mission vient de rendre
         une promotion possible. Le vivier se gère depuis son bâtiment (règle « un
         bâtiment, un endroit ») — mais une promotion qu'on vient de MÉRITER doit se
         proposer là où on l'apprend, sinon elle attend qu'on repasse par la Base. On
         ouvre bien la GUILDE (avec sa feuille de promotion par-dessus), pas un bout
         de Guilde détaché : après avoir promu, on est déjà là où l'on gère son monde. -->

    <div v-if="!active && !pois.length" class="empty">
      La carte se peuple avec le temps — de nouvelles activités apparaissent régulièrement. Reviens
      bientôt.
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { poiHaulPreview, poiTeamHaul, formatHaul } from '@/lib/poiYield';
import {
  fogRevealPlan,
  fogRadiusAt,
  underFog,
  revealedCount,
  type FogRevealPlan,
} from '@/lib/fogReveal';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import type { RuneTier } from '@/lib/skillRunes';
import type { SupplyStock } from '@/lib/supplies';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { useGamePanel } from '@/composables/useGamePanel';
import GameLoader from '@/components/GameLoader.vue';
import AvailabilityLine from '@/components/AvailabilityLine.vue';
import { computeCharacter } from '@/lib/character';
import { DUNGEONS } from '@/data/dungeons';
import { playerWithGear, fxRarity, gradeLabel, RARITY_RANK } from '@/lib/items';
import MissionReportCard from '@/components/MissionReportCard.vue';
import { messageCard } from '@/lib/missionCard';
import AdvPickTile from '@/components/AdvPickTile.vue';
import { campBodyCount, campRewardLabel, forceLootPreview } from '@/lib/camp';
import { poiRank } from '@/lib/poiRank';
import { PARTY_HERO_BLOCK_LABEL, PARTY_SEND_BLOCK_LABEL, partyLegMin } from '@/lib/party';
import { buildingLevel, expeditionsUnlocked, travelTimeMult } from '@/lib/buildings';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, seedOf, type Combatant } from '@/lib/combat';
import RiftPortal from '@/components/RiftPortal.vue';
import {
  POI_EMO,
  POI_LABEL,
  type ExpeditionMessage,
  EXPE,
  travelPosition,
  mapTravelPoint,
  warbandAt,
  tripTimeLabel,
  voyageProgress,
  poiCombatant,
  simulateArena,
  poiTravelLevel,
  travelOneWayMin,
  expeditionTerrain,
  MAP_VIEW,
  revealRadius,
  travelHourRings,
  type Poi,
  type PoiType,
  HARVEST_TYPES,
  campSpecOf,
  harvestGuardOf,
  harvestGold,
  poiForceOf,
  isRiftPoi,
  isWarbandPoi,
  isClaimable,
  ruinsSealKind,
  haulPills,
  type PartyResult,
  veinDwellMs,
} from '@/lib/expedition';
import MapTerrain from '@/components/MapTerrain.vue';
import MapPoiLayer from '@/components/MapPoiLayer.vue';
import MapFilterBar from '@/components/MapFilterBar.vue';
import TripsPanel, { type MapTrip } from '@/components/TripsPanel.vue';
import ControlPointsSheet from '@/components/ControlPointsSheet.vue';
import PoiCard from '@/components/PoiCard.vue';
import SupplyPicker from '@/components/SupplyPicker.vue';
import { winClass, type PoiFact } from '@/lib/poiFacts';
import { usePoiFilters } from '@/composables/usePoiFilters';
import { useExpeditionParty } from '@/composables/useExpeditionParty';
import { pinchStart, pinchUpdate, type PinchStart } from '@/lib/pinchZoom';
import RiftReplayDialog from '@/components/RiftReplayDialog.vue';
import OverflowReplayDialog from '@/components/OverflowReplayDialog.vue';
import { useOverflowReplay } from '@/composables/useOverflowReplay';
import { useRiftAutoReplay } from '@/composables/useRiftAutoReplay';
import {
  departureRisk,
  heroDefends,
  guardUnits,
  ODDS_LABEL,
  FACTION_EMOJI,
  FACTION_LABEL,
  woundRemainingMs,
} from '@/lib/raid';
import {
  ADV_UNAVAILABLE_LABEL,
  advAvailable,
  engageCap,
  sortByGradeThenRank,
} from '@/lib/adventurers';
import { formatDuration, formatDurationMin } from '@/lib/duration';
import {
  CONTROL,
  CONTROL_EMO,
  CONTROL_LABEL,
  CONTROL_YIELD,
  controlFreeSeats,
  militiaFreeSeats,
  controlRoster,
  controlGoldPerHour,
  controlStock,
  controlTravelMult,
  gardenStock,
  trainingCapLevel,
  trainingStock,
  trainingXpPerHour,
  champHoursOf,
  champStockBy,
  isPerChampKind,
  forgeStock,
  forgeXpPerHour,
  runeProgress,
  runeHoursFor,
  gardenHoursFor,
  runeStock,
  seatsOf,
  attackImminent,
  imminentControlKey,
  reinforcementsEnRoute,
  returnsEnRoute,
} from '@/lib/controlPoints';
import { characterRank } from '@/lib/characterRank';
import { advGearRoles } from '@/lib/advGear';
import {
  RIFT,
  riftClearMana,
  riftOverflowAt,
  riftPopulation,
  riftSpecOf,
  warbandArmy,
} from '@/lib/rift';
import { caravanLegMin, convoySlotsFree, poiOffers } from '@/lib/caravan';
import { TRANSFER_BLOCK_LABEL, legFromSpot, transferBlocker } from '@/lib/controlRoutes';
import { MILITIA, MILITIA_EMO, MILITIA_NAME, isMilitiaId, militiaIn } from '@/lib/militia';

const props = defineProps<{ embedded?: boolean }>();
const router = useRouter();
const { openPath } = useGamePanel();
/**
 * 🏰 RETOUR = L'ÉCRAN DE LA BASE (demandé par l'utilisateur). On entre sur la carte par la
 * PORTE du rempart sud : on en ressort par là, pas sur l'onglet Héros.
 *
 * ⚠️ On ne peut PAS s'en remettre à `router.back()` : l'onglet de l'Aventure ne vit pas dans
 * l'URL (`/aventure` tout court ouvre « Héros »), donc revenir en arrière rouvrirait le mauvais
 * onglet. Il faut viser `?tab=base`, que l'Aventure lit.
 *
 * ⚠️ `openPath` est la SOURCE UNIQUE de « volet droit en cockpit, route plein écran sinon » :
 * la réécrire ici en ferait une troisième copie, aveugle au cockpit — le défaut exact corrigé
 * en v0.748. Elle reporte la query sur la route courante quand l'Aventure est déjà montée.
 */
function back() {
  openPath(router, '/aventure?tab=base', props.embedded);
}
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();
const advXpFx = useAdvXpFx();

const TOWN = EXPE.town;
/** La ville en miniature = l'enceinte de la Base (octogone décalé d'un demi-pas : pans
 *  au nord et au sud, tourelles aux sommets). Rayon 6,4 : la ville tient sous le
 *  premier anneau de lieux (`distMin` 18). */
const TOWN_R = 7.2;
const townPts = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
  return { x: TOWN.x + Math.cos(a) * TOWN_R, y: TOWN.y + Math.sin(a) * TOWN_R };
});
const townWall = townPts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const townYard = townPts
  .map(
    (p) =>
      `${(TOWN.x + (p.x - TOWN.x) * 0.72).toFixed(2)},${(TOWN.y + (p.y - TOWN.y) * 0.72).toFixed(2)}`,
  )
  .join(' ');
/** Distance du centre au MILIEU d'un pan (et non au sommet) : c'est elle qui porte le
 *  corps de garde, la porte et le départ du chemin — exactement comme sur l'écran Base. */
const TOWN_AP = TOWN_R * Math.cos(Math.PI / 8);
const townRoad = `M${TOWN.x - 1.2} ${TOWN.y + TOWN_AP} L${TOWN.x - 2.2} ${TOWN.y + 14} L${TOWN.x + 2.2} ${TOWN.y + 14} L${TOWN.x + 1.2} ${TOWN.y + TOWN_AP} Z`;

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const character = computed(() =>
  computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + (char.row?.login_energy ?? 0),
    char.row?.energy_spent ?? 0,
  ),
);
const heroLevel = computed(() => character.value.level.level);
// Niveau de PROGRESSION DANS LE JEU (≠ niveau de sport) : profondeur atteinte en donjon
// = recoLevel du donjon le plus profond nettoyé (frontière). Sert à caler la DIFFICULTÉ
// des expéditions sur ce que le joueur a VRAIMENT accompli, pas sur son niveau de sport
// (qui peut être élevé sans avoir farmé le jeu → sinon activités 100 % gagnées). Ticket
// f6e40aa6. Plancher 2 (early : quelques activités abordables). +1 = la « frontière »
// (le cran juste au-dessus du dernier nettoyé) → une part d'activités reste un vrai défi.
const progressionLevel = computed(() => {
  const cleared = new Set(char.row?.cleared_dungeons ?? []);
  let maxReco = 0;
  for (const d of DUNGEONS) if (cleared.has(d.id)) maxReco = Math.max(maxReco, d.recoLevel);
  return Math.max(2, maxReco + 1); // frontière = un cran au-dessus du dernier nettoyé
});
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentEffects(char.row?.talents ?? []),
    heroLevel.value,
    char.row?.voie,
  ),
);

const active = computed(() => char.row?.expedition ?? null);
const pois = computed<Poi[]>(() => char.row?.expedition_map?.pois ?? []);
// Fond de carte (terrain) déterministe pour le seed de la carte.
const terrain = computed(() =>
  char.row?.expedition_map
    ? expeditionTerrain(char.row.expedition_map.seed)
    : { features: [], rivers: [], tufts: [], patches: [] },
);
/** 🗺️ Fenêtre dessinée (la ville reste en 100,100 ; la carte s'étend en négatif autour). */
const V = MAP_VIEW;
/** Rayon révélé par l'Avant-poste : le brouillard commence au-delà. */
const reveal = computed(() => revealRadius(char.comptoirLevel));
/** ⏱️ Rayons des heures pleines de trajet aller du héros, dans la zone révélée. */
const hourRings = computed(() =>
  travelHourRings(progressionLevel.value, travelMult.value, reveal.value),
);
const FOG_SOFT = 10; // largeur du fondu du brouillard
const fogInner = computed(() => Math.max(0, (fogR.value - 3) / (fogR.value + FOG_SOFT)));

/** 🌫️ LE BROUILLARD SE LÈVE (v0.1199) : le rayon DESSINÉ (`fogR`) rejoue le recul de l'ancien
 *  rayon vu au nouveau quand l'Avant-poste a monté ; les lieux découverts apparaissent au
 *  passage du front. La règle vit dans `lib/fogReveal`. Le rayon vu est retenu par appareil
 *  et par compte (localStorage, jamais bloquant). ⚠️ Le zoom de départ lit `reveal` (le vrai
 *  rayon), pas `fogR` : on cadre sur ce qui va être découvert. */
const fogR = ref(reveal.value);
const fogPlan = ref<FogRevealPlan | null>(null);
let fogRaf = 0;
const fogKey = () => `muscu:fog:seen:${auth.user?.id ?? 'anon'}`;
function readFogSeen(): number | null {
  try {
    const v = localStorage.getItem(fogKey());
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}
function writeFogSeen(r: number) {
  try {
    localStorage.setItem(fogKey(), String(r));
  } catch {
    /* stockage indisponible : on rejouera le recul, rien de grave */
  }
}
function liftFog(from: number | null) {
  cancelAnimationFrame(fogRaf);
  clearTimeout(fogWait);
  const to = reveal.value;
  writeFogSeen(to);
  const plan = fogRevealPlan(from, to);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!plan || reduced) {
    fogPlan.value = null;
    fogR.value = to;
    return;
  }
  fogPlan.value = plan;
  fogR.value = plan.from;
  const start = () => {
    const found = revealedCount(pois.value, TOWN, plan.from);
    if (found > 0)
      gameFx.celebrate({
        kind: 'unlock',
        emoji: '🌫️',
        title: 'Le brouillard se lève',
        subtitle: `${found} lieu${found > 1 ? 'x' : ''} découvert${found > 1 ? 's' : ''}`,
        quiet: true,
      });
    const t0 = performance.now();
    const step = (t: number) => {
      fogR.value = fogRadiusAt(plan, t - t0);
      if (t - t0 < plan.ms) fogRaf = requestAnimationFrame(step);
      else fogPlan.value = null;
    };
    fogRaf = requestAnimationFrame(step);
  };
  // ⚠️ Pas sous l'écran de chargement : on en raterait le départ (vu au banc). L'ancien
  // rayon reste posé en dessous, le recul part quand la carte se découvre.
  if (booting.value) {
    const stop = watch(booting, (b) => {
      if (b) return;
      stop();
      fogWait = setTimeout(start, 250);
    });
  } else start();
}
let fogWait: ReturnType<typeof setTimeout> | undefined;
// Monter l'Avant-poste pendant que la carte est ouverte (volet droit du cockpit).
watch(reveal, (to, from) => {
  if (to !== from) liftFog(fogR.value);
});
/** Position DESSINÉE (bord de la ville → bord du lieu, `mapTravelPoint`) ; les compteurs
 *  restent ceux de `travelPosition`. */
function drawnAt(v: Parameters<typeof travelPosition>[0]) {
  const at = travelPosition(v, now.value);
  return { ...at, ...mapTravelPoint(at, v.poi, v.origin) };
}
const hero = computed(() => (active.value ? drawnAt(active.value) : null));
const heroProg = computed(() =>
  active.value ? voyageProgress(active.value, now.value) : { overall: 0, mid: 0.5 },
);

// Chevrons de direction le long du segment RESTANT (héros → cible du moment :
// l'objectif à l'aller, la ville au retour). Ils s'allument un à un du héros vers
// la cible (délai croissant) et sont orientés dans le sens du déplacement.
const ARROW_STEP = 0.16; // décalage d'allumage entre 2 chevrons (s)
const travelArrows = computed(() => {
  const h = hero.value;
  const a = active.value;
  if (!h || !a || h.phase === 'done') return [];
  const target = h.phase === 'return' ? TOWN : a.poi;
  const dx = target.x - h.x;
  const dy = target.y - h.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) return []; // trop proche de la cible → rien à montrer
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const n = Math.min(5, Math.max(2, Math.round(len / 14))); // ~1 chevron / 14 u
  const arrows: { x: number; y: number; angle: number; i: number; delay: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1); // répartis, sans coller au héros ni à la cible
    arrows.push({ x: h.x + dx * t, y: h.y + dy * t, angle, i, delay: (i - 1) * ARROW_STEP });
  }
  return arrows;
});

// ── Carte pannable/zoomable (plus grande que l'écran) ──
const scrollEl = ref<HTMLElement | null>(null);
const mapPx = ref(700); // taille de rendu du SVG (px) → zoom
const scrollX = ref(0);
const scrollY = ref(0);
const contW = ref(1);
const contH = ref(1);
const MIN_PX = 340;
const MAX_PX = 1700;
const ZOOM_STEP = 200; // 1 cran de zoom (± via les boutons +/−)
/** Dézoom maximal : la carte (carrée) couvre toujours le cadre en largeur ET en hauteur.
 *  En dessous, un bandeau vide apparaissait sous la carte (demandé par l'utilisateur). */
const minPx = computed(() => Math.max(MIN_PX, contW.value, contH.value));
const clampPx = (px: number) => Math.max(minPx.value, Math.min(MAX_PX, px));
function measure() {
  const el = scrollEl.value;
  if (!el) return;
  contW.value = el.clientWidth;
  contH.value = el.clientHeight;
  // Le cadre peut grandir (rotation, rangée de voyages qui disparaît) : on rattrape.
  if (mapPx.value < minPx.value) mapPx.value = minPx.value;
}
function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  scrollX.value = el.scrollLeft;
  scrollY.value = el.scrollTop;
}
function centerOn(svgX: number, svgY: number) {
  const el = scrollEl.value;
  if (!el) return;
  el.scrollLeft = ((svgX - V.min) / V.size) * mapPx.value - el.clientWidth / 2;
  el.scrollTop = ((svgY - V.min) / V.size) * mapPx.value - el.clientHeight / 2;
  onScroll();
}
function centerTown() {
  centerOn(TOWN.x, TOWN.y);
}
function panToPoi(p: Poi) {
  centerOn(p.x, p.y);
}
function zoom(dir: number) {
  const el = scrollEl.value;
  // Fraction du centre du viewport (0..1) → on la conserve après le zoom.
  const cx = ((el?.scrollLeft ?? 0) + contW.value / 2) / mapPx.value;
  const cy = ((el?.scrollTop ?? 0) + contH.value / 2) / mapPx.value;
  mapPx.value = clampPx(mapPx.value + dir * ZOOM_STEP);
  void nextTick(() => centerOn(V.min + cx * V.size, V.min + cy * V.size));
}

// ── 🤏 Zoom à deux doigts (pincer / écarter) ──
// ⚠️ `touch-action: pan-x pan-y` laisse le défilement au navigateur mais lui retire le zoom :
// c'est nous qui zoomons. Le `touchmove` est NON passif pour empêcher, à deux doigts, le
// défilement natif de se battre avec le nôtre (le geste fait déjà glisser la carte).
let pinch: PinchStart | null = null;
function touchGeometry(e: TouchEvent) {
  const el = scrollEl.value!;
  const r = el.getBoundingClientRect();
  const [a, b] = [e.touches[0]!, e.touches[1]!];
  return {
    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    midX: (a.clientX + b.clientX) / 2 - r.left,
    midY: (a.clientY + b.clientY) / 2 - r.top,
  };
}
function onTouchStart(e: TouchEvent) {
  const el = scrollEl.value;
  if (!el || e.touches.length !== 2) return;
  const g = touchGeometry(e);
  pinch = pinchStart(mapPx.value, g.dist, g.midX, g.midY, el.scrollLeft, el.scrollTop);
}
function onTouchMove(e: TouchEvent) {
  const el = scrollEl.value;
  if (!el || !pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const g = touchGeometry(e);
  const r = pinchUpdate(pinch, g.dist, g.midX, g.midY, minPx.value, MAX_PX);
  mapPx.value = r.px;
  // Après le redimensionnement du SVG : sinon le défilement est borné à l'ANCIENNE taille.
  void nextTick(() => {
    el.scrollLeft = r.scrollLeft;
    el.scrollTop = r.scrollTop;
    onScroll();
  });
}
function onTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) pinch = null;
}
// Activités hors écran → flèche au bord pointant vers elles (clic = slide dessus).
const edgeIndicators = computed(() => {
  if (!scrollEl.value) return [] as { id: string; poi: Poi; x: number; y: number; deg: number }[];
  const cw = contW.value;
  const ch = contH.value;
  const m = 22;
  const src = [...shownPois.value, ...(active.value ? [active.value.poi] : [])];
  const out: { id: string; poi: Poi; x: number; y: number; deg: number }[] = [];
  for (const p of src) {
    const px = ((p.x - V.min) / V.size) * mapPx.value - scrollX.value;
    const py = ((p.y - V.min) / V.size) * mapPx.value - scrollY.value;
    if (px >= 0 && px <= cw && py >= 0 && py <= ch) continue; // visible
    const dx = px - cw / 2;
    const dy = py - ch / 2;
    const scale = Math.min(
      (cw / 2 - m) / (Math.abs(dx) || 1e-6),
      (ch / 2 - m) / (Math.abs(dy) || 1e-6),
    );
    out.push({
      id: p.id,
      poi: p,
      x: cw / 2 + dx * scale,
      y: ch / 2 + dy * scale,
      deg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return out;
});

const selected = ref<Poi | null>(null);

/** 🏅 Le rang de CHAQUE lieu, calculé une fois par changement de carte.
 *  ⚠️ La carte se re-rend à la seconde (les convois avancent) et chaque tuile lit son rang
 *  quatre fois : sans ce mémo, c'est une bisection par lecture, ~65 fois par seconde.
 *  ⚠️ REPLI sur le calcul direct : la CIBLE d'un voyage en cours n'est plus sur la carte
 *  (un lieu est consommé au départ), et la barre de bord l'affiche quand même. */
const rankByPoi = computed(() => new Map(pois.value.map((p) => [p.id, poiRank(p)])));
const rankOf = (p: Pick<Poi, 'id' | 'type' | 'level'>) => rankByPoi.value.get(p.id) ?? poiRank(p);
// ── 🎚️🗺️ Filtres par rang et par type (mémorisés par appareil) ──
const {
  hiddenRanks,
  rankOptions,
  toggleRank,
  typeFilterShown,
  typeChips,
  cycleTypeChip,
  resetFilters,
  shownPois,
} = usePoiFilters(pois, (p) => rankOf(p).rankIndex);
// Un lieu sélectionné que le filtre masque ne garde pas sa feuille ouverte.
watch(shownPois, (list) => {
  const s = selected.value;
  if (s && pois.value.some((p) => p.id === s.id) && !list.some((p) => p.id === s.id))
    selected.value = null;
});
const sheetEl = ref<HTMLElement | null>(null);

/** ⚠️ CE QUE LE DÉPART COÛTE, face à l'armée qui arrive (demandé par l'utilisateur :
 *  « envoyer des convois ou le héros sans se mettre dans le rouge »). Cet écran ne
 *  savait RIEN du siège en approche : on partait, et on découvrait en rentrant que la
 *  base était tombée pendant le voyage.
 *  ⚠️ Toute la règle vit dans `departureRisk` (pure, testée) — ici on ne fait que lui
 *  passer l'état AVANT et APRÈS. */
const base = computed(() => char.row?.base ?? null);
const incoming = computed(() => base.value?.raid ?? null);
/** ⚠️ CETTE PAGE TICKE À LA SECONDE (les convois avancent sur la carte), et le pronostic
 *  coûte ~13 ms de simulation. À la seconde, c’est 13 ms de travail identique 60 fois par
 *  minute ; à la minute, c’est gratuit — et une minute de granularité ne change rien à
 *  « rentre-t-il avant l’assaut ? », qui se joue en heures. */
const coarseNow = computed(() => Math.floor(now.value / 60_000) * 60_000);
/** ⚔️ Les points sous attaque imminente, à la minute près (une chaîne stable pour la carte). */
const imminentKey = computed(() =>
  imminentControlKey(char.row?.expedition_map ?? null, coarseNow.value),
);
// 🕳️ Les auréoles d'EMBUSCADE — les monstres restés autour d'une faille qui a débordé
// (v0.1009). ⚠️ Horloge GROSSIÈRE : une embuscade dure deux jours, la recalculer à la
// seconde re-diffuserait ces cercles à chaque tick pour rien.
const ambushHalos = computed(() =>
  (char.row?.expedition_map?.ambushes ?? [])
    .filter((a) => a.until > coarseNow.value)
    .map((a) => ({ id: a.id, x: a.x, y: a.y, radius: EXPE.irradMax })),
);
/** Temps restant de l'embuscade qui harcèle le lieu sélectionné (la plus longue). */
const selectedAmbushLeft = computed(() => {
  const p = selected.value;
  if (!p?.riftPeril) return 0;
  const left = (char.row?.expedition_map?.ambushes ?? [])
    .filter((a) => Math.hypot(p.x - a.x, p.y - a.y) <= EXPE.irradMax)
    .map((a) => a.until - coarseNow.value);
  return Math.max(0, ...left);
});
/** Ce que l'escorte emmène — sur la ROUTE comme au REMPART : ses pièces d'équipement.
 *  ⚠️ LA MÊME construction que ce que le store passe au départ (`escortKitOf`) : une
 *  forme rebâtie ici pourrait annoncer un pronostic calculé sur une autre réserve que
 *  celle qui partirait vraiment. Faire partir quelqu’un retire AUSSI ses pièces de la
 *  défense — c’est précisément l’arbitrage que cet écran doit montrer. */
const roadCtx = computed(() => char.escortKit);
const compCtx = roadCtx;
/** QUAND l’armée frappe. ⚠️ Un voyage qui se termine AVANT n’enlève personne à la
 *  bataille : sans cette date, l’alerte se déclenchait aussi pour un convoi de deux
 *  heures face à un siège dans huit (signalé par l’utilisateur). La règle elle-même vit
 *  dans `departureRisk` — ici on ne fait que fournir les deux horodatages.
 *  ⚠️ On compare avec la durée ANNONCÉE, qui est un MAJORANT : les rencontres de route ne
 *  peuvent que raccourcir le retour (`TRAVEL.shortcutReturnMult`/`setbackReturnMult` ≤ 1,
 *  verrouillé par un test) — donc taire l’alerte ne peut jamais taire un vrai danger. */
const raidAt = computed(() => incoming.value?.arrivesAt ?? 0);
/** Le héros défendra-t-il au moment de l’assaut ? ⚠️ Un héros DEHORS qui rentre AVANT
 *  l’assaut défend quand même — même règle que le panneau de la Base, écrite une seule fois
 *  dans `heroDefends`, et lue une seule fois ici pour le convoi ET le groupe. */
const heroDefendsNow = computed(() =>
  heroDefends(!!char.row && char.heroIsHome(char.row), char.row?.expedition?.returnAt, raidAt.value)
    ? fighter.value
    : null,
);
/** Le MÊME calcul, pour le départ du HÉROS. ⚠️ Deux boutons, deux risques : envoyer un
 *  convoi et envoyer le héros ne retirent pas les mêmes défenseurs, et une seule
 *  alerte pour les deux dirait faux à l'un des deux coups. */
const riskHero = computed(() => {
  const b = base.value;
  const p = selected.value;
  const inc = incoming.value;
  if (!b || !inc || !offerHero.value || selectedCamp.value) return null;
  const heroNow = char.row && char.heroIsHome(char.row) ? fighter.value : null;
  if (!heroNow) return null;
  const g = guardUnits(heroLevel.value, freeStable.value, cap.value, compCtx.value);
  return departureRisk(
    b.defenses,
    heroLevel.value,
    inc,
    { hero: heroNow, guard: g },
    { hero: null, guard: g },
    p ? { backAt: coarseNow.value + roundTripMin(p) * 60_000, raidAt: raidAt.value } : undefined,
  );
});
const freeAdvs = computed(() => char.advList.filter((a) => advAvailable(a, now.value)));
/** ⚠️ Le MÊME vivier disponible, mais STABLE d'une seconde à l'autre : `freeAdvs` rend un
 *  nouveau tableau à chaque tick, et tout ce qui en dépend (pronostics de siège ~13 ms, % de
 *  victoire d'un camp) se recalculerait 60 fois par minute pour le même résultat. La clé est
 *  une CHAÎNE : elle ne déclenche ses dépendants que lorsqu'un aventurier part ou revient. */
const freeKey = computed(() => freeAdvs.value.map((a) => a.id).join('|'));
const freeStable = computed(() => {
  const ids = new Set(freeKey.value.split('|'));
  return char.advList.filter((a) => ids.has(a.id));
});
/** 🗿 COMBIEN DE CHAMPIONS ON ENGAGE À LA FOIS (`engageCap`) — la taille maximale d'un
 *  groupe ou d'une escorte, et le nombre de défenseurs au rempart. ⚠️ Nommé une seule fois :
 *  le bouton d'envoi, le risque de départ et le store doivent parler du même plafond. */
const cap = computed(() => engageCap(char.pantheonLevel));
/** 🎯 Les champions libres, dans l’ordre d’affichage (lettre puis rang). ⚠️ Pour l’ÉCRAN et
 *  « Tout le vivier » seulement : `freeStable` garde l’ordre du vivier pour le reste. */
const freeSorted = computed(() => sortByGradeThenRank(freeStable.value));
/** Créneaux de convoi libres — ⚠️ UN SEUL pool avec les groupes partis SANS le héros
 *  (`convoySlotsFree`, même règle que le store). */
const vansLeft = computed(() => convoySlotsFree(char.comptoirLevel, char.partyList, now.value));
/** Temps de convalescence restant du héros (0 = disponible). ⚠️ Il manquait ici : la carte
 *  laissait repartir un héros blessé, seul l'écran Aventure le bloquait. */
const heroHealIn = computed(() => woundRemainingMs(char.row?.base, now.value));
/** Le héros ne peut pas partir : il est sur la route, OU à l'infirmerie. */
const heroUnavailable = computed(() => !!active.value || heroHealIn.value > 0);
/** Ce que ce lieu accepte MAINTENANT — la regle vit dans `caravan.ts`, pas dans un v-if.
 *  Le panneau etait entierement garde par « le heros est disponible », donc un convoi
 *  devenait impossible des que le heros partait : exactement quand on en a besoin. */
const offers = computed(() =>
  selected.value
    ? poiOffers(selected.value, {
        heroAway: heroUnavailable.value,
        comptoirLevel: char.comptoirLevel,
        advsAvailable: freeAdvs.value.length,
        slotsFree: vansLeft.value,
      })
    : { hero: false, caravan: false, party: false },
);
/** Les mêmes offres, en BOOLÉENS : `offers` rend un nouvel objet à chaque tick, un booléen
 *  ne réveille ses dépendants (les pronostics coûteux) que s'il change vraiment. */
const offerHero = computed(() => offers.value.hero);
// ── ⚔️ CAMPS DE FACTION : un GROUPE (héros oui/non + autant d'aventuriers qu'on veut) ──
// Toute la règle vit dans `camp.ts` (combat, pronostic, trajet, qui peut partir) ; l'écran
// ne fait que la montrer. ⚠️ Le héros n'attaque plus un camp par `expeSend` (le store le
// refuse) : même seul, il y passe par `sendParty`.
const selectedCamp = computed(() => (selected.value ? campSpecOf(selected.value) : null));
/** 🛡️ Les gardes d'un lieu de récolte (2026-09-22) — même force qu'un petit camp. */
const selectedGuard = computed(() => (selected.value ? harvestGuardOf(selected.value) : null));
/** ⚔️ Ce que le lieu ALIGNE — camp ou gardes, la dispatch de `poiForceOf`, jamais recopiée. */
const selectedForce = computed(() => (selected.value ? poiForceOf(selected.value) : null));
/** Le rang du lieu sélectionné — la MÊME fonction que la boule sur la carte. */
const selectedRank = computed(() => poiRank(selected.value!));

// ── 🕳️ FAILLE : ce qu'on en sait AVANT d'y entrer ──
// ⚠️ LE RANG EST FIGÉ À L'APPARITION, il ne monte PAS avec l'âge. Il dérive du niveau du
// lieu (donc de sa distance, v0.683) par `characterRank` — la même échelle que le héros et
// les classes d'aventurier, parce que tout le jeu parle en rangs depuis la v0.874. Ce qui
// monte jusqu'au 7ᵉ jour, c'est l'EFFECTIF (`riftPopulation`, courbe accélérée) : deux axes
// distincts, et les mélanger rendrait une faille mûre infranchissable (cf. v0.923).
const selectedRift = computed(() => {
  const p = selected.value;
  if (!p || !isRiftPoi(p)) return null;
  // Son RANG s'affiche à côté du nom, comme pour tout lieu (`selectedRank`).
  return {
    faction: riftSpecOf(p).faction,
    foes: riftPopulation(p, now.value),
    maxFoes: RIFT.maxFoes,
    overflowIn: riftOverflowAt(p) - now.value,
    /** Ce que la REFERMER rapporte, gardien compris — annoncé avant d’entrer. */
    clearMana: riftClearMana(p),
  };
});
/** ⚔️🕳️ Ce lieu s’attaque-t-il en GROUPE ? Un camp ou une faille. ⚠️ UNE seule définition,
 *  lue par le bloc de groupe, la note d’état vide et le risque de départ : trois conditions
 *  écrites séparément finiraient par ne plus désigner les mêmes lieux. */
const selectedWarband = computed(() => {
  const p = selected.value;
  if (!p || !isWarbandPoi(p)) return null;
  const army = warbandArmy(p, progress.global.value.level);
  return {
    faction: army.faction,
    size: army.groups.reduce((s, g) => s + g.count, 0),
    gone: p.expiresAt - now.value,
    // ⚠️ L'interception ne lève le renfort QUE tant que le marquage n'a pas été consommé
    // par le tirage de l'armée : une fois détectée, elle garde la force annoncée.
    utile: !!char.row?.base?.overflow,
  };
});
/** 🏰 L'état VIVANT du point de contrôle sélectionné (la sélection garde un instantané). */
const liveControl = computed(() => {
  const id = selected.value?.id;
  return id ? (char.row?.expedition_map?.pois.find((p) => p.id === id)?.control ?? null) : null;
});
const livePoi = computed(() =>
  selected.value
    ? (char.row?.expedition_map?.pois.find((p) => p.id === selected.value!.id) ?? null)
    : null,
);
/** 🏰 Qui occupe le point : la garnison (arrivée), puis les renforts en route. */
const controlMembers = computed(() => {
  const c = liveControl.value;
  if (!c) return [];
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  const rows = [
    ...c.garrison.map((id) => ({ id, arriveIn: 0 })),
    ...(c.reinforcing ?? []).map((r) => ({ id: r.id, arriveIn: Math.max(0, r.at - now.value) })),
  ];
  return rows.flatMap((r) => {
    const adv = byId.get(r.id);
    return adv ? [{ adv, arriveIn: r.arriveIn }] : [];
  });
});
/** 🛡️ Les miliciens du point : postés, puis en route (ils ne sont pas des champions, donc
 *  absents de `controlMembers`). */
const controlMilitia = computed(() => {
  const c = liveControl.value;
  if (!c) return [];
  return [
    ...militiaIn(c.garrison).map((id) => ({ id, arriveIn: 0 })),
    ...(c.reinforcing ?? [])
      .filter((r) => isMilitiaId(r.id))
      .map((r) => ({ id: r.id, arriveIn: Math.max(0, r.at - now.value) })),
  ];
});
const controlCount = computed(() => controlMembers.value.length + controlMilitia.value.length);
const controlFree = computed(() => controlFreeSeats(liveControl.value));
/** Les sélections de la fiche : qui ramener, qui envoyer en renfort. ⚠️ Déclarées AVANT le
 *  stepper de milice, dont le `watch` les lit dès le setup (zone morte temporelle sinon). */
const ctlRecallSel = ref<string[]>([]);
const ctlReinfSel = ref<string[]>([]);
/** 🛡️ Combien de miliciens partent en renfort (stepper), borné par leurs places à eux sur ce
 *  point (ce qui reste de la garnison de 5, champions compris) et par ceux de la base. */
const milHome = computed(() => char.row?.base?.militia?.home ?? 0);
const militiaBuilt = computed(() => buildingLevel(char.row?.buildings ?? [], 'barracks') > 0);
const milSend = ref(0);
const milSendMax = computed(() =>
  Math.max(0, Math.min(milHome.value, militiaFreeSeats(liveControl.value))),
);
/** Toucher la N-ième tuile en choisit N ; retoucher la dernière choisie en retire une. */
function pickMilitia(i: number) {
  milSend.value = i === milSend.value ? i - 1 : Math.min(i, milSendMax.value);
}
watch(milSendMax, (m) => {
  if (milSend.value > m) milSend.value = m;
});
const militiaLegMin = computed(() => {
  const p = livePoi.value;
  return p ? caravanLegMin(p, [], 0, travelMult.value) : 0;
});
async function sendMilitia() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || milSend.value <= 0 || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    const n = milSend.value;
    const why = await char.sendMilitiaToControl(uid, p.id, n, Date.now());
    if (why) $q.notify({ type: 'warning', message: `Renfort impossible : ${why}` });
    else {
      milSend.value = 0;
      $q.notify({
        type: 'positive',
        message: `🛡️ ${n} milicien${n > 1 ? 's' : ''} en route — arrivée dans ${formatDurationMin(militiaLegMin.value)}`,
      });
    }
  } finally {
    ctlBusy.value = false;
  }
}
watch(
  () => selected.value?.id,
  () => {
    ctlRecallSel.value = [];
    ctlReinfSel.value = [];
    milSend.value = 0;
  },
);
function toggleRecall(id: string) {
  const s = ctlRecallSel.value;
  ctlRecallSel.value = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
}
/** ⚠️ Jamais plus que les places libres : la tuile de trop ne répond pas. */
function toggleReinf(id: string) {
  const s = ctlReinfSel.value;
  if (s.includes(id)) ctlReinfSel.value = s.filter((x) => x !== id);
  else if (s.length < controlFree.value) ctlReinfSel.value = [...s, id];
}
/** Le trajet des renforts choisis — la MÊME règle que le store (`partyLegMin`). */
const reinforceLegMin = computed(() => {
  const p = livePoi.value;
  const escort = char.advList.filter((a) => ctlReinfSel.value.includes(a.id));
  if (!p || !escort.length) return 0;
  return partyLegMin(p, escort, {
    hero: false,
    travelMult: travelMult.value,
    gearSpeed: advGearRoles(escort, char.advGearStock).speed,
  });
});
/** ⇄ Les autres points TENUS vers lesquels transférer la sélection : le trajet (la règle du
 *  store — `legFromSpot`, champions à leur pas, miliciens au pas d'une équipe sans rôle, le
 *  plus lent des deux) et la raison d'un refus (`transferBlocker`). */
const transferTargets = computed(() => {
  const map = char.row?.expedition_map;
  const from = livePoi.value;
  const ids = ctlRecallSel.value;
  if (!map || !from || !ids.length || from.control?.owner !== 'player') return [];
  const champs = char.advList.filter((a) => ids.includes(a.id));
  const hasMil = ids.some((id) => isMilitiaId(id));
  return map.pois
    .filter((p) => p.id !== from.id && p.control?.owner === 'player')
    .map((p) => {
      const why = transferBlocker(map, from.id, p.id, ids);
      const champMin = champs.length
        ? legFromSpot(p, from, (q) =>
            partyLegMin(q, champs, {
              hero: false,
              travelMult: travelMult.value,
              gearSpeed: advGearRoles(champs, char.advGearStock).speed,
            }),
          )
        : 0;
      const milMin = hasMil
        ? legFromSpot(p, from, (q) => caravanLegMin(q, [], 0, travelMult.value))
        : 0;
      return {
        id: p.id,
        emo: CONTROL_EMO[p.control!.kind],
        label: CONTROL_LABEL[p.control!.kind],
        free: militiaFreeSeats(p.control),
        min: Math.max(champMin, milMin),
        why: why ? TRANSFER_BLOCK_LABEL[why] : null,
      };
    });
});
async function transferCtl(toId: string) {
  const uid = auth.user?.id;
  const from = livePoi.value;
  const ids = ctlRecallSel.value;
  const t = transferTargets.value.find((x) => x.id === toId);
  if (!uid || !from || !ids.length || !t || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    const why = await char.transferControlGarrison(
      uid,
      from.id,
      toId,
      ids,
      Date.now(),
      heroLevel.value,
    );
    if (why) $q.notify({ type: 'warning', message: `Transfert impossible : ${why}` });
    else {
      ctlRecallSel.value = [];
      $q.notify({
        type: 'positive',
        message: `⇄ En route vers ${t.label} — arrivée dans ${formatDurationMin(t.min)}`,
      });
    }
  } finally {
    ctlBusy.value = false;
  }
}
async function releaseCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  const ids = ctlRecallSel.value;
  if (!uid || !p || !ids.length || ctlBusy.value) return;
  if (ids.length >= controlCount.value) return recallCtl();
  ctlBusy.value = true;
  try {
    await char.releaseControlChampions(uid, p.id, ids, Date.now(), heroLevel.value);
    ctlRecallSel.value = [];
  } finally {
    ctlBusy.value = false;
  }
}
async function reinforceCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || !ctlReinfSel.value.length || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    const why = await char.reinforceControlPoint(uid, p.id, ctlReinfSel.value, Date.now());
    if (why) $q.notify({ type: 'warning', message: `Renfort impossible : ${why}` });
    else ctlReinfSel.value = [];
  } finally {
    ctlBusy.value = false;
  }
}
/** ⏳ Un temps de production en heures, lisible (« 18 h 28 », pas « 18,4615… h ») ; « — »
 *  sans production. */
const hoursLabel = (h: number | null) => (h === null ? '—' : formatDuration(h * 3600_000));
/** 🏰 Ce que le point produit, en une ligne, selon ce qu'il est. */
const controlProd = computed(() => {
  const p = livePoi.value;
  const c = liveControl.value;
  if (!p || !c) return '';
  switch (c.kind) {
    case 'mine':
      return `⛏️ ${controlRate.value.toLocaleString('fr-FR')} 🪙/h · réserve ${controlGold.value.toLocaleString('fr-FR')} 🪙 (24 h au plus)`;
    case 'training':
      return `🎯 +${Math.round(trainingXpPerHour(heroLevel.value))} XP/h par champion, pour chacun selon son temps ici`;
    case 'garden':
      return `🌿 ${gardenStock(p, now.value)} consommable(s) cueilli(s) · 1 toutes les ${hoursLabel(gardenHoursFor(c.garrison.length))}`;
    case 'scriptorium':
      return runeStock(p, now.value) > 0
        ? '📜 Une rune t’attend — récupère-la pour que la copie suivante commence'
        : `📜 Rune en cours de copie : ${Math.round(runeProgress(p, now.value) * 100)} % · 1 toutes les ${hoursLabel(runeHoursFor(c.garrison.length))} (${c.garrison.length}/${seatsOf('scriptorium')} copistes, ${hoursLabel(runeHoursFor(seatsOf('scriptorium')))} au complet)`;
    case 'forge':
      return `⚒️ +${Math.round(forgeXpPerHour(heroLevel.value))} XP/h par pièce portée, pour chaque champion selon son temps ici`;
    case 'tower':
      return `🗼 Trajets de toutes tes expéditions × ${controlTravelMult(char.row?.expedition_map).toFixed(2).replace('.', ',')}, après l’Avant-poste`;
  }
});
/** ⚒️🎯 Une jauge par champion, à la forge (XP par pièce) comme au camp d'entraînement (XP
 *  pour lui) : ce qu'il attend, et le temps de présence que ça représente — pleine à 24 h.
 *  Un champion ramené garde sa ligne tant que sa réserve n'est pas récoltée. */
const forgeGauges = computed(() => {
  const p = livePoi.value;
  if (!p || !isPerChampKind(p.control?.kind) || p.control.owner !== 'player') return [];
  const by = champStockBy(p, now.value, heroLevel.value);
  const names = new Map(char.advList.map((a) => [a.id, a.name]));
  const full =
    champHoursOf(p, 1, heroLevel.value) > 0
      ? CONTROL.storageMs / 3600_000 / champHoursOf(p, 1, heroLevel.value)
      : 0;
  return Object.entries(by)
    .filter(([id, v]) => p.control!.garrison.includes(id) || v >= 1)
    .map(([id, v]) => {
      const h = champHoursOf(p, v, heroLevel.value);
      return {
        id,
        name: (p.control!.garrison.includes(id) ? '' : '↩ ') + (names.get(id) ?? '?'),
        xp: Math.floor(v + 1e-9).toLocaleString('fr-FR'),
        pct: full > 0 ? Math.min(100, (v / full) * 100) : 0,
        time: h >= 1 ? `${Math.floor(h)} h` : `${Math.floor(h * 60)} min`,
      };
    });
});
/** 🎯 Le plafond du camp, dit AVANT qu'on s'étonne que personne ne monte plus. */
const controlNote = computed(() => {
  if (liveControl.value?.kind === 'scriptorium')
    return 'La couleur de la rune suit le rang du lieu face au tien : un Scriptorium de ton rang copie plus souvent des bleues et des violettes. Le copiste n’apprend rien.';
  if (liveControl.value?.kind === 'forge')
    return 'Les champions n’apprennent rien ici : seules leurs pièces portées progressent, jusqu’au ★5 de leur rang et au niveau de leur porteur. Utile quand un champion bute sur son plafond. Chaque champion a sa jauge, pleine après 24 h sur place ; ↩ = ramené, sa part attend la récolte.';
  if (liveControl.value?.kind !== 'training') return '';
  const cap = trainingCapLevel(heroLevel.value);
  if (!cap)
    return '⚠️ Ton héros est Bronze : le camp n’entraîne que sous ton rang — monte d’abord.';
  const r = characterRank(cap);
  return `Plafond : ${r.emoji} ${r.name} ★5 (le rang juste sous le tien). Chaque champion a sa jauge, pleine après 24 h sur place ; ↩ = ramené, sa part attend la récolte.`;
});
const controlReady = computed(() => {
  const p = livePoi.value;
  if (!p) return false;
  return (
    controlGold.value > 0 ||
    trainingStock(p, now.value, heroLevel.value) > 0 ||
    forgeStock(p, now.value, heroLevel.value) > 0 ||
    runeStock(p, now.value) > 0 ||
    gardenStock(p, now.value) > 0
  );
});
const controlCollectLabel = computed(() => {
  const p = livePoi.value;
  const k = liveControl.value?.kind;
  if (!p || !k) return '';
  if (k === 'mine') return `Récolter ${controlGold.value.toLocaleString('fr-FR')} 🪙`;
  if (k === 'training') return 'Faire progresser (chacun sa réserve)';
  if (k === 'forge') return 'Forger (chacun sa réserve)';
  if (k === 'scriptorium') return 'Récupérer la rune';
  return `Cueillir ${gardenStock(p, now.value)} consommable(s)`;
});
const controlRate = computed(() =>
  livePoi.value && liveControl.value
    ? Math.round(
        controlGoldPerHour(livePoi.value, liveControl.value.garrison.length, heroLevel.value),
      )
    : 0,
);
const controlGold = computed(() =>
  livePoi.value ? controlStock(livePoi.value, now.value, heroLevel.value) : 0,
);
const ctlBusy = ref(false);
async function collectCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    const got = await char.collectControlPoint(uid, p.id, Date.now(), heroLevel.value);
    // 🧺 Consommables et runes jaillissent du panier (l'or a son propre éclat).
    if (got) celebrateHarvest(p, got);
  } finally {
    ctlBusy.value = false;
  }
}
/** 🧺 L'animation de récolte d'une place forte. Une rune dit où la poser : c'est le seul
 *  moment où on la voit. */
function celebrateHarvest(p: Poi, got: { supplies: SupplyStock; runes: RuneTier[] }) {
  const kind = p.control?.kind;
  const where = kind ? CONTROL_LABEL[kind] : 'Place forte';
  gameFx.celebrateHarvest(
    got.supplies,
    got.runes,
    got.runes.length ? `${where} · runes à poser depuis la fiche d’un champion` : where,
  );
}
async function recallCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  const ok = await new Promise<boolean>((res) =>
    $q
      .dialog({
        title: 'Rappeler la garnison ?',
        message:
          'La réserve est récoltée et tes champions rentrent. La mine reste à toi, mais sans défense : l’ennemi la reprendra à sa prochaine attaque, sauf si un renfort arrive avant.',
        cancel: true,
      })
      .onOk(() => res(true))
      .onCancel(() => res(false))
      .onDismiss(() => res(false)),
  );
  if (!ok) return;
  ctlBusy.value = true;
  try {
    const got = await char.recallControl(uid, p.id, Date.now(), heroLevel.value);
    if (got) celebrateHarvest(p, got);
    selected.value = null;
  } finally {
    ctlBusy.value = false;
  }
}
/** Les lieux qui ne se prennent QU'EN équipe (camp, faille, armée). */
const teamOnly = computed(
  () => !!selectedCamp.value || !!selectedRift.value || !!selectedWarband.value,
);
/** 👥 Une équipe peut partir ici : les lieux « d'équipe » ET les lieux de récolte. */
const partyTarget = computed(
  () => teamOnly.value || (!!selected.value && HARVEST_TYPES.has(selected.value.type)),
);

/** 🧿 Le sceau de brèche : combien il en reste, et le poser sur la faille ouverte. */
const sealStock = computed(() => char.row?.supplies.sceau ?? 0);
const busySeal = ref(false);
async function doSeal() {
  const uid = auth.user?.id;
  const p = selected.value;
  if (!uid || !p || busySeal.value) return;
  busySeal.value = true;
  try {
    const refused = await char.sealRiftPoi(uid, p.id);
    $q.notify(
      refused
        ? { type: 'negative', message: `Sceau impossible : ${refused}.` }
        : { type: 'positive', message: '🧿 La faille est scellée : 24 h de répit.' },
    );
  } finally {
    busySeal.value = false;
  }
}

/** 🎒 Ce qu'un voyage ramènera : ses devises (`haulPills`, la même lecture que la boîte 📬)
 *  et le nombre d'objets. L'issue est tirée au DÉPART, donc elle est déjà connue. */
function expeHaul(o: {
  gold?: number;
  energy?: number;
  summonStones?: number;
  key?: number;
  mana?: number;
  item?: unknown;
  items?: unknown[];
}): { emoji: string; n: number }[] {
  const pills = haulPills(o);
  const objets = o.items?.length ?? (o.item ? 1 : 0);
  return objets > 0 ? [...pills, { emoji: '🎒', n: objets }] : pills;
}
/** ⚔️ Les GROUPES partis sans le héros, situés comme le héros (`travelPosition`). ⚠️ Un groupe AVEC le
 *  héros vit dans `expedition` : c'est le tracé du héros qui le montre. */
const partiesOnMap = computed(() =>
  char.partyList
    .filter((g) => now.value < g.returnAt)
    .map((g) => ({
      id: g.id,
      poi: g.poi,
      escort: g.outcome.party?.escort.length ?? 0,
      members: g.outcome.party?.escort ?? [],
      hero: !!g.outcome.party?.hero,
      haul: expeHaul(g.outcome),
      origin: g.origin,
      at: drawnAt(g),
      prog: voyageProgress(g, now.value),
    })),
);
/**
 * ⚔️ LES BANDES QU'ON VA INTERCEPTER, en marche vers le point de rencontre. Le voyage garde
 * la bande À LA RENCONTRE (`interceptLeg`) avec sa faille d'origine (`from`) : sa position
 * du moment se relit donc par `warbandAt`, la formule de sa marche sur la carte. Les deux
 * colonnes arrivent ensemble au point de rencontre (`midAt`) — là, la bataille a lieu.
 */
const bandsOnMap = computed(() => {
  const voyages = [
    ...(active.value ? [{ id: 'hero', v: active.value }] : []),
    ...char.partyList.map((g) => ({ id: g.id, v: g })),
  ];
  return voyages
    .filter(({ v }) => v.poi.type === 'warband' && !!v.poi.from && now.value < v.midAt)
    .map(({ id, v }) => {
      const at = warbandAt(v.poi, now.value);
      return {
        id,
        x: at.x,
        y: at.y,
        meetX: v.poi.x,
        meetY: v.poi.y,
        emo: FACTION_EMOJI[v.poi.faction ?? 'bandits'],
      };
    });
});
/** 🛡️ Les RENFORTS en route vers un point tenu (demandé par l'utilisateur : « quand j'envoie
 *  du renfort il faut que je le voie sur la carte »). Aller simple : ils restent sur le point,
 *  donc ils disparaissent de la carte à leur arrivée — la garnison du point prend le relais. */
const reinforcementsOnMap = computed(() =>
  reinforcementsEnRoute(char.row?.expedition_map, now.value).map((r) => ({
    id: 'r' + r.key,
    poi: r.poi,
    members: r.members,
    origin: r.origin,
    at: drawnAt(r),
    prog: voyageProgress(r, now.value),
    arriveIn: r.midAt - now.value,
  })),
);
/** 🏠 Les champions et miliciens RAMENÉS d'un point, sur le chemin de la base (demandé :
 *  « qu'ils se voient sur la carte »). Retour simple : le trajet part du point. */
const returnsOnMap = computed(() =>
  returnsEnRoute(char.row?.expedition_map, now.value).map((r) => ({
    id: 'h' + r.key,
    poi: r.poi,
    members: r.members,
    // Un retour rentre toujours à la ville : son tracé part d'elle.
    origin: undefined as { x: number; y: number } | undefined,
    at: drawnAt(r),
    pct: voyageProgress(r, now.value).overall * 100,
    arriveIn: r.returnAt - now.value,
  })),
);
/** Tout ce qui voyage sans le héros, pour la carte : même tracé, l'emoji dit qui. */
const travelersOnMap = computed(() => [
  ...partiesOnMap.value.map((g) => ({ ...g, emo: '⚔️', kind: 'party' as const })),
  ...reinforcementsOnMap.value.map((r) => ({ ...r, emo: '🛡️', kind: 'reinf' as const })),
  ...returnsOnMap.value.map((r) => ({ ...r, emo: '🏠', kind: 'reinf' as const })),
]);
/** Tout ce qui voyage : le héros puis les groupes. Une seule liste, sinon la rangée se
 *  lirait comme plusieurs rangées collées. */
const trips = computed(() => {
  const out: MapTrip[] = [];
  const a = active.value;
  const h = hero.value;
  if (a && h) {
    const back = h.phase === 'return';
    out.push({
      key: 'hero',
      kind: 'hero',
      who: '🧝',
      poi: a.poi,
      time: tripTimeLabel(h).time,
      pct: heroProg.value.overall * 100,
      back,
      withHero: true,
      members: a.outcome.party?.escort ?? [],
      haul: expeHaul(a.outcome),
      title: `Ton héros — ${POI_LABEL[a.poi.type]} niv ${a.poi.level}${a.outcome.party?.escort.length ? ` · avec ${a.outcome.party.escort.length} champion(s)` : ''} · ${tripTimeLabel(h).untilHome}`,
    });
  }
  for (const g of partiesOnMap.value) {
    const back = g.at.phase === 'return';
    out.push({
      key: 'g' + g.id,
      kind: 'van',
      who: '⚔️',
      poi: g.poi,
      time: tripTimeLabel(g.at).time,
      pct: g.prog.overall * 100,
      back,
      withHero: g.hero,
      members: g.members,
      haul: g.haul,
      title: `Groupe — ${POI_LABEL[g.poi.type]} niv ${g.poi.level} · ${g.escort} champion${g.escort > 1 ? 's' : ''} · ${tripTimeLabel(g.at).untilHome}`,
    });
  }
  for (const r of reinforcementsOnMap.value) {
    const who = crewLabel(r.members);
    out.push({
      key: r.id,
      kind: 'van',
      who: '🛡️',
      poi: r.poi,
      time: formatDuration(r.arriveIn),
      pct: r.prog.overall * 100,
      back: false,
      withHero: false,
      members: r.members,
      haul: [],
      title: `Renfort — ${POI_LABEL[r.poi.type]} niv ${r.poi.level} · ${who} · arrivée dans ${formatDuration(r.arriveIn)}`,
    });
  }
  for (const r of returnsOnMap.value) {
    out.push({
      key: r.id,
      kind: 'van',
      who: '🏠',
      poi: r.poi,
      time: `↩ ${formatDuration(r.arriveIn)}`,
      pct: r.pct,
      back: true,
      withHero: false,
      members: r.members,
      haul: [],
      title: `Retour de ${POI_LABEL[r.poi.type]} niv ${r.poi.level} · ${crewLabel(r.members)} · à la base dans ${formatDuration(r.arriveIn)}`,
    });
  }
  return out;
});
/** « 2 champions + 1 milicien » : un milicien n'est pas un champion, on le dit. */
function crewLabel(members: readonly string[]): string {
  const nMil = militiaIn(members).length;
  const nAdv = members.length - nMil;
  return [
    nAdv ? `${nAdv} champion${nAdv > 1 ? 's' : ''}` : '',
    nMil ? `${nMil} milicien${nMil > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' + ');
}
/** 🔴 Le voyage qu'on a touché : sa tuile et son lieu sur la carte portent un halo ;
 *  retoucher la même tuile les éteint. Un voyage qui se termine emporte son halo
 *  (`focusPoi` ne le retrouve plus). */
const focusTrip = ref<string | null>(null);
const focusPoi = computed(() => trips.value.find((t) => t.key === focusTrip.value)?.poi ?? null);
// La carte raccourcit quand des voyages sont en cours (.with-trips) : on remesure, sinon
// les flèches de bord se calent sur l'ancienne hauteur.
watch(
  () => trips.value.length > 0,
  () => void nextTick(measure),
);

const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionMessage | null>(null);
/** 🕳️ Rapport d'incursion à rejouer (cf. `RiftReplayDialog`). */
const riftReplay = ref<PartyResult | null>(null);
// ▶️ Il se lance aussi tout seul : à l'arrivée sur la faille, ou à la prochaine ouverture.
const riftAutoMsgId = useRiftAutoReplay(riftReplay);
/** 📜 Fin d'un rejeu AUTOMATIQUE : « Voir le rapport » ouvre la fenêtre de CE rapport. */
function openRiftReport() {
  const id = riftAutoMsgId.value;
  const m = id ? (char.row?.messages ?? []).find((x) => x.id === id) : undefined;
  if (!m) return; // lancé depuis le rapport déjà ouvert : fermer suffit
  lastOutcome.value = m;
  collectOpen.value = true;
}
// 🕳️💥 Un débordement de faille se montre aussi tout seul — après les incursions.
const { ovfMsg, ovfAutoId } = useOverflowReplay(computed(() => !!riftReplay.value));
function openOvfReport() {
  const id = ovfAutoId.value;
  const m = id ? (char.row?.messages ?? []).find((x) => x.id === id) : undefined;
  if (!m) return;
  lastOutcome.value = m;
  collectOpen.value = true;
}
/** Le rapport ouvert attend-il d'être encaissé ? (sinon la modale n'est qu'un compte rendu) */
const lastPending = computed(() => !!lastOutcome.value && lastOutcome.value.claimed === false);
/** 🎁 Un retour d'expédition est ENCAISSÉ TOUT SEUL (`expeAutoClaim`, dans `lifecycle`) : la
 *  modale s'ouvre alors en simple compte rendu de ce qui vient d'être crédité — dans les deux
 *  cas qui comptent : le héros rentre pendant qu'on regarde la carte, ou on arrive par la
 *  notification « ton héros est rentré ». */
function showReturned(done: NonNullable<Awaited<ReturnType<typeof char.expeClaim>>>) {
  advXpFx.show(done.advTracks);
  celebrateTopDrop(done);
  if (collectOpen.value) return;
  lastOutcome.value = { ...done, claimed: true };
  collectOpen.value = true;
}

// ── Filons de production (village autour de la ville) ──
/** Un lieu est GRISÉ quand plus rien ne peut y être envoyé — jamais parce que le
 *  héros est simplement occupé. ⚠️ La carte grisait TOUT dès son départ, y compris les
 *  lieux de récolte où un convoi peut parfaitement aller : le gris disait « indisponible »
 *  d'endroits disponibles, et l'utilisateur a logiquement cessé d'essayer de cliquer.
 *  Même source que la feuille (`poiOffers`) : les deux ne peuvent pas se contredire. */
function dimmed(p: Poi): boolean {
  const o = poiOffers(p, {
    heroAway: heroUnavailable.value,
    comptoirLevel: char.comptoirLevel,
    advsAvailable: freeAdvs.value.length,
    slotsFree: vansLeft.value,
  });
  // 👥 Un lieu reste ouvert tant que le HÉROS SEUL ou une ÉQUIPE peut y aller (2026-09-21 :
  // les équipes remplacent les convois). Même règle que le test « ce qui est GRISÉ ».
  // 🏰 Un point de contrôle TENU se gère (récolte, rappel) : jamais grisé.
  if (p.control?.owner === 'player') return false;
  return !o.hero && !o.party;
}

/** 🗂️ La liste des points fixes (icône au-dessus du dézoom). Les équipes en marche pour
 *  prendre un point viennent des groupes (`partyList`) : elles restent en garnison à
 *  l'arrivée (`midAt`). */
const ctlListOpen = ref(false);
const ctlRoster = computed(() =>
  controlRoster(
    char.row?.expedition_map,
    char.partyList.map((g) => ({
      poiId: g.poi.id,
      midAt: g.midAt,
      ids: g.outcome.party?.escort ?? [],
    })),
    coarseNow.value,
    heroLevel.value,
  ),
);
/** Combien de points appellent : attaque imminente, sans défense, butin à récolter. */
const ctlCalls = computed(
  () =>
    ctlRoster.value.filter((r) => r.status === 'imminent' || r.status === 'empty' || r.ready)
      .length,
);
function openFromList(p: Poi) {
  ctlListOpen.value = false;
  panToPoi(p);
  selectPoi(p);
}

function selectPoi(p: Poi) {
  // ⚠️ On sélectionne MÊME si le héros est en expédition : un convoi part sans lui.
  // Ce qui est ouvert ou non se décide dans la feuille, via `poiOffers`.
  selected.value = p;
  // ⚠️ La carte occupe 62vh et la feuille vit SOUS elle, dans le flux : sur un téléphone
  // elle s'ouvre donc hors écran, et cliquer un lieu semble ne rien faire.
  void nextTick(() => sheetEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

// % de victoire (Monte-Carlo) contre l'adversaire du POI.
const winPct = computed(() => {
  const p = selected.value;
  if (!p || HARVEST_TYPES.has(p.type) || p.type === 'arena') return 100; // récolte : ses gardes se jugent au 🎯 de l’équipe
  const foe = poiCombatant(p.level, p.type);
  let w = 0;
  for (let s = 0; s < 40; s++)
    if (simulateCombat(fighter.value, foe, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return Math.round((w / 40) * 100);
});
// Arène : estimation du nombre de vagues tenues (moyenne Monte-Carlo).
const arenaWaves = computed(() => {
  const p = selected.value;
  if (!p || p.type !== 'arena') return 0;
  let sum = 0;
  for (let s = 0; s < 24; s++) sum += simulateArena(fighter.value, p.level, s * 977 + 3);
  return Math.round(sum / 24);
});
/**
 * 🗂️ LES CARACTÉRISTIQUES D'UN LIEU, légendées, pour la fiche (demandé : « toutes ses infos
 * dans une grande tuile »). ⚠️ AUCUNE RÈGLE ICI : chaque valeur est lue dans un `computed`
 * déjà présent (le même que l'envoi applique) — on ne fait que les RANGER. Deux valeurs
 * dynamiques suivent la composition de l'équipe (aller-retour et réussite).
 */
const poiFacts = computed<PoiFact[]>(() => {
  const p = selected.value;
  if (!p) return [];
  const out: PoiFact[] = [];
  const rift = selectedRift.value;
  const band = selectedWarband.value;
  const guard = selectedGuard.value;
  // 👾 Faction et nombre d'ennemis vivent sur la ligne sous le nom (`poiSub`).
  const force = selectedForce.value;
  // 💰 CE QU'ON RAMÈNE, EN QUANTITÉ (v0.1265, demandé : « pas la production, juste la quantité
  // récupérable ») — la récolte + ce que portent les gardes (`poiHaulPreview`, les MÊMES
  // fonctions que la résolution). Le détail (filon, bourses) passe dans l'info-bulle. Ce
  // qu'ajoute l'équipe (bâts 🧺, porteurs 🐫) : la base, puis « avec cette équipe »
  // (`poiTeamHaul`). Une faille
  // l'annonce déjà (« Si refermée »).
  if (!rift) pushHaul(out, p, force ?? null);
  if (force) {
    const l = forceLootPreview(p, force);
    if (l.supplies)
      out.push({
        icon: '🎒',
        label: 'Consommables',
        value: `~${l.supplies.toFixed(1).replace('.', ',')}`,
        title: 'Ce qu’on dépèce sur les bêtes abattues, en moyenne',
      });
  }
  if (rift) {
    out.push({
      icon: '⏳',
      label: 'Déborde dans',
      value: formatDuration(rift.overflowIn),
      title:
        "À maturité, elle déborde : embuscade autour d'elle deux jours, armée vers ta base, mine de mana",
    });
    out.push({
      icon: '💠',
      label: 'Si refermée',
      value: `~${rift.clearMana}`,
      title: 'Mana si tu la refermes — gardien compris',
    });
    // ⬆️ Au-dessus du joueur (v0.980) : le rang peut être le même en début de partie.
    if (p.level > heroLevel.value)
      out.push({
        icon: '⬆️',
        label: 'Au-dessus de toi',
        value: `+${p.level - heroLevel.value} niv.`,
        cls: 'warn',
        title: 'Faille au-dessus de ton niveau : plus dure, et plus de mana',
      });
  }
  if (band) {
    out.push({
      icon: '⏳',
      label: 'Disparaît dans',
      value: formatDuration(band.gone),
      title: 'Passé ce délai elle a rejoint son armée : plus rien à intercepter',
    });
  }
  // Le héros seul.
  if (offers.value.hero && !partyTarget.value) {
    out.push({
      icon: '⏱️',
      label: 'Trajet',
      value: formatDurationMin(roundTripMin(p)),
      go: true,
      title: 'Aller-retour du héros',
    });
    if (p.type === 'arena')
      out.push({
        icon: '🌊',
        label: 'Vagues',
        value: `~${arenaWaves.value}`,
        go: true,
        title: 'Vagues tenues',
      });
    else if (!HARVEST_TYPES.has(p.type))
      out.push({
        icon: '🎯',
        label: 'Réussite',
        value: `${winPct.value} %`,
        go: true,
        title: 'Chance de réussite du héros seul',
        cls: winClass(winPct.value),
      });
  }
  // L'équipe.
  if (partyTarget.value) {
    out.push({
      icon: '⏱️',
      label: 'Trajet',
      value: partySize.value ? formatDurationMin(partyMin.value) : '—',
      cls: partySize.value ? undefined : 'dim',
      go: true,
      title: partySize.value ? 'Aller-retour de l’équipe' : 'Compose ton équipe pour le connaître',
    });
    // 💎 Un filon : le temps d'extraction dépend du nombre de champions — c'est tout son choix.
    if (p.type === 'vein') {
      const n = Math.max(1, partyAdvs.value.length);
      out.push({
        icon: '⛏️',
        label: 'Extraction',
        value: formatDurationMin(veinDwellMs(n) / 60_000),
        title: `Sur place : ${formatDurationMin(veinDwellMs(1) / 60_000)} seul, ${formatDurationMin(veinDwellMs(2) / 60_000)} à deux, ${formatDurationMin(veinDwellMs(3) / 60_000)} à trois — la réserve est la même`,
      });
    }
    if (teamOnly.value || guard)
      out.push(
        partyWin.value === null
          ? {
              icon: '🎯',
              label: rift ? 'Fermeture' : 'Réussite',
              value: '—',
              cls: 'dim',
              go: true,
              title: 'Compose ton équipe pour la connaître',
            }
          : {
              icon: '🎯',
              label: rift ? 'Fermeture' : 'Réussite',
              value: `${partyWin.value} %`,
              go: true,
              title: rift ? 'Chance de refermer la faille' : 'Chance de réussite de l’équipe',
              cls: winClass(partyWin.value),
            },
      );
  }
  return out;
});
/** 💰 La QUANTITÉ ramenée si le lieu est pris, puis le bonus à part. Sans équipe composée on
 *  compte au pas du héros (on compare deux lieux avant de choisir qui part) ; le chiffre se
 *  recale sur l'équipe dès qu'elle est composée. Le niveau est celui que la récolte applique. */
function pushHaul(out: PoiFact[], p: Poi, force: Parameters<typeof forceLootPreview>[1] | null) {
  const heroGoes = partyTarget.value && partySize.value ? partyHeroOn.value : true;
  const playerLevel = heroGoes ? progressionLevel.value : heroLevel.value;
  const base = poiHaulPreview(p, { playerLevel, heroGoes });
  const txt = formatHaul(base);
  if (!txt) return;
  const detail: string[] = [];
  const filon = p.type === 'mine' ? harvestGold(p, playerLevel) : 0;
  const bourses = force ? forceLootPreview(p, force).gold : 0;
  if (filon && bourses)
    detail.push(
      `filon ${filon.toLocaleString('fr-FR')} 🪙 + bourses des gardes ${bourses.toLocaleString('fr-FR')} 🪙`,
    );
  // 🧮 Équipe composée : la base PUIS ce que CETTE équipe ramène (demandé : « voir la récolte
  // de base et celle récupérée avec les effectifs en question »). `poiTeamHaul` = base + le
  // bonus des bâts/porteurs, les règles de la résolution — aucune de plus ici.
  const team =
    partyTarget.value && partySize.value
      ? poiTeamHaul(p, { playerLevel, heroGoes, escort: partyAdvs.value, kit: partyRoad.value })
      : null;
  const totalTxt = team ? formatHaul(team.total) : '';
  const boosted = !!team && totalTxt !== txt;
  out.push({
    icon: '💰',
    label: boosted ? 'Récolte de base' : 'À récupérer',
    value: txt,
    title: ['Ce que tu ramènes si le lieu est pris (hors aléas de la route)', ...detail].join(
      ' — ',
    ),
  });
  if (boosted)
    out.push({
      icon: '🎒',
      label: 'Avec cette équipe',
      value: totalTxt,
      cls: 'wp-good',
      title: `${heroGoes ? 'Bâts 🧺 compris' : 'Bâts 🧺, porteurs 🐫 et pièces de cargaison compris'} — ${formatHaul(team.bonus, '+')}`,
    });
  // 🐫 Une compétence de cargaison présente qui ne change RIEN ici : on le dit, sinon « ramène
  // plus » sur la tuile du champion se lit comme une promesse trahie en silence.
  if (team?.idleHaul)
    out.push({
      icon: '🐫',
      label: 'Porteurs',
      value: 'sans effet ici',
      cls: 'dim',
      title: heroGoes
        ? 'Avec le héros, seuls les bâts 🧺 augmentent la récolte'
        : 'L’énergie ramenée par une équipe ne dépasse jamais sa base : les porteurs n’y ajoutent rien',
    });
}
/**
 * ⚠️ DES PROPS À IDENTITÉ STABLE pour `MapPoiLayer` : ces trois listes dépendent de `now`
 * (qui tique à la seconde), mais leur CONTENU ne change qu'à un départ, un retour ou au recul
 * du brouillard. En chaîne d'ids (primitive, comparée par valeur) ou via `stableBy` (même
 * référence tant que la clé ne bouge pas), le calque des lieux ne se re-rend plus à chaque tick.
 */
function stableBy<T>(src: () => T, key: (v: T) => string) {
  let lastKey: string | null = null;
  let last: T;
  return computed(() => {
    const v = src();
    const k = key(v);
    if (k === lastKey) return last;
    lastKey = k;
    last = v;
    return v;
  });
}
const dimmedKey = computed(() =>
  shownPois.value
    .filter(dimmed)
    .map((p) => p.id)
    .join('|'),
);
const veiledKey = computed(() =>
  fogPlan.value
    ? shownPois.value
        .filter((p) => underFog(p, TOWN, fogR.value))
        .map((p) => p.id)
        .join('|')
    : '',
);
const travelTargets = stableBy(
  () =>
    travelersOnMap.value
      .filter((v) => v.kind !== 'reinf') // le point tenu est déjà dessiné par MapPoiLayer
      .map((v) => ({ id: v.id, poi: v.poi, kind: v.kind })),
  (l) => l.map((v) => v.id).join('|'),
);

// Avant-poste : débloque les expéditions + réduit les trajets.
const outpostBuilt = computed(() => expeditionsUnlocked(char.row?.buildings ?? []));
// 🗼 Les tours de guet tenues raccourcissent les trajets APRÈS l'Avant-poste.
const travelMult = computed(
  () => travelTimeMult(char.row?.buildings ?? []) * controlTravelMult(char.row?.expedition_map),
);
const roundTripMin = (p: Poi) =>
  Math.round(travelOneWayMin(poiTravelLevel(p), p.distNorm) * 2 * travelMult.value);
/** Ce qu’un lieu rapporte, en quelques mots, sur la ligne sous son nom (le détail chiffré
 *  vit dans les pastilles : filon, bourses, mana si refermée…).
 *  ⚠️ `Record<PoiType, …>` et non une chaîne de `if` avec un cas par défaut : c’est ce
 *  défaut-là qui a fait annoncer « pièce de set + pierres » pour une ÉPAVE (v0.680), puis
 *  pour une FAILLE et une MINE DE MANA. Ajouter un POI sans dire ce qu’il donne casse
 *  désormais la compilation, au lieu de mentir en silence. */
const POI_RESOURCE: Record<PoiType, (p: Poi) => string> = {
  mine: () => 'or 🪙',
  well: () => 'énergie ⚡',
  shrine: () => 'pierres d’invocation 🔮',
  archive: () => 'clés 🗝️',
  wreck: () => 'plus rien',
  mana_mine: () => 'mana 💠',
  // ⚔️ Camp / repaire : la ressource de SA faction + ses sceaux d'objet (`campRewardLabel`,
  // écrit et testé à côté de la règle du butin).
  camp: (p) => campRewardLabel(p),
  lair: (p) => campRewardLabel(p),
  arena: () => 'objets + pierres 🔮 selon les vagues',
  rift: () => 'mana 💠',
  warband: () => 'mana 💠 · siège non renforcé',
  ruins: (p) => (ruinsSealKind(p) === 'champion' ? 'sceaux de champion 🔱' : 'sceaux d’objet ⚜️'),
  fallen: () => 'consommables 🎒',
  den: () => 'beaucoup d’XP · consommables 🎒',
  plunder: () => 'beaucoup d’or 🪙',
  vein: () => 'mana 💠 · 1 à 3 champions, plus vite à plusieurs',
  control: (p) =>
    p.control
      ? p.control.owner === 'player'
        ? `${CONTROL_YIELD[p.control.kind]} tant que tu le tiens`
        : `à prendre · ${CONTROL_YIELD[p.control.kind]}`
      : '',
};
/** La ligne sous le nom : les ennemis (faction × nombre) et la ressource. */
const poiSub = computed(() => {
  const p = selected.value;
  if (!p) return { foe: '', res: '' };
  const rift = selectedRift.value;
  const band = selectedWarband.value;
  const faction =
    rift?.faction ?? band?.faction ?? selectedCamp.value?.faction ?? selectedGuard.value?.faction;
  const force = selectedForce.value;
  const count = rift
    ? `${rift.foes}/${rift.maxFoes}`
    : band
      ? String(band.size)
      : force
        ? String(campBodyCount(force))
        : '';
  const foe = faction
    ? `${FACTION_EMOJI[faction]} ${FACTION_LABEL[faction]}${count ? ` ×${count}` : ''}`
    : '';
  return { foe, res: POI_RESOURCE[p.type](p) };
});

const canSend = computed(
  () =>
    !!selected.value &&
    !heroUnavailable.value &&
    !!char.row &&
    progress.ready.value &&
    outpostBuilt.value,
);
const sendLabel = computed(() => {
  if (!selected.value) return 'Envoyer';
  if (!outpostBuilt.value) return '🧭 Construis un Avant-poste d’abord';
  return 'Envoyer le héros';
});

/** 🏰 UN SIÈGE ÉCHU SE TRANCHE AUSSI ICI (défaut du 2026-09-27) : on arrive souvent sur la
 *  carte directement (notification « héros rentré »), sans passer par l'Aventure qui tranchait
 *  seule les sièges. On renvoyait alors tout le monde AVANT que le siège ne soit tranché, et
 *  il se jouait sans défenseurs. On le tranche donc avant de régler les retours et avant tout
 *  départ ; l'issue ne se dit pas ici (elle spoilerait le rejeu, qui s'ouvre sur la base). */
async function settleDueSiege() {
  const uid = auth.user?.id;
  const raid = char.row?.base?.raid;
  if (!uid || !raid || Date.now() < raid.arrivesAt || !progress.ready.value) return;
  const r = await char.baseTick(uid, Date.now(), {
    playerLevel: heroLevel.value,
    activeDays7: progress.activeDaysInLast(7),
    globalXp: progress.energyEarned.value,
    hero: fighter.value,
  });
  if (r.report)
    $q.notify({ type: 'info', message: '⚔️ L’assaut a eu lieu — revois-le sur ta base.' });
}

async function send() {
  const uid = auth.user?.id;
  const p = selected.value;
  if (!uid || !p || !canSend.value) return;
  await settleDueSiege();
  try {
    await char.expeSend(uid, p, fighter.value, Date.now(), progressionLevel.value);
    selected.value = null;
    $q.notify({ type: 'positive', message: '🧭 Héros en route !' });
  } catch (e) {
    $q.notify({ type: 'warning', message: e instanceof Error ? e.message : 'Échec de l’envoi.' });
  }
}

// Cycle de vie : dépose le rapport à l'arrivée, crédite le butin au retour.
let busy = false;
async function lifecycle() {
  const uid = auth.user?.id;
  if (!uid || busy) return;
  busy = true;
  try {
    // ⚠️ AVANT les retours : un voyage réglé efface la trace de qui était dehors.
    await settleDueSiege();
    const msg = await char.expeTick(uid, Date.now(), progress.activeDaysInLast(7));
    if (msg)
      $q.notify({
        type: msg.win ? 'positive' : 'warning',
        message: `📬 ${msg.win ? 'Rapport : victoire' : 'Rapport : échec'} — le héros rentre.`,
      });
    // Le héros rentre : il redevient disponible.
    await char.expeSettle(uid, Date.now(), progress.activeDaysInLast(7));
    // ⚔️ Les groupes partis sans le héros : rapport à l'arrivée, retour au bout du chemin.
    const partyMsgs = await char.partyTick(uid, Date.now(), progress.activeDaysInLast(7));
    // Un rapport déposé AVANT le retour se dit ; un retour, c'est la modale qui le montre.
    if (partyMsgs.length && !partyMsgs.every((m) => isClaimable(m, Date.now())))
      $q.notify({
        type: partyMsgs.some((m) => m.win) ? 'positive' : 'warning',
        message: '📬 Rapport de ton groupe — il rentre en ville.',
      });
    // 🏰 Les reprises ennemies des points de contrôle, à leur heure.
    const ctlMsgs = await char.controlTick(
      uid,
      Date.now(),
      heroLevel.value,
      progress.activeDaysInLast(7),
    );
    if (ctlMsgs.length)
      $q.notify({
        type: ctlMsgs.every((m) => m.win) ? 'positive' : 'warning',
        message: ctlMsgs.every((m) => m.win)
          ? '🏰 Attaque repoussée sur ton point de contrôle.'
          : '🏰 Un point de contrôle a été repris par l’ennemi.',
      });
    // 🎁 Au retour en ville, le butin s'encaisse tout seul.
    for (const done of await char.expeAutoClaim(uid, Date.now())) showReturned(done);
    await char.expeSyncMap(uid, Date.now(), progressionLevel.value);
  } finally {
    busy = false;
  }
}

/** Encaisse le rapport ouvert. La CÉLÉBRATION est ici et non au retour : le butin se
 *  découvre au moment où on le prend, pas pendant qu'on regardait ailleurs. */
async function doClaim() {
  const uid = auth.user?.id;
  const m = lastOutcome.value;
  if (!uid || !m) return;
  const done = await char.expeClaim(uid, m.id, Date.now());
  collectOpen.value = false;
  if (!done) return;
  advXpFx.show(done.advTracks);
  celebrateTopDrop(done);
}
/** Éclat du meilleur objet ramené, s'il est de rang primordial. */
function celebrateTopDrop(done: ExpeditionMessage) {
  const drops = done.items && done.items.length ? done.items : done.item ? [done.item] : [];
  const rk = (r: string) => RARITY_RANK[r as keyof typeof RARITY_RANK] ?? 0;
  const top = drops.slice().sort((a, b) => rk(b.rarity) - rk(a.rarity))[0];
  if (top && rk(top.rarity) >= 7)
    gameFx.celebrate({
      kind: 'drop',
      emoji: top.emoji,
      title: `Butin ${gradeLabel(top)} !`,
      subtitle:
        drops.length > 1
          ? `${top.name} (+${drops.length - 1} autre${drops.length > 2 ? 's' : ''})`
          : top.name,
      rarity: fxRarity(top.rarity),
    });
}

// Écran de chargement thématique bref à l'ouverture de la carte (immersion).
const {
  stayCap,
  stayHold,
  stayHoldOf,
  stayIds,
  stayChoice,
  toggleStay,
  partyOrigin,
  originOptions,
  originPoi,
  partyPoolSorted,
  partyHero,
  partyEscort,
  partyAdvs,
  showBlocked,
  partyBlocked,
  partyHeroBlock,
  partyHeroOn,
  partySize,
  supplyRows,
  toggleSupply,
  partyRoad,
  partyWin,
  partyMin,
  partyRisk,
  partySendBlock,
  partySlotsFull,
  canSendPartyNow,
  partyMax,
  partyXpSplit,
  partyXp,
  partyLowXp,
  togglePartyAdv,
  partyAllIds,
  partyAllOn,
  togglePartyAll,
  partySendLabel,
  doSendParty,
} = useExpeditionParty({
  selected,
  now,
  coarseNow,
  active,
  heroLevel,
  progressionLevel,
  fighter,
  heroHealIn,
  outpostBuilt,
  travelMult,
  roadCtx,
  compCtx,
  base,
  incoming,
  raidAt,
  heroDefendsNow,
  freeStable,
  freeSorted,
  cap,
  vansLeft,
  partyTarget,
  teamOnly,
  selectedRift,
  progressReady: progress.ready,
  settleDueSiege,
});
const booting = ref(true);
onMounted(async () => {
  setTimeout(() => (booting.value = false), 750);
  const uid = auth.user?.id;
  if (uid && !char.row) await char.fetchMine().catch(() => undefined);
  if (uid) await char.expeSyncMap(uid, Date.now(), progressionLevel.value).catch(() => undefined);
  await nextTick();
  measure();
  // Vue de départ : le disque révélé tient dans la largeur (la carte grandit avec
  // l'Avant-poste, un zoom fixe montrerait un tout petit disque en début de partie),
  // puis UN CRAN de plus (demandé par l'utilisateur : le disque entier était un cran trop
  // dézoomé — on voit la ville et ses abords, le reste se trouve en faisant glisser ou au −).
  mapPx.value = clampPx(Math.round((contW.value * V.size) / (2 * (reveal.value + 6))) + ZOOM_STEP);
  await nextTick();
  centerTown();
  liftFog(readFogSeen());
  window.addEventListener('resize', measure);
  const el = scrollEl.value;
  el?.addEventListener('touchstart', onTouchStart, { passive: true });
  el?.addEventListener('touchmove', onTouchMove, { passive: false });
  el?.addEventListener('touchend', onTouchEnd, { passive: true });
  el?.addEventListener('touchcancel', onTouchEnd, { passive: true });
  timer = setInterval(() => {
    now.value = Date.now();
    void lifecycle();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  cancelAnimationFrame(fogRaf);
  clearTimeout(fogWait);
  window.removeEventListener('resize', measure);
  const el = scrollEl.value;
  el?.removeEventListener('touchstart', onTouchStart);
  el?.removeEventListener('touchmove', onTouchMove);
  el?.removeEventListener('touchend', onTouchEnd);
  el?.removeEventListener('touchcancel', onTouchEnd);
});

// ── Formatage durées ──
</script>

<style scoped lang="scss">
.sh-away {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--dim);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  line-height: 1.4;
}
.car-sep {
  margin: 10px 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
  text-align: center;
}
.car-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
/* Grille fluide : l’escorte peut compter jusqu’à quatre noms sur un écran plié. */
/* Suggestion d'escorte : pleine largeur et 44 px (règle mobile), mais en secondaire —
   elle propose, elle ne décide pas. */
/* 🕳️ La limite d’une faille, dite AVANT qu’on butte dessus. */
.stay-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
}
.stay-pick .car-cap {
  flex-basis: 100%;
}
.stay-chip {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.stay-hold {
  white-space: nowrap;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
.stay-hold-line b {
  color: var(--text);
}
.stay-hold-note {
  color: var(--dim);
}
.stay-chip.on {
  border-color: var(--accent);
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.car-cap {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--dim);
}
/* La règle de l XP, sous la grille : elle explique les tuiles atténuées. */
.car-xp-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--dim);
}
.car-xp-note b {
  color: var(--text);
}
.car-cap b {
  color: var(--text);
}
/* 🏰 Tuiles de départ d'une équipe et de destination d'un transfert. */
.origin-pick,
.xfer {
  margin: 8px 0;
}
.xfer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 6px;
}
.xfer-tile {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.xfer-tile.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.xfer-tile:disabled {
  cursor: default;
  border-style: dashed;
  opacity: 0.6;
}
.xfer-emo {
  font-size: 20px;
  flex: none;
}
.xfer-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.xfer-name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.xfer-sub {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
.party-top {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.party-top .party-hero {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.car-auto {
  flex: none;
  min-height: 44px;
  padding: 0 12px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.car-auto:disabled {
  opacity: 0.45;
  cursor: default;
}
/* 👥 DEUX CHAMPIONS PAR LIGNE, en grand (demandé) : on compose une équipe sur le visage, la
   rareté et les compétences — à 78 px par tuile rien ne se lisait. */
.car-pick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}
.car-blocked-toggle {
  width: 100%;
  min-height: 44px;
  margin-bottom: 8px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: none;
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
/* ⚔️ Le héros dans un groupe de camp : pleine largeur, 44 px, coché comme une tuile. */
.party-hero {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 6px 12px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.party-hero.on {
  border-color: var(--accent);
  background: linear-gradient(90deg, rgba(255, 210, 63, 0.16), #1d1913 70%);
}
.party-hero.off {
  cursor: default;
  border-style: dashed;
  opacity: 0.65;
}
.ph-emo {
  font-size: 22px;
}
.ph-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ph-name {
  font-size: 13px;
  font-weight: 700;
}
.ph-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.ph-check {
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
}
.sh-rules {
  margin: 4px 0 6px;
}
.sh-rules > summary {
  min-height: 32px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
  cursor: pointer;
  list-style: none;
}
.sh-rules > summary::-webkit-details-marker {
  display: none;
}
/* 📌 Le bouton d'envoi reste en bas de l'écran pendant qu'on compose. Fond opaque : un
   bouton grisé laisse sinon voir les tuiles qui défilent dessous. */
.send-bar {
  position: sticky;
  bottom: 0;
  z-index: 3;
  padding: 8px 0 10px;
  background: linear-gradient(180deg, transparent, var(--bg) 30%);
}
/* Grisé mais OPAQUE : collant, un bouton à 40 % d'opacité laissait voir les tuiles dessous. */
.send-bar .sh-send:disabled {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 30%, var(--surface));
  color: var(--dim);
}
.ctl-panel {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, #b57bff 55%, var(--line));
  background: color-mix(in srgb, #b57bff 8%, var(--surface));
}
.ctl-line {
  margin: 0 0 6px;
  font-size: 12.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.forge-gauges {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 8px;
}
.forge-g {
  display: grid;
  grid-template-columns: minmax(0, 6.5em) minmax(0, 1fr) 8.5em;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.forge-g-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.forge-g-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}
.forge-g-bar i {
  display: block;
  height: 100%;
  background: var(--accent, #ffd23f);
  border-radius: 4px;
  transition: width 0.4s ease;
}
.forge-g-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dim, #9a8f7e);
}
.ctl-dim {
  color: var(--dim);
  font-size: 11px;
}
.ctl-warn {
  color: var(--d3, #ffb23f);
}
.ctl-alert {
  color: var(--d4, #ff6a45);
}
.ctl-reinf {
  margin-top: 10px;
}
.ctl-back {
  color: var(--text);
  border-color: color-mix(in srgb, #b57bff 55%, var(--line));
}
.ctl-recall {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.sh-note {
  margin: 0 0 8px;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.4;
}
.car-send {
  margin-top: 2px;
}

.emap {
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  padding-bottom: 24px;
}
.emap.embedded {
  min-height: 0;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px;
}
.top-title {
  font-size: 18px;
  font-weight: 800;
}
.iconbtn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
}
.dispo-row {
  display: flex;
  padding: 0 12px 6px;
}
/* 🛡️ Un milicien dans la garnison : une tuile anonyme, sélectionnable pour le ramener. */
.mil-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  padding: 6px 4px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}
.mil-tile.on {
  border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.mil-emo {
  font-size: 22px;
  line-height: 1;
}
.mil-name {
  font-size: 11.5px;
  font-weight: 600;
}
.mil-sub {
  font-size: 10.5px;
  color: var(--dim);
}
.mil-send {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.mil-send-lab {
  font-size: 13px;
  min-width: 0;
}
.mil-pick {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 8px 0;
}
.mil-tile {
  position: relative;
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mil-tile.on {
  border-color: var(--accent);
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.16), #1d1913 65%);
}
.mil-tile.off {
  border-style: dashed;
  opacity: 0.45;
  cursor: default;
}
.mil-tile-emo {
  font-size: 24px;
  line-height: 1;
}
.mil-tile-n {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 9px;
  color: var(--dim);
}
.ei-rift {
  display: inline-block;
  width: 10px;
  height: 16px;
}
.outpost-hint {
  margin: 0 12px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.4;
}
.map-outer {
  position: relative;
  margin: 0 8px;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
}
.map-scroll {
  height: 62vh;
  overflow: auto;
  touch-action: pan-x pan-y;
  background: #d7d0bd;
  scrollbar-width: none;
}
/* Des voyages en cours : la carte laisse la place à leurs DEUX premières lignes en bas
   de l'écran (en-tête ~60 px, filtres repliés ~48 (v0.1240 ; dépliés ils poussent les voyages, le temps de régler), disponibilités ~72 (rangs compris), deux lignes de tuiles ~104, marges). Jamais plus
   haute qu'avant (62vh). */
.map-scroll.with-trips {
  height: min(62vh, calc(100vh - 320px));
  height: min(62vh, calc(100dvh - 320px));
}
.map-scroll::-webkit-scrollbar {
  display: none;
}
.map {
  display: block;
}
/* Indicateurs de bord (activités hors écran) */
.edge-ind {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--rk, var(--line));
  cursor: pointer;
  z-index: 3;
  font-size: 12px;
}
.ei-arrow {
  color: var(--accent);
  font-size: 11px;
  line-height: 1;
}
.ei-emo {
  font-size: 13px;
}
/* Contrôles de zoom */
.zoom-ctl {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 3;
}
.zoom-b {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.ctl-list-b {
  position: relative;
  font-size: 16px;
}
.ctl-list-dot {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  font-size: 10px;
  font-weight: 800;
  line-height: 16px;
}
/* Décor de carte */
/* Terrain : le sol vit dans MapTerrain.vue (mer, côte, prairie, reliefs). Ici ne
   restent que le cadre, la boussole et la ville. */
.fog {
  pointer-events: none;
}
/* Pendant le recul, le liseré passe à l’accent : on suit le front des yeux. */
.fog-rim.lifting {
  stroke: var(--accent);
  stroke-width: 1;
  opacity: 0.9;
}
.hour-ring {
  fill: none;
  stroke: #e8dcc0;
  stroke-width: 0.45;
  stroke-dasharray: 1 2.5;
  opacity: 0.42;
  pointer-events: none;
}
.hour-lab {
  fill: #e8dcc0;
  font-size: 2.6px;
  text-anchor: middle;
  opacity: 0.5;
  pointer-events: none;
}
.fog-rim {
  fill: none;
  stroke: #e8dcc0;
  stroke-width: 0.5;
  stroke-dasharray: 2 2.5;
  opacity: 0.45;
  pointer-events: none;
}
.map-frame {
  fill: none;
  stroke: #6b5a40;
  stroke-width: 0.7;
}
.map-frame.thin {
  stroke: #3a2f1f;
  stroke-width: 0.3;
}
.compass .comp-bg {
  fill: #3a2f1f;
  stroke: #c8b378;
  stroke-width: 0.4;
}
.compass .comp-n {
  font-size: 3px;
  text-anchor: middle;
  fill: #f3eee6;
  font-weight: 700;
}
.compass .comp-needle {
  fill: var(--accent, #ffd23f);
}
.town-glow {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  animation: town-pulse 2.4s ease-in-out infinite;
}
@keyframes town-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.75;
  }
}
@media (prefers-reduced-motion: reduce) {
  .town-glow {
    animation: none;
  }
}
.trail {
  stroke-width: 1.4;
  stroke-linecap: round;
  fill: none;
}
.trail.done {
  stroke: var(--line);
}
.trail.todo {
  stroke: #4a9eff;
  filter: drop-shadow(0 0 1px rgba(74, 158, 255, 0.6));
}
/* Convois : violet, distinct du bleu du héros ET de l'accent jaune (sélection/cible),
   et hors de la gamme vert/orange/rouge qui code la difficulté des lieux. Pointillé
   pour rester lisible sans la couleur. */
.trail.van {
  stroke-width: 1;
  stroke-dasharray: 2 2.2;
}
.trail.van.done {
  stroke: rgba(181, 123, 255, 0.32);
}
.trail.van.todo {
  stroke: #b57bff;
  filter: drop-shadow(0 0 1px rgba(181, 123, 255, 0.55));
}
/* Groupes ⚔️ : même violet qu'un convoi, mais un motif TIRET-POINT sur la route et un liseré
   pointillé sur la cible et le marqueur — lisible sans la couleur ni l'emoji. */
.trail.van.party {
  stroke-width: 1.2;
  stroke-dasharray: 4 1.4 0.8 1.4;
}
.van-mark.party {
  stroke-width: 1;
  stroke-dasharray: 1.2 0.9;
}
/* Renforts 🛡️ : VERT (ils rejoignent un point qui est à nous), tiret long — un aller simple,
   distinct du violet des équipes qui partent se battre et reviennent. */
.trail.van.reinf {
  stroke-width: 1.1;
  stroke-dasharray: 3 1.6;
}
.trail.van.reinf.done {
  stroke: rgba(123, 200, 108, 0.35);
}
.trail.van.reinf.todo {
  stroke: #7bc86c;
  filter: drop-shadow(0 0 1px rgba(123, 200, 108, 0.55));
}
.van-mark.reinf {
  stroke: #7bc86c;
}
/* ⚔️ La bande qu'on intercepte : rouge (elle menace la base), son chemin vers le point de
   rencontre, et un anneau qui pulse là où les deux colonnes vont se heurter. */
.band-mark {
  fill: var(--surface);
  stroke: var(--d4);
  stroke-width: 0.9;
}
.band-path {
  stroke: var(--d4);
  stroke-width: 0.7;
  stroke-dasharray: 1.4 1.2;
  opacity: 0.8;
}
.clash-ring {
  fill: none;
  stroke: var(--d4);
  stroke-width: 0.8;
  transform-box: fill-box;
  transform-origin: center;
  animation: clashPulse 1.4s ease-in-out infinite;
}
@keyframes clashPulse {
  50% {
    transform: scale(1.35);
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .clash-ring {
    animation: none;
  }
}
.van-mark {
  fill: var(--surface);
  stroke: #b57bff;
  stroke-width: 0.8;
}
.van-emo {
  font-size: 3px;
  text-anchor: middle;
  pointer-events: none;
}

/* Chevrons de direction : s'allument un à un (délai croissant héros→cible) puis
   s'éteignent → sensation de flux dans le sens du déplacement. En boucle. */
.dir-arrow {
  fill: #4a9eff;
  stroke: none;
  opacity: 0;
  animation: dir-flow 1.5s ease-in-out infinite;
}
@keyframes dir-flow {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  55% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dir-arrow {
    animation: none;
    opacity: 0.85;
  }
}
/* 🕳️ L'auréole d'une EMBUSCADE (faille débordée, v0.1009) : on VOIT ce qu'elle salit, sans rien
   sélectionner. ⚠️ `pointer-events: none` — elle couvre plusieurs POI, elle leur volerait
   leur clic. Teinte du DANGER (--d4), comme l'encart de la Tour de guet : les deux parlent
   de la même chose. Discrète (c'est un fond, pas un objet), mais son bord pointillé la
   distingue des cercles pleins de la carte. */
.rift-halo {
  fill: color-mix(in srgb, var(--d4) 9%, transparent);
  stroke: color-mix(in srgb, var(--d4) 42%, transparent);
  stroke-width: 0.5;
  stroke-dasharray: 2 2;
  pointer-events: none;
}
.hero {
  fill: var(--accent);
  filter: drop-shadow(0 0 2px var(--accent));
}
.hero-emo {
  font-size: 3.4px;
  text-anchor: middle;
}
/* La ville = l'enceinte de la Base en petit : mêmes pierres, mêmes bois.
   ⚠️ À cette taille (14 unités sur 200), c'est le CONTRASTE qui fait lire la forme, pas
   le détail : le rempart est donc la surface CLAIRE (pierre) et la cour la surface
   sombre. L'inverse — mur sombre bordé de clair, comme sur l'écran Base où il fait dix
   fois cette taille — se lisait ici comme un trou dans la prairie. */
.town-earth {
  fill: #5a4730;
  opacity: 0.9;
}
.town-road {
  fill: #5c4a32;
  stroke: #3f3220;
  stroke-width: 0.3;
}
.town-wall {
  fill: #9a8768;
  stroke: #3a2f1f;
  stroke-width: 0.7;
  stroke-linejoin: round;
}
.town-yard {
  fill: #4a3c28;
  stroke: #3a2f1f;
  stroke-width: 0.3;
}
.town-turret {
  fill: #c2ae88;
  stroke: #3a2f1f;
  stroke-width: 0.35;
}
.town-keep {
  fill: #c2ae88;
  stroke: #3a2f1f;
  stroke-width: 0.4;
}
.town-gate {
  fill: #241c12;
  stroke: #3a2f1f;
  stroke-width: 0.3;
}
/* ── Rangée des voyages : une tuile par voyageur, sur UNE ligne ── */
/* ⚠️ DEUX COLONNES, plus une rangée qui défile (demandé par l'utilisateur). Le défilement
   horizontal cachait les convois au-delà du deuxième : on ne savait pas combien il y en
   avait sans balayer, et rien ne l'annonçait. Une grille les montre TOUS d'un coup.
   ⚠️ `minmax(0, 1fr)` et non `1fr` : sans le minimum à zéro, une piste de grille refuse
   de passer sous la taille de son contenu et la grille déborderait du cadre à 344 px. */
.van-card {
  background: var(--surface);
  color: var(--text);
  padding: 16px;
  border-radius: 16px;
  width: 360px;
  max-width: 92vw;
}
.van-kicker {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.van-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.trip-focus-halo {
  fill: rgb(255 93 93 / 28%);
  stroke: #ff5d5d;
  stroke-width: 1.2;
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: trip-halo 1.6s ease-in-out infinite;
}
@keyframes trip-halo {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(1.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .trip-focus-halo {
    animation: none;
  }
}
/* ⚠️ AVERTISSEMENT, pas interdiction : partir malgré un siège est un ARBITRAGE (une
   cargaison contre un risque), pas une faute. D3 quand ça se dégrade, D4 quand la base
   ne tient plus — deux crans, parce que « moins confortable » et « tu vas perdre » ne
   se disent pas de la même couleur. */
.sh-risk {
  font-size: 12px;
  color: var(--d3);
  margin: 4px 0 6px;
}
.sh-risk.bad {
  color: var(--d4);
  font-weight: 600;
}
/* Et quand le voyage se termine AVANT l’assaut, on le DIT : le silence, à la place
   d’une alerte attendue, ressemble à un oubli. Vert « gain » de la charte. */
.sh-ok {
  font-size: 12px;
  color: var(--d1);
  margin: 4px 0 6px;
}
.sh-send {
  width: 100%;
  /* ⚠️ Cible tactile 44 px minimum (règle mobile) : le padding seul donnait 43 px. */
  min-height: 44px;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
.sh-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
/* Annonce « activité débloquée » (construction d'un bâtiment de déblocage). */
.unlock-card {
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  min-width: 280px;
  max-width: 360px;
  border: 1px solid var(--accent);
}
.empty {
  margin: 24px 16px;
  color: var(--dim);
  text-align: center;
  font-size: 13px;
}
</style>
