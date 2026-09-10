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
          <radialGradient id="ground" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#2b241a" />
            <stop offset="100%" stop-color="#1a1610" />
          </radialGradient>
        </defs>

        <!-- Terrain extérieur + champ de bataille -->
        <rect x="0" y="0" width="200" height="200" fill="url(#ground)" />
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
        <!-- Pastille de niveau des tourelles, sur la 1re tour -->
        <g v-if="turretsBuilt" class="lvl-badge">
          <circle :cx="octagon[0]!.x + 7" :cy="octagon[0]!.y - 8" r="5" />
          <text :x="octagon[0]!.x + 7" :y="octagon[0]!.y - 6.2">{{ turretLevel }}</text>
        </g>

        <!-- ── LE CORPS DE GARDE (Tour de guet), au milieu du pan nord ──────
             Plus haut que les tourelles, coiffé d'une bannière : c'est lui qui
             voit venir. Vide → silhouette en pointillés, cliquable pour bâtir. -->
        <g class="hit" @click="openDef('watchtower')">
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
        </g>

        <!-- ── LA PORTE (rempart sud) ───────────────────────────────────────
             C'est par là qu'on sort : elle ouvre la carte des expéditions. Placée
             au milieu du pan SUD, à l'opposé du corps de garde — l'enceinte a donc
             un point d'entrée et un point de sortie, ce qui se lit d'un coup d'œil. -->
        <g class="hit gate" @click="openMap">
          <path :d="gatePath" class="gate-arch" />
          <path :d="gatePath" class="gate-mouth" />
          <path :d="gateArrow" class="gate-arrow" />
          <text x="100" :y="gateLabelY" class="gate-label">Expéditions</text>
        </g>

        <!-- ── LE SOL DE LA COUR ────────────────────────────────────────────
             Sans lui, les tuiles flottaient sur le même fond que l'extérieur : on ne
             voyait pas qu'on était DEDANS. Le pavage arrête le regard aux murs, et la
             ruelle relie la porte (sud) au corps de garde (nord) — l'axe que l'enceinte
             dessine déjà, rendu visible. -->
        <polygon :points="innerPoints" class="yard-ground" />
        <circle cx="100" cy="100" r="9" class="yard-plaza" />

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
        </g>
      </svg>

      <div class="keep-legend">
        <span>🧱 Muraille {{ wallLevel || '—' }}</span>
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
        :familiars="garrisonEmojis"
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

    <div v-if="lastReport" class="panel">
      <div class="p-title">
        {{ lastReport.held ? '🏆 Dernier siège — repoussé' : '💥 Dernier siège — enceinte forcée' }}
      </div>
      <p>
        {{ FACTION_EMOJI[lastReport.faction] }} {{ FACTION_LABEL[lastReport.faction] }} ·
        {{ lastReport.defeated }}/{{ lastReport.total }} groupes repoussés ·
        {{ lastReport.heroHome ? 'héros présent' : 'héros absent' }}
      </p>
      <button class="cta ghost" @click="replaySiege">▶ Revoir l’assaut</button>
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
            <div v-for="(g, i) in scout.groups" :key="i" class="foe" :class="{ champ: g.champion }">
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
        Ta ville n’attire personne tant que son enceinte ne vaut pas la peine d’être attaquée. Il te
        faut <b>muraille</b> et <b>tourelles</b> au niveau <b>{{ readyLevel }}</b> —
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
        Rien à l’horizon. Une armée finira par se mettre en marche — plus tu t’entraînes, plus ta
        base prospère et plus elle attire —, mais tu ne sauras pas quand.
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

    <!-- ── Champ de bataille ── -->
    <div v-if="field" class="panel loot">
      <div class="p-title">🦴 Champ de bataille — {{ remaining }} corps</div>
      <p v-if="!salvageLevel">
        Construis un <b>Fosse commune</b> pour dépouiller les corps avant qu’ils ne pourrissent ({{
          rotIn
        }}).
      </p>
      <template v-else>
        <p>
          {{ scavCap }} fossoyeurs par vague · les corps pourrissent {{ rotIn }}. Tu peux les
          renvoyer autant de fois qu’il le faut.
        </p>
        <!-- ── LES FOUILLEURS SONT RENTRÉS ─────────────────────────────────
             On DÉTAILLE ce qu'ils rapportent AVANT de le ramasser : un bouton qui
             crédite en silence et laisse un toast ne donne rien à regarder, alors
             que c'est le paiement du siège. ⚠️ L'aperçu et la récupération partagent
             la MÊME graine (l'heure de départ) : ce qui est montré est exactement ce
             qui sera crédité. -->
        <div v-if="scavReady && scavLoot" class="scav-back">
          <div class="scav-title">
            🎒 Les fossoyeurs sont rentrés — {{ scavLoot.corpses }} corps dépouillés
          </div>
          <div v-if="scavPills.length" class="scav-pills">
            <span v-for="(b, i) in scavPills" :key="i" class="scav-pill">{{ b }}</span>
          </div>
          <div v-if="scavLoot.items.length" class="scav-items">
            <div v-for="(it, i) in scavLoot.items" :key="i" class="scav-item">
              <span class="scav-emo">{{ it.emoji }}</span>
              <span class="scav-nm">{{ it.name }}</span>
              <span class="scav-rar" :class="'p-' + it.rarity">{{ RARITY_LABEL[it.rarity] }}</span>
              <span class="scav-lvl">Nv {{ it.level }}</span>
            </div>
          </div>
          <p v-if="!scavPills.length && !scavLoot.items.length" class="dim-note">
            Rien de valeur sur ces corps.
          </p>
          <button class="cta" @click="doCollect">
            🎒 Tout ramasser<span v-if="scavLoot.items.length">
              — {{ scavLoot.items.length }} objet{{ scavLoot.items.length > 1 ? 's' : '' }} au
              sac</span
            >
          </button>
        </div>
        <button v-else-if="scavBusy" class="cta ghost" disabled>
          ⏳ Fossoyeurs sur le terrain — {{ scavIn }}
        </button>
        <button v-else-if="remaining > 0" class="cta" @click="doSend">
          🦴 Envoyer les fossoyeurs ({{ Math.min(scavCap, remaining) }} corps)
        </button>
        <p v-else class="done">Le champ est entièrement dépouillé.</p>
      </template>
    </div>

    <GuildPanel :open="guildOpen" @close="guildOpen = false" />

    <!-- Feuille des emplacements de production, ouverte depuis le dessin. -->
    <VillagePlots
      v-model:slot="plotSlot"
      :hero-level="heroLevel"
      :now="now"
      @open-guild="guildOpen = true"
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
          :class="{ here: famPick !== null && garrisonSlotsView[famPick]?.id === f.id }"
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
            <span v-if="defLvlRaw(f) > defLvl(f)" class="fp-capped">
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
import { canPromote } from '@/lib/adventurers';
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

/** Niveau d'accès à l'enceinte. La défense est un système de mi-partie : elle suppose une
 *  économie derrière elle (or, ferraille) et une base qui vaille la peine d'être défendue.
 *  Mesuré, un joueur trop tôt ne tenait aucun siège même en bâtissant à son niveau. */
const defenseUnlockLevel = Math.min(...DEFENSE_TYPES.map((t) => t.unlockLevel));

const props = defineProps<{ embedded?: boolean; inTab?: boolean; siege?: RaidReport | null }>();
const emit = defineEmits<{ 'siege-seen': [] }>();
const inTab = computed(() => !!props.inTab);
const router = useRouter();
const $q = useQuasar();
const char = useCharacterStore();
const auth = useAuthStore();
const progress = useProgress();
const { gameBack, goGame, viewForPath } = useGamePanel();

function back() {
  if (props.embedded) gameBack();
  else router.back();
}
/** Sortir de la base → la carte des expéditions. En cockpit, elle prend le volet droit ;
 *  sinon c'est une route plein écran. */
function openMap() {
  const v = props.embedded ? viewForPath('/expedition-map') : null;
  if (v) return goGame(v);
  void router.push('/expedition-map');
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
  void guard(() => char.setGarrison(uid.value, next.filter(Boolean), Date.now(), heroLevel.value));
}

const garrisoned = computed(() => {
  const ids = new Set(base.value?.garrison ?? []);
  return famPool.value.filter((f) => ids.has(f.id));
});
/** Places de garnison : elles grandissent avec le personnage (une de plus tous les 5
 *  niveaux). Le chenil suit donc le joueur au lieu de rester figé. */
const slots = computed(() => garrisonSlots(heroLevel.value));
const nextSlotLevel = computed(() => (Math.floor(heroLevel.value / 5) + 1) * 5);
const garrison = computed(() =>
  garrisonBonus(garrisoned.value, now.value, kennelLevel.value, slots.value),
);
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
  const b = garrisonBonus([f], now.value, Math.max(1, kennelLevel.value), 1);
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
const garrisonEmojis = computed(() => garrisoned.value.map((f) => f.emoji));
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
/** La flèche de sortie vit DANS l'ouverture, le libellé juste en dessous : dérivés eux
 *  aussi, sinon ils flottent hors de la porte au premier changement de rayon. */
const gateArrow = computed(() => {
  const y = WALL_BOTTOM + 1.5;
  return `M100 ${y} L100 ${y + 12} M95 ${y + 7} L100 ${y + 12} L105 ${y + 7}`;
});
const gateLabelY = computed(() => WALL_BOTTOM + 25.5);
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
const PLOT_POS = RING(BUILD.plotCap, 43, gateOffset(BUILD.plotCap));
// Services : un vers la porte, deux vers le corps de garde — ils encadrent la place.
const SVC_POS = RING(3, 16, Math.PI);
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
      onClick: () => openDef(id),
    });
  });
  return cells;
});

