<template>
  <component
    :is="embedded || inTab ? 'div' : 'q-page'"
    class="base-page"
    :class="{ embedded, 'in-tab': inTab }"
  >
    <!-- En-tête seulement en écran AUTONOME : dans l'onglet Aventure, la barre de
         navigation est déjà celle de la page parente. -->
    <header v-if="!inTab" class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Ma base</div>
      <div class="iconbtn" />
    </header>

    <!-- ⚠️ Cette barre ne dit QUE ce qu'aucune autre ne dit. Le niveau du personnage et
         « héros en expédition » vivaient ici alors que la barre de l'Aventure, juste
         au-dessus, les affiche déjà — deux lignes pour la même information. Elle porte
         désormais la RÉCOLTE : ce que les bâtiments ont produit et qui attend, la seule
         chose qu'on vient vérifier sur cet écran et qui se périme si on l'oublie (un
         siège perdu vole le stock non ramassé). L'infirmerie, elle, reste : c'est une
         échéance propre à la base, et elle bloque le héros. -->
    <div class="bar">
      <button
        v-for="p in prodPills"
        :key="p.res"
        class="bar-chip prod"
        :class="{ ready: p.ready > 0, full: p.full }"
        :title="p.title"
        :disabled="!anyReady"
        @click="doHarvest"
      >
        {{ p.emoji }} {{ p.ready }}<small>/{{ p.max }}</small>
      </button>
      <button v-if="anyReady" class="bar-chip harvest" @click="doHarvest">🧺 Récolter</button>
      <span v-if="!prodPills.length" class="bar-chip dim">Aucun bâtiment de production</span>
      <span v-if="wounded" class="bar-chip hurt">🤕 Héros à l’infirmerie — {{ healIn }}</span>
    </div>

    <!-- ── L'ENCEINTE ────────────────────────────────────────────────────────
         Octogone : ses 8 sommets SONT les 8 emplacements de tourelle. Les
         emplacements vides restent dessinés en pointillés — ils disent au joueur
         ce qu'il pourrait avoir. -->
    <div class="keep-wrap">
      <svg viewBox="0 0 200 200" class="keep" role="img" aria-label="Enceinte de la base">
        <defs>
          <!-- Prairie : verte au centre, qui s'assombrit vers les bords du cadre. -->
          <radialGradient id="meadow" cx="50%" cy="46%" r="72%">
            <stop offset="0%" stop-color="#55672f" />
            <stop offset="55%" stop-color="#435527" />
            <stop offset="100%" stop-color="#2b3a1c" />
          </radialGradient>
          <!-- Terre battue au pied des murs : là où l'on marche, l'herbe ne tient pas. -->
          <radialGradient id="earth" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#5a4730" />
            <stop offset="74%" stop-color="#55432c" />
            <stop offset="100%" stop-color="#55432c" stop-opacity="0" />
          </radialGradient>
          <!-- LE PAVÉ. Un motif, PAS un filtre : il se rastérise une fois et ne se
               repeint jamais — l'enceinte, elle, anime des contours (cf. le terrain).
               La tuile porte son propre mortier, donc UNE seule forme par rue. -->
          <pattern id="cobble" width="9" height="9" patternUnits="userSpaceOnUse">
            <rect width="9" height="9" fill="#3b342a" />
            <rect x="0.6" y="0.7" width="3.5" height="3" rx="1.2" fill="#4d4438" />
            <rect x="4.9" y="0.9" width="3.4" height="2.8" rx="1.2" fill="#453d32" />
            <rect x="1.7" y="4.6" width="3.7" height="3" rx="1.2" fill="#494033" />
            <rect x="6.1" y="5" width="2.5" height="2.9" rx="1.1" fill="#423a30" />
          </pattern>
          <!-- ⚠️ Les rues sont tracées en formes SIMPLES (un anneau, un disque, une
               bande) puis DÉCOUPÉES à l'octogone intérieur : calculer leur intersection
               à la main donnerait des chemins illisibles qu'il faudrait refaire au
               moindre changement de rayon. -->
          <clipPath id="yardClip">
            <polygon :points="innerPoints" />
          </clipPath>
        </defs>

        <!-- ── LE TERRAIN ──────────────────────────────────────────────────
             ⚠️ Sur fond noir, l'enceinte flottait dans le vide (retour utilisateur) :
             une base est posée QUELQUE PART. Prairie + terre battue au pied des murs +
             chemin de terre qui part de la porte + touffes d'herbe. Tout est du SVG
             plat et SEEDÉ (aucun filtre : l'enceinte anime des contours, un feTurbulence
             se repeindrait à chaque image). -->
        <!-- `v-once` : rien ici n'est réactif, et le template entier se re-rend à
             chaque tick d'horloge — sans lui, 53 nœuds seraient re-diffés chaque seconde
             pour rien. -->
        <g v-once class="terrain" aria-hidden="true">
          <rect x="0" y="0" width="200" height="200" fill="url(#meadow)" />
          <ellipse v-for="(p, i) in patches" :key="'p' + i" v-bind="p" class="patch" />
          <circle cx="100" cy="100" :r="EARTH_R" fill="url(#earth)" />
          <path :d="roadPath" class="road" />
          <path :d="roadRuts" class="road-ruts" />
          <path v-for="(t, i) in tufts" :key="'t' + i" :d="t" class="tuft" />
          <path v-for="(t, i) in trees" :key="'tr' + i" :d="t" class="tree" />
        </g>
        <g v-if="corpses.length" class="field">
          <text
            v-for="c in corpses"
            :key="c.id"
            :x="(c.x / 100) * 200"
            :y="(c.y / 100) * 200"
            :class="['corpse', { champ: c.champion }]"
            text-anchor="middle"
          >
            {{ c.emoji }}
          </text>
        </g>

        <!-- ── LA MURAILLE ──────────────────────────────────────────────────
             Octogone à CRÉNEAUX, décalé d'un demi-pas : le haut de l'enceinte est
             donc un PAN de mur (et non un sommet), ce qui laisse la place au corps
             de garde. Les 8 sommets restent les 8 emplacements de tourelle. -->
        <polygon
          :points="wallPoints"
          class="wall"
          :class="{ absent: !wallLevel, damaged: wallDamaged }"
        />
        <!-- ⚠️ Zone cliquable de la muraille : sa BANDE seulement (`pointer-events: stroke`).
             Le polygone peint, lui, ne capte plus rien : son fond couvrait tout l'octogone,
             si bien qu'un clic sur un emplacement de tourelle VIDE (fill: none, donc non
             cliquable en son centre) le traversait et ouvrait la muraille. -->
        <polygon :points="wallPoints" class="wall-hit" @click="openDef('wall')" />
        <rect
          v-for="(m, i) in merlons"
          :key="'m' + i"
          :x="m.x - 3.1"
          :y="m.y - 3.1"
          width="6.2"
          height="6.2"
          :transform="`rotate(${m.a} ${m.x} ${m.y})`"
          class="merlon"
          :class="{ absent: !wallLevel, damaged: wallDamaged }"
        />
        <polygon :points="innerPoints" class="courtyard" />

        <!-- ── LES TOURELLES (sur les 8 sommets) ────────────────────────────
             Fût, couronne crénelée et meurtrière. Les emplacements vides restent
             tracés en pointillés : ils disent ce qu'on pourrait avoir. -->
        <g v-for="(p, i) in octagon" :key="'t' + i" class="hit" @click.stop="openDef('turret')">
          <!-- Pastille de capture : un `fill: none` n'est PAS cliquable en son centre —
               d'où un disque transparent, lui, qui l'est. -->
          <circle :cx="p.x" :cy="p.y" r="11" class="tur-hit" />
          <!-- BALISTE. Tout est dessiné autour de (0,0) et pointé vers le HAUT, puis
               translaté/pivoté : une seule silhouette à régler, et les 8 visent dehors. -->
          <g
            v-if="i < turretsBuilt"
            :transform="`translate(${p.x} ${p.y}) rotate(${p.rot})`"
            :class="{ damaged: turretsDamaged }"
          >
            <!-- Plateforme tournante : elle donne la MASSE qui pose la pièce sur le mur.
                 Sans elle, l'ensemble flottait et se lisait comme une croix. -->
            <path d="M -7 7 L 7 7 L 5.5 0 L -5.5 0 Z" class="tur-base" />
            <!-- Bras d'arc. ⚠️ En clair, pas dans le brun de la pierre : au premier essai
                 il avait la teinte du rempart et devenait invisible dessus. -->
            <path d="M -7.5 -0.5 Q 0 -5.5 7.5 -0.5" class="tur-bow" />
            <path d="M -6.5 -0.8 L 0 1.6 L 6.5 -0.8" class="tur-string" />
            <!-- Trait engagé, COURT : plus long, il transformait la silhouette en croix. -->
            <path d="M 0 3.5 L 0 -7" class="tur-bolt" />
            <path d="M 0 -9 L -2 -6.2 L 2 -6.2 Z" class="tur-head" />
          </g>
          <circle v-else :cx="p.x" :cy="p.y" r="7.5" class="tur-empty" />
        </g>
        <!-- 🧱 Pastille de niveau de la MURAILLE, au milieu du pan ouest (demande de
             l'utilisateur : on ne savait pas qu'elle était à monter). Un « ↑ » orange
             quand elle est SOUS le niveau du joueur ET que l'or de l'amélioration est là (v0.1059 : sans les fonds, la flèche promettait une amélioration refusée) — la seule structure sans pastille
             était précisément celle qui active les sièges. -->
        <g v-if="wallLevel" class="lvl-badge wall-lvl" :class="{ upgrade: canUpgrade('wall') }">
          <circle :cx="100 - APOTHEM" cy="100" r="5.4" />
          <text :x="100 - APOTHEM" y="102">{{ wallLevel }}</text>
          <text v-if="canUpgrade('wall')" :x="100 - APOTHEM + 6.4" y="95.6" class="lvl-up">↑</text>
        </g>
        <!-- Pastille de niveau des tourelles, sur la 1re tour -->
        <g v-if="turretsBuilt" class="lvl-badge" :class="{ upgrade: canUpgrade('turret') }">
          <circle :cx="octagon[0]!.x + 7" :cy="octagon[0]!.y - 8" r="5" />
          <text :x="octagon[0]!.x + 7" :y="octagon[0]!.y - 6.2">{{ turretLevel }}</text>
          <text
            v-if="canUpgrade('turret')"
            :x="octagon[0]!.x + 13.4"
            :y="octagon[0]!.y - 12.4"
            class="lvl-up"
          >
            ↑
          </text>
        </g>

        <!-- ── LE CORPS DE GARDE (Tour de guet), au milieu du pan nord ──────
             Plus haut que les tourelles, coiffé d'une bannière : c'est lui qui
             voit venir. Vide → silhouette en pointillés, cliquable pour bâtir. -->
        <g class="hit" @click="openDef('watchtower')">
          <!-- 🔴 ARMÉE REPÉRÉE : un cadre rouge qui bat lentement autour de la tour.
               ⚠️ Il était censé exister depuis la v0.745, et n'a JAMAIS pu s'afficher :
               l'anneau d'alerte était posé dans la boucle des tuiles de la COUR, avec
               la condition `id === 'watchtower'` — or la Tour de guet n'est pas une
               tuile de cour, c'est ce corps de garde dessiné sur le rempart nord.
               `YARD_SERVICES` ne l'a jamais contenue : la condition était morte.
               Signalé par l'utilisateur ; c'est lui, pas le dessin, qui l'a vu.
               ⚠️ Le cadre est dessiné même quand la tour n'est PAS bâtie : une armée
               arrive quand même, et c'est précisément là qu'il faut le savoir. -->
          <rect
            v-if="raid"
            x="86"
            :y="WALL_TOP - 21"
            width="28"
            height="40"
            rx="3"
            class="watch-alarm"
          />
          <template v-if="watchLevel">
            <rect
              x="91"
              :y="WALL_TOP - 12"
              width="18"
              height="30"
              rx="2"
              class="watch-body"
              :class="{ damaged: watchDamaged }"
            />
            <rect
              v-for="k in 4"
              :key="k"
              :x="91 + (k - 1) * 5"
              :y="WALL_TOP - 16"
              width="3.5"
              height="4.5"
              class="watch-crown"
              :class="{ damaged: watchDamaged }"
            />
            <!-- Mât et bannière. ⚠️ Tout est posé PAR RAPPORT au pan nord : en dur, ils
                 sortaient du cadre (y négatif) et se faisaient rogner par le viewBox. -->
            <rect x="99.2" :y="WALL_TOP - 25" width="1.6" height="12" class="watch-mast" />
            <path
              :d="`M100.8 ${WALL_TOP - 25} L110 ${WALL_TOP - 22} L100.8 ${WALL_TOP - 19.2} Z`"
              class="watch-flag"
            />
            <circle cx="100" :cy="WALL_TOP" r="3.4" class="watch-eye" />
            <g class="lvl-badge">
              <circle cx="112" :cy="WALL_TOP - 8" r="5" />
              <text x="112" :y="WALL_TOP - 6.2">{{ watchLevel }}</text>
            </g>
          </template>
          <rect v-else x="91" :y="WALL_TOP - 12" width="18" height="30" rx="2" class="slot-empty" />
          <!-- ⚠️ LE PICTOGRAMME, EN PLUS DU CADRE (demandé par l'utilisateur). Le cadre
               rouge borde la tour ; à 28 unités de large sur un dessin qui en compte 200,
               il se confond vite avec les autres liserés de l'enceinte. Un glyphe posé
               AU CENTRE dit la même chose sans dépendre d'un contour.
               ⚠️ Dessiné APRÈS le corps et l'œil, sinon il passerait dessous. Placé sous
               l'œil (rayon 3,4 autour de WALL_TOP) plutôt que dessus : deux symboles
               superposés ne se lisent ni l'un ni l'autre. Affiché même sans tour bâtie,
               comme le cadre — l'armée arrive de toute façon. -->
          <text v-if="raid" x="100" :y="WALL_TOP" class="watch-warn">⚠️</text>
        </g>

        <!-- ── LA PORTE (rempart sud) ───────────────────────────────────────
             C'est par là qu'on sort : elle ouvre la carte des expéditions. Placée
             au milieu du pan SUD, à l'opposé du corps de garde — l'enceinte a donc
             un point d'entrée et un point de sortie, ce qui se lit d'un coup d'œil. -->
        <!-- ⚠️ LA PORTE N'EST PLUS LE BOUTON (demande de l'utilisateur) : le départ en
             expédition se prend au relais du coin bas-gauche, et deux surfaces pour le même
             geste faisaient doublon. Elle garde son métier de DÉCOR — elle dit que l'enceinte
             a une sortie, en face du corps de garde. -->
        <g v-once class="gate">
          <!-- Deux piliers coiffés encadrent l'arche : une PORTE, pas un trou dans le mur. -->
          <template v-for="g in gateSides" :key="g.side">
            <rect
              :x="g.pierX"
              :y="WALL_BOTTOM - 12"
              width="5.5"
              height="19"
              rx="1"
              class="gate-pier"
            />
            <path :d="g.cap" class="gate-cap" />
          </template>
          <path :d="gatePath" class="gate-arch" />
          <path :d="gateMouth" class="gate-mouth" />
          <!-- Les deux vantaux ENTROUVERTS : on voit qu'on peut sortir. -->
          <path v-for="g in gateSides" :key="'leaf' + g.side" :d="g.leaf" class="gate-leaf" />
          <!-- Le pont de planches qui enjambe le fossé de terre battue -->
          <g class="gate-bridge">
            <rect x="91" :y="WALL_BOTTOM + 6" width="18" height="8" rx="1" />
            <line x1="91" :y1="WALL_BOTTOM + 8.7" x2="109" :y2="WALL_BOTTOM + 8.7" />
            <line x1="91" :y1="WALL_BOTTOM + 11.3" x2="109" :y2="WALL_BOTTOM + 11.3" />
          </g>
        </g>

        <!-- ── L'ACCÈS AUX EXPÉDITIONS (coin bas-gauche) ─────────────────────
             Un panneau indicateur et TES champions en route vers lui : c'est d'ici qu'on
             les envoie. ⚠️ HORS du groupe `v-once` de la porte : les médaillons suivent
             le vivier (qui peut arriver après le premier rendu), un groupe figé les
             aurait laissés vides pour toujours. -->
        <g
          class="hit camp"
          role="button"
          tabindex="0"
          aria-label="Partir en expédition"
          @click="openMap"
          @keydown.enter="openMap"
          @keydown.space.prevent="openMap"
        >
          <!-- Cible tactile élargie : les dessins se cliquent, mais un doigt vise mal. -->
          <!-- ⚠️ Bornée pour rester HORS du rempart : son coin haut-droit doit être
               au-delà de WALL_R + la demi-épaisseur du trait (72 + 4), sinon un clic près
               du mur bas-gauche ouvrirait les expéditions. Mesuré : 77,7 > 76. -->
          <rect x="4" y="164" width="52" height="34" class="gate-hit" />
          <ellipse cx="36" cy="187" rx="31" ry="7.5" class="camp-ground" />
          <!-- Le panneau : planche en flèche vers le dehors, boussole gravée. -->
          <g class="sign">
            <rect x="12.6" y="166" width="3.2" height="24" rx="0.8" class="sign-post" />
            <path d="M2.5 170 L8 164 L26 164 L26 176 L8 176 Z" class="sign-board" />
            <text x="16" y="172.6" class="sign-ico">🧭</text>
          </g>
          <defs>
            <clipPath id="camp-disc" clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          </defs>
          <!-- Les champions en marche vers le panneau : les trois premiers de ton vivier
               (disponibles d'abord), leur portrait dans un médaillon à la couleur de leur
               rareté. Sans portrait, l'emoji de leur classe ; sans vivier, des silhouettes. -->
          <g
            v-for="(m, i) in expeParty"
            :key="m.key"
            class="march"
            :class="{ ghost: !m.real }"
            :style="{ '--rk': m.color, animationDelay: i * 0.22 + 's' }"
          >
            <ellipse
              :cx="CAMP_SPOTS[i]!.x"
              :cy="CAMP_SPOTS[i]!.y + 7.2"
              rx="5"
              ry="1.4"
              class="march-shadow"
            />
            <circle :cx="CAMP_SPOTS[i]!.x" :cy="CAMP_SPOTS[i]!.y" r="6.4" class="march-bg" />
            <image
              v-if="m.src"
              :href="m.src"
              :x="CAMP_SPOTS[i]!.x - 6"
              :y="CAMP_SPOTS[i]!.y - 6"
              width="12"
              height="12"
              clip-path="url(#camp-disc)"
              preserveAspectRatio="xMidYMid slice"
            />
            <text v-else :x="CAMP_SPOTS[i]!.x" :y="CAMP_SPOTS[i]!.y + 2.3" class="march-emo">
              {{ m.emoji }}
            </text>
            <circle :cx="CAMP_SPOTS[i]!.x" :cy="CAMP_SPOTS[i]!.y" r="6.4" class="march-rim" />
          </g>
          <!-- Le libellé, comme au bord de la route : on sait où mène ce départ. -->
          <text x="36" y="196.5" class="camp-label">Expéditions ›</text>
        </g>

        <!-- ── LE SOL DE LA COUR ────────────────────────────────────────────
             Sans lui, les tuiles flottaient sur le même fond que l'extérieur : on ne
             voyait pas qu'on était DEDANS. La terre arrête le regard aux murs, et les
             rues PAVÉES portent les bâtiments : un anneau sous les dix ateliers, une
             place sous les trois services, et l'axe porte (sud) ↔ corps de garde (nord)
             que l'enceinte dessine déjà.
             ⚠️ Chaque rue est calée sur le rayon de SON anneau de tuiles (PLOT_R,
             SVC_R) : posée à un nombre écrit à la main, elle se décrocherait des
             bâtiments dès qu'on retouche la disposition — et c'est arrivé une fois, à la
             cour, quand le roster est passé de sept à dix.
             « v-once » : rien ici n'est réactif (cf. le terrain). -->
        <g v-once aria-hidden="true">
          <polygon :points="innerPoints" class="yard-ground" />
          <g clip-path="url(#yardClip)">
            <circle cx="100" cy="100" :r="PLOT_R" class="pave" :stroke-width="YARD_HALF * 2 + 6" />
            <circle cx="100" cy="100" :r="SVC_R + YARD_HALF + 4" class="pave-fill" />
            <rect
              :x="100 - GATE_HALF"
              :y="100 - APOTHEM"
              :width="GATE_HALF * 2"
              :height="APOTHEM * 2"
              class="pave-fill"
            />
          </g>
        </g>

        <!-- ── LA COUR ──────────────────────────────────────────────────────
             Deux rangées de bâtiments de production + une rangée de services.
             Chacun est une TUILE cliquable : emoji, pastille de niveau, point de
             récolte — exactement ce que faisait l'anneau de la carte, mais à
             l'abri des murs et avec une vraie cible tactile. -->
        <g
          v-for="y in yard"
          :key="y.key"
          class="yard hit"
          :class="{ empty: !y.built, ready: y.ready, broken: y.damaged, svc: y.service }"
          @click="y.onClick()"
        >
          <rect
            :x="y.x - y.half - HIT_PAD"
            :y="y.y - y.half - HIT_PAD"
            :width="(y.half + HIT_PAD) * 2"
            :height="(y.half + HIT_PAD) * 2"
            class="yard-hit"
          />
          <rect
            :x="y.x - y.half"
            :y="y.y - y.half"
            :width="y.half * 2"
            :height="y.half * 2"
            :rx="y.half * 0.55"
            class="yard-pad"
          />
          <text
            v-if="y.built"
            :x="y.x"
            :y="y.y + y.half * 0.44"
            class="yard-emo"
            :style="{ fontSize: y.half * (4 / 3) + 'px' }"
          >
            {{ y.emoji }}
          </text>
          <text
            v-else
            :x="y.x"
            :y="y.y + y.half * 0.44"
            class="yard-plus"
            :style="{ fontSize: y.half * (13 / 9) + 'px' }"
          >
            {{ y.locked ? '🔒' : '＋' }}
          </text>
          <g v-if="y.built" class="lvl-badge">
            <circle :cx="y.x + y.half - 1.5" :cy="y.y - y.half + 1.5" r="4.6" />
            <text :x="y.x + y.half - 1.5" :y="y.y - y.half + 3.1">{{ y.level }}</text>
          </g>
          <circle
            v-if="y.ready"
            :cx="y.x - y.half + 1.5"
            :cy="y.y - y.half + 1.5"
            r="2.6"
            class="yard-ready"
          />
          <rect
            v-if="y.todo"
            :x="y.x - y.half - 2"
            :y="y.y - y.half - 2"
            :width="y.half * 2 + 4"
            :height="y.half * 2 + 4"
            rx="7"
            class="yard-ring todo"
          />
        </g>
      </svg>

      <!-- 🛡️ LA TUILE DÉFENSE (demandé : « une tuile de défense avec les infos repliées
           dedans »). Repliée, elle garde ce qui ALERTE — une armée en approche et le
           verdict, dans la couleur de la bande — pour qu'on n'ait pas à l'ouvrir pour
           savoir s'il faut s'inquiéter. Dépliée, le rapport de forces complet. État
           mémorisé par appareil, comme les autres pliages de cet écran. -->
      <div class="panel forces tile" :class="{ open: defTileOpen }">
        <button type="button" class="tile-h" :aria-expanded="defTileOpen" @click="toggleDefTile">
          <span class="tile-emo">🛡️</span>
          <span class="tile-main">
            <span class="tile-t font-display">Défense</span>
            <span class="tile-s">{{ fmtPow(forces.power) }} de puissance</span>
          </span>
          <span class="tile-sum" :class="odds ?? (raid ? 'unknown' : 'calm')">{{
            defSummary
          }}</span>
          <span class="tile-chev">{{ defTileOpen ? '▾' : '▸' }}</span>
        </button>
        <template v-if="defTileOpen">
          <div class="f-head">
            <div class="f-side">
              <div class="f-lab">🛡️ Ma défense</div>
              <!-- ⚠️ LA PUISSANCE EN TÊTE (demandé par l’utilisateur) : le pronostic SATURE —
                 à enceinte pleine il affiche 100 % et ne bouge plus, donc il ne montre rien
                 du progrès quand on améliore une structure, alors que c’est exactement la
                 question qu’on se pose devant « Améliorer ». La puissance, elle, est
                 MONOTONE. ⚠️ Elle ne PRÉDIT rien — la tenue mesurée reste juste dessous, et
                 c’est elle qui répond à « est-ce que je tiens ? ». Deux questions, deux
                 nombres, aucun risque qu’ils se contredisent. -->
              <div class="f-val font-display">{{ fmtPow(forces.power) }}</div>
              <!-- ⚠️ LE REPÈRE N'EST PLUS ICI (v0.902, mesuré ; signalé par l'utilisateur :
                 « plusieurs infos contradictoires sur le fait de tenir ou non »). « tient
                 X % face à une armée type » est une moyenne sur SIX armées génériques, pas
                 sur celle qui arrive : mesuré sur 96 configurations, il s'écarte du vrai
                 pronostic de 17 points en médiane, 71 au p90, **100 au pire** — un joueur
                 lisait « tient 100 % » juste au-dessus de « Tu tiens 0 % ». Deux
                 pourcentages de TENUE côte à côte ne peuvent pas ne pas se contredire.
                 Il descend dans le détail replié, où il répond à sa vraie question
                 (« mon enceinte tient-elle la route en général ? »), utile au calme. -->
              <div class="f-sub">de puissance</div>
            </div>
            <div class="f-vs">vs</div>
            <div class="f-side right">
              <div class="f-lab">⚔️ L’armée</div>
              <div v-if="!raid" class="f-val calm">—</div>
              <div
                v-else-if="!assaultSeen?.known"
                class="f-val unknown"
                title="Monte la Tour de guet"
              >
                ???
              </div>
              <div v-else-if="assaultSeen.exact" class="f-val font-display">{{ assault }}</div>
              <div v-else class="f-val font-display range">
                {{ assaultSeen.lo }}–{{ assaultSeen.hi }}
              </div>
              <!-- ⚠️ « à égalité : 1 chance sur 2 » EST RETIRÉ (v0.902, mesuré). Les deux
                 chiffres restent à la même échelle (`RAID.assaultEvenK`) — c'est ce qui rend
                 la comparaison honnête à vue d'œil — mais la phrase promettait un SEUIL
                 précis qui a dérivé : mesuré, à rapport 0,9-1,1 la tenue médiane est de
                 100 %, pas 50 % (le point d'équilibre est vers 0,8). Plutôt que de
                 recalibrer un SECOND pronostic qui redérivera, on cesse d'en faire un :
                 ces deux nombres sont des MAGNITUDES, et le verdict juste dessous est la
                 seule réponse à « est-ce que je tiens ? ». -->
              <div v-if="raid && assaultSeen?.known" class="f-sub">puissance d’assaut</div>
            </div>
          </div>
          <!-- ⚠️ CE QUE COÛTENT LES ABSENTS (demandé par l'utilisateur : « envoyer des
             convois ou le héros sans se mettre dans le rouge »). Le panneau donnait la
             défense du MOMENT sans jamais dire ce qu'elle vaudrait au complet : on ne
             pouvait pas savoir ce qu'on abandonnait en faisant partir quelqu'un.
             ⚠️ Affiché SEULEMENT si l'écart est réel — annoncer « −0 » à un joueur dont
             tout le monde est à la maison serait du bruit. -->
          <p v-if="forcesGap > 0" class="f-gap">
            🚪 Des tiens sont dehors : <b>−{{ fmtPow(forcesGap) }}</b> de puissance — au complet, tu
            vaudrais <b>{{ fmtPow(forcesFull) }}</b
            >.
          </p>
          <!-- ⚠️ LA JAUGE EST LA TENUE ELLE-MÊME, et c’est tout le changement : plus de
             rapport de puissances, plus de seuil d’équilibre à connaître. « Tu tiens 7
             fois sur 10 » se lit sans notice, et ne peut pas diverger de la bataille
             puisque c’est le moteur qui l’a jouée. -->
          <template v-if="odds">
            <div class="f-gauge" :class="odds">
              <i class="fg-cursor" :style="{ left: (raidHold ?? 0) * 100 + '%' }" />
            </div>
            <div class="f-odds" :class="odds">
              {{ ODDS_LABEL[odds] }}
              <b class="fo-pct">{{ holdPct(raidHold ?? 0) }}</b>
            </div>
          </template>
          <p v-else-if="raid" class="f-hint">
            Sans renseignement, tu ne peux pas jauger cette armée — c’est ce que la
            <b>Tour de guet</b> achète.
          </p>
          <p v-else class="f-hint">Aucune armée en vue : c’est le moment de partir sur la carte.</p>
          <!-- ⚠️ Chaque part est mesurée PAR ABLATION (« ce qu'on perdrait sans lui »),
             jamais par une formule recopiée : l'étiquette ne peut pas diverger du combat.
             Elles ne s'additionnent donc pas au total — les canaux se multiplient. -->
          <!-- ⚠️ ATTAQUE ET DÉFENSE SÉPARÉES (demandé par l'utilisateur). Un seul nombre
             mélangeait « ce qui tient » et « ce qui tue », et laissait croire qu'un mur
             pouvait gagner une bataille. Le mur ENCAISSE (🛡️), les tourelles TUENT (⚔️) :
             c'est visible d'un coup d'œil, et c'est ce que le moteur fait vraiment. -->
          <!-- ⚠️ REPLIÉ PAR DÉFAUT (demandé par l’utilisateur : « replie le détail de la
             défense et garde la puissance par défaut »). Le chiffre du haut répond à la
             question qu’on vient se poser ; la décomposition sert quand on cherche QUOI
             améliorer, ce qui est un second geste. État mémorisé par appareil — même
             traitement que la carte des mondes (v0.745). -->
          <button
            type="button"
            class="f-parts-h"
            :aria-expanded="partsOpen"
            @click="togglePartsOpen"
          >
            <span>{{ partsOpen ? '▾' : '▸' }} Ce que je perdrais sans…</span>
            <span v-if="partsOpen" class="fh-cols"><i>🛡️ tenir</i><i>⚔️ tuer</i></span>
          </button>
          <div v-if="partsOpen" class="f-parts">
            <div v-for="p in forces.parts" :key="p.id" class="f-part" :class="{ off: !p.active }">
              <span class="dp-emo">{{ p.emoji }}</span>
              <span class="dp-lab">{{ p.label }}</span>
              <!-- ⚠️ Ces valeurs ne s'ADDITIONNENT pas au total : les canaux se multiplient
                 (la garnison amplifie des PV que le mur fournit). C'est « ce qu'on
                 perdrait sans lui », rien de plus. -->
              <span class="dp-def">{{ p.active && p.def ? fmtPow(p.def) : '—' }}</span>
              <span class="dp-atk">{{ p.active && p.atk ? fmtPow(p.atk) : '—' }}</span>
            </div>
          </div>
          <!-- ⚠️ LE REPÈRE VIT ICI, et il DIT qu'il ne parle pas du siège du jour. Il répond
             à « mon enceinte tient-elle la route en général ? » — utile au calme, quand
             aucune armée n'est en vue — et c'est le seul endroit où il ne peut plus être lu
             comme un pronostic sur l'armée qui arrive. -->
          <p v-if="partsOpen" class="f-hint">
            📐 En moyenne, sur des armées variées de ton niveau, ton enceinte tient
            <b>{{ holdPct(forces.hold) }}</b> du temps — un repère sur ta base, pas un pronostic sur
            l’armée en approche.
          </p>
          <!-- ⚠️ Il DESCEND avec les parts qu'il explique : il dit pourquoi la colonne est à
             zéro, et cette colonne vit désormais dans le repli. En tête de panneau il
             annonçait « ta base tient face à une armée type » juste au-dessus d'un verdict
             qui pouvait dire l'inverse — la contradiction qu'on vient de supprimer. -->
          <p v-if="partsOpen && holdNote" class="f-hint">{{ holdNote }}</p>
          <p v-if="partsOpen && !heroHome && heroBack" class="f-hint">
            🧭 Ton héros est en expédition, mais il sera rentré avant l’assaut : il défendra.
          </p>
          <p v-else-if="partsOpen && !heroHome" class="f-hint warn">
            🧭 Ton héros est en expédition : il ne défendra pas.
          </p>

          <!-- ── 🏗️ CE QUE CHAQUE STRUCTURE APPORTE, ET À QUOI ELLE EST LIÉE ───────
             ⚠️ Demandé par l’utilisateur. Le lien entre bâtiments n’était écrit NULLE
             PART. Ce dépliant répond aux deux
             questions d’un coup — « ça sert à quoi » et « il me faut quoi d’autre ».
             ⚠️ Les libellés viennent de `defensePerLevelLabel`, la fonction du JEU : un
             texte recopié finirait par annoncer autre chose que ce qui se passe. -->
          <button type="button" class="f-parts-h" :aria-expanded="helpOpen" @click="toggleHelpOpen">
            <span>{{ helpOpen ? '▾' : '▸' }} À quoi sert chaque structure</span>
          </button>
          <div v-if="helpOpen" class="f-help">
            <div v-for="h in structureHelp" :key="h.id" class="fh-row">
              <span class="dp-emo">{{ h.emoji }}</span>
              <span class="fh-main">
                <span class="fh-name"
                  >{{ h.label }}<b v-if="h.level"> · niv {{ h.level }}</b></span
                >
                <span class="fh-what">{{ h.next }}</span>
                <span v-if="h.link" class="fh-link">🔗 {{ h.link }}</span>
              </span>
            </div>
          </div>
        </template>
      </div>

      <p class="keep-hint">Touche un bâtiment pour le construire, l’améliorer ou récolter.</p>
    </div>

    <!-- ── LE REJEU DU SIÈGE, en plein écran ──────────────────────────────
         S'ouvre TOUT SEUL à la résolution : découvrir l'issue par une notification
         retirerait tout enjeu à l'animation. -->
    <q-dialog v-model="siegeOpen" maximized persistent>
      <SiegeStage
        v-if="siegeShown"
        :key="siegeKey"
        :report="siegeShown"
        :turret-level="turretLevel"
        :loot="lastLootPills"
        :hero="siegeHero"
        :portraits="siegePortraits"
        @done="closeSiege"
      />
    </q-dialog>

    <!-- Revoir le dernier assaut -->
    <!-- ⚠️ Sans notification, le PRÉAVIS que la Tour de guet fait payer ne sert qu'à
         ceux qui ouvraient l'app de toute façon. C'est l'objet de cet interrupteur. -->
    <div v-if="pushOk" class="panel push-panel">
      <div class="p-title font-display">🔔 Me prévenir</div>
      <div class="p-sub">
        Armée repérée, assaut résolu, héros, convoi ou groupe rentré, et ce qui bouge sur un boss
        entre amis — même app fermée.
      </div>
      <button class="push-btn" :disabled="pushBusy" @click="togglePush">
        {{ pushOn ? 'Désactiver les notifications' : 'Activer les notifications' }}
      </button>
      <div v-if="pushNote" class="p-sub push-note">{{ pushNote }}</div>
    </div>

    <!-- ── Héros à l'infirmerie ── -->
    <div v-if="wounded" class="panel warn">
      <div class="p-title">🤕 Ton héros est à l’infirmerie</div>
      <p>
        Il s’est fait déborder en défendant la ville. Il ne repartira ni en donjon, ni au
        Labyrinthe, ni en expédition avant {{ healIn }}.
        <b>Ton énergie, elle, ne se périme pas</b> — rien de ce que tu gagnes en attendant n’est
        perdu.
      </p>
      <button class="cta" :disabled="(char.row?.gold ?? 0) < healPrice" @click="doHeal">
        ⛑️ Soins d’urgence · {{ fmtPow(healPrice) }} 🪙
      </button>
    </div>

    <!-- ── Production gelée ── -->
    <div v-if="freeze" class="panel warn">
      <div class="p-title">❄️ Production gelée</div>
      <p>
        Tes filons sont à l’arrêt tant que l’enceinte est en ruine.
        <b>Répare-la : la production repart à la fin des travaux.</b>
        Sinon, une séance de sport la relance aussi — ou les ouvriers s’y remettent seuls
        {{ freezeIn }}.
      </p>
      <button
        v-if="repairAllCost > 0"
        class="cta"
        :disabled="(char.row?.gold ?? 0) < repairAllCost"
        @click="doRepairAll"
      >
        🔧 Tout réparer · {{ fmtPow(repairAllCost) }} 🪙
      </button>
    </div>

    <GuildPanel :open="guildOpen" :section="guildSection" @close="guildOpen = false" />
    <SummonPanel :open="summonOpen" @close="summonOpen = false" />

    <!-- ⚠️ LA PAGE NE GARDE QUE CE QUI SE LIT D'UN COUP D'ŒIL. Espionnage, dernier
         siège et champ de bataille vivaient en panneaux empilés sous l'enceinte, loin
         du bâtiment qui les produit : on faisait défiler pour savoir ce que la Tour de
         guet avait vu. Ils sont désormais DANS la feuille de leur structure, et c'est
         le dessin qui alerte. Un bâtiment, un endroit — même règle que la Guilde. -->

    <!-- Feuille des emplacements de production, ouverte depuis le dessin. -->
    <VillagePlots
      v-model:slot="plotSlot"
      :hero-level="heroLevel"
      :now="now"
      @open-guild="openGuild"
      @open-summon="summonOpen = true"
    />

    <!-- Feuille d'une structure de défense, ouverte depuis le dessin. -->
    <q-dialog v-model="defSheetOpen" position="bottom">
      <q-card v-if="defSel" class="def-sheet">
        <div class="sh-head">
          <span class="sh-emo">{{ defSel.emoji }}</span>
          <div class="sh-main">
            <div class="sh-title font-display">
              {{ defSel.label }}
              <span v-if="lvlOf(defSel.id)" class="s-lvl">niv. {{ lvlOf(defSel.id) }}</span>
              <span v-if="damagedOf(defSel.id)" class="s-dmg">endommagée</span>
            </div>
            <div class="sh-sub">{{ defSel.desc }}</div>
            <!-- ⚠️ La description dit ce que la structure FAIT ; celle-ci dit ce qu’un
                 NIVEAU CHANGE — la seule question qu’on se pose devant « Améliorer ».
                 Chiffres DÉRIVÉS des vraies fonctions, jamais recopiés. -->
            <div v-if="lvlOf(defSel.id)" class="sh-gain">{{ perLevel(defSel.id) }}</div>
            <div v-if="defSel.id === 'turret' && lvlOf('turret')" class="sh-note">
              Les {{ TURRET_SLOTS }} tourelles montent ensemble — un seul niveau les arme toutes.
            </div>
          </div>
          <button class="sh-x" @click="defOpen = null">✕</button>
        </div>
        <div class="s-actions">
          <button
            v-if="!lvlOf(defSel.id)"
            class="btn"
            :disabled="!canBuild(defSel.id)"
            @click="doBuild(defSel.id)"
          >
            Construire · {{ defSel.buildGold }} 🪙
          </button>
          <template v-else>
            <!-- ⚠️ Une réparation PREND DU TEMPS (v0.802) : la durée s'annonce AVANT de payer —
                 la découvrir après coup, c'est découvrir le prix après avoir payé. -->
            <template v-if="repairLeft(defSel.id) > 0">
              <div class="s-repair">
                🔧 En réparation · encore {{ fmtSpan(repairLeft(defSel.id)) }}
              </div>
              <button
                class="btn fix"
                :disabled="(char.row?.gold ?? 0) < rushCost(defSel.id)"
                @click="doFinishRepair(defSel.id)"
              >
                Terminer maintenant · {{ fmtPow(rushCost(defSel.id)) }} 🪙
              </button>
            </template>
            <button
              v-else-if="damagedOf(defSel.id)"
              class="btn fix"
              :disabled="!canRepair(defSel.id)"
              @click="doRepair(defSel.id)"
            >
              Réparer · {{ fmtPow(repairCost(lvlOf(defSel.id))) }} 🪙 ·
              {{ fmtSpan(repairMsFor(lvlOf(defSel.id))) }}
            </button>
            <button class="btn" :disabled="!canUpgrade(defSel.id)" @click="doUpgrade(defSel.id)">
              Améliorer · {{ fmtPow(upCost(defSel.id)) }} 🪙
            </button>
          </template>
        </div>

        <!-- 🗼 LA TOUR DE GUET porte ce qu’elle produit : le renseignement, et le
             compte rendu du dernier assaut. -->
        <template v-if="defSel.id === 'watchtower'">
          <!-- ── Menace en approche ── -->
          <div v-if="raid" class="panel threat">
            <div class="p-title">⚠️ Une armée approche — {{ arriveIn }}</div>
            <!-- 🕳️ D'OÙ ELLE SORT — affiché SANS condition de clarté, et ce n'est pas un
               oubli. La Tour de guet vend du renseignement sur l'ENNEMI ; or « cette armée
               sort d'une faille » est la conséquence de MA négligence, pas un secret
               adverse — ce n'est donc pas sa marchandise. La cacher derrière un niveau de
               Tour priverait de la leçon exactement les joueurs qui en ont le plus besoin,
               et un pic de difficulté ×1,3 sans raison affichée se lit comme un bug.
               ⚠️ Le texte ne nomme NI la faction NI l'effectif : ça, ça reste ce que la
               Tour fait payer, et les lignes ci-dessous s'en chargent selon la clarté. -->
            <div v-if="raid.overflow" class="rift-origin">
              🕳️ <b>Sortie d'une faille</b> — tu l'as laissée déborder. Cette armée est
              <b>renforcée</b>.
            </div>
            <div class="scout">
              <div class="scout-line">
                <span class="k">Nature</span>
                <span class="v">
                  {{
                    scout.faction
                      ? `${FACTION_EMOJI[scout.faction]} ${FACTION_LABEL[scout.faction]}`
                      : '???'
                  }}
                </span>
              </div>
              <div class="scout-line">
                <span class="k">Butin attendu</span>
                <span class="v">{{ scout.faction ? FACTION_LOOT[scout.faction] : '???' }}</span>
              </div>
              <div class="scout-line">
                <span class="k">Effectif</span>
                <span class="v">{{ scout.size ?? '???' }}</span>
              </div>
              <div class="scout-line">
                <span class="k">Niveau moyen</span>
                <span class="v">{{ scout.avgLevel ?? '???' }}</span>
              </div>
              <!-- La COMPOSITION est ce qu’on vient lire ici : elle mérite mieux qu’une ligne
                 de puces de 12 px. Une carte par groupe — icône lisible, effectif, niveau —
                 et le champion se reconnaît sans lire. Visible à partir de la clarté 4. -->
              <template v-if="scout.groups">
                <div class="foes-h">Composition</div>
                <div class="foes">
                  <div
                    v-for="(g, i) in scout.groups"
                    :key="i"
                    class="foe"
                    :class="{ champ: g.champion }"
                  >
                    <span v-if="g.champion" class="foe-crown" title="Champion">👑</span>
                    <span class="foe-emo">{{ g.emoji }}</span>
                    <span class="foe-n font-display">×{{ g.count }}</span>
                    <span class="foe-lvl">niv {{ g.level }}</span>
                  </div>
                </div>
              </template>
              <!-- Clarté 2-3 : on connaît l’effectif mais pas la répartition. On le DIT dans le
                 même langage visuel plutôt que de laisser un vide — et sans rien inventer :
                 une seule silhouette, le total, et le niveau moyen s’il est connu. -->
              <template v-else-if="scout.size">
                <div class="foes-h">Composition</div>
                <div class="foes">
                  <div class="foe unknown">
                    <span class="foe-emo">❓</span>
                    <span class="foe-n font-display">×{{ scout.size }}</span>
                    <span class="foe-lvl">{{
                      scout.avgLevel ? `niv ~${scout.avgLevel}` : 'niveau ?'
                    }}</span>
                  </div>
                </div>
                <p class="foes-blind">
                  Tes éclaireurs comptent les silhouettes sans distinguer les rangs.
                  <template v-if="watchLevel">Une <b>Tour</b> plus haute y verrait clair.</template>
                  <template v-else>Une <b>Tour de guet</b> y verrait clair.</template>
                </p>
              </template>
            </div>
            <p class="scout-hint">
              {{ scoutHint }}
            </p>
          </div>
          <div v-else class="panel calm">
            <div class="p-title">🕊️ Aucune menace en vue</div>
            <!-- ⚠️ On dit CE QUI MANQUE, pas seulement qu’il manque quelque chose : le seuil
               porte sur le mur ET les tourelles, et une enceinte à moitié ne tient rien. -->
            <!-- Niveau 1 : on bâtit, personne ne vient encore (`RAID.minRaidLevel`). -->
            <p v-if="tooEarlyForRaids">
              🌱 Aucune armée ne marche sur une ville avant le niveau
              <b>{{ RAID.minRaidLevel }}</b
              >. Profites-en pour poser <b>muraille</b> et <b>tourelles</b> : il te faudra les deux
              à ton niveau pour qu’elle attire du monde.
            </p>
            <p v-else-if="!raidsReady">
              Ta ville n’attire personne tant que son enceinte ne vaut pas la peine d’être attaquée.
              Il te faut <b>muraille</b> et <b>tourelles</b> au niveau <b>{{ readyLevel }}</b> —
              <span :class="{ miss: wallLevel < readyLevel }">muraille {{ wallLevel }}</span> ·
              <span :class="{ miss: turretLevel < readyLevel }">tourelles {{ turretLevel }}</span
              >.
            </p>
            <!-- ⚠️ ON N'ANNONCE PLUS QUAND. L'écran affichait le compte à rebours vers
               `nextRaidAt` avant même toute détection : il divulguait donc l'horaire que la
               TOUR DE GUET est précisément censée vendre. Une armée qui prévient de son
               arrivée n'est pas une menace, c'est un rendez-vous. On ne dit ici que ce qu'on
               peut honnêtement savoir : rien — sauf le PRÉAVIS que la Tour donnera le jour
               où elle repérera quelque chose. C'est ça qu'on achète en la montant. -->
            <p v-else>
              Rien à l’horizon. Une armée finira par se mettre en marche — plus tu t’entraînes, plus
              ta base prospère et plus elle attire —, mais tu ne sauras pas quand.
            </p>
            <p v-if="raidsReady && !tooEarlyForRaids" class="calm-watch">
              <template v-if="watchLevel">
                🗼 Ta <b>Tour de guet</b> te préviendra <b>{{ scoutLeadLabel }}</b> avant l’assaut.
              </template>
              <template v-else>
                🗼 Sans <b>Tour de guet</b>, tu les verras arriver au dernier moment. C’est elle qui
                achète du temps de réaction.
              </template>
            </p>
          </div>
          <div v-if="lastReport" class="panel">
            <div class="p-title">
              {{
                lastReport.held
                  ? '🏆 Dernier siège — repoussé'
                  : '💥 Dernier siège — enceinte forcée'
              }}
            </div>
            <p>
              {{ FACTION_EMOJI[lastReport.faction] }} {{ FACTION_LABEL[lastReport.faction] }} ·
              {{ lastReport.defeated }}/{{ lastReport.total }} groupes repoussés ·
              {{ lastReport.heroHome ? 'héros présent' : 'héros absent' }}
            </p>
            <!-- 🦴 LE BUTIN DES CORPS EST DANS LE RAPPORT (demandé) : il est crédité à
                 la résolution, il n’y a plus de fouille à venir chercher. Les corps ne
                 restent quelques heures que pour montrer la bataille. -->
            <div v-if="lastLootPills.length" class="scav-back">
              <div class="scav-title">🎒 Ramassé sur les corps</div>
              <div class="scav-pills">
                <span v-for="(b, i) in lastLootPills" :key="i" class="scav-pill">{{ b }}</span>
              </div>
            </div>
            <button class="cta ghost" @click="replaySiege">▶ Revoir l’assaut</button>
          </div>
        </template>

        <p v-if="lvlOf(defSel.id) >= heroLevel" class="s-cap">
          Plafonné par ton niveau de personnage — le sport reste le plafond.
        </p>

        <!-- 🏥 L’INFIRMERIE MONTRE SES BLESSÉS (demandé : « depuis l’infirmerie on voit les
             blessés et on peut payer en or pour les soigner »). Héros ET aventuriers —
             blessés en défense ou en convoi —, au même tarif que le héros. -->
        <div v-if="defSel.id === 'infirmary'" class="sh-garrison">
          <div class="sh-gtitle">🤕 Blessés — {{ patientCount }}</div>
          <p v-if="!patientCount" class="sh-gnote">
            Personne n’est alité. Un siège perdu envoie ici le héros s’il défendait et les
            aventuriers tombés ; une embuscade perdue, le blessé du convoi.
          </p>
          <div v-if="wounded" class="inf-row">
            <span class="inf-emo">🦸</span>
            <span class="inf-main">
              <span class="inf-name">Ton héros</span>
              <span class="inf-sub">sur pied {{ healIn }}</span>
            </span>
            <button class="inf-btn" :disabled="(char.row?.gold ?? 0) < healPrice" @click="doHeal">
              ⛑️ {{ fmtPow(healPrice) }} 🪙
            </button>
          </div>
          <div v-for="p in patients" :key="p.id" class="inf-row">
            <span class="inf-emo">{{ p.emoji }}</span>
            <span class="inf-main">
              <span class="inf-name">{{ p.name }}</span>
              <span class="inf-sub">sur pied {{ p.back }}</span>
            </span>
            <button
              class="inf-btn"
              :disabled="(char.row?.gold ?? 0) < p.cost"
              @click="doHealAdv([p.id])"
            >
              ⛑️ {{ fmtPow(p.cost) }} 🪙
            </button>
          </div>
          <button
            v-if="patients.length > 1"
            class="cta inf-all"
            :disabled="(char.row?.gold ?? 0) < patientsCost"
            @click="doHealAdv(patients.map((p) => p.id))"
          >
            ⛑️ Soigner tous les aventuriers · {{ fmtPow(patientsCost) }} 🪙
          </button>
          <p v-if="patientCount" class="sh-gnote">
            Attendre est gratuit : les soins n’achètent que l’immédiateté, et coûtent d’autant plus
            qu’il reste de repos.
          </p>
        </div>
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatDuration } from '@/lib/duration';
import { backOr } from '@/lib/nav';
import { useQuasar } from 'quasar';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { useGamePanel } from '@/composables/useGamePanel';
import VillagePlots from '@/components/VillagePlots.vue';
import GuildPanel from '@/components/GuildPanel.vue';
import SummonPanel from '@/components/SummonPanel.vue';
import { advAvailable, advRarity, advTitle, engageCap } from '@/lib/adventurers';
import { championPortrait } from '@/data/championPortraits';
import { RANK_COLOR } from '@/lib/items';
import SiegeStage from '@/components/SiegeStage.vue';
import {
  BUILD,
  buildingAccrued,
  buildingProdPerHour,
  buildingStorageCap,
  buildingType,
  collectable,
  emptySlotLocked,
  RESOURCE_EMOJI,
  type BuildResource,
} from '@/lib/buildings';
import {
  scoutLeadMs,
  DEFENSE_TYPES,
  FACTION_EMOJI,
  FACTION_LABEL,
  FACTION_LOOT,
  TURRET_SLOTS,
  defenseLevel,
  isDamaged,
  isRepairing,
  repairMsFor,
  battleLootPills,
  rushRepairCost,
  repairCost,
  fmtSpan,
  assaultEstimate,
  assaultPower,
  defenseBreakdown,
  guardUnits,
  rampartGuard,
  heroDefends,
  siegeHoldChance,
  defensePower,
  siegeOdds,
  ODDS_LABEL,
  scoutClarity,
  scoutLevel,
  scoutReport,
  turretCount,
  defenseReadiness,
  RAID,
  totalRepairCost,
  defenseUpgradeCost,
  defensePerLevelLabel,
  raidIntervalMs,
  isWounded,
  healCost,
  woundRemainingMs,
  advHealCost,
  woundedAdventurers,
  type DefenseId,
  type RaidReport,
  type ScoutReport,
} from '@/lib/raid';
import { usePush, pushSupported, type PushFail } from '@/composables/usePush';
import { fmtPow, type Combatant } from '@/lib/combat';
import { mulberry32 } from '@/lib/combat';
import { treePath } from '@/lib/expedition';
import { emptySeals, readyAscensions } from '@/lib/ascension';

const props = defineProps<{
  embedded?: boolean;
  inTab?: boolean;
  siege?: RaidReport | null;
  /** Le combattant du héros, tel qu'il défendra vraiment. Fourni par l'Aventure : le
   *  recalculer ici ferait deux vérités pour un seul chiffre. */
  hero?: Combatant | null;
  /** La silhouette du héros (pour le dessiner dans la cour du rejeu). Fournie par
   *  l'Aventure, comme pour le rejeu des failles. */
  heroProfile?: 'puissant' | 'agile' | 'polyvalent';
}>();
const emit = defineEmits<{ 'siege-seen': [] }>();
const inTab = computed(() => !!props.inTab);
const router = useRouter();
const $q = useQuasar();
const char = useCharacterStore();
const auth = useAuthStore();
const progress = useProgress();
const { gameBack, openPath } = useGamePanel();

function back() {
  if (props.embedded) gameBack();
  else backOr(router, '/aventure');
}
/** Sortir de la base → la carte des expéditions. En cockpit, elle prend le volet droit ;
 *  sinon c'est une route plein écran. */
/** Où se tiennent les trois champions du relais d'expédition : en file vers le panneau,
 *  le premier devant. ⚠️ Tous dans la cible tactile et loin du rempart. */
const CAMP_SPOTS = [
  { x: 32, y: 180 },
  { x: 44, y: 181.5 },
  { x: 55.5, y: 179.5 },
] as const;

/** Les champions dessinés au relais : les trois premiers du vivier, DISPONIBLES d'abord
 *  (ce sont eux qu'on peut envoyer). Complété de silhouettes s'il en manque. */
const expeParty = computed(() => {
  const now = coarseNow.value;
  const sorted = [...char.advList].sort(
    (a, b) => Number(advAvailable(b, now)) - Number(advAvailable(a, now)),
  );
  return CAMP_SPOTS.map((_, i) => {
    const a = sorted[i];
    if (!a) return { key: 'vide' + i, real: false, src: null, emoji: '🧑', color: '#6b5a40' };
    return {
      key: a.id,
      real: true,
      src: championPortrait(a.championId),
      emoji: advTitle(a)?.emoji ?? '🧑',
      color: RANK_COLOR[advRarity(a)],
    };
  });
});

function openMap() {
  openPath(router, '/expedition-map', props.embedded);
}

// Horloge : tout l'état de la base est dérivé de timestamps (aucun cron, hors-ligne).
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const heroLevel = computed(() => progress.global.value.level);
const base = computed(() => char.row?.base ?? null);
const defenses = computed(() => base.value?.defenses ?? []);
const raid = computed(() => base.value?.raid ?? null);
const field = computed(() => base.value?.field ?? null);
const freeze = computed(() => base.value?.freeze ?? null);
const lastReport = computed(() => base.value?.lastReport ?? null);
// 🔔 Notifications. ⚠️ Sur iOS, le push n'existe QUE si l'app a été ajoutée à l'écran
// d'accueil — d'où le message explicite plutôt qu'un bouton qui ne ferait rien.
const pushOk = pushSupported();
const { enabled: pushOn, busy: pushBusy, refresh: pushRefresh, enable, disable } = usePush();
const pushNote = ref('');
void pushRefresh();
/** ⚠️ CHAQUE issue a son message. Un bouton qui échoue en silence est le pire cas :
 *  à la livraison, cliquer ne produisait littéralement RIEN — ni invite, ni erreur.
 *  Les deux causes trouvées : une permission déjà refusée (le navigateur ne
 *  redemande alors plus rien) et `serviceWorker.ready` qui ne se résout jamais faute
 *  d'enregistrement actif. */
const PUSH_MSG: Record<PushFail, string> = {
  ok: '✅ C’est actif sur cet appareil.',
  unsupported: '⚠️ Ce navigateur ne gère pas les notifications.',
  denied: '⚠️ Permission refusée. Tu peux réessayer et accepter l’invite.',
  blocked:
    '⚠️ Les notifications sont BLOQUÉES pour ce site. Le navigateur ne redemandera plus : autorise-les dans ses réglages (🔒 dans la barre d’adresse).',
  no_sw:
    '⚠️ Service worker indisponible. Sur iPhone, ajoute d’abord l’app à ton écran d’accueil ; sinon recharge la page.',
  subscribe: '⚠️ L’abonnement a échoué. Recharge la page et réessaie.',
  db: '⚠️ L’appareil n’a pas pu être enregistré. Réessaie dans un instant.',
};
async function togglePush() {
  const uid = auth.user?.id;
  if (!uid) return;
  pushNote.value = '';
  if (pushOn.value) {
    await disable();
    return;
  }
  pushNote.value = PUSH_MSG[await enable(uid)];
}

const corpses = computed(() => field.value?.corpses ?? []);

const wallLevel = computed(() => defenseLevel(defenses.value, 'wall'));
const watchLevel = computed(() => defenseLevel(defenses.value, 'watchtower'));
// Les sièges ne s’allument qu’avec une enceinte PRÊTE (mur ET tourelles). On affiche le
// niveau requis plutôt que la part : c’est ce sur quoi le joueur peut agir.
const raidsReady = computed(
  () => defenseReadiness(defenses.value, heroLevel.value) >= RAID.enableShare,
);
const tooEarlyForRaids = computed(() => heroLevel.value < RAID.minRaidLevel);
const readyLevel = computed(() => Math.max(1, Math.ceil(heroLevel.value * RAID.enableShare)));
const wallDamaged = computed(() => isDamaged(defenses.value, 'wall'));
const watchDamaged = computed(() => isDamaged(defenses.value, 'watchtower'));
const turretsDamaged = computed(() => isDamaged(defenses.value, 'turret'));
const turretsBuilt = computed(() => turretCount(defenseLevel(defenses.value, 'turret')));
/** Créneaux : un merlon au MILIEU de chaque pan de mur, orienté comme lui — c'est ce qui
 *  fait lire « rempart » plutôt que « polygone ». */
const merlons = computed(() =>
  octagon.value.map((p, i) => {
    const q = octagon.value[(i + 1) % octagon.value.length]!;
    return {
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
      a: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
    };
  }),
);
const wounded = computed(() => isWounded(base.value, now.value));

/** ⚠️ SOURCE UNIQUE de « qui porte quoi », partagée par le panneau de forces et le
 *  combat : deux lectures différentes finiraient par se contredire. C’est le même objet
 *  que le store donne à `resolveRaid` (`escortKit`). Plus de familier ni de talent sur un
 *  champion (v0.996) : seulement ses pièces. */
const compCtx = computed(() => char.escortKit);
/** Ce que coûte le retour à la normale : remettre l'enceinte en état relance aussi la
 *  production (le gel est la conséquence de la casse, pas une punition séparée). */
const repairAllCost = computed(() => (base.value ? totalRepairCost(base.value) : 0));

// ── Rejeu du siège ──
/** Rapport en cours de rejeu. Posé par le parent à la résolution (`siege` prop) ou par
 *  le bouton « Revoir l'assaut ». */
const replay = ref<RaidReport | null>(null);
const siegeShown = computed(() => replay.value ?? props.siege ?? null);
/** ⚔️ Le héros dessiné dans la cour du rejeu — seulement s'il défendait. */
const siegeHero = computed(() =>
  siegeShown.value?.heroHome && props.heroProfile
    ? { profile: props.heroProfile, equipped: char.row?.equipped ?? {} }
    : null,
);
/** Défenseur → champion : la cour montre leur portrait. ⚠️ Le vivier d'AUJOURD'HUI, comme
 *  le reste du rejeu : un champion renvoyé depuis garde l'emoji de sa classe. */
const siegePortraits = computed<Record<string, string>>(() =>
  Object.fromEntries(char.advList.flatMap((a) => (a.championId ? [[a.id, a.championId]] : []))),
);
const siegeKey = ref(0);
const siegeOpen = computed({
  get: () => !!siegeShown.value,
  set: (v: boolean) => {
    if (!v) closeSiege();
  },
});
/** Le total effectivement appliqué au siège — plafonds compris. C'est le seul chiffre
 *  qui compte au moment de l'assaut, et il n'était affiché nulle part. */
function replaySiege() {
  if (!lastReport.value) return;
  siegeKey.value++;
  replay.value = lastReport.value;
}
function closeSiege() {
  replay.value = null;
  emit('siege-seen');
}

// ── Géométrie de l'enceinte : un octogone dont les 8 sommets sont les emplacements
// de tourelle. TURRET_SLOTS vaut 8 précisément pour que le compte tombe juste.
/** Rayon de l'enceinte. **La cour dicte les murs, pas l'inverse** : elle avait été portée
 *  à 80 pour loger 5 colonnes quand on comptait 10 emplacements ; il n'y en a plus que 7
 *  (autant que de types de bâtiments, cf. `BUILD.plotCap`), donc elle redescend à 72 —
 *  sinon l'enceinte enferme surtout du vide. Toute la géométrie qui s'y accroche (corps de
 *  garde, porte, cour) en est DÉRIVÉE : changer ce nombre suffit. */
const WALL_R = 72;
/** Distance du centre au MILIEU d'un pan. C'est elle — pas le rayon — qui borne la cour
 *  (le mur passe plus près au milieu d'un pan qu'à un sommet) et qui porte le corps de
 *  garde au nord comme la porte au sud. */
const APOTHEM = WALL_R * Math.cos(Math.PI / TURRET_SLOTS);
const WALL_TOP = 100 - APOTHEM;
const WALL_BOTTOM = 100 + APOTHEM;
const octagon = computed(() =>
  Array.from({ length: TURRET_SLOTS }, (_, i) => {
    // Décalage d'un DEMI-PAS (+π/8) : sans lui, un sommet tombe pile en haut et le
    // corps de garde s'y superposerait. Décalé, le haut de l'enceinte est un PAN de
    // mur, ce qui lui laisse la place.
    const a = (i / TURRET_SLOTS) * Math.PI * 2 - Math.PI / 2 + Math.PI / TURRET_SLOTS;
    // ⚠️ On garde l'ANGLE, pas seulement le point. C'est lui qui fait POINTER chaque
    // baliste vers l'extérieur : dessinées toutes dans le même sens, les 8 tourelles
    // ressemblaient à des cheminées posées sur un mur, pas à des pièces qui tirent.
    // L'art est dessiné « vers le haut » (−Y), d'où le +90°.
    return {
      x: 100 + Math.cos(a) * WALL_R,
      y: 100 + Math.sin(a) * WALL_R,
      rot: (a * 180) / Math.PI + 90,
    };
  }),
);
const turretLevel = computed(() => defenseLevel(defenses.value, 'turret'));
/** La porte : une arche percée au MILIEU du pan sud. Avec l'octogone décalé d'un demi-pas,
 *  les milieux de pans tombent pile au nord et au sud — le corps de garde en haut, la
 *  sortie en bas. */
const gatePath = computed(() => {
  const y = WALL_BOTTOM;
  return `M90 ${y + 6} L90 ${y - 2} A10 10 0 0 1 110 ${y - 2} L110 ${y + 6} Z`;
});
/** L'ouverture sombre sous l'arche, et ses deux vantaux entrouverts (perspective :
 *  chaque battant part du montant et rentre vers le fond). Tout dérivé du mur,
 *  sinon la porte se décroche au premier changement de rayon. */
const gateMouth = computed(() => {
  const y = WALL_BOTTOM;
  return `M93 ${y + 6} L93 ${y - 1} A7 7 0 0 1 107 ${y - 1} L107 ${y + 6} Z`;
});
const gateLeaf = (side: -1 | 1) => {
  const y = WALL_BOTTOM;
  const x0 = 100 + side * 7; // sur le montant
  const x1 = 100 + side * 2.4; // vers le fond, entrouvert
  return `M${x0} ${y - 1} L${x1} ${y + 1} L${x1} ${y + 6} L${x0} ${y + 6} Z`;
};
/** Le petit toit d'un pilier : un triangle centré sur `cx`, posé sur le haut du pilier. */
const pierCap = (cx: number) => {
  const y = WALL_BOTTOM - 12;
  return `M${cx - 4} ${y} L${cx} ${y - 4.5} L${cx + 4} ${y} Z`;
};
/** Les deux côtés de la porte, symétriques : calculés UNE fois (le template se re-rend
 *  à chaque tick, une fonction appelée depuis lui se réexécuterait à chaque image). */
const gateSides = ([-1, 1] as const).map((side) => ({
  side,
  pierX: 100 + side * 13.25 - 2.75,
  cap: pierCap(100 + side * 13.25),
  leaf: gateLeaf(side),
}));
/** La terre battue au pied des murs — et la limite en deçà de laquelle rien ne pousse. */
const EARTH_R = WALL_R + 15;
/** Largeur de la CHAUSSÉE, dehors comme dedans : le chemin de terre sort du cadre
 *  entre x=92 et x=108, et la rue de la cour reprend exactement la même emprise — sinon
 *  la route se rétrécirait ou s'élargirait en franchissant la porte. */
const GATE_HALF = 8;
/** Le chemin de terre qui part de la porte et sort du cadre par le sud, en s'évasant
 *  un peu (perspective). Ses ornières : deux lignes pointillées. */
const roadPath = computed(() => {
  const y = WALL_BOTTOM + 4;
  return `M92 ${y} C92 ${y + 12} 88 ${y + 22} 86 200 L114 200 C112 ${y + 22} 108 ${y + 12} 108 ${y} Z`;
});
const roadRuts = computed(() => {
  const y = WALL_BOTTOM + 15;
  return `M96.5 ${y} C96 ${y + 8} 94 ${y + 14} 93 200 M103.5 ${y} C104 ${y + 8} 106 ${y + 14} 107 200`;
});
/** Touffes d'herbe et taches de prairie, tirées UNE fois d'un générateur seedé
 *  (`mulberry32`, le PRNG du projet) : le dessin est le même à chaque ouverture — une
 *  base qui change d'herbe serait bizarre — et rien n'est posé sur la route ni sous
 *  l'enceinte. Coordonnées arrondies au dixième : sur un viewBox de 200, au-delà c'est
 *  du bruit qui alourdit chaque attribut `d`. */
const outsideWalls = (x: number, y: number) => Math.hypot(x - 100, y - 100) > EARTH_R - 3;
// ⚠️ Le relais du coin bas-gauche compte aussi : sans lui, des touffes d'herbe pousseraient
// au milieu de la caravane.
const onCamp = (x: number, y: number) => x < 72 && y > 158;
const onRoad = (x: number, y: number) =>
  (y > WALL_BOTTOM && Math.abs(x - 100) < 18) || onCamp(x, y);
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Sème `want` éléments par tirage-rejet dans le cadre (marge `pad`), hors enceinte et
 *  hors route. Une seule boucle pour les touffes et les taches. */
function scatter<T>(
  seed: number,
  want: number,
  pad: number,
  make: (x: number, y: number, rng: () => number) => T,
  avoid: (x: number, y: number) => boolean = () => false,
): T[] {
  const rng = mulberry32(seed);
  const out: T[] = [];
  for (let i = 0; i < want * 8 && out.length < want; i++) {
    const x = pad + rng() * (200 - 2 * pad);
    const y = pad + rng() * (200 - 2 * pad);
    if (!outsideWalls(x, y) || onRoad(x, y) || avoid(x, y)) continue;
    out.push(make(x, y, rng));
  }
  return out;
}
const tufts = scatter(4242, 44, 4, (x, y, rng) => {
  const h = r1(2.6 + rng() * 2.2);
  const X = r1(x);
  const Y = r1(y);
  return `M${X} ${Y} l-1.4 -${r1(h * 0.8)} M${X} ${Y} l0 -${h} M${X} ${Y} l1.4 -${r1(h * 0.8)}`;
});
const patches = scatter(1717, 9, 10, (cx, cy, rng) => ({
  cx: r1(cx),
  cy: r1(cy),
  rx: r1(7 + rng() * 9),
  ry: r1(3 + rng() * 4),
}));
/** Quelques arbres hors les murs (le même conifère que sur la carte) — jamais sur le
 *  panneau « Expéditions » ni devant le corps de garde. */
const trees = scatter(
  9091,
  8,
  9,
  (x, y, rng) => treePath(r1(x), r1(y), r1(1.5 + rng() * 0.8)),
  (x, y) => (y > WALL_BOTTOM + 4 && x > 104 && x < 156) || (y < WALL_TOP && Math.abs(x - 100) < 16),
);
const wallPoints = computed(() => octagon.value.map((p) => `${p.x},${p.y}`).join(' '));
const innerPoints = computed(() =>
  octagon.value.map((p) => `${100 + (p.x - 100) * 0.86},${100 + (p.y - 100) * 0.86}`).join(' '),
);

/** LA COUR. Deux rangées de bâtiments de PRODUCTION (les 7 emplacements du village,
 *  rapatriés de la carte) et une rangée de SERVICES (chenil, infirmerie, chantier).
 *  Chaque case est cliquable : c'est le dessin qui sert de sélecteur, comme l'anneau de
 *  la carte le faisait avant — emoji, pastille de niveau, point de récolte.
 *  ⚠️ Grille calée dans l'octogone INTÉRIEUR, dont ce qui compte n'est pas le rayon
 *  (72 × 0,86 ≈ 62) mais l'APOTHÈME — la distance au milieu d'un pan, soit ≈ 57,2.
 *  Une tuile est carrée : c'est son COIN qui touche le mur en premier, à
 *  √(dx²+dy²) + demi-diagonale (12,7). Le coin le plus éloigné tombe à 48,8 : la marge
 *  est confortable, elle l'était beaucoup moins avec 5 colonnes (61,4 pour 63,6). */
interface YardCell {
  key: string;
  /** Service de l'enceinte (chenil, infirmerie, chantier) plutôt qu'atelier de
   *  production : teinte « civile », pour qu'on lise deux quartiers et non dix carrés. */
  service?: boolean;
  x: number;
  y: number;
  emoji: string;
  built: boolean;
  locked: boolean;
  level: number;
  ready: boolean;
  damaged: boolean;
  /** Quelque chose est À FAIRE ici (des corps à fouiller, des fossoyeurs rentrés). */
  todo?: boolean;
  /** Demi-côté DESSINÉ. ⚠️ Porté par la cellule et non global : le Panthéon trône au
   *  centre et doit se voir comme tel — tout le reste de la cour garde `YARD_HALF`. */
  half: number;
  onClick: () => void;
}
// ── LA VILLE EN DEUX ANNEAUX ──────────────────────────────────────────────────
// Les ATELIERS contre les remparts (r = 43), autant que de types de bâtiments, les 3 SERVICES autour de la place
// centrale (r = 16), le cœur laissé LIBRE. Positions calculées, pas posées à l'œil :
// une recherche sur les deux rayons et l'orientation a retenu celle qui MAXIMISE
// l'écart minimum entre deux tuiles — **27,3 unités**, contre 20 pour la disposition
// en colonnes (où les cibles tactiles se touchaient). Le coin de tuile le plus éloigné
// tombe à 55,7 pour un apothème intérieur de 57,2.
// ⚠️ Contrainte tenue par la recherche : **aucun atelier dans les 24° autour du bas**,
// sinon un bâtiment se posait pile devant la porte. Les deux plus bas sont à x = 81 et
// 119, ce qui laisse le couloir d'entrée libre.
const RING = (n: number, r: number, off: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2 + off;
    return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r };
  });
