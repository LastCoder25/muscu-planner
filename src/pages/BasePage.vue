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
            :class="['corpse', { looted: c.looted, champ: c.champion }]"
            text-anchor="middle"
          >
            {{ c.looted ? '·' : c.emoji }}
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
             quand elle est SOUS le niveau du joueur — la seule structure sans pastille
             était précisément celle qui active les sièges. -->
        <g v-if="wallLevel" class="lvl-badge wall-lvl" :class="{ upgrade: wallLevel < heroLevel }">
          <circle :cx="100 - APOTHEM" cy="100" r="5.4" />
          <text :x="100 - APOTHEM" y="102">{{ wallLevel }}</text>
          <text v-if="wallLevel < heroLevel" :x="100 - APOTHEM + 6.4" y="95.6" class="lvl-up">
            ↑
          </text>
        </g>
        <!-- Pastille de niveau des tourelles, sur la 1re tour -->
        <g v-if="turretsBuilt" class="lvl-badge" :class="{ upgrade: turretLevel < heroLevel }">
          <circle :cx="octagon[0]!.x + 7" :cy="octagon[0]!.y - 8" r="5" />
          <text :x="octagon[0]!.x + 7" :y="octagon[0]!.y - 6.2">{{ turretLevel }}</text>
          <text
            v-if="turretLevel < heroLevel"
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
        <g v-once class="hit gate" @click="openMap">
          <rect x="78" :y="WALL_BOTTOM - 16" width="70" height="42" class="gate-hit" />
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
          <!-- Le panneau au bord du chemin : où mène cette route. -->
          <g class="signpost">
            <line x1="122" :y1="WALL_BOTTOM + 23" x2="122" :y2="WALL_BOTTOM + 11" />
            <rect
              x="111"
              :y="WALL_BOTTOM + 9"
              width="36"
              height="9.5"
              rx="1.5"
              class="sign-board"
            />
            <text x="130.5" :y="WALL_BOTTOM + 15.7" class="gate-label">Expéditions ›</text>
          </g>
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
            :x="y.x - YARD_HIT"
            :y="y.y - YARD_HIT"
            :width="YARD_HIT * 2"
            :height="YARD_HIT * 2"
            class="yard-hit"
          />
          <rect
            :x="y.x - YARD_HALF"
            :y="y.y - YARD_HALF"
            :width="YARD_HALF * 2"
            :height="YARD_HALF * 2"
            rx="5"
            class="yard-pad"
          />
          <text v-if="y.built" :x="y.x" :y="y.y + 4" class="yard-emo">{{ y.emoji }}</text>
          <text v-else :x="y.x" :y="y.y + 4" class="yard-plus">{{ y.locked ? '🔒' : '＋' }}</text>
          <g v-if="y.built" class="lvl-badge">
            <circle :cx="y.x + 7.5" :cy="y.y - 7.5" r="4.6" />
            <text :x="y.x + 7.5" :y="y.y - 5.9">{{ y.level }}</text>
          </g>
          <circle v-if="y.ready" :cx="y.x - 7.5" :cy="y.y - 7.5" r="2.6" class="yard-ready" />
          <!-- ⚠️ Le signal « une promotion attend » vivait sur la carte d'entrée du
               vivier, en bas de la base. Celle-ci a disparu (on gère les aventuriers
               DEPUIS la Guilde) : sans ce report, on perdrait l'information au lieu de
               la déplacer. -->
          <text v-if="y.star" :x="y.x - 6.5" :y="y.y + 9.5" class="yard-star">⭐</text>
          <rect
            v-if="y.todo"
            :x="y.x - YARD_HALF - 2"
            :y="y.y - YARD_HALF - 2"
            :width="YARD_HALF * 2 + 4"
            :height="YARD_HALF * 2 + 4"
            rx="7"
            class="yard-ring todo"
          />
        </g>
      </svg>

      <!-- ⚖️ LE RAPPORT DE FORCES — la question qu'on vient se poser sur cet écran. -->
      <div class="panel forces">
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
            <div class="f-sub">tient {{ holdPct(forces.hold) }} face à une armée type</div>
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
          </div>
        </div>
        <!-- ⚠️ CE QUE COÛTENT LES ABSENTS (demandé par l'utilisateur : « envoyer des
             convois ou le héros sans se mettre dans le rouge »). Le panneau donnait la
             défense du MOMENT sans jamais dire ce qu'elle vaudrait au complet : on ne
             pouvait pas savoir ce qu'on abandonnait en faisant partir quelqu'un.
             ⚠️ Affiché SEULEMENT si l'écart est réel — annoncer « −0 » à un joueur dont
             tout le monde est à la maison serait du bruit. -->
        <p v-if="holdNote" class="f-hint">{{ holdNote }}</p>
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
        <div class="f-parts-h">
          <span>Ce que je perdrais sans…</span>
          <span class="fh-cols"><i>🛡️ tenir</i><i>⚔️ tuer</i></span>
        </div>
        <div class="f-parts">
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
        <p v-if="!heroHome && heroBack" class="f-hint">
          🧭 Ton héros est en expédition, mais il sera rentré avant l’assaut : il défendra.
        </p>
        <p v-else-if="!heroHome" class="f-hint warn">
          🧭 Ton héros est en expédition : il ne défendra pas.
        </p>
      </div>

      <div class="keep-legend">
        <span
          >🧱 Muraille {{ wallLevel || '—'
          }}<b v-if="wallLevel && wallLevel < heroLevel" class="up">
            ↑ {{ heroLevel }} possible</b
          ></span
        >
        <span>🏹 {{ turretsBuilt }}/{{ TURRET_SLOTS }} tourelles</span>
        <span>🗼 Guet {{ watchLevel || '—' }}</span>
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
        :defenders="defenderEmojis"
        @done="closeSiege"
      />
    </q-dialog>

    <!-- Revoir le dernier assaut -->
    <!-- ⚠️ Sans notification, le PRÉAVIS que la Tour de guet fait payer ne sert qu'à
         ceux qui ouvraient l'app de toute façon. C'est l'objet de cet interrupteur. -->
    <div v-if="pushOk" class="panel push-panel">
      <div class="p-title font-display">🔔 Me prévenir</div>
      <div class="p-sub">
        Armée repérée, assaut résolu, héros ou convoi rentré — même app fermée.
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
      <button class="cta" :disabled="(char.row?.scrap ?? 0) < healPrice" @click="doHeal">
        ⛑️ Soins d’urgence · {{ healPrice }} ferraille
      </button>
    </div>

    <!-- ── Production gelée ── -->
    <div v-if="freeze" class="panel warn">
      <div class="p-title">❄️ Production gelée</div>
      <p>
        Tes filons sont à l’arrêt tant que l’enceinte est en ruine.
        <b>Répare-la et la production repart.</b>
        Sinon, une séance de sport la relance aussi — ou les ouvriers s’y remettent seuls
        {{ freezeIn }}.
      </p>
      <button
        v-if="repairAllCost > 0"
        class="cta"
        :disabled="(char.row?.scrap ?? 0) < repairAllCost"
        @click="doRepairAll"
      >
        🔩 Tout réparer · {{ repairAllCost }} ferraille
      </button>
    </div>

    <GuildPanel :open="guildOpen" :mode="guildMode" @close="guildOpen = false" />

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
      @open-guild="(m) => openGuild(m)"
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
            Construire · {{ defSel.buildGold }} 🪙<span v-if="defSel.buildScrap">
              + {{ defSel.buildScrap }} 🔩</span
            >
          </button>
          <template v-else>
            <button
              v-if="damagedOf(defSel.id)"
              class="btn fix"
              :disabled="!canRepair(defSel.id)"
              @click="doRepair(defSel.id)"
            >
              Réparer · {{ repairCost(lvlOf(defSel.id)) }} 🔩
            </button>
            <button class="btn" :disabled="!canUpgrade(defSel.id)" @click="doUpgrade(defSel.id)">
              Améliorer · {{ upCost(defSel.id).gold }} 🪙 + {{ upCost(defSel.id).scrap }} 🔩
            </button>
          </template>
        </div>

        <!-- 🗼 LA TOUR DE GUET porte ce qu’elle produit : le renseignement, et le
             compte rendu du dernier assaut. -->
        <template v-if="defSel.id === 'watchtower'">
          <!-- ── Menace en approche ── -->
          <div v-if="raid" class="panel threat">
            <div class="p-title">⚠️ Une armée approche — {{ arriveIn }}</div>
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
            <p v-if="!raidsReady">
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
            <p v-if="raidsReady" class="calm-watch">
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
            <button class="cta ghost" @click="replaySiege">▶ Revoir l’assaut</button>
          </div>
        </template>

        <!-- 🦴 LE CHANTIER porte le champ de bataille : c’est lui qui envoie fouiller. -->
        <template v-if="defSel.id === 'salvage'">
          <!-- ── Champ de bataille ── -->
          <div v-if="field" class="panel loot">
            <div class="p-title">🦴 Champ de bataille — {{ remaining }} corps</div>
            <p v-if="!salvageLevel">
              Construis un <b>Fosse commune</b> pour dépouiller les corps avant qu’ils ne
              pourrissent ({{ rotIn }}).
            </p>
            <template v-else>
              <!-- ── LA FOUILLE TOURNE SEULE ─────────────────────────────────────
                 ⚠️ Plus de bouton « envoyer » ni « ramasser » : envoyer des fossoyeurs
                 n’était pas une DÉCISION — on envoie toujours, il n’y a rien à arbitrer —
                 donc c’était un péage, et le chantier est juste devant la porte. Demandé
                 par l’utilisateur, qui avait aussi constaté « en 1 voire 2 vagues max j’ai
                 tout ramassé ».
                 Le butin est crédité VAGUE PAR VAGUE (rien ne se perd si le champ pourrit
                 avant la fin) et un 📜 rapport de pillage part dans la boîte quand il est
                 vide : ce qu’il reste à montrer ici, c’est l’AVANCEMENT. -->
              <p>
                {{ scavCap }} corps par vague · aller-retour {{ scavTrip }} · les corps pourrissent
                {{ rotIn }}. Les fossoyeurs font la navette tout seuls.
              </p>
              <div v-if="pillage" class="scav-back">
                <div class="scav-title">
                  🎒 {{ pillage.corpses }} corps dépouillés en {{ pillage.waves }} vague{{
                    pillage.waves > 1 ? 's' : ''
                  }}
                </div>
                <div v-if="pillagePills.length" class="scav-pills">
                  <span v-for="(b, i) in pillagePills" :key="i" class="scav-pill">{{ b }}</span>
                </div>
              </div>
              <p v-if="remaining > 0" class="dim-note">
                ⛏️ Fouille en cours — prochaine vague {{ scavIn }}
              </p>
              <p v-else class="done">Le champ est entièrement dépouillé.</p>
            </template>
          </div>
        </template>
        <p v-if="lvlOf(defSel.id) >= heroLevel" class="s-cap">
          Plafonné par ton niveau de personnage — le sport reste le plafond.
        </p>
        <p v-if="heroLevel < defenseUnlockLevel" class="s-cap">
          🔒 L’enceinte se débloque au niveau {{ defenseUnlockLevel }}.
        </p>

        <!-- ── LA GARNISON, DANS LA FEUILLE DU CHENIL ──────────────────────
             Elle vivait dans un panneau séparé, plus bas sur la page : on cliquait la
             niche et il ne s'y passait rien, il fallait deviner qu'il fallait faire
             défiler. Le bâtiment qui abrite les familiers est l'endroit où on les
             poste. -->
        <div v-if="defSel.id === 'kennel' && kennelLevel" class="sh-garrison">
          <div class="sh-gtitle">
            🐾 Garnison — {{ garrisonIds.length }}/{{ slots }} postés
            <span class="sh-gnext">· +1 place au niveau {{ nextSlotLevel }}</span>
          </div>
          <!-- ⚠️ LE RANG MAXIMAL EST LE SECOND LEVIER du Chenil, comme la Guilde pour
               les aventuriers : sans cette ligne, on trouve un familier légendaire, on
               ne peut pas le poster, et rien ne dit pourquoi. -->
          <div class="sh-gcap">
            🎖️ Rang max hébergé : <b>{{ rankCapLabel }}</b>
            <span v-if="nextRankLevel" class="sh-gnext">
              · rang suivant au niveau {{ nextRankLevel }}
            </span>
          </div>

          <!-- ── LES CASES ────────────────────────────────────────────────────
               Une case par place, occupée ou vide. La LISTE de tous les familiers
               obligeait à la parcourir pour savoir qui était en poste ; ici l'état
               se lit d'un coup d'œil, et retirer un familier laisse un TROU visible
               au lieu de faire remonter la liste. -->
          <div class="gslots">
            <button
              v-for="(f, i) in garrisonSlotsView"
              :key="i"
              type="button"
              class="gslot"
              :class="[f ? 'p-' + f.rarity : 'empty', { tired: f && isFatiguedNow(f) }]"
              :title="
                f ? f.name + ' — toucher pour remplacer' : 'Emplacement libre — toucher pour poster'
              "
              @click="famPick = i"
            >
              <template v-if="f">
                <span class="gs-emo">{{ f.emoji }}</span>
                <span class="gs-def">🛡️{{ defLvl(f) }}</span>
                <span v-if="isFatiguedNow(f)" class="gs-tired" title="au repos">😴</span>
              </template>
              <span v-else class="gs-plus">＋</span>
            </button>
          </div>

          <!-- ── CE QUE ÇA DONNE ──────────────────────────────────────────────
               Le total RÉELLEMENT appliqué, plafonds compris : c'est le seul chiffre
               qui compte au moment de l'assaut, et il ne vivait nulle part. -->
          <div class="gbonus">
            <div class="gb-h">Ce que la garnison apporte au mur</div>
            <div v-if="garrisonSummary.length" class="gb-list">
              <span v-for="(g, i) in garrisonSummary" :key="i" class="gb-chip">{{ g }}</span>
            </div>
            <p v-else class="gb-empty">Aucun familier posté — l’enceinte se défend seule.</p>
          </div>

          <button v-if="famPoolRaw.length" class="cta ghost" @click="doAutoGarrison">
            ✨ Poster automatiquement les meilleurs
          </button>
          <p v-if="!famPoolRaw.length" class="dim-note">
            Aucun familier en réserve — le Labyrinthe en donne un à chaque palier nettoyé.
          </p>
          <p class="sh-gnote">
            L’<b>espèce</b> décide de ce que le familier apporte au mur. Il reste dans ton sac :
            poster n’est pas ranger.
          </p>
        </div>
      </q-card>
    </q-dialog>

    <!-- ── SÉLECTEUR DE FAMILIER (une case du chenil) ─────────────────────────
         Ouvert en touchant une case. On montre TOUS les familiers possédés, les plus
         utiles au mur d'abord ; ceux déjà postés ailleurs sont marqués plutôt que
         cachés — les masquer donnerait l'impression de les avoir perdus. -->
    <q-dialog v-model="famPickOpen" position="bottom">
      <q-card class="sheet">
        <div class="sh-head">
          <div class="sh-title font-display">🐾 Poste {{ (famPick ?? 0) + 1 }}</div>
          <button class="iconbtn" aria-label="Fermer" @click="famPick = null">✕</button>
        </div>
        <button
          v-if="famPick !== null && garrisonSlotsView[famPick]"
          class="btn unpost full"
          @click="pickFamiliar(null)"
        >
          Laisser ce poste vide
        </button>
        <p v-if="!famChoices.length" class="dim-note">{{ famEmptyNote }}</p>
        <p v-else-if="famRoleHidden" class="dim-note">
          ⚠️ Un rôle par poste : {{ famRoleHidden }} de tes familiers n'apparaissent pas, leur
          spécialité est déjà tenue au mur.
        </p>
        <button
          v-for="f in famChoices"
          :key="f.id"
          type="button"
          class="fpick"
          :class="{
            here: famPick !== null && garrisonSlotsView[famPick]?.id === f.id,
            barred: !postable(f),
          }"
          :disabled="!postable(f)"
          @click="pickFamiliar(f.id)"
        >
          <span class="fp-emo">{{ f.emoji }}</span>
          <span class="fp-main">
            <span class="fp-name">
              {{ f.name }}
              <span class="fam-rar" :class="'p-' + f.rarity">{{ RARITY_LABEL[f.rarity] }}</span>
              <span class="fam-lvl" title="Dressage de défense">🛡️ {{ defLvl(f) }}</span>
              <span v-if="isFatiguedNow(f)" class="fam-tired">au repos</span>
            </span>
            <span class="fp-role">{{ roleLabel(f) }}</span>
            <span class="fp-eff">{{ famEffect(f) }}</span>
            <!-- ⚠️ ON DIT POURQUOI, on ne grise pas en silence : un familier qu’on ne peut
                 pas poster sans explication se lit comme un bug (leçon du gris de la
                 carte, v0.738). -->
            <span v-if="!postable(f)" class="fp-capped">
              🎖️ Hors de portée de ton Chenil (rang max {{ rankCapLabel }})
              <template v-if="nextRankLevel">— améliore-le au niveau {{ nextRankLevel }}</template>
            </span>
            <span v-else-if="defLvlRaw(f) > defLvl(f)" class="fp-capped">
              dressage bridé par le Chenil (niv. {{ kennelLevel }}) — il vaut {{ defLvlRaw(f) }}
            </span>
          </span>
        </button>
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { useGamePanel } from '@/composables/useGamePanel';
import VillagePlots from '@/components/VillagePlots.vue';
import GuildPanel from '@/components/GuildPanel.vue';
import { canPromoteNow, advAvailable, advTitle } from '@/lib/adventurers';
import SiegeStage from '@/components/SiegeStage.vue';
import { RARITY_LABEL, famDefMult, famLevel, FAMILIAR_SLOT, type Item } from '@/lib/items';
import {
  BUILD,
  buildingAccrued,
  buildingProdPerHour,
  buildingStorageCap,
  buildingType,
  collectable,
  plotsForLevel,
  storageMult,
  RESOURCE_EMOJI,
  type BuildResource,
} from '@/lib/buildings';
import {
  scoutLeadMs,
  garrisonLevel,
  DEFENSE_TYPES,
  FACTION_EMOJI,
  FACTION_LABEL,
  FACTION_LOOT,
  TURRET_SLOTS,
  defenseLevel,
  isDamaged,
  repairCost,
  scavengerCount,
  scavengeMs,
  fmtSpan,
  assaultEstimate,
  assaultPower,
  defenseBreakdown,
  guardUnits,
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
  remainingCorpses,
  totalRepairCost,
  defenseUpgradeCost,
  defenseUpgradeScrap,
  defensePerLevelLabel,
  raidIntervalMs,
  garrisonBonus,
  garrisonSlots,
  garrisonRankLabel,
  garrisonNextRankLevel,
  canGarrison,
  GARRISON_CAP,
  isFatigued,
  isWounded,
  healCost,
  woundRemainingMs,
  GARRISON_ROLE,
  ROLE_LABEL,
  type DefenseId,
  type RaidReport,
  type ScoutReport,
} from '@/lib/raid';
import { usePush, pushSupported, type PushFail } from '@/composables/usePush';
import { fmtPow, type Combatant } from '@/lib/combat';
import { mulberry32 } from '@/lib/combat';
import { treePath } from '@/lib/expedition';

