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

    <!-- ⚠️ Ni l'or ni la ferraille ici : la barre de l'Aventure, juste au-dessus, les
         affiche déjà. Les répéter volait de la place à ce que cette barre est SEULE à
         savoir dire — le niveau (qui plafonne les bâtiments) et où se trouve le héros. -->
    <div class="bar">
      <span class="bar-chip">Niv. {{ heroLevel }}</span>
      <span v-if="wounded" class="bar-chip hurt">🤕 Héros à l’infirmerie — {{ healIn }}</span>
      <span v-else-if="heroHome" class="bar-chip home">🦸 Héros à la base</span>
      <span v-else class="bar-chip away">🧭 Héros en expédition</span>
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
          <template v-if="i < turretsBuilt">
            <rect
              :x="p.x - 6.5"
              :y="p.y - 8"
              width="13"
              height="16"
              rx="1.5"
              class="tur-body"
              :class="{ damaged: turretsDamaged }"
            />
            <rect
              v-for="k in 3"
              :key="k"
              :x="p.x - 6.5 + (k - 1) * 4.7"
              :y="p.y - 11"
              width="3.6"
              height="3.6"
              class="tur-crown"
              :class="{ damaged: turretsDamaged }"
            />
            <rect :x="p.x - 1" :y="p.y - 3.5" width="2" height="7" rx="1" class="tur-slit" />
          </template>
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
        <div v-if="scout.groups" class="scout-groups">
          <span v-for="(g, i) in scout.groups" :key="i" class="grp" :class="{ champ: g.champion }">
            {{ g.emoji }} ×{{ g.count }} · niv {{ g.level }}
          </span>
        </div>
        <div v-if="scout.forecast" class="forecast">
          🎯 Pronostic : <b>{{ forecastPct }} %</b> de chances de tenir
        </div>
      </div>
      <p class="scout-hint">
        {{ scoutHint }}
      </p>
    </div>
    <div v-else class="panel calm">
      <div class="p-title">🕊️ Aucune menace en vue</div>
      <p v-if="!wallLevel">
        Sans <b>muraille</b>, personne ne vient t’attaquer. C’est à toi d’ouvrir le bal.
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
      <p v-if="wallLevel" class="calm-watch">
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

    <!-- Feuille des emplacements de production, ouverte depuis le dessin. -->
    <VillagePlots v-model:slot="plotSlot" :hero-level="heroLevel" :now="now" />

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
            🐾 Garnison — {{ garrisoned.length }}/{{ slots }} postés
            <span class="sh-gnext">· +1 place au niveau {{ nextSlotLevel }}</span>
          </div>
          <p class="sh-gnote">
            L’<b>espèce</b> décide de ce que le familier apporte au mur. Il reste dans ton sac :
            poster n’est pas ranger.
          </p>
          <div v-if="garrisonSummary.length" class="sh-gsum">
            <span v-for="(g, i) in garrisonSummary" :key="i" class="sh-gchip">{{ g }}</span>
          </div>
          <button v-if="famPool.length" class="cta ghost" @click="doAutoGarrison">
            ✨ Poster automatiquement les meilleurs
          </button>
          <p v-if="!famPool.length" class="dim-note">
            Aucun familier en réserve — le Labyrinthe en donne un à chaque palier nettoyé.
          </p>
          <div v-for="f in famPool" :key="f.id" class="fam" :class="{ on: isPosted(f.id) }">
            <span class="fam-emo">{{ f.emoji }}</span>
            <div class="fam-main">
              <div class="fam-name">
                {{ f.name }}
                <span class="fam-rar" :class="'p-' + f.rarity">{{ RARITY_LABEL[f.rarity] }}</span>
                <span class="fam-lvl" title="Dressage de défense">🛡️ {{ defLvl(f) }}</span>
                <span v-if="isFatiguedNow(f)" class="fam-tired">au repos</span>
              </div>
              <div class="fam-eff">{{ famEffect(f) }}</div>
              <div class="fam-role">
                {{ roleLabel(f) }}
                <span v-if="isFatiguedNow(f)"> · effet de moitié tant qu’il récupère</span>
                <span v-if="defLvlRaw(f) > defLvl(f)" class="fam-capped">
                  · bridé par le Chenil (niv. {{ kennelLevel }})</span
                >
              </div>
            </div>
            <button class="btn" @click="doToggleGarrison(f.id)">
              {{ isPosted(f.id) ? 'Retirer' : 'Poster' }}
            </button>
          </div>
        </div>
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
import SiegeStage from '@/components/SiegeStage.vue';
import { computeCharacter } from '@/lib/character';
import {
  RARITY_LABEL,
  famDefMult,
  playerWithGear,
  famLevel,
  FAMILIAR_SLOT,
  type Item,
} from '@/lib/items';
import { BUILD, buildingAccrued, buildingType, plotsForLevel, storageMult } from '@/lib/buildings';
import {
  scoutLeadMs,
  garrisonLevel,
  DEFENSE_TYPES,
  FACTION_EMOJI,
  FACTION_LABEL,
  FACTION_LOOT,
  TURRET_SLOTS,
  baseCombatant,
  defenseLevel,
  isDamaged,
  repairCost,
  resolveRaid,
  scavengerCount,
  scoutClarity,
  scoutLevel,
  scoutReport,
  turretCount,
  remainingCorpses,
  totalRepairCost,
  defenseUpgradeCost,
  defenseUpgradeScrap,
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
const corpses = computed(() => field.value?.corpses ?? []);
const remaining = computed(() => remainingCorpses(field.value));
const heroHome = computed(() => !char.row?.expedition);

const wallLevel = computed(() => defenseLevel(defenses.value, 'wall'));
const watchLevel = computed(() => defenseLevel(defenses.value, 'watchtower'));
const salvageLevel = computed(() => defenseLevel(defenses.value, 'salvage'));
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
function isPosted(id: string): boolean {
  return (base.value?.garrison ?? []).includes(id);
}
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
    return { x: 100 + Math.cos(a) * WALL_R, y: 100 + Math.sin(a) * WALL_R };
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
  onClick: () => void;
}
// Les 7 emplacements de production en 4 + 3, la seconde rangée DÉCALÉE d'un demi-pas :
// une grille 4×2 laisserait un trou béant au dernier rang, alors que 4 + 3 centré se lit
// comme un village qui épouse l'octogone. ⚠️ Le nombre de cases suit `BUILD.plotCap` (un
// test le verrouille) : ajouter un type de bâtiment demande une position de plus ici.
// ── LA VILLE EN DEUX ANNEAUX ──────────────────────────────────────────────────
// Les 7 ATELIERS contre les remparts (r = 43), les 3 SERVICES autour de la place
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
const PLOT_POS = RING(7, 43, 0);
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
const defOpen = ref<DefenseId | null>(null);
const defSel = computed(() => DEFENSE_TYPES.find((d) => d.id === defOpen.value) ?? null);
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
  forecast: false,
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
      )
    : 0,
);
const scoutHint = computed(() => {
  if (!watchLevel.value) return 'Sans Tour de guet, tu ne sais rien de ce qui arrive.';
  if (clarity.value >= 5) return 'Ta tour lit l’armée à livre ouvert.';
  return 'Monte la Tour de guet pour en savoir plus — et être prévenu plus tôt.';
});

