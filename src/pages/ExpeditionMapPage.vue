<template>
  <component :is="embedded ? 'div' : 'q-page'" class="emap" :class="{ embedded }">
    <GameLoader :show="booting" icon="🗺️" label="Chargement de la carte…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Carte des expéditions</div>
      <div class="iconbtn" />
    </header>

    <div class="bar">
      <span class="bar-chip">🪙 {{ char.row?.gold ?? 0 }}</span>
      <span class="bar-chip">Niv. {{ heroLevel }}</span>
      <span v-if="active" class="bar-chip live">🧭 En expédition</span>
      <span v-else-if="outpostBuilt && travelMult < 1" class="bar-chip">
        🧭 −{{ Math.round((1 - travelMult) * 100) }}% trajet
      </span>
    </div>

    <!-- 🎚️ Filtre de difficulté (par RANG, la langue de la carte). On garde les rangs
         MASQUÉS, pas les affichés : un rang nouveau apparaît visible par défaut. -->
    <div v-if="rankOptions.length > 1" class="rank-filter" role="group" aria-label="Filtrer les lieux par rang">
      <button
        v-for="o in rankOptions"
        :key="o.rankIndex"
        type="button"
        class="rf-chip"
        :class="{ on: !hiddenRanks.has(o.rankIndex) }"
        :style="{ '--rk': CHARACTER_RANKS[o.rankIndex]!.color }"
        :aria-pressed="!hiddenRanks.has(o.rankIndex)"
        :aria-label="rankChipLabel(o)"
        :title="rankChipLabel(o)"
        @click="toggleRank(o.rankIndex)"
      >
        <span class="rf-dot" />
      </button>
    </div>

    <!-- Avant-poste requis pour envoyer des expéditions. Les emplacements vivent
         désormais sur l'écran « Ma base » (v0.664) → on y renvoie explicitement. -->
    <div v-if="!outpostBuilt" class="outpost-hint">
      🧭 Construis un <b>Avant-poste d’expédition</b> depuis <b>Ma base</b> pour envoyer des héros.
      Chaque niveau réduit les temps de trajet.
    </div>

    <!-- Carte -->
    <div class="map-outer">
      <div ref="scrollEl" class="map-scroll" @scroll="onScroll">
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
              :r="reveal + FOG_SOFT"
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
          <circle :cx="TOWN.x" :cy="TOWN.y" :r="reveal" class="fog-rim" />

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
              :x1="TOWN.x"
              :y1="TOWN.y"
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

          <!-- POI -->
          <g
            v-for="p in shownPois"
            :key="p.id"
            class="poi"
            :class="{ sel: selected?.id === p.id, dim: dimmed(p) }"
            :style="{ '--rk': poiRank(p).color }"
            @click="selectPoi(p)"
          >
            <!-- 🌀 Une faille se dessine comme dans son incursion : un portail ovale cerné de
                 flammes, à la couleur de son rang — on la reconnaît d'un écran à l'autre.
                 ⚠️ Une cible de clic TRANSPARENTE dessous : sans elle, seuls les traits
                 peints du portail captaient le toucher (leçon des tourelles, v0.673). -->
            <template v-if="isRiftPoi(p)">
              <ellipse :cx="p.x" :cy="p.y" rx="4.4" ry="6.4" class="rift-hit" />
              <RiftPortal
                :color="poiRank(p).color"
                :seed="seedOf(p.id)"
                :box="{
                  x: p.x - RIFT_ICON.w / 2,
                  y: p.y - RIFT_ICON.dy,
                  w: RIFT_ICON.w,
                  h: RIFT_ICON.h,
                }"
              />
            </template>
            <template v-else>
              <circle :cx="p.x" :cy="p.y" r="4.5" class="poi-bg" />
              <text :x="p.x" :y="p.y + 1.4" class="poi-emo">{{ POI_EMO[p.type] }}</text>
            </template>
            <!-- 🏅 Le RANG du lieu, pas son niveau (demandé) : la boule du rang au-dessus et le
                 contour dans sa couleur — on repère d'un coup d'œil les lieux du rang de ses
                 champions, pour les y envoyer prendre de l'XP. ⚠️ Plus ses ÉTOILES : un rang
                 couvre dix niveaux, et un lieu Bronze ★5 écrase des champions Bronze ★1
                 (mesuré : 0 % de victoire). -->
            <text :x="p.x" :y="p.y - (isRiftPoi(p) ? RIFT_ICON.dy + 0.5 : 5.4)" class="poi-rank">
              {{ poiRank(p).emoji }}
              <tspan class="poi-star">{{ poiRank(p).star }}★</tspan>
            </text>
          </g>

          <!-- Objectif actif -->
          <g v-if="active" class="poi target">
            <circle :cx="active.poi.x" :cy="active.poi.y" r="4.8" class="poi-bg" />
            <text :x="active.poi.x" :y="active.poi.y + 1.4" class="poi-emo">
              {{ POI_EMO[active.poi.type] }}
            </text>
          </g>

          <!-- ⚠️ Destination d'un CONVOI. Le lieu est retiré de la carte au départ — il
               est CONSOMMÉ, comme pour le héros, c'est ce qui fait que convois et héros
               se disputent les mêmes endroits. Mais le héros, lui, garde sa cible
               DESSINÉE : sans son équivalent ici, le tracé d'un convoi menait à du vide
               et le puits semblait avoir été effacé. On le montre donc, marqué comme
               occupé (liseré violet, sans compteur de niveau : il n'est plus à prendre). -->
          <g
            v-for="v in travelersOnMap"
            :key="'vg' + v.id"
            class="poi target van-target"
            :class="v.kind"
          >
            <circle :cx="v.poi.x" :cy="v.poi.y" r="4.8" class="poi-bg" />
            <text :x="v.poi.x" :y="v.poi.y + 1.4" class="poi-emo">{{ POI_EMO[v.poi.type] }}</text>
          </g>

          <!-- Héros -->
          <g v-for="v in travelersOnMap" :key="'vm' + v.id">
            <circle :cx="v.at.x" :cy="v.at.y" r="3" class="van-mark" :class="v.kind" />
            <text :x="v.at.x" :y="v.at.y + 1.1" class="van-emo">{{ v.emo }}</text>
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
        :style="{ left: e.x + 'px', top: e.y + 'px', '--rk': poiRank(e.poi).color }"
        @click="panToPoi(e.poi)"
      >
        <span class="ei-arrow" :style="{ transform: `rotate(${e.deg}deg)` }">➤</span>
        <span class="ei-emo">{{ POI_EMO[e.poi.type] }}</span>
      </button>

      <!-- Zoom -->
      <div class="zoom-ctl">
        <button class="zoom-b" aria-label="Dézoomer" @click="zoom(-1)">−</button>
        <button class="zoom-b" aria-label="Recentrer" @click="centerTown">⌂</button>
        <button class="zoom-b" aria-label="Zoomer" @click="zoom(1)">+</button>
      </div>
    </div>

    <!-- 🧭 LES VOYAGES EN COURS, en UNE rangée de tuiles (demande de l'utilisateur).
         Trois cartes empilées poussaient la carte hors de l'écran dès deux convois, et
         répétaient « total » et « escorte » dont on n'a pas besoin en un coup d'œil :
         il faut QUI voyage, VERS QUOI, et COMBIEN DE TEMPS. Le reste se lit sur la carte
         ou dans le rapport. Disposée en DEUX COLONNES (jusqu'à 12 convois possibles).
         ⚠️ Un convoi RENTRÉ reste dans la rangée, en tuile ACTIONNABLE : sa cargaison ne
         se verse pas toute seule (même règle que les rapports d'expédition). -->
    <div v-if="trips.length" ref="tripsEl" class="trips" role="list">
      <component
        :is="t.claim ? 'button' : 'div'"
        v-for="t in trips"
        :key="t.key"
        role="listitem"
        class="trip"
        :class="[t.kind, { back: t.back, ready: t.claim }]"
        :disabled="t.claim ? busyCaravan : undefined"
        :title="t.title"
        @click="t.claim && doClaimCaravan(t.claim)"
      >
        <span class="tr-who">{{ t.who }}</span>
        <span class="tr-poi">{{ POI_EMO[t.poi.type] }}</span>
        <span class="tr-time">{{ t.time }}</span>
        <i class="tr-bar" :style="{ width: t.pct + '%' }" />
      </component>
    </div>
    <!-- 📜 Les derniers convois encaissés restent consultables : c'est en les mettant côte à
         côte qu'on voit ce qu'un long voyage apprend de plus qu'un court. -->
    <button v-if="pastVans.length" class="past-vans" @click="historyOpen = true">
      📜 Derniers convois <span class="pv-n">{{ pastVans.length }}</span>
    </button>

    <!-- Panneau POI sélectionné -->
    <transition name="sheet">
      <div v-if="selected" ref="sheetEl" class="sheet">
        <!-- 🗂️ LA FICHE DU LIEU (demandé : « toutes ses infos dans une grande tuile propre,
             au-dessus du choix des membres ») : ce qui s'y trouve, ce que ça rapporte, ce que ça
             coûte et ce qu'on risque, EN UN SEUL ENDROIT. En dessous, il ne reste que des
             ACTIONS (envoyer le héros, composer l'équipe). ⚠️ Aucune valeur n'est recalculée
             ici : la grille lit les MÊMES `computed` qu'avant (`poiFacts`). -->
        <div class="poi-card" :style="{ '--rk': selectedRank.color }">
          <div class="pc-head">
            <span class="pc-emo">{{ POI_EMO[selected.type] }}</span>
            <div class="pc-main">
              <!-- 🏅 LE RANG À CÔTÉ DU NOM : la boule de la carte dit déjà la couleur, la fiche
                   dit le rang en toutes lettres, étoiles comprises (`poiRank`). -->
              <div class="pc-title font-display">
                {{ POI_LABEL[selected.type] }}
              </div>
              <div class="pc-tags">
                <span class="pc-lvl">Niveau {{ selected.level }}</span>
                <span
                  class="sh-rank"
                  :title="
                    selectedRift
                      ? 'Rang de la faille — fixé à son apparition, il ne monte pas avec l’âge'
                      : 'Rang du lieu'
                  "
                  >{{ selectedRank.emoji }} {{ selectedRank.name }}
                  {{ rankStarStr(selectedRank.star) }}</span
                >
              </div>
            </div>
            <button class="sh-x" aria-label="Fermer" @click="selected = null">✕</button>
          </div>

          <div class="pc-reward">
            <span class="pc-reward-lab">Récompense</span>
            <span class="pc-reward-val">{{ poiRewardLabel(selected) }}</span>
          </div>

          <div class="pc-grid">
            <div
              v-for="f in poiFacts"
              :key="f.label"
              class="pc-fact"
              :class="f.cls"
              :title="f.title"
            >
              <span class="pc-fact-lab">{{ f.icon }} {{ f.label }}</span>
              <span class="pc-fact-val">{{ f.value }}</span>
            </div>
          </div>

          <!-- 🕳️ DEUX CAUSES, DEUX MESSAGES — « route dangereuse » est tirée au spawn : on la
               subit, on choisit ailleurs. L'embuscade d'une faille (v0.1009) se PRÉVIENT —
               refermer ses failles avant 7 jours — puis s'attend : elle dure deux jours. -->
          <div v-if="selected.riftPeril" class="pc-alert">
            🕳️ Monstres embusqués, sortis d'une faille — embuscades doublées<template
              v-if="selectedAmbushLeft"
            >
              encore {{ formatDuration(selectedAmbushLeft) }}</template
            >
          </div>
          <div v-else-if="selected.perilous" class="pc-alert">
            ⚠️ Route dangereuse — embuscades doublées, butin renforcé
          </div>

          <p v-if="selectedRift" class="pc-note">
            Y entrer est gratuit — ni mana ni énergie : ce qu’on paie, c’est le temps du héros. Les
            monstres abattus rendent du 💠 même si l’incursion échoue ; refermer la faille ajoute la
            prime du gardien. En cas de défaite, tout le groupe part à l’infirmerie. Laissée mûrir,
            elle déborde : une partie de ses monstres s’embusque deux jours autour d’elle, le reste
            marche sur ta base, et il ne reste qu’une petite 💠 mine résiduelle.
          </p>
          <!-- ⚔️ BANDE EN MARCHE : ce qu'on y gagne est une PERTE ÉVITÉE, et on DIT quand ça
               n'en évite plus aucune (renfort figé au tirage de l'armée, `Raid.overflow`). -->
          <template v-if="selectedWarband">
            <p v-if="selectedWarband.utile" class="pc-note">
              ⚔️ La disperser <b>évite le renfort ×1,3</b> du prochain siège — soit 30 à 40 points
              de tenue. Le 💠 n'est qu'un lot de consolation. En cas de défaite, tout le groupe part
              à l'infirmerie.
            </p>
            <p v-else class="pc-note warn">
              ⚠️ <b>Trop tard pour le renfort</b> : leur armée est déjà annoncée à tes portes et
              garde la force que la Tour de guet a montrée. L'intercepter ne rapportera plus que du
              💠.
            </p>
          </template>
        </div>
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
          <button class="sh-send" :disabled="!canSend" @click="send">
            {{ sendLabel }}
          </button>
        </template>
        <!-- 👥 UNE ÉQUIPE — 3 places, le héros en prend 2 (2026-09-21 : les équipes remplacent les
             convois). Elle part sur un camp, une faille, une armée ou un lieu de RÉCOLTE. ⚠️ UN SEUL bloc pour les deux : le choix du groupe,
             la tuile du héros, le risque de départ et le bouton sont identiques — en écrire deux
             garantirait qu’ils divergent. Seuls la rangée de chips et la note changent.
             Les règles vivent dans `camp.ts` / `rift.ts` et `party.ts` ; l’écran les montre,
             et dit POURQUOI quelqu’un ne peut pas venir. -->
        <template v-if="partyTarget">
          <div v-if="offers.hero && !partyTarget" class="car-sep">ou bien — une équipe</div>
          <!-- Le héros : une tuile comme les autres. ⚠️ Il n'y compte que pour
               HERO_PARTY_WORTH champions (v0.980) — l'écran le DIT, sinon on croirait
               emmener la puissance de sa fiche. Grisée avec la raison plutôt que cachée. -->
          <button
            type="button"
            class="party-hero"
            :class="{ on: partyHeroOn, off: !!partyHeroBlock }"
            :disabled="!!partyHeroBlock"
            :aria-pressed="partyHeroOn"
            @click="partyHero = !partyHero"
          >
            <span class="ph-emo">🧝</span>
            <span class="ph-main">
              <span class="ph-name">Ton héros</span>
              <span class="ph-sub">{{
                partyHeroBlock
                  ? PARTY_HERO_BLOCK_LABEL[partyHeroBlock]
                  : `compte pour ${HERO_XP_WEIGHT} dans le partage d’XP${partyHeroToll(selected) ? ` · 🪙 ${partyHeroToll(selected)}` : ''}`
              }}</span>
            </span>
            <span class="ph-check">{{ partyHeroOn ? '✓' : '＋' }}</span>
          </button>
          <button
            v-if="char.advList.length"
            class="car-auto"
            :disabled="!freeStable.length"
            @click="togglePartyAll"
          >
            {{
              partyAllOn
                ? 'Retirer tous les champions'
                : `✨ Tout le vivier disponible (${partyAllIds.length})`
            }}
          </button>
          <!-- 🕳️ ⚠️ ON DIT LA LIMITE AVANT qu'on butte dessus : sans ça, des tuiles qui
               ne répondent plus se lisent comme une panne (leçon du gris de la carte). -->
          <!-- 👥 v0.1035 : plus de plafond de 3 — seulement celui du Panthéon. Ce que le nombre
               coûte, c'est l'XP : on le DIT avant l'envoi, avec le partage en cours. -->
          <p class="car-cap">
            👥 <b>{{ partyAdvs.length }}/{{ partyMax }}</b> champions (Panthéon). Jusqu'à
            {{ XP_TEAM_REF }} membres chacun apprend pleinement ; au-delà l'XP se partage (le héros
            compte pour {{ HERO_XP_WEIGHT }})<template v-if="partyXpSplit < 1">
              : <b>XP ×{{ partyXpSplit.toFixed(2).replace('.', ',') }}</b> chacun</template
            >.
          </p>
          <div v-if="char.advList.length" class="car-pick">
            <AdvPickTile
              v-for="a in freeStable"
              :key="a.id"
              :adv="a"
              :on="partyEscort.includes(a.id)"
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
          <p v-else class="sh-away">
            ⚔️ Aucun aventurier : recrute-les à la Guilde de ta base pour attaquer sans le héros.
          </p>
          <p v-if="selectedCamp" class="sh-note">
            Sans le héros : de l’or (et des pierres chez les morts-vivants) — l’équipe prend un
            créneau de l’Avant-poste. En cas de défaite, les champions tombés partent à l’infirmerie
            ; le héros, lui, rentre sans butin.
          </p>
          <p v-else-if="!teamOnly" class="sh-note">
            Des gardes tiennent le lieu : il faut les abattre pour récolter. Repoussée, l’équipe ne
            ramène rien et les champions tombés partent à l’infirmerie. Sur la route, des bandits
            peuvent tendre une embuscade — plus l’équipe est complète, mieux elle tient. Sans le
            héros, elle prend un créneau de l’Avant-poste.
          </p>
          <p v-else class="sh-note">
            Sans le héros, l’équipe prend un créneau de l’Avant-poste — et une faille ne rend que du
            💠, jamais d’objet.
          </p>
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
          <button class="sh-send car-send" :disabled="!canSendPartyNow" @click="doSendParty">
            {{ partySendLabel }}
          </button>
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
      <q-card class="coll-card" v-if="lastOutcome">
        <div class="coll-emo">
          {{ lastOutcome.waves !== undefined ? '🏟️' : lastOutcome.win ? '🏆' : '💀' }}
        </div>
        <div class="coll-title font-display">
          <template v-if="lastOutcome.waves !== undefined"
            >{{ lastOutcome.waves }} vague{{ lastOutcome.waves > 1 ? 's' : '' }} tenue{{
              lastOutcome.waves > 1 ? 's' : ''
            }}</template
          >
          <template v-else-if="lastOutcome.party">{{
            lastOutcome.win ? 'Camp pris !' : 'Groupe repoussé'
          }}</template>
          <template v-else>{{
            lastOutcome.win ? 'Expédition réussie !' : 'Expédition ratée'
          }}</template>
        </div>
        <div class="coll-text">{{ lastOutcome.text }}</div>
        <div class="coll-haul">
          <span v-for="p in haulPills(lastOutcome)" :key="p.emoji">{{ p.emoji }} +{{ p.n }}</span>
          <span v-for="(it, i) in lastOutcomeItems" :key="i" class="coll-item">
            <ItemIcon :item="it" :size="26" :show-stars="false" />{{ it.name }}</span
          >
        </div>
        <div v-if="lastOutcome.party" class="coll-party">
          <PartyReportView
            :party="lastOutcome.party"
            :roster="char.advList"
            @replay="riftReplay = lastOutcome.party ?? null"
          />
        </div>
        <q-btn
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          :label="lastPending ? '🎁 Récupérer le butin' : 'Super'"
          @click="lastPending ? doClaim() : (collectOpen = false)"
        />
      </q-card>
    </q-dialog>

    <!-- 🕳️ Rejeu d'une incursion : la traversée, la porte, la salle du gardien. -->
    <RiftReplayDialog
      v-model:replay="riftReplay"
      :roster="char.advList"
      :hero-profile="character.profile"
      :hero-equipped="char.row?.equipped ?? {}"
    />

    <!-- ⚠️ LA GUILDE S'OUVRE ICI, au retour d'un convoi dont la mission vient de rendre
         une promotion possible. Le vivier se gère depuis son bâtiment (règle « un
         bâtiment, un endroit ») — mais une promotion qu'on vient de MÉRITER doit se
         proposer là où on l'apprend, sinon elle attend qu'on repasse par la Base. On
         ouvre bien la GUILDE (avec sa feuille de promotion par-dessus), pas un bout
         de Guilde détaché : après avoir promu, on est déjà là où l'on gère son monde. -->

    <!-- 🐫 Rapport à l'encaissement : il remplace la simple notification « Cargaison
         récupérée », qui ne disait ni qui avait voyagé, ni ce qu'il avait appris. -->
    <q-dialog :model-value="!!reportVan" @update:model-value="(v) => !v && (reportId = null)">
      <q-card v-if="reportVan" class="van-card">
        <div class="van-kicker">🐫 Convoi rentré · cargaison récupérée</div>
        <CaravanReportView :van="reportVan" :roster="char.advList" :stars="reportStars" />
        <div class="van-actions">
          <q-btn flat no-caps label="Fermer" @click="reportId = null" />
        </div>
      </q-card>
    </q-dialog>

    <q-dialog v-model="historyOpen">
      <q-card class="van-card">
        <div class="van-kicker">📜 Derniers convois</div>
        <div v-for="v in pastVans" :key="v.id" class="van-past">
          <CaravanReportView :van="v" :roster="char.advList" />
        </div>
        <div class="van-actions">
          <q-btn flat no-caps label="Fermer" @click="historyOpen = false" />
        </div>
      </q-card>
    </q-dialog>

    <div v-if="!active && !pois.length" class="empty">
      La carte se peuple avec le temps — de nouvelles activités apparaissent régulièrement. Reviens
      bientôt.
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { backOr } from '@/lib/nav';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import { useAdvProgressFx } from '@/composables/useAdvProgressFx';
import { useGamePanel } from '@/composables/useGamePanel';
import GameLoader from '@/components/GameLoader.vue';
import ItemIcon from '@/components/ItemIcon.vue';
import { computeCharacter } from '@/lib/character';
import { DUNGEONS } from '@/data/dungeons';
import { playerWithGear, mergeEffects, fxRarity, gradeLabel, RARITY_RANK } from '@/lib/items';
import CaravanReportView from '@/components/CaravanReportView.vue';
import PartyReportView from '@/components/PartyReportView.vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import { campRewardLabel, campWinPct } from '@/lib/camp';
import {
  PARTY_HERO_BLOCK_LABEL,
  PARTY_SEND_BLOCK_LABEL,
  partyCapFor,
  partySendBlocker,
  partyHeroBlocker,
  partyHeroToll,
  partyLegMin,
} from '@/lib/party';
import { expeditionsUnlocked, travelTimeMult } from '@/lib/buildings';
import { talentEffects } from '@/lib/talents';
import { voiePassiveEffects, type VoieId } from '@/lib/voies';
import { simulateCombat, seedOf, type Combatant } from '@/lib/combat';
import RiftPortal from '@/components/RiftPortal.vue';
import { PORTAL_VIEW } from '@/lib/riftPortal';
import {
  POI_EMO,
  POI_LABEL,
  type ExpeditionMessage,
  haulPills,
  EXPE,
  travelPosition,
  voyageProgress,
  poiCombatant,
  simulateArena,
  goldCost,
  poiTravelLevel,
  poiRewardLevel,
  travelOneWayMin,
  expeditionTerrain,
  MAP_VIEW,
  revealRadius,
  type Poi,
  type PoiType,
  HARVEST_TYPES,
  campSpecOf,
  harvestGuardOf,
  isRiftPoi,
  isWarbandPoi,
  isClaimable,
  poiRankCounts,
  type PartyResult,
} from '@/lib/expedition';
import MapTerrain from '@/components/MapTerrain.vue';
import RiftReplayDialog from '@/components/RiftReplayDialog.vue';
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
  advUnavailableReason,
  engageCap,
} from '@/lib/adventurers';
import { characterRank, rankStarStr, CHARACTER_RANKS } from '@/lib/characterRank';
import { formatDuration, formatDurationMin } from '@/lib/duration';
import {
  RIFT,
  incursionWinPct,
  riftClearMana,
  riftOverflowAt,
  riftPopulation,
  riftSpecOf,
  estimateInterception,
  warbandArmy,
} from '@/lib/rift';
import {
  convoySlotsFree,
  claimedCaravans,
  isCaravanClaimable,
  poiOffers,
  partyAllies,
  missionXpSplit,
  XP_TEAM_REF,
  HERO_XP_WEIGHT,
  type PartyHero,
} from '@/lib/caravan';
import { advGearRoles } from '@/lib/advGear';

const props = defineProps<{ embedded?: boolean }>();
const router = useRouter();
const route = useRoute();
const { gameBack } = useGamePanel();
// Retour : dans le volet jeu (cockpit) → revient à l'Aventure du volet ; sinon route.
function back() {
  if (props.embedded) return gameBack();
  backOr(router, '/aventure');
}
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();
const advFx = useAdvProgressFx();

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
    mergeEffects(
      talentEffects(char.row?.talents ?? []),
      voiePassiveEffects(char.row?.voie as VoieId),
    ),
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
const FOG_SOFT = 10; // largeur du fondu du brouillard
const fogInner = computed(() => Math.max(0, (reveal.value - 3) / (reveal.value + FOG_SOFT)));
const hero = computed(() => (active.value ? travelPosition(active.value, now.value) : null));
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
function measure() {
  const el = scrollEl.value;
  if (!el) return;
  contW.value = el.clientWidth;
  contH.value = el.clientHeight;
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
  mapPx.value = Math.max(MIN_PX, Math.min(MAX_PX, mapPx.value + dir * ZOOM_STEP));
  void nextTick(() => centerOn(V.min + cx * V.size, V.min + cy * V.size));
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

// ── 🎚️ Filtre de difficulté par rang (mémorisé par appareil) ──
const RANK_FILTER_KEY = 'muscu:emap:hidden-ranks';
function loadHiddenRanks(): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(RANK_FILTER_KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) return new Set(raw.filter((r): r is number => Number.isInteger(r)));
  } catch {
    /* stockage indisponible : tout est affiché */
  }
  return new Set();
}
const hiddenRanks = ref<Set<number>>(loadHiddenRanks());
const rankOptions = computed(() => poiRankCounts(pois.value));
// La puce n'affiche qu'une boule : son nom et son compte passent par l'étiquette.
const rankChipLabel = (o: { rankIndex: number; count: number }) =>
  `${CHARACTER_RANKS[o.rankIndex]?.name ?? ''} · ${o.count} lieu${o.count > 1 ? 'x' : ''}`;
function toggleRank(r: number) {
  const next = new Set(hiddenRanks.value);
  if (next.has(r)) next.delete(r);
  else {
    // Jamais de carte vide : on ne masque pas le dernier rang encore affiché.
    const visible = rankOptions.value.filter((o) => !next.has(o.rankIndex)).length;
    if (visible <= 1) return;
    next.add(r);
  }
  hiddenRanks.value = next;
  try {
    localStorage.setItem(RANK_FILTER_KEY, JSON.stringify([...next]));
  } catch {
    /* le filtre vaut pour la session */
  }
}
const shownPois = computed(() =>
  pois.value.filter((p) => !hiddenRanks.value.has(characterRank(p.level).rankIndex)),
);
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
/** Créneaux de convoi libres — ⚠️ UN SEUL pool avec les groupes partis SANS le héros
 *  (`convoySlotsFree`, même règle que le store). */
const vansLeft = computed(() =>
  convoySlotsFree(char.comptoirLevel, [...char.caravanList, ...char.partyList], now.value),
);
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
/** Les lieux qui ne se prennent QU'EN équipe (camp, faille, armée). */
const teamOnly = computed(
  () => !!selectedCamp.value || !!selectedRift.value || !!selectedWarband.value,
);
/** 👥 Une équipe peut partir ici : les lieux « d'équipe » ET les lieux de récolte. */
const partyTarget = computed(
  () => teamOnly.value || (!!selected.value && HARVEST_TYPES.has(selected.value.type)),
);
const partyHero = ref(false);
const partyEscort = ref<string[]>([]);
watch(selected, () => {
  partyHero.value = false;
  partyEscort.value = [];
});
/** Les aventuriers retenus ET toujours disponibles (un aventurier parti en convoi entre-temps
 *  sort du groupe de lui-même — le store le refuserait de toute façon). */
const partyAdvs = computed(() => freeStable.value.filter((a) => partyEscort.value.includes(a.id)));
/** Ceux qui ne peuvent PAS partir, avec la raison — même règle que le store
 *  (`advUnavailableReason`, dont `advAvailable` dérive). On les montre grisés plutôt que de
 *  les cacher : un aventurier qui disparaît de la liste se lit comme un aventurier perdu. */
/** ⚠️ Même principe que `freeKey` : une CHAÎNE (id + raison) calculée au tick, mais qui ne
 *  réveille la liste — donc le rendu des tuiles grisées — que si un aventurier change d'état.
 *  ⚠️ ET LA MÊME HORLOGE QUE `freeKey`, OBLIGATOIREMENT (`now`, pas `coarseNow`) : les deux
 *  listes PARTITIONNENT le vivier (`advAvailable` ⟺ `advUnavailableReason === null`) et sont
 *  rendues côte à côte dans `.car-pick`, keyées sur le même id. Sur deux horloges décalées, un
 *  aventurier dont l'échéance tombe en milieu de minute apparaîtrait DANS LES DEUX pendant
 *  jusqu'à une minute (tuile en double + clés dupliquées). Le coût du tick est ici une
 *  concaténation sur le vivier : c'est la chaîne, pas l'horloge, qui protège les dépendants. */
const blockedKey = computed(() =>
  char.advList.map((a) => `${a.id}:${advUnavailableReason(a, now.value) ?? ''}`).join('|'),
);
/** Champions indisponibles : masqués par défaut dans le choix d'une équipe (demandé). */
const showBlocked = ref(false);
const partyBlocked = computed(() => {
  const why = new Map(
    blockedKey.value.split('|').map((kv) => {
      const cut = kv.lastIndexOf(':');
      return [kv.slice(0, cut), kv.slice(cut + 1)] as const;
    }),
  );
  return char.advList.flatMap((a) => {
    const w = why.get(a.id);
    return w ? [{ adv: a, why: w as NonNullable<ReturnType<typeof advUnavailableReason>> }] : [];
  });
});
/** Pourquoi le héros ne peut pas se joindre au groupe — la MÊME règle que le store. */
const partyHeroBlock = computed(() =>
  selected.value
    ? partyHeroBlocker({
        onExpedition: !!active.value,
        healMs: heroHealIn.value,
        outpost: outpostBuilt.value,
        gold: char.row?.gold ?? 0,
        cost: partyHeroToll(selected.value),
      })
    : null,
);
/** Le héros est-il VRAIMENT du groupe ? Le choix du joueur, tant que rien ne l'en empêche :
 *  un héros qu'on a coché puis qui part ailleurs ne doit pas fausser le pronostic. */
const partyHeroOn = computed(() => partyHero.value && !partyHeroBlock.value);
const heroForParty = computed<PartyHero | null>(() =>
  partyHeroOn.value
    ? { name: char.row?.pseudo ?? 'Toi', level: heroLevel.value, combatant: fighter.value }
    : null,
);
const partySize = computed(() => partyAdvs.value.length + (partyHeroOn.value ? 1 : 0));
/** 🎯 % de victoire — le MÊME groupe (`partyAllies`) et le MÊME parcours que la résolution,
 *  échantillonnés sur des graines qui ne rejouent JAMAIS le vrai combat (parité, v0.767).
 *  Sur une faille, c’est la FERMETURE qu’on pronostique (gardien compris) : c’est la seule
 *  issue qui la referme.
 *  ⚠️ HORLOGE GROSSIÈRE pour la faille (`coarseNow`) : son effectif dépend de l’instant, et
 *  une incursion enchaîne jusqu’à 13 combats — à 40 échantillons par seconde, ce serait ~520
 *  combats rejoués à chaque tick pour un effectif qui bouge sur SEPT JOURS. */
const partyWin = computed(() => {
  const p = selected.value;
  if (!p || !partySize.value) return null;
  const allies = partyAllies(partyAdvs.value, roadCtx.value, heroForParty.value);
  if (selectedRift.value) return Math.round(incursionWinPct(p, allies, coarseNow.value, 40) * 100);
  // ⚔️ L'interception : le MÊME combat que la résolution, rejoué sur des graines dérivées
  // (disjointes par parité de celles du vrai choc). Jamais une seconde formule.
  if (selectedWarband.value)
    return Math.round(
      estimateInterception(p, partyAdvs.value, roadCtx.value, heroForParty.value, 40) * 100,
    );
  // 🛡️ Un lieu de récolte gardé : le MÊME combat que les camps (`fightCampForce`).
  const spec = selectedCamp.value ?? selectedGuard.value;
  if (!spec) return null;
  return Math.round(campWinPct(p, spec, allies, 40) * 100);
});
/** Aller-retour : le groupe va au pas de son marcheur le plus lent (`partyLegMin`). */
const partyMin = computed(() =>
  selected.value && partySize.value
    ? 2 *
      partyLegMin(selected.value, partyAdvs.value, {
        hero: partyHeroOn.value,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(partyAdvs.value, roadCtx.value.advGear).speed,
      })
    : 0,
);
/** ⚠️ CE QUE LE DÉPART COÛTE face à l'armée qui arrive — mêmes règles que le convoi et le
 *  héros (`departureRisk`) : le groupe quitte la base (et le héros avec lui s'il en est),
 *  et un groupe rentré AVANT l'assaut ne coûte rien. */
const partyRisk = computed(() => {
  const b = base.value;
  const inc = incoming.value;
  if (!b || !inc || !partyTarget.value || !partySize.value) return null;
  const heroNow = heroDefendsNow.value;
  const partants = new Set(partyAdvs.value.map((a) => a.id));
  const restants = freeStable.value.filter((a) => !partants.has(a.id));
  return departureRisk(
    b.defenses,
    heroLevel.value,
    inc,
    {
      hero: heroNow,
      guard: guardUnits(heroLevel.value, freeStable.value, cap.value, compCtx.value),
    },
    {
      hero: partyHeroOn.value ? null : heroNow,
      guard: guardUnits(heroLevel.value, restants, cap.value, compCtx.value),
    },
    { backAt: coarseNow.value + partyMin.value * 60_000, raidAt: raidAt.value },
  );
});
/** Pourquoi le groupe ne peut pas partir — la MÊME règle que le store (`partySendBlocker`) :
 *  sans le héros, un groupe prend un créneau de convoi. */
const partySendBlock = computed(() =>
  selected.value
    ? partySendBlocker(
        selected.value,
        partyAdvs.value.length,
        partyHeroOn.value,
        vansLeft.value,
        cap.value,
      )
    : null,
);
/** Sans le héros et plus aucun créneau : on le DIT avant même qu'on choisisse quelqu'un. */
const partySlotsFull = computed(() => !partyHeroOn.value && vansLeft.value <= 0);
const canSendPartyNow = computed(
  () =>
    !!selected.value &&
    !partySendBlock.value &&
    // ⚠️ TOUJOURS attendre la progression : avant son chargement le niveau vaut 1, et le
    // tirage des pièces d'aventurier (figé au départ) serait plafonné au plus bas rang.
    progress.ready.value &&
    !busyCaravan.value,
);
/** 🗿 Combien de champions on peut engager — `partyCapFor` (le Panthéon), jamais une copie
 *  de la règle : l'écran doit empêcher exactement ce que le store refuse. */
const partyMax = computed(() => partyCapFor(cap.value));
/** 👥 Le partage d'XP de l'équipe cochée — `missionXpSplit`, la règle du moteur. */
const partyXpSplit = computed(() => missionXpSplit(partyAdvs.value.length, partyHeroOn.value));
/** Vrai quand on ne peut plus en cocher — pour le dire AVANT qu'on essaie. */
const partyFull = computed(() => partyAdvs.value.length >= partyMax.value);
/** Si le plafond baisse (Panthéon), on retire les derniers cochés plutôt que de laisser un
 *  envoi impossible à l'écran. */
watch(partyMax, (max) => {
  if (partyEscort.value.length > max) partyEscort.value = partyEscort.value.slice(0, max);
});

function togglePartyAdv(id: string) {
  if (partyEscort.value.includes(id)) {
    partyEscort.value = partyEscort.value.filter((x) => x !== id);
    return;
  }
  // ⚠️ On REFUSE d'en ajouter un de trop plutôt que de laisser l'envoi échouer : un bouton
  // qui se grise après coup ne dit pas lequel est en trop.
  if (partyFull.value) return;
  partyEscort.value = [...partyEscort.value, id];
}
/** ✨ Tout le vivier disponible d'un geste (et de nouveau pour tout retirer) : un repaire
 *  de taille 10 demande dix aventuriers, dix toucher de suite serait une corvée. */
/** Ce que « tout le vivier » peut réellement prendre ici. */
const partyAllIds = computed(() => freeStable.value.slice(0, partyMax.value).map((a) => a.id));
const partyAllOn = computed(
  () => partyAllIds.value.length > 0 && partyAdvs.value.length === partyAllIds.value.length,
);
function togglePartyAll() {
  // ⚠️ Bornée par le lieu : sur une faille, « tout le vivier » ne peut pas en envoyer dix.
  partyEscort.value = partyAllOn.value ? [] : [...partyAllIds.value];
}
/** Le bouton dit OÙ l’on va : un camp se prend, une faille se referme. */
const partySendLabel = computed(() => {
  if (!partySize.value) return 'Choisis ton groupe';
  if (!teamOnly.value) return `🧺 Envoyer l’équipe (${partySize.value})`;
  return selectedRift.value
    ? `🌀 Entrer dans la faille (${partySize.value})`
    : `⚔️ Attaquer le camp (${partySize.value})`;
});
async function doSendParty() {
  const uid = auth.user?.id;
  const poi = selected.value;
  if (!uid || !poi || !canSendPartyNow.value) return;
  // ⚠️ Retenu AVANT l’envoi : `selected` est remis à null au succès, donc le lire après
  // coup pour choisir le message dirait toujours « camp ».
  const isRift = !!selectedRift.value;
  const isHarvest = !teamOnly.value;
  busyCaravan.value = true;
  try {
    const refused = await char.sendParty(uid, poi, {
      hero: heroForParty.value,
      escortIds: partyAdvs.value.map((a) => a.id),
      // AVEC le héros : le niveau que `expeSend` passait (progression en donjon) — son butin
      // ne change pas. SANS lui : le niveau de SPORT, comme les convois (pièces d'aventurier).
      playerLevel: partyHeroOn.value ? progressionLevel.value : heroLevel.value,
      now: Date.now(),
    });
    if (!refused) selected.value = null;
    // ⚠️ La RAISON du refus vient du store : un message générique laissait deviner qui bloquait.
    $q.notify(
      refused
        ? { type: 'negative', message: `Départ impossible : ${refused}.` }
        : {
            type: 'positive',
            message: isHarvest
              ? '🧺 L’équipe part en récolte.'
              : isRift
                ? '🌀 L’équipe s’enfonce dans la faille.'
                : '⚔️ L’équipe marche sur le camp.',
          },
    );
  } finally {
    busyCaravan.value = false;
  }
}

/** Les convois EN ROUTE, situés par la même interpolation que le héros
 *  (`travelPosition`) : un convoi part, atteint son lieu, et revient — on doit le voir
 *  faire, sinon la seule trace d'une caravane est une carte « 🎁 Récupérer ». */
const vansOnMap = computed(() =>
  char.caravanList
    .filter((c) => now.value < c.returnAt)
    .map((c) => ({
      id: c.id,
      poi: c.poi,
      escort: c.escort.length,
      at: travelPosition(c, now.value),
      prog: voyageProgress(c, now.value),
    })),
);
/** ⚔️ Les GROUPES partis sans le héros, situés comme les convois. ⚠️ Un groupe AVEC le
 *  héros vit dans `expedition` : c'est le tracé du héros qui le montre. */
const partiesOnMap = computed(() =>
  char.partyList
    .filter((g) => now.value < g.returnAt)
    .map((g) => ({
      id: g.id,
      poi: g.poi,
      escort: g.outcome.party?.escort.length ?? 0,
      at: travelPosition(g, now.value),
      prog: voyageProgress(g, now.value),
    })),
);
/** Tout ce qui voyage sans le héros, pour la carte : même tracé, l'emoji dit qui. */
const travelersOnMap = computed(() => [
  ...vansOnMap.value.map((v) => ({ ...v, emo: '🐫', kind: 'caravan' as const })),
  ...partiesOnMap.value.map((g) => ({ ...g, emo: '⚔️', kind: 'party' as const })),
]);
const busyCaravan = ref(false);
/** Tout ce qui voyage, dans l'ordre où ça rentre : le héros puis les convois, les
 *  cargaisons à récupérer en TÊTE (c'est la seule ligne sur laquelle on peut agir).
 *  ⚠️ Une seule liste pour les trois états — en route, rentré, à encaisser — sinon la
 *  rangée se lirait comme trois rangées collées. */
const trips = computed(() => {
  const out: {
    key: string;
    kind: 'hero' | 'van';
    who: string;
    poi: Poi;
    time: string;
    pct: number;
    back: boolean;
    claim?: string;
    title: string;
  }[] = [];
  const a = active.value;
  const h = hero.value;
  if (a && h) {
    const back = h.phase === 'return';
    out.push({
      key: 'hero',
      kind: 'hero',
      who: '🧝',
      poi: a.poi,
      time:
        h.phase === 'done'
          ? 'rentré'
          : formatDuration(back ? h.remainTotalMs : h.remainToObjectiveMs),
      pct: heroProg.value.overall * 100,
      back,
      title: `Ton héros — ${POI_LABEL[a.poi.type]} niv ${a.poi.level}${a.outcome.party?.escort.length ? ` · avec ${a.outcome.party.escort.length} champion(s)` : ''}`,
    });
  }
  for (const v of vansOnMap.value) {
    const back = v.at.phase === 'return';
    out.push({
      key: 'v' + v.id,
      kind: 'van',
      who: '🐫',
      poi: v.poi,
      time: formatDuration(back ? v.at.remainTotalMs : v.at.remainToObjectiveMs),
      pct: v.prog.overall * 100,
      back,
      title: `Convoi — ${POI_LABEL[v.poi.type]} niv ${v.poi.level} · escorte ${v.escort}`,
    });
  }
  for (const g of partiesOnMap.value) {
    const back = g.at.phase === 'return';
    out.push({
      key: 'g' + g.id,
      kind: 'van',
      who: '⚔️',
      poi: g.poi,
      time: formatDuration(back ? g.at.remainTotalMs : g.at.remainToObjectiveMs),
      pct: g.prog.overall * 100,
      back,
      title: `Groupe — ${POI_LABEL[g.poi.type]} niv ${g.poi.level} · ${g.escort} champion${g.escort > 1 ? 's' : ''}`,
    });
  }
  for (const c of claimable.value) {
    out.push({
      key: 'c' + c.id,
      kind: 'van',
      who: '🐫',
      poi: c.poi,
      time: '🎁',
      pct: 100,
      back: true,
      claim: c.id,
      title: `Convoi rentré de ${POI_LABEL[c.poi.type]} — récupérer la cargaison`,
    });
  }
  // Les cargaisons prêtes d'abord : c'est la seule tuile sur laquelle il y a à faire.
  return out.sort((x, y) => Number(!!y.claim) - Number(!!x.claim));
});
const claimable = computed(() => char.caravanList.filter((c) => isCaravanClaimable(c, now.value)));
/** Aventurier dont la feuille de promotion doit s’ouvrir, et celui qui ATTEND que les
 *  éclats aient fini de jouer. ⚠️ L’overlay de célébration est au-dessus des modales :
 *  ouvrir la feuille tout de suite la cacherait derrière l’animation. */
/** ⚠️ LA CARTE OCCUPE 62vh : la rangée des voyages vit SOUS elle, donc sur un téléphone
 *  une cargaison prête naît HORS ÉCRAN. Taper « 🐫 Un convoi est rentré » déposait bien
 *  sur la carte — mais pas devant ce qu’on venait y faire, et rien ne disait où c’était.
 *  Même remède que la feuille d’un lieu (v0.738) : on la RÉVÈLE.
 *
 *  ⚠️ On n’encaisse PAS à sa place — « la cargaison ne se verse pas toute seule » (règle
 *  des rapports d’expédition, v0.680). On amène devant le bouton, on ne l’appuie pas.
 *  ⚠️ Le paramètre est RETIRÉ après coup, sinon un retour arrière rejoue le saut
 *  (même patron que le `?tab=` de l’Aventure, v0.748).
 *  ⚠️ `immediate` : en cockpit l’écran peut être DÉJÀ monté quand la query change. */
const tripsEl = ref<HTMLElement | null>(null);
watch(
  () => [route.query.claim, claimable.value.length] as const,
  async ([flag, n]) => {
    if (!flag || !n) return;
    await nextTick();
    tripsEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rest = { ...route.query };
    delete rest.claim;
    void router.replace({ path: route.path, query: rest });
  },
  { immediate: true },
);

/** Rapport ouvert après un encaissement (id du convoi) et les aventuriers qui y ont gagné
 *  une étoile. Le convoi reste dans la liste, marqué encaissé : on le relit là. */
const reportId = ref<string | null>(null);
const reportStars = ref<string[]>([]);
const reportVan = computed(() => char.caravanList.find((c) => c.id === reportId.value) ?? null);
const historyOpen = ref(false);
const pastVans = computed(() => claimedCaravans(char.caravanList));

async function doClaimCaravan(id: string) {
  const uid = auth.user?.id;
  if (!uid || busyCaravan.value) return;
  busyCaravan.value = true;
  try {
    // ⚠️ Une liste VIDE vaut « encaissé » (elle est truthy) ; c'est `null` qui dit l'échec.
    const events = await char.claimCaravan(uid, id);
    if (!events) return;
    reportStars.value = events.filter((e) => e.to > e.from).map((e) => e.id);
    reportId.value = id;
    // ⚠️ LE NIVEAU D'UN AVENTURIER EST CACHÉ : sans cette annonce, une étoile gagnée en
    // convoi ne se verrait qu'en rouvrant la Guilde pour y lire une barre. C'est le seul
    // retour qu'il ait sur des semaines de voyages.
    advFx.announce(events);
  } finally {
    busyCaravan.value = false;
  }
}
const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionMessage | null>(null);
/** 🕳️ Rapport d'incursion à rejouer (cf. `RiftReplayDialog`). */
const riftReplay = ref<PartyResult | null>(null);
// ▶️ Il se lance aussi tout seul : à l'arrivée sur la faille, ou à la prochaine ouverture.
useRiftAutoReplay(riftReplay);
// Objets ramenés (l'arène en rend PLUSIEURS via `items`, les autres un seul via `item`).
const lastOutcomeItems = computed(() => {
  const o = lastOutcome.value;
  if (!o) return [];
  return o.items && o.items.length ? o.items : o.item ? [o.item] : [];
});
/** Le rapport ouvert attend-il d'être encaissé ? (sinon la modale n'est qu'un compte rendu) */
const lastPending = computed(() => !!lastOutcome.value && lastOutcome.value.claimed === false);
/** Le rapport du héros À ENCAISSER, s'il y en a un — UNE définition de « prêt » (`isClaimable`),
 *  suivie par l'horloge. Elle ouvre la modale dans les deux cas qui comptent : le héros
 *  rentre pendant qu'on regarde la carte, ou on arrive par la notification « ton héros
 *  est rentré » — l'action promise ne doit pas se chercher dans la boîte 📬. */
const dueReport = computed(() => (char.row?.messages ?? []).find((m) => isClaimable(m, now.value)));
watch(
  dueReport,
  (m) => {
    if (!m || collectOpen.value) return;
    lastOutcome.value = m;
    collectOpen.value = true;
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
    advsAvailable: freeAdvs.value.length,
    slotsFree: vansLeft.value,
  });
  // 👥 Un lieu reste ouvert tant que le HÉROS SEUL ou une ÉQUIPE peut y aller (2026-09-21 :
  // les équipes remplacent les convois). Même règle que le test « ce qui est GRISÉ ».
  return !o.hero && !o.party;
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
  if (!p || HARVEST_TYPES.has(p.type) || p.type === 'arena') return 100; // récolte : pas de combat
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
interface PoiFact {
  icon: string;
  label: string;
  value: string;
  cls?: string;
  title?: string;
}
const poiFacts = computed<PoiFact[]>(() => {
  const p = selected.value;
  if (!p) return [];
  const out: PoiFact[] = [];
  const rift = selectedRift.value;
  const band = selectedWarband.value;
  const camp = selectedCamp.value;
  const guard = selectedGuard.value;
  // Ce qu'on affronte.
  const faction = rift?.faction ?? band?.faction ?? camp?.faction ?? guard?.faction;
  if (faction)
    out.push({ icon: FACTION_EMOJI[faction], label: 'Faction', value: FACTION_LABEL[faction] });
  if (camp)
    out.push({
      icon: '💪',
      label: 'Force',
      value: `≈ ${camp.size} champion${camp.size > 1 ? 's' : ''}`,
      title: 'La force du camp, comptée en champions de référence',
    });
  // 🛡️ Les gardes d'un lieu de récolte (v0.1043) : il faut les abattre pour récolter.
  if (guard)
    out.push({
      icon: '🛡️',
      label: 'Gardes',
      value: `≈ ${String(+guard.size.toFixed(1)).replace('.', ',')} champion${guard.size > 1 ? 's' : ''}`,
      title: 'Les gardes du lieu, comptés en champions de référence',
    });
  if (rift) {
    out.push({
      icon: '👾',
      label: 'Effectif',
      value: `${rift.foes} / ${rift.maxFoes}`,
      title: "L'effectif grossit avec l'âge de la faille, jusqu'au débordement",
    });
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
      icon: '👾',
      label: 'Effectif',
      value: String(band.size),
      title: 'Ce qu’elle aligne — et ce que ta base affrontera',
    });
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
      label: 'Trajet héros',
      value: formatDurationMin(roundTripMin(p)),
    });
    out.push({ icon: '🪙', label: 'Coût héros', value: String(costOf(p)) });
    if (p.type === 'arena')
      out.push({ icon: '🌊', label: 'Vagues tenues', value: `~${arenaWaves.value}` });
    else if (!HARVEST_TYPES.has(p.type))
      out.push({
        icon: '🎯',
        label: 'Réussite héros',
        value: `${winPct.value} %`,
        cls: winClass(winPct.value),
      });
  }
  // L'équipe.
  if (partyTarget.value) {
    out.push({
      icon: '⏱️',
      label: 'Trajet équipe',
      value: partySize.value ? formatDurationMin(partyMin.value) : 'compose ton équipe',
      cls: partySize.value ? undefined : 'dim',
    });
    out.push({ icon: '⚡', label: 'Énergie', value: '0 — gratuit' });
    if (teamOnly.value || guard)
      out.push(
        partyWin.value === null
          ? {
              icon: '🎯',
              label: rift ? 'Fermeture équipe' : 'Réussite équipe',
              value: 'compose ton équipe',
              cls: 'dim',
            }
          : {
              icon: '🎯',
              label: rift ? 'Fermeture équipe' : 'Réussite équipe',
              value: `${partyWin.value} %`,
              cls: winClass(partyWin.value),
            },
      );
  }
  return out;
});
function winClass(pct: number): string {
  return pct >= 70 ? 'wp-good' : pct >= 35 ? 'wp-mid' : 'wp-bad';
}
/** 🏅 Le rang d'un lieu : celui de son niveau, sur l'échelle de tout le jeu (`characterRank`). */
/** Le portail d'une faille sur la carte, en unités de carte : un peu plus haut que la
 *  pastille d'un lieu (⌀ 9), les flammes comprises. `dy` = du haut du dessin au centre. */