/** Niveau d'accès à l'enceinte. La défense est un système de mi-partie : elle suppose une
 *  économie derrière elle (or, ferraille) et une base qui vaille la peine d'être défendue.
 *  Mesuré, un joueur trop tôt ne tenait aucun siège même en bâtissant à son niveau. */
const defenseUnlockLevel = Math.min(...DEFENSE_TYPES.map((t) => t.unlockLevel));

const props = defineProps<{
  embedded?: boolean;
  inTab?: boolean;
  siege?: RaidReport | null;
  /** Le combattant du héros, tel qu'il défendra vraiment. Fourni par l'Aventure : le
   *  recalculer ici ferait deux vérités pour un seul chiffre. */
  hero?: Combatant | null;
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
  else router.back();
}
/** Sortir de la base → la carte des expéditions. En cockpit, elle prend le volet droit ;
 *  sinon c'est une route plein écran. */
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
const remaining = computed(() => remainingCorpses(field.value));

const wallLevel = computed(() => defenseLevel(defenses.value, 'wall'));
const watchLevel = computed(() => defenseLevel(defenses.value, 'watchtower'));
const salvageLevel = computed(() => defenseLevel(defenses.value, 'salvage'));
// Les sièges ne s’allument qu’avec une enceinte PRÊTE (mur ET tourelles). On affiche le
// niveau requis plutôt que la part : c’est ce sur quoi le joueur peut agir.
const raidsReady = computed(
  () => defenseReadiness(defenses.value, heroLevel.value) >= RAID.enableShare,
);
const readyLevel = computed(() => Math.max(1, Math.ceil(heroLevel.value * RAID.enableShare)));
const wallDamaged = computed(() => isDamaged(defenses.value, 'wall'));
const watchDamaged = computed(() => isDamaged(defenses.value, 'watchtower'));
const turretsDamaged = computed(() => isDamaged(defenses.value, 'turret'));
const turretsBuilt = computed(() => turretCount(defenseLevel(defenses.value, 'turret')));
const scavCap = computed(() => scavengerCount(salvageLevel.value));
const kennelLevel = computed(() => defenseLevel(defenses.value, 'kennel'));
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