/** Décalage angulaire qui met le MILIEU D’UN VIDE en bas de l’anneau, quel que soit le
 *  nombre d’emplacements → le couloir de la porte reste toujours dégagé, et il l’est au
 *  maximum possible (la moitié du pas angulaire).
 *  ⚠️ Les positions étaient calées sur SEPT emplacements avec un décalage de 0 ; passer à
 *  dix aurait posé une tuile pile devant la porte, et les trois surnuméraires se seraient
 *  empilées sur la dernière (le tableau était plus court que `plotCap`). La formule
 *  redonne exactement 0 pour 7 — donc la disposition actuelle est préservée — et 18° pour
 *  10. Ajouter un bâtiment replace la cour tout seul.
 *  Vérifié par recherche : à r = 43 et dix tuiles, l’écart minimum vaut 26,6 pour une cible
 *  tactile de 20, et le coin le plus éloigné 55,7 pour un apothème de 57,2. */
const gateOffset = (n: number) => {
  const step = (2 * Math.PI) / n;
  return (Math.PI * (n + 1)) / n - Math.round((n + 1) / 2) * step;
};
const PLOT_R = 43;
const PLOT_POS = RING(BUILD.plotCap, PLOT_R, gateOffset(BUILD.plotCap));
/** Les services occupent la rangée du bas ; la Tour de guet, elle, reste SUR le mur
 *  (c'est un ouvrage de rempart, pas un bâtiment de cour). */