// ── Feuilles ouvertes depuis le dessin ──
const plotSlot = ref<number | null>(null);

// ── Guilde d’aventuriers ──
const guildOpen = ref(false);
const guildLevel = computed(() => char.guildLevel);
/** Promotions en attente : un jalon qu'on ne doit pas rater, donc une ⭐ sur la Guilde.
 *  ⚠️ Une formation EN COURS n'en est pas une : la décision est déjà prise, et proposer
 *  de promouvoir quelqu'un qui est justement en train de l'être n'aurait aucun sens. */
const promoAvailable = computed(
  () => char.advList.filter((a) => !a.training && canPromote(a, guildLevel.value)).length,
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
    intervalMs: raidIntervalMs(progress.sessionsInLastDays(7)),
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
const scavBusy = computed(
  () => !!field.value?.dispatchUntil && now.value < field.value.dispatchUntil,
);
const scavReady = computed(
  () => !!field.value?.dispatchUntil && now.value >= field.value.dispatchUntil,
);
const scavIn = computed(() =>
  field.value?.dispatchUntil ? fmtDelay(field.value.dispatchUntil - now.value) : '',
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
const doSend = () => guard(() => char.sendScavengers(uid.value, Date.now()));
const doAutoGarrison = () =>
  guard(() => char.autoAssignGarrison(uid.value, Date.now(), heroLevel.value));
const doHeal = () =>
  guard(async () => {
    const cost = await char.healHero(uid.value, Date.now());
    if (cost) $q.notify({ type: 'positive', message: '⛑️ Ton héros est de nouveau sur pied.' });
  });
/** Ce que les fossoyeurs rapportent, AVANT de le ramasser. Recalculé à chaque tick,
 *  mais déterministe : la graine est celle du départ. */
const scavLoot = computed(() =>
  scavReady.value ? char.previewScavengers(now.value, heroLevel.value) : null,
);
const scavPills = computed(() => {
  const l = scavLoot.value;
  if (!l) return [];
  return [
    l.gold ? `🪙 +${l.gold}` : '',
    l.summonStones ? `🔮 +${l.summonStones}` : '',
    l.keys ? `🗝️ +${l.keys}` : '',
    // 🔩 l'acier de l'armée repoussée (v0.702) — sans cette ligne, la ferraille était
    // bien créditée mais invisible dans le récapitulatif de fouille.
    l.scrap ? `🔩 +${l.scrap}` : '',
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
const doCollect = () =>
  guard(async () => {
    const got = await char.collectScavengers(uid.value, Date.now(), heroLevel.value);
    if (!got) return;
    $q.notify({
      type: 'positive',
      message: got.items.length
        ? `🎒 Butin ramassé — ${got.items.length} objet${got.items.length > 1 ? 's' : ''} au sac.`
        : '🎒 Butin ramassé.',
    });
  });
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
/* LA PLACE : le cœur laissé libre par les deux anneaux. C'est le vide qui compose —
   sans lui, dix tuiles réparties ne seraient qu'un semis. */
.yard-plaza {
  fill: #2d2619;
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
/* Emplacement de structure encore vide (corps de garde) */
/* La porte : une arche sombre percée dans le rempart, avec sa flèche de sortie. */
.gate-arch {
  fill: #8a7856;
  stroke: #5a4c36;
  stroke-width: 1.5;
}
.gate-mouth {
  fill: #14110c;
  transform: scale(0.72);
  transform-origin: 100px 166px;
}
.gate-arrow {
  fill: none;
  stroke: var(--accent, #ffd23f);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.gate-label {
  font-size: 8px;
  text-anchor: middle;
  fill: var(--accent, #ffd23f);
  font-weight: 700;
}
.gate:active .gate-arrow {
  stroke: #fff;
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
/* ⭐ « il y a une décision à prendre ici » — discret mais repérable au coup d'œil. */
.yard-star {
  font-size: 7px;
  text-anchor: middle;
  pointer-events: none;
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
.scav-items {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
}
.scav-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12.5px;
}
.scav-rar {
  color: var(--rk, var(--dim));
  font-size: 11px;
}
.scav-lvl {
  margin-left: auto;
  font-size: 11px;
  color: var(--dim);
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