/** Tous les familiers en réserve (le familier ÉQUIPÉ n'est pas postable : il ne peut
 *  pas être à deux endroits à la fois — c'est ce qui fait diverger les deux carrières). */
const famPoolRaw = computed(() =>
  (char.row?.inventory ?? []).filter((it) => it.slot === FAMILIAR_SLOT),
);
/** Ce qu'un familier apporte VRAIMENT au mur — sert au tri, donc à ce que le joueur voit
 *  en premier. Même lecture que le combat : effet × dressage (plafonné par le Chenil). */
function famWeight(f: Item): number {
  return (f.effect?.value ?? 0) * famDefMult(garrisonLevel(f, kennelLevel.value));
}
/** LES POSTÉS D'ABORD, puis les meilleurs. Une liste dans l'ordre du sac obligeait à
 *  relire dix lignes pour retrouver qui est en poste. */
const famPool = computed(() => {
  const ids = new Set(base.value?.garrison ?? []);
  return [...famPoolRaw.value].sort((a, b) => {
    const pa = ids.has(a.id) ? 1 : 0;
    const pb = ids.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return famWeight(b) - famWeight(a);
  });
});
/** Les ids POSTÉS, dans leur ordre de rangement — c'est lui qui décide quelle case
 *  occupe quel familier. `garrisoned` trie pour le calcul du bonus ; ici l'ordre compte. */