const YARD_SERVICES: DefenseId[] = ['infirmary'];
// Services : ils encadrent la place. ⚠️ Le nombre de places est DÉRIVÉ de la liste —
// écrit en dur, il laissait un trou dans la cour le jour où l'une d'elles disparaît
// (le Chantier de fouille, retiré). Même règle que `PLOT_POS` avec le registre.
const SVC_R = 16;
const SVC_POS = RING(YARD_SERVICES.length, SVC_R, Math.PI);
/** Le cœur de la place, où trône le Panthéon une fois bâti. */
const YARD_CENTER = { x: 100, y: 100 };
const YARD_HALF = 9; // demi-côté DESSINÉ
/** 🛕 Le Panthéon est DESSINÉ PLUS GRAND (demandé) : 1,8× la largeur d'un atelier, 3,2× la
 *  surface. Il ouvre la boucle des champions, il trône déjà au centre — il devait se voir.
 *  ⚠️ MESURÉ, pas choisi au jugé (5 emplacements sur la couronne, r = 43) : à 16, il reste
 *  **7,8 unités** entre sa cible tactile et celle de l'atelier le plus proche, et ses coins
 *  tombent à 22,6 du centre pour une place pavée de rayon 29 — donc la place l'entoure
 *  encore. À 20 la place disparaît sous lui (0,7), à 22 il la déborde (−2,1).
 *  ⚠️ Cette taille ne s'applique QUE s'il est bâti : tant qu'il ne l'est pas, aucune
 *  cellule n'occupe le centre (les emplacements vides restent sur la couronne). */