const RIFT_ICON = {
  h: 14,
  w: (14 * PORTAL_VIEW.w) / PORTAL_VIEW.h,
  dy: (14 * PORTAL_VIEW.cy) / PORTAL_VIEW.h,
};

function poiRank(p: Poi) {
  return characterRank(p.level);
}

const costOf = (p: Poi) => goldCost(p.type, poiRewardLevel(p));
// Avant-poste : débloque les expéditions + réduit les trajets.
const outpostBuilt = computed(() => expeditionsUnlocked(char.row?.buildings ?? []));
const travelMult = computed(() => travelTimeMult(char.row?.buildings ?? []));
const roundTripMin = (p: Poi) =>
  Math.round(travelOneWayMin(poiTravelLevel(p), p.distNorm) * 2 * travelMult.value);
// Ce que le POI rapporte VRAIMENT (crédité par expeCollect) : or, énergie (mines),
// objets, clés. La poussière n'existe plus (refonte drops-only) → on ne l'annonce plus.
/** Ce qu’un lieu rapporte, annoncé sur la carte AVANT l’envoi.
 *  ⚠️ `Record<PoiType, …>` et non une chaîne de `if` avec un cas par défaut : c’est ce
 *  défaut-là qui a fait annoncer « pièce de set + pierres » pour une ÉPAVE (v0.680), puis
 *  pour une FAILLE et une MINE DE MANA. Ajouter un POI sans dire ce qu’il donne casse
 *  désormais la compilation, au lieu de mentir en silence. */