const garrisonIds = computed(() => base.value?.garrison ?? []);
/** Une entrée par PLACE : le familier posté, ou `undefined` pour une case vide.
 *  ⚠️ Retirer un familier laisse un TROU au lieu de faire remonter la liste — sinon on ne
 *  voit plus combien de places restent à pourvoir. */
const garrisonSlotsView = computed(() => {
  const byId = new Map(famPoolRaw.value.map((f) => [f.id, f]));
  // ⚠️ DÉDOUBLONNÉ à la lecture : un même familier ne peut pas tenir deux postes. Le store
  // l'interdit déjà à l'écriture, mais une ligne écrite par une version antérieure
  // afficherait sinon la même bête sur deux cases — un état que le combat ne connaît pas.
  const vus = new Set<string>();
  const ids = garrisonIds.value.filter((id) => (vus.has(id) ? false : (vus.add(id), true)));
  return Array.from({ length: slots.value }, (_, i) => byId.get(ids[i] ?? ''));
});
/** Case en cours d'édition (index), ou null. */
const famPick = ref<number | null>(null);
// q-dialog veut un booleen ; la SOURCE reste l'index, pour savoir QUELLE case on edite.
const famPickOpen = computed({
  get: () => famPick.value !== null,
  set: (v: boolean) => {
    if (!v) famPick.value = null;
  },
});
/** Familiers proposés pour une case : les DISPONIBLES seulement, plus celui qui occupe
 *  déjà cette case. Les meilleurs d’abord.
 *
 *  ⚠️ On ne propose PAS ceux postés ailleurs. Les afficher « marqués » invitait à un
 *  échange de postes, alors qu’un même familier ne peut évidemment pas défendre deux
 *  endroits à la fois : mieux vaut que le doublon soit IMPOSSIBLE à l’écran que rattrapé
 *  par le store. */