const PANTHEON_HALF = 16;
// La cible tactile déborde le dessin d'une marge CONSTANTE, quelle que soit la taille de
// la tuile : ce qu'on gagne à toucher est le même partout, et l'écart mesuré entre deux
// tuiles voisines (7,8 au plus serré) l'absorbe sans chevauchement.
const HIT_PAD = 1;
const yard = computed<YardCell[]>(() => {
  const cells: YardCell[] = [];
  const bs = char.row?.buildings ?? [];
  // 🛕 LE PANTHÉON TRÔNE AU CENTRE (v0.1006, demandé : « centre le panthéon dans la base
  // et mets l'infirmerie où le panthéon était »). ⚠️ Permutation de DESSIN seulement : le
  // Panthéon garde son emplacement (`slot`) dans les données — le quota, le coût et
  // `canBuildOnSlot` n'en savent rien — et l'Infirmerie prend sa place sur la couronne.
  // Tant qu'il n'est pas bâti, rien ne bouge (le centre reste la place).
  const pantheonSlot = bs.find((b) => b.typeId === 'pantheon')?.slot ?? null;
  // Rangées 1-2 : les emplacements du village.
  // ⚠️ ON CONSTRUIT LÀ OÙ ON TOUCHE, PAS DANS L'ORDRE : un emplacement vide n'est plus
  // « verrouillé » par sa POSITION mais par le QUOTA (combien de bâtiments sont déjà
  // posés, où qu'ils soient) — `emptySlotLocked` est la même règle que dans
  // `VillagePlots.vue` et le store, pour qu'aucune copie ne diverge.
  for (let i = 0; i < BUILD.plotCap; i++) {
    const b = bs.find((x) => x.slot === i) ?? null;
    const pos = i === pantheonSlot ? YARD_CENTER : (PLOT_POS[i] ?? PLOT_POS[PLOT_POS.length - 1]!);
    cells.push({
      key: 'plot' + i,
      x: pos.x,
      y: pos.y,
      emoji: b ? (buildingType(b.typeId)?.emoji ?? '🏠') : '',
      built: !!b,
      locked: emptySlotLocked(i, bs, heroLevel.value),
      level: b?.level ?? 0,
      ready: b ? buildingAccrued(b, now.value) > 0 : false,
      damaged: false,
      // ⬆️ Le Panthéon s'allume quand une ascension est PAYABLE (champion ou pièce) : sans ce
      // signal, un champion bloqué au ★5 — dont les convois s'effondrent (v0.1017) — ne se
      // verrait qu'en ouvrant sa fiche.
      todo: b?.typeId === 'pantheon' && ascensionsReady.value > 0,
      half: i === pantheonSlot ? PANTHEON_HALF : YARD_HALF,
      onClick: () => (plotSlot.value = i),
    });
  }
  // Rangée 3 : les services de l'enceinte.
  YARD_SERVICES.forEach((id, i) => {
    const t = DEFENSE_TYPES.find((d) => d.id === id)!;
    const home =
      id === 'infirmary' && pantheonSlot !== null && PLOT_POS[pantheonSlot]
        ? PLOT_POS[pantheonSlot]
        : SVC_POS[i]!;
    cells.push({
      key: id,
      service: true,
      x: home.x,
      y: home.y,
      emoji: t.emoji,
      built: lvlOf(id) > 0,
      locked: heroLevel.value < t.unlockLevel,
      level: lvlOf(id),
      ready: false,
      damaged: damagedOf(id),
      // ⚠️ C'est le DESSIN qui alerte, depuis que les panneaux ont rejoint les feuilles
      // de leurs structures : sans ces signaux, une armée repérée ne se verrait plus
      // qu'en cliquant la bonne tuile.
      // ⚠️ Plus de cas `watchtower` ici : la Tour de guet n'est PAS une tuile de la cour
      // (c'est le corps de garde du rempart nord), donc sa condition ne s'évaluait
      // jamais — son alerte vit désormais sur son propre dessin (`.watch-alarm`), et le
      // champ `alert` de la tuile est retiré plutôt que laissé à `false` en dur.
      todo: id === 'infirmary' && patientCount.value > 0,
      half: YARD_HALF,
      onClick: () => openDef(id),
    });
  });
  return cells;
});