const POI_REWARD: Record<PoiType, (p: Poi) => string> = {
  mine: () => 'Or 🪙 + énergie ⚡ (récolte)',
  well: () => 'Énergie ⚡ en quantité (récolte, sans combat)',
  shrine: () => "Pierres d'invocation 🔮 (récolte, sans combat)",
  archive: () => 'Clés du Labyrinthe 🗝️ (récolte, sans combat)',
  wreck: () => 'Épave (ancienne) — plus rien à démonter',
  // 💠 Ce qu’une faille laisse en s’effondrant — une récolte, bien moins que la refermer.
  mana_mine: () => 'Mana 💠 résiduel (récolte, sans combat)',
  // ⚔️ Camp / repaire : ce que rapporte le groupe AVEC ou SANS le héros, selon la faction
  // (règle écrite à côté de `campGroupHaul`, testée contre lui). Jamais de ferraille.
  camp: (p) => campRewardLabel(p),
  lair: (p) => campRewardLabel(p),
  arena: () => 'Survie par vagues 🌊 — objets + pierres 🔮 ∝ vagues',
  // 🕳️ La faille ne paie QUE du mana — jamais d’objet, jamais une autre devise.
  rift: () => 'Mana 💠 à chaque monstre abattu — prime du gardien si tu la refermes',
  // ⚔️ L'interception n'enrichit pas : elle ÉVITE une perte. Le dire franchement, sinon on
  // la lit comme une activité de farm et on est déçu du butin.
  warband: () => 'Mana 💠 des monstres abattus — et le prochain siège NE sera pas renforcé',
};
function poiRewardLabel(p: Poi): string {
  return POI_REWARD[p.type](p);
}