const famChoices = computed(() => {
  const here = famPick.value === null ? undefined : garrisonSlotsView.value[famPick.value]?.id;
  const pris = new Set(garrisonIds.value.filter((id) => id !== here));
  // ⚠️ ET on écarte les RÔLES déjà tenus par une autre case : deux loups tombent dans le
  // même canal, déjà plafonné — le second n'apporterait qu'un reliquat en occupant une
  // place. La lib arbitre pareil ; l'écran ne fait que ne pas proposer l'impossible.
  const roles = new Set(
    famPoolRaw.value
      .filter((f) => pris.has(f.id))
      .map((f) => GARRISON_ROLE[f.effect.type])
      .filter(Boolean),
  );
  return famPoolRaw.value
    .filter((f) => !pris.has(f.id) && !roles.has(GARRISON_ROLE[f.effect.type]))
    .sort((a, b) => famWeight(b) - famWeight(a));
});
/** Combien de familiers le filtre par RÔLE écarte — l'écran doit dire POURQUOI un
 *  familier de la réserve n'est pas proposé, sinon la liste a juste l'air incomplète. */
const famRoleHidden = computed(() => {
  const here = famPick.value === null ? undefined : garrisonSlotsView.value[famPick.value]?.id;
  const pris = new Set(garrisonIds.value.filter((id) => id !== here));
  const roles = new Set(
    famPoolRaw.value
      .filter((f) => pris.has(f.id))
      .map((f) => GARRISON_ROLE[f.effect.type])
      .filter(Boolean),
  );
  return famPoolRaw.value.filter((f) => !pris.has(f.id) && roles.has(GARRISON_ROLE[f.effect.type]))
    .length;
});
/** Les trois raisons d'une liste vide, distinguées : rien en réserve, tout posté, ou tous
 *  les rôles déjà tenus. « Aucun choix » sans motif se lit comme un bug. */
const famEmptyNote = computed(() => {
  if (!famPoolRaw.value.length)
    return 'Aucun familier en réserve — le Labyrinthe en donne un à chaque palier nettoyé.';
  if (famRoleHidden.value)
    return 'Un rôle par poste : les familiers qui restent ont tous une spécialité déjà tenue au mur. Varie les espèces pour couvrir un rôle de plus.';
  return 'Tous tes familiers sont déjà postés — libère un poste pour en déplacer un.';
});

/** Place `id` sur la case en cours (ou la vide si `null`). Une SEULE écriture : échanger
 *  deux familiers via deux bascules laisserait un état intermédiaire vide à l'écran. */
function pickFamiliar(id: string | null) {
  const i = famPick.value;
  if (i === null) return;
  const next = Array.from({ length: slots.value }, (_, k) => garrisonSlotsView.value[k]?.id ?? '');
  next[i] = id ?? ''; // le sélecteur ne propose que des familiers LIBRES : rien à échanger
  famPick.value = null;
  void guard(() => char.setGarrison(uid.value, next.filter(Boolean), Date.now()));
}

const garrisoned = computed(() => {
  const ids = new Set(base.value?.garrison ?? []);
  return famPool.value.filter((f) => ids.has(f.id));
});
/** Places de garnison : elles viennent du CHENIL, comme l’effectif d’aventuriers vient
 *  de la Guilde (demandé par l’utilisateur). Une de plus tous les 5 niveaux du
 *  bâtiment — et c’est lui, pas le personnage, qu’on améliore pour en poster plus. */
const slots = computed(() => garrisonSlots(kennelLevel.value));
const nextSlotLevel = computed(() => (Math.floor(kennelLevel.value / 5) + 1) * 5);
/** Le rang le plus haut que le Chenil sait héberger, et le niveau qui ouvre le suivant. */
const rankCapLabel = computed(() => garrisonRankLabel(kennelLevel.value));
/** Ce familier tient-il dans l’école ? ⚠️ Même fonction que le combat et que le
 *  store : l’écran ne peut donc pas proposer ce que le mur refuserait. */
const postable = (f: Item): boolean => canGarrison(f, kennelLevel.value);
const nextRankLevel = computed(() => garrisonNextRankLevel(kennelLevel.value));
const garrison = computed(() => garrisonBonus(garrisoned.value, now.value, kennelLevel.value));
function isFatiguedNow(f: Item): boolean {
  return isFatigued(f, now.value);
}
/** Le niveau de dressage RÉELLEMENT appliqué au mur — plafonné par le Chenil, comme
 *  dans le combat. Afficher le niveau brut mentirait dès que le chenil est en retard. */
function defLvl(f: Item): number {
  return garrisonLevel(f, kennelLevel.value);
}
/** Le niveau brut, pour dire « bridé par le chenil » quand les deux diffèrent. */
function defLvlRaw(f: Item): number {
  return famLevel(f.defXp, 'def');
}

