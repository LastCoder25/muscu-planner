<template>
  <!-- 🗺️ LA CARTE D'EXPÉDITION, hébergée DANS l'Aventure (demandé : « switcher juste cette
       partie sans perdre le haut de la page ») : ressources, effectifs et boîte sont ceux de
       l'Aventure, au-dessus ; on revient au jeu par son sélecteur. ⚠️ C'est l'Aventure qui
       fait tourner la boucle de mise à jour (rapports, retours, reprises, carte) : la lancer
       ici aussi doublerait chaque notification. -->
  <div class="emap">
    <!-- 🗺️ La carte d'une île RANGÉE (demandé : « cliquer sur l'île 1 et voir la carte pour
         gérer les garnisons des miliciens ») : elle remplace la carte active tant qu'on la
         regarde ; « Revenir » ou l'île active dans le sélecteur la referment. -->
    <RemoteIslandMap
      v-if="viewed"
      :island="viewed.island"
      :map="viewed.map"
      :remote="viewed.remote"
      :reserve="viewed.reserve"
      :champions="crossInfo.away[viewed.island.id] ?? 0"
      :busy="archBusy"
      @close="viewIsland = null"
      @militia="(e) => moveMilitia({ island: viewed!.island.id, ...e })"
    >
      <ArchipelPanel v-bind="archBind" v-on="archOn" />
    </RemoteIslandMap>
    <!-- ⛵ Qui embarque ? (option A) : avec ou sans le héros, les champions au choix. -->
    <CrossingSheet
      v-model="crossOpen"
      :from="crossAsk?.from ?? 0"
      :to="crossAsk?.to ?? null"
      :active-id="island?.id ?? 0"
      :hero-mode="crossHeroMode"
      :hero-block="crossAsk ? (crossInfo.blocks[crossAsk.to] ?? null) : null"
      :candidates="crossCandidates"
      :depart-at="nextCrossingDeparture(now)"
      :hero-depart-at="char.crossingDepartAt(now)"
      :busy="archBusy"
      @confirm="confirmCross"
    />

    <!-- Avant-poste requis pour envoyer des expéditions. Les emplacements vivent
         désormais sur l'écran « Ma base » (v0.664) → on y renvoie explicitement. -->
    <div v-if="!outpostBuilt" class="outpost-hint">
      🧭 Construis un <b>Avant-poste d’expédition</b> depuis <b>Ma base</b> pour envoyer des héros.
      Chaque niveau réduit les temps de trajet.
    </div>

    <!-- Carte -->
    <div v-show="!viewed" class="map-outer">
      <div ref="scrollEl" class="map-scroll" @scroll="onScroll">
        <svg
          :viewBox="`${V.x} ${V.y} ${V.size} ${V.size}`"
          class="map"
          :style="{ width: mapPx + 'px', height: mapPx + 'px' }"
        >
          <!-- Le SOL : mer, côte, prairie, reliefs — même langage que la Base (v0.749). -->
          <!-- 🏝️ En mode archipel : l'île, entourée de mer, avec son port et sa forteresse. -->
          <IslandTerrain v-if="islandTerr && island" :t="islandTerr" :view="V" />
          <MapTerrain v-else :terrain="terrain" :view="{ min: V.x, size: V.size }" />

          <!-- 🌫️ BROUILLARD DE GUERRE (v0.1047) : l'Avant-poste révèle un disque autour de la
               ville, qui grandit à chaque niveau. Au-delà, on devine le relief sans voir
               aucun lieu. Bord fondu (dégradé radial), liseré pointillé pour lire la limite. -->
          <defs v-if="!island">
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
          <!-- ⚠️ Pas de brouillard sur une île : c'est la MER qui la borne. -->
          <rect
            v-if="!island"
            :x="V.x"
            :y="V.y"
            :width="V.size"
            :height="V.size"
            fill="url(#fog-edge)"
            class="fog"
          />
          <circle
            v-if="!island"
            :cx="TOWN.x"
            :cy="TOWN.y"
            :r="fogR"
            class="fog-rim"
            :class="{ lifting: fogPlan }"
          />
          <!-- Cadre décoratif + boussole (visibles carte dézoomée) -->
          <rect
            :x="V.x + 1.5"
            :y="V.y + 1.5"
            :width="V.size - 3"
            :height="V.size - 3"
            rx="2"
            class="map-frame"
          />
          <rect
            :x="V.x + 3.5"
            :y="V.y + 3.5"
            :width="V.size - 7"
            :height="V.size - 7"
            rx="1"
            class="map-frame thin"
          />
          <g class="compass" :transform="`translate(${V.x + V.size - 100} ${V.y})`">
            <circle cx="90" cy="10" r="5.5" class="comp-bg" />
            <path d="M 90 5 L 91.4 10 L 90 8.7 L 88.6 10 Z" class="comp-needle" />
            <text x="90" y="4" class="comp-n">N</text>
          </g>

          <!-- Trajet du héros (aller/retour, noir=parcouru, bleu=restant) -->
          <template v-if="active && hero">
            <line
              :x1="heroEnd.x"
              :y1="heroEnd.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="[
                hero.phase === 'return' ? 'done' : 'todo',
                { 'trail-focus': traceKey === 'hero' },
              ]"
            />
            <line
              :x1="TOWN.x"
              :y1="TOWN.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="[
                hero.phase === 'return' ? 'todo' : 'done',
                { 'trail-focus': traceKey === 'hero' },
              ]"
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
          <template v-for="v in shownTravelers" :key="'vt' + v.id">
            <line
              :x1="lineEnd(v).x"
              :y1="lineEnd(v).y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="[
                v.at.phase === 'return' ? 'done' : 'todo',
                v.kind,
                { 'trail-focus': v.tripKey === traceKey },
              ]"
            />
            <line
              :x1="v.origin?.x ?? TOWN.x"
              :y1="v.origin?.y ?? TOWN.y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="[
                v.at.phase === 'return' ? 'todo' : 'done',
                v.kind,
                { 'trail-focus': v.tripKey === traceKey },
              ]"
            />
          </template>

          <!-- 🕳️ L'AURÉOLE D'UNE EMBUSCADE — les monstres restés autour d'une faille qui a
             DÉBORDÉ (v0.1009 ; une faille ouverte ne harcèle plus rien). Lisible SANS rien
             sélectionner : le joueur voit un disque, et les destinations dedans.
             ⚠️ Dessinée AVANT les POI (donc dessous) et en `pointer-events: none` : elle
             ne doit ni recouvrir un glyphe ni voler son clic. -->
          <!-- 👁️ LES CERCLES DE DÉTECTION (demandé, 2026-10-04) : la base et chaque lieu fixe
               tenu, en pointillé — on y voit d'où les armées ennemies deviennent visibles. -->
          <circle
            v-for="k in detectCircles"
            :key="'det-' + k.id"
            :cx="k.x"
            :cy="k.y"
            :r="k.r"
            class="detect-ring"
          />
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
          <circle v-if="tracePoi" :cx="tracePoi.x" :cy="tracePoi.y" r="8" class="trip-focus-halo" />

          <!-- 🗺️ Les lieux (à prendre, cible du héros, cibles des équipes) : un composant à part
               pour ne pas se re-diffuser à chaque seconde (cf. `MapPoiLayer`). -->
          <!-- ⚔️🗼 LES ARMÉES EN CAMPAGNE ET CE QU'ELLES VISENT (demandé) : la trajectoire en
               tirets rouges jusqu'à la base ou au point fixe attaqué, une flèche au bout, et un
               anneau qui palpite sur la cible. Sous les lieux : on clique toujours l'armée. -->
          <g v-for="a in armyPaths" :key="'ap' + a.id" class="army-path" :class="a.kind">
            <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" class="army-line" />
            <path :d="a.arrow" class="army-arrow" />
            <circle :cx="a.tx" :cy="a.ty" :r="a.tr" class="army-target" />
          </g>
          <MapPoiLayer
            :pois="placePois"
            :selected-id="selected?.id ?? null"
            :dimmed-key="dimmedKey"
            :veiled-key="veiledKey"
            :down-key="downKey"
            :imminent-key="imminentKey"
            :attacked-key="attackedKey"
            :tier-key="tierKey"
            :garrison-key="garrisonKey"
            :target="
              active && voyageTargetShown(active, now) && !fixedOnMap(active.poi)
                ? active.poi
                : null
            "
            :target-down="heroTargetDown"
            :travel-targets="travelTargets"
            @select="selectPoi"
          />

          <!-- Héros -->
          <!-- 🔙 Une troupe encore en route se touche pour la faire rebrousser chemin : une cible
               élargie (transparente) sous le marqueur, qui est trop petit pour un doigt. -->
          <g v-for="v in shownTravelers" :key="'vm' + v.id" :class="{ recallable: !!v.recall }">
            <circle
              v-if="v.recall"
              :cx="v.at.x"
              :cy="v.at.y"
              r="7"
              class="recall-hit"
              role="button"
              :aria-label="`Faire demi-tour : ${v.recallLabel}`"
              @click.stop="askRecall(v.recall, v.recallInfo)"
            />
            <circle :cx="v.at.x" :cy="v.at.y" r="3" class="van-mark" :class="v.kind" />
            <text :x="v.at.x" :y="v.at.y + 1.1" class="van-emo">{{ v.emo }}</text>
          </g>

          <g v-if="active && hero" :class="{ recallable: heroRecallable }">
            <circle
              v-if="heroRecallable"
              :cx="hero.x"
              :cy="hero.y"
              r="7"
              class="recall-hit"
              role="button"
              aria-label="Faire demi-tour : ton héros"
              @click.stop="askRecall({ kind: 'hero' }, heroRecallInfo)"
            />
            <circle :cx="hero.x" :cy="hero.y" r="3.4" class="hero" />
            <text :x="hero.x" :y="hero.y + 1.2" class="hero-emo">🧝</text>
          </g>

          <!-- Ville (centre) : la MÊME enceinte que l'écran Base, en miniature — terre
               battue, octogone, tourelles aux sommets, corps de garde au nord, porte au
               sud et son chemin. On reconnaît sa base depuis la carte. 🏘️ Sur les îles 2 à 5
               c'est un VILLAGE DE PÊCHEURS (`MapTown`, signalé 2026-10-04).
               🏠 CLIQUABLE (2026-09-29, demandé) : comme un lieu fixe, elle montre qui s'y
               trouve (héros, champions, miliciens) et permet de les envoyer ailleurs. -->
          <g
            class="town"
            role="button"
            tabindex="0"
            :aria-label="`${townIsVillage ? 'Le village du port' : 'Ta base'} — ${baseChamps.length} champion(s) présent(s)`"
            @click="baseOpen = true"
            @keydown.enter.prevent="baseOpen = true"
            @keydown.space.prevent="baseOpen = true"
          >
            <!-- ⚫ Qui est là, en points sous la ville (`townDots`, dessinés par `MapTown`). -->
            <MapTown :island="island?.id ?? null" :row="townRow" />
          </g>

          <!-- ⚔️ LES ARMÉES AU PREMIER PLAN (signalé : « les icônes des attaques passent sous les
               bâtiments, celle en cours disparaît derrière la base ») : dessinées APRÈS la ville
               et les lieux, pour qu'une armée arrivée au pied des murs reste visible et
               cliquable. Même composant que les lieux, sans cibles de voyage. -->
          <!-- ⚔️ L'armée touchée dans la liste des attaques (demandé : « une aura pour la trouver
               sur la carte ») : relue à chaque tick, elle suit l'armée qui marche. -->
          <circle
            v-if="focusArmyPoi"
            :cx="focusArmyPoi.x"
            :cy="focusArmyPoi.y"
            r="9"
            class="trip-focus-halo army-focus-halo"
          />
          <!-- ⚔️ La bande qu'on intercepte marche VERS le point de rencontre pendant que le
               groupe y court : on voit les deux colonnes converger, et le choc s'annonce là
               où elles se croiseront. -->
          <g v-for="b in shownBands" :key="'band' + b.id" class="band-march">
            <line :x1="b.x" :y1="b.y" :x2="b.meetX" :y2="b.meetY" class="band-path" />
            <circle :cx="b.meetX" :cy="b.meetY" r="6.5" class="clash-ring" />
            <circle :cx="b.x" :cy="b.y" r="3.2" class="band-mark" />
            <text :x="b.x" :y="b.y + 1.1" class="van-emo">{{ b.emo }}</text>
          </g>
          <MapPoiLayer
            :pois="armyPois"
            :selected-id="selected?.id ?? null"
            :dimmed-key="dimmedKey"
            :veiled-key="veiledKey"
            :down-key="downKey"
            :imminent-key="imminentKey"
            :attacked-key="attackedKey"
            :target="null"
            :travel-targets="[]"
            @select="selectPoi"
          />
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

      <!-- 🏝️ L'archipel, en haut à droite de la carte : l'île actuelle, et au toucher toutes
           les îles avec la fiche de celle qu'on choisit. -->
      <ArchipelPanel v-if="!viewed" v-bind="archBind" v-on="archOn" />

      <!-- Zoom -->
      <div class="zoom-ctl">
        <div class="zoom-col">
          <button class="zoom-b" aria-label="Dézoomer" @click="zoom(-1)">−</button>
          <button class="zoom-b" aria-label="Recentrer" @click="centerTown">⌂</button>
          <button class="zoom-b" aria-label="Zoomer" @click="zoom(1)">+</button>
        </div>
      </div>

      <!-- 🗂️ LES TUILES PAR-DESSUS LA CARTE (essai, demandé : un bouton à côté de ↕️ pour les
           expéditions et un pour les places fortes ; toucher une tuile ferme l'affichage et
           centre la carte sur son tracé ou son lieu). Les tuiles sous la carte restent le temps
           de l'essai. -->
      <div v-if="overlay && !viewed" class="map-overlay" role="dialog" :aria-label="overlayTitle">
        <div class="mo-head" :class="{ bare: overlay === 'ctl' }">
          <span v-if="overlay !== 'ctl'" class="mo-title">{{ overlayTitle }}</span>
          <button type="button" class="mo-x" aria-label="Fermer" @click="overlay = null">✕</button>
        </div>
        <template v-if="overlay === 'trips'">
          <p v-if="!trips.length && !attacks.length" class="map-tab-empty">
            Aucune expédition en cours ni armée en marche.
          </p>
          <TripsPanel
            :focus="focusTrip"
            :trips="trips"
            :hero-profile="character.profile"
            :attacks="attacks"
            :holds="attackHolds"
            :now="coarseNow"
            @update:focus="pickOverlayTrip"
            @attack="(p: Poi) => ((overlay = null), openAttack(p))"
          />
        </template>
        <ControlPointsSheet
          v-else
          :model-value="true"
          inline
          :rows="ctlRoster"
          :advs="char.advList"
          :reinforceable="reinforceable"
          @open="(p: Poi) => ((overlay = null), openFromList(p))"
          @reinforce="(p: Poi) => ((overlay = null), (quickId = p.id))"
        />
      </div>
    </div>

    <!-- 🗂️ TROIS TUILES SOUS LA CARTE (2026-09-29, demandé : « les lieux fixes et les attaques
         ennemies dans des tuiles, avec une tuile expéditions, et au clic ça déplie la partie
         correspondante »). Une seule partie ouverte à la fois ; retoucher sa tuile la replie.
         La pastille dit ce qui appelle : voyages en cours, points qui appellent, armées. -->
    <div v-show="!viewed" ref="tabsEl" class="map-tabs" role="tablist">
      <button
        v-for="t in mapTabs"
        :key="t.id"
        type="button"
        role="tab"
        class="map-tab"
        :class="[t.id, { on: mapPanel === t.id, alert: t.alert }]"
        :aria-selected="mapPanel === t.id"
        @click="toggleMapPanel(t.id)"
      >
        <span class="mt-emo">{{ t.emo }}</span>
        <span class="mt-lab">{{ t.label }}</span>
        <span v-if="t.n" class="mt-dot">{{ t.n }}</span>
        <span class="mt-chev" aria-hidden="true">{{ mapPanel === t.id ? '▾' : '▸' }}</span>
      </button>
    </div>
    <ControlPointsSheet
      v-if="mapPanel === 'ctl'"
      :model-value="true"
      inline
      :rows="ctlRoster"
      :advs="char.advList"
      :reinforceable="reinforceable"
      @open="openFromList"
      @reinforce="(p) => (quickId = p.id)"
    />
    <!-- 🏠 La base, comme un lieu fixe : qui y est, et où les envoyer. -->
    <BaseGarrisonSheet
      v-model="baseOpen"
      :champs="baseChamps"
      :away="char.advList.length - baseChamps.length"
      :mil-home="milHome"
      :hero-home="!heroUnavailable"
      :hero-status="heroBaseStatus"
      :targets="baseTargets"
      :leg-min="baseLegMin"
      :busy="ctlBusy"
      @send="sendFromBase"
    />
    <!-- ➕ Renfort direct depuis une case libre de la liste (cf. `QuickReinforceSheet`). -->
    <QuickReinforceSheet
      :poi="quickPoi"
      :champs="freeSorted"
      :champ-free="quickFree.champ"
      :mil-free="quickFree.total"
      :mil-room="quickFree.mil"
      :mil-home="milHomeFree"
      :militia-min="quickMilitiaMin"
      :champ-min="quickChampMin"
      :arrival="quickArrival"
      :sources="quickSources"
      :hold="quickHold"
      :sel="quickSel"
      :sel-hold="quickSelHold"
      :delay-min="quickDelayMin"
      :max-delay-min="PLAN_MAX_DELAY_MS / 60_000"
      :depart-label="quickDepartLabel"
      :planned="quickPlanned"
      :busy="ctlBusy"
      @close="quickId = null"
      @delay="(n: number) => (quickDelayMin = n)"
      @cancel="quickCancel"
      @toggle-champ="(id: string) => (quickSel = toggleReinfChamp(quickSel, id, quickFree))"
      @militia="(n: number) => (quickSel = setReinfMilitia(quickSel, n, milHomeFree, quickFree))"
      @transfer="
        (from: string, id: string) =>
          (quickSel = toggleReinfTransfer(quickSel, from, id, quickFree))
      "
      @send="quickSend"
    />

    <!-- 🧭 Les voyages en cours et l'équipe du voyage touché (cf. `TripsPanel`). -->
    <p v-if="mapPanel === 'trips' && !trips.length && !attacks.length" class="map-tab-empty">
      Aucune expédition en cours ni armée en marche : touche un lieu de la carte pour envoyer une
      équipe.
    </p>
    <TripsPanel
      v-if="mapPanel === 'trips'"
      v-model:focus="focusTrip"
      :trips="trips"
      :hero-profile="character.profile"
      :recallable="recallableTrips"
      :boosts="focusBoosts"
      :attacks="attacks"
      :holds="attackHolds"
      :now="coarseNow"
      @recall="recallTripByKey"
      @boost="boostTrip"
      @attack="openAttack"
      @cancel-plan="quickCancel"
    />

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
          :engaged="engagedTrip"
          :facts="poiFacts"
          :ambush-left="selectedAmbushLeft"
          :is-rift="!!selectedRift"
          :warband="selectedWarband"
          :seal-stock="sealStock"
          :busy-seal="busySeal"
          @close="selected = null"
          @seal="doSeal"
        />
        <!-- ⚔️ D'autres équipes y marchent déjà : on peut en envoyer une de plus. -->
        <p v-if="marchingNote && !engagedTrip" class="sh-note">⚔️ {{ marchingNote }}</p>
        <!-- 🏅 L'ANCIENNETÉ du point (2026-09-30) : son cran, ce qu'il rapporte, ce qu'il attire. -->
        <p v-if="tierLine" class="ctl-line ctl-tier">
          <b>{{ tierLine.title }}</b> <span class="ctl-dim">· {{ tierLine.detail }}</span>
        </p>
        <!-- 📜 LA DERNIÈRE ATTAQUE (demandé) : gardée sur le lieu, car la boîte 📬 l'oublie en
             moins d'un jour. Toucher la ligne rouvre le rapport complet (lecture seule). -->
        <button v-if="lastAttack" type="button" class="ctl-last" @click="openLastAttack">
          <span class="ctl-last-t">{{ lastAttack.title }}</span>
          <span class="ctl-dim">· {{ lastAttackWhen }} · voir le rapport ›</span>
        </button>
        <!-- ⚔️ Déjà attaqué : plus rien à envoyer, la fiche s'arrête à ce qu'il rapporte. -->
        <template v-if="!engagedTrip">
          <!-- 🏰 UN POINT DE CONTRÔLE TENU : sa garnison, ce qu'il produit, quand l'ennemi
             revient. On ramène, on renforce ; la production arrive toute seule. -->
          <div v-if="liveControl?.owner === 'player'" class="ctl-panel">
            <!-- 🧺 LA PRODUCTION EN TÊTE (demandé : « l’info de la rune est perdue au milieu de
               tout le détail ») : ce qui attend en gros, la jauge et le TEMPS avant la suite,
               le débit en petit (`controlYieldCard`). Plus de bouton de récolte (2026-09-29) : ce qu'il
               produit est versé tout seul (`autoCollectControls`). -->
            <div
              v-if="yieldCard"
              class="yield-card"
              :class="{ ready: yieldCard.ready, full: yieldCard.full }"
            >
              <div class="yield-head">
                <span class="yield-emo">{{ yieldCard.emoji }}</span>
                <span class="yield-main">
                  <b class="yield-value">{{ yieldCard.value }}</b>
                  <span class="yield-what">{{ yieldCard.what }}</span>
                </span>
              </div>
              <div v-if="yieldCard.pct !== null" class="yield-bar">
                <i :style="{ width: Math.round(yieldCard.pct * 100) + '%' }" />
              </div>
              <p v-if="yieldCard.gauge" class="yield-gauge">
                {{ yieldCard.full ? '✅' : '⏳' }} {{ yieldCard.gauge }}
              </p>
              <p v-if="yieldCard.rate" class="yield-rate">{{ yieldCard.rate }}</p>
            </div>
            <!-- 💎 LE LAPIDAIRE : la compétence que son champion polit, et où il en est. -->
            <div v-if="liveControl.kind === 'lapidary'" class="carto-box">
              <p class="carto-q">💎 Quelle compétence polir ?</p>
              <p v-if="!lapisRows.length" class="carto-q">
                Poste un champion qui porte une compétence sous le niveau 5.
              </p>
              <div v-else class="carto-grid">
                <button
                  v-for="r in lapisRows"
                  :key="r.id"
                  type="button"
                  class="carto-tile"
                  :class="{ on: liveControl.lapis === r.id }"
                  :aria-pressed="liveControl.lapis === r.id"
                  :disabled="ctlBusy || r.max"
                  @click="chooseLapis(r.id)"
                >
                  <span class="carto-emo">{{ r.emoji }}</span>
                  <span class="carto-lab">{{ r.name }} · niv {{ r.level }}</span>
                  <span class="carto-lab">{{ r.max ? 'au maximum' : r.left }}</span>
                </button>
              </div>
            </div>
            <!-- 🗺️ LE CARTOGRAPHE : le lieu qu'il fait revenir sur l'île (`CARTO_TYPES`). -->
            <div v-if="liveControl.kind === 'cartographer'" class="carto-box">
              <p class="carto-q">🗺️ Quel lieu faire revenir plus souvent ?</p>
              <div class="carto-grid">
                <button
                  v-for="t in CARTO_TYPES"
                  :key="t"
                  type="button"
                  class="carto-tile"
                  :class="{ on: liveControl.favor === t }"
                  :aria-pressed="liveControl.favor === t"
                  :disabled="ctlBusy"
                  @click="chooseCarto(t)"
                >
                  <span class="carto-emo">{{ POI_EMO[t] }}</span>
                  <span class="carto-lab">{{ POI_LABEL[t] }}</span>
                </button>
              </div>
            </div>
            <!-- ⛵ LA FORTERESSE EST LE PORT (signalé : « elle me permet d'envoyer des champions
               mais je ne sais pas où ») : on dit à quoi sert sa garnison, et on traverse d'ici.
               Mêmes îles et mêmes refus que le panneau de l'archipel (`crossInfo`). -->
            <div v-if="liveControl.kind === 'fortress'" class="port-box">
              <p class="port-txt">
                ⛵ <b>Le port de l'île.</b> Tu choisis qui embarque : ton héros (obligatoire pour
                une île jamais visitée), sa garnison et tes champions libres — ceux postés sur un
                autre lieu restent sur l'île.
              </p>
              <p v-if="sailing" class="port-txt">
                En mer vers l'île {{ sailing.to }} : la traversée se suit dans le panneau de
                l'archipel, en haut de la carte.
              </p>
              <template v-else>
                <q-btn
                  v-for="t in portTargets"
                  :key="t.id"
                  no-caps
                  unelevated
                  class="port-btn"
                  :color="t.block && !t.visited ? 'grey-8' : 'primary'"
                  :text-color="t.block && !t.visited ? undefined : 'dark'"
                  :disable="(!!t.block && !t.visited) || archBusy"
                  :label="`⛵ Traverser vers l'île ${t.id} · ${t.name}`"
                  @click="crossTo(t.id)"
                />
                <p v-for="t in portBlocked" :key="'b' + t.id" class="port-why">
                  Île {{ t.id }} : {{ t.block }}
                </p>
              </template>
            </div>
            <!-- 🏰 QUI L'OCCUPE (demandé) : la garnison et les renforts en route, en tuiles.
               Toucher un champion le sélectionne pour le RAMENER. -->
            <p class="ctl-line">
              <template v-if="unlimitedGarrison">
                🏰 <b>Garnison {{ controlCount }}{{ liveControl.hero ? ' + ton héros' : '' }}</b>
                <span class="ctl-dim"> · sans limite</span>
              </template>
              <template v-else>
                🏰 <b>Garnison {{ controlCount }}/{{ MILITIA.perPoint }}</b>
                <span class="ctl-dim">
                  · {{ controlMembers.length + controlAway.length }}/{{
                    seatsOf(liveControl.kind)
                  }}
                  champion{{ seatsOf(liveControl.kind) > 1 ? 's' : '' }}</span
                >
              </template>
              <span class="ctl-dim"> · touche un membre pour le ramener ou le remplacer</span>
            </p>
            <!-- 🎯 Sous chaque occupant : ce que la tenue perdrait sans lui (`occupantLoss`). -->
            <div class="car-pick">
              <!-- 🏰 Le héros posté à la forteresse (2026-10-02). -->
              <div v-if="liveControl.hero" class="mil-tile hero-tile">
                <span class="mil-emo">🦸</span>
                <span class="mil-name">Ton héros</span>
                <span class="mil-sub">posté ici</span>
              </div>
              <AdvPickTile
                v-for="m in controlMembers"
                :key="m.adv.id"
                :adv="m.adv"
                :on="ctlRecallSel.includes(m.adv.id)"
                :reason="
                  m.arriveIn > 0
                    ? `🧭 en route · ${formatDuration(m.arriveIn)}`
                    : (ctlReservedLabel.get(m.adv.id) ?? null)
                "
                :gain="occupantLoss[m.adv.id] ? -occupantLoss[m.adv.id]!.loss : null"
                :gain-title="lossTitle(m.adv.id)"
                @toggle="toggleRecall(m.adv.id)"
              />
              <!-- ⚔️🏰 En SORTIE (demandé) : ils reviendront, leur place les attend — la tuile le
                 dit au lieu de laisser croire la place libre. Pas sélectionnables : ils ne sont
                 pas là. -->
              <AdvPickTile
                v-for="m in controlAway"
                :key="'away' + m.adv.id"
                class="away-tile"
                :adv="m.adv"
                :on="false"
                :reason="`⚔️ en sortie · revient ${m.backIn > 0 ? 'dans ' + formatDuration(m.backIn) : 'bientôt'}`"
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
                <span class="mil-emo"><MilitiaPortrait /></span>
                <span class="mil-name">{{ MILITIA_NAME }}</span>
                <span v-if="m.arriveIn > 0" class="mil-sub"
                  >🧭 {{ formatDuration(m.arriveIn) }}</span
                >
                <span
                  v-else-if="occupantLoss[m.id]"
                  class="mil-loss"
                  :class="{ zero: occupantLoss[m.id]!.loss === 0 }"
                  :title="lossTitle(m.id) ?? ''"
                  >🎯 −{{ occupantLoss[m.id]!.loss }} %</span
                >
              </button>
              <!-- ➕ LES PLACES VIDES (demandé : « les 5 slots ») : la garnison se lit comme 5
                 cases, pleines ou non. Toucher une case vide amène au renfort. Au-delà des
                 places de champion, une case ne prend qu'un milicien (`controlFree`). -->
              <button
                v-for="slot in garrisonSlots"
                :key="'slot' + slot.i"
                type="button"
                class="slot-tile"
                :aria-label="slot.label"
                @click="openQuick"
              >
                <span class="slot-plus">＋</span>
                <span class="slot-name">{{ slot.label }}</span>
              </button>
            </div>
            <!-- ⏳ RETOURS PROGRAMMÉS (demandé : « quand je fais rappel depuis le lieu fixe, il
               faut que je puisse le programmer ») : ils restent en poste jusqu'au départ. -->
            <div v-for="m in ctlPlannedBack" :key="m.id" class="ctl-plan">
              <span class="ctl-plan-main"
                >⏳ <b>{{ m.count }}</b> retour{{ m.count > 1 ? 's' : '' }} programmé{{
                  m.count > 1 ? 's' : ''
                }}
                · dans {{ m.departIn }} ({{ m.departAt }})</span
              >
              <button
                type="button"
                class="ctl-plan-x"
                :disabled="ctlBusy"
                @click="quickCancel(m.id)"
              >
                Annuler
              </button>
            </div>
            <DepartDelayPicker
              v-if="ctlRecallSel.length || controlMembersHere"
              v-model="ctlRecallDelay"
              label="Retour"
              :max-delay-min="PLAN_MAX_DELAY_MS / 60_000"
              :at="ctlRecallAt"
            />
            <button
              v-if="liveControl.hero"
              type="button"
              class="ctl-recall ctl-back"
              :disabled="ctlBusy"
              @click="recallHero"
            >
              🦸 Rappeler le héros à la base
            </button>
            <button
              v-if="ctlRecallSel.length"
              type="button"
              class="ctl-recall ctl-back"
              :disabled="ctlBusy || (ctlRecallDelay > 0 && !ctlSchedulable.length)"
              @click="releaseCtl"
            >
              {{ recallSelLabel }}
            </button>
            <!-- ⇄ REMPLACER (demandé) : UN membre coché peut échanger sa place avec quelqu'un de
               la base ou d'un autre point. Chaque ligne dit la tenue APRÈS l'échange, le
               trajet, et ce que devient l'autre point. Le remplacé part prendre la place du
               remplaçant (`swapGarrison`). -->
            <div v-if="swapOut && swapCandidates.length" class="swap">
              <button
                type="button"
                class="swap-toggle"
                :aria-expanded="swapOpen"
                @click="swapOpen = !swapOpen"
              >
                <span class="swap-tt">
                  ⇄ <b>Remplacer {{ swapOut.name }}</b>
                  <span v-if="swapOut.loss" class="ctl-dim"
                    >· apporte {{ swapOut.loss.loss }} % de tenue</span
                  >
                </span>
                <span class="swap-count" :class="{ none: !swapAvail }">{{
                  swapAvail ? `${swapAvail} dispo` : 'aucun'
                }}</span>
                <q-icon :name="swapOpen ? 'expand_less' : 'expand_more'" size="20px" />
              </button>
              <div v-if="swapOpen" class="swap-groups">
                <div v-for="g in swapGroups" :key="g.key" class="swap-group">
                  <p class="swap-ghead">
                    <span>{{ g.key === SWAP_BASE_KEY ? '🏠 Base' : g.label }}</span>
                    <span class="ctl-dim">{{ g.avail }}/{{ g.rows.length }} dispo</span>
                  </p>
                  <div class="swap-list">
                    <button
                      v-for="r in g.rows"
                      :key="r.key"
                      type="button"
                      class="swap-row"
                      :disabled="!!r.why || ctlBusy"
                      :title="r.why ?? ''"
                      @click="swapCtl(r)"
                    >
                      <span class="swap-who">
                        <span class="swap-name">{{ r.adv ? '🗡️' : '🛡️' }} {{ r.name }}</span>
                        <span class="swap-sub">{{
                          r.why ?? `🧭 ${formatDurationMin(r.min)}`
                        }}</span>
                        <span v-if="r.other" class="swap-sub"
                          >là-bas : {{ r.other.before }} → {{ r.other.after }} %</span
                        >
                      </span>
                      <span v-if="!r.why" class="swap-res">
                        <b>{{ r.pct }} %</b>
                        <span class="swap-delta" :class="{ up: r.delta > 0, down: r.delta < 0 }"
                          >{{ r.delta > 0 ? '+' : r.delta < 0 ? '−' : '='
                          }}{{ r.delta ? Math.abs(r.delta) : '' }}</span
                        >
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
                      `🧭 ${formatDurationMin(t.min)} · ${Number.isFinite(t.free) ? `${t.free} place${t.free > 1 ? 's' : ''}` : 'sans limite'}`
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
            <p v-if="controlNote" class="ctl-line ctl-dim">{{ controlNote }}</p>
            <!-- ⚔️ Dans les dernières heures seulement, on prévient — jamais l'heure (v0.1254). -->
            <p v-if="livePoi && attackImminent(livePoi, coarseNow)" class="ctl-line ctl-alert">
              ⚠️ <b>Bataille imminente</b> : une troupe ennemie marche sur ce lieu. Un renfort
              proche peut encore arriver à temps.
            </p>
            <!-- ⚠️ Sinon l'instant de la reprise n'est PAS annoncé (v0.1239, décision de
               l'utilisateur) : on sait seulement qu'elle viendra, plus tôt si l'on s'entraîne. -->
            <p v-else-if="liveControl.owner === 'player'" class="ctl-line ctl-warn">
              ⚔️ L’ennemi reviendra, prévenu au dernier moment — plus souvent si tu utilises
              beaucoup la carte, et les citadelles découvertes lancent des raids n’importe où.
              <template v-if="ctlHidden">
                Sa citadelle est encore cachée : elle attaque 2× moins souvent.</template
              >
              Force inconnue : ta garnison ne gagnera pas toujours.
            </p>
            <!-- 🛡️ LA TENUE À L'ATTAQUE (demandé) : jugée sur ceux qui seront LÀ — garnison et
               renforts arrivés avant l'assaut (`defendersAtAttack`), contre l'ennemi le plus fort
               possible. L'heure restant secrète hors de la fenêtre imminente, les renforts en
               route y comptent tous. -->
            <p v-if="defenseNow" class="ctl-line ctl-hold">
              🛡️ À l’attaque : <b>{{ defenseNow.count }}</b> défenseur{{
                defenseNow.count > 1 ? 's' : ''
              }}
              · repousse environ <b>{{ defenseNow.pct }} %</b>
              {{ defenseNow.vsArmy ? 'face à l’armée en approche' : 'des assauts' }}
              <span v-if="defenseNow.late" class="ctl-dim">
                · {{ defenseNow.late }} renfort{{ defenseNow.late > 1 ? 's' : '' }} arrivera trop
                tard</span
              >
            </p>
            <button
              v-if="controlCount"
              type="button"
              class="ctl-recall"
              :disabled="ctlBusy"
              @click="recallCtl"
            >
              {{
                ctlRecallDelay > 0
                  ? `⏳ Programmer le retour de toute la garnison`
                  : 'Rappeler toute la garnison'
              }}
            </button>
          </div>
          <p v-else-if="citadelRestIn > 0" class="sh-note">
            🏯 Abattue : elle se reconstruit, inattaquable encore
            {{ formatDuration(citadelRestIn) }}. Pendant ce temps, aucune reprise sur les points
            qu’elle attaque.
          </p>
          <p
            v-else-if="liveControl?.kind === 'objective' || liveControl?.kind === 'fortress'"
            class="sh-note"
          >
            {{
              liveControl.kind === 'fortress' && liveControl.locked
                ? '🔒 Verrouillée : abats d’abord les objectifs de l’île.'
                : liveControl.kind === 'fortress'
                  ? '🏰 Prise, elle se tient : toute l’équipe y reste, le héros aussi (garnison sans limite, jamais reprise). La traversée part de là.'
                  : liveControl.razes
                    ? '🪺 Attaque-le avec tes champions, le héros, ou le héros seul : abattu, il quitte la carte et tout le monde rentre (pas de garnison). D’autres nids peuvent encore naître.'
                    : '⚔️ Attaque-le avec tes champions, le héros, ou le héros seul : pris, il se tient avec ceux qui y restent, et la forteresse viendra le reprendre en priorité.'
            }}
          </p>
          <p v-else-if="liveControl?.kind === 'citadel'" class="sh-note">
            🏯 Attaque-la avec tes champions, le héros, ou le héros seul : on ne l’occupe pas, tout
            le monde rentre après l’assaut. Abattue, elle offre {{ CONTROL_YIELD.citadel }} et monte
            d’un palier ; un échec la fait redescendre.
          </p>
          <p v-else-if="liveControl" class="sh-note">
            🏰 Prends-le avec 1 à 3 champions, sans le héros :
            {{ seatsOf(liveControl.kind) === 1 ? 'un seul y restera' : 'ils y resteront' }} en
            garnison ({{ CONTROL_YIELD[liveControl.kind] }}), jusqu’à ce que l’ennemi le reprenne
            (entre 1 et 3 jours, plus souvent si tu utilises beaucoup la carte<template
              v-if="ctlHidden"
              >, 2× moins si sa citadelle reste cachée</template
            >). Chaque ennemi abattu, à la prise comme en défense, rapporte de l’XP.
            <template v-if="militiaBuilt"
              >Une fois pris, des miliciens de ta Caserne peuvent y remplacer tes
              champions.</template
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
               garnison y fournit les champions, et ils y reviennent. ⚔️🧭 PLUSIEURS départs
               cochés = une ATTAQUE COMBINÉE : chaque groupe part à son heure pour arriver
               ensemble (le plan s'affiche dessous). -->
            <div v-if="originOptions.length" class="origin-pick">
              <p class="car-cap">
                🧭 Choisis tes champions dans chaque lieu, du plus proche au plus loin · plusieurs
                lieux = une attaque combinée
              </p>
              <!-- ⚔️🧭 LE PLAN : qui part d'où, et QUAND, pour que tous arrivent ensemble. Un groupe
                 qui attend reste chez lui (il produit, il défend) — s'il est battu avant de
                 partir, il ne vient pas. -->
              <div v-if="combined && partySize" class="wing-plan">
                <p class="car-cap">
                  ⚔️ <b>Attaque combinée</b> · tous arrivent dans
                  <b>{{ formatDurationMin(Math.max(...wingPlan.map((w) => w.legMin))) }}</b>
                </p>
                <div v-for="w in wingPlan" :key="w.id" class="wing-row" :class="{ empty: !w.n }">
                  <span class="wing-emo">{{ w.emo }}</span>
                  <span class="wing-name">{{ w.label }}</span>
                  <span class="wing-n">{{ w.n }} 🗡️</span>
                  <span class="wing-when">{{
                    !w.n
                      ? 'personne'
                      : w.departInMin <= 0
                        ? 'part maintenant'
                        : `part dans ${formatDurationMin(w.departInMin)}`
                  }}</span>
                  <span
                    v-if="w.n"
                    class="wing-back"
                    :title="
                      w.wonMin < w.legMin
                        ? 'Retour chez lui : si le point est pris / si l’assaut échoue'
                        : 'Retour chez lui'
                    "
                    >↩ {{ controlReturnValue(w.legMin, w.wonMin) }}</span
                  >
                </div>
                <p class="car-cap">
                  Un groupe battu avant son départ (siège, reprise de son point) ne vient pas.
                </p>
              </div>
            </div>
            <!-- 🧝 Le héros n'est plus ici : il est une tuile PARMI les effectifs, dans le groupe
               de la base (demandé, `HeroPickTile`). Reste « tout le vivier ». -->
            <div class="party-top">
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
              👥
              <b>{{ partyAdvs.length }}{{ Number.isFinite(partyMax) ? '/' + partyMax : '' }}</b>
              champions · XP partagée <b>×{{ partyXpSplit.toFixed(2).replace('.', ',') }}</b> chacun
              <span v-if="!partyHeroOn"> · 🧭 seuls, ils apprennent plus</span>
            </p>
            <p v-if="controlReturnNote" class="car-cap">↩️ {{ controlReturnNote }}</p>
            <!-- 🧝 Le héros peut tenir garnison partout (étape 6 bis) : il défend le lieu, ne
               rentre pas, et se rappelle depuis la fiche du lieu. -->
            <button
              v-if="heroStayChoice"
              type="button"
              class="stay-chip hero-stay"
              :class="{ on: partyHeroStay }"
              :aria-pressed="partyHeroStay"
              @click="partyHeroStay = !partyHeroStay"
            >
              {{ partyHeroStay ? '🏰' : '↩' }} Le héros
              {{ partyHeroStay ? 'reste en garnison' : 'rentre après la prise' }}
            </button>
            <p v-else-if="heroStays && !partyAdvs.length" class="car-cap">
              🧝 Seul, le héros reste tenir le lieu s’il le prend.
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
            <!-- 🧭 PAR LIEU (demandé) : dès qu'un point fixe est coché, les champions se rangent
               sous le lieu d'où ils partiraient, du plus proche de la cible au plus loin. -->
            <div v-if="partyGroups.length" class="car-pick">
              <template v-for="g in partyGroups" :key="g.id">
                <!-- 🧭 Toucher le lieu coche tous ses champions, ou les décoche tous (demandé). -->
                <button
                  type="button"
                  class="pool-head"
                  :class="`pool-${partyGroupState(g.advs.map((a) => a.id))}`"
                  :disabled="!g.advs.length"
                  :aria-pressed="partyGroupState(g.advs.map((a) => a.id)) === 'all'"
                  :title="
                    partyGroupState(g.advs.map((a) => a.id)) === 'all'
                      ? `Décocher tous les champions de ${g.label}`
                      : `Cocher tous les champions de ${g.label}`
                  "
                  @click="togglePartyGroup(g.advs.map((a) => a.id))"
                >
                  <span class="pool-emo">{{ g.emo }}</span>
                  <span class="pool-name">{{ g.label }}</span>
                  <span class="pool-leg">à {{ formatDurationMin(g.legMin) }}</span>
                  <span class="pool-n">{{ g.advs.length }} 🗡️</span>
                  <span v-if="g.advs.length" class="pool-check">{{
                    partyGroupState(g.advs.map((a) => a.id)) === 'all'
                      ? '✓ tous'
                      : partyGroupState(g.advs.map((a) => a.id)) === 'some'
                        ? '◐'
                        : '＋ tous'
                  }}</span>
                </button>
                <HeroPickTile
                  v-if="g.id === 'base'"
                  :on="partyHeroOn"
                  :block="partyHeroBlock ? PARTY_HERO_BLOCK_LABEL[partyHeroBlock] : null"
                  :sub="heroPostSub ?? 'part de la base · sans XP'"
                  :gain="partyGain.hero"
                  @toggle="partyHero = !partyHero"
                />
                <AdvPickTile
                  v-for="a in g.advs"
                  :key="a.id"
                  :adv="a"
                  :on="partyEscort.includes(a.id)"
                  :xp="partyXp[a.id]"
                  :gain="partyGain[a.id]"
                  @toggle="togglePartyAdv(a.id)"
                />
                <p v-if="!g.advs.length" class="pool-empty">Personne de prêt ici.</p>
              </template>
              <template v-if="showBlocked">
                <AdvPickTile
                  v-for="b in partyBlocked"
                  :key="b.adv.id"
                  :adv="b.adv"
                  :on="false"
                  :reason="ADV_UNAVAILABLE_LABEL[b.why]"
                />
              </template>
            </div>
            <div v-else class="car-pick">
              <HeroPickTile
                :on="partyHeroOn"
                :block="partyHeroBlock ? PARTY_HERO_BLOCK_LABEL[partyHeroBlock] : null"
                :sub="heroPostSub ?? 'sans XP'"
                :gain="partyGain.hero"
                @toggle="partyHero = !partyHero"
              />
              <AdvPickTile
                v-for="a in partyPoolSorted"
                :key="a.id"
                :adv="a"
                :on="partyEscort.includes(a.id)"
                :xp="partyXp[a.id]"
                :gain="partyGain[a.id]"
                @toggle="togglePartyAdv(a.id)"
              />
              <!-- ⚠️ LES INDISPONIBLES SONT MASQUÉS PAR DÉFAUT (demandé) : ils prenaient la moitié
                 de la grille pour des tuiles qu'on ne peut pas toucher. Le bouton dit combien il
                 y en a, et pourquoi chacun est indisponible reste écrit sur sa tuile. -->
              <template v-if="showBlocked">
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
              v-if="char.advList.length && partyBlocked.length"
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
            <SupplyPicker :key="selected?.id" :rows="supplyRows" @toggle="toggleSupply" />
            <!-- 📐 Les règles de l'expédition, repliées : trois lignes de texte à chaque ouverture. -->
            <details class="sh-rules">
              <summary>ⓘ Règles de cette expédition</summary>
              <p v-if="selectedCamp" class="sh-note">
                Sans le héros : de l’or (et des pierres chez les morts-vivants). En cas de défaite,
                les champions tombés partent à l’infirmerie ; le héros, lui, rentre sans butin.
              </p>
              <p v-else-if="!teamOnly" class="sh-note">
                Des gardes tiennent le lieu : il faut les abattre pour récolter. Repoussée, l’équipe
                ne ramène rien et les champions tombés partent à l’infirmerie. Sur la route, des
                bandits peuvent tendre une embuscade — plus l’équipe est complète, mieux elle tient.
              </p>
              <p v-else class="sh-note">Une faille ne rend que du 💠, jamais d’objet.</p>
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
            <!-- ⚠️ TOUS les refus sont dits aussi (signalé : « le bouton est grisé » sans
               raison). « Équipe vide » est déjà écrit sur le bouton (« Choisis ton groupe »). -->
            <!-- 💀 ON DIT POURQUOI, ET LA PARADE : un bouton qui se grise en silence se lit
                 comme une panne. -->
            <p v-if="partySendBlock === 'hopeless'" class="sh-risk">
              💀 {{ PARTY_SEND_BLOCK_LABEL.hopeless }}. Emmène plus de champions, monte-les, ou vise
              un lieu d’un rang plus bas.
            </p>
            <p v-else-if="partySendBlock && partySendBlock !== 'empty'" class="sh-risk">
              ⛔ {{ PARTY_SEND_BLOCK_LABEL[partySendBlock] }}.
            </p>
            <p v-if="combinedBlock" class="sh-risk">⚔️ {{ combinedBlock }}.</p>
            <p v-else-if="partySize && !progress.ready.value" class="sh-away">
              ⏳ Chargement de ta progression…
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
        </template>
      </div>
    </transition>

    <!-- Emplacement de filon (construire / récolter / améliorer) — MODALE centrée
         (clic-dehors ou croix pour fermer ; plus de scroll en bas de page). -->
    <!-- Modale de collecte au retour -->
    <RecallSheet
      v-model="recallOpen"
      :ask="recallAsk?.info ?? null"
      :preview="recallPrev"
      :crew="recallCrew"
      :militia="recallMilitia"
      :busy="recallBusy"
      @confirm="confirmRecall"
    />
    <q-dialog v-model="collectOpen">
      <q-card v-if="lastOutcome" class="van-card">
        <div class="van-kicker">📬 Retour de mission</div>
        <MissionReportCard
          :card="messageCard(lastOutcome, char.advList)"
          :state="lastState === 'done' ? 'none' : lastState"
          :wait-label="`retour dans ${formatDuration((lastOutcome.claimAt ?? lastOutcome.resolvedAt) - now)}`"
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

    <!-- ⚡🔙 LE VOYAGE TOUCHÉ, QUAND SON DÉTAIL N'EST PAS AFFICHÉ (signalé : depuis les tuiles
         par-dessus la carte, toucher une expédition ferme le panneau pour montrer le tracé, et
         les boosts n'étaient plus accessibles). Une barre en bas à gauche, à côté des boutons
         ronds : accélérer, faire demi-tour, ou refermer. -->
    <div v-if="tripBar" class="trip-bar" role="group" :aria-label="tripBar.title">
      <button
        v-if="tripBar.boost"
        type="button"
        class="tb-btn tb-boost"
        aria-label="Accélérer ce voyage"
        @click="boostAskOpen = true"
      >
        ⚡
      </button>
      <button
        v-if="tripBar.recall"
        type="button"
        class="tb-btn"
        aria-label="Faire demi-tour"
        @click="recallTripByKey(tripBar.key)"
      >
        🔙
      </button>
      <button type="button" class="tb-btn tb-x" aria-label="Fermer" @click="focusTrip = null">
        ✕
      </button>
    </div>
    <q-dialog v-model="boostAskOpen">
      <q-card class="boost-ask">
        <div class="ba-title">⚡ Accélérer ce voyage</div>
        <p v-if="tripBar?.boost?.block" class="ba-note">{{ tripBar.boost.block }}</p>
        <div v-else-if="tripBar?.boost" class="ba-row">
          <button
            v-for="b in tripBar.boost.choices"
            :key="b.id"
            type="button"
            class="ba-btn"
            :class="{ lossy: b.lostMs > 0 }"
            @click="((boostAskOpen = false), boostTrip(tripBar.key, b.id))"
          >
            <b>⚡ {{ b.minutes >= 60 ? b.minutes / 60 + ' h' : b.minutes + ' min' }}</b>
            <span class="ba-n">×{{ b.count }}</span>
            <small>−{{ formatDuration(b.gainMs)
              }}{{ b.lostMs > 0 ? ` · ${formatDuration(b.lostMs)} perdues` : '' }}</small>
          </button>
        </div>
        <q-btn flat label="Fermer" class="ba-close" @click="boostAskOpen = false" />
      </q-card>
    </q-dialog>

    <!-- 🧭🏰 À gauche du ↕️ : les tuiles des expéditions et des places fortes, par-dessus la
         carte (essai). La pastille reprend celle des tuiles sous la carte. -->
    <button
      v-for="(t, i) in mapTabs"
      v-show="!viewed"
      :key="'fab-' + t.id"
      type="button"
      class="slide-fab tile-fab"
      :class="{ on: overlay === t.id, alert: t.alert }"
      :style="{ right: 16 + 56 * (mapTabs.length - i) + 'px' }"
      :aria-label="t.label"
      :title="t.label"
      :aria-pressed="overlay === t.id"
      @click="toggleOverlay(t.id)"
    >
      <span class="tf-emo">{{ t.emo }}</span>
      <span v-if="t.n" class="tf-dot">{{ t.n }}</span>
    </button>
    <!-- ↕️ FIXE EN BAS DE L'ÉCRAN (demandé) : ↓ ouvre le détail des expéditions et le cale en
         bas, ↑ remonte en haut. Le sens suit la place des tuiles à l'écran (`mapSlide.ts`). -->
    <button
      type="button"
      class="slide-fab"
      :aria-label="slideDir === 'down' ? 'Voir les expéditions' : 'Remonter en haut'"
      :title="slideDir === 'down' ? 'Voir les expéditions' : 'Remonter en haut'"
      @click="slideMap"
    >
      <q-icon
        :name="slideDir === 'down' ? 'keyboard_arrow_down' : 'keyboard_arrow_up'"
        size="28px"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  FORTRESS_ID,
  heroPostOf,
  islandConquest,
  islandTargetLabel,
  isIslandTargetId,
} from '@/lib/islandConquest';
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { poiHaulPreview, poiTeamHaul, formatHaul } from '@/lib/poiYield';
import { attackWingVoyages, type CombinedAttack } from '@/lib/combinedAttack';
import {
  attackBoostPlan,
  BOOST_BLOCK_LABEL,
  boostChoices,
  voyageBoostPlan,
} from '@/lib/speedBoost';
import type { ActiveExpedition } from '@/lib/expedition';
import {
  fogRevealPlan,
  fogRadiusAt,
  underFog,
  revealedCount,
  type FogRevealPlan,
} from '@/lib/fogReveal';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import { BOOST_IDS, type BoostId, type SupplyStock } from '@/lib/supplies';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { computeCharacter } from '@/lib/character';
import { DUNGEONS } from '@/data/dungeons';
import { playerWithGear, fxRarity, gradeLabel, RARITY_RANK } from '@/lib/items';
import MissionReportCard from '@/components/MissionReportCard.vue';
import { messageCard } from '@/lib/missionCard';
import AdvPickTile from '@/components/AdvPickTile.vue';
import HeroPickTile from '@/components/HeroPickTile.vue';
import RecallSheet, { type RecallAsk } from '@/components/RecallSheet.vue';
import { FACTION_LOOT_LABEL, campBodyCount, campRewardLabel, forceLootPreview } from '@/lib/camp';
import {
  activeAttacks,
  armyTrajectory,
  controlAttackHold,
  detectionCircles,
  fieldArmySpec,
  type ArmyPath,
} from '@/lib/fieldArmy';
import { poiRank } from '@/lib/poiRank';
import {
  PARTY_HERO_BLOCK_LABEL,
  PARTY_SEND_BLOCK_LABEL,
  partyLegMin,
  tripCrew,
  recallBlocker,
  recallWindow,
  recallPreview,
  type RecallTarget,
  partyCarriesHero,
} from '@/lib/party';
import { buildingLevel, expeditionsUnlocked, travelTimeMult } from '@/lib/buildings';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, seedOf, type Combatant } from '@/lib/combat';
import RiftPortal from '@/components/RiftPortal.vue';
import { SKILLS, SKILL_MAX_LEVEL, type SkillId } from '@/lib/skillRunes';
import DepartDelayPicker from '@/components/DepartDelayPicker.vue';
import {
  POI_EMO,
  POI_LABEL,
  CARTO_TYPES,
  type CartoType,
  poiLabel,
  type ExpeditionMessage,
  EXPE,
  travelPosition,
  mapTravelPoint,
  voyageDrawnEnd,
  warbandAt,
  tripTimeLabel,
  tripLegs,
  voyageProgress,
  underAttackKey,
  voyageTargetShown,
  voyageVanquished,
  voyageFailure,
  poiCombatant,
  simulateArena,
  poiTravelLevel,
  travelOneWayMin,
  expeditionTerrain,
  mapViewOf,
  mapReach,
  type Poi,
  type PoiType,
  HARVEST_TYPES,
  campSpecOf,
  harvestGuardOf,
  harvestGold,
  poiForceOf,
  isRiftPoi,
  citadelRestingUntil,
  isWarbandPoi,
  isClaimable,
  claimState,
  ruinsSealKind,
  haulPills,
  type HaulPill,
  type PartyResult,
  veinDwellMs,
} from '@/lib/expedition';
import MapTerrain from '@/components/MapTerrain.vue';
import MapPoiLayer from '@/components/MapPoiLayer.vue';
import ArchipelPanel from '@/components/ArchipelPanel.vue';
import MapTown from '@/components/MapTown.vue';
import { townDots } from '@/lib/townDots';
import RemoteIslandMap from '@/components/RemoteIslandMap.vue';
import IslandTerrain from '@/components/IslandTerrain.vue';
import { islandTerrain } from '@/lib/islandTerrain';
import { activeIsland, ISLANDS, mapOutpostLevel } from '@/lib/archipelago';
import {
  CROSSING_BLOCK_LABEL,
  islandChampions,
  nextCrossingDeparture,
  openIslands,
  remotePoints,
  seaTrips,
  visitedIslands,
  type RemotePoint,
} from '@/lib/crossing';
import CrossingSheet from '@/components/CrossingSheet.vue';
import TripsPanel, { type MapTrip } from '@/components/TripsPanel.vue';
import { tripFrame } from '@/lib/tripFrame';
import ControlPointsSheet from '@/components/ControlPointsSheet.vue';
import BaseGarrisonSheet from '@/components/BaseGarrisonSheet.vue';
import QuickReinforceSheet from '@/components/QuickReinforceSheet.vue';
import { groupSwapRows, SWAP_BASE_KEY } from '@/lib/swapGroups';
import {
  PLAN_MAX_DELAY_MS,
  plannedCount,
  plannedMilitia,
  plannedSeatsTo,
  plannedTransferIds,
} from '@/lib/plannedMoves';
import { poiTripCategory } from '@/lib/tripFilter';
import { mapSlideDirection, scrollContainerOf, type MapSlide } from '@/lib/mapSlide';
import { revealBlock } from '@/lib/reveal';
import {
  emptyReinfSelection,
  reinfCanAdd,
  reinfCount,
  setReinfMilitia,
  toggleReinfChamp,
  toggleReinfTransfer,
  transfersByOrigin,
  type ReinfSelection,
} from '@/lib/reinforceSelection';
import PoiCard from '@/components/PoiCard.vue';
import SupplyPicker from '@/components/SupplyPicker.vue';
import {
  controlReturnNote as returnNote,
  controlReturnValue,
  winClass,
  type PoiFact,
} from '@/lib/poiFacts';
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
  siegeHoldChance,
  scoutClarity,
  scoutLevel,
  ODDS_LABEL,
  FACTION_EMOJI,
  FACTION_LABEL,
  woundRemainingMs,
} from '@/lib/raid';
import {
  ADV_UNAVAILABLE_LABEL,
  advAvailable,
  advTitle,
  engageCap,
  sortByGradeThenRank,
  type Adventurer,
} from '@/lib/adventurers';
import { formatDuration, formatDurationMin } from '@/lib/duration';
import {
  CONTROL_EMO,
  CONTROL_LABEL,
  CONTROL_YIELD,
  controlFreeSeats,
  garrisonFreeSeats,
  militiaFreeSeats,
  controlRoster,
  garrisonDots,
  controlTravelMult,
  controlYieldCard,
  controlTier,
  controlTierLabel,
  citadelLabel,
  citadelPalier,
  trainingCapLevel,
  seatsOf,
  attackImminent,
  attackerHidden,
  controlDefenseHold,
  lapidaryHours,
  defendersAtAttack,
  imminentControlKey,
  knownAttackAt,
  reinforcementsEnRoute,
  returnsEnRoute,
  tripOriginPoi,
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
import { caravanLegMin, poiOffers } from '@/lib/caravan';
import {
  SWAP_BLOCK_LABEL,
  SWAP_MILITIA_FROM_BASE,
  TRANSFER_BLOCK_LABEL,
  championsAbleToGo,
  legFromSpot,
  readyGarrisons,
  swapBlocker,
  transferBlocker,
  transferSourcesFor,
} from '@/lib/controlRoutes';
import { MILITIA, MILITIA_NAME, MILITIA_PREFIX, isMilitiaId, militiaIn } from '@/lib/militia';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();
const advXpFx = useAdvXpFx();

const TOWN = EXPE.town;

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
// 🏯 Une citadelle encore cachée dans le brouillard ne se dessine pas (elle n'existe pas encore
// pour le joueur : l'Avant-poste la découvre).
const pois = computed<Poi[]>(() =>
  (char.row?.expedition_map?.pois ?? []).filter(
    (p) => !(p.control?.kind === 'citadel' && p.control.discoveredAt === undefined),
  ),
);
// Fond de carte (terrain) déterministe pour le seed de la carte.
const terrain = computed(() =>
  char.row?.expedition_map
    ? expeditionTerrain(char.row.expedition_map.seed)
    : { features: [], rivers: [], tufts: [], patches: [] },
);
/** 🗺️ Fenêtre dessinée (la ville reste en 100,100 ; la carte s'étend en négatif autour). */
const V = computed(() => mapViewOf(char.row?.expedition_map));
/** Rayon révélé par l'Avant-poste : le brouillard commence au-delà. */
// 🏝️ En mode archipel, la carte a la taille de l'île : l'Avant-poste ne règle que la vitesse.
const island = computed(() => activeIsland(char.row?.expedition_map));
/** 🏘️ Sur les îles 2 à 5, le point de départ est un village de pêcheurs, pas la base. */
const townIsVillage = computed(() => (island.value?.id ?? 1) >= 2);
/** 🏝️ La conquête de l'île active (objectifs, forteresse, pacification). */
const islandProgress = computed(() => islandConquest(char.row?.expedition_map));
// 🏝️ Sur une île : toute sa terre ferme (`mapReach`, v1.28.0).
const reveal = computed(() =>
  mapReach(char.row?.expedition_map, mapOutpostLevel(char.row?.expedition_map, char.comptoirLevel)),
);
const islandTerr = computed(() => (island.value ? islandTerrain(island.value.id) : null));
const archBusy = ref(false);
/** ⛵ La traversée : îles ouvertes, visitées, raisons de refus, embarqués possibles, et les
 *  champions restés sur chaque autre île. ⚠️ Les refus viennent du store (`crossingBlock`),
 *  la même règle que celle qui refuse l'envoi. */
const crossInfo = computed(() => {
  const map = char.row?.expedition_map;
  const blocks: Record<number, string | null> = {};
  const away: Record<number, number> = {};
  for (const a of char.advList)
    if (a.elsewhere !== undefined) away[a.elsewhere] = (away[a.elsewhere] ?? 0) + 1;
  // 🛡️ Une réserve par île : l'active dans la base, les autres rangées avec leur carte.
  const militia: Record<number, number> = {};
  if (map?.archipel) militia[map.archipel.island] = char.row?.base?.militia?.home ?? 0;
  for (const [k, im] of Object.entries(map?.islands ?? {}))
    militia[Number(k)] = im.militia?.home ?? 0;
  const fetchable: Record<number, number> = {};
  if (!map?.archipel) return { open: [], visited: [], blocks, fetchable, away, militia };
  const here = map.archipel.island;
  for (const id of visitedIslands(map))
    if (id !== here) {
      const n = islandChampions(char.advList, id, here, now.value).length;
      if (n) fetchable[id] = n;
    }
  for (const i of ISLANDS) {
    const why = char.crossingBlock(i.id);
    blocks[i.id] = why && why !== 'same' && why !== 'locked' ? CROSSING_BLOCK_LABEL[why] : null;
  }
  return {
    open: openIslands(map),
    visited: visitedIslands(map),
    blocks,
    fetchable,
    away,
    militia,
  };
});
/** 🛡️ Les lieux fixes tenus de chaque île RANGÉE, avec leur milice (gérée à distance). */
const remoteInfo = computed(() => {
  const out: Record<number, RemotePoint[]> = {};
  for (const [k, im] of Object.entries(char.row?.expedition_map?.islands ?? {}))
    out[Number(k)] = remotePoints(im);
  return out;
});
/** 🛡️ Fait basculer des miliciens d'une île rangée entre sa réserve et un lieu fixe. */
/** 🗺️ L'île rangée qu'on regarde (`null` = la carte active). */
const viewIsland = ref<number | null>(null);
/** Sa carte, ses lieux tenus et sa réserve — `null` si elle n'est pas (ou plus) rangée. */
const viewed = computed(() => {
  const id = viewIsland.value;
  const im = id === null ? null : char.row?.expedition_map?.islands?.[String(id)];
  const isl = ISLANDS.find((i) => i.id === id);
  if (!im || !isl) return null;
  return {
    island: isl,
    map: im,
    remote: remoteInfo.value[isl.id] ?? [],
    reserve: crossInfo.value.militia[isl.id] ?? 0,
  };
});
function viewIslandMap(id: number | null) {
  viewIsland.value = id;
  // Les panneaux de la carte active n'ont rien à faire sous une île rangée.
  if (id !== null) {
    mapPanel.value = null;
    selected.value = null;
  }
}
/** 🏝️ Le panneau de l'archipel, posé en haut à droite de la carte AFFICHÉE (active ou île
 *  rangée) : une seule liaison pour les deux emplacements. La pastille nomme l'île affichée. */
const archBind = computed(() => ({
  island: island.value,
  shown: viewed.value?.island.id ?? null,
  conquest: islandProgress.value,
  busy: archBusy.value,
  openIds: crossInfo.value.open,
  visitedIds: crossInfo.value.visited,
  crossing: char.row?.expedition_map?.crossing ?? null,
  blocks: crossInfo.value.blocks,
  fetchable: crossInfo.value.fetchable,
  sailings: char.row?.expedition_map?.sailings ?? [],
  heroDepartAt: char.crossingDepartAt(now.value),
  away: crossInfo.value.away,
  militia: crossInfo.value.militia,
  remote: remoteInfo.value,
  now: now.value,
}));
const archOn = {
  view: viewIslandMap,
  cross: crossTo,
  fetch: fetchFrom,
  militia: moveMilitia,
};
async function moveMilitia(e: { island: number; pointId: string; delta: number }) {
  const uid = auth.user?.id;
  if (!uid || archBusy.value) return;
  archBusy.value = true;
  try {
    await char.moveIslandMilitia(uid, e.island, e.pointId, e.delta, Date.now(), heroLevel.value);
  } catch (err) {
    $q.notify({ type: 'negative', message: (err as Error).message });
  } finally {
    archBusy.value = false;
  }
}
/** ⛵ La traversée en cours (réservée ou en mer), s'il y en a une. */
const sailing = computed(() => char.row?.expedition_map?.crossing ?? null);
/** ⛵ Les îles où l'on peut traverser depuis le port (toutes les ouvertes, sauf celle-ci),
 *  avec la raison du refus s'il y en a une (`crossInfo`, la règle du store). */
const portTargets = computed(() => {
  const here = char.row?.expedition_map?.archipel?.island;
  return crossInfo.value.open
    .filter((id) => id !== here)
    .map((id) => ({
      id,
      name: ISLANDS.find((i) => i.id === id)?.name ?? '',
      block: crossInfo.value.blocks[id] ?? null,
      visited: crossInfo.value.visited.includes(id),
    }));
});
const portBlocked = computed(() => portTargets.value.filter((t) => t.block));
/** ⛵ La feuille « Qui embarque ? » : d'où, vers où. */
const crossAsk = ref<{ from: number; to: number } | null>(null);
const crossOpen = ref(false);
/** Partir de l'île active vers `to` (le panneau, le port). */
function crossTo(to: number) {
  const here = char.row?.expedition_map?.archipel?.island;
  if (here === undefined) return;
  crossAsk.value = { from: here, to };
  crossOpen.value = true;
}
/** Faire venir sur l'île active les champions restés sur l'île `from` (sans le héros). */
function fetchFrom(from: number) {
  const here = char.row?.expedition_map?.archipel?.island;
  if (here === undefined) return;
  crossAsk.value = { from, to: here };
  crossOpen.value = true;
}
/** Le héros : obligatoire vers une île jamais visitée, facultatif ensuite, absent au retour. */
const crossHeroMode = computed<'forced' | 'optional' | 'none'>(() => {
  const a = crossAsk.value;
  if (!a || a.from !== island.value?.id) return 'none';
  return crossInfo.value.visited.includes(a.to) ? 'optional' : 'forced';
});
/** Ceux qui peuvent embarquer depuis l'île de départ (la règle du store). */
const crossCandidates = computed(() => {
  const a = crossAsk.value;
  if (!a) return [];
  const ok = new Set(char.boardableIds(a.from, now.value));
  return char.advList.filter((x) => ok.has(x.id));
});
async function confirmCross(pick: { hero: boolean; ids: string[] }) {
  const uid = auth.user?.id;
  const a = crossAsk.value;
  if (!uid || !a || archBusy.value) return;
  archBusy.value = true;
  try {
    if (pick.hero) {
      await char.crossIsland(uid, a.to, Date.now(), pick.ids);
      $q.notify({ type: 'positive', message: `⛵ Traversée réservée vers l'île ${a.to}` });
    } else {
      await char.sailChampions(uid, a.from, a.to, pick.ids, Date.now());
      $q.notify({
        type: 'positive',
        message: `⛵ ${pick.ids.length} champion${pick.ids.length > 1 ? 's naviguent' : ' navigue'} vers l'île ${a.to}`,
      });
    }
    crossOpen.value = false;
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  } finally {
    archBusy.value = false;
  }
}
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
  // 🏝️ Sur une île, pas de brouillard : rien à lever, et le rayon vu de la carte ordinaire
  // reste celui de la carte ordinaire.
  if (island.value) {
    fogPlan.value = null;
    fogR.value = to;
    return;
  }
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
  // Un court délai : le recul part une fois la carte affichée, pas pendant son montage.
  fogWait = setTimeout(start, 250);
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
/** 🔙 Le bout du tracé du héros : le lieu, ou le point où il a fait demi-tour. */
const heroEnd = computed(() => {
  const a = active.value;
  return a ? voyageDrawnEnd(a, now.value) : TOWN;
});
/** 🔙 Le héros encore en chemin vers son lieu peut rebrousser chemin. */
const heroRecallable = computed(() => !!active.value && !recallBlocker(active.value, now.value));
/** Le bout du tracé d'un voyageur : le lieu, ou le point de demi-tour. */
function lineEnd(v: { poi: Poi; end?: { x: number; y: number } }) {
  return v.end ?? v.poi;
}
/** 💀 La cible du héros, terrassée : grisée jusqu'à son retour (`voyageVanquished`). */
const heroTargetDown = computed(() => !!active.value && voyageVanquished(active.value, now.value));
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
  el.scrollLeft = ((svgX - V.value.x) / V.value.size) * mapPx.value - el.clientWidth / 2;
  el.scrollTop = ((svgY - V.value.y) / V.value.size) * mapPx.value - el.clientHeight / 2;
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
  // ⚠️ La taille du cadre se lit ICI, jamais dans `contW`/`contH` : mesurés trop tôt (carte
  // montée avant d'avoir sa taille), ils valaient ~0 et le zoom se recentrait sur le coin
  // haut-gauche de la carte (signalé : « ça me plaque la carte dans un coin »).
  const cx = ((el?.scrollLeft ?? 0) + (el?.clientWidth ?? contW.value) / 2) / mapPx.value;
  const cy = ((el?.scrollTop ?? 0) + (el?.clientHeight ?? contH.value) / 2) / mapPx.value;
  mapPx.value = clampPx(mapPx.value + dir * ZOOM_STEP);
  void nextTick(() => centerOn(V.value.x + cx * V.value.size, V.value.y + cy * V.value.size));
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
  const src = [...mapPois.value, ...(active.value ? [active.value.poi] : [])];
  const out: { id: string; poi: Poi; x: number; y: number; deg: number }[] = [];
  for (const p of src) {
    const px = ((p.x - V.value.x) / V.value.size) * mapPx.value - scrollX.value;
    const py = ((p.y - V.value.y) / V.value.size) * mapPx.value - scrollY.value;
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
/** Les lieux que la carte dessine : tous (la barre de filtres est retirée, v1.40.2). */
const mapPois = pois;
/** ⚔️ Les armées en campagne se dessinent au premier plan, au-dessus de la ville et des
 *  lieux (cf. le second `MapPoiLayer`) ; les autres lieux restent dessous. */
const isMarching = (p: Poi) => p.type === 'warband' || !!p.army;
/** 🏰 Un lieu FIXE (point de contrôle) toujours dessiné sur la carte : il porte lui-même son
 *  état (tenu, en assaut), on ne le redouble pas d'une cible de voyage. */
const livePoiIds = computed(() => new Set(mapPois.value.map((p) => p.id)));
const fixedOnMap = (p: Poi) => !!p.control && livePoiIds.value.has(p.id);
const placePois = computed(() => mapPois.value.filter((p) => !isMarching(p)));
const armyPois = computed(() => mapPois.value.filter(isMarching));
/** ⚔️🗼 Les trajectoires des armées en campagne visibles (filtres compris). */
const armyPaths = computed(() =>
  mapPois.value.map(armyTrajectory).filter((a): a is ArmyPath => !!a),
);
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
/** 🏯 La citadelle sélectionnée vient d'être abattue : le temps qu'elle reste inattaquable. */
const citadelRestIn = computed(() => {
  const t = selected.value ? citadelRestingUntil(selected.value, now.value) : 0;
  return t > 0 ? t - now.value : 0;
});
/** ⚔️ Les points sous attaque imminente, à la minute près (une chaîne stable pour la carte). */
const imminentKey = computed(() =>
  imminentControlKey(char.row?.expedition_map ?? null, coarseNow.value),
);
/** 🔴 Les lieux sur lesquels une de nos troupes marche (point rouge sous le lieu). */
const attackedKey = computed(() =>
  underAttackKey(
    mapPois.value,
    [...(active.value ? [active.value] : []), ...char.partyList],
    char.attackList,
    now.value,
  ),
);
// 🕳️ Les auréoles d'EMBUSCADE — les monstres restés autour d'une faille qui a débordé
// (v0.1009). ⚠️ Horloge GROSSIÈRE : une embuscade dure deux jours, la recalculer à la
// seconde re-diffuserait ces cercles à chaque tick pour rien.
/** 👁️ Les cercles de détection (`detectionCircles`, la règle que suivent les armées). */
const detectCircles = computed(() => {
  const m = char.row?.expedition_map;
  if (!m) return [];
  return detectionCircles(m, char.detectRadiusOf(char.row?.base, m), reveal.value);
});
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
 *  peuvent que raccourcir le retour (`TRAVEL.shortcutReturnMult` ≤ 1,
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
  const g = guardUnits(heroLevel.value, freeStable.value, cap.value, compCtx.value, milHome.value);
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
/** 🏰 Les garnisons prêtes à sortir, point par point (grisage de la carte). */
const readyGarrisonMap = computed(() =>
  readyGarrisons(
    char.row?.expedition_map,
    char.advList,
    now.value,
    plannedTransferIds(char.plannedList),
  ),
);
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
/** Temps de convalescence restant du héros (0 = disponible). ⚠️ Il manquait ici : la carte
 *  laissait repartir un héros blessé, seul l'écran Aventure le bloquait. */
const heroHealIn = computed(() => woundRemainingMs(char.row?.base, now.value));
/** Le héros ne peut pas partir : il est sur la route, OU à l'infirmerie. */
/** 🧝 Posté sur un lieu tenu, le héros en part directement (il quitte la garnison). */
const heroPostSub = computed(() => {
  const post = heroPostOf(char.row?.expedition_map);
  return post ? `🏰 quitte son poste : ${poiLabel(post)}` : null;
});
const heroUnavailable = computed(() => char.heroEngaged || heroHealIn.value > 0);
/** Ce que ce lieu accepte MAINTENANT — la regle vit dans `caravan.ts`, pas dans un v-if.
 *  Le panneau etait entierement garde par « le heros est disponible », donc un convoi
 *  devenait impossible des que le heros partait : exactement quand on en a besoin. */
const offers = computed(() =>
  selected.value
    ? poiOffers(selected.value, {
        heroAway: heroUnavailable.value,
        comptoirLevel: char.comptoirLevel,
        advsAvailable: freeAdvs.value.length,
        now: coarseNow.value,
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
  // ⚔️🗼 Une ARMÉE EN CAMPAGNE (siège ou reprise) : son effectif est celui du siège (ou de la
  // troupe de reprise) — pas une bande de faille tirée à part.
  if (p.army) {
    const raid = char.row?.base?.raid;
    const spec = fieldArmySpec(p);
    const pt =
      p.army.kind === 'retake'
        ? char.row?.expedition_map?.pois.find((q) => q.id === p.army!.targetId)
        : null;
    return {
      faction: p.army.faction,
      size:
        p.army.kind === 'siege' && raid?.id === p.army.targetId
          ? raid.groups.reduce((s, g) => s + g.count, 0)
          : spec
            ? campBodyCount(spec)
            : 0,
      gone: p.expiresAt - now.value,
      utile: true,
      army: p.army.kind,
      target: pt?.control ? CONTROL_LABEL[pt.control.kind] : 'ta base',
    };
  }
  const army = warbandArmy(p, progress.global.value.level);
  // 🐫 Un convoi de l'île 4 : ce qu'on évite, c'est le renfort de la FORTERESSE.
  if (p.convoy)
    return {
      faction: army.faction,
      size: army.groups.reduce((s, g) => s + g.count, 0),
      gone: p.expiresAt - now.value,
      utile: true,
      convoy: true,
    };
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
/** 🏅 Le cran du point sélectionné (ancienneté) — ou, pour la citadelle, son palier et sa
 *  trêve : titre et détail, à la minute. */
const tierLine = computed(() =>
  selected.value && isIslandTargetId(selected.value.id)
    ? islandTargetLabel(char.row?.expedition_map, selected.value.id)
    : liveControl.value?.kind === 'citadel'
      ? citadelLabel(
          char.row?.expedition_map,
          selected.value!.id,
          coarseNow.value,
          progress.activeDaysInLast(7),
        )
      : controlTierLabel(liveControl.value ?? undefined, coarseNow.value),
);
/** 🏅 Les crans des points de la carte, en CHAÎNE « id:cran » (le calque ne se redessine que si
 *  un cran change). Seuls les crans > 0 sont dessinés. */
const tierKey = computed(() =>
  (char.row?.expedition_map?.pois ?? [])
    .filter((p) => p.control)
    .map(
      (p) =>
        `${p.id}:${p.control!.kind === 'citadel' ? citadelPalier(p.control, coarseNow.value) : controlTier(p.control, coarseNow.value)}`,
    )
    .filter((s) => !s.endsWith(':0'))
    .join('|'),
);
/** ⚫ La garnison de chaque point tenu, en points sous le fort (`garrisonDots`), « id:lettres »
 *  joints par « | » — une chaîne, pour ne re-dessiner les lieux que si elle change. Lue sur
 *  la MÊME liste que « Places fortes » : les deux ne peuvent pas se contredire. */
const garrisonKey = computed(() =>
  ctlRoster.value
    .map((r) => `${r.poi.id}:${garrisonDots(r)}`)
    .filter((s) => !s.endsWith(':'))
    .join('|'),
);
/** 🌫️ La citadelle du secteur du point sélectionné est encore cachée : elle l'attaque quand
 *  même, 2× moins souvent. */
const ctlHidden = computed(() => {
  const c = liveControl.value;
  const pois = char.row?.expedition_map?.pois;
  const map = char.row?.expedition_map;
  return !!c && !!pois && !!map && c.kind !== 'citadel' && attackerHidden(map, c.kind);
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
/** 🔙 Les membres du point encore EN ROUTE : les « ramener », c'est les faire rebrousser chemin. */
const ctlMoving = computed(
  () =>
    new Set(
      [
        ...controlMembers.value.map((m) => ({ id: m.adv.id, arriveIn: m.arriveIn })),
        ...controlMilitia.value,
      ]
        .filter((m) => m.arriveIn > 0)
        .map((m) => m.id),
    ),
);
/** Le bouton dit ce qu'il fera : ceux en route font DEMI-TOUR, les autres sont ramenés. */
const recallSelLabel = computed(() => {
  if (ctlRecallDelay.value > 0) {
    const k = ctlSchedulable.value.length;
    const skip = ctlRecallSel.value.length - k;
    if (!k) return '⏳ Seuls les membres déjà sur le lieu se programment';
    return `⏳ Programmer le retour de ${k} membre${k > 1 ? 's' : ''}${skip ? ` (${skip} en route ignoré${skip > 1 ? 's' : ''})` : ''}`;
  }
  const moving = ctlMoving.value;
  const n = ctlRecallSel.value.length;
  const t = ctlRecallSel.value.filter((x) => moving.has(x)).length;
  if (t === n) return `🔙 Demi-tour : ${n} renfort${n > 1 ? 's' : ''}`;
  return `↩️ Ramener ${n} membre${n > 1 ? 's' : ''}${t ? ` (dont ${t} en demi-tour)` : ''}`;
});
/** ⚔️🏰 Les champions partis en SORTIE depuis ce point, qui y reviennent : leur place leur est
 *  gardée (`away`). `backIn` = leur retour sur le point (leur `busyUntil`, que le voyage tient
 *  à jour s'il est raccourci). */
const controlAway = computed(() => {
  const c = liveControl.value;
  if (!c?.away?.length) return [];
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  return c.away.flatMap((id) => {
    const adv = byId.get(id);
    return adv ? [{ adv, backIn: Math.max(0, (adv.busyUntil ?? 0) - now.value) }] : [];
  });
});
const controlCount = computed(
  () => controlMembers.value.length + controlAway.value.length + controlMilitia.value.length,
);
const controlFree = computed(() => controlFreeSeats(liveControl.value));
/** ➕ Les cases vides de la garnison de 5 : les premières prennent un champion, les
 *  suivantes (au-delà des places de champion du lieu) seulement un milicien. */
/** 🏰 La forteresse prise : garnison sans limite. */
const unlimitedGarrison = computed(
  () => !!liveControl.value && !Number.isFinite(seatsOf(liveControl.value.kind)),
);
const garrisonSlots = computed(() =>
  unlimitedGarrison.value
    ? [{ i: 0, label: 'Place libre · sans limite' }]
    : Array.from({ length: garrisonFreeSeats(liveControl.value) }, (_, i) => ({
        i,
        label: i < controlFree.value ? 'Place libre' : 'Milicien seulement',
      })),
);
/** 🏰 Rappelle le héros posté à la forteresse : il rentre à la base, à son pas. */
async function recallHero() {
  const uid = auth.user?.id;
  if (!uid || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    await char.recallHeroFromPost(uid, Date.now());
    $q.notify({ type: 'positive', message: '🦸 Ton héros rentre à la base.' });
  } finally {
    ctlBusy.value = false;
  }
}
/** ➕ Toucher une case vide ouvre le renfort direct (`QuickReinforceSheet`), le même que la
 *  liste des places fortes : champions et miliciens de la base, et membres des AUTRES points
 *  tenus (demandé : « comme partout ailleurs, pas seulement la base »). */
function openQuick() {
  if (livePoi.value) quickId.value = livePoi.value.id;
}
/** La sélection de la fiche : qui ramener. */
const ctlRecallSel = ref<string[]>([]);
/** ⏳ Dans combien de minutes ils rentrent (0 = tout de suite). */
const ctlRecallDelay = ref(0);
const ctlRecallAt = computed(() =>
  ctlRecallDelay.value > 0
    ? new Date(now.value + ctlRecallDelay.value * 60_000).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null,
);
/** Ceux de la sélection qu'on peut programmer : déjà SUR le lieu (un renfort en route ne peut
 *  que faire demi-tour, tout de suite) et pas déjà programmés. */
const ctlSchedulable = computed(() => {
  const here = new Set(liveControl.value?.garrison ?? []);
  const reserved = plannedTransferIds(char.plannedList);
  return ctlRecallSel.value.filter((x) => here.has(x) && !reserved.has(x));
});
/** Il y a quelqu'un sur le lieu à ramener (le choix du moment n'a de sens qu'alors). */
const controlMembersHere = computed(() => (liveControl.value?.garrison.length ?? 0) > 0);
/** ⏳ Les retours déjà programmés depuis ce lieu. */
const ctlPlannedBack = computed(() =>
  char.plannedList
    .filter((m) => m.recall && m.toId === livePoi.value?.id)
    .map((m) => ({
      id: m.id,
      count: plannedCount(m),
      departIn: formatDuration(Math.max(0, m.departAt - now.value)),
      departAt: new Date(m.departAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    })),
);
/** 🛡️ Les miliciens à la base (le renfort direct les propose). */
const milHome = computed(() => char.row?.base?.militia?.home ?? 0);
const militiaBuilt = computed(() => buildingLevel(char.row?.buildings ?? [], 'barracks') > 0);
watch(
  () => selected.value?.id,
  () => {
    ctlRecallSel.value = [];
    ctlRecallDelay.value = 0;
  },
);
/** ⏳ Les membres du lieu attendus par un départ programmé (retour ou transfert) : leur tuile
 *  le dit, et on ne peut plus les choisir (ils sont réservés, on annule d'abord). */
const ctlReservedLabel = computed(() => {
  const out = new Map<string, string>();
  const here = livePoi.value?.id;
  for (const m of char.plannedList) {
    const at = new Date(m.departAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (m.recall && m.toId === here) for (const id of m.recall) out.set(id, `⏳ retour à ${at}`);
    for (const t of m.transfers) if (t.fromId === here) out.set(t.id, `⏳ part à ${at}`);
  }
  return out;
});
function toggleRecall(id: string) {
  if (ctlReservedLabel.value.has(id)) return;
  const s = ctlRecallSel.value;
  ctlRecallSel.value = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
}
/** 🛡️ La tenue d'un point tenu À L'HEURE DE L'ATTAQUE, avec d'éventuels renforts `extra`
 *  (arrivée en ms) — `defendersAtAttack` puis `controlDefenseHold`, la règle de la bataille.
 *  ⚔️ Dès que l'armée de reprise est VISIBLE sur la carte, on juge contre ELLE (son rang, sa
 *  troupe, ce que les sorties en ont abattu — `controlAttackHold`, la bataille du store) ;
 *  avant, contre l'ennemi le plus fort possible (`controlDefenseHold`, un plancher).
 *  ⚠️ Sur l'horloge GROSSIÈRE : une simulation par appel, pas une par seconde. */
function defenseOf(p: Poi | null, extra: { id: string; at: number }[] = []) {
  const c = p?.control;
  if (!p || !c || c.owner !== 'player') return null;
  const at = knownAttackAt(p, coarseNow.value);
  const { present, late } = defendersAtAttack(c, at, extra);
  const map = char.row?.expedition_map;
  const vsArmy =
    !!map && pois.value.some((q) => q.army?.kind === 'retake' && q.army.targetId === p.id);
  // 🧱🏹 L'enceinte de la base renforce toutes les garnisons (la règle de la bataille).
  const fort = char.fortifyFor(heroLevel.value);
  const hold = vsArmy
    ? controlAttackHold(map, p, present, char.advList, roadCtx.value, heroLevel.value, fort)
    : controlDefenseHold(p, present, char.advList, roadCtx.value, heroLevel.value, fort);
  return { pct: Math.round(hold * 100), count: present.length, late: late.length, vsArmy };
}
const defenseNow = computed(() => defenseOf(livePoi.value));
/** 🛡️ La tenue d'un point si `remove` n'y étaient plus et `extra` arrivaient — la règle de
 *  `defenseOf`, sur une garnison retouchée (ce que fera l'échange). */
function holdAfter(p: Poi, remove: readonly string[], extra: { id: string; at: number }[]) {
  const c = p.control!;
  const gone = new Set(remove);
  const c2 = {
    ...c,
    garrison: c.garrison.filter((x) => !gone.has(x)),
    reinforcing: (c.reinforcing ?? []).filter((r) => !gone.has(r.id)),
  };
  return defenseOf({ ...p, control: c2 }, extra)?.pct ?? 0;
}
/** 🛡️ CE QUE CHAQUE OCCUPANT APPORTE (demandé) : la tenue sans lui. Sur les membres ARRIVÉS
 *  (les seuls qu'on peut échanger). Rend la perte en points et la tenue sans lui. */
const occupantLoss = computed<Record<string, { loss: number; without: number }>>(() => {
  const p = livePoi.value;
  const base = defenseNow.value?.pct;
  if (!p?.control || p.control.owner !== 'player' || base === undefined) return {};
  const out: Record<string, { loss: number; without: number }> = {};
  for (const id of p.control.garrison) {
    const without = holdAfter(p, [id], []);
    out[id] = { loss: base - without, without };
  }
  return out;
});
const lossTitle = (id: string) => {
  const l = occupantLoss.value[id];
  return l
    ? `Sans lui, la tenue tombe à ${l.without} % (au lieu de ${defenseNow.value?.pct} %).`
    : null;
};
/** Le trajet (minutes) d'un membre depuis la ville vers `p` — champion au pas de son équipe,
 *  milicien au pas d'une équipe sans rôle (la règle du store). */
function legOfMember(adv: Adventurer | null | undefined) {
  return (p: Poi) =>
    adv
      ? partyLegMin(p, [adv], {
          hero: false,
          travelMult: travelMult.value,
          gearSpeed: advGearRoles([adv], char.advGearStock).speed,
        })
      : caravanLegMin(p, [], 0, travelMult.value);
}
/** ⇄ Le membre à remplacer : UN seul coché, arrivé sur le point. */
const swapOut = computed(() => {
  const p = livePoi.value;
  const sel = ctlRecallSel.value;
  if (!p?.control || sel.length !== 1 || !p.control.garrison.includes(sel[0]!)) return null;
  const id = sel[0]!;
  const adv = isMilitiaId(id) ? null : (char.advList.find((a) => a.id === id) ?? null);
  return { id, adv, name: adv ? adv.name : MILITIA_NAME, loss: occupantLoss.value[id] ?? null };
});
/**
 * ⇄ LES REMPLAÇANTS (demandé) : champions et miliciens de la base, membres des autres points
 * tenus. Chacun avec la tenue du point APRÈS l'échange, son trajet, et — venant d'un autre
 * point — ce que ce point-là deviendra. Grisés avec la raison (`swapBlocker`, la règle du
 * store) ; triés par tenue obtenue.
 */
const swapCandidates = computed(() => {
  const p = livePoi.value;
  const out = swapOut.value;
  const map = char.row?.expedition_map;
  if (!p || !out || !map) return [];
  const t = coarseNow.value;
  const now0 = defenseNow.value?.pct ?? 0;
  type Row = {
    key: string;
    inId: string;
    fromId: string | null;
    adv: Adventurer | null;
    name: string;
    where: string;
    min: number;
    pct: number;
    delta: number;
    other: { label: string; before: number; after: number } | null;
    why: string | null;
  };
  const rows: Row[] = [];
  const outLeg = legOfMember(out.adv);
  const push = (r: Omit<Row, 'pct' | 'delta'>, arriveId: string) => {
    const pct = r.why ? now0 : holdAfter(p, [out.id], [{ id: arriveId, at: t + r.min * 60_000 }]);
    rows.push({ ...r, pct, delta: pct - now0 });
  };
  // 🏠 La base : champions disponibles, puis un milicien de la Caserne.
  for (const a of freeSorted.value) {
    const why = swapBlocker(map, p.id, out.id, a.id, null);
    push(
      {
        key: a.id,
        inId: a.id,
        fromId: null,
        adv: a,
        name: a.name,
        where: 'base',
        min: legOfMember(a)(p),
        other: null,
        why: why ? SWAP_BLOCK_LABEL[why] : null,
      },
      a.id,
    );
  }
  // ⏳ Un milicien de la base réservé par un départ programmé ne remplace personne.
  if (milHome.value - plannedMilitia(char.plannedList) > 0) {
    const why = swapBlocker(map, p.id, out.id, SWAP_MILITIA_FROM_BASE, null);
    push(
      {
        key: 'mil-base',
        inId: SWAP_MILITIA_FROM_BASE,
        fromId: null,
        adv: null,
        name: MILITIA_NAME,
        where: 'base',
        min: legOfMember(null)(p),
        other: null,
        why: why ? SWAP_BLOCK_LABEL[why] : null,
      },
      `${MILITIA_PREFIX}new0`,
    );
  }
  // 🏰 Les autres points tenus : chaque membre arrivé.
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  // ⏳ Ceux qu'un départ programmé attend ne remplacent personne.
  const reserved = plannedTransferIds(char.plannedList);
  for (const q of map.pois) {
    if (q.id === p.id || q.control?.owner !== 'player') continue;
    const label = CONTROL_LABEL[q.control.kind];
    const before = defenseOf(q)?.pct ?? 0;
    for (const id of q.control.garrison) {
      if (reserved.has(id)) continue;
      const adv = isMilitiaId(id) ? null : (byId.get(id) ?? null);
      if (!isMilitiaId(id) && !adv) continue;
      const why = swapBlocker(map, p.id, out.id, id, q.id);
      const min = legFromSpot(p, q, legOfMember(adv));
      const back = legFromSpot(q, p, outLeg);
      push(
        {
          key: `${q.id}:${id}`,
          inId: id,
          fromId: q.id,
          adv,
          name: adv ? adv.name : MILITIA_NAME,
          where: `${CONTROL_EMO[q.control.kind]} ${label}`,
          min,
          other: why
            ? null
            : { label, before, after: holdAfter(q, [id], [{ id: out.id, at: t + back * 60_000 }]) },
          why: why ? SWAP_BLOCK_LABEL[why] : null,
        },
        id,
      );
    }
  }
  return rows.sort((a, b) => Number(!!a.why) - Number(!!b.why) || b.pct - a.pct);
});
/** ⇄ Les remplaçants rangés par lieu de départ (`groupSwapRows`). */
const swapGroups = computed(() => groupSwapRows(swapCandidates.value));
const swapAvail = computed(() => swapCandidates.value.filter((r) => !r.why).length);
/** Le bloc « Remplacer » est replié : il se rouvre fermé à chaque membre choisi. */
const swapOpen = ref(false);
watch(
  () => swapOut.value?.id,
  () => {
    swapOpen.value = false;
  },
);
async function swapCtl(r: { inId: string; fromId: string | null; name: string; min: number }) {
  const uid = auth.user?.id;
  const p = livePoi.value;
  const out = swapOut.value;
  if (!uid || !p || !out || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    const why = await char.swapControlMember(
      uid,
      p.id,
      out.id,
      r.inId,
      r.fromId,
      Date.now(),
      heroLevel.value,
    );
    if (why) $q.notify({ type: 'warning', message: `Échange impossible : ${why}` });
    else {
      ctlRecallSel.value = [];
      $q.notify({
        type: 'positive',
        message: `⇄ ${r.name} remplace ${out.name} — arrivée dans ${formatDurationMin(r.min)}`,
      });
    }
  } finally {
    ctlBusy.value = false;
  }
}
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
        free: garrisonFreeSeats(p.control),
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
/** ⏳ Programme le retour : `whole` = toute la garnison. */
async function scheduleCtlRecall(ids: readonly string[], whole: boolean) {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  const delay = ctlRecallDelay.value * 60_000;
  ctlBusy.value = true;
  try {
    const why = await char.scheduleRecall(uid, p.id, ids, whole, delay, Date.now());
    if (why) $q.notify({ type: 'warning', message: `Retour non programmé : ${why}.` });
    else {
      const n = whole ? (liveControl.value?.garrison.length ?? ids.length) : ids.length;
      $q.notify({
        type: 'positive',
        message: `⏳ Retour de ${n} membre${n > 1 ? 's' : ''} programmé — départ dans ${formatDuration(delay)}`,
      });
      ctlRecallSel.value = [];
      ctlRecallDelay.value = 0;
    }
  } finally {
    ctlBusy.value = false;
  }
}
/** 💎 Les compétences du champion du lapidaire : niveau, et temps de polissage restant. */
const lapisRows = computed(() => {
  const c = liveControl.value;
  if (c?.kind !== 'lapidary') return [];
  const adv = char.advList.find((a) => c.garrison.includes(a.id));
  return (adv?.skills ?? []).map((s) => {
    const def = SKILLS[s.id];
    const max = s.level >= SKILL_MAX_LEVEL;
    const need = max ? 0 : lapidaryHours(s.id, s.level);
    const done = adv?.lapisHours?.[s.id] ?? 0;
    return {
      id: s.id,
      emoji: def.emoji,
      name: def.name,
      level: s.level,
      max,
      left: `${formatDuration(Math.max(0, need - done) * 3600_000)} restantes`,
    };
  });
});
async function chooseLapis(skill: SkillId) {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    await char.chooseLapisSkill(uid, p.id, skill, Date.now(), heroLevel.value);
  } finally {
    ctlBusy.value = false;
  }
}
async function chooseCarto(t: CartoType) {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    await char.chooseCartoFavor(uid, p.id, t);
  } finally {
    ctlBusy.value = false;
  }
}
async function releaseCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  const ids = ctlRecallSel.value;
  if (!uid || !p || !ids.length || ctlBusy.value) return;
  if (ctlRecallDelay.value > 0) {
    const k = ctlSchedulable.value;
    if (k.length)
      await scheduleCtlRecall(k, k.length === (liveControl.value?.garrison.length ?? -1));
    return;
  }
  // 🔙 Ceux encore EN ROUTE font demi-tour (le store les fait rebrousser chemin, en autant de
  // temps qu'ils ont marché) ; « tout rappeler » ne regarde que ceux déjà SUR le point.
  const moving = ctlMoving.value;
  const turning = ids.filter((x) => moving.has(x));
  const onPoint = ids.filter((x) => !moving.has(x));
  const wholeGarrison = onPoint.length > 0 && onPoint.length >= controlCount.value - moving.size;
  ctlBusy.value = true;
  try {
    if (turning.length) {
      await char.releaseControlChampions(uid, p.id, turning, Date.now(), heroLevel.value);
      $q.notify({
        type: 'positive',
        message: `🔙 ${turning.length} renfort${turning.length > 1 ? 's font' : ' fait'} demi-tour.`,
      });
    }
    if (onPoint.length && !wholeGarrison)
      await char.releaseControlChampions(uid, p.id, onPoint, Date.now(), heroLevel.value);
    ctlRecallSel.value = [];
  } finally {
    ctlBusy.value = false;
  }
  if (wholeGarrison) await recallCtl();
}
/** 🧺 La tuile de production du point tenu (`controlYieldCard`, la lib). */
const yieldCard = computed(() =>
  livePoi.value ? controlYieldCard(livePoi.value, now.value, heroLevel.value) : null,
);
/** 🎯 Le plafond du camp, dit AVANT qu'on s'étonne que personne ne monte plus. */
const controlNote = computed(() => {
  if (liveControl.value?.kind === 'scriptorium')
    return 'Il recopie des runes multicolores : leur couleur se tire à l’ouverture, au Panthéon. Le copiste n’apprend rien.';
  if (liveControl.value?.kind === 'lab')
    return '1 rune multicolore tous les 4 jours au complet, à partir du violet : jamais verte ni bleue à l’ouverture. Deux fois moins vite que l’autel des runes. L’alchimiste n’apprend rien.';
  if (liveControl.value?.kind === 'hospice')
    return 'Il ne produit rien : tenu, les champions blessés sur l’île guérissent plus vite — deux fois plus vite au complet. Le héros n’est pas concerné.';
  if (liveControl.value?.kind !== 'training') return '';
  const cap = trainingCapLevel(heroLevel.value);
  if (!cap)
    return '⚠️ Ton héros est Bronze : le camp n’entraîne que sous ton rang — monte d’abord.';
  const r = characterRank(cap);
  return `Plafond : ${r.emoji} ${r.name} ★5 (le rang juste sous le tien). Leurs pièces portées apprennent deux fois plus vite, même quand le champion a atteint le plafond (jusqu’au ★5 de leur rang et au niveau de leur porteur). L’XP leur arrive directement, sans rien à récolter ; un rapport te prévient quand l’un d’eux (ou une de ses pièces) est prêt pour l’ascension.`;
});

const ctlBusy = ref(false);
/** 🧺 L'animation de récolte d'une place forte. Une rune dit où la poser : c'est le seul
 *  moment où on la voit. */
function celebrateHarvest(p: Poi, got: { mana?: number; supplies: SupplyStock; runes: number }) {
  const kind = p.control?.kind;
  const where = kind ? CONTROL_LABEL[kind] : 'Place forte';
  // ⛲ Le mana a son bandeau discret (il ne se pose pas dans le panier des consommables).
  if (got.mana)
    gameFx.celebrate({
      kind: 'generic',
      emoji: '💠',
      title: `+${got.mana} pierres de mana`,
      subtitle: where,
      quiet: true,
    });
  gameFx.celebrateHarvest(
    got.supplies,
    got.runes,
    got.runes ? `${where} · runes à ouvrir au Panthéon` : where,
  );
}
async function recallCtl() {
  const uid = auth.user?.id;
  const p = livePoi.value;
  if (!uid || !p || ctlBusy.value) return;
  if (ctlRecallDelay.value > 0) {
    await scheduleCtlRecall([], true);
    return;
  }
  const ok = await new Promise<boolean>((res) =>
    $q
      .dialog({
        title: 'Rappeler la garnison ?',
        message:
          'Tes champions rentrent. La mine reste à toi, mais sans défense : l’ennemi la reprendra à sa prochaine attaque, sauf si un renfort arrive avant.',
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
}): HaulPill[] {
  const pills = haulPills(o);
  const objets = o.items?.length ?? (o.item ? 1 : 0);
  return objets > 0
    ? [
        ...pills,
        {
          emoji: '🎒',
          n: objets,
          name: `Objet${objets > 1 ? 's' : ''} du héros`,
          what: 'Rangé au sac au retour : à équiper, vendre ou recycler.',
        },
      ]
    : pills;
}
/** ⚔️ Les GROUPES partis sans le héros, situés comme le héros (`travelPosition`). ⚠️ Un groupe AVEC le
 *  héros vit dans `expedition` : c'est le tracé du héros qui le montre. */
/** 🗺️ Les voyages dont la CIBLE n'est plus à dessiner : lieu non terrassé, revenu sur la carte
 *  dès le rapport (`voyageTargetShown`) — il est déjà un lieu ordinaire, réattaquable. */
const hiddenTargets = computed(
  () => new Set(char.partyList.filter((g) => !voyageTargetShown(g, now.value)).map((g) => g.id)),
);
const partiesOnMap = computed(() =>
  char.partyList
    .filter((g) => now.value < g.returnAt)
    .map((g) => ({
      id: g.id,
      poi: g.poi,
      recallable: !recallBlocker(g, now.value),
      // 🔙 La fenêtre COMPLÈTE d'avant un demi-tour, pour la feuille de rappel seulement.
      // ⚠️ Rangée à part : étalée ici, elle écrasait `returnAt` et une équipe rappelée se
      // triait sur son ANCIEN retour au lieu de passer en tête des voyages (v1.8.19).
      win: recallWindow(g),
      returnAt: g.returnAt,
      escort: tripCrew(g).length,
      members: tripCrew(g),
      hero: partyCarriesHero(g),
      haul: expeHaul(g.outcome),
      origin: g.origin,
      // 🔙 Un demi-tour n'a jamais atteint le lieu : son tracé s'arrête là où il a rebroussé.
      end: voyageDrawnEnd(g, now.value),
      at: drawnAt(g),
      prog: voyageProgress(g, now.value),
      legs: tripLegs(g, now.value),
      // 💀 Le lieu est terrassé dès le rapport : on le grise jusqu'au retour.
      down: voyageVanquished(g, now.value),
      failed: voyageFailure(g, now.value),
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
  return (
    voyages
      // ⚔️🗼 Une armée EN CAMPAGNE reste sur la carte (elle continue sa marche) : pas de doublon.
      .filter(
        ({ v }) => v.poi.type === 'warband' && !!v.poi.from && !v.poi.army && now.value < v.midAt,
      )
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
      })
  );
});
/** 🛡️ Les RENFORTS en route vers un point tenu (demandé par l'utilisateur : « quand j'envoie
 *  du renfort il faut que je le voie sur la carte »). Aller simple : ils restent sur le point,
 *  donc ils disparaissent de la carte à leur arrivée — la garnison du point prend le relais. */
const reinforcementsOnMap = computed(() =>
  reinforcementsEnRoute(char.row?.expedition_map, now.value).map((r) => ({
    id: 'r' + r.key,
    pointId: r.poi.id,
    sentAt: r.sentAt,
    poi: r.poi,
    members: r.members,
    origin: r.origin,
    recallable: !r.turned,
    at: drawnAt(r),
    prog: voyageProgress(r, now.value),
    arriveAt: r.midAt,
    arriveIn: r.midAt - now.value,
  })),
);
/** 🏠 Les champions et miliciens RAMENÉS d'un point, sur le chemin de la base (demandé :
 *  « qu'ils se voient sur la carte »). Retour simple : le trajet part du point. */
const returnsOnMap = computed(() =>
  returnsEnRoute(char.row?.expedition_map, now.value).map((r) => ({
    id: 'h' + r.key,
    poi: r.poi,
    // 🔙 Un renfort qui a rebroussé chemin revient de là où il a tourné.
    end: voyageDrawnEnd(r, now.value),
    members: r.members,
    // Un retour rentre toujours à la ville : son tracé part d'elle.
    origin: undefined as { x: number; y: number } | undefined,
    at: drawnAt(r),
    pct: voyageProgress(r, now.value).overall * 100,
    sentAt: r.sentAt,
    returnAt: r.returnAt,
    arriveIn: r.returnAt - now.value,
    turned: r.turnBack !== undefined,
  })),
);
/** ⚔️🧭 Les groupes d'une attaque combinée en préparation : chez eux tant qu'ils attendent
 *  (⏳), puis en route — tous arrivent ensemble. */
const attacksOnMap = computed(() =>
  attackWingVoyages(char.attackList, char.row?.expedition_map)
    .filter((w) => now.value < w.voyage.returnAt)
    .map((w) => ({
      id: 'a' + w.key,
      poi: w.voyage.poi,
      returnAt: w.voyage.returnAt,
      members: w.members,
      hero: w.hero,
      waiting: w.waiting && now.value < w.voyage.sentAt,
      origin: w.voyage.origin,
      at: drawnAt(w.voyage),
      prog: voyageProgress(w.voyage, now.value),
      departIn: w.voyage.sentAt - now.value,
      arriveIn: w.voyage.midAt - (w.voyage.dwellMs ?? 0) - now.value,
      legs: tripLegs(w.voyage, now.value),
    })),
);
/** Tout ce qui voyage sans le héros, pour la carte : même tracé, l'emoji dit qui. */
const travelersOnMap = computed(() => [
  ...attacksOnMap.value.map((w) => ({
    ...w,
    tripKey: w.id,
    emo: w.waiting ? '⏳' : '⚔️',
    kind: 'party' as const,
    recall: undefined as RecallTarget | undefined,
    recallLabel: '',
    recallInfo: null as RecallInfo | null,
  })),
  ...partiesOnMap.value.map((g) => ({
    ...g,
    tripKey: 'g' + g.id,
    emo: '⚔️',
    kind: 'party' as const,
    recall: g.recallable ? { kind: 'party' as const, id: g.id } : undefined,
    recallLabel: `L’équipe (${g.escort} champion${g.escort > 1 ? 's' : ''})`,
    recallInfo: {
      kind: 'party',
      label: `L’équipe (${g.escort} champion${g.escort > 1 ? 's' : ''})`,
      emo: '⚔️',
      poi: g.poi,
      hero: g.hero,
      members: g.members,
      ...g.win,
    } as RecallInfo,
  })),
  // 🔙 Seuls les renforts partis de la base peuvent rebrousser chemin (un transfert devrait
  // rentrer sur son point d'origine, `recallReinforcements`).
  ...reinforcementsOnMap.value.map((r) => ({
    ...r,
    tripKey: r.id,
    emo: '🛡️',
    kind: 'reinf' as const,
    recall: r.recallable
      ? { kind: 'reinf' as const, pointId: r.pointId, ids: r.members }
      : undefined,
    recallLabel: `Les renforts (${r.members.length})`,
    recallInfo: {
      kind: 'reinf',
      label: `Les renforts (${r.members.length})`,
      emo: '🛡️',
      poi: r.poi,
      hero: false,
      members: r.members,
      sentAt: r.sentAt,
      arriveAt: r.arriveAt,
      ...(r.origin ? { homeName: 'Au point de départ' } : {}),
    } as RecallInfo,
  })),
  // 🏠🔙 Un retour vers la base peut rebrousser chemin vers son point (`recallReturns`) —
  // sauf s'il est lui-même un demi-tour.
  ...returnsOnMap.value.map((r) => ({
    ...r,
    tripKey: r.id,
    emo: '🏠',
    kind: 'reinf' as const,
    recall: r.turned ? undefined : { kind: 'return' as const, pointId: r.poi.id, ids: r.members },
    recallLabel: `Le retour (${crewLabel(r.members)})`,
    recallInfo: {
      kind: 'return',
      label: `Le retour (${crewLabel(r.members)})`,
      emo: '🏠',
      poi: r.poi,
      hero: false,
      members: r.members,
      sentAt: r.sentAt,
      arriveAt: r.returnAt,
      homeName: `De retour sur ${poiLabel(r.poi)}`,
    } as RecallInfo,
  })),
]);
const shownTravelers = travelersOnMap;
const shownBands = bandsOnMap;
// Un lieu sélectionné que le filtre masque ne garde pas sa feuille ouverte. ⚠️ APRÈS
// `travelersOnMap` : le watch lit `mapPois` dès le setup, qui lit `travelersOnMap` (zone
// morte temporelle sinon — le défaut de la v0.910).
watch(mapPois, (list) => {
  const s = selected.value;
  if (s && pois.value.some((p) => p.id === s.id) && !list.some((p) => p.id === s.id))
    selected.value = null;
});
/** Tout ce qui voyage, du retour le plus tôt au plus tard (demandé). Une seule liste, sinon la
 *  rangée se lirait comme plusieurs rangées collées. `ends` = la fin du trajet de la tuile :
 *  le retour en ville, ou l'arrivée pour un renfort (aller simple, il reste sur le point). */
const trips = computed(() => {
  const out: MapTrip[] = [];
  const ends = new Map<string, number>();
  const a = active.value;
  const h = hero.value;
  if (a && h) {
    const back = h.phase === 'return';
    ends.set('hero', a.returnAt);
    out.push({
      key: 'hero',
      kind: 'hero',
      who: '🧝',
      cat: poiTripCategory(a.poi.type),
      poi: a.poi,
      time: tripTimeLabel(h).time,
      pct: heroProg.value.overall * 100,
      back,
      withHero: true,
      from: null,
      members: tripCrew(a),
      haul: expeHaul(a.outcome),
      legs: tripLegs(a, now.value),
      failed: voyageFailure(a, now.value),
      title: `Ton héros — ${POI_LABEL[a.poi.type]} niv ${a.poi.level}${tripCrew(a).length ? ` · avec ${tripCrew(a).length} champion(s)` : ''} · ${tripTimeLabel(h).untilHome}`,
    });
  }
  for (const g of partiesOnMap.value) {
    const back = g.at.phase === 'return';
    ends.set('g' + g.id, g.returnAt);
    out.push({
      key: 'g' + g.id,
      kind: 'van',
      who: '⚔️',
      cat: poiTripCategory(g.poi.type),
      poi: g.poi,
      time: tripTimeLabel(g.at).time,
      pct: g.prog.overall * 100,
      back,
      withHero: g.hero,
      from: tripOriginPoi(pois.value, g.origin),
      members: g.members,
      haul: g.haul,
      legs: g.legs,
      failed: g.failed,
      title: `Groupe — ${POI_LABEL[g.poi.type]} niv ${g.poi.level} · ${g.escort} champion${g.escort > 1 ? 's' : ''} · ${tripTimeLabel(g.at).untilHome}`,
    });
  }
  for (const w of attacksOnMap.value) {
    ends.set(w.id, w.returnAt);
    out.push({
      key: w.id,
      kind: 'van',
      who: w.waiting ? '⏳' : '⚔️',
      cat: 'raids',
      pending: w.waiting,
      poi: w.poi,
      time: w.waiting
        ? `⏳ ${formatDuration(w.departIn)}`
        : formatDuration(Math.max(0, w.arriveIn)),
      pct: w.prog.overall * 100,
      back: false,
      withHero: w.hero,
      from: tripOriginPoi(pois.value, w.origin),
      members: w.members,
      haul: [],
      legs: w.legs,
      title: w.waiting
        ? `Attaque combinée — ${POI_LABEL[w.poi.type]} niv ${w.poi.level} · part dans ${formatDuration(w.departIn)}`
        : `Attaque combinée — ${POI_LABEL[w.poi.type]} niv ${w.poi.level} · arrivée dans ${formatDuration(Math.max(0, w.arriveIn))}`,
    });
  }
  for (const r of reinforcementsOnMap.value) {
    const who = crewLabel(r.members);
    ends.set(r.id, r.arriveAt);
    out.push({
      key: r.id,
      kind: 'van',
      who: '🛡️',
      cat: 'reinf',
      poi: r.poi,
      time: formatDuration(r.arriveIn),
      pct: r.prog.overall * 100,
      back: false,
      withHero: false,
      from: tripOriginPoi(pois.value, r.origin),
      members: r.members,
      haul: [],
      title: `Renfort — ${POI_LABEL[r.poi.type]} niv ${r.poi.level} · ${who} · arrivée dans ${formatDuration(r.arriveIn)}`,
    });
  }
  for (const r of returnsOnMap.value) {
    ends.set(r.id, r.returnAt);
    out.push({
      key: r.id,
      kind: 'van',
      who: '🏠',
      cat: 'reinf',
      poi: r.poi,
      time: `↩ ${formatDuration(r.arriveIn)}`,
      pct: r.pct,
      back: true,
      withHero: false,
      // 🏠 Un retour part du point qu'il quitte, et va à la BASE.
      from: r.poi,
      toBase: true,
      members: r.members,
      haul: [],
      title: `Retour de ${POI_LABEL[r.poi.type]} niv ${r.poi.level} · ${crewLabel(r.members)} · à la base dans ${formatDuration(r.arriveIn)}`,
    });
  }
  // ⏳ LES DÉPARTS PROGRAMMÉS (demandé : « un filtre pour les déplacements programmés en
  // attente ») : renforts et retours qui n'ont pas encore quitté leur lieu. Leur tuile
  // décompte le temps avant le DÉPART, et s'annule depuis l'équipe.
  for (const m of char.plannedList) {
    const poi = pois.value.find((p) => p.id === m.toId);
    if (!poi) continue;
    const key = 'p' + m.id;
    const members = m.recall
      ? [...m.recall]
      : [
          ...m.champs,
          ...Array.from({ length: m.militia }, (_, i) => `${MILITIA_PREFIX}plan${i}`),
          ...m.transfers.map((t) => t.id),
        ];
    // D'où partent-ils : le lieu quitté pour un retour ; pour un renfort, la base, sauf si
    // tout le monde vient d'un même autre lieu tenu.
    const froms = new Set(m.transfers.map((t) => t.fromId));
    const fromId = m.recall
      ? m.toId
      : !m.champs.length && !m.militia && froms.size === 1
        ? [...froms][0]
        : null;
    const at = new Date(m.departAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const inMs = Math.max(0, m.departAt - now.value);
    ends.set(key, m.departAt);
    out.push({
      key,
      kind: 'van',
      who: '⏳',
      cat: 'reinf',
      pending: true,
      cancelPlan: m.id,
      poi,
      time: `⏳ ${formatDuration(inMs)}`,
      pct: 0,
      back: !!m.recall,
      withHero: false,
      from: fromId ? (pois.value.find((p) => p.id === fromId) ?? null) : null,
      ...(m.recall ? { toBase: true } : {}),
      members,
      haul: [],
      title: m.recall
        ? `Retour programmé de ${POI_LABEL[poi.type]} niv ${poi.level} · ${crewLabel(members)} · part à ${at}`
        : `Renfort programmé — ${POI_LABEL[poi.type]} niv ${poi.level} · ${crewLabel(members)} · part à ${at}`,
    });
  }
  // ⛵ EN MER (demandé : « comment on voit que le héros est en traversée ? ») : la traversée
  // du héros et les navigations de champions, ancrées au port (la forteresse) ou à la ville.
  const port =
    pois.value.find((p) => p.id === FORTRESS_ID) ??
    ({ id: 'port', type: 'control', x: TOWN.x, y: TOWN.y, level: 0 } as Poi);
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  for (const s of seaTrips(char.row?.expedition_map, now.value)) {
    const c = s.crossing;
    const isle = ISLANDS.find((i) => i.id === c.to)?.name ?? `île ${c.to}`;
    ends.set(s.key, c.arriveAt);
    out.push({
      key: s.key,
      kind: s.hero ? 'hero' : 'van',
      who: '⛵',
      cat: 'trips',
      pending: s.waiting,
      sea: { from: c.from, to: c.to },
      poi: port,
      time: s.waiting
        ? `⏳ ${formatDuration(c.departAt - now.value)}`
        : formatDuration(c.arriveAt - now.value),
      pct: s.pct * 100,
      back: false,
      withHero: s.hero,
      from: port,
      members: c.ids,
      haul: [],
      legs: {
        go: null,
        back: `⚓ ${clock(c.arriveAt)}`,
        detail:
          `Départ à ${clock(c.departAt)}, arrivée à ${clock(c.arriveAt)} (2 h de mer)` +
          (s.delayed ? ' — le départ attend le retour de tes troupes' : ''),
      },
      title:
        `${s.hero ? 'Ton héros' : 'Champions'} vers ${isle} · ` +
        (s.waiting ? `départ à ${clock(c.departAt)}` : 'en mer') +
        ` · arrivée à ${clock(c.arriveAt)}` +
        (s.delayed ? ' · le départ attend le retour de tes troupes' : ''),
    });
  }
  // Tri stable : à égalité, l'ordre d'insertion (héros, groupes, attaques…) départage.
  // ⏱️ `endsAt` porte l'heure à la tuile : `TripsPanel` y mêle les armées ennemies.
  for (const t of out) t.endsAt = ends.get(t.key) ?? 0;
  return out.sort((x, y) => (x.endsAt ?? 0) - (y.endsAt ?? 0));
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
 *  (`tracePoi` ne le retrouve plus). */
const focusTrip = ref<string | null>(null);
/** 🔴 Le tracé mis en avant sur la carte (et le halo de son lieu) s'éteint de lui-même au bout
 *  de `TRACE_MS` (demandé) ; recentrer sur le voyage le rallume. Le voyage reste sélectionné
 *  (son équipe sous la carte ne se referme pas). */
const TRACE_MS = 5000;
const traceKey = ref<string | null>(null);
let traceTimer: ReturnType<typeof setTimeout> | undefined;
function showTrace(key: string) {
  traceKey.value = key;
  clearTimeout(traceTimer);
  traceTimer = setTimeout(() => (traceKey.value = null), TRACE_MS);
}
watch(focusTrip, (k) => {
  if (!k) traceKey.value = null;
});
onUnmounted(() => clearTimeout(traceTimer));
const tracePoi = computed(() => trips.value.find((t) => t.key === traceKey.value)?.poi ?? null);
/** Un seul affichage ouvert à la fois (demandé) : toucher un voyage referme la fiche d'un lieu. */
watch(focusTrip, (k) => {
  if (k) selected.value = null;
  if (k) frameTrip(k);
});
/** 📜 Désélectionner un voyage ou un lieu fait disparaître son détail sous la carte : la page
 *  raccourcit et les tuiles Expéditions / Places fortes quittaient le bas de l'écran (signalé :
 *  il fallait remonter à la main). Quand le DERNIER affichage se ferme, on remonte juste sous
 *  la carte : la rangée des bas de la carte en bas de l'écran (demandé).
 *  Rien si un autre affichage vient de s'ouvrir à la place. */
/** Vrai le temps d'un tick pendant la remontée en haut (cf. `slideMap`) : on ne recale rien. */
let goingTop = false;
watch([focusTrip, selected], ([k, s], [k0, s0]) => {
  const closed = (k0 && !k) || (s0 && !s);
  if (closed && !k && !s && !goingTop) void nextTick(revealTabs);
});
/** Le BAS de la carte tombe tout en bas de l'écran (précisé par l'utilisateur), les onglets
 *  juste en dessous, hors écran. `revealBlock` garde le haut de la carte visible s'il le faut. */
function revealTabs() {
  const map = scrollEl.value;
  if (map) revealBlock(map, map, 0);
}
/** 🎯 Toucher une tuile centre la carte sur le trajet de sa troupe (départ → lieu, et la ville
 *  si elle rentre à la base) ; dézoome s'il ne tient pas, ne zoome jamais (`tripFrame`). */
function frameTrip(key: string) {
  showTrace(key);
  const t = trips.value.find((x) => x.key === key);
  if (!t) return;
  const pts = [t.poi, t.from ?? TOWN];
  if (t.toBase) pts.push(TOWN);
  const f = tripFrame(pts, mapPx.value, V.value.size, contW.value, contH.value);
  mapPx.value = clampPx(f.px);
  void nextTick(() => centerOn(f.cx, f.cy));
}

const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionMessage | null>(null);
/** 📜 Le rapport de la dernière attaque du lieu sélectionné (lecture seule). */
const lastAttack = computed(() => liveControl.value?.lastAttack ?? null);
const lastAttackWhen = computed(() => {
  const m = lastAttack.value;
  return m ? `il y a ${formatDuration(Math.max(0, coarseNow.value - m.resolvedAt))}` : '';
});
function openLastAttack() {
  if (!lastAttack.value) return;
  lastOutcome.value = lastAttack.value;
  collectOpen.value = true;
}
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
/** 📬 À prendre, encore sur la route, ou encaissé — la règle de la lib (`claimState`), la même
 *  que la boîte de l'Aventure. */
const lastState = computed(() =>
  lastOutcome.value ? claimState(lastOutcome.value, now.value) : 'done',
);
/** 🔔 Tap sur « ton héros / ton groupe est rentré » (`?report=1`). ⚠️ Sans ce drapeau, être
 *  DÉJÀ sur la carte ne faisait rien : l'URL ne changeait pas, et un rapport déjà vu puis
 *  fermé ne se rouvrait pas. On ouvre le rapport encore à prendre, sinon le plus récent,
 *  puis on retire le drapeau (un retour arrière ne le rejoue pas, un second tap le repose). */
/** 🔔 Le rapport nommé par la notification (`?report=msg_…`) n'est déposé qu'au premier
 *  passage du cycle de vie après l'ouverture : on l'ATTEND un moment au lieu d'ouvrir
 *  aussitôt « le plus récent » — qui était souvent celui d'un autre voyage. */
const REPORT_WAIT_MS = 15_000;
let reportWaitFrom = 0;
watch(
  () => [route.query.report, char.row?.messages?.length ?? -1, now.value] as const,
  ([flag]) => {
    if (!flag || !char.row) {
      reportWaitFrom = 0;
      return;
    }
    const msgs = (char.row.messages ?? []).filter((m) => !m.chest);
    const wanted = typeof flag === 'string' && flag !== '1' ? flag : null;
    const exact = wanted ? msgs.find((x) => x.id === wanted) : undefined;
    if (wanted && !exact) {
      if (!reportWaitFrom) reportWaitFrom = Date.now();
      if (Date.now() - reportWaitFrom < REPORT_WAIT_MS) return;
    }
    reportWaitFrom = 0;
    const m =
      exact ??
      msgs.find((x) => isClaimable(x, Date.now())) ??
      [...msgs].sort((a, b) => b.resolvedAt - a.resolvedAt)[0];
    if (m) {
      lastOutcome.value = m;
      collectOpen.value = true;
    }
    const rest = { ...route.query };
    delete rest.report;
    void router.replace({ path: route.path, query: rest });
  },
  { immediate: true },
);

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
    // ⚠️ Les champions libres à la base ET ceux prêts à sortir d'un point fixe : ne compter
    // que la base grisait des lieux qu'une garnison pouvait attaquer (signalé). Même règle
    // que l'écran d'envoi (`readyGarrisons`).
    advsAvailable: championsAbleToGo(freeAdvs.value.length, readyGarrisonMap.value, p.id),
    now: coarseNow.value,
  });
  // 👥 Un lieu reste ouvert tant que le HÉROS SEUL ou une ÉQUIPE peut y aller (2026-09-21 :
  // les équipes remplacent les convois). Même règle que le test « ce qui est GRISÉ ».
  // 🏰 Un point de contrôle TENU se gère (récolte, rappel) : jamais grisé.
  if (p.control?.owner === 'player') return false;
  return !o.hero && !o.party;
}

/** 🗂️ La partie dépliée sous la carte (une seule à la fois ; `null` = tout replié). Les
 *  équipes en marche pour prendre un point viennent des groupes (`partyList`) : elles
 *  restent en garnison à l'arrivée (`midAt`). */
type MapPanel = 'trips' | 'ctl';
const mapPanel = ref<MapPanel | null>(null);
/** 🗂️ Les tuiles affichées PAR-DESSUS la carte (essai, cf. le gabarit). */
const overlay = ref<MapPanel | null>(null);
const overlayTitle = computed(() =>
  overlay.value === 'ctl' ? '🏰 Places fortes' : '🧭 Expéditions',
);
function toggleOverlay(id: MapPanel) {
  overlay.value = overlay.value === id ? null : id;
  if (!overlay.value) return;
  // Un seul affichage ouvert à la fois, et la carte ramenée à l'écran (elle porte les tuiles).
  selected.value = null;
  mapPanel.value = null;
  void nextTick(revealTabs);
}
/** Toucher un voyage ferme les tuiles et centre la carte sur son tracé (`frameTrip`, via le
 *  watch de `focusTrip`). Retoucher le voyage déjà mis en avant le centre de nouveau. */
function pickOverlayTrip(key: string | null) {
  overlay.value = null;
  const k = key ?? focusTrip.value;
  if (!k) return;
  if (focusTrip.value === k) frameTrip(k);
  else focusTrip.value = k;
}
/** Refermer la partie Expéditions (ou passer aux Places fortes) désélectionne le voyage
 *  touché : sinon son halo restait sur la carte sans sa tuile (signalé). */
watch(mapPanel, (p) => {
  if (p !== 'trips') focusTrip.value = null;
});
/** 📜 Ouvrir une tuile (Expéditions, Places fortes) cale la DERNIÈRE tuile de la partie
 *  dépliée en bas de l'écran (demandé : toutes les tuiles visibles, rien de vide dessous, le
 *  maximum de carte au-dessus). Si la partie est plus haute que l'écran, la rangée des onglets
 *  reste visible en haut (`revealBlock`). Après le rendu du panneau déplié, sinon il n'a pas
 *  encore de hauteur. Suit aussi le volet droit du cockpit. */
const tabsEl = ref<HTMLElement | null>(null);
function toggleMapPanel(id: MapPanel) {
  mapPanel.value = mapPanel.value === id ? null : id;
  // Un seul affichage ouvert à la fois : ouvrir un onglet referme la fiche d'un lieu.
  if (mapPanel.value) selected.value = null;
  // Ouvrir cale les tuiles en bas ; RE-toucher l'onglet le replie et cale le bas de la
  // carte en bas de l'écran (demandé : sinon il fallait remonter à la main).
  void nextTick(mapPanel.value ? revealTiles : revealTabs);
}
/** Cale en bas de l'écran la dernière tuile affichée sous la carte : celle de la partie
 *  dépliée, sinon la rangée des onglets elle-même. */
function revealTiles() {
  const tabs = tabsEl.value;
  if (!tabs) return;
  const root = tabs.parentElement ?? tabs;
  const last =
    mapPanel.value === 'ctl'
      ? root.querySelector('.cps')
      : mapPanel.value === 'trips'
        ? (root.querySelector('.trips:not(.map-tab)') ?? root.querySelector('.map-tab-empty'))
        : null;
  revealBlock(tabs, last ?? tabs);
}
/** ↕️ Le bouton à gauche du zoom (cf. `mapSlide.ts`) : le sens suit la place de la rangée de
 *  tuiles à l'écran, relue à chaque défilement (en capture : le volet du cockpit défile seul). */
const slideDir = ref<MapSlide>('down');
let slideRaf = 0;
function updateSlideDir() {
  if (slideRaf) return;
  slideRaf = requestAnimationFrame(() => {
    slideRaf = 0;
    const el = tabsEl.value;
    if (el) slideDir.value = mapSlideDirection(el.getBoundingClientRect().top, window.innerHeight);
  });
}
function slideMap() {
  if (slideDir.value === 'down') {
    // ↓ ouvre aussi la tuile des expéditions (demandé), puis cale ses dernières tuiles en bas.
    if (mapPanel.value !== 'trips') {
      mapPanel.value = 'trips';
      selected.value = null;
    }
    void nextTick(revealTiles);
  } else {
    // ↑ referme aussi la partie dépliée sous la carte (demandé), sans recaler le bas de la
    // carte ensuite (`goingTop`) : le recalage contrarierait la remontée.
    goingTop = true;
    mapPanel.value = null;
    void nextTick(() => {
      goingTop = false;
    });
    scrollContainerOf(tabsEl.value)?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
onMounted(() => {
  window.addEventListener('scroll', updateSlideDir, { capture: true, passive: true });
  window.addEventListener('resize', updateSlideDir, { passive: true });
  updateSlideDir();
});
onUnmounted(() => {
  window.removeEventListener('scroll', updateSlideDir, { capture: true });
  window.removeEventListener('resize', updateSlideDir);
  if (slideRaf) cancelAnimationFrame(slideRaf);
});
/** ⚔️ Les attaques en cours. Horloge grossière : la liste ne change qu'à l'apparition ou
 *  l'arrivée d'une armée. */
const attacks = computed(() => activeAttacks(pois.value, coarseNow.value));
/** 🛡️ Ce que TA défense actuelle tiendrait face à chaque armée de la liste (demandé : « le
 *  % de défense de ces armées selon l'endroit qu'elles attaquent et la défense actuelle »).
 *  ⚠️ Aucune règle nouvelle : un SIÈGE rejoue `siegeHoldChance` (le pronostic de la Base,
 *  héros présent à l'heure de l'assaut compris), une REPRISE `defenseOf` (celui de la fiche
 *  du point, défenseurs présents à l'heure de l'attaque). `null` = inconnu : un siège sans
 *  renseignement de la Tour de guet n'annonce rien — même garde que la Base. Horloge
 *  grossière, et calculé seulement quand la liste est dépliée (prop lue sous `v-if`). */
const attackHolds = computed<Record<string, number | null>>(() => {
  const out: Record<string, number | null> = {};
  const b = base.value;
  const raid = incoming.value;
  for (const r of attacks.value) {
    if (r.kind === 'retake') {
      out[r.army.id] = r.target ? (defenseOf(r.target)?.pct ?? null) : null;
      continue;
    }
    const known =
      !!b &&
      !!raid &&
      r.army.army?.targetId === raid.id &&
      scoutClarity(scoutLevel(b.defenses), raid.level, heroLevel.value, raid.seed) > 0;
    out[r.army.id] =
      known && b && raid
        ? Math.round(
            siegeHoldChance(
              b.defenses,
              heroLevel.value,
              heroDefendsNow.value,
              guardUnits(
                heroLevel.value,
                freeStable.value,
                cap.value,
                compCtx.value,
                milHome.value,
              ),
              raid,
            ) * 100,
          )
        : null;
  }
  return out;
});
/** ⚔️ L'armée entourée d'une aura (touchée dans la liste) ; elle s'éteint si l'armée n'est
 *  plus sur la carte. */
const focusArmy = ref<string | null>(null);
const focusArmyPoi = computed(() =>
  focusArmy.value ? (pois.value.find((p) => p.id === focusArmy.value) ?? null) : null,
);
/** 🧭⚔️ Voyages et attaques ennemies partagent UNE tuile (demandé : « fusionne la tuile
 *  expéditions et attaques ») ; le filtre vit dans `TripsPanel`. La pastille passe au rouge
 *  dès qu'une armée marche. */
const mapTabs = computed<{ id: MapPanel; emo: string; label: string; n: number; alert: boolean }[]>(
  () => [
    {
      id: 'trips',
      emo: '🧭',
      label: 'Expéditions',
      n: trips.value.length + attacks.value.length,
      alert: attacks.value.length > 0,
    },
    { id: 'ctl', emo: '🏰', label: 'Places fortes', n: ctlCalls.value, alert: false },
  ],
);
const ctlRoster = computed(() =>
  controlRoster(
    char.row?.expedition_map,
    char.partyList.map((g) => ({
      poiId: g.poi.id,
      midAt: g.midAt,
      ids: tripCrew(g),
    })),
    coarseNow.value,
    heroLevel.value,
  ),
);
/** Combien de points appellent : attaque imminente, sans défense, butin à récolter. */
const ctlCalls = computed(
  () => ctlRoster.value.filter((r) => r.status === 'imminent' || r.status === 'empty').length,
);
/** ➕ LE RENFORT DIRECT depuis la liste (demandé : « cliquer sur un slot libre et envoyer un
 *  renfort sans aller dans la gestion du lieu »). Un point l'accepte s'il a une place ET
 *  quelqu'un pour la prendre — les MÊMES règles que la fiche (`controlFreeSeats` pour un
 *  champion, `militiaFreeSeats` pour un milicien). */
const reinforceable = computed(() =>
  ctlRoster.value
    .filter(
      (r) =>
        (controlFreeSeats(r.poi.control) > 0 && freeSorted.value.length > 0) ||
        (militiaFreeSeats(r.poi.control) > 0 && milHome.value > 0) ||
        // ⇄ Ou quelqu'un d'un AUTRE point tenu (la règle du transfert, `transferBlocker`).
        transferSourcesFor(char.row?.expedition_map, r.poi.id).length > 0,
    )
    .map((r) => r.poi.id),
);
/** Le point visé, relu sur la carte à chaque rendu : ses places changent dès qu'un renfort part. */
const quickId = ref<string | null>(null);
const quickPoi = computed(
  () => char.row?.expedition_map?.pois.find((p) => p.id === quickId.value) ?? null,
);
const quickMilitiaMin = computed(() =>
  quickPoi.value ? caravanLegMin(quickPoi.value, [], 0, travelMult.value) : 0,
);
/** ➕ La sélection du renfort groupé (`reinforceSelection`), remise à zéro à chaque lieu. */
const quickSel = ref<ReinfSelection>(emptyReinfSelection());
/** ⏳ Dans combien de minutes la sélection part (0 = tout de suite). */
const quickDelayMin = ref(0);
watch(quickId, () => {
  quickSel.value = emptyReinfSelection();
  quickDelayMin.value = 0;
});
/** Les places libres du lieu, MOINS celles que des départs programmés vers lui occupent déjà. */
const quickFree = computed(() => {
  const taken = quickId.value ? plannedSeatsTo(char.plannedList, quickId.value) : null;
  return {
    champ: Math.max(0, controlFreeSeats(quickPoi.value?.control) - (taken?.champ ?? 0)),
    total: Math.max(0, garrisonFreeSeats(quickPoi.value?.control) - (taken?.total ?? 0)),
    mil: Math.max(0, militiaFreeSeats(quickPoi.value?.control) - (taken?.total ?? 0)),
  };
});
/** 🛡️ Les miliciens de la base qui ne sont pas réservés pour un départ programmé. */
const milHomeFree = computed(() => Math.max(0, milHome.value - plannedMilitia(char.plannedList)));
/** L'heure du départ programmé, lisible. */
const quickDepartLabel = computed(() =>
  quickDelayMin.value > 0
    ? new Date(now.value + quickDelayMin.value * 60_000).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null,
);
/** 🧭 Le trajet de chaque champion disponible jusqu'au lieu, seul (la règle d'un renfort). */
const quickChampMin = computed<Record<string, number>>(() => {
  const p = quickPoi.value;
  if (!p) return {};
  return Object.fromEntries(freeSorted.value.map((a) => [a.id, legOfMember(a)(p)]));
});
/** 🧭 Le trajet de la sélection (le plus long, départ différé non compris) et son heure
 *  d'arrivée — lus sur les mêmes arrivées que la tenue (`quickExtra`), donc ceux du départ réel. */
const quickArrival = computed(() => {
  const p = quickPoi.value;
  if (!p || !reinfCount(quickSel.value)) return null;
  const arr = quickExtra(p, quickSel.value);
  if (!arr.length) return null;
  const last = Math.max(...arr.map((x) => x.at));
  const start = coarseNow.value + quickDelayMin.value * 60_000;
  return {
    min: Math.max(0, Math.round((last - start) / 60_000)),
    at: new Date(last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
});
/** ⏳ Les départs déjà programmés vers ce lieu. */
const quickPlanned = computed(() =>
  char.plannedList
    .filter((m) => !m.recall && m.toId === quickId.value)
    .map((m) => ({
      id: m.id,
      count: plannedCount(m),
      departIn: formatDuration(Math.max(0, m.departAt - now.value)),
      departAt: new Date(m.departAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    })),
);
/** Les arrivées d'une sélection, comme au départ réel : les champions de la base partent
 *  ensemble (au pas du plus lent, `partyLegMin`), ceux d'un même lieu aussi (`legFromSpot`,
 *  la règle du transfert), les miliciens à leur pas. */
function quickExtra(p: Poi, sel: ReinfSelection) {
  // ⏳ Un départ programmé arrive d'autant plus tard.
  const t = coarseNow.value + quickDelayMin.value * 60_000;
  const at = (min: number) => t + min * 60_000;
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  const legOf = (q: Poi, escort: Adventurer[]) =>
    partyLegMin(q, escort, {
      hero: false,
      travelMult: travelMult.value,
      gearSpeed: advGearRoles(escort, char.advGearStock).speed,
    });
  const out: { id: string; at: number }[] = [];
  const escort = sel.champs.flatMap((id) => byId.get(id) ?? []);
  const leg = escort.length ? legOf(p, escort) : 0;
  for (const a of escort) out.push({ id: a.id, at: at(leg) });
  for (let i = 0; i < sel.militia; i++)
    out.push({ id: `${MILITIA_PREFIX}new${i}`, at: at(quickMilitiaMin.value) });
  for (const [fromId, ids] of transfersByOrigin(sel)) {
    const from = char.row?.expedition_map?.pois.find((q) => q.id === fromId);
    if (!from) continue;
    const champs = ids.flatMap((id) => byId.get(id) ?? []);
    const cLeg = champs.length ? legFromSpot(p, from, (q) => legOf(q, champs)) : 0;
    const mLeg = legFromSpot(p, from, (q) => caravanLegMin(q, [], 0, travelMult.value));
    for (const id of ids) out.push({ id, at: at(isMilitiaId(id) ? mLeg : cLeg) });
  }
  return out;
}
/** 🎯 Le renfort direct annonce la tenue du point À L'ATTAQUE, et ce que chaque renfort
 *  CHANGE à la sélection en cours (arrivée comprise : un renfort trop lent n'ajoute rien) —
 *  le langage de `AdvPickTile` : coché, ce qu'on perdrait sans lui ; non coché, ce qu'il
 *  ajouterait. ⚠️ Une simulation par candidat, sur l'horloge GROSSIÈRE. */
const quickHold = computed(() => {
  const p = quickPoi.value;
  const base = defenseOf(p);
  if (!p || !base) return null;
  const sel = quickSel.value;
  const cur = defenseOf(p, quickExtra(p, sel))?.pct ?? base.pct;
  const pctWith = (next: ReinfSelection) => defenseOf(p, quickExtra(p, next))?.pct ?? cur;
  const free = quickFree.value;
  const champ: Record<string, number> = {};
  for (const a of freeSorted.value) {
    const on = sel.champs.includes(a.id);
    if (!on && !reinfCanAdd(sel, 'champ', free)) continue;
    const other = pctWith(toggleReinfChamp(sel, a.id, free));
    champ[a.id] = on ? cur - other : other - cur;
  }
  const trans: Record<string, number> = {};
  for (const src of quickSources.value)
    for (const m of src.members) {
      const on = sel.transfers.some((t) => t.id === m.id);
      if (!on && !reinfCanAdd(sel, isMilitiaId(m.id) ? 'mil' : 'champ', free)) continue;
      const other = pctWith(toggleReinfTransfer(sel, src.fromId, m.id, free));
      trans[m.id] = on ? cur - other : other - cur;
    }
  const mil = reinfCanAdd(sel, 'mil', free)
    ? pctWith({ ...sel, militia: sel.militia + 1 }) - cur
    : 0;
  return { pct: base.pct, vsArmy: base.vsArmy, mil, champ, trans };
});
/** La tenue AVEC toute la sélection. */
const quickSelHold = computed(() => {
  const p = quickPoi.value;
  if (!p || !reinfCount(quickSel.value)) return null;
  const d = defenseOf(p, quickExtra(p, quickSel.value));
  return d ? { pct: d.pct, late: d.late } : null;
});
/** ⇄ Les membres des AUTRES points tenus qui peuvent venir, avec leur trajet depuis leur
 *  point — la règle et le trajet du store (`transferBlocker`, `legFromSpot`). */
const quickSources = computed(() => {
  const to = quickPoi.value;
  const map = char.row?.expedition_map;
  if (!to || !map) return [];
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  const reserved = plannedTransferIds(char.plannedList);
  return transferSourcesFor(map, to.id).flatMap((s) => {
    const from = map.pois.find((p) => p.id === s.fromId);
    if (!from?.control) return [];
    type Member = { id: string; adv: (typeof char.advList)[number] | null; min: number };
    const members = s.ids.flatMap((id): Member[] => {
      if (reserved.has(id)) return [];
      if (isMilitiaId(id))
        return [
          {
            id,
            adv: null,
            min: legFromSpot(to, from, (q) => caravanLegMin(q, [], 0, travelMult.value)),
          },
        ];
      const adv = byId.get(id);
      if (!adv) return [];
      return [
        {
          id,
          adv,
          min: legFromSpot(to, from, (q) =>
            partyLegMin(q, [adv], {
              hero: false,
              travelMult: travelMult.value,
              gearSpeed: advGearRoles([adv], char.advGearStock).speed,
            }),
          ),
        },
      ];
    });
    return members.length
      ? [
          {
            fromId: from.id,
            emo: CONTROL_EMO[from.control.kind],
            label: CONTROL_LABEL[from.control.kind],
            members,
          },
        ]
      : [];
  });
});
/**
 * 🔙 FAIRE DEMI-TOUR (demandé : « en cliquant dessus », puis « plus design avec le détail »).
 * Toucher une troupe ouvre `RecallSheet` : le chemin dessiné, qui rentre, et les deux
 * options comparées. Le détail est relu chaque seconde — la troupe avance pendant qu'on hésite.
 */
interface RecallInfo extends RecallAsk {
  members: readonly string[];
  sentAt: number;
  arriveAt: number;
  returnAt?: number;
}
const heroRecallInfo = computed<RecallInfo | null>(() => {
  const a = active.value;
  return a
    ? {
        kind: 'hero',
        label: 'Ton héros',
        emo: '🧝',
        poi: a.poi,
        hero: true,
        members: tripCrew(a),
        ...recallWindow(a),
      }
    : null;
});
const recallAsk = ref<{ target: RecallTarget; info: RecallInfo } | null>(null);
const recallOpen = computed({
  get: () => !!recallAsk.value,
  set: (v: boolean) => {
    if (!v) recallAsk.value = null;
  },
});
const recallBusy = ref(false);
const recallPrev = computed(() =>
  recallAsk.value ? recallPreview(recallAsk.value.info, now.value) : null,
);
const recallCrew = computed(() =>
  (recallAsk.value?.info.members ?? [])
    .map((id) => char.advList.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({
      id: a.id,
      name: a.name,
      championId: a.championId ?? null,
      emoji: advTitle(a)?.emoji ?? '🧑',
    })),
);
const recallMilitia = computed(() => militiaIn(recallAsk.value?.info.members ?? []).length);
/** 🔙 Les tuiles de voyage (`TripsPanel`) qui peuvent faire demi-tour, par leur clé. Les
 *  clés des tuiles et des marqueurs de la carte diffèrent d'un préfixe (`g` pour une équipe). */
function tripRecall(key: string) {
  if (key === 'hero')
    return heroRecallable.value
      ? { target: { kind: 'hero' } as RecallTarget, info: heroRecallInfo.value }
      : null;
  const v = travelersOnMap.value.find(
    (x) => x.recall && (x.kind === 'party' ? 'g' + x.id === key : x.id === key),
  );
  return v ? { target: v.recall!, info: v.recallInfo } : null;
}
const recallableTrips = computed(
  () => new Set(trips.value.map((t) => t.key).filter((k) => !!tripRecall(k))),
);
/** ⚡ LES BOOSTS DE VITESSE (demandé) : la cible d'une tuile de voyage — le héros, une équipe
 *  (`g` + id) ou une attaque combinée pas encore toute partie (`a` + id + `:` + groupe). */
function boostTarget(key: string):
  | { kind: 'hero'; v: ActiveExpedition }
  | { kind: 'party'; id: string; v: ActiveExpedition }
  | { kind: 'attack'; id: string; a: CombinedAttack }
  | {
      kind: 'reinf' | 'return';
      pointId: string;
      members: string[];
      at: number;
      v: Pick<ActiveExpedition, 'poi' | 'midAt' | 'returnAt'>;
    }
  | null {
  // 🛡️ Un renfort en route (`r…`) : aller simple, il arrive à `arriveAt`.
  const r = reinforcementsOnMap.value.find((x) => x.id === key);
  if (r)
    return {
      kind: 'reinf',
      pointId: r.pointId,
      members: r.members,
      at: r.arriveAt,
      v: { poi: r.poi, midAt: r.arriveAt, returnAt: r.arriveAt },
    };
  // 🏠 Un retour d'un point fixe (`h…`) : parti du point à `sentAt`, à la base à `returnAt`.
  const h = returnsOnMap.value.find((x) => x.id === key);
  if (h)
    return {
      kind: 'return',
      pointId: h.poi.id,
      members: h.members,
      at: h.returnAt,
      v: { poi: h.poi, midAt: h.sentAt, returnAt: h.returnAt },
    };
  if (key === 'hero') {
    const v = char.row?.expedition;
    return v ? { kind: 'hero', v } : null;
  }
  if (key.startsWith('g')) {
    const v = char.partyList.find((p) => p.id === key.slice(1));
    return v ? { kind: 'party', id: v.id, v } : null;
  }
  if (key.startsWith('a')) {
    const id = key.slice(1, key.lastIndexOf(':'));
    const a = char.attackList.find((x) => x.id === id);
    return a ? { kind: 'attack', id, a } : null;
  }
  return null;
}
const focusBoosts = computed(() => {
  const key = focusTrip.value;
  const stock = char.row?.supplies ?? {};
  if (!key || !BOOST_IDS.some((id) => (stock[id] ?? 0) > 0)) return null;
  const t = boostTarget(key);
  if (!t) return null;
  const at = now.value;
  return {
    key,
    plan: boostChoices(stock, (min) =>
      t.kind === 'attack' ? attackBoostPlan(t.a, min, at) : voyageBoostPlan(t.v, min, at),
    ),
  };
});
/** ⚡🔙 La barre du voyage touché (cf. le gabarit) : seulement quand son détail sous la carte
 *  n'est pas affiché (panneau Expéditions replié) et que le panneau par-dessus est fermé. */
const boostAskOpen = ref(false);
const tripBar = computed(() => {
  const key = focusTrip.value;
  if (!key || overlay.value || mapPanel.value === 'trips') return null;
  const t = trips.value.find((x) => x.key === key);
  if (!t) return null;
  const b = focusBoosts.value;
  const boost =
    b && b.key === key
      ? 'block' in b.plan
        ? { block: BOOST_BLOCK_LABEL[b.plan.block], choices: [] }
        : b.plan.choices.length
          ? { block: null, choices: b.plan.choices }
          : null
      : null;
  const recall = recallableTrips.value.has(key);
  return { key, title: t.title, boost, recall };
});
watch(tripBar, (b) => {
  if (!b?.boost) boostAskOpen.value = false;
});
const boostBusy = ref(false);
function boostTrip(key: string, id: BoostId) {
  const t = boostTarget(key);
  const b = focusBoosts.value;
  const choice = b && 'choices' in b.plan ? b.plan.choices.find((c) => c.id === id) : undefined;
  if (!t || !choice) return;
  const run = async () => {
    const uid = auth.user?.id;
    if (!uid || boostBusy.value) return;
    boostBusy.value = true;
    try {
      const why = await char.applySpeedBoost(
        uid,
        t.kind === 'hero'
          ? { kind: 'hero' }
          : 'pointId' in t
            ? { kind: t.kind, pointId: t.pointId, members: t.members, at: t.at }
            : { kind: t.kind, id: t.id },
        id,
        Date.now(),
      );
      if (why) $q.notify({ type: 'warning', message: why });
      else {
        // 🔁 La clé d'un renfort ou d'un retour porte son échéance : elle vient de changer.
        // On garde la tuile ouverte en la retrouvant par ses membres.
        if ('pointId' in t) {
          const same = (m: readonly string[]) =>
            m.length === t.members.length && m.every((x) => t.members.includes(x));
          const next = trips.value.find(
            (x) => x.key[0] === key[0] && x.poi.id === t.pointId && same(x.members),
          );
          if (next) focusTrip.value = next.key;
        }
        $q.notify({
          type: 'positive',
          message: `⚡ ${formatDuration(choice.gainMs)} de gagnées.`,
        });
      }
    } finally {
      boostBusy.value = false;
    }
  };
  // ⚠️ Des minutes seraient PERDUES (l'étape finit avant) : on le dit avant de valider.
  if (choice.lostMs > 0)
    $q.dialog({
      title: '⚡ Utiliser ce boost ?',
      message: `L'étape finit dans ${formatDuration(choice.gainMs)} : le boost n'en rendra que ${formatDuration(choice.gainMs)}, ${formatDuration(choice.lostMs)} seront perdues.`,
      cancel: { label: 'Annuler', flat: true },
      ok: { label: 'Utiliser', color: 'primary', textColor: 'dark' },
    }).onOk(() => void run());
  else void run();
}
function recallTripByKey(key: string) {
  const r = tripRecall(key);
  if (r) askRecall(r.target, r.info);
}
function askRecall(target: RecallTarget | undefined, info: RecallInfo | null) {
  if (!target || !info) return;
  recallAsk.value = { target, info };
}
async function confirmRecall() {
  const ask = recallAsk.value;
  const uid = auth.user?.id;
  if (!ask || !uid || recallBusy.value) return;
  recallBusy.value = true;
  try {
    const why = await char.recallTrip(uid, ask.target, Date.now());
    if (why) $q.notify({ type: 'warning', message: why });
    else $q.notify({ type: 'positive', message: `🔙 ${ask.info.label} fait demi-tour.` });
    recallAsk.value = null;
  } finally {
    recallBusy.value = false;
  }
}
/** 🚀 Envoie toute la sélection : les champions de la base, les miliciens, puis un envoi par
 *  lieu d'origine — les actions du store, qui refusent ce qui ne passe pas. Au premier refus
 *  on s'arrête et on dit ce qui est parti. */
/** ⏳ Annule un départ programmé vers le lieu ouvert. */
async function quickCancel(id: string) {
  const uid = auth.user?.id;
  if (!uid || ctlBusy.value) return;
  ctlBusy.value = true;
  try {
    if (await char.cancelPlannedMove(uid, id))
      $q.notify({ type: 'info', message: '⏳ Départ programmé annulé.' });
  } finally {
    ctlBusy.value = false;
  }
}
async function quickSend() {
  const uid = auth.user?.id;
  const p = quickPoi.value;
  const sel = quickSel.value;
  if (!uid || !p || ctlBusy.value || !reinfCount(sel)) return;
  // ⏳ Programmé : rien ne part maintenant, la sélection est réservée jusqu'à l'heure dite.
  if (quickDelayMin.value > 0) {
    ctlBusy.value = true;
    try {
      const delay = quickDelayMin.value * 60_000;
      const why = await char.scheduleReinforcement(uid, p.id, sel, delay, Date.now());
      if (why) {
        $q.notify({ type: 'warning', message: `Programmation impossible : ${why}` });
        return;
      }
      const n = reinfCount(sel);
      $q.notify({
        type: 'positive',
        message: `⏳ ${n} renfort${n > 1 ? 's' : ''} programmé${n > 1 ? 's' : ''} — départ dans ${formatDuration(delay)}`,
      });
      quickId.value = null;
    } finally {
      ctlBusy.value = false;
    }
    return;
  }
  ctlBusy.value = true;
  let sent = 0;
  const fail = (why: string) =>
    $q.notify({
      type: 'warning',
      message: `Renfort impossible : ${why}${sent ? ` (${sent} déjà en route)` : ''}`,
    });
  try {
    if (sel.champs.length) {
      const why = await char.reinforceControlPoint(uid, p.id, sel.champs, Date.now());
      if (why) return fail(why);
      sent += sel.champs.length;
    }
    if (sel.militia > 0) {
      const why = await char.sendMilitiaToControl(uid, p.id, sel.militia, Date.now());
      if (why) return fail(why);
      sent += sel.militia;
    }
    for (const [fromId, ids] of transfersByOrigin(sel)) {
      const why = await char.transferControlGarrison(
        uid,
        fromId,
        p.id,
        ids,
        Date.now(),
        heroLevel.value,
      );
      if (why) return fail(why);
      sent += ids.length;
    }
    $q.notify({
      type: 'positive',
      message: `➕ ${sent} renfort${sent > 1 ? 's' : ''} en route${
        quickSelHold.value ? ` — tenue prévue ${quickSelHold.value.pct} %` : ''
      }`,
    });
    quickId.value = null;
  } finally {
    ctlBusy.value = false;
  }
}

// ── 🏠 LA BASE, COMME UN LIEU FIXE (`BaseGarrisonSheet`) ──
const baseOpen = ref(false);
/** Les champions À LA BASE : ceux qui peuvent partir (`freeSorted`, la règle de l'envoi). */
const baseChamps = computed(() => freeSorted.value);
/** ⚫ La rangée de points sous la ville : le héros s'il est là, puis les champions présents. */
/** ⚫ La rangée de points sous la ville : le héros s'il est là, les champions présents, puis
 *  la milice en réserve de l'île (la garnison du village, signalé 2026-10-04). */
const townRow = computed(() =>
  townDots(
    !!char.row && char.heroIsHome(char.row),
    baseChamps.value.length,
    char.row?.base?.militia?.home ?? 0,
  ),
);
const heroBaseStatus = computed(() => {
  if (heroHealIn.value > 0) return `🤕 à l’infirmerie · encore ${formatDuration(heroHealIn.value)}`;
  const map = char.row?.expedition_map;
  const post = heroPostOf(map);
  if (post) return `🏰 posté : ${poiLabel(post)}`;
  if (map?.heroReturnAt !== undefined) return '🧭 rentre à la base';
  if (char.heroEngaged) return '🧭 en expédition';
  return '✅ à la base — il part depuis la fiche d’un lieu';
});
/** Les lieux fixes TENUS, où l'on peut envoyer du monde. */
const baseTargets = computed(() =>
  (char.row?.expedition_map?.pois ?? [])
    .filter((p) => p.control?.owner === 'player')
    .map((p) => ({
      id: p.id,
      emo: CONTROL_EMO[p.control!.kind],
      label: CONTROL_LABEL[p.control!.kind],
      control: p.control!,
    })),
);
/** Le trajet d'un départ de la base — les MÊMES règles que le store : les champions au pas
 *  d'une équipe sans le héros (`partyLegMin`), les miliciens à celui d'une équipe sans rôle ;
 *  on annonce le plus lent des deux. */
function baseLegMin(id: string, champIds: readonly string[], militia: number): number {
  const p = char.row?.expedition_map?.pois.find((q) => q.id === id);
  if (!p) return 0;
  const escort = char.advList.filter((a) => champIds.includes(a.id));
  const champMin = escort.length
    ? partyLegMin(p, escort, {
        hero: false,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(escort, char.advGearStock).speed,
      })
    : 0;
  const milMin = militia > 0 ? caravanLegMin(p, [], 0, travelMult.value) : 0;
  return Math.max(champMin, milMin);
}
async function sendFromBase(id: string, champIds: string[], militia: number) {
  const uid = auth.user?.id;
  if (!uid || ctlBusy.value) return;
  const label = baseTargets.value.find((t) => t.id === id)?.label ?? 'ce lieu';
  const min = baseLegMin(id, champIds, militia);
  ctlBusy.value = true;
  try {
    // Les champions d'abord : ils prennent leurs places réservées, les miliciens ce qui reste
    // (`baseSendBlocker`, la règle que l'écran a déjà appliquée).
    if (champIds.length) {
      const why = await char.reinforceControlPoint(uid, id, champIds, Date.now());
      if (why) {
        $q.notify({ type: 'warning', message: `Renfort impossible : ${why}` });
        return;
      }
    }
    if (militia > 0) {
      const why = await char.sendMilitiaToControl(uid, id, militia, Date.now());
      if (why) {
        $q.notify({
          type: 'warning',
          message: champIds.length
            ? `Champions partis, mais pas les miliciens : ${why}`
            : `Renfort impossible : ${why}`,
        });
        return;
      }
    }
    baseOpen.value = false;
    $q.notify({
      type: 'positive',
      message: `⇄ En route vers ${label} — arrivée dans ${formatDurationMin(min)}`,
    });
  } finally {
    ctlBusy.value = false;
  }
}

/** ⚔️ Toucher une attaque dans la liste = la toucher sur la carte, plus une aura pour la
 *  retrouver (demandé). */
function openAttack(p: Poi) {
  openFromList(p);
  focusArmy.value = p.id;
}
function openFromList(p: Poi) {
  mapPanel.value = null;
  panToPoi(p);
  selectPoi(p);
}

function selectPoi(p: Poi) {
  // L'aura d'une armée ne suit que tant qu'on la regarde.
  if (p.id !== focusArmy.value) focusArmy.value = null;
  // ⚠️ On sélectionne MÊME si le héros est en expédition : un convoi part sans lui.
  // Ce qui est ouvert ou non se décide dans la feuille, via `poiOffers`.
  selected.value = p;
  // Un seul affichage ouvert à la fois : le lieu referme l'onglet déplié et le voyage touché.
  mapPanel.value = null;
  overlay.value = null;
  focusTrip.value = null;
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
  // 🐺 La bête d'une tanière a une force FIXE : on peut l'attaquer en surnombre.
  if (force && p.type === 'den')
    out.push({
      icon: '🐺',
      label: 'Force de la bête',
      value: `≈ ${force.size} champions`,
      title:
        'Une seule bête, de force fixe : envoie autant de champions que tu veux (l’XP se partage entre eux)',
    });
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
  // ⚔️ Déjà attaqué : ce qu'il rapporte suffit — trajets, % et échéances servaient à l'envoi.
  if (engagedTrip.value) {
    if (rift)
      out.push({
        icon: '💠',
        label: 'Si refermée',
        value: `~${rift.clearMana}`,
        title: 'Mana si tu la refermes — gardien compris',
      });
    return out;
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
    out.push(
      'army' in band
        ? {
            icon: '⏳',
            label: 'Arrive dans',
            value: formatDuration(band.gone),
            cls: 'warn',
            title: `Elle attaquera ${band.target} à son arrivée : il faut la croiser avant`,
          }
        : {
            icon: '⏳',
            label: 'Disparaît dans',
            value: formatDuration(band.gone),
            title: 'Passé ce délai elle a rejoint son armée : plus rien à intercepter',
          },
    );
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
    const leg = (min: number, title: string) =>
      partySize.value
        ? { value: formatDurationMin(min), title }
        : { value: '—', cls: 'dim', title: 'Compose ton équipe pour le connaître' };
    // 🏰 Un point fixe : si l'équipe le prend, elle y RESTE — un aller-retour ne dirait rien.
    // Le retour ne concerne que ceux qui rentrent (`controlReturnNote`).
    if (p.type === 'control')
      out.push(
        {
          icon: '🚶',
          label: 'Aller',
          go: true,
          ...leg(partyLeg.value, 'Temps pour atteindre le point'),
        },
        {
          icon: '↩️',
          label: 'Retour',
          go: true,
          ...leg(partyLeg.value, controlReturnNote.value ?? ''),
          ...(partySize.value
            ? combined.value
              ? {
                  value: 'par groupe',
                  title: 'Chaque groupe rentre chez lui, avec son propre temps — voir le plan',
                }
              : { value: controlReturnValue(partyLeg.value, partyWonLeg.value) }
            : {}),
        },
      );
    else
      out.push({
        icon: '⏱️',
        label: 'Trajet',
        go: true,
        ...leg(partyMin.value, 'Aller-retour de l’équipe'),
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
    // 🛣️ Une équipe SANS le héros sur un lieu de récolte : les gardes et la route à part
    // (2026-09-29, décision de l'utilisateur) — un seul % mêlait deux risques qui ne se
    // paient pas pareil. Aller perdu = demi-tour sans rien, retour perdu = une part du butin.
    const route = partyRoute.value;
    if (route) {
      const gw = partyGuardWin.value;
      if (guard)
        out.push({
          icon: '🎯',
          label: 'Gardes',
          value: gw === null ? '—' : `${Math.round(gw * 100)} %`,
          go: true,
          title: 'Chance d’abattre les gardes du lieu, une fois arrivé',
          cls: gw === null ? 'dim' : winClass(Math.round(gw * 100)),
        });
      const clear = Math.round(route.clear * 100);
      const back = Math.round(route.turnBack * 100);
      out.push({
        icon: '🛣️',
        label: p.perilous || p.riftPeril || p.nestPeril ? 'Route dangereuse' : 'Route',
        value: `${clear} % sûre`,
        go: true,
        title: `${clear} % des trajets sans embuscade perdue · ${back} % font demi-tour à l’aller (lieu jamais atteint, blessés à l’infirmerie) · au retour, une embuscade perdue coûte une part du butin. Plus de champions, mieux la route tient.`,
        cls: winClass(clear),
      });
      if (back > 0)
        out.push({
          icon: '🔙',
          label: 'Demi-tour',
          value: `${back} %`,
          title:
            'Embuscade perdue à l’aller : l’équipe rentre avec ses blessés, sans atteindre le lieu',
          cls: winClass(100 - back),
        });
    } else if (teamOnly.value || guard)
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
      title: `Bâts 🧺, porteurs 🐫 et pièces de cargaison compris — ${formatHaul(team.bonus, '+')}`,
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
        ? 'L’énergie ne suit que les bâts 🧺, jamais les porteurs'
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
  mapPois.value
    .filter(dimmed)
    .map((p) => p.id)
    .join('|'),
);
/** 💀 Les lieux terrassés ENCORE sur la carte : une armée en campagne n'est pas retirée au
 *  départ (elle continue sa marche) — elle se grise elle aussi, jusqu'au retour des vainqueurs. */
const downKey = computed(() =>
  [
    ...(heroTargetDown.value && active.value && !fixedOnMap(active.value.poi)
      ? [active.value.poi.id]
      : []),
    ...travelTargets.value.filter((v) => v.down).map((v) => v.poi.id),
  ].join('|'),
);
const veiledKey = computed(() =>
  fogPlan.value
    ? mapPois.value
        .filter((p) => underFog(p, TOWN, fogR.value))
        .map((p) => p.id)
        .join('|')
    : '',
);
/** ⚔️ LE LIEU SÉLECTIONNÉ EST DÉJÀ ATTAQUÉ : c'est la cible dessinée d'un voyage en cours
 *  (héros ou équipe). La fiche se réduit alors (demandé) : qui y est, quand il rentre, ce
 *  qu'il rapporte. ⚠️ Mêmes listes que les cibles DESSINÉES : un lieu non terrassé revenu
 *  sur la carte dès le rapport est de nouveau un lieu ordinaire, réattaquable. */
/** ⚔️ ATTAQUER PLUSIEURS FOIS À LA FOIS (demandé) : combien d'équipes marchent déjà sur le
 *  lieu choisi — il reste attaquable, la première qui le prend l'emporte, les suivantes
 *  arrivent trop tard (`supersedeLate`). */
const marchingNote = computed(() => {
  const p = selected.value;
  if (!p) return null;
  const t = now.value;
  const a = active.value;
  const n =
    char.partyList.filter((g) => !g.wingOf && g.poi.id === p.id && t < g.midAt).length +
    (a && a.poi.id === p.id && t < a.midAt ? 1 : 0);
  if (!n) return null;
  return (
    (n > 1 ? `${n} équipes y marchent déjà` : 'Une équipe y marche déjà') +
    ' — tu peux en envoyer une autre : la première qui le prend l’emporte, les suivantes arrivent trop tard.'
  );
});
const engagedTrip = computed(() => {
  const p = selected.value;
  if (!p) return null;
  // 🏰 Un lieu qu’on TIENT n’est pas « déjà attaqué » (signalé : après une prise, le héros
  // qui rentre faisait cacher toute la fiche — garnison, production, renforts).
  if (liveControl.value?.owner === 'player') return null;
  const t = now.value;
  const back = (midAt: number, returnAt: number) =>
    (t >= midAt ? 'sur le retour' : 'en route') +
    ', de retour en ville dans ' +
    formatDuration(Math.max(0, returnAt - t));
  const a = active.value;
  if (a && a.poi.id === p.id && voyageTargetShown(a, t) && t < a.returnAt)
    return 'Ton héros y est parti — ' + back(a.midAt, a.returnAt);
  const v = travelTargets.value.find((x) => x.poi.id === p.id);
  const g = v ? char.partyList.find((x) => x.id === v.id) : null;
  if (g) return 'Une équipe y est partie — ' + back(g.midAt, g.returnAt);
  return v ? 'Une équipe y est partie' : null;
});
const travelTargets = stableBy(
  () =>
    travelersOnMap.value
      .filter((v) => v.kind !== 'reinf') // le point tenu est déjà dessiné par MapPoiLayer
      // 🏰 Un lieu FIXE encore sur la carte (pris et tenu) se dessine lui-même : sa cible,
      // marquée terrassée, le grisait et le barrait tant que l'équipe rentrait (signalé).
      .filter((v) => !fixedOnMap(v.poi))
      // 🗺️ Un lieu non terrassé est REVENU sur la carte dès le rapport : ne pas le redessiner.
      .filter((v) => !hiddenTargets.value.has(v.id))
      .map((v) => ({ id: v.id, poi: v.poi, kind: v.kind, down: 'down' in v && v.down })),
  (l) => l.map((v) => v.id + (v.down ? '†' : '')).join('|'),
);

// Avant-poste : débloque les expéditions + réduit les trajets.
const outpostBuilt = computed(() => expeditionsUnlocked(char.row?.buildings ?? []));
// 🗼 Les tours de guet tenues raccourcissent les trajets APRÈS l'Avant-poste.
const travelMult = computed(
  () =>
    travelTimeMult(char.row?.buildings ?? []) *
    controlTravelMult(char.row?.expedition_map, now.value),
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
  // ⚠️ Seules les armées de FAILLE rendent du mana ; les autres, le butin de leur faction.
  warband: (p) =>
    p.convoy
      ? 'or 🪙 · la forteresse n’est pas renforcée'
      : p.army
        ? `${p.army.rift ? 'mana 💠' : FACTION_LOOT_LABEL[p.army.faction]} · chaque ennemi abattu n’attaquera pas`
        : 'mana 💠 · siège non renforcé',
  ruins: (p) => (ruinsSealKind(p) === 'champion' ? 'sceaux de champion 🔱' : 'sceaux d’objet ⚜️'),
  fallen: () => 'consommables 🎒',
  den: () => 'beaucoup d’XP · consommables 🎒',
  plunder: () => 'beaucoup d’or 🪙',
  vein: () => 'mana 💠 · 1 à 3 champions, plus vite à plusieurs',
  control: (p) =>
    p.control
      ? p.control.owner === 'player'
        ? `${CONTROL_YIELD[p.control.kind]} tant que tu le tiens`
        : p.control.kind === 'citadel' ||
            p.control.kind === 'objective' ||
            p.control.kind === 'fortress'
          ? `à abattre · ${CONTROL_YIELD[p.control.kind]}`
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
  partyGain,
  stayCap,
  stayHold,
  stayHoldOf,
  stayIds,
  stayChoice,
  toggleStay,
  partyHeroStay,
  heroStays,
  heroStayChoice,
  combined,
  wingPlan,
  combinedBlock,
  originOptions,
  partyGroups,
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
  partyGuardWin,
  partyRoute,
  partyLeg,
  partyWonLeg,
  partyMin,
  partyRisk,
  partySendBlock,
  canSendPartyNow,
  partyMax,
  partyXpSplit,
  partyXp,
  partyLowXp,
  togglePartyAdv,
  togglePartyGroup,
  partyGroupState,
  partyAllIds,
  partyAllOn,
  togglePartyAll,
  partySendLabel,
  doSendParty,
} = useExpeditionParty({
  selected,
  now,
  coarseNow,
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
  partyTarget,
  teamOnly,
  selectedRift,
  progressReady: progress.ready,
  settleDueSiege,
});
/** 🏰 Qui rentre d'un assaut sur un point fixe, et en combien de temps (`controlReturnNote`). */
const controlReturnNote = computed(() =>
  selected.value?.control?.owner === 'enemy' &&
  partyTarget.value &&
  partySize.value &&
  !combined.value
    ? returnNote(
        partyLeg.value,
        partyWonLeg.value,
        // 🏰 Prise, la forteresse garde le héros.
        partyHeroOn.value && selected.value?.control?.kind !== 'fortress',
        partyAdvs.value.length,
        stayCap.value,
      )
    : null,
);
onMounted(async () => {
  // La carte est tenue à jour par l'Aventure qui l'héberge (`expeSyncMap` dans sa boucle).
  if (auth.user?.id && !char.row) await char.fetchMine().catch(() => undefined);
  await nextTick();
  measure();
  await initialFit();
  liftFog(readFogSeen());
  window.addEventListener('resize', measure);
  const el = scrollEl.value;
  // 📐 Le cadre peut n'avoir sa vraie taille qu'APRÈS le montage (l'onglet Carte pivote,
  // la page finit sa mise en page) : on re-mesure à chaque changement, et le cadrage de
  // départ se fait à la PREMIÈRE vraie mesure s'il n'a pas pu se faire au montage.
  if (el && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => {
      measure();
      if (!fitted) void initialFit();
    });
    resizeObs.observe(el);
  }
  el?.addEventListener('touchstart', onTouchStart, { passive: true });
  el?.addEventListener('touchmove', onTouchMove, { passive: false });
  el?.addEventListener('touchend', onTouchEnd, { passive: true });
  el?.addEventListener('touchcancel', onTouchEnd, { passive: true });
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
/** Le cadrage tient-il compte d'un cadre de taille réelle ? */
let fitted = false;
let resizeObs: ResizeObserver | null = null;
/** 🧭 Vue de départ. ⚠️ Ne se fait que sur un cadre MESURÉ : sur un cadre encore à ~0 px,
 *  la formule rendait le dézoom maximal et centrait de travers. */
async function initialFit() {
  if (contW.value < 50) return;
  fitted = true;
  // Vue de départ : le disque révélé tient dans la largeur (la carte grandit avec
  // l'Avant-poste, un zoom fixe montrerait un tout petit disque en début de partie),
  // puis UN CRAN de plus (demandé par l'utilisateur : le disque entier était un cran trop
  // dézoomé — on voit la ville et ses abords, le reste se trouve en faisant glisser ou au −).
  // 🏝️ Sur une île, le village du port est AU BORD : on cadre l'île entière, centrée sur elle.
  const fitR = island.value ? V.value.size / 2 - 20 : reveal.value;
  mapPx.value = clampPx(Math.round((contW.value * V.value.size) / (2 * (fitR + 6))) + ZOOM_STEP);
  await nextTick();
  if (island.value) centerOn(V.value.x + V.value.size / 2, V.value.y + V.value.size / 2);
  else centerTown();
}
onUnmounted(() => {
  resizeObs?.disconnect();
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
/* ⚔️🧭 Le plan d'une attaque combinée : une ligne par groupe. */
.wing-plan {
  margin-top: 8px;
}
.wing-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  min-height: 32px;
  padding: 4px 10px;
  margin-bottom: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font-size: 13px;
}
.wing-row.empty {
  opacity: 0.55;
  border-style: dashed;
}
.wing-emo {
  font-size: 18px;
  flex: none;
}
.wing-name {
  flex: 1 1 6.5em; /* sinon le retour écrase le nom au lieu de passer à la ligne */
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
}
.wing-n {
  flex: none;
  color: var(--dim);
}
.wing-when {
  flex: none;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
/* Le retour de CE groupe chez lui : poussé à droite, et sur sa propre ligne s’il manque de place. */
.wing-back {
  flex: none;
  margin-left: auto;
  color: var(--dim);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
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
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 6px;
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
/* 🧭 En-tête d'un lieu de départ dans la liste des champions (pleine largeur de la grille). */
.pool-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 13px;
  width: 100%;
  min-height: 44px;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.pool-head:disabled {
  cursor: default;
}
.pool-head.pool-all {
  border-color: var(--accent);
}
.pool-check {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dim);
  white-space: nowrap;
}
.pool-all .pool-check {
  border-color: var(--accent);
  color: var(--accent);
}
.pool-emo {
  font-size: 16px;
}
.pool-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--text);
}
.pool-leg {
  flex-shrink: 0;
  white-space: nowrap;
}
.pool-leg {
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.pool-n {
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.pool-empty {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--dim);
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
  /* Au-dessus des boutons ronds fixés en bas de l'écran (48 px + 16 de marge). */
  bottom: calc(68px + env(safe-area-inset-bottom));
  z-index: 3;
  padding: 8px 0 10px;
  background: linear-gradient(180deg, transparent, var(--bg) 30%);
}
/* Le fond continue sous la barre jusqu'au bas de l'écran : sinon la fiche défilait, visible,
   entre le bouton d'envoi et les boutons ronds. */
.send-bar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: calc(68px + env(safe-area-inset-bottom));
  background: var(--bg);
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
  border: 1px solid color-mix(in srgb, var(--held) 55%, var(--line));
  background: color-mix(in srgb, var(--held) 8%, var(--surface));
}
.ctl-tier b {
  color: var(--accent);
}
.ctl-line {
  margin: 0 0 6px;
  font-size: 12.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
/* 📜 La dernière attaque : une ligne qu'on touche pour rouvrir le rapport. */
.ctl-last {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.ctl-last-t {
  font-weight: 700;
}
.port-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.port-txt {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
}
.port-btn {
  min-height: 44px;
  width: 100%;
  font-weight: 700;
}
.port-why {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
.yield-card {
  margin: 0 0 12px;
  padding: 10px 12px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.yield-card.ready {
  border-color: var(--d1, #7bc86c);
}
.yield-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.yield-emo {
  font-size: 28px;
  line-height: 1;
}
.yield-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.yield-value {
  font-family: 'Oswald', sans-serif;
  font-size: 24px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.yield-card.ready .yield-value {
  color: var(--d1, #7bc86c);
}
.yield-what {
  font-size: 12px;
  color: var(--dim);
}
.yield-bar {
  height: 8px;
  margin: 10px 0 0;
  border-radius: 4px;
  background: var(--surface-2, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}
.yield-bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--accent, #ffd23f);
  transition: width 0.4s ease;
}
.yield-card.full .yield-bar i {
  background: var(--d1, #7bc86c);
}
.yield-gauge {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.carto-box {
  margin-top: 10px;
}
.carto-q {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.carto-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.carto-tile {
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.carto-tile.on {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.carto-emo {
  font-size: 20px;
  line-height: 1;
}
.carto-lab {
  font-size: 11px;
  text-align: center;
  overflow-wrap: anywhere;
}
.yield-rate {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.yield-take {
  width: 100%;
  margin-top: 10px;
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
.ctl-hold {
  color: var(--d1, #7bc86c);
}
.ctl-back {
  color: var(--text);
  border-color: color-mix(in srgb, var(--held) 55%, var(--line));
}
.ctl-plan {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 6px 6px 6px 10px;
  border: 1px dashed color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 12px;
  font-size: 12.5px;
}
.ctl-plan-main {
  flex: 1;
  min-width: 0;
}
.ctl-plan-x {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
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

/* Hébergée sous le haut de page de l'Aventure : pas de fond ni de hauteur propres. */
.emap {
  color: var(--text);
  padding-bottom: 72px; /* la place du bouton fixe ↕️ */
}
/* ⚔️🏰 Un champion en SORTIE : sa place l'attend. Contour pointillé à l'accent (la place est
   PRISE, pas bloquée) et moins estompé qu'une tuile indisponible : il fait partie du point. */
.away-tile.car-adv {
  border-color: var(--accent);
  opacity: 0.8;
}
/* 🛡️ Un milicien dans la garnison : une tuile anonyme, sélectionnable pour le ramener. */
.slot-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  padding: 6px 4px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  font: inherit;
}
.slot-plus {
  font-size: 22px;
  line-height: 1;
}
.slot-name {
  font-size: 11px;
}
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
  display: inline-flex;
  font-size: 28px;
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
/* 🎯 Ce qu'un milicien posté apporte à la tenue : la teinte de la perte d'`AdvPickTile`. */
.mil-loss {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--d4);
}
.mil-loss.zero {
  color: var(--dim);
}
/* ⇄ Les remplaçants : une ligne chacun, la tenue obtenue à droite. */
.swap {
  margin: 8px 0;
}
.swap-toggle {
  width: 100%;
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
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.swap-tt {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.swap-count {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--d1) 18%, transparent);
  color: var(--d1);
}
.swap-count.none {
  background: var(--surface-2);
  color: var(--dim);
}
.swap-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.swap-ghead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin: 0 2px 4px;
  font-size: 12px;
  font-weight: 700;
}
.swap-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.swap-row {
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
}
.swap-row:disabled {
  cursor: default;
  border-style: dashed;
  opacity: 0.6;
}
.swap-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.swap-name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.swap-sub {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
.swap-res {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: Oswald, sans-serif;
}
.swap-res b {
  font-size: 17px;
}
.swap-delta {
  font-size: 12px;
  color: var(--dim);
}
.swap-delta.up {
  color: var(--d1);
}
.swap-delta.down {
  color: var(--d4);
}
.hero-tile {
  cursor: default;
  border-style: solid;
  border-color: var(--accent);
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
/* 🗺️ La carte prend TOUTE la largeur de l'écran (demandé) : elle déborde la gouttière de
   16 px de l'Aventure qui l'héberge (`.adv-page`), sans bord ni coins sur les côtés.
   ⚠️ Couplé à ce padding : s'il change, cette marge doit suivre. */
.map-outer {
  position: relative;
  margin: 0 -16px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}
.map-scroll {
  height: 62vh;
  overflow: auto;
  touch-action: pan-x pan-y;
  background: #d7d0bd;
  scrollbar-width: none;
}
/* La rangée des îles calée sous l'en-tête, la carte va jusqu'en bas de l'écran avec ses tuiles
   dessous (mesuré au banc, v1.45.0 : en-tête 51 + marge 20, îles 50 + 7, tuiles 57, marge 8). */
.map-scroll {
  height: calc(100vh - 172px);
  height: calc(100dvh - 172px);
}
/* 🗂️ Les trois tuiles sous la carte : une ligne, trois colonnes égales, cibles ≥ 44 px. */
.map-tabs {
  scroll-margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 8px 8px;
}
.map-tab {
  position: relative;
  min-width: 0;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.map-tab.on {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.mt-emo {
  font-size: 17px;
  line-height: 1;
}
.mt-lab {
  max-width: 100%;
  white-space: nowrap;
  line-height: 1.1;
}
.mt-chev {
  position: absolute;
  left: 6px;
  top: 4px;
  color: var(--dim);
  font-size: 10px;
}
.mt-dot {
  position: absolute;
  top: -6px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  font-size: 10px;
  font-weight: 800;
  line-height: 18px;
}
.map-tab.alert .mt-dot {
  background: var(--d4);
  color: #fff;
}
.map-tab-empty {
  margin: 0 4px 8px;
  color: var(--dim);
  font-size: 12px;
  text-align: center;
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
  align-items: flex-end;
  gap: 6px;
  z-index: 3;
}
.zoom-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
/* ↕️ Le bouton de glissement, fixe en bas à droite de l'écran : en accent, c'est un
   déplacement de page, pas un zoom. Sous les fenêtres Quasar (z-index 6000). */
/* 🗂️ Les tuiles par-dessus la carte : au-dessus de la fiche des îles (z 5), sous leur rangée, et des boutons
   fixes du bas de l'écran, qui recouvrent le bas de la carte. */
.map-overlay {
  position: absolute;
  top: 56px;
  left: 8px;
  right: 8px;
  bottom: 72px;
  z-index: 6;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 4px 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.mo-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 0 0 8px;
  background: var(--bg);
}
/* 🏰 Les places fortes portent déjà leur titre : on ne garde que la croix, posée à droite. */
.mo-head.bare {
  position: absolute;
  top: 0;
  right: 0;
  min-height: 0;
  padding: 0;
  background: none;
}
.mo-title {
  font-weight: 800;
  font-size: 14px;
}
.mo-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.tile-fab .tf-emo {
  font-size: 20px;
  line-height: 1;
}
.tile-fab.on {
  background: var(--accent);
}
.tf-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  font-size: 10px;
  font-weight: 800;
  line-height: 18px;
}
.tile-fab.alert .tf-dot {
  background: var(--d4);
  color: #fff;
}
.slide-fab {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 50;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}

/* ⚡🔙 La barre du voyage touché : en bas à gauche, à la hauteur des boutons ronds. */
.trip-bar {
  position: fixed;
  left: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 48px;
  padding: 0 4px;
  border: 1.5px solid var(--accent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}
.tb-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.tb-boost {
  background: var(--accent);
  color: #15120e;
}
.tb-x {
  color: var(--dim);
  font-size: 15px;
}
.boost-ask {
  width: min(92vw, 380px);
  padding: 14px;
}
.ba-title {
  font-weight: 800;
  font-size: 15px;
  margin-bottom: 8px;
}
.ba-note {
  margin: 0 0 8px;
  color: var(--dim);
  font-size: 13px;
}
.ba-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
}
.ba-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-height: 52px;
  padding: 6px 4px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.ba-btn small {
  font-size: 11px;
  color: var(--dim);
}
.ba-btn.lossy {
  border-color: var(--d3);
  border-style: dashed;
}
.ba-btn.lossy small {
  color: var(--d3);
}
.ba-n {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 10px;
  color: var(--dim);
}
.ba-close {
  display: block;
  margin: 10px 0 0 auto;
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
.trail {
  stroke-width: 1.4;
  stroke-linecap: round;
  fill: none;
}
.trail.done {
  stroke: var(--line);
}
/* 🔴 Le trajet du voyage touché sous la carte (demandé) : en rouge, plus épais, par-dessus
   toutes les teintes (héros, équipes, renforts) — on voit tout de suite lequel c'est. */
.trail.trail-focus {
  stroke: #ff4d4d !important;
  stroke-width: 1.9 !important;
  filter: drop-shadow(0 0 1.2px rgba(255, 77, 77, 0.8)) !important;
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
.army-line {
  stroke: var(--d4);
  stroke-width: 0.8;
  stroke-dasharray: 2 1.3;
  opacity: 0.85;
  animation: armyMarch 1.2s linear infinite;
}
.army-arrow {
  fill: var(--d4);
  opacity: 0.9;
}
.army-target {
  fill: none;
  stroke: var(--d4);
  stroke-width: 0.9;
  stroke-dasharray: 1.2 1;
  transform-box: fill-box;
  transform-origin: center;
  animation: clashPulse 1.6s ease-in-out infinite;
}
@keyframes armyMarch {
  to {
    stroke-dashoffset: -3.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .army-line,
  .army-target {
    animation: none;
  }
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
/* 🖱️ Les pions des troupes laissent passer le clic (signalé : une troupe qui RENTRE d'un
   objectif part de sa position, son pion le recouvrait et l'objectif ne s'ouvrait plus). Une
   troupe qu'on peut faire rebrousser chemin garde sa cible élargie (.recall-hit). */
.van-mark,
.hero {
  pointer-events: none;
}
.recall-hit {
  fill: transparent;
  cursor: pointer;
}
.recallable .van-mark,
.recallable .hero {
  stroke-dasharray: 1.2 0.8;
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
.detect-ring {
  fill: none;
  stroke: color-mix(in srgb, var(--text) 45%, transparent);
  stroke-width: 0.6;
  stroke-dasharray: 1.6 1.6;
  pointer-events: none;
}
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
/* ⚠️ Aucun contour de focus du navigateur (signalé : un cadre blanc restait autour de la
   ville en refermant sa fiche) ; au clavier, c'est le rempart qui passe à l'accent. */
.town {
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.town:focus,
.town:focus-visible {
  outline: none;
}
.town:focus-visible :deep(.town-wall) {
  stroke: var(--accent);
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
.trip-focus-halo.army-focus-halo {
  fill: rgb(255 93 93 / 18%);
  stroke-width: 1.6;
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