const canSend = computed(
  () =>
    !!selected.value &&
    !heroUnavailable.value &&
    !!char.row &&
    progress.ready.value &&
    outpostBuilt.value &&
    (char.row?.gold ?? 0) >= costOf(selected.value),
);
const sendLabel = computed(() => {
  if (!selected.value) return 'Envoyer';
  if (!outpostBuilt.value) return '🧭 Construis un Avant-poste d’abord';
  if ((char.row?.gold ?? 0) < costOf(selected.value)) return 'Pas assez d’or';
  return `Envoyer le héros (🪙 ${costOf(selected.value)})`;
});

async function send() {
  const uid = auth.user?.id;
  const p = selected.value;
  if (!uid || !p || !canSend.value) return;
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
    const msg = await char.expeTick(uid, Date.now());
    if (msg)
      $q.notify({
        type: msg.win ? 'positive' : 'warning',
        message: `📬 ${msg.win ? 'Rapport : victoire' : 'Rapport : échec'} — le héros rentre.`,
      });
    // Le héros rentre : il redevient disponible, mais son chargement reste à ENCAISSER
    // (c'est `dueReport` qui ouvre la modale, pas ce tick).
    await char.expeSettle(uid, Date.now());
    // ⚔️ Les groupes partis sans le héros : rapport à l'arrivée, retour au bout du chemin.
    // Le butin attend dans la boîte (c'est `dueReport` qui ouvre la modale au retour).
    const partyMsgs = await char.partyTick(uid, Date.now());
    if (partyMsgs.length)
      $q.notify({
        type: partyMsgs.some((m) => m.win) ? 'positive' : 'warning',
        // ⚠️ App fermée pendant le voyage : dépôt et retour dans le même tick. UNE définition
        // de « prêt » (`isClaimable`, déjà lue par `dueReport`) : la moitié DATE de la règle
        // était recopiée ici.
        message: partyMsgs.every((m) => isClaimable(m, Date.now()))
          ? '📬 Ton groupe est rentré — son butin t’attend.'
          : '📬 Rapport de ton groupe — il rentre en ville.',
      });
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
  advFx.announce(done.advProgress);
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
  mapPx.value = Math.max(
    MIN_PX,
    Math.min(MAX_PX, Math.round((contW.value * V.size) / (2 * (reveal.value + 6))) + ZOOM_STEP),
  );
  await nextTick();
  centerTown();
  window.addEventListener('resize', measure);
  timer = setInterval(() => {
    now.value = Date.now();
    void lifecycle();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener('resize', measure);
});

// ── Formatage durées ──
</script>

<style scoped lang="scss">
/* ── 🗂️ LA FICHE DU LIEU — une grande tuile, teintée par le RANG du lieu (`--rk`) ── */
/* Contour appuyé (2 px, couleur du rang à 75 %) et marges latérales : collée au bord de
   l'écran et cerclée d'un trait pâle, la tuile se lisait mal comme un bloc (demandé). */
.poi-card {
  margin: 6px 10px 12px;
  padding: 14px;
  border-radius: 16px;
  border: 2px solid color-mix(in srgb, var(--rk) 75%, var(--line));
  background:
    radial-gradient(
      120% 90% at 0% 0%,
      color-mix(in srgb, var(--rk) 16%, transparent),
      transparent 60%
    ),
    var(--surface);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pc-emo {
  flex: none;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  font-size: 32px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--rk) 22%, var(--bg));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--rk) 60%, transparent);
}
.pc-main {
  flex: 1;
  min-width: 0;
}
.pc-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.15;
}
.pc-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 4px;
}
.pc-lvl {
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
  white-space: nowrap;
}
/* 🏅 Le rang du lieu : la pastille prend la COULEUR DU RANG, posée en ligne (`--rk`) — une
   classe par rang n'aurait aucun sens ici, le rang est calculé. */