function roleLabel(f: Item): string {
  const r = GARRISON_ROLE[f.effect.type];
  return r ? ROLE_LABEL[r] : 'Aucun rôle à la base';
}
const pct = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
/** Ce que CE familier apporte, en clair et en chiffres. ⚠️ Calculé par `garrisonBonus`
 *  lui-même, appliqué à ce seul familier : l'étiquette ne peut donc pas mentir ni
 *  dériver du combat — c'est la même fonction qui décide de l'un et de l'autre.
 *  « Renseignement » et « Fouille » n'y sont ni bridés ni plafonnés : ce ne sont pas
 *  des stats de combat. */
function famEffect(f: Item): string {
  const role = GARRISON_ROLE[f.effect.type];
  if (!role) return 'Aucun effet au mur — son bonus ne sert qu’au héros.';
  const b = garrisonBonus([f], now.value, Math.max(1, kennelLevel.value));
  if (role === 'damage') return `+${pct(b.damagePct ?? 0)} % de dégâts des défenseurs`;
  if (role === 'pv') return `+${pct(b.maxPvPct ?? 0)} % de PV à l’enceinte`;
  if (role === 'armor')
    return `−${pct((b.dmgReduction ?? 0) * 100)} % de dégâts subis (plafond ${GARRISON_CAP.dmgReduction * 100} %)`;
  if (role === 'regen')
    return `+${pct((b.regen ?? 0) * 100)} % de PV rendus entre deux vagues (plafond ${GARRISON_CAP.regen * 100} %)`;
  if (role === 'scout') return '+1 palier de renseignement sur l’armée qui vient';
  return `+${pct(b.lootPct ?? 0)} % de butin sur les cadavres`;
}
/** Ce que coûte le retour à la normale : remettre l'enceinte en état relance aussi la
 *  production (le gel est la conséquence de la casse, pas une punition séparée). */
const repairAllCost = computed(() => (base.value ? totalRepairCost(base.value) : 0));

// ── Rejeu du siège ──
/** Rapport en cours de rejeu. Posé par le parent à la résolution (`siege` prop) ou par
 *  le bouton « Revoir l'assaut ». */
const replay = ref<RaidReport | null>(null);
const siegeShown = computed(() => replay.value ?? props.siege ?? null);
const siegeKey = ref(0);
const siegeOpen = computed({
  get: () => !!siegeShown.value,
  set: (v: boolean) => {
    if (!v) closeSiege();
  },
});
/** Ceux qui TIENNENT LA BRÈCHE, pour le rejeu animé. ⚠️ Les aventuriers, pas les
 *  familiers : depuis le branchement du moteur ce sont eux qui se battent — le chenil
 *  ne fait que les renforcer. Montrer les familiers laissait croire l’inverse.
 *  ⚠️ MÊME SOURCE que le panneau de forces (`advAvailable`) : deux listes de
 *  « qui défend » finiraient par diverger. Le rapport ne mémorise pas qui était là, donc
 *  un REJEU montre le vivier d’aujourd’hui — approximation assumée, déjà celle du
 *  niveau de tourelle passé juste à côté. */
const defenderEmojis = computed(() =>
  char.advList.filter((a) => advAvailable(a, now.value)).map((a) => advTitle(a)?.emoji ?? '🧑'),
);
/** Le total effectivement appliqué au siège — plafonds compris. C'est le seul chiffre
 *  qui compte au moment de l'assaut, et il n'était affiché nulle part. */
const garrisonSummary = computed(() => {
  const b = garrison.value;
  const out: string[] = [];
  if (b.damagePct) out.push(`⚔️ +${pct(b.damagePct)} % dégâts`);
  if (b.maxPvPct) out.push(`❤️ +${pct(b.maxPvPct)} % PV`);
  if (b.dmgReduction) out.push(`🛡️ −${pct(b.dmgReduction * 100)} % subis`);
  if (b.regen) out.push(`🩸 +${pct(b.regen * 100)} % régén`);
  if (b.scoutBonus) out.push(`🦅 +${b.scoutBonus} renseignement`);
  if (b.lootPct) out.push(`🦫 +${pct(b.lootPct)} % butin`);
  return out;
});
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
const onRoad = (x: number, y: number) => y > WALL_BOTTOM && Math.abs(x - 100) < 18;
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
  /** ⭐ Quelque chose attend une décision DANS ce bâtiment (une promotion, aujourd'hui). */
  star?: boolean;
  /** 🔴 ALERTE : une armée a été repérée — contour rouge à clignotement LENT. Lent, parce
   *  qu'un siège se prépare sur des heures : un clignotement nerveux crierait au feu. */
  /** Quelque chose est À FAIRE ici (des corps à fouiller, des fossoyeurs rentrés). */
  todo?: boolean;
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
// Services : un vers la porte, deux vers le corps de garde — ils encadrent la place.
const SVC_R = 16;
const SVC_POS = RING(3, SVC_R, Math.PI);
const YARD_HALF = 9; // demi-côté DESSINÉ
// Cible tactile plus large que le dessin, sans chevauchement (elle vaut exactement l'écart
// entre deux colonnes) → ~37 px sur un téléphone, contre 33 pour la tuile visible seule.
const YARD_HIT = 10;
/** Les services occupent la rangée du bas ; la Tour de guet, elle, reste SUR le mur
 *  (c'est un ouvrage de rempart, pas un bâtiment de cour). */
const YARD_SERVICES: DefenseId[] = ['kennel', 'infirmary', 'salvage'];

const yard = computed<YardCell[]>(() => {
  const cells: YardCell[] = [];
  const unlocked = plotsForLevel(heroLevel.value);
  const bs = char.row?.buildings ?? [];
  const mult = storageMult(bs);
  // Rangées 1-2 : les emplacements du village.
  for (let i = 0; i < BUILD.plotCap; i++) {
    const b = bs.find((x) => x.slot === i) ?? null;
    const pos = PLOT_POS[i] ?? PLOT_POS[PLOT_POS.length - 1]!;
    cells.push({
      key: 'plot' + i,
      x: pos.x,
      y: pos.y,
      emoji: b ? (buildingType(b.typeId)?.emoji ?? '🏠') : '',
      built: !!b,
      locked: i >= unlocked,
      level: b?.level ?? 0,
      ready: b ? buildingAccrued(b, now.value, mult) > 0 : false,
      damaged: false,
      star: b?.typeId === 'guild' && promoAvailable.value > 0,
      onClick: () => (plotSlot.value = i),
    });
  }
  // Rangée 3 : les services de l'enceinte.
  YARD_SERVICES.forEach((id, i) => {
    const t = DEFENSE_TYPES.find((d) => d.id === id)!;
    cells.push({
      key: id,
      service: true,
      x: SVC_POS[i]!.x,
      y: SVC_POS[i]!.y,
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
      // ⚠️ La fouille ne demande plus d’action : la pastille dit qu’il se PASSE quelque
      // chose (des corps sont encore là), pas qu’il y a un bouton à presser.
      todo: id === 'salvage' && remaining.value > 0,
      onClick: () => openDef(id),
    });
  });
  return cells;
});