// ── Feuilles ouvertes depuis le dessin ──
const plotSlot = ref<number | null>(null);

// ── 🗿 Panthéon des champions ──
const guildOpen = ref(false);
/** Une seule feuille pour deux tuiles : on choisit la SECTION à l'ouverture. */
const guildSection = ref<'champions' | 'gear'>('champions');
function openGuild(section: 'champions' | 'gear' = 'champions') {
  guildSection.value = section;
  guildOpen.value = true;
}
const defOpen = ref<DefenseId | null>(null);
const defSel = computed(() => DEFENSE_TYPES.find((d) => d.id === defOpen.value) ?? null);
/** Ce qu’un niveau de plus apporte à CETTE structure. ⚠️ On passe l’intervalle RÉEL
 *  entre deux sièges : la convalescence en dépend, et sans lui l’Infirmerie
 *  promettrait un gain que le rythme d’entraînement annule déjà. */
function perLevel(id: DefenseId): string {
  return defensePerLevelLabel(id, lvlOf(id), {
    playerLevel: heroLevel.value,
    defenses: defenses.value,
    intervalMs: raidIntervalMs(progress.activeDaysInLast(7)),
  });
}
const defSheetOpen = computed({
  get: () => defOpen.value !== null,
  set: (v: boolean) => {
    if (!v) defOpen.value = null;
  },
});
function openDef(id: DefenseId) {
  plotSlot.value = null;
  defOpen.value = id;
}