/** Pronostic : Monte-Carlo seedé sur les défenses RÉELLES, comme le 🎯 % des donjons.
 *  Réservé à la clarté maximale : c'est la dernière chose que le renseignement achète. */
const forecastPct = computed(() => {
  const r = raid.value;
  if (!r) return 0;
  const def = baseCombatant(
    defenses.value,
    heroLevel.value,
    heroHome.value ? hero.value : null,
    garrison.value,
  );
  let held = 0;
  for (let i = 0; i < 40; i++) {
    if (resolveRaid(def, { ...r, seed: r.seed + i * 7919 }, 0, heroHome.value).held) held++;
  }
  return Math.round((held / 40) * 100);
});

const hero = computed(() => {
  const c = char.row;
  if (!c) return null;
  const st = computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + c.login_energy,
    c.energy_spent,
  );
  return playerWithGear(c.pseudo, st, c.equipped, {}, st.level.level, c.voie);
});

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
const doToggleGarrison = (id: string) =>
  guard(() => char.toggleGarrison(uid.value, id, Date.now(), heroLevel.value));
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
  ].filter(Boolean);
});
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
.bar-chip.home {
  border-color: #7bc86c;
  color: #7bc86c;
}
.bar-chip.away {
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
.tur-body,
.tur-crown {
  fill: #8a7856;
  stroke: #5a4c36;
  stroke-width: 1;
}
.tur-body.damaged,
.tur-crown.damaged {
  fill: #6b4234;
  stroke: #ff6a45;
}
.tur-slit {
  fill: #14110c;
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
.empty-hint {
  font-size: 8px;
  fill: var(--dim);
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
.sh-garrison {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
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
.scout-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.grp {
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 2px 7px;
  font-size: 12px;
}
.grp.champ {
  border-color: #ffb23f;
  color: #ffb23f;
}
.forecast {
  margin-top: 8px;
  font-size: 13px;
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
.s-head {
  display: flex;
  gap: 10px;
}
.s-emo {
  font-size: 22px;
}
.s-label {
  font-size: 14px;
  font-weight: 600;
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
.s-desc {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
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
.s-gate {
  margin-top: 10px !important;
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
.fam-atk {
  opacity: 0.7;
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
.calm-watch {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