// ── Feuilles ouvertes depuis le dessin ──
const plotSlot = ref<number | null>(null);

// ── Guilde d’aventuriers ──
const guildOpen = ref(false);
/** Ouvrir le panneau de la Guilde, éventuellement DIRECTEMENT sur le recrutement —
 *  c'est le cas quand un niveau vient d'ouvrir une place. */
const guildMode = ref<'recruit' | null>(null);
function openGuild(mode?: 'recruit') {
  guildMode.value = mode ?? null;
  guildOpen.value = true;
}
const guildLevel = computed(() => char.guildLevel);
/** Promotions en attente : un jalon qu'on ne doit pas rater, donc une ⭐ sur la Guilde.
 *  ⚠️ Une formation EN COURS n'en est pas une : la décision est déjà prise, et proposer
 *  de promouvoir quelqu'un qui est justement en train de l'être n'aurait aucun sens. */
const promoAvailable = computed(
  () =>
    char.advList.filter((a) =>
      canPromoteNow(a, {
        guildLevel: guildLevel.value,
        trainingLevel: char.trainingLevel,
        now: now.value,
      }),
    ).length,
);
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
        // Un faucon posté au chenil voit plus loin : la garnison a des rôles hors combat.
        garrison.value.scoutBonus ?? 0,
        // La graine du raid porte l’aléa du renseignement : même armée = même lecture,
        // mais on ne peut pas la prédire avant qu’elle apparaisse.
        raid.value.seed,
      )
    : 0,
);
// ─── ⚖️ RAPPORT DE FORCES ─────────────────────────────────────────────────────
// ⚠️ Ce que l'écran ne disait NULLE PART : ce que l'enceinte, les familiers postés et
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
 *  ni en formation, épaulés par les familiers postés. ⚠️ Construite par `guardUnits`,
 *  la MÊME fonction que le store donne à `resolveRaid` : le panneau et la bataille ne
 *  peuvent pas se contredire. */
const guardNow = computed(() =>
  guardUnits(
    heroLevel.value,
    char.advList.filter((a) => advAvailable(a, now.value)),
    garrison.value,
  ),
);
/** LA GARNISON AU COMPLET : tout le vivier, blessés compris — ils rentreront. C’est un
 *  PLAFOND, pas une prévision, et c’est précisément ce qu’on abandonne en envoyant
 *  quelqu’un ailleurs. */
const guardFull = computed(() => guardUnits(heroLevel.value, char.advList, garrison.value));
/** ⚠️ LE PANNEAU SE MESURE UNE FOIS PAR MINUTE, pas à chaque seconde. Le Monte-Carlo
 *  coûte ~66 ms (5 ablations), et `garrison` ne dépend de `now` que par la FATIGUE des
 *  familiers — une fonction en escalier qui change quelques fois par heure. Le brancher
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
function fmtDelay(ms: number): string {
  if (ms <= 0) return 'maintenant';
  const m = Math.round(ms / 60000);
  if (m < 60) return `dans ${m} min`;
  const h = Math.floor(m / 60);
  return `dans ${h} h ${String(m % 60).padStart(2, '0')}`;
}
const arriveIn = computed(() => (raid.value ? fmtDelay(raid.value.arrivesAt - now.value) : ''));
/** Le préavis que la Tour donnera — la SEULE chose qu'on ait le droit d'annoncer avant
 *  qu'une armée soit repérée. `nextRaidIn` (le compte à rebours vers l'assaut) a été
 *  retiré : il rendait gratuit ce que ce bâtiment fait payer. */