// ── Renseignement ──
const EMPTY_SCOUT: ScoutReport = {
  clarity: 0,
  faction: null,
  size: null,
  avgLevel: null,
  hasChampion: null,
  groups: null,
  fullRead: false,
};
const scout = computed(() => (raid.value ? scoutReport(raid.value, clarity.value) : EMPTY_SCOUT));
const clarity = computed(() =>
  raid.value
    ? scoutClarity(
        scoutLevel(defenses.value),
        raid.value.level,
        heroLevel.value,
        // La graine du raid porte l’aléa du renseignement : même armée = même lecture,
        // mais on ne peut pas la prédire avant qu’elle apparaisse.
        raid.value.seed,
      )
    : 0,
);
/** 🛡️ Tuile Défense — TOUJOURS REPLIÉE à l'ouverture de la base (demandé). ⚠️ Elle n'est
 *  plus mémorisée : ouverte une fois, elle restait ouverte à chaque visite. Le résumé de la
 *  tuile repliée (`defSummary`) dit déjà le verdict. */
const defTileOpen = ref(false);
function toggleDefTile() {
  defTileOpen.value = !defTileOpen.value;
}
/** Ce que la tuile repliée doit DIRE : le verdict s'il y a une armée qu'on sait jauger,
 *  sinon qu'elle arrive sans qu'on sache la jauger, sinon le calme. */
const defSummary = computed(() => {
  if (raid.value && odds.value)
    return `${ODDS_LABEL[odds.value]} · ${holdPct(raidHold.value ?? 0)}`;
  if (raid.value) return '⚔️ Armée en vue';
  return '🕊️ Calme';
});
// ── 🎰 Tirage ──
const summonOpen = ref(false);
/** Deux replis de la tuile Défense, mémorisés PAR APPAREIL — un réglage d’affichage n’a
 *  rien à faire en base. Même traitement que la carte des mondes (v0.745). */
const partsOpen = ref(localStorage.getItem('muscu:base:parts') === '1');
const helpOpen = ref(localStorage.getItem('muscu:base:help') === '1');
function togglePartsOpen() {
  partsOpen.value = !partsOpen.value;
  try {
    localStorage.setItem('muscu:base:parts', partsOpen.value ? '1' : '0');
  } catch {
    /* privé */
  }
}
function toggleHelpOpen() {
  helpOpen.value = !helpOpen.value;
  try {
    localStorage.setItem('muscu:base:help', helpOpen.value ? '1' : '0');
  } catch {
    /* privé */
  }
}

/** 🔗 CE QUI DÉPEND DE QUOI. ⚠️ Écrit ici et NULLE PART AILLEURS : c'est la seule
 *  information de l'écran qu'aucune fonction du jeu ne porte — les dépendances entre
 *  bâtiments existent dans le CODE mais ne se
 *  déduisent d'aucune donnée. Un `Record` complet : ajouter une structure sans dire
 *  à quoi elle est liée ne compile plus. */
const STRUCTURE_LINK: Record<DefenseId, string> = {
  wall: 'Sans tourelles, aucun siège ne se déclenche : les deux vont ensemble.',
  turret:
    'Seule structure qui ABAT quelqu’un. Abritée par la Muraille : plus elle tient, plus elles tirent.',
  watchtower: 'Le préavis ne sert que si les 🔔 notifications sont actives.',
  infirmary: 'Soigne le héros ET les champions tombés au siège ou en convoi.',
};
/** Ce qu'apporte le PROCHAIN niveau de chaque structure — par `defensePerLevelLabel`,
 *  la fonction du jeu : un texte recopié finirait par mentir. */
const structureHelp = computed(() =>
  DEFENSE_TYPES.map((t) => ({
    id: t.id,
    emoji: t.emoji,
    label: t.label,
    level: lvlOf(t.id),
    next: defensePerLevelLabel(t.id, lvlOf(t.id), {
      playerLevel: heroLevel.value,
      defenses: defenses.value,
      intervalMs: raidIntervalMs(progress.activeDaysInLast(7)),
    }),
    link: STRUCTURE_LINK[t.id],
  })),
);

// ─── ⚖️ RAPPORT DE FORCES ─────────────────────────────────────────────────────
// ⚠️ Ce que l'écran ne disait NULLE PART : ce que l'enceinte, les champions et
// le héros apportent, et à quoi ça se compare. On assignait donc à l'aveugle, et la
// stratégie sûre était de tout garder à la maison — du temps de carte perdu sans savoir
// s'il servait. Toute la logique vit dans `raid.ts` (pure, testée, vérifiée par
// mutation) : l'écran ne fait que la peindre.

/** Le héros défend-il ? ⚠️ On APPELLE `heroIsHome` du store au lieu de recopier sa
 *  condition : c'est lui qui décide au moment du siège, et le jour où « rentrer » gagne
 *  une condition (blessure, convoi), le panneau suivrait sans qu'on y pense. Une copie
 *  aurait été la 3ᵉ du même prédicat — exactement ce que ce chantier corrige ailleurs. */
const heroHome = computed(() => !!char.row && char.heroIsHome(char.row));
/** ⚠️ MAIS « dehors » ne veut pas dire « absent au combat » : s’il rentre AVANT que
 *  l’armée ne frappe, il sera derrière les murs (signalé par l’utilisateur — « il
 *  arrive dans 1 h et l’attaque dans 2 h »). La règle vit dans `heroDefends`, la même
 *  que celle de l’écran d’envoi : la défense qui compte est celle du MOMENT OÙ L’ARMÉE
 *  FRAPPE. La RÉSOLUTION était déjà juste ; seul le panneau était pessimiste. */
const heroBack = computed(() =>
  heroDefends(heroHome.value, char.row?.expedition?.returnAt, raid.value?.arrivesAt),
);
const heroForDefense = computed(() => (heroBack.value ? (props.hero ?? null) : null));
/** LA GARNISON PRÉSENTE : les aventuriers qui ne sont ni en convoi, ni à l’infirmerie,
 *  avec leur équipement. ⚠️ Construite par `guardUnits`,
 *  la MÊME fonction que le store donne à `resolveRaid` : le panneau et la bataille ne
 *  peuvent pas se contredire. */
/** Les aventuriers qui tiendraient la brèche MAINTENANT. Nommés une seule fois : le
 *  renseignement, le panneau et le combat doivent parler des mêmes.
 *  ⚠️ COUPÉS au plafond du Panthéon (`rampartGuard`), comme le fait le store avant la
 *  bataille : sans ça, l'écran listerait des défenseurs que le combat ne retient pas. */
const guardAdvs = computed(() =>
  rampartGuard(
    char.advList.filter((a) => advAvailable(a, coarseNow.value)),
    engageCap(char.pantheonLevel),
    compCtx.value,
  ),
);
const guardNow = computed(() =>
  guardUnits(heroLevel.value, guardAdvs.value, engageCap(char.pantheonLevel), compCtx.value),
);
/** LA GARNISON AU COMPLET : tout le vivier, blessés compris — ils rentreront. C’est un
 *  PLAFOND, pas une prévision, et c’est précisément ce qu’on abandonne en envoyant
 *  quelqu’un ailleurs. */
const guardFull = computed(() =>
  guardUnits(heroLevel.value, char.advList, engageCap(char.pantheonLevel), compCtx.value),
);
/** ⚠️ LE PANNEAU SE MESURE UNE FOIS PAR MINUTE, pas à chaque seconde. Le Monte-Carlo
 *  coûte ~66 ms (5 ablations), et la garnison ne dépend de `now` que par les disponibilités
 *  des champions (convois, infirmerie). Le brancher
 *  sur le tick d’une seconde referait 66 ms de travail identique 60 fois par minute. */
const coarseNow = computed(() => Math.floor(now.value / 60_000) * 60_000);
const forces = computed(() =>
  defenseBreakdown(
    defenses.value,
    heroLevel.value,
    heroForDefense.value,
    guardNow.value,
    coarseNow.value,
  ),
);
/** En pourcentage, la seule forme lisible : « 72 % » plutôt que « 0,72 ». */
const holdPct = (h: number) => `${Math.round(h * 100)} %`;
/** ⚠️ « RIEN NE SUFFIT » ET « TOUT SUFFIT » SE LISENT PAREIL DANS LES CHIFFRES : quand
 *  la tenue sature, toutes les parts tombent à 0 — soit parce qu’on tient de toute
 *  façon, soit parce que rien n’y changerait rien. Les deux sont vrais et actionnables,
 *  mais opposés : il faut le DIRE, sinon un joueur bien équipé et un joueur dépassé`
 *  voient la même colonne de zéros. */
const holdNote = computed(() => {
  const h = forces.value.hold;
  if (h >= 0.99) return 'Ta base tient face à une armée type — au-delà, tu investis dans la marge.';
  if (h <= 0.01)
    return 'Aucune structure seule ne renverserait ça : il faut monter l’enceinte, pas la réarranger.';
  return null;
});
/** Ce que vaudrait la défense si TOUT LE MONDE était là — héros compris. Même repère
 *  que `forces`, sinon l’écart comparerait deux choses différentes. */
/** ⚠️ EN PUISSANCE, pas en tenue : l’écart doit rester lisible même quand on tient à
 *  100 % des deux côtés — sinon « ce qui est dehors » annonce −0 alors qu’il manque du
 *  monde. Même unité que le chiffre de tête, donc les deux se comparent. */
const forcesFull = computed(() =>
  defensePower(defenses.value, heroLevel.value, props.hero ?? null, guardFull.value),
);
/** L’écart : ce que coûte, en puissance de défense, le fait d’avoir des gens dehors.
 *  ⚠️ Affiché seulement s’il est RÉEL — annoncer « −0 » à un joueur dont tout le monde
 *  est à la maison serait du bruit. */
const forcesGap = computed(() => Math.max(0, forcesFull.value - forces.value.power));
const assault = computed(() => (raid.value ? assaultPower(raid.value) : 0));
/** Ce que l'ESPIONNAGE laisse voir de l'armée : une fourchette qui se resserre à mesure
 *  que la Tour monte, et qui contient TOUJOURS la vérité. */
const assaultSeen = computed(() =>
  raid.value ? assaultEstimate(assault.value, clarity.value, raid.value.seed) : null,
);
/** Le pronostic — sur la vraie valeur, pas sur la fourchette : c'est l'ISSUE qui est
 *  annoncée, pas ce qu'on croit savoir. ⚠️ Quand on ne voit rien (clarté 0), on n'affiche
 *  pas de pronostic du tout : deviner à la place du joueur serait lui vendre gratuitement
 *  ce que la Tour de guet fait payer. */
/** Le rapport de forces, calculé UNE fois : la jauge et le pronostic le lisent tous
 *  deux. Ils portaient chacun leur garde et leur quotient, et le repli de la jauge était
 *  mort (elle n'est rendue que lorsque le pronostic existe). */
/** LE PRONOSTIC porte sur l’ARMÉE QUI ARRIVE — mesuré sur le vrai moteur, donc il ne
 *  peut pas diverger de la bataille. ⚠️ Gaté par la clarté : sans renseignement on
 *  n’annonce RIEN, sinon on offrirait gratuitement ce que la Tour de guet fait payer. */
const raidHold = computed(() =>
  raid.value && assaultSeen.value?.known
    ? siegeHoldChance(
        defenses.value,
        heroLevel.value,
        heroForDefense.value,
        guardNow.value,
        raid.value,
      )
    : null,
);
const odds = computed(() => (raidHold.value === null ? null : siegeOdds(raidHold.value)));
const scoutHint = computed(() => {
  if (!watchLevel.value) return 'Sans Tour de guet, tu ne sais rien de ce qui arrive.';
  if (clarity.value >= 5)
    return 'Ta tour lit l’armée à livre ouvert — l’issue, elle, se joue au mur.';
  return 'Monte la Tour de guet pour en savoir plus — et être prévenu plus tôt.';
});

/** Pronostic : Monte-Carlo seedé sur les défenses RÉELLES, comme le 🎯 % des donjons.
 *  Réservé à la clarté maximale : c'est la dernière chose que le renseignement achète. */

// ── Compteurs ──
/** ⚠️ Le FORMAT vient de la lib (`formatDuration`) : quatre copies de la même fonction
 *  vivaient dans l'app, et aucune ne connaissait les JOURS — or le gel de production et
 *  la péremption du champ de bataille atteignent 24 h. Ce qui reste ICI, c’est ce qui
 *  appartient à un DÉLAI : le préfixe, et le fait qu’un délai échu se dise « maintenant »
 *  plutôt que « 0 min ». */
function fmtDelay(ms: number): string {
  if (ms <= 0) return 'maintenant';
  return `dans ${formatDuration(ms)}`;
}
const arriveIn = computed(() => (raid.value ? fmtDelay(raid.value.arrivesAt - now.value) : ''));
/** Le préavis que la Tour donnera — la SEULE chose qu'on ait le droit d'annoncer avant
 *  qu'une armée soit repérée. `nextRaidIn` (le compte à rebours vers l'assaut) a été
 *  retiré : il rendait gratuit ce que ce bâtiment fait payer. */