.sh-rank {
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--rk);
  color: var(--rk);
  background: color-mix(in srgb, var(--rk) 14%, transparent);
  white-space: nowrap;
}
/* La récompense : c'est la question qu'on se pose en premier, elle a sa propre ligne. */
.pc-reward {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  border-left: 3px solid var(--accent);
}
.pc-reward-lab,
.pc-fact-lab {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
}
.pc-reward-val {
  font-size: 14px;
  font-weight: 700;
}
/* ⚠️ `minmax(0, 1fr)` : sans le minimum à zéro, une piste refuse de passer sous la taille
   de son contenu et la grille déborde à 344 px. */
.pc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
}
.pc-fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.pc-fact-val {
  font-family: 'Oswald', sans-serif;
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.pc-fact.dim .pc-fact-val {
  font-family: inherit;
  font-size: 12.5px;
  color: var(--dim);
}
.pc-fact.warn .pc-fact-val {
  color: var(--d3);
}
.pc-fact.wp-good .pc-fact-val {
  color: #7bc86c;
}
.pc-fact.wp-mid .pc-fact-val {
  color: #ffb23f;
}
.pc-fact.wp-bad .pc-fact-val {
  color: #ff6a45;
}
.pc-alert {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--d3);
  background: color-mix(in srgb, var(--d3) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--d3) 50%, transparent);
}
.pc-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--dim);
}
.pc-note.warn {
  color: var(--d3);
}
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
.car-cap {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--dim);
}
.car-cap b {
  color: var(--text);
}
.car-auto {
  width: 100%;
  min-height: 44px;
  margin-bottom: 8px;
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
.bar {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
}
.rank-filter {
  display: flex;
  gap: 6px;
  padding: 0 12px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rank-filter::-webkit-scrollbar {
  display: none;
}
/* Une boule de la couleur du rang par puce — cible tactile de 44 px, boule de 22. Affiché =
   boule PLEINE, masqué = simple anneau estompé : l'état se lit sans dépendre de la couleur. */
.rf-chip {
  flex: none;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
.rf-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--rk);
  background: transparent;
  opacity: 0.45;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.rf-chip.on .rf-dot {
  background: var(--rk);
  opacity: 1;
  box-shadow: 0 0 0 2px var(--surface);
}
.rf-chip:focus-visible .rf-dot {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
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
.bar-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}
.bar-chip.live {
  border-color: var(--accent);
  color: var(--accent);
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
/* Décor de carte */
/* Terrain : le sol vit dans MapTerrain.vue (mer, côte, prairie, reliefs). Ici ne
   restent que le cadre, la boussole et la ville. */
.fog {
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
.van-target .poi-bg {
  stroke: #b57bff;
  stroke-width: 0.8;
}
/* Groupes ⚔️ : même violet qu'un convoi, mais un motif TIRET-POINT sur la route et un liseré
   pointillé sur la cible et le marqueur — lisible sans la couleur ni l'emoji. */
.trail.van.party {
  stroke-width: 1.2;
  stroke-dasharray: 4 1.4 0.8 1.4;
}
.van-target.party .poi-bg,
.van-mark.party {
  stroke-width: 1;
  stroke-dasharray: 1.2 0.9;
}
.van-target {
  opacity: 0.75;
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
.poi {
  cursor: pointer;
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
/* Contour dans la couleur du RANG du lieu (`--rk`, posé par lieu). */
.poi-bg {
  fill: var(--surface);
  stroke: var(--rk, var(--line));
  stroke-width: 1;
}
/* La cible de clic d'une faille : invisible, sauf sélectionnée (le liseré d'accent de
   tous les lieux, autour de l'ovale). */
.rift-hit {
  fill: transparent;
  stroke: none;
}
.poi.sel .rift-hit {
  stroke: var(--accent);
  stroke-width: 0.8;
  stroke-dasharray: 1.4 0.9;
}
.poi.sel .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.5;
}
.poi.dim {
  opacity: 0.4;
}
.poi.target .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.4;
}
.poi-emo {
  font-size: 4px;
  text-anchor: middle;
}
.poi-rank {
  font-size: 3.2px;
  text-anchor: middle;
}
.poi-star {
  font-size: 2.6px;
  font-weight: 800;
  fill: var(--rk, var(--text));
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 0.5px;
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
.past-vans {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 2px 8px auto;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: 600 12.5px var(--font-ui);
  cursor: pointer;
}
.pv-n {
  color: var(--dim);
}
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
.van-past + .van-past {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.van-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.trips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 2px 2px 6px;
}
/* Une tuile ORPHELINE (compte impair) prend les deux colonnes et se centre : laissée
   dans sa colonne, elle se collait à gauche avec un trou à droite, ce qui se lit comme
   un élément manquant plutôt que comme le dernier de la liste. */
.trip:last-child:nth-child(odd) {
  grid-column: 1 / -1;
  justify-self: center;
}
.trip {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px; /* cible tactile : la tuile « rentré » est un bouton */
  padding: 7px 11px 9px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  overflow: hidden;
}
.trip.van {
  border-color: #b57bff;
}
/* Au RETOUR la teinte change : on rentre, on ne va plus. */
.trip.back {
  border-color: #7bc86c;
}
.tr-who {
  font-size: 17px;
}
.tr-poi {
  font-size: 15px;
}
.tr-time {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* L'avancement du voyage, en sous-lignage : la même information que le temps, sans
   une ligne de plus. ⚠️ `voyageProgress` (durée TOTALE) et non la fraction de phase,
   qui repart à zéro au demi-tour et ferait RECULER la barre à mi-chemin. */
.tr-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: var(--accent);
  transition: width 0.6s linear;
}
.trip.van .tr-bar {
  background: #b57bff;
}
.trip.back .tr-bar {
  background: #7bc86c;
}
.trip.ready {
  cursor: pointer;
  background: color-mix(in srgb, #7bc86c 16%, var(--surface));
}
.trip.ready:disabled {
  opacity: 0.6;
}
.sh-x {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.wp-good {
  color: #7bc86c;
  border-color: #7bc86c;
}
.wp-mid {
  color: #ffb23f;
  border-color: #ffb23f;
}
.wp-bad {
  color: #ff6a45;
  border-color: #ff6a45;
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
.coll-card {
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  min-width: 260px;
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
.coll-emo {
  font-size: 48px;
}
.coll-title {
  font-size: 20px;
  font-weight: 800;
  margin: 6px 0;
}
.coll-text {
  font-size: 13px;
  color: var(--dim);
  margin-bottom: 12px;
}
.coll-haul {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  font-weight: 700;
  margin-bottom: 16px;
}
/* Le rapport du groupe se lit en colonne (noms, XP, journal) : aligné à gauche, et la
   carte ne s'élargit pas au-delà de l'écran plié. */
.coll-party {
  margin: -6px 0 14px;
  max-width: 340px;
}
.coll-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
}
.empty {
  margin: 24px 16px;
  color: var(--dim);
  text-align: center;
  font-size: 13px;
}
</style>