const scoutLeadLabel = computed(() => {
  const ms = scoutLeadMs(scoutLevel(defenses.value));
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) : ''}`;
});
const freezeIn = computed(() => (freeze.value ? fmtDelay(freeze.value.until - now.value) : ''));
const rotIn = computed(() => (field.value ? fmtDelay(field.value.expiresAt - now.value) : ''));
const healIn = computed(() =>
  base.value?.wound ? fmtDelay(base.value.wound.until - now.value) : '',
);
/** Prix des soins ∝ au repos restant : écourter la fin est une bricole, sauter toute la
 *  convalescence se paie. Attendre reste gratuit — on n'achète que l'immédiateté. */
const healPrice = computed(() => healCost(woundRemainingMs(base.value, now.value)));
/** Ce que la fouille a déjà remonté — le rapport de pillage en cours d’écriture. */
const pillage = computed(() => base.value?.pillage ?? null);
/** ⚠️ DEUX leviers au Chantier, et il faut les deux : le nombre de bras monte par
 *  crans de quatre niveaux, la vitesse à chaque cran (« aucun niveau mort du 0 au
 *  100 », v0.731). Le second ne se voyait nulle part — on l’affiche. */
const scavTrip = computed(() => fmtSpan(scavengeMs(salvageLevel.value)));
const scavIn = computed(() =>
  field.value?.dispatchUntil ? fmtDelay(field.value.dispatchUntil - now.value) : 'imminente',
);

// ── Structures ──
function lvlOf(id: DefenseId): number {
  return defenseLevel(defenses.value, id);
}
function damagedOf(id: DefenseId): boolean {
  return isDamaged(defenses.value, id);
}
function upCost(id: DefenseId): { gold: number; scrap: number } {
  const l = Math.max(1, lvlOf(id));
  return { gold: defenseUpgradeCost(l), scrap: defenseUpgradeScrap(l) };
}
function canBuild(id: DefenseId): boolean {
  const t = DEFENSE_TYPES.find((x) => x.id === id);
  const c = char.row;
  if (!t || !c) return false;
  return heroLevel.value >= t.unlockLevel && c.gold >= t.buildGold && c.scrap >= t.buildScrap;
}
function canUpgrade(id: DefenseId): boolean {
  const c = char.row;
  if (!c || lvlOf(id) >= heroLevel.value) return false;
  const k = upCost(id);
  return c.gold >= k.gold && c.scrap >= k.scrap;
}
function canRepair(id: DefenseId): boolean {
  return (char.row?.scrap ?? 0) >= repairCost(lvlOf(id));
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
const doRepair = (id: DefenseId) => guard(() => char.repairDefense(uid.value, id));
const doRepairAll = () =>
  guard(async () => {
    const cost = await char.repairAll(uid.value);
    if (cost)
      $q.notify({ type: 'positive', message: '🔩 Enceinte réparée — la production repart.' });
  });
const doAutoGarrison = () => guard(() => char.autoAssignGarrison(uid.value, Date.now()));
const doHeal = () =>
  guard(async () => {
    const cost = await char.healHero(uid.value, Date.now());
    if (cost) $q.notify({ type: 'positive', message: '⛑️ Ton héros est de nouveau sur pied.' });
  });
/** Le cumul de la fouille, en puces. ⚠️ Ce sont des COMPTES déjà crédités : les objets
 *  sont partis au sac vague par vague, on n’en récapitule que le NOMBRE. */
const pillagePills = computed(() => {
  const p = pillage.value;
  if (!p) return [];
  return [
    p.gold ? `🪙 +${p.gold}` : '',
    p.summonStones ? `🔮 +${p.summonStones}` : '',
    p.keys ? `🗝️ +${p.keys}` : '',
    p.scrap ? `🔩 +${p.scrap}` : '',
    p.items ? `🎒 ${p.items} objet${p.items > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
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
  const mult = storageMult(bs);
  const rate = new Map<string, number>();
  const cap = new Map<string, number>();
  for (const b of bs) {
    const t = buildingType(b.typeId);
    if (!t?.resource) continue;
    rate.set(t.resource, (rate.get(t.resource) ?? 0) + buildingProdPerHour(b));
    // ⚠️ La capacité vient de `buildingStorageCap`, jamais recalculée ici : c'est elle
    // qui plafonne réellement `buildingAccrued`. Une capacité affichée « à peu près »
    // mentirait exactement au moment où elle compte — quand on sature.
    cap.set(t.resource, (cap.get(t.resource) ?? 0) + buildingStorageCap(b, mult));
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
.keep-legend .up {
  color: #ffb23f;
  font-weight: 700;
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
.signpost line {
  stroke: #5a4c36;
  stroke-width: 2;
  stroke-linecap: round;
}
.sign-board {
  fill: #3a2f1f;
  stroke: var(--accent, #ffd23f);
  stroke-width: 1;
}
.gate-label {
  font-size: 6.6px;
  text-anchor: middle;
  fill: var(--accent, #ffd23f);
  font-weight: 700;
}
.gate:active .sign-board {
  fill: #54432b;
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
.corpse.looted {
  font-size: 14px;
  fill: #5c5346;
  opacity: 0.6;
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
/* ── Chenil : cases de garnison ─────────────────────────────────────────
   Des CASES, pas une liste : l'état se lit d'un coup d'œil et un poste vide
   reste visible. La couleur du liseré est la rareté (mêmes classes .p-* que
   partout ailleurs), le fond dit occupé/libre. */
/* Familier hors d’école : il reste LISIBLE (on doit pouvoir lire pourquoi), il n’est
   simplement plus cliquable. */
.fpick.barred {
  opacity: 0.55;
  border-style: dashed;
}
.sh-gcap {
  font-size: 12.5px;
  color: var(--dim);
  margin: -2px 0 8px;
}
.gslots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.gslot {
  position: relative;
  width: 58px;
  height: 58px;
  border-radius: 12px;
  border: 2px solid var(--rk, var(--line));
  background: #1d1913;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.gslot.empty {
  border-style: dashed;
  border-color: var(--line);
  background: transparent;
}
.gslot.tired {
  opacity: 0.6;
}
.gs-emo {
  font-size: 26px;
  line-height: 1;
}
.gs-plus {
  font-size: 22px;
  color: var(--dim);
}
.gs-def {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 9px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.gs-tired {
  position: absolute;
  left: 2px;
  top: 1px;
  font-size: 11px;
}
/* Zone de bonus : le seul chiffre qui compte le jour du siège. */
.gbonus {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #1a1611;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.gb-h {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.gb-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gb-chip {
  border: 1px solid #7bc86c;
  color: #7bc86c;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.gb-empty {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
/* Sélecteur de familier */
.fpick {
  display: flex;
  gap: 10px;
  width: 100%;
  align-items: flex-start;
  text-align: left;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 6px;
  color: var(--text);
  cursor: pointer;
}
.fpick.here {
  border-color: #7bc86c;
}
.fp-emo {
  font-size: 24px;
}
.fp-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.fp-name {
  font-size: 13px;
}
.fp-role {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ffd23f;
}
.fp-eff {
  font-size: 12px;
  color: var(--dim);
}
.fp-capped {
  font-size: 11px;
  color: var(--dim);
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
/* ⭐ « il y a une décision à prendre ici » — discret mais repérable au coup d'œil. */
.yard-star {
  font-size: 7px;
  text-anchor: middle;
  pointer-events: none;
}
/* ⚖️ Rapport de forces */
.forces {
  margin-bottom: 10px;
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
.f-parts-h {
  margin-top: 12px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
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
.keep-legend {
  display: flex;
  justify-content: space-around;
  font-size: 11px;
  color: var(--dim);
  padding: 6px 0 2px;
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