const scoutLeadLabel = computed(() => {
  const ms = scoutLeadMs(scoutLevel(defenses.value), raidIntervalMs(progress.activeDaysInLast(7)));
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) : ''}`;
});
const freezeIn = computed(() => (freeze.value ? fmtDelay(freeze.value.until - now.value) : ''));
const healIn = computed(() =>
  base.value?.wound ? fmtDelay(base.value.wound.until - now.value) : '',
);
/** Prix des soins ∝ au repos restant : écourter la fin est une bricole, sauter toute la
 *  convalescence se paie. Attendre reste gratuit — on n'achète que l'immédiateté. */
const healPrice = computed(() =>
  healCost(woundRemainingMs(base.value, now.value), heroLevel.value),
);
/** Les aventuriers alités, avec leur prix de soins (même tarif que le héros). */
const patients = computed(() =>
  woundedAdventurers(char.advList, now.value).map((a) => ({
    id: a.id,
    name: a.name,
    emoji: advTitle(a)?.emoji ?? '🧑',
    back: fmtDelay((a.hurtUntil ?? 0) - now.value),
    cost: advHealCost(a, now.value, heroLevel.value),
  })),
);
const patientsCost = computed(() => patients.value.reduce((s, p) => s + p.cost, 0));
const patientCount = computed(() => patients.value.length + (wounded.value ? 1 : 0));
const ascensionsReady = computed(() =>
  readyAscensions(char.advList, char.advGearStock, {
    pantheonLevel: char.pantheonLevel,
    seals: char.row?.seals ?? emptySeals(),
    gold: char.row?.gold ?? 0,
  }),
);
/** 🦴 Ce que le dernier assaut a rapporté — posé à la résolution, jamais recalculé
 *  ici, et mis en forme par la LIB : l'écran de fin du rejeu affiche exactement les
 *  mêmes puces, et deux copies divergeraient au premier ajout de devise. */
const lastLootPills = computed(() => battleLootPills(base.value?.lastLoot));

// ── Structures ──
function lvlOf(id: DefenseId): number {
  return defenseLevel(defenses.value, id);
}
function damagedOf(id: DefenseId): boolean {
  return isDamaged(defenses.value, id);
}
function upCost(id: DefenseId): number {
  return defenseUpgradeCost(Math.max(1, lvlOf(id)));
}
function rushCost(id: DefenseId): number {
  return rushRepairCost(repairLeft(id), heroLevel.value);
}
function canBuild(id: DefenseId): boolean {
  const t = DEFENSE_TYPES.find((x) => x.id === id);
  const c = char.row;
  if (!t || !c) return false;
  return heroLevel.value >= t.unlockLevel && c.gold >= t.buildGold;
}
function canUpgrade(id: DefenseId): boolean {
  const c = char.row;
  if (!c || lvlOf(id) >= heroLevel.value) return false;
  return c.gold >= upCost(id);
}
function canRepair(id: DefenseId): boolean {
  return repairLeft(id) <= 0 && (char.row?.gold ?? 0) >= repairCost(lvlOf(id));
}

async function guard(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  }
}
const uid = computed(() => auth.user?.id ?? '');
const doBuild = (id: DefenseId) =>
  guard(async () => {
    await char.buildDefense(uid.value, id, heroLevel.value, Date.now());
    defOpen.value = null;
  });
const doUpgrade = (id: DefenseId) =>
  guard(() => char.upgradeDefense(uid.value, id, heroLevel.value, Date.now()));
const doRepair = (id: DefenseId) => guard(() => char.repairDefense(uid.value, id, Date.now()));
const doRepairAll = () =>
  guard(async () => {
    const cost = await char.repairAll(uid.value, Date.now());
    if (cost)
      $q.notify({
        type: 'positive',
        message: '🔧 Travaux lancés — la production repart à la fin.',
      });
  });
const doFinishRepair = (id: DefenseId) =>
  guard(() => char.finishRepair(uid.value, id, Date.now(), heroLevel.value));
/** Temps de travaux restant sur une structure, 0 si aucun chantier en cours. */
function repairLeft(id: DefenseId): number {
  const d = defenses.value.find((x) => x.typeId === id);
  return isRepairing(d, now.value) ? d!.repairUntil! - now.value : 0;
}
const doHeal = () =>
  guard(async () => {
    const cost = await char.healHero(uid.value, Date.now(), heroLevel.value);
    if (cost) $q.notify({ type: 'positive', message: '⛑️ Ton héros est de nouveau sur pied.' });
  });
const doHealAdv = (ids: string[]) =>
  guard(async () => {
    const cost = await char.healAdventurers(uid.value, ids, Date.now(), heroLevel.value);
    if (cost)
      $q.notify({
        type: 'positive',
        message: ids.length > 1 ? '⛑️ Tes champions sont sur pied.' : '⛑️ De nouveau sur pied.',
      });
  });
/** RÉCOLTE des bâtiments — ce que la barre du haut affiche.
 *
 *  ⚠️ Tout est DÉRIVÉ de `buildings.ts` (`collectable`, `buildingProdPerHour`,
 *  `RESOURCE_EMOJI`) : aucune formule n'est réécrite ici, sinon l'affichage finirait par
 *  mentir sur ce que la récolte crédite vraiment. Une seule ressource par bâtiment, mais
 *  plusieurs bâtiments peuvent produire la même — on cumule par ressource.
 *
 *  Le stock en attente est ce qu'un siège perdu VOLE (`stockStolen`) : le montrer en tête
 *  d'écran, c'est montrer ce qu'on risque à ne pas passer. */
const prodPills = computed(() => {
  const bs = char.row?.buildings ?? [];
  // ⚠️ `now` (horloge réactive de la page) et non `Date.now()` : dans un computed, ce
  // dernier ne serait lu qu’une fois et le stock en attente resterait figé à l’écran.
  const ready = collectable(bs, now.value);
  const rate = new Map<string, number>();
  const cap = new Map<string, number>();
  for (const b of bs) {
    const t = buildingType(b.typeId);
    if (!t?.resource) continue;
    rate.set(t.resource, (rate.get(t.resource) ?? 0) + buildingProdPerHour(b));
    // ⚠️ La capacité vient de `buildingStorageCap`, jamais recalculée ici : c'est elle
    // qui plafonne réellement `buildingAccrued`. Une capacité affichée « à peu près »
    // mentirait exactement au moment où elle compte — quand on sature.
    cap.set(t.resource, (cap.get(t.resource) ?? 0) + buildingStorageCap(b));
  }
  return [...rate.entries()].map(([res, r]) => {
    const n = ready[res as BuildResource] ?? 0;
    const max = Math.floor(cap.get(res) ?? 0);
    // SATURÉ = les bâtiments tournent dans le vide depuis un moment. C’est la seule vraie
    // urgence de cet écran : tout ce qu’ils produisent est perdu tant qu’on ne ramasse pas.
    const full = max > 0 && n >= max;
    return {
      res,
      emoji: RESOURCE_EMOJI[res as BuildResource] ?? '✨',
      ready: n,
      max,
      full,
      rate: r.toFixed(1),
      title: `${n} / ${max} stockables · ${r.toFixed(1)}/h${
        full ? ' — STOCK PLEIN, la production est perdue.' : ''
      } Un siège perdu vole ce qui n’est pas ramassé.`,
    };
  });
});
const anyReady = computed(() => prodPills.value.some((p) => p.ready > 0));
function doHarvest() {
  if (!anyReady.value) return;
  void guard(async () => {
    await char.collectFilons(uid.value, Date.now());
    $q.notify({ type: 'positive', message: '🧺 Récolte encaissée.' });
  });
}
</script>

<style scoped>
.base-page {
  padding: 0 12px 28px;
}
/* En onglet, la page parente porte déjà les gouttières et le défilement. */
.base-page.in-tab {
  padding: 0 0 12px;
}
.base-page.embedded {
  min-height: 0;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  letter-spacing: 0.4px;
}
.iconbtn {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.bar-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
}
/* Pastilles de RÉCOLTE. Au repos elles informent (stock / débit) ; dès qu'il y a
   quelque chose à prendre, elles s'allument et deviennent cliquables — le geste est
   là où l'information est, sans détour par une autre vue. */
.bar-chip.prod {
  font: inherit;
  font-size: 12px;
  color: var(--dim);
  cursor: default;
  font-variant-numeric: tabular-nums;
}
.bar-chip.prod small {
  opacity: 0.55;
  margin-left: 2px;
}
.bar-chip.prod.full {
  color: #ff6a45;
  border-color: #ff6a45;
  cursor: pointer;
}
.bar-chip.prod.ready {
  color: var(--text);
  border-color: var(--accent, #ffd23f);
  cursor: pointer;
}
.bar-chip.harvest {
  font: inherit;
  font-size: 12px;
  background: var(--accent, #ffd23f);
  border-color: var(--accent, #ffd23f);
  color: #15120e;
  font-weight: 600;
  cursor: pointer;
}
.bar-chip.dim {
  color: var(--dim);
}

/* ── Enceinte ── */
.keep-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 6px;
  margin-bottom: 12px;
}
.keep {
  width: 100%;
  display: block;
  border-radius: 10px;
}
/* ── L'enceinte ── */
.wall {
  fill: #2a231a;
  stroke: #7a6a4f;
  stroke-width: 8;
  stroke-linejoin: round;
}
.wall.absent {
  stroke: #3a332a;
  stroke-dasharray: 6 6;
  fill: #1d1913;
}
.wall.damaged {
  stroke: #ff6a45;
  stroke-dasharray: 16 8;
}
.wall,
.merlon,
.courtyard {
  pointer-events: none; /* purement peints : la capture se fait par .wall-hit */
}
.wall-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 16;
  pointer-events: stroke;
  cursor: pointer;
}
.tur-hit {
  fill: transparent; /* transparent SE clique ; `none` non */
}
.merlon {
  fill: #7a6a4f;
}
.merlon.absent {
  fill: #3a332a;
}
.merlon.damaged {
  fill: #ff6a45;
}
.courtyard {
  fill: #332b1e;
  stroke: #453b2c;
  stroke-width: 1.5;
}
/* Tourelles */
/* ── Baliste ──────────────────────────────────────────────────────────────
   Pièce de siège, pas tourelle d'habitation : plateforme, arc, trait engagé.
   Les couleurs restent celles de la pierre et du bois de l'enceinte. */
.tur-base {
  fill: #9a8768;
  stroke: #4a3d2b;
  stroke-width: 1;
}
.tur-bow {
  fill: none;
  stroke: #d8c9a4;
  stroke-width: 2.4;
  stroke-linecap: round;
}
.tur-string {
  fill: none;
  stroke: #8a7856;
  stroke-width: 0.9;
}
.tur-bolt {
  stroke: #f3eee6;
  stroke-width: 2;
  stroke-linecap: round;
}
/* Pointe en jaune voltage : le seul accent de l'enceinte, et il dit « armé ». */
.tur-head {
  fill: #ffd23f;
}
/* Endommagée : la pièce rougeoie, l'arc est rompu (traits interrompus). */
.damaged .tur-base {
  fill: #6b4234;
  stroke: #ff6a45;
}
.damaged .tur-bow {
  stroke: #ff6a45;
  stroke-dasharray: 3 2.5;
}
.damaged .tur-string {
  stroke: #ff6a45;
  opacity: 0.5;
}
.damaged .tur-bolt,
.damaged .tur-head {
  opacity: 0.35;
}
.tur-empty {
  fill: none;
  stroke: #4a4133;
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}
.sh-note {
  font-size: 12px;
  color: var(--accent, #ffd23f);
  margin-top: 4px;
}
/* Tour de guet */
.watch-body,
.watch-crown {
  fill: #9a8760;
  stroke: #5a4c36;
  stroke-width: 1;
}
.watch-body.damaged,
.watch-crown.damaged {
  fill: #6b4234;
  stroke: #ff6a45;
}
.watch-mast {
  fill: #5a4c36;
}
.watch-flag {
  fill: var(--accent, #ffd23f);
}
.watch-eye {
  fill: var(--accent, #ffd23f);
  opacity: 0.85;
}
/* Bâtiments de service */
/* ── La cour : chaque bâtiment est une TUILE cliquable ── */
.hit {
  cursor: pointer;
  /* Pas de rectangle de surbrillance au toucher (mobile) : il encadrait tout le groupe SVG,
     bien au-delà du dessin, et se lisait comme un bug. */
  -webkit-tap-highlight-color: transparent;
}
.yard-ground {
  fill: #221c14;
  stroke: #3a3125;
  stroke-width: 1;
  pointer-events: none;
}
/* LES RUES. Le pavé est plus CLAIR que la terre de la cour : c'est ce contraste seul
   qui dessine la voirie — pas de bordure, qui se couperait à chaque croisement. */
.pave {
  fill: none;
  stroke: url(#cobble);
  pointer-events: none;
}
.pave-fill {
  fill: url(#cobble);
  pointer-events: none;
}
.yard.svc .yard-pad {
  fill: #33302a;
  stroke: #5d6168;
}
.yard-hit {
  fill: transparent;
}
.yard-pad {
  fill: #3d3324;
  stroke: #5a4c36;
  stroke-width: 1.5;
}
.yard.empty .yard-pad {
  fill: #241f18;
  stroke: #4a4133;
  stroke-dasharray: 3 3;
}
.yard.ready .yard-pad {
  stroke: var(--accent, #ffd23f);
}
.yard.broken .yard-pad {
  stroke: #ff6a45;
}
.yard-emo {
  font-size: 12px;
  text-anchor: middle;
}
.yard-plus {
  font-size: 13px;
  text-anchor: middle;
  fill: var(--dim);
}
.yard-ready {
  fill: var(--accent, #ffd23f);
}
/* Pastille de niveau, lisible sur n'importe quel fond */
.lvl-badge circle {
  fill: #14110c;
  stroke: var(--accent, #ffd23f);
  stroke-width: 1.2;
}
.lvl-badge text {
  font-size: 7px;
  text-anchor: middle;
  fill: var(--accent, #ffd23f);
  font-weight: 700;
}
/* « À monter » : la structure est sous le niveau du joueur. Orange (d3), pas rouge —
   ce n'est pas une alerte, c'est une marge qu'on laisse dormir. */
.lvl-badge.upgrade circle {
  stroke: #ffb23f;
  stroke-dasharray: 3 2;
}
.lvl-badge .lvl-up {
  font-size: 7.5px;
  fill: #ffb23f;
  animation: lvl-up-nudge 1.8s ease-in-out infinite;
}
@keyframes lvl-up-nudge {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-1.2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lvl-badge .lvl-up {
    animation: none;
  }
}
.wall-lvl {
  pointer-events: none; /* le clic passe à la bande de la muraille, dessous */
}
/* Emplacement de structure encore vide (corps de garde) */
/* La porte : une arche sombre percée dans le rempart, avec sa flèche de sortie. */
/* ── Le terrain ── */
.patch {
  fill: #3a4b22;
  opacity: 0.8;
}
.tuft {
  fill: none;
  stroke: #7d9a45;
  stroke-width: 0.9;
  stroke-linecap: round;
}
.tree {
  fill: #2e4a24;
  stroke: #1d3016;
  stroke-width: 0.5;
  stroke-linejoin: round;
}
.road {
  fill: #5c4a32;
  stroke: #3f3220;
  stroke-width: 0.6;
}
.road-ruts {
  fill: none;
  stroke: #3f3220;
  stroke-width: 0.8;
  stroke-dasharray: 3 3;
  stroke-linecap: round;
}
/* ── Le campement de départ (coin bas-gauche) ── */
.camp-ground {
  fill: #4b3c28;
  opacity: 0.55;
}
.sign-post {
  fill: #6b5a40;
  stroke: #4a3d2b;
  stroke-width: 0.6;
}
/* Le panneau doit se voir d'un coup d'œil sur la prairie : bois clair, liseré accent,
   halo sombre dessous pour le détacher du vert, et une lueur qui respire. */
.sign-board {
  fill: #e2c386;
  stroke: var(--accent, #ffd23f);
  stroke-width: 1.1;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 1.6px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 2.4px rgba(255, 210, 63, 0.55));
  animation: signGlow 2.4s ease-in-out infinite;
}
@keyframes signGlow {
  50% {
    filter: drop-shadow(0 0 1.6px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 4px rgba(255, 210, 63, 0.9));
  }
}
.sign-ico {
  font-size: 8px;
  text-anchor: middle;
}
.march {
  animation: march 1.1s ease-in-out infinite alternate;
}
@keyframes march {
  to {
    transform: translateY(-1.1px);
  }
}
.march.ghost {
  opacity: 0.45;
}
.march-shadow {
  fill: rgba(0, 0, 0, 0.35);
}
.march-bg {
  fill: #221c14;
}
.march-emo {
  font-size: 7px;
  text-anchor: middle;
}
/* Liseré à la couleur de la rareté du champion — la même que partout ailleurs. */
.march-rim {
  fill: none;
  stroke: var(--rk);
  stroke-width: 1.3;
}
@media (prefers-reduced-motion: reduce) {
  .march,
  .sign-board {
    animation: none;
  }
}
/* Le libellé du relais, même rôle que celui au bord de la route : dire où mène ce départ. */
.camp-label {
  fill: var(--accent, #ffd23f);
  font-family: var(--font-display, Oswald, sans-serif);
  font-size: 7.5px;
  font-weight: 700;
  text-anchor: middle;
  letter-spacing: 0.02em;
}
/* ⚠️ `:focus` et non seulement `:focus-visible` : au clic, certains navigateurs posent le
   contour de focus (blanc) autour de la boîte ENTIÈRE du groupe. Le clavier garde son
   retour, en accent sur la caravane (ci-dessous). */
.hit.camp:focus {
  outline: none;
}
.hit.camp:focus-visible .sign-board,
.hit.camp:hover .sign-board {
  stroke-width: 1.6;
}

/* ── La porte ── */
.gate-hit {
  fill: transparent; /* transparent SE clique ; `none` non */
}
.gate-pier {
  fill: #8a7856;
  stroke: #5a4c36;
  stroke-width: 1;
}
.gate-cap {
  fill: #6b5a40;
  stroke: #4a3d2b;
  stroke-width: 0.8;
  stroke-linejoin: round;
}
.gate-arch {
  fill: #8a7856;
  stroke: #5a4c36;
  stroke-width: 1.5;
}
.gate-mouth {
  fill: #0f0c08;
}
.gate-leaf {
  fill: #6e4a2a;
  stroke: #3d2814;
  stroke-width: 0.7;
  stroke-linejoin: round;
}
.gate-bridge rect {
  fill: #7a5a36;
  stroke: #4a3620;
  stroke-width: 0.8;
}
.gate-bridge line {
  stroke: #4a3620;
  stroke-width: 0.6;
}
.slot-empty {
  fill: #241f18;
  stroke: #4a4133;
  stroke-width: 1.6;
  stroke-dasharray: 4 3;
}
.corpse {
  font-size: 11px;
  opacity: 0.9;
}
.corpse.champ {
  font-size: 15px;
}
.keep-hint {
  margin: 2px 0 4px;
  font-size: 11px;
  color: var(--dim);
  text-align: center;
  font-style: italic;
}
.sh-gsum {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.sh-gchip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.fam-eff {
  font-size: 12.5px;
  color: var(--accent);
}
/* Le gain du prochain niveau : accent, parce que c’est sur ce chiffre qu’on décide. */
.sh-gain {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--accent, #ffd23f);
}
.sh-garrison {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.inf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 4px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}
.inf-emo {
  font-size: 22px;
}
.inf-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.inf-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inf-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.inf-btn {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--accent, #ffd23f) 12%, transparent);
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}
.inf-btn:disabled {
  opacity: 0.45;
}
.inf-all {
  margin-top: 10px;
  width: 100%;
}
.btn.full {
  width: 100%;
  margin-bottom: 8px;
}
.sh-gtitle {
  font-weight: 700;
  margin-bottom: 4px;
}
.sh-gnote {
  font-size: 12px;
  color: var(--dim);
  margin: 0 0 8px;
}
/* Carte d’entrée de la Guilde : une ligne cliquable, pas un panneau de plus. */
.guild-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  color: var(--text);
  min-height: 44px;
  cursor: pointer;
}
.ge-emo {
  font-size: 24px;
}
.ge-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ge-title {
  font-weight: 600;
  font-size: 14.5px;
}
.ge-sub {
  font-size: 12px;
  color: var(--dim);
}
.ge-badge {
  background: var(--accent);
  color: #15120e;
  border-radius: 10px;
  padding: 2px 7px;
  font-size: 12px;
  font-weight: 700;
}
.ge-go {
  color: var(--dim);
  font-size: 20px;
}
.def-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 14px;
  color: var(--text);
}
.def-sheet .sh-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.def-sheet .sh-emo {
  font-size: 26px;
}
.def-sheet .sh-main {
  flex: 1;
  min-width: 0;
}
.def-sheet .sh-title {
  font-size: 16px;
}
.def-sheet .sh-sub {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
}
.def-sheet .sh-x {
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 18px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}
/* Anneau de signal autour d'une tuile. Deux registres, deux rythmes :
   ALERTE (armée repérée) = rouge, clignotement LENT — un siège se prépare sur des
   heures, un clignotement nerveux crierait au feu ; À FAIRE (corps à fouiller) = accent,
   respiration douce. Jamais les deux à la fois : l'alerte prime. */
.yard-ring {
  fill: none;
  stroke-width: 1.2;
  pointer-events: none;
}
/* 🔴 Le cadre « une armée marche sur toi », autour de la Tour de guet.
   ⚠️ Battement LENT (2,4 s) et halo doux : un siège se prépare sur des heures, un
   clignotement nerveux crierait au feu. Même rythme que l'anneau d'alerte des tuiles —
   deux signaux de même nature doivent battre au même tempo. */
.watch-alarm {
  fill: rgba(255, 106, 69, 0.08);
  stroke: #ff6a45;
  stroke-width: 1.4;
  stroke-dasharray: 5 3;
  pointer-events: none;
  animation: ring-alert 2.4s ease-in-out infinite;
}
/* ⚠️ MÊME battement (2,4 s) et MÊME keyframes que le cadre : deux signaux qui disent
   la même chose doivent respirer ensemble, sinon ils se lisent comme deux alertes. */
.watch-warn {
  font-size: 9px;
  text-anchor: middle;
  /* ⚠️ Centré SUR l'œil (le rond jaune), pas dessous : le pictogramme EST le regard de
     la tour pendant une alerte. `dominant-baseline: central` cale le glyphe sur son
     milieu — sans lui, `y` place la LIGNE DE BASE et le symbole retombe sous la cible. */
  dominant-baseline: central;
  pointer-events: none;
  animation: ring-alert 2.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .watch-alarm,
  .watch-warn {
    animation: none;
    opacity: 0.9;
  }
}
/* ⚠️ PAS l’accent : le point de récolte des bâtiments de ressources est déjà en accent,
   et deux signaux de même couleur se lisent comme un seul — on confondait la fosse à
   fouiller avec une mine à récolter. Vert « gain » (d1), trait plus épais, ET pointillé :
   deux différences en plus de la couleur, pour que ça tienne sans elle. */
.yard-ring.todo {
  stroke: #7bc86c;
  stroke-width: 1.8;
  stroke-dasharray: 2.2 1.4;
  animation: ring-todo 2s ease-in-out infinite;
}
@keyframes ring-alert {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
@keyframes ring-todo {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .yard-ring {
    animation: none;
    opacity: 0.9;
  }
}
/* ⚖️ Rapport de forces */
.forces {
  margin-bottom: 10px;
}
/* ── 🛡️ LA TUILE DÉFENSE (repliable) — les tuiles du Panthéon vivent dans sa feuille ── */
.tile-h {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0;
  background: none;
  border: 0;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.forces.tile.open .tile-h {
  margin-bottom: 8px;
}
.tile-emo {
  flex: none;
  font-size: 24px;
  line-height: 1;
}
.tile-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tile-t {
  font-size: 16px;
  letter-spacing: 0.03em;
}
.tile-s {
  font-size: 12px;
  color: var(--dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-sum {
  flex: none;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  color: var(--dim);
  background: color-mix(in srgb, var(--dim) 12%, transparent);
}
.tile-sum.tenu {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.tile-sum.serre {
  color: var(--d3);
  background: color-mix(in srgb, var(--d3) 16%, transparent);
}
.tile-sum.perdu,
.tile-sum.unknown {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.tile-chev {
  flex: none;
  color: var(--dim);
  font-size: 14px;
}
.f-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.f-side {
  flex: 1;
  min-width: 0;
}
.f-side.right {
  text-align: right;
}
.f-lab {
  font-size: 12px;
  color: var(--dim);
}
.f-val {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}
.f-val.range {
  font-size: 19px;
}
/* Ce que le chiffre MESURE — sans ça « 72 % » ne dit pas de quoi il parle. */
.f-sub {
  font-size: 10px;
  color: var(--dim);
  margin-top: 1px;
}
/* Le pourcentage à côté de la bande : la bande donne le ton, le chiffre la précision. */
.fo-pct {
  font-weight: 800;
  opacity: 0.85;
  margin-left: 4px;
}
.f-val.unknown,
.f-val.calm {
  color: var(--dim);
  font-size: 20px;
}
.f-vs {
  flex: none;
  font-size: 12px;
  color: var(--dim);
}
/* La jauge : le repère central est l'ÉQUILIBRE mesuré (×0,88), pas la parité. */
/* ⚠️ Les couleurs viennent des TOKENS `--d1..--d4` (app.scss), jamais de hex recopiés :
   le commentaire disait « dans les couleurs de l'effort » et les réécrivait à la main —
   un changement de palette aurait laissé la jauge sur l'ancienne. */
.f-gauge {
  position: relative;
  height: 8px;
  margin-top: 10px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--d4) 35%, transparent),
    color-mix(in srgb, var(--d1) 35%, transparent)
  );
}
.fg-cursor {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--text);
  box-shadow: 0 0 0 2px var(--surface);
  transition: left 0.4s ease;
}
.f-gauge.tenu .fg-cursor,
.f-gauge.large .fg-cursor,
.f-gauge.favorable .fg-cursor {
  background: var(--d1);
}
.f-gauge.serre .fg-cursor {
  background: var(--d3);
}
.f-gauge.risque .fg-cursor,
.f-gauge.perdu .fg-cursor {
  background: var(--d4);
}
/* ⚠️ Teinte d'AVERTISSEMENT (d3), pas de danger : des gens dehors n'est pas une
   faute — c'est le prix d'un convoi, et le joueur doit pouvoir le lire sans se
   croire en train de perdre. */
.f-gap {
  font-size: 12px;
  color: var(--d3);
  margin: 6px 0 2px;
}
/* Le dépliant des structures : une ligne par bâtiment, le lien en dessous. */
.f-help {
  display: grid;
  gap: 8px;
  margin-top: 6px;
}
.fh-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.fh-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.fh-name {
  font-size: 13px;
}
.fh-what {
  font-size: 11.5px;
  color: var(--dim);
}
/* Le LIEN se distingue de l’effet : ce n’est pas ce que le niveau donne, c’est ce
   qu’il faut à côté pour que ça serve. */
.fh-link {
  font-size: 11.5px;
  color: var(--d3);
}
/* ⚠️ C’est un <button> depuis qu’il replie : il faut donc annuler les styles natifs,
   et lui donner une cible tactile réelle (44 px) — c’est la règle mobile du projet. */
.f-parts-h {
  margin-top: 12px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  font-size: 11px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.fh-cols {
  display: flex;
  flex: none;
  gap: 8px; /* le même que `.f-part`, sinon l'en-tête ⚔️ est décalé de 8 px */
}
.fh-cols > i {
  width: 58px;
  text-align: right;
  font-style: normal;
}
/* Le pronostic, dans les couleurs de l'effort (d1 → d4) : vert on tient, rouge ça cède. */
.f-odds {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
.f-odds.tenu,
.f-odds.large {
  background: color-mix(in srgb, var(--d1) 16%, transparent);
  color: var(--d1);
}
.f-odds.favorable {
  background: color-mix(in srgb, var(--d2) 16%, transparent);
  color: var(--d2);
}
.f-odds.serre {
  background: color-mix(in srgb, var(--d3) 16%, transparent);
  color: var(--d3);
}
.f-odds.risque,
.f-odds.perdu {
  background: color-mix(in srgb, var(--d4) 16%, transparent);
  color: var(--d4);
}
.f-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.f-hint.warn {
  color: var(--d3);
}
.f-parts {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.f-part {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.f-part.off {
  opacity: 0.45;
}
/* ⚠️ Préfixe `dp-` (defense part) et NON `fp-` : ce dernier appartient déjà au
   sélecteur de familier (`.fp-emo` y vaut 24 px). Même spécificité, déclaré plus bas,
   il l'aurait écrasé — l'emoji d'un écran non concerné aurait rétréci en silence. */
.dp-emo {
  font-size: 14px;
}
/* ⚠️ `flex: 1`, PAS une largeur fixe : les colonnes chiffrées sont déjà à largeur
   fixe, donc le libellé prend ce qui reste et toutes les lignes s'alignent quand même —
   sans qu'un libellé plus long (« Bonus familiers ») déborde ou force à re-mesurer une
   valeur en dur à chaque renommage. `min-width: 0` autorise la troncature plutôt que
   de pousser les chiffres hors du cadre sur un écran de 344 px. */
.dp-lab {
  flex: 1;
  min-width: 0;
  color: var(--dim);
}
.dp-def,
.dp-atk {
  flex: none;
  width: 58px;
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* Deux métiers, deux couleurs : ce qui TIENT et ce qui TUE. */
.dp-def {
  color: var(--d1);
  margin-left: auto;
}
.dp-atk {
  color: var(--d3);
}

/* ── Panneaux ── */
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
}
.panel p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dim);
  line-height: 1.45;
}
.panel.threat {
  border-color: #ffb23f;
}
.panel.warn {
  border-color: #ff6a45;
}
.p-title {
  font-weight: 600;
  font-size: 14px;
}
/* 🕳️ L'origine de faille : un encart, pas une ligne de plus dans la liste — il change le
   sens de TOUT ce qui suit (effectif, composition, pronostic), donc il passe devant.
   ⚠️ Teinte du DANGER (`--d4`), pas l'accent : l'accent dit « il y a à faire » partout
   ailleurs sur cet écran, or ici il n'y a plus rien à faire — la faille a déjà débordé. */
.rift-origin {
  margin-top: 8px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--d4) 55%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--d4) 12%, transparent);
  font-size: 12.5px;
  line-height: 1.4;
}
.scout {
  margin-top: 8px;
}
.scout-line {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.scout-line .k {
  color: var(--dim);
}
.foes-h {
  margin: 12px 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
/* Grille FLUIDE : 3 colonnes dès 344 px (Z Fold plié), plus au large. Jamais de
   débordement horizontal — les cartes se réorganisent, elles ne se compriment pas. */
.foes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
}
.foe {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 10px 6px 8px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.foe-emo {
  font-size: 30px;
  line-height: 1.15;
}
.foe-n {
  font-size: 19px;
  font-weight: 700;
  color: var(--text);
}
.foe-lvl {
  font-size: 11px;
  color: var(--dim);
}
/* Le champion se lit SANS lire : couronne, liseré et fond chaud. */
.foe.champ {
  border-color: #ffb23f;
  background: linear-gradient(180deg, rgba(255, 178, 63, 0.14), #1d1913 62%);
}
.foe.champ .foe-n {
  color: #ffb23f;
}
/* Composition inconnue : même carte, mais éteinte — on montre l’ignorance, on ne la cache pas. */
.foe.unknown {
  border-style: dashed;
  opacity: 0.75;
}
.foe.unknown .foe-emo {
  filter: grayscale(1);
}
.foes-blind {
  font-size: 11.5px;
  color: var(--dim);
}
.foe-crown {
  position: absolute;
  top: -8px;
  right: -3px;
  font-size: 15px;
}
.scout-hint {
  font-style: italic;
}
.done {
  color: #7bc86c !important;
}

/* ── Structures ── */
.struct {
  border-top: 1px solid var(--line);
  padding: 10px 0 4px;
}
.s-lvl {
  color: var(--accent, #ffd23f);
  font-size: 12px;
  margin-left: 6px;
}
.s-dmg {
  color: #ff6a45;
  font-size: 11px;
  margin-left: 6px;
}
.s-repair {
  width: 100%;
  font-size: 12px;
  color: var(--d3);
}
.s-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.s-cap {
  font-size: 11px;
  color: var(--dim);
  margin-top: 5px;
}
.btn,
.cta {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  font-size: 13px;
  padding: 0 12px;
  cursor: pointer;
}
.btn:disabled,
.cta:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.fix {
  border-color: #ff6a45;
  color: #ff6a45;
}
/* Garnison : couleurs de la charte (d1 vert / d4 rouge), les mêmes que les notes
   d'effort — on n'introduit pas une seconde palette pour deux boutons. */
.btn.post {
  border-color: #7bc86c;
  color: #7bc86c;
}
.btn.unpost {
  border-color: #ff6a45;
  color: #ff6a45;
}
.cta {
  width: 100%;
  margin-top: 10px;
  border-color: var(--accent, #ffd23f);
  color: var(--accent, #ffd23f);
}
.cta.ghost {
  border-color: var(--line);
  color: var(--dim);
}
.bar-chip.hurt {
  border-color: #ff6a45;
  color: #ff6a45;
}
.dim-note {
  font-style: italic;
}
.fam {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--line);
  padding: 9px 0;
}
.fam.on {
  border-left: 3px solid var(--accent, #ffd23f);
  padding-left: 8px;
}
.fam-emo {
  font-size: 22px;
}
.fam-main {
  flex: 1;
  min-width: 0;
}
.fam-name {
  font-size: 13px;
  font-weight: 600;
}
.fam-rar {
  font-size: 10.5px;
  color: var(--rk, var(--dim));
}
.fam-lvl {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
.fam-capped {
  color: var(--d3, #ffb23f);
}
.fam-tired {
  color: var(--dim);
  font-size: 11px;
  margin-left: 6px;
}
.fam-role {
  font-size: 12px;
  color: var(--dim);
}
.scav-back {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--bg);
}
.scav-title {
  font-weight: 700;
  margin-bottom: 6px;
}
.scav-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.scav-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
}
/* Ce qui MANQUE se voit : le reste de la phrase reste lisible. */
.miss {
  color: var(--d4);
  font-weight: 600;
}
.calm-watch {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
