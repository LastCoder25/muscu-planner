<template>
  <!-- 🎰 L'ÉCRAN D'INVOCATION, plein écran (v0.960). ⚠️ Il est monté À CÔTÉ de la feuille
       et non dedans : une modale dans une modale hérite du voile et de la hauteur de sa
       parente, et la roulette s'y retrouverait bridée — le défaut exact du plateau de
       l'arène, corrigé en v0.652. -->
  <GachaReveal
    :plan="revealPlan"
    :verdict="revealVerdict"
    :lot="revealLot"
    :can-again="mana >= pullCost && !busy"
    :busy="busy"
    @close="closeReveal"
    @again="doPull"
  />
  <q-dialog :model-value="open" position="bottom" @update:model-value="emit('close')">
    <q-card class="guild-card">
      <div class="g-head">
        <span class="g-title font-display">🏅 Mes champions</span>
        <!-- 🗿 LA COLLECTION D'ABORD, le plafond ensuite : depuis la v0.958 il n'y a plus de
             banc — tout champion est utilisable, et le Panthéon ne borne que combien on en
             engage À LA FOIS. Opposer les deux (« 5/3 ») laisserait croire l'inverse. -->
        <span class="g-count">{{ roster.length }}</span>
        <span class="g-count g-count-sub">· {{ maxRoster }} engagés à la fois</span>
      </div>

      <p v-if="!pantheonLevel" class="g-empty">
        Construis le <b>Panthéon</b> dans ta cour pour invoquer tes champions.
      </p>

      <template v-else>
        <!-- 🗂️ DEUX ONGLETS (v0.881, demandé) : le vivier, et le STOCK d'équipement où l'on
             voit ses pièces et les confie. Le stock vivait replié sous le vivier, hors écran
             dès quelques aventuriers. -->
        <div v-if="roster.length" class="g-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="g-tab"
            :class="{ on: guildTab === 'roster' }"
            :aria-selected="guildTab === 'roster'"
            @click="guildTab = 'roster'"
          >
            🏅 Champions
          </button>
          <button
            type="button"
            role="tab"
            class="g-tab"
            :class="{ on: guildTab === 'stock' }"
            :aria-selected="guildTab === 'stock'"
            @click="guildTab = 'stock'"
          >
            🗡️ Stock <span class="g-tab-n">{{ char.advGearStock.length }}</span>
          </button>
        </div>

        <!-- 🎰 L'INVOCATION — le seul puits des pierres de mana. ⚠️ Elle est EN TÊTE, et
             au-dessus du recrutement : c'est elle qui remplace l'arbre de classes, le
             recrutement n'est plus là que le temps de la bascule. Le bouton DIT le prix et
             ce qui manque plutôt que de se griser en silence (leçon du gris de la carte,
             v0.738). -->
        <button class="g-summon" :disabled="busy || mana < pullCost" @click="doPull">
          <span class="gs-glow" aria-hidden="true"></span>
          <span class="gs-emo">🎰</span>
          <span class="gs-main">
            <b class="gs-t font-display">Invoquer un champion</b>
            <small v-if="mana >= pullCost">{{ pullCost }} 💠 par tirage</small>
            <small v-else class="gs-short">
              il te manque {{ pullCost - mana }} 💠 — referme une faille
            </small>
          </span>
          <span class="gs-stock font-display">
            <b>{{ pulls }}</b>
            <small>{{ pulls > 1 ? 'tirages' : 'tirage' }}</small>
          </span>
        </button>

        <!-- 🎰 LE LOT DE 10 (v0.968, demandé : « un peu moins cher comme dans les
             gacha ») : 9 payés pour 10, le chiffre est MESURÉ — à 15 % de remise on
             sort de la bande visée (10-20 raretés maximales par an). Il DIT ce qu'il
             économise plutôt que de laisser calculer. -->
        <button class="g-multi" :disabled="busy || mana < multiCost" @click="doPullTen">
          <span class="gm-emo">🎰</span>
          <span class="gm-main">
            <b class="font-display">Invoquer ×{{ multiCount }}</b>
            <small v-if="mana >= multiCost">
              {{ multiCost }} 💠 au lieu de {{ pullCost * multiCount }} — 1 offert
            </small>
            <small v-else class="gs-short">il te manque {{ multiCost - mana }} 💠</small>
          </span>
        </button>

        <!-- 📊 LES CHANCES, ANNONCÉES (v0.966, demandé : « j'ai eu du primordial,
             légendaire, rare, alors que je pensais avoir beaucoup de commun »).
             ⚠️ Mesuré, les taux étaient CONFORMES : le défaut était le SILENCE. Rien ne
             disait ni les taux, ni la garantie tous les 10, ni — surtout — qu'un tirage
             garanti re-tire dans TOUTE la tranche ≥ épique, donc qu'il la dépasse une
             fois sur deux. C'est ce chiffre-là qui explique le ressenti.
             ⚠️ REPLIÉ par défaut : c'est une notice, pas l'action. -->
        <button class="g-odds-t" type="button" @click="oddsOpen = !oddsOpen">
          <span>📊 Chances d'invocation</span>
          <span class="go-chev" :class="{ on: oddsOpen }">▸</span>
        </button>
        <div v-if="oddsOpen" class="g-odds">
          <div v-for="r in odds.rates" :key="r.rarity" class="go-row">
            <span class="go-rar" :style="{ color: RANK_COLOR[r.rarity] }">
              {{ RARITY_LABEL[r.rarity] }}
            </span>
            <span class="go-bar" aria-hidden="true"
              ><i
                :style="{
                  width: (r.pct / odds.rates[0]!.pct) * 100 + '%',
                  background: RANK_COLOR[r.rarity],
                }"
            /></span>
            <span class="go-pct font-display">{{ fmtOdds(r.pct) }} %</span>
          </div>
          <p class="go-note">
            🎁 Un tirage sur {{ odds.floorEvery }} est garanti
            <b>{{ RARITY_LABEL[odds.floorRarity] }}</b> ou mieux — et il le DÉPASSE
            {{ Math.round(odds.aboveFloorPct) }} fois sur 100. Prochain dans
            <b>{{ odds.nextFloorIn }}</b> tirage{{ odds.nextFloorIn > 1 ? 's' : '' }}.
          </p>
          <p class="go-note">
            👑 {{ RARITY_LABEL[TOP_RARITY] }} : <b>{{ fmtOdds(odds.topPct) }} %</b> à ton prochain
            tirage, garanti dans <b>{{ odds.nextTopIn }}</b
            >.
          </p>
        </div>
        <template v-if="guildTab === 'roster' || !roster.length">
          <!-- ⚠️ Le RECRUTEMENT et la PROMOTION ont disparu avec l'arbre de classes
             (v0.951) : on n'élève plus une recrue, on INVOQUE un champion et ses doublons
             le réveillent.
             ⚠️ ON DIT CE QUE LE PLAFOND FAIT, parce qu'il ne se voit nulle part ailleurs :
             il ne met personne au banc, il borne la TAILLE d'un groupe et le nombre de
             défenseurs au rempart. Sans cette ligne, un joueur à 20 champions ne
             comprendrait pas pourquoi il n'en envoie que 8. -->
          <div v-if="roster.length > maxRoster" class="g-note g-full">
            Tes champions sont <b>tous utilisables</b> — mais tu n’en engages que
            <b>{{ maxRoster }}</b> à la fois : c’est la taille d’un groupe, et le nombre de
            défenseurs qui tiennent le rempart. <b>Monte le Panthéon</b> pour en engager un de plus.
          </div>
          <!-- ✨ CONFIER AU MIEUX, EN TÊTE (demandé) : un compagnon et un talent à chacun,
             selon son profil, dans les règles des sélecteurs. ⚠️ Il ANNONCE ce qu'il va
             faire avant qu'on touche (gain de puissance, nombre de changements) et se tait
             quand il n'y a rien à gagner : il remplace les choix faits à la main, on ne
             doit pas le découvrir après coup. -->
          <template v-if="roster.length">
            <!-- 🎨 UN BOUTON QUI SE LIT EN TROIS TEMPS (demandé : « plus design ») : l’action
               (pastille ✨ + titre), ce qu’elle touche (sous-titre), ce qu’elle rapporte
               (le gain, en vert, là où l’œil finit). Au repos il se calme — contour
               neutre, coche verte — pour ne pas appeler un geste qui ne sert à rien. -->
            <button
              type="button"
              class="g-auto"
              :class="{ idle: !autoPreview.changes }"
              :disabled="busy || !autoPreview.changes"
              @click="autoPair"
            >
              <span class="ga-ico" aria-hidden="true">{{ autoPreview.changes ? '✨' : '✓' }}</span>
              <span class="ga-txt">
                <span class="ga-title">{{
                  autoPreview.changes ? 'Confier au mieux' : 'Tout est déjà au mieux'
                }}</span>
                <span class="ga-sub">
                  <template v-if="autoPreview.pending"
                    >{{ autoPreview.pending }} emplacement{{ autoPreview.pending > 1 ? 's' : '' }} à
                    armer</template
                  ><template v-else>🐾 familiers · 🧠 talents · 🗡️ équipement</template
                  ><template v-if="autoPreview.changes">
                    · {{ autoPreview.changes }} aventurier{{
                      autoPreview.changes > 1 ? 's' : ''
                    }}</template
                  >
                </span>
              </span>
              <!-- Un emplacement VIDE qu'on peut remplir passe DEVANT le gain : c'est plus
                   parlant qu'un nombre de puissance, et c'est ce qu'on voit sur le portrait. -->
              <span v-if="autoPreview.pending" class="ga-gain pend">
                {{ autoPreview.pending }}<small>🗡️</small>
              </span>
              <span v-else-if="autoPreview.changes && autoPreview.gain > 0" class="ga-gain">
                +{{ fmtPow(autoPreview.gain) }}<small>⚔️</small>
              </span>
            </button>
            <div v-if="autoPreview.changes" class="g-note dim ga-note">
              Remplace les choix faits à la main.
            </div>
          </template>
          <!-- ── Le vivier ── -->
          <div v-if="!roster.length" class="g-empty">
            Personne encore. Recrute ton premier aventurier — il escortera tes caravanes.
          </div>
          <!-- 🖼️ LE VIVIER EN PORTRAITS (v0.807 ; demandé par l'utilisateur) : chaque
             aventurier est présenté comme le héros à l'entrée de l'Aventure — avatar au
             centre selon sa classe, étoiles de rang sur l'anneau, quatre ronds aux coins.
             Toucher le portrait ouvre sa FICHE ; toucher le familier ou le talent de
             l'avatar ouvre directement leur sélecteur. -->
          <!-- 🔎 FILTRE PAR ÉTAT (demandé). Les catégories VIDES ne sont pas proposées : une
               puce « 0 » n'apprend rien et prend la place d'une qui compte. -->
          <div v-if="rosterChips.length > 1" class="adv-filter">
            <button
              type="button"
              class="af-chip"
              :class="{ on: rosterFilter === null }"
              @click="rosterFilter = null"
            >
              Tous <span class="g-tab-n">{{ roster.length }}</span>
            </button>
            <button
              v-for="s in rosterChips"
              :key="s"
              type="button"
              class="af-chip"
              :class="['tone-' + s, { on: rosterFilter === s }]"
              @click="rosterFilter = s"
            >
              {{ ADV_STATUS_LABEL[s] }} <span class="g-tab-n">{{ rosterCounts.get(s) }}</span>
            </button>
          </div>
          <div v-if="roster.length" class="adv-grid">
            <AdventurerPortrait
              v-for="a in rosterShown"
              :key="a.id"
              :adv="a"
              :look="lookOf(a)"
              :familiar="famOf(a)"
              :talent-icon="talIconOf(a)"
              :power="powerOf(a)"
              :state="stateOf(a)"
              :tone="statusOf(a)"
              :disabled="busy"
              :gear="gearCellsOf(a)"
              @gear="(slot) => (gearPick = { advId: a.id, slot })"
              @open="detailAdv = a"
              @familiar="pairFor = a"
              @talent="talFor = a"
            />
          </div>
        </template>

        <!-- ── 🗡️ LE STOCK D'ÉQUIPEMENT (onglet) ─────────────────────────────────────
             ⚠️ Ce n'est PAS le sac du héros : ces pièces sont propres à chaque classe de
             base (`canWearAdvGear`) — fabriquées par l'Équipementier, ou tombées des
             cadavres d'un siège et des embuscades repoussées (jamais du butin du héros).
             « Équiper » ouvre la liste des aventuriers qui peuvent la porter.
             🔒 / 🪙 comme le sac, désactivés si portée. -->
        <template v-else>
          <p v-if="!char.advGearStock.length" class="g-empty">
            Aucune pièce en stock. Le <b>Panthéon</b> en fabrique à partir des objets de ton sac, et
            les sièges repoussés comme les embuscades en laissent tomber.
          </p>
          <!-- 🔎 FILTRE (demandé) : ce qui attend preneur, ce qui est CONFIÉ, ou tout.
               ⚠️ C'étaient deux SOUS-ONGLETS (v0.908) ; ils deviennent les MÊMES puces que
               le vivier — un seul dispositif de filtre dans la Guilde, mêmes teintes
               (vert = disponible, jaune = confié) que les cadres des tuiles. -->
          <template v-else>
            <div class="adv-filter">
              <button
                type="button"
                class="af-chip"
                :class="{ on: stockTab === null }"
                @click="stockTab = null"
              >
                Tous <span class="g-tab-n">{{ char.advGearStock.length }}</span>
              </button>
              <button
                type="button"
                class="af-chip tone-free"
                :class="{ on: stockTab === 'free' }"
                @click="stockTab = 'free'"
              >
                📦 Disponibles <span class="g-tab-n">{{ stockFree.length }}</span>
              </button>
              <button
                type="button"
                class="af-chip tone-busy"
                :class="{ on: stockTab === 'worn' }"
                @click="stockTab = 'worn'"
              >
                🗡️ Portées <span class="g-tab-n">{{ stockWorn.length }}</span>
              </button>
            </div>
            <!-- Un état vide qui DIT laquelle des deux situations on regarde : « aucune
                 pièce » sous un onglet se lit sinon comme un stock vide. -->
            <p v-if="!stockShown.length" class="g-empty">
              {{
                stockTab === 'free'
                  ? 'Tout ton stock est confié — aucune pièce n’attend preneur.'
                  : 'Aucune pièce confiée pour l’instant : va les attribuer depuis « Disponibles ».'
              }}
            </p>
            <!-- ⚠️ Ce qu'aucune ligne ne dirait : une pièce peut attendre sans que PERSONNE
                 ne puisse la porter (métier absent du vivier, ou classe trop basse). Sans
                 cette note, on ouvre « Équiper » et la liste est vide sans explication. -->
            <p v-else-if="stockTab === 'free' && stockOrphans" class="g-note dim">
              ⚠️ {{ stockOrphans }} de ces pièces ne trouvent preneur dans ton vivier — mauvais
              métier, ou classe trop basse pour leur rang.
            </p>
            <!-- TUILES en 2 colonnes (3 dès qu'il y a la place, `auto-fill`), boutons en
                 ICÔNES : la liste était en pleine largeur avec des boutons libellés, donc
                 chaque pièce coûtait une bande entière et on faisait défiler longtemps. -->
            <div class="gear-stock">
              <div
                v-for="g in stockShown"
                :key="g.id"
                class="gear-stock-row"
                :class="ownerOf(g) ? 'tone-busy' : 'tone-free'"
              >
                <div class="gear-stock-top">
                  <span class="d-pair-emo">{{ g.emoji }}</span>
                  <span class="d-pair-main">
                    <span class="d-pair-name">
                      <b :style="{ color: rarityRank(g.rarity).color }">{{ g.name }}</b>
                      <span class="d-train">niv {{ g.level }}</span>
                    </span>
                    <!-- Le RANG et ses ÉTOILES : la liste ne donnait que la couleur du nom,
                       donc deux pièces du même rang mais de jets opposés s'y lisaient
                       pareil — or le jet décide d'une part de leur valeur. -->
                    <!-- ⚠️ Deux éléments FLEX plutôt qu'un « · » entre deux textes : en
                         colonne étroite la lignée passe à la ligne et le séparateur restait
                         orphelin en bout de ligne précédente. -->
                    <span class="d-pair-sub gear-meta">
                      <span class="d-rk" :style="{ '--rk': rarityRank(g.rarity).color }">{{
                        gradeLabel(g)
                      }}</span>
                      <span>{{ lineageLabel(g.lineage) }}</span>
                      <!-- ⚠️ Le PORTEUR rejoint la ligne de méta (et non la sienne) : une
                           ligne de moins par tuile, sans rien perdre — le cadre jaune dit
                           déjà « confiée », la flèche dit à QUI. Il garde sa couleur
                           d'état : un empêchement n'est pas une métadonnée. -->
                      <span v-if="ownerOf(g)" class="warn">→ {{ ownerOf(g)?.name }}</span>
                    </span>
                    <!-- Les effets sur UNE ligne : c'est ce qui départage deux pièces, donc
                         ça reste en pleine couleur, mais une ligne par effet faisait des
                         tuiles de hauteurs très inégales.
                         ⚠️ Des éléments FLEX séparés par un `gap`, jamais un « · » entre deux
                         textes : en colonne étroite le second effet passe à la ligne et le
                         séparateur reste orphelin en bout de ligne précédente — le défaut que
                         la ligne de méta juste au-dessus documente déjà (constaté au banc). -->
                    <span class="d-gain gear-fx">
                      <span v-for="(t, i) in gearEffectTexts(g)" :key="i">{{ t }}</span>
                    </span>
                  </span>
                </div>
                <!-- ⚠️ ICÔNES SEULES, mais chacune garde son `title`/`aria-label` complet :
                     le libellé disparaît de l'écran, jamais du lecteur d'écran ni de
                     l'infobulle. Le prix de vente y passe aussi — et la confirmation le
                     redit avant de valider, donc rien ne se vend sans l'avoir vu. -->
                <div class="gear-actions-row">
                  <button
                    type="button"
                    class="gear-btn equip"
                    :disabled="busy"
                    :title="ownerOf(g) ? 'Changer de porteur' : 'Confier à un champion'"
                    :aria-label="ownerOf(g) ? 'Changer de porteur' : 'Confier à un champion'"
                    @click="stockEquip = g"
                  >
                    🗡️
                  </button>
                  <button
                    type="button"
                    class="gear-btn"
                    :class="{ active: g.locked }"
                    :title="g.locked ? 'Déverrouiller' : 'Verrouiller (protège de la vente)'"
                    :aria-label="g.locked ? 'Déverrouiller' : 'Verrouiller'"
                    @click="toggleGearLock(g)"
                  >
                    {{ g.locked ? '🔒' : '🔓' }}
                  </button>
                  <button
                    type="button"
                    class="gear-btn"
                    :disabled="!!g.locked || !!ownerOf(g)"
                    :title="`Vendre (+${advGearSellValue(g)} 🪙)`"
                    :aria-label="`Vendre pour ${advGearSellValue(g)} or`"
                    @click="sellOneGear(g)"
                  >
                    🪙
                  </button>
                </div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <div class="g-actions">
        <q-btn flat no-caps label="Fermer" @click="emit('close')" />
      </div>
    </q-card>
  </q-dialog>

  <!-- ── FICHE D'UN AVENTURIER ──────────────────────────────────────────────
         Tout ce que le vivier ne peut pas montrer sans devenir illisible.
         ⚠️ Toujours PAS de niveau : c'est la règle posée à la conception (« un aventurier
         de manga »). Le rang et la barre disent où il en est ; le nombre, jamais. -->
  <q-dialog :model-value="!!detailAdv" position="bottom" @update:model-value="detailAdv = null">
    <q-card v-if="detailAdv" class="guild-card">
      <div class="g-head">
        <span class="g-title font-display">
          {{ titleOf(detailAdv)?.emoji ?? '🧑' }} {{ detailAdv.name }}
        </span>
        <span class="adv-rank" :style="{ color: rankOf(detailAdv).color }">
          {{ rankOf(detailAdv).emoji }} {{ rankOf(detailAdv).name }}
          {{ stars(rankOf(detailAdv).star) }}
        </span>
      </div>

      <!-- 🏅 CE QU'IL EST : la rareté tirée, qui ne bouge jamais.
           ⚠️ Le titre n'est repris QUE s'il n'est pas son nom — `advTitle` rend le NOM d'un
           champion, donc cette ligne répétait le titre affiché juste au-dessus. -->
      <div class="d-sub">
        <b :style="{ color: nomColor(detailAdv) }">{{ nomOf(detailAdv) }}</b>
        <template v-if="subOf(detailAdv)"> · {{ subOf(detailAdv) }}</template>
        · {{ advShapeLabel(statWeights(detailAdv)) }}
      </div>

      <!-- ⚔️ La puissance, et ce que la PAIRE y ajoute : sans l’écart, on ne sait pas si
           le compagnon et le talent confiés servent à quelque chose. -->
      <div class="d-pow">
        <span class="d-pow-val font-display">⚔️ {{ fmtPow(powerOf(detailAdv)) }}</span>
        <span v-if="pairBonusOf(detailAdv) > 0" class="d-pow-gain">
          dont +{{ fmtPow(pairBonusOf(detailAdv)) }} grâce à son compagnon, son talent et son
          équipement
        </span>
        <span v-else class="d-pow-gain">sans compagnon, talent ni équipement qui compte</span>
      </div>

      <!-- Les STATS, qui n'étaient lisibles nulle part une fois la promotion faite. -->
      <div class="d-stats">
        <span class="d-stat">💪 {{ statsOf(detailAdv).puissance }}</span>
        <span class="d-stat">❤️ {{ statsOf(detailAdv).endurance }}</span>
        <span class="d-stat">⚡ {{ statsOf(detailAdv).agilite }}</span>
      </div>

      <!-- 🗡️ SES 4 EMPLACEMENTS D'ÉQUIPEMENT — une pièce par métier, jamais deux fois
           la même stat qu'un objet du héros : le Chenil n'y est pour rien, c'est
           l'Équipementier qui les fabrique et le sélecteur qui filtre par lignée et
           rareté de classe (`canWearAdvGear`). -->
      <div class="d-gear">
        <button
          v-for="s in detailGearSlots"
          :key="s.slot"
          type="button"
          class="d-gear-slot"
          :class="{ empty: !s.piece }"
          @click="gearPick = { advId: detailAdv.id, slot: s.slot }"
        >
          <span class="dg-emo">{{ s.emoji }}</span>
          <span class="dg-name" :style="s.color ? { color: s.color } : {}">{{ s.name }}</span>
          <!-- Rang (même lecture que familiers et talents) et stat principale : on voit
               ce qu'il porte d'un coup d'œil, sans ouvrir le sélecteur (v0.865). -->
          <span v-if="s.rank" class="dg-rk" :style="{ color: s.color }">{{ s.rank }}</span>
          <span v-if="s.stat" class="dg-stat">{{ s.stat }}</span>
          <!-- Ce que la pièce APPORTE : la stat seule ne se compare pas d'une pièce à
               l'autre (des dégâts contre de la réduction) et ne dit pas son assiette. -->
          <span v-if="(detailGearGain.get(s.slot) ?? 0) > 0" class="dg-gain"
            >⚔️ +{{ fmtPow(detailGearGain.get(s.slot) ?? 0) }}</span
          >
        </button>
      </div>

      <div class="adv-bar" :title="barTitle(detailAdv)">
        <span class="adv-fill" :style="{ width: Math.round(progressOf(detailAdv) * 100) + '%' }" />
      </div>

      <div class="d-state">
        <template v-if="hurtOf(detailAdv)">
          🛏️ à l'infirmerie · {{ leftOf(hurtOf(detailAdv)) }}
        </template>
        <template v-else-if="busyOf(detailAdv)">
          🐫 en route · {{ leftOf(busyOf(detailAdv)) }}
        </template>
        <template v-else>✅ disponible</template>
      </div>

      <!-- ⚠️ LE PARCOURS est la vraie raison d'être de cette fiche : chaque promotion est
             un choix DÉFINITIF, et il n'existait aucun endroit pour relire la suite de
             choix qui a fait cet aventurier. -->
      <div class="d-sec">🧭 Parcours</div>
      <div class="d-path">
        <span v-for="(c, i) in pathOf(detailAdv)" :key="i" class="d-step">
          {{ c.emoji }} {{ c.label }}
        </span>
      </div>

      <!-- ⚠️ Une compétence apprise DEUX FOIS n'est pas listée deux fois : elle monte
           d'un NIVEAU, et son effet suit. Répétée, elle se lisait comme un bug. -->
      <div v-if="rolesOf(detailAdv).length" class="d-sec">🐫 Sur les convois</div>
      <div v-if="rolesOf(detailAdv).length" class="d-perks">
        <span v-for="s in rolesOf(detailAdv)" :key="s.what" class="d-perk">
          {{ ADV_ROLE_LABEL[s.what] }}
          <b v-if="s.level > 1" class="d-lvl">Nv {{ s.level }}</b>
        </span>
      </div>

      <div v-if="sigLabelsOf(detailAdv).length" class="d-sec">⚔️ Au combat</div>
      <div v-if="sigLabelsOf(detailAdv).length" class="d-perks">
        <span v-for="s in sigLabelsOf(detailAdv)" :key="s.label" class="d-perk sig">
          {{ s.label }}
          <b v-if="s.level > 1" class="d-lvl">Nv {{ s.level }}</b>
        </span>
      </div>

      <p v-if="!rolesOf(detailAdv).length && !sigLabelsOf(detailAdv).length" class="g-note">
        Ni rôle de convoi ni signature — de la stat brute.
      </p>

      <!-- ── 🐾🧠 SA PAIRE ────────────────────────────────────────────────────
           ⚠️ C’est ICI que l’on confie un familier et un talent, pas au Chenil :
           ils appartiennent à un HOMME et le suivent partout — convoi comme
           rempart. Le Chenil ne fait que plafonner combien et jusqu’à quel rang. -->
      <div class="d-sec">🐾 Sa paire</div>
      <button type="button" class="d-pair" @click="pairFor = detailAdv">
        <span class="d-pair-emo">{{ detailFam?.emoji ?? '＋' }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ detailFam?.name ?? 'Aucun compagnon' }}
            <span v-if="detailFam" class="d-rk" :style="{ '--rk': famColor(detailFam) }">{{
              rarityRank(detailFam.rarity).name
            }}</span>
          </span>
          <span v-for="(g, i) in detailFamGain" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ famNote(detailAdv) }}</span>
        </span>
      </button>
      <button type="button" class="d-pair" @click="talFor = detailAdv">
        <span class="d-pair-emo">{{ detailTal ? '🧠' : '＋' }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ talLabel(detailAdv) }}
            <span v-if="detailTal" class="d-rk" :style="{ '--rk': talColor(detailTal) }">{{
              rarityRank(talentRankOf(detailTal)).name
            }}</span>
          </span>
          <span v-for="(g, i) in detailTalGain" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ talNote(detailAdv) }}</span>
        </span>
      </button>

      <div class="g-actions">
        <q-btn flat no-caps label="Fermer" @click="detailAdv = null" />
      </div>
    </q-card>
  </q-dialog>

  <!-- ── SÉLECTEUR DE COMPAGNON ───────────────────────────────────────────
       ⚠️ Seuls les familiers VRAIMENT disponibles et équipables sont listés (v0.808,
       demandé par l’utilisateur) — la règle vit dans `companionOptions` (lib). Ce qui est
       écarté est COMPTÉ, par raison, en une ligne : masquer sans rien dire donnerait
       l’impression d’avoir perdu un familier. -->
  <q-dialog :model-value="!!pairFor" position="bottom" @update:model-value="pairFor = null">
    <q-card class="sheet">
      <div class="g-head">
        <div class="g-title font-display">🐾 Son compagnon</div>
        <button class="iconbtn" aria-label="Fermer" @click="pairFor = null">✕</button>
      </div>
      <p class="g-note">
        Chenil niveau {{ kennelLevel }} — rang max <b>{{ rankCapLabel }}</b> · {{ pairedCount }}/{{
          slots
        }}
        compagnons confiés
      </p>
      <!-- ⚠️ On le dit UNE fois, en tête : le chiffre listé n’est pas celui de la fiche du
           familier. Sans ça, lire « +4,2% » ici et « +10,5% » sur le même loup dans
           l’inventaire se lit comme un bug. -->
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <button v-if="pairFor && famOf(pairFor)" class="cta ghost" @click="assignFam(null)">
        Reprendre son compagnon
      </button>
      <p v-if="!famPool.length" class="g-note">
        Aucun familier en réserve — le Labyrinthe en donne un à chaque palier nettoyé.
      </p>
      <p v-else-if="!famRows.length" class="g-note">Aucun familier disponible pour lui.</p>
      <p v-if="famHidden" class="g-note dim">{{ famHidden }}</p>
      <button
        v-for="r in famRows"
        :key="r.f.id"
        type="button"
        class="d-pick"
        :class="{ here: pairFor && famOf(pairFor)?.id === r.f.id }"
        @click="assignFam(r.f.id)"
      >
        <span class="d-pair-emo">{{ r.f.emoji }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ r.f.name }}
            <span class="d-rk" :style="{ '--rk': r.color }">{{ rarityRank(r.f.rarity).name }}</span>
            <span
              v-if="r.train"
              class="d-train"
              title="Dressage de défense, et ce que ton Chenil en retient"
              >{{ r.train }}</span
            >
          </span>
          <span v-for="(g, i) in r.gains" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ r.meta }}</span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="pairFor = null" /></div>
    </q-card>
  </q-dialog>

  <!-- ── SÉLECTEUR DE TALENT ─────────────────────────────────────────────── -->
  <q-dialog :model-value="!!talFor" position="bottom" @update:model-value="talFor = null">
    <q-card class="sheet">
      <div class="g-head">
        <div class="g-title font-display">🧠 Son talent</div>
        <button class="iconbtn" aria-label="Fermer" @click="talFor = null">✕</button>
      </div>
      <button v-if="talFor && talOf(talFor)" class="cta ghost" @click="assignTal(null)">
        Reprendre son talent
      </button>
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <p v-if="!talPool.length" class="g-note">Aucun talent libre — les tiens sont équipés.</p>
      <p v-else-if="!talRows.length" class="g-note">Aucun talent disponible pour lui.</p>
      <p v-if="talHidden" class="g-note dim">{{ talHidden }}</p>
      <button
        v-for="r in talRows"
        :key="r.t.id"
        type="button"
        class="d-pick"
        :class="{ here: talFor && talOf(talFor)?.id === r.t.id }"
        @click="assignTal(r.t.id)"
      >
        <span class="d-pair-emo">{{ r.icon }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ r.name }}
            <span class="d-rk" :style="{ '--rk': r.color }">{{ rarityRank(r.rank).name }}</span>
          </span>
          <span v-for="(g, i) in r.gains" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ r.meta }}</span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="talFor = null" /></div>
    </q-card>
  </q-dialog>

  <!-- ── À QUI CONFIER CETTE PIÈCE ? (depuis le stock) ─────────────────────
       ⚠️ Seuls ceux qui PEUVENT la porter sont proposés (`canWearAdvGear` : son métier,
       rang de sa classe) — les autres sont comptés, par raison. -->
  <q-dialog :model-value="!!stockEquip" position="bottom" @update:model-value="stockEquip = null">
    <q-card v-if="stockEquip && stockEquipRows" class="guild-card">
      <div class="g-head">
        <div class="g-title font-display">
          {{ stockEquip.emoji }}
          <span :style="{ color: rarityRank(stockEquip.rarity).color }">{{ stockEquip.name }}</span>
        </div>
        <button class="iconbtn" aria-label="Fermer" @click="stockEquip = null">✕</button>
      </div>
      <p class="g-note">
        {{ lineageLabel(stockEquip.lineage) }} · {{ gradeLabel(stockEquip) }} ·
        {{ advGearEffectTexts(stockEquip).join(' · ') }}
      </p>
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <button v-if="ownerOf(stockEquip)" class="cta ghost" :disabled="busy" @click="unequipStock">
        Retirer à {{ ownerOf(stockEquip)?.name }}
      </button>
      <p v-if="!stockEquipRows.rows.length" class="g-note">
        Personne ne peut la porter pour l’instant.
      </p>
      <p v-if="stockEquipRows.hidden" class="g-note dim">{{ stockEquipRows.hidden }}</p>
      <button
        v-for="r in stockEquipRows.rows"
        :key="r.a.id"
        type="button"
        class="d-pick"
        :class="{ here: r.here }"
        :disabled="busy || r.here"
        @click="equipStock(r.a)"
      >
        <span class="d-pair-emo">{{ titleOf(r.a)?.emoji ?? '🧑' }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            <b>{{ r.a.name }}</b>
            <span class="d-train" :style="{ color: rankOf(r.a).color }">{{
              rankOf(r.a).name
            }}</span>
          </span>
          <span class="d-pair-sub">{{
            r.wearing ? 'porte ' + r.wearing : 'emplacement vide'
          }}</span>
          <span class="d-gain" :class="{ neg: r.power < r.cur }">
            ⚔️ {{ fmtDelta(r.cur, r.power) }}
          </span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="stockEquip = null" /></div>
    </q-card>
  </q-dialog>

  <!-- ── SÉLECTEUR DE PIÈCE D'ÉQUIPEMENT ───────────────────────────────────
       ⚠️ Seules les pièces permises pour SON métier et SA classe sont listées
       (`advGearOptions` : `canWearAdvGear`) — le reste est compté, par raison. -->
  <q-dialog :model-value="!!gearPick" position="bottom" @update:model-value="gearPick = null">
    <q-card v-if="gearRows" class="guild-card">
      <div class="g-head">
        <div class="g-title font-display">🗡️ Sa pièce</div>
        <button class="iconbtn" aria-label="Fermer" @click="gearPick = null">✕</button>
      </div>
      <p class="g-note">Pièces permises pour son métier et sa classe.</p>
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <button v-if="gearHereId" class="cta ghost" @click="pickGear(null)">Retirer la pièce</button>
      <p v-if="!gearPool.length" class="g-note">Aucune pièce en stock — le Panthéon en fabrique.</p>
      <p v-else-if="!gearRows.rows.length" class="g-note">Aucune pièce disponible pour lui.</p>
      <p v-if="gearHidden" class="g-note dim">{{ gearHidden }}</p>
      <button
        v-for="r in gearRows.rows"
        :key="r.g.id"
        type="button"
        class="d-pick"
        :class="{ here: gearHereId === r.g.id }"
        @click="pickGear(r.g.id)"
      >
        <span class="d-pair-emo">{{ r.g.emoji }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            <b :style="{ color: r.color }">{{ r.g.name }}</b>
            <span class="d-train">niv {{ r.g.level }}</span>
          </span>
          <span v-for="(t, i) in r.texts" :key="i" class="d-gain">{{ t }}</span>
          <span class="d-gain" :class="{ neg: r.power < gearRows.curPower }">
            ⚔️ {{ fmtDelta(gearRows.curPower, r.power) }}
          </span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="gearPick = null" /></div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
// Le panneau de la Guilde : le vivier, son rang, sa BARRE, le recrutement et les
// promotions. ⚠️ On n'affiche JAMAIS le niveau d'un aventurier — seulement son rang et
// l'avancement vers l'étoile suivante. C'est la règle posée dès la conception (« un
// aventurier de manga »), et c'est aussi ce qui rend la barre indispensable.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import {
  ADV_STARS,
  advNominalRarity,
  advRarity,
  advRank,
  advRankProgress,
  advStatus,
  ADV_STATUSES,
  ADV_STATUS_LABEL,
  type AdvStatus,
  advTitle,
  advClass,
  advRoleLevels,
  advSignatureLevels,
  advStats,
  compareAdventurers,
  advShapeLabel,
  ADV_ROLE_LABEL,
  ADV_SIGNATURE_LABEL,
  type Adventurer,
} from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import { awakenLevel, engageCap } from '@/lib/adventurers';
import GachaReveal from './GachaReveal.vue';
import { buildReveal, bestOfLot, type RevealPlan, type LotItem } from '@/lib/gachaReveal';
import { GACHA, TOP_RARITY, gachaOdds, multiPullCost } from '@/lib/gacha';
import {
  RANK_COLOR,
  RARITY_LABEL,
  rarityRank,
  gradeLabel,
  RARITY_RANK,
  FAMILIAR_SLOT,
  aggregateLines,
  famLevel,
  famXp,
  jetStar,
  type Item,
} from '@/lib/items';
import {
  normalizeTalents,
  talentByCode,
  talentStar,
  talentRankOf,
  type TalentInstance,
} from '@/lib/talents';
import {
  companionSlots,
  companionRankLabel,
  companionPairs,
  adventurerPowers,
  adventurerGearPower,
  autoCompanions,
  autoAdvGear,
  companionOptions,
  talentOptions,
  type CompanionCtx,
} from '@/lib/raid';
import { fmtPow, fmtDelta } from '@/lib/combat';
import AdventurerPortrait from '@/components/AdventurerPortrait.vue';
import { companionEffects, advTalentEffects } from '@/lib/caravan';
import {
  ADV_GEAR_SLOTS,
  advGearCells,
  advGearEffectTexts,
  advGearOptions,
  advGearSellValue,
  advLooks,
  canWearAdvGear,
  pendingAdvGear,
  lineageOf,
  wornGear,
  type AdvGear,
  type AdvGearCell,
  type AdvGearSlot,
  type AdvLook,
  type Lineage,
} from '@/lib/advGear';

defineProps<{
  open: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

// ── 🐾🧠 LA PAIRE : un compagnon et un talent, confiés à un HOMME ───────────────
// ⚠️ Ils le suivent PARTOUT (convoi comme rempart) : c’est pour ça que l’appariement
// vit sur SA fiche et pas au Chenil. Le Chenil ne fait que plafonner combien et
// jusqu’à quel rang — comme la Guilde pour les aventuriers, sauf qu’il ne les crée pas.
const pairFor = ref<Adventurer | null>(null);
const talFor = ref<Adventurer | null>(null);
const kennelLevel = computed(() => char.kennelLevel);
const slots = computed(() => companionSlots(kennelLevel.value));
const rankCapLabel = computed(() => companionRankLabel(kennelLevel.value));
const heroFamId = computed(() => char.row?.equipped?.[FAMILIAR_SLOT]?.id ?? null);
const famPool = computed(() =>
  (char.row?.inventory ?? []).filter((it: Item) => it.slot === FAMILIAR_SLOT),
);
/** Les talents LIBRES : ceux que le héros n’a pas équipés. Un talent ne peut pas être
 *  à deux endroits — c’est la même règle que le compagnon. */
const talPool = computed(() =>
  normalizeTalents(char.row?.talents ?? []).filter((t) => t.equipped !== true),
);
/** Le contexte d’appariement. ⚠️ UN seul objet pour le compteur ET la puissance : deux
 *  copies finiraient par ne pas retenir les mêmes paires. */
const compCtx = computed<CompanionCtx>(() => ({
  familiars: famPool.value,
  talents: talPool.value,
  kennelLevel: kennelLevel.value,
  // L’horloge du panneau : la fatigue d’un compagnon compte, et elle passe.
  now: now.value,
  // 🗡️ Ce qu’ils portent (stock `adv_gear`, migr. 0068).
  advGear: char.row?.adv_gear?.stock ?? [],
  heroFamiliarId: heroFamId.value,
}));
const pairedCount = computed(() => companionPairs(char.advList, compCtx.value).size);
/** ⚔️ Puissances calculées par la LIB (`combatPower`, celle du héros) — jamais ici. La
 *  version NUE sert à dire ce que la paire ajoute. */
const powers = computed(() => adventurerPowers(char.advList, compCtx.value));
/** Ce qui attend un porteur, pour tout le vivier — lu par les PORTRAITS et par l'aperçu du
 *  BOUTON, donc une seule et même réponse à « y a-t-il à armer ? ». Deux calculs finiraient
 *  par se contredire : une case en appel et un bouton muet, ou l'inverse.
 *  ⚠️ Déclarée AVANT ses lecteurs : un `computed` lirait une source déclarée plus bas sans
 *  broncher, mais l'ordre du fichier doit rester évident (zone morte temporelle, v0.910). */
const gearPending = computed(() => pendingAdvGear(char.advList, compCtx.value.advGear));
const barePowers = computed(() => adventurerPowers(char.advList));
const powerOf = (a: Adventurer) => powers.value.get(a.id) ?? 0;
const pairBonusOf = (a: Adventurer) => powerOf(a) - (barePowers.value.get(a.id) ?? 0);
const famById = computed(() => new Map(famPool.value.map((f) => [f.id, f])));
const talById = computed(() => new Map(talPool.value.map((t) => [t.id, t])));
const famOf = (a: Adventurer) => (a.familiarId ? (famById.value.get(a.familiarId) ?? null) : null);
const talOf = (a: Adventurer) => (a.talentId ? (talById.value.get(a.talentId) ?? null) : null);
/**
 * CE QUE L’AVENTURIER EN TIRE — calculé par la fonction du COMBAT, jamais réécrite.
 *
 * ⚠️ Depuis la v0.805 c’est la formule du HÉROS (niveau d’objet × dressage), sans bridage
 * ni terrain. On appelle quand même `companionEffects` sur CE seul familier plutôt que
 * de relire la fiche : une étiquette qui refait le calcul à sa façon finit par diverger.
 *
 * ⚠️ Valeur au REPOS : un familier fatigué compte de moitié au rempart, mais la
 * fatigue passe en quelques heures et l’appariement, lui, dure.
 */
const famGain = (f: Item) => aggregateLines(companionEffects([f]));
const talGain = (t: TalentInstance) => aggregateLines(advTalentEffects([t]));
/** Les trois axes de magnitude du projet : rang, jet (lu en ÉTOILES depuis la v0.907, comme
 *  les objets), niveau d’objet. */
// ⚠️ La rareté n'est PAS répétée ici : elle vit dans la pastille colorée, où elle est
// accentuée (« Épique », pas « EPIQUE » — la pastille affichait la CLÉ de l'énumération).
const famMeta = (f: Item) =>
  `${rankStarStr(jetStar(f.roll))} · niv ${f.level}${f.effect2 ? ' · ✦ signature' : ''}`;
const talMeta = (t: TalentInstance) => `${rankStarStr(talentStar(t))} · niv ${t.level ?? 1}`;
const famColor = (f: Item) => rarityRank(f.rarity).color;
const talColor = (t: TalentInstance) => rarityRank(talentRankOf(t)).color;
/** Le DRESSAGE, unique depuis la v0.805 (donjon, convoi, défense).
 *  ⚠️ Un familier NEUF est à zéro, et c'est le cas le plus courant : « 🎓 0 » se lirait
 *  comme une erreur plutôt que comme « pas encore dressé ». On ne dit rien tant qu'il
 *  n'y a rien à dire. */
function famTrain(f: Item): string {
  const n = famLevel(famXp(f));
  return n ? `🎓 ${n}` : '';
}
function famNote(a: Adventurer): string {
  const f = famOf(a);
  if (!f) return 'Aucun familier confié.';
  return famMeta(f);
}
const talName = (t: TalentInstance) => talentByCode(t.code)?.name ?? t.code;
function talLabel(a: Adventurer): string {
  const t = talOf(a);
  return t ? talName(t) : 'Aucun talent confié';
}
function talNote(a: Adventurer): string {
  const t = talOf(a);
  return t
    ? talMeta(t)
    : `Un talent, bridé et jusqu’au rang de sa classe (${rarityRank(advRarity(a)).name}).`;
}
/** L'avertissement des deux sélecteurs. ⚠️ Écrit UNE fois : deux copies mot pour mot se
 *  reformulent séparément, et l'une des deux finit par mentir. */
const GAIN_NOTE = 'Les gains listés sont ce que le champion en tire.';

/**
 * LES LIGNES DU SÉLECTEUR, pré-calculées.
 *
 * ⚠️ Le composant a un tick de 30 s (fatigue, convalescences, convois), donc TOUT ce
 * que le template appelle est ré-évalué à chaque battement — et chaque helper y était
 * appelé deux fois par ligne (une fois en `v-if`, une fois en interpolation), `famWhy`
 * et `talTaken` balayant `advList` à chacun. Mesuré sur un compte réel : ~74 talents en
 * réserve, soit ~150 balayages et ~2 800 allocations par battement, pour reproduire des
 * chaînes strictement identiques.
 *
 * ⚠️ Aucune dépendance de ces `computed` n'inclut `now` : le tick ne les recalcule donc
 * plus du tout.
 */
const famChoice = computed(() =>
  pairFor.value
    ? companionOptions(
        pairFor.value,
        char.advList,
        famPool.value,
        kennelLevel.value,
        heroFamId.value,
      )
    : null,
);
const talChoice = computed(() =>
  talFor.value ? talentOptions(talFor.value, char.advList, talPool.value) : null,
);
const famRows = computed(() =>
  (famChoice.value?.options ?? []).map((f) => ({
    f,
    gains: famGain(f),
    meta: famMeta(f),
    train: famTrain(f),
    color: famColor(f),
  })),
);
const talRows = computed(() =>
  (talChoice.value?.options ?? []).map((t) => ({
    t,
    name: talName(t),
    icon: talentByCode(t.code)?.icon ?? '🧠',
    rank: talentRankOf(t),
    gains: talGain(t),
    meta: talMeta(t),
    color: talColor(t),
  })),
);
/** Ce qui est ÉCARTÉ, par raison, en une ligne — ou rien. */
const famHidden = computed(() => {
  const c = famChoice.value;
  if (!c) return '';
  if (c.full)
    return `Toutes les places du Chenil sont prises (${slots.value}) — améliore-le ou reprends un compagnon à un autre.`;
  const p: string[] = [];
  if (c.tooRare) p.push(`${c.tooRare} au-dessus du rang max du Chenil (${rankCapLabel.value})`);
  if (c.tooRareClass && pairFor.value)
    p.push(
      `${c.tooRareClass} au-dessus du rang de sa classe (${rarityRank(advRarity(pairFor.value)).name})`,
    );
  if (c.taken) p.push(`${c.taken} confié${c.taken > 1 ? 's' : ''} à d’autres`);
  if (c.hero) p.push('1 porté par ton héros');
  return p.length ? `Masqués : ${p.join(' · ')}.` : '';
});
const talHidden = computed(() => {
  const c = talChoice.value;
  const a = talFor.value;
  if (!c || !a) return '';
  const p: string[] = [];
  if (c.tooRare)
    p.push(`${c.tooRare} au-dessus du rang de sa classe (${rarityRank(advRarity(a)).name})`);
  if (c.taken) p.push(`${c.taken} confié${c.taken > 1 ? 's' : ''} à d’autres`);
  return p.length ? `Masqués : ${p.join(' · ')}.` : '';
});
/** Le compagnon et le talent de l'aventurier ouvert. ⚠️ Un `computed` plutôt que huit
 *  appels et cinq `!` non-null dans le template : chaque `!` est une assertion que le
 *  lecteur doit re-vérifier contre le `v-if` du parent, et le lien casse en silence dès
 *  qu'on déplace une ligne. */
const detailFam = computed(() => (detailAdv.value ? famOf(detailAdv.value) : null));
const detailTal = computed(() => (detailAdv.value ? talOf(detailAdv.value) : null));
const detailFamGain = computed(() => (detailFam.value ? famGain(detailFam.value) : []));
const detailTalGain = computed(() => (detailTal.value ? talGain(detailTal.value) : []));
/** ⚠️ Le store REFUSE ce qui est impossible (héros porteur, rang hors d’école) : on
 *  affiche son message plutôt que d’en réécrire un second qui pourrait diverger. */
async function pair(fn: (uid: string) => Promise<unknown>) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    await fn(uid);
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  } finally {
    busy.value = false;
  }
}
function assignFam(id: string | null) {
  const a = pairFor.value;
  if (!a) return;
  pairFor.value = null;
  void pair((uid) => char.setCompanion(uid, a.id, id));
}
/** Ce que « Confier au mieux » ferait, AVANT de toucher : le MÊME plan que le store —
 *  `autoCompanions` (compagnon+talent) ET `autoAdvGear` (équipement) sur le même
 *  contexte — et le gain de puissance du vivier. ⚠️ Deux plans, jamais deux calculs : si
 *  l'aperçu recalculait à sa façon, il pourrait finir par annoncer autre chose que ce
 *  que le bouton fait. Mesuré à ~3 ms pour 15 aventuriers : peut suivre l'horloge du
 *  panneau sans coût. */
const autoPreview = computed(() => {
  const advs = char.advList;
  const ctx = compCtx.value;
  const plan = autoCompanions(advs, ctx);
  const gearPlan = autoAdvGear(advs, ctx);
  let changes = 0;
  const after = advs.map((a) => {
    const p = plan.get(a.id) ?? {};
    const g = gearPlan.get(a.id) ?? {};
    const gearChanged = ADV_GEAR_SLOTS.some((s) => (g[s] ?? null) !== (a.gear?.[s] ?? null));
    if (
      (p.familiarId ?? null) !== (a.familiarId ?? null) ||
      (p.talentId ?? null) !== (a.talentId ?? null) ||
      gearChanged
    )
      changes++;
    return { ...a, familiarId: p.familiarId, talentId: p.talentId, gear: g };
  });
  const sum = (m: Map<string, number>) => [...m.values()].reduce((x, v) => x + v, 0);
  const gain = sum(adventurerPowers(after, ctx)) - sum(powers.value);
  // ⚠️ CE QUI MANQUAIT : « il y a du monde à ARMER ». Le gain seul ne le dit pas — une
  // pièce peut attendre pendant que le gain reste modeste, et un emplacement vide se lisait
  // alors comme une panne de l'auto-équipement (constaté sur le compte réel : un archer sans
  // arme, un arc portable en stock, parce que la forge s'était terminée depuis).
  const pending = [...gearPending.value.values()].reduce((n, slots) => n + slots.length, 0);
  return { changes, gain, pending };
});
/** Puissance totale du vivier — la somme de ce que chaque portrait affiche. */
const rosterPower = () =>
  [...adventurerPowers(char.advList, compCtx.value).values()].reduce((s, p) => s + p, 0);
function autoPair() {
  void pair(async (uid) => {
    const before = rosterPower();
    const r = await char.autoAssignCompanions(uid, Date.now());
    if (!r) return;
    const after = rosterPower();
    $q.notify({
      type: 'positive',
      message: `✨ ${r.familiars} compagnon(s), ${r.talents} talent(s) et ${r.gear} pièce(s) confiés · puissance du vivier ${fmtPow(before)} → ${fmtPow(after)}`,
    });
  });
}
function assignTal(id: string | null) {
  const a = talFor.value;
  if (!a) return;
  talFor.value = null;
  void pair((uid) => char.setAdvTalent(uid, a.id, id));
}

// ── 🗡️ SON ÉQUIPEMENT : 4 emplacements (arme/armure/accessoire/relique), propres à SON métier ──
// ⚠️ Distinct du compagnon et du talent : ces pièces vivent dans un STOCK séparé
// (`char.advGearStock`), pas dans le sac du héros, et sont plafonnées par la RARETÉ DE
// SA CLASSE (`canWearAdvGear`) — même règle que les deux autres, appliquée par le store.
const gearPick = ref<{ advId: string; slot: AdvGearSlot } | null>(null);
const gearPickAdv = computed(() =>
  gearPick.value ? char.advList.find((a) => a.id === gearPick.value!.advId) : undefined,
);
/** L'instant du calcul du sélecteur, FIGÉ à l'ouverture — jamais `now.value`, le tick de
 *  30 s du panneau. ⚠️ Le sélecteur compare la puissance de CHAQUE candidate (`gearRows`,
 *  jusqu'à des dizaines de lignes) : sans ce découplage, `gearPickCtx` — et donc toutes
 *  les lignes — se recalculaient à chaque battement du tick pendant que la feuille reste
 *  ouverte, exactement ce que le fichier évite déjà pour `famRows`/`talRows` (« aucune
 *  dépendance de ces computed n'inclut `now` »). La fatigue d'un compagnon n'a pas besoin
 *  d'une précision à la seconde dans un comparatif de pièces. */
const gearOpenedAt = ref(0);
watch(gearPick, (p) => {
  if (p) gearOpenedAt.value = Date.now();
});
/** Le contexte du sélecteur — MÊMES sources que `compCtx`, sauf `now` (figé ci-dessus).
 *  ⚠️ Reconstruit à part plutôt que `{ ...compCtx.value, now: gearOpenedAt.value }` : lire
 *  `compCtx.value` établirait quand même une dépendance transitive sur `now.value` (`compCtx`
 *  rend un nouvel objet à chaque tick), ce qui recollerait `gearRows` au tick d'origine. */
const gearPickCtx = computed<CompanionCtx>(() => ({
  familiars: famPool.value,
  talents: talPool.value,
  kennelLevel: kennelLevel.value,
  now: gearOpenedAt.value,
  advGear: char.row?.adv_gear?.stock ?? [],
  heroFamiliarId: heroFamId.value,
}));
/** Qui porte quoi, RÈGLES APPLIQUÉES (`wornGear`, identique à ce que le combat lit) —
 *  pour la fiche, où une pièce devenue invalide (rang dépassé, prise par un autre) doit
 *  se lire comme un emplacement VIDE, pas comme portée. */
const gearWorn = computed(() => wornGear(char.advList, char.advGearStock));
/** 🖼️ L'apparence de TOUT le vivier, équipement porté compris (`advLooks`, v0.865) — un
 *  seul calcul au niveau du panneau, qui ne dépend ni de `now` ni du rendu d'un portrait. */
const looks = computed(() => advLooks(char.advList, char.advGearStock));
function lookOf(a: Adventurer): AdvLook {
  // Le portrait itère sur `rosterSorted`, dérivé de `char.advList` : l'entrée existe toujours.
  return looks.value.get(a.id) ?? { profile: 'polyvalent', gear: {}, weaponKind: 'lame' };
}
/** Les 4 cases de chaque aventurier (portrait 2×2 ET fiche), calculées par la lib
 *  (`advGearCells`) sur ce que `wornGear` retient — un seul calcul pour tout le vivier,
 *  sans dépendance à l'horloge du panneau. */
const gearCells = computed(
  () =>
    new Map(
      char.advList.map((a) => [
        a.id,
        // ⚠️ Un seul `pendingAdvGear` pour tout le vivier : recalculé par aventurier, il
        // relirait le stock entier à chaque portrait.
        advGearCells(a, gearWorn.value.get(a.id) ?? [], gearPending.value.get(a.id) ?? []),
      ]),
    ),
);
function gearCellsOf(a: Adventurer): AdvGearCell[] {
  return gearCells.value.get(a.id) ?? advGearCells(a, []);
}
const detailGearSlots = computed(() => (detailAdv.value ? gearCellsOf(detailAdv.value) : []));
const gearEffectTexts = advGearEffectTexts;
/** Ce que l'aventurier vaudrait avec CETTE pièce à CET emplacement — calculé par
 *  `adventurerGearPower` (le MÊME arbitre que `pairBonusOf`, `combatPower` sur les
 *  paires du vivier complet), mais SANS recalculer la puissance de tout le monde à
 *  chaque candidate : `gearRows` en appelle une fois PAR LIGNE. */
function gearPowerFor(a: Adventurer, slot: AdvGearSlot, gearId: string): number {
  return adventurerGearPower(char.advList, a, slot, gearId, gearPickCtx.value);
}
const gearPool = computed(() => char.advGearStock);
const gearChoice = computed(() => {
  const p = gearPick.value;
  const a = gearPickAdv.value;
  return p && a ? advGearOptions(a, char.advList, gearPool.value, p.slot) : null;
});
const gearRows = computed(() => {
  const p = gearPick.value;
  const c = gearChoice.value;
  const a = gearPickAdv.value;
  if (!p || !c || !a) return null;
  return {
    // ⚠️ MÊME contexte figé (`gearPickCtx`) que les candidates ci-dessous — jamais
    // `powerOf(a)` (qui lit `powers.value`, donc `now.value`) : sinon `gearRows` resterait
    // accroché au tick de 30 s par CE seul champ, et toutes les lignes recalculeraient
    // leur puissance à chaque battement pendant que la feuille reste ouverte. La pièce déjà
    // en place (`a.gear?.[p.slot]`) donne la puissance ACTUELLE par le même chemin.
    curPower: adventurerGearPower(char.advList, a, p.slot, a.gear?.[p.slot], gearPickCtx.value),
    otherLineage: c.otherLineage,
    tooRare: c.tooRare,
    taken: c.taken,
    rows: c.options.map((g) => ({
      g,
      color: rarityRank(g.rarity).color,
      texts: gearEffectTexts(g),
      power: gearPowerFor(a, p.slot, g.id),
    })),
  };
});
/** Ce que le sélecteur écarte, par raison — jamais en silence. */
const gearHidden = computed(() => {
  const c = gearChoice.value;
  if (!c) return '';
  const p: string[] = [];
  if (c.otherLineage) p.push(`${c.otherLineage} pour un autre métier`);
  if (c.tooRare) p.push(`${c.tooRare} trop rare${c.tooRare > 1 ? 's' : ''} pour sa classe`);
  if (c.taken) p.push(`${c.taken} portée${c.taken > 1 ? 's' : ''} par un autre`);
  return p.length ? `Masqués : ${p.join(' · ')}.` : '';
});
/** La pièce ACTUELLEMENT assignée à cet emplacement, brute (pas `wornGear`) : le
 *  sélecteur ne propose déjà que ce qui est valide pour lui, donc c'est le même id. */
const gearHereId = computed(() => {
  const p = gearPick.value;
  const a = gearPickAdv.value;
  return p && a ? (a.gear?.[p.slot] ?? null) : null;
});
function pickGear(id: string | null) {
  const p = gearPick.value;
  if (!p) return;
  gearPick.value = null;
  void pair((uid) => char.setAdvGear(uid, p.advId, p.slot, id));
}

// ── 🗂️ ONGLETS ──
const guildTab = ref<'roster' | 'stock'>('roster');

// ── 🗡️ LE STOCK — équiper / vendre / verrouiller une pièce d'aventurier ──
// ⚠️ Même politique que le sac du héros : 🔒 protège des deux, une pièce PORTÉE
// (`Adventurer.gear`, BRUT — même lecture que `dropAdvGear` côté store) ne se cède pas.
/** Le stock, du rang le plus haut au plus bas, puis par emplacement. */
const stockSorted = computed(() =>
  [...char.advGearStock].sort(
    (a, b) =>
      RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
      ADV_GEAR_SLOTS.indexOf(a.slot) - ADV_GEAR_SLOTS.indexOf(b.slot) ||
      b.level - a.level,
  ),
);
/** Ce qu'on regarde dans le stock : ce qui attend preneur, ce qui est confié, ou `null`
 *  pour tout. ⚠️ « Disponibles » par DÉFAUT — c'est le seul où il y a à faire. */
const stockTab = ref<'free' | 'worn' | null>('free');
// ⚠️ LA PARTITION SUIT `ownerOf`, LE PRÉDICAT DÉJÀ EN PLACE DANS CET ÉCRAN (`Adventurer.gear`
// brut), et pas `wornGear` (ce que le COMBAT retient). C'est lui qui décide déjà de la ligne
// « portée par X » et du blocage de la vente : s'en écarter ferait tomber une pièce dans
// « Disponibles » tout en l'y affichant « portée par X » avec son bouton vendre grisé.
const stockWorn = computed(() => stockSorted.value.filter((g) => !!ownerOf(g)));
const stockFree = computed(() => stockSorted.value.filter((g) => !ownerOf(g)));
const stockShown = computed(() =>
  stockTab.value === null
    ? stockSorted.value
    : (stockTab.value === 'worn' ? stockWorn : stockFree).value,
);
/** Combien de pièces libres que PERSONNE ne peut porter (métier absent, ou classe trop
 *  basse). Rare par construction — une pièce forgée l'est pour une cible, et le butin de
 *  siège est plafonné à ce que le vivier porte — mais pas impossible. */
const stockOrphans = computed(
  () => stockFree.value.filter((g) => !char.advList.some((a) => canWearAdvGear(a, g))).length,
);
/** La pièce du stock qu'on est en train de confier. */
const stockEquip = ref<AdvGear | null>(null);
watch(stockEquip, (g) => {
  if (g) gearOpenedAt.value = Date.now();
});
/** Qui peut la porter, avec ce qu'il y gagnerait (même arbitre que le sélecteur par case,
 *  même contexte figé à l'ouverture). */
const stockEquipRows = computed(() => {
  const g = stockEquip.value;
  if (!g) return null;
  let otherLineage = 0;
  let tooRare = 0;
  const rows = [];
  for (const a of char.advList) {
    if (lineageOf(a) !== g.lineage) {
      otherLineage++;
      continue;
    }
    if (!canWearAdvGear(a, g)) {
      tooRare++;
      continue;
    }
    const curId = a.gear?.[g.slot];
    const wearing = curId ? char.advGearStock.find((x) => x.id === curId)?.name : undefined;
    rows.push({
      a,
      here: curId === g.id,
      wearing,
      cur: adventurerGearPower(char.advList, a, g.slot, curId, gearPickCtx.value),
      power: adventurerGearPower(char.advList, a, g.slot, g.id, gearPickCtx.value),
    });
  }
  rows.sort((x, y) => y.power - y.cur - (x.power - x.cur));
  const p: string[] = [];
  if (tooRare)
    p.push(`${tooRare} de son métier dont la classe est trop basse — promeus-les d’abord`);
  if (otherLineage) p.push(`${otherLineage} d’un autre métier`);
  return { rows, hidden: p.length ? `Masqués : ${p.join(' · ')}.` : '' };
});
function equipStock(a: Adventurer) {
  const g = stockEquip.value;
  if (!g) return;
  stockEquip.value = null;
  void pair((uid) => char.setAdvGear(uid, a.id, g.slot, g.id));
}
function unequipStock() {
  const g = stockEquip.value;
  const owner = g ? ownerOf(g) : undefined;
  if (!g || !owner) return;
  stockEquip.value = null;
  void pair((uid) => char.setAdvGear(uid, owner.id, g.slot, null));
}
const gearOwnerOf = computed(() => {
  const m = new Map<string, Adventurer>();
  for (const a of char.advList)
    for (const slot of ADV_GEAR_SLOTS) {
      const id = a.gear?.[slot];
      if (id) m.set(id, a);
    }
  return m;
});
function ownerOf(g: AdvGear): Adventurer | undefined {
  return gearOwnerOf.value.get(g.id);
}
function lineageLabel(l: Lineage): string {
  return advClass(l)?.label ?? l;
}
function toggleGearLock(g: AdvGear) {
  void pair((uid) => char.toggleAdvGearLock(uid, g.id));
}
/** ⚠️ CONFIRMATION, comme le sac du héros — une pièce vendue est définitivement perdue. */
function sellOneGear(g: AdvGear) {
  const gain = advGearSellValue(g);
  $q.dialog({
    title: 'Vendre cette pièce ?',
    message: `« ${g.name} » partira définitivement contre ${gain} 🪙.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: `Vendre (+${gain} 🪙)`, color: 'negative' },
  }).onOk(() => void pair((uid) => char.sellAdvGear(uid, [g.id])));
}

const busy = ref(false);
const now = ref(Date.now());
// ⚠️ NETTOYÉE au démontage. Posée au niveau du setup et jamais arrêtée, elle continuait de
// battre après la fermeture du panneau en retenant la ref ET le composant — exactement la
// fuite corrigée sur la carte d’expédition en v0.732, jamais répercutée ici.
const clock = setInterval(() => (now.value = Date.now()), 30_000);
onUnmounted(() => clearInterval(clock));

const roster = computed(() => char.advList);
/** L’ordre d’AFFICHAGE : rang, puis expérience, puis puissance (`compareAdventurers`).
 *  ⚠️ Copie triée : `advList` garde l’ordre du vivier, dont dépendent l’attribution des
 *  places du Chenil et la graine du recrutement. */
const rosterSorted = computed(() =>
  [...roster.value].sort((a, b) => compareAdventurers(a, b, powerOf)),
);

// ── 🔎 FILTRE PAR ÉTAT (demandé) : qui peut partir, qui est sur la route, qui se soigne ──
// ⚠️ `null` = tous. Le filtre ne RANGE rien de lui-même : il lit `statusOf`, donc la même
// règle que le cadre coloré et que la ligne d'état — les trois ne peuvent pas se contredire.
const rosterFilter = ref<AdvStatus | null>(null);
/** Combien dans chaque catégorie — affiché sur chaque puce, et c'est ce qui permet de ne
 *  proposer QUE les catégories peuplées (une puce « 0 » n'apprend rien et prend la place). */
const rosterCounts = computed(() => {
  const m = new Map<AdvStatus, number>();
  for (const a of rosterSorted.value) m.set(statusOf(a), (m.get(statusOf(a)) ?? 0) + 1);
  return m;
});
const rosterChips = computed(() => ADV_STATUSES.filter((s) => rosterCounts.value.get(s)));
const rosterShown = computed(() =>
  rosterFilter.value === null
    ? rosterSorted.value
    : rosterSorted.value.filter((a) => statusOf(a) === rosterFilter.value),
);
// ⚠️ Un filtre qui ne montre plus rien (le dernier convoi est rentré) se lit comme un vivier
// vide : on retombe sur « Tous » dès que la catégorie choisie se vide.
watch(rosterChips, (chips) => {
  if (rosterFilter.value && !chips.includes(rosterFilter.value)) rosterFilter.value = null;
});
const pantheonLevel = computed(() => char.pantheonLevel);
/** ⚠️ `engageCap`, JAMAIS une copie de sa formule : l'écran doit annoncer exactement ce
 *  que le jeu applique (c'est `advUnavailableReason` qui met au banc au-delà). */
const maxRoster = computed(() => engageCap(pantheonLevel.value));
const rankOf = (a: Adventurer) => advRank(a);
/** ⚠️ La rareté NOMINALE — ce qu'on a tiré. C'est elle qu'un gacha doit montrer, et elle
 *  parle la langue de la RARETÉ (Commun → Primordial), pas celle des rangs : un champion
 *  porte les DEUX échelles et les nommer pareil les confond (v0.962). */
const nomOf = (a: Adventurer) => RARITY_LABEL[advNominalRarity(a)];
const nomColor = (a: Adventurer) => RANK_COLOR[advNominalRarity(a)];
const titleOf = (a: Adventurer) => advTitle(a);
/** Sa CLASSE — et rien du tout quand elle répète son nom. ⚠️ `advTitle` rend le NOM d'un
 *  champion (il n'a pas de métier), donc la ligne le redisait sous le titre de la fiche. */
const subOf = (a: Adventurer) => {
  const l = advTitle(a)?.label;
  return l && l !== a.name ? l : '';
};
const progressOf = (a: Adventurer) => advRankProgress(a);
// ⚠️ Elle annonçait la PROMOTION, qui n’existe plus (v0.951) : un champion ne se promeut
// pas, ce sont ses DOUBLONS qui le réveillent. Elle dit donc ce qu’elle montre vraiment —
// l’avancée vers l’étoile suivante, le seul retour visible puisque le niveau reste caché.
const barTitle = (a: Adventurer) =>
  progressOf(a) >= 1
    ? `Au sommet de son rang — ${stars(ADV_STARS)}`
    : 'Avancée vers l’étoile suivante';
const stars = (s: number) => rankStarStr(s);
/** Sa CATÉGORIE (lib) : ce qui range, ce qui colore le cadre et ce que le filtre compte.
 *  ⚠️ DÉCLARÉE EN `function`, donc HISSÉE — et ce n'est pas cosmétique : le `watch` qui
 *  surveille les catégories peuplées évalue sa source DÈS LE SETUP, bien avant cette
 *  ligne. En `const`, on tombait en zone morte temporelle (`ReferenceError`), le panneau
 *  ne se montait plus et « Voir mes aventuriers » ne faisait plus rien. Ni le typecheck,
 *  ni le build, ni le smoke ne voient une TDZ à travers une closure. */
function statusOf(a: Adventurer) {
  return advStatus(a, now.value);
}
const busyOf = (a: Adventurer) => ((a.busyUntil ?? 0) > now.value ? a.busyUntil! : 0);
const hurtOf = (a: Adventurer) => ((a.hurtUntil ?? 0) > now.value ? a.hurtUntil! : 0);
/** Ce qu’il fait en ce moment, en une ligne.
 *  ⚠️ DÉRIVÉ de `advStatus` (donc de `advUnavailableReason`, la source unique) : cette
 *  fonction refaisait la règle avec un ordre à elle, et le filtre l’aurait contredite.
 *  ⚠️ L’ORDRE VIENT DE LA SOURCE, jamais d’ici : deux vérités sur le même écran valent
 *  moins qu’un ordre d’étiquetage légèrement différent (v0.808). */
function stateOf(a: Adventurer): string {
  switch (statusOf(a)) {
    case 'busy':
      return `🐫 en route · ${leftOf(busyOf(a))}`;
    case 'hurt':
      return `🛏️ à l’infirmerie · ${leftOf(hurtOf(a))}`;
    default:
      return '✅ disponible';
  }
}
const talIconOf = (a: Adventurer) => {
  const t = talOf(a);
  return t ? (talentByCode(t.code)?.icon ?? '🧠') : undefined;
};
// ── Fiche d'un aventurier ──
const detailAdv = ref<Adventurer | null>(null);
/** CE QUE CHAQUE PIÈCE PORTÉE APPORTE, en puissance — l'arbitre de tout le jeu.
 *
 *  ⚠️ La case n'affichait que la stat brute (« +1,1 % de vie »), signalée par l'utilisateur
 *  comme illisible : un pourcentage ne dit rien tant qu'on ne connaît pas son assiette, et
 *  il ne se compare pas d'une pièce à l'autre (des dégâts contre de la réduction). Mesuré,
 *  une pièce de rang Bronze vaut ~0,5 % de la puissance de son porteur — le chiffre honnête
 *  est donc l'écart, pas la stat. Même remède que pour les compagnons (v0.784).
 *
 *  ⚠️ Instant FIGÉ à l'ouverture, jamais `now.value` : sinon les 8 évaluations
 *  (4 cases × avec/sans) repartiraient à chaque battement du tick de 30 s — exactement ce
 *  que `gearPickCtx` évite déjà pour le sélecteur. */
const detailOpenedAt = ref(0);
watch(detailAdv, (a) => {
  if (a) detailOpenedAt.value = Date.now();
});
const detailCtx = computed<CompanionCtx>(() => ({
  familiars: famPool.value,
  talents: talPool.value,
  kennelLevel: kennelLevel.value,
  now: detailOpenedAt.value,
  advGear: char.row?.adv_gear?.stock ?? [],
  heroFamiliarId: heroFamId.value,
}));
const detailGearGain = computed(() => {
  const a = detailAdv.value;
  const out = new Map<AdvGearSlot, number>();
  if (!a) return out;
  for (const c of detailGearSlots.value) {
    if (!c.piece) continue;
    const withIt = adventurerGearPower(char.advList, a, c.slot, c.piece.id, detailCtx.value);
    const without = adventurerGearPower(char.advList, a, c.slot, undefined, detailCtx.value);
    out.set(c.slot, withIt - without);
  }
  return out;
});
const statsOf = (a: Adventurer) => advStats(a);
/** Les stats ramenées à la FORME attendue par `advShapeLabel` (p/e/a) : on nomme
 *  l'orientation à partir des stats RÉELLES, pas des poids d'une seule classe. */
const statWeights = (a: Adventurer) => {
  const st = advStats(a);
  return { p: st.puissance, e: st.endurance, a: st.agilite };
};
/** Le chemin de classes, dans l'ordre où il a été choisi. ⚠️ On filtre les ids inconnus
 *  plutôt que d'afficher « ? » : une classe retirée du vivier ne doit pas laisser un
 *  trou dans l'histoire d'un aventurier existant. */
const pathOf = (a: Adventurer) => a.path.map((id) => advClass(id)).filter((c) => !!c);
const rolesOf = (a: Adventurer) => advRoleLevels(a);
/** Les signatures NOMMÉES, avec leur niveau. On écarte celles sans libellé plutôt que
 *  d'afficher un code brut : un effet qu'on ne sait pas nommer n'aide personne. */
const sigLabelsOf = (a: Adventurer) =>
  advSignatureLevels(a)
    .map((s) => ({ label: ADV_SIGNATURE_LABEL[s.what], level: s.level }))
    .filter((s): s is { label: string; level: number } => !!s.label);
function leftOf(at: number): string {
  const m = Math.max(0, Math.round((at - now.value) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
const mana = computed(() => char.row?.mana ?? 0);
const pullCost = GACHA.pullCost;

/**
 * 🎰 UN TIRAGE. ⚠️ On ANNONCE toujours quelque chose — un tirage muet, dans un genre bâti
 * sur le moment où l'on découvre ce qu'on a eu, n'est pas un tirage. Trois issues, et
 * chacune se dit : un champion neuf, un cran d'Éveil, ou une copie de trop qui se
 * convertit (« jamais perdu »).
 */
/** Combien de tirages la réserve permet. ⚠️ Le chiffre qui décide si on appuie : « 1 831
 *  💠 » ne se convertit pas de tête. */
const pulls = computed(() => Math.floor(mana.value / pullCost));
/** 📊 Les chances, avec l'état RÉEL du pity : un panneau qui annoncerait des taux nus
 *  mentirait par omission — c'est la garantie qui explique ce qu'on tire. */
const oddsOpen = ref(false);
const odds = computed(() => gachaOdds(char.row?.gacha ?? { sinceTop: 0, sinceFloor: 0 }));
/** Un taux à la française, décimale seulement si elle dit quelque chose. */
const fmtOdds = (pct: number) =>
  (Math.round(pct * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const revealPlan = ref<RevealPlan | null>(null);
/** Le lot complet d'un ×10 — `null` pour un tirage à l'unité. */
const revealLot = ref<LotItem[] | null>(null);
const multiCount = GACHA.multiCount;
const multiCost = multiPullCost();
const revealVerdict = ref<{
  duplicate: boolean;
  copies: number;
  manaBack: number;
  awaken: number;
} | null>(null);
function closeReveal() {
  revealPlan.value = null;
  revealVerdict.value = null;
}

/**
 * 🎰 UN TIRAGE. ⚠️ On ANNONCE toujours quelque chose — un tirage muet, dans un genre bâti
 * sur le moment où l'on découvre ce qu'on a eu, n'est pas un tirage. Trois issues, et
 * chacune se dit : un champion neuf, un cran d'Éveil, ou une copie de trop qui se
 * convertit (« jamais perdu »).
 *
 * ⚠️ **LA ROULETTE MET EN SCÈNE UN RÉSULTAT DÉJÀ TRANCHÉ** : on tire d'abord (le store, le
 * pity, la mana), on anime ensuite. L'inverse ferait diverger ce qu'on voit de ce qu'on
 * possède — la règle de `siegeStage` et d'`arenaStage`.
 */
/** ⚠️ `prefers-reduced-motion` → l'état FINAL, pas une animation raccourcie : la lib
 *  rend une bande d'un seul portrait et une durée nulle. Lu UNE fois, pour les deux
 *  modes de tirage — deux lectures finiraient par diverger. */
function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 🎰 LE LOT DE 10 — une SEULE roulette, sur le meilleur (v0.968).
 *
 * ⚠️ Dix roulettes d'affilée, c'est une demi-minute à regarder pour un seul geste : le
 * genre concentre la tension sur le meilleur, puis récapitule. La grille dit le reste.
 */
async function doPullTen() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const lot = await char.pullChampions(uid);
    if (!lot) {
      $q.notify({ type: 'negative', message: 'Pas assez de pierres de mana.' });
      return;
    }
    const best = bestOfLot(lot);
    if (!best) return;
    revealVerdict.value = {
      duplicate: best.duplicate,
      copies: best.copies,
      manaBack: best.manaBack,
      awaken: awakenLevel(best.copies),
    };
    revealLot.value = lot;
    revealPlan.value = buildReveal(best.champion, Math.random, { reduced: reducedMotion() });
  } finally {
    busy.value = false;
  }
}

async function doPull() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const r = await char.pullChampion(uid);
    if (!r) {
      $q.notify({ type: 'negative', message: 'Pas assez de pierres de mana.' });
      return;
    }
    revealLot.value = null;
    revealVerdict.value = {
      duplicate: r.duplicate,
      copies: r.copies,
      manaBack: r.manaBack,
      awaken: awakenLevel(r.copies),
    };
    revealPlan.value = buildReveal(r.champion, Math.random, { reduced: reducedMotion() });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
/* 🎰 L'INVOCATION — l'action qui remplace l'arbre de classes. Elle se distingue du
   recrutement par une teinte propre (le violet du mana), jamais par la seule taille :
   deux boutons pleine largeur de même couleur se lisent comme un seul geste répété. */
/* 🎰 LE LOT — visuellement SECOND : même famille que le bouton d'invocation (le violet
   du mana) mais plus bas, plus sobre. Deux boutons de même poids se liraient comme un
   choix qu'on ne sait pas trancher. */
.g-multi {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  margin-bottom: 8px;
  padding: 8px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, #b57bff 34%, var(--line));
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.g-multi:disabled {
  opacity: 0.6;
  cursor: default;
  border-color: var(--line);
}
.gm-emo {
  font-size: 20px;
  line-height: 1;
}
.gm-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.gm-main small {
  color: var(--dim);
  font-size: 11.5px;
}
/* 📊 LE PANNEAU DES CHANCES — une NOTICE : discrète, repliée, jamais en concurrence
   avec le bouton d'invocation juste au-dessus. */
.g-odds-t {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  /* Cible tactile 44 px : c est une notice, pas l action principale, mais la regle du projet ne souffre pas d exception. */
  min-height: 44px;
  margin: -2px 0 8px;
  padding: 4px 6px;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.go-chev {
  margin-left: auto;
  transition: transform 0.15s ease;
}
.go-chev.on {
  transform: rotate(90deg);
}
.g-odds {
  margin: -6px 0 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.go-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.go-rar {
  flex: 0 0 96px;
  font-size: 11.5px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.go-bar {
  flex: 1;
  min-width: 0;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.go-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.go-pct {
  flex: 0 0 46px;
  text-align: right;
  font-size: 12px;
}
.go-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
}
/* 🎰 LE BOUTON D'INVOCATION — « c'est un truc important » (demandé).
   ⚠️ IL N'AVAIT QUASIMENT AUCUN STYLE : il portait `.voie-btn`, une classe définie dans
   AventurePage… en `scoped`, donc qui ne l'atteint JAMAIS. Il tombait à la taille de son
   contenu — « petit, sur 2/3 de la ligne ». C'est le piège des styles scoped déjà rencontré
   (v0.920) : une classe qu'on croit globale ne l'est pas.
   ⚠️ Le violet est celui du mana et de la magie, PAS l'accent : l'accent dit « il y a à
   faire » partout ailleurs, et invoquer est un plaisir, pas une corvée. */
.g-summon {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  margin-bottom: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, #b57bff 60%, var(--line));
  background:
    radial-gradient(
      120% 140% at 0% 0%,
      color-mix(in srgb, #b57bff 26%, transparent),
      transparent 60%
    ),
    var(--surface);
  box-shadow: 0 0 0 1px color-mix(in srgb, #b57bff 14%, transparent);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}
.g-summon:disabled {
  opacity: 0.6;
  cursor: default;
  border-color: var(--line);
  background: var(--surface);
  box-shadow: none;
}
/* Un reflet qui passe tant qu'on PEUT tirer — il s'éteint dès que la mana manque, donc il
   ne promet jamais ce qui n'est pas possible. `prefers-reduced-motion` le fige. */
.gs-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 35%,
    color-mix(in srgb, #b57bff 34%, transparent) 50%,
    transparent 65%
  );
  transform: translateX(-100%);
  animation: gs-sweep 3.4s ease-in-out infinite;
  pointer-events: none;
}
.g-summon:disabled .gs-glow {
  display: none;
}
@keyframes gs-sweep {
  0%,
  62% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
.gs-emo {
  position: relative;
  font-size: 30px;
  line-height: 1;
}
.gs-t {
  font-size: 16px;
  letter-spacing: 0.02em;
}
/* Ce qu'on peut se PAYER, en gros : c'est le chiffre qui décide si on appuie. */
.gs-stock {
  position: relative;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  color: #b57bff;
  b {
    font-size: 22px;
  }
  small {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.8;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gs-glow {
    animation: none;
    transform: none;
    opacity: 0.25;
  }
}
.gs-main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.gs-main small {
  font-size: 11px;
  color: var(--dim);
}
.gs-short {
  color: var(--d3);
}
.g-hire,
.g-full {
  margin-bottom: 10px;
}
.g-auto {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  margin: 10px 0 4px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background:
    radial-gradient(
      120% 140% at 0% 0%,
      color-mix(in srgb, var(--accent) 22%, transparent),
      transparent 60%
    ),
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface));
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.25) inset,
    0 6px 18px -10px color-mix(in srgb, var(--accent) 70%, transparent);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}
/* Un reflet qui passe : l’action a quelque chose à rapporter. */
.g-auto:not(.idle)::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 35%,
    color-mix(in srgb, var(--accent) 22%, transparent) 50%,
    transparent 65%
  );
  transform: translateX(-100%);
  animation: ga-sheen 3.2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ga-sheen {
  0%,
  55% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
.g-auto:not(:disabled):active {
  transform: scale(0.985);
}
.g-auto:disabled {
  cursor: default;
}
.g-auto:disabled:not(.idle) {
  opacity: 0.6;
}
.ga-ico {
  flex: none;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  font-size: 19px;
  background: var(--accent);
  color: #15120e;
  box-shadow: 0 0 14px -2px color-mix(in srgb, var(--accent) 75%, transparent);
}
.ga-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ga-title {
  font-family: Oswald, sans-serif;
  font-size: 16px;
  letter-spacing: 0.02em;
  line-height: 1.1;
}
.ga-sub {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
.ga-gain {
  flex: none;
  padding: 5px 10px;
  border-radius: 999px;
  font-family: Oswald, sans-serif;
  font-size: 15px;
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--d1) 45%, transparent);
}
.ga-gain small {
  margin-left: 2px;
  font-size: 11px;
}
/* Au repos : rien à faire, donc rien qui attire l’œil. */
.g-auto.idle {
  border-color: var(--line);
  background: var(--surface);
  box-shadow: none;
}
.g-auto.idle .ga-ico {
  background: color-mix(in srgb, var(--d1) 18%, transparent);
  color: var(--d1);
  box-shadow: none;
  font-size: 17px;
}
.g-auto.idle .ga-title {
  color: var(--dim);
}
.ga-note {
  margin-top: 2px;
  text-align: right;
}
@media (prefers-reduced-motion: reduce) {
  .g-auto:not(.idle)::after {
    animation: none;
    display: none;
  }
}
/* ── Fiche d'un aventurier ── */
.adv.hit {
  cursor: pointer;
}
.d-sub {
  font-size: 12.5px;
  color: var(--dim);
  margin: 2px 0 8px;
}
.adv-pow {
  margin-left: auto;
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  white-space: nowrap;
}
.d-pow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 8px;
}
.d-pow-val {
  font-size: 20px;
}
.d-pow-gain {
  font-size: 12px;
  color: var(--dim);
}
.d-stats {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
.d-stat {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: Oswald, sans-serif;
  font-size: 15px;
}
.d-state {
  font-size: 12px;
  color: var(--dim);
  margin: 6px 0 4px;
}
/* 🐾🧠 LA PAIRE — une ligne par chose confiée, cible tactile pleine largeur.
   ⚠️ Préfixe `d-` (detail) comme le reste de la fiche : des classes génériques
   écraseraient celles d’un autre écran (la leçon des `fp-*`, v0.751). */
.d-pair,
.d-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  margin-bottom: 6px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
}
.d-pick.here {
  border-color: var(--q-primary);
}
/* Indisponible : il reste LISIBLE — on doit pouvoir lire POURQUOI — il n’est
   simplement plus cliquable. Pointillé en plus de l’opacité : la couleur seule ne
   suffit pas. */
.d-pick.barred {
  opacity: 0.55;
  border-style: dashed;
  cursor: default;
}
.d-pair-emo {
  font-size: 22px;
  width: 26px;
  text-align: center;
}
.d-pair-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.d-pair-name {
  font-size: 13.5px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.d-pair-sub {
  font-size: 11.5px;
  color: var(--dim);
}
/* Le GAIN : c’est la seule chose qui départage deux compagnons, donc la seule ligne en
   pleine couleur — le reste (rang, jet, niveau) ne fait que l’expliquer. */
.d-gain {
  font-size: 12px;
  color: var(--text);
}
/* Le rang prend sa couleur de RANK_COLOR, la source unique — pas une 4ᵉ copie des huit
   classes .p-*, qui vivent dans trois autres composants et finiraient par diverger. */
.d-rk {
  font-size: 10px;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 999px;
  color: var(--rk);
  border: 1px solid var(--rk);
  margin-left: 6px;
  white-space: nowrap;
}
/* Un empêchement n’est pas une métadonnée : il se distingue du jet et du niveau. */
.d-pair-sub.warn {
  color: var(--d3, #ffb23f);
}
.d-train {
  font-size: 10.5px;
  color: var(--dim);
  margin-left: 6px;
  white-space: nowrap;
}
.d-sec {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 10px 0 5px;
}
.d-path {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Le parcours se lit comme une SUITE : une flèche entre deux étapes, jamais après la
   dernière (sinon elle promet une classe qui n'existe pas encore). */
.d-step {
  font-size: 12.5px;
}
.d-step + .d-step::before {
  content: '›';
  color: var(--dim);
  margin-right: 6px;
}
.d-perks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.d-perk {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text);
}
.d-perk.sig {
  border-color: var(--accent);
}
/* Le NIVEAU d'une compétence : discret mais lisible — c'est un attribut du libellé,
   pas une seconde information à côté. */
.d-lvl {
  margin-left: 4px;
  color: var(--accent);
  font-family: Oswald, sans-serif;
}
/* L'HORIZON d'une voie : en retrait, parce que c'est un possible, pas une promesse. */
.gc-horizon {
  font-size: 10.5px;
  color: var(--dim);
  opacity: 0.85;
}
.guild-card {
  background: var(--surface);
  color: var(--text);
  padding: 16px 14px;
  border-radius: 16px 16px 0 0;
  width: 480px;
  max-width: 100vw;
}
.g-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.g-title {
  font-size: 18px;
  font-weight: 700;
}
.g-count {
  font-size: 13px;
  color: var(--dim);
}
.g-empty,
.g-note {
  font-size: 12.5px;
  color: var(--dim);
  margin: 6px 0 10px;
}
/* Ce qui est masqué, et pourquoi : présent, mais en retrait. */
.g-note.dim {
  font-size: 11.5px;
  font-style: italic;
}
/* Une ligne par aventurier : icône de classe, identité, barre, état. */
.adv {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.adv.busy {
  opacity: 0.62;
}
.adv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
@media (min-width: 520px) {
  .adv-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.adv-emo {
  font-size: 26px;
  line-height: 1.1;
}
.adv-main {
  flex: 1;
  min-width: 0;
}
.adv-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.adv-name {
  font-weight: 600;
  font-size: 14.5px;
}
.adv-rank {
  font-size: 12px;
  white-space: nowrap;
}
/* La rareté de la classe, à côté du métier : discrète, elle explique le rang sans
   lui faire concurrence. */
.adv-rar {
  margin-left: 6px;
  font-size: 11px;
  text-transform: capitalize;
}
.adv-sub {
  font-size: 12px;
  color: var(--dim);
}
.adv-sig {
  margin-left: 4px;
  color: var(--accent);
}
.adv-bar {
  position: relative;
  height: 5px;
  margin: 5px 0 3px;
  border-radius: 3px;
  background: var(--surface-2, #1d1913);
  overflow: hidden;
}
.adv-fill {
  display: block;
  height: 100%;
  background: var(--accent);
}
.adv-state {
  font-size: 11px;
  color: var(--dim);
}
.adv-promo {
  align-self: center;
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  min-height: 32px;
}
/* Grille fluide : jamais de débordement, les cartes se réorganisent. */
.g-cost {
  margin: 2px 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12.5px;
  color: var(--dim);
}
.g-choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.g-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  min-height: 44px;
}
.g-choice:disabled {
  opacity: 0.45;
}
.gc-emo {
  font-size: 24px;
}
.gc-lbl {
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
}
.gc-w,
.gc-shape {
  font-size: 11.5px;
  color: var(--dim);
}
.gc-perk {
  font-size: 11.5px;
  color: var(--text);
  line-height: 1.3;
}
.gc-perk.sig {
  color: var(--accent, #ffd23f);
}
.gc-perk.none {
  color: var(--dim);
  font-style: italic;
}
.gc-rar {
  font-size: 11px;
  color: var(--dim);
}
.g-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

/* ── 🗡️ SES 3 EMPLACEMENTS D'ÉQUIPEMENT — sur la fiche ── */
.d-gear {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.d-gear-slot {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 48px;
  padding: 6px 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
}
.dg-emo {
  font-size: 20px;
  line-height: 1.1;
}
.dg-name {
  font-size: 10.5px;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dg-rk,
.dg-stat {
  font-size: 9.5px;
  line-height: 1.2;
  max-width: 100%;
  text-align: center;
}
.dg-rk {
  font-weight: 700;
  letter-spacing: 0.02em;
}
.dg-stat {
  color: var(--dim);
}
/* Le gain de puissance : c'est le verdict, il se lit avant la stat brute. */
.dg-gain {
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--d1);
}
/* Emplacement vide : lisible, mais en retrait. */
.d-gear-slot.empty .dg-emo,
.d-gear-slot.empty .dg-name {
  opacity: 0.5;
}
/* Le gain de puissance d'une pièce PEUT être négatif (le sélecteur ne filtre pas sur le
   gain, contrairement à « Confier au mieux ») — il se lit alors dans le ton d'alerte. */
.d-gain.neg {
  color: var(--d4, #ff6a45);
}

/* ── 🗡️ LE STOCK D'ÉQUIPEMENT — pli + lignes ── */
.g-fold {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 8px 2px;
  margin-top: 10px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--line);
  color: var(--text);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}
.fold-ico {
  color: var(--dim);
  font-size: 14px;
}
/* 2 colonnes à 344/390 px, 3 dès qu'il y a la place (cockpit, tablette) — `auto-fill` le
   décide seul, sans point de rupture à maintenir. ⚠️ `minmax(0, …)` et non `minmax(148px, …)`
   en 2ᵉ borne : une piste qui refuse de passer sous son contenu fait déborder la grille. */
.gear-stock {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 8px;
}
.gear-stock-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 7px 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.gear-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}
/* CADRE PAR ÉTAT, mêmes teintes que les portraits : jaune = confiée, vert = disponible. */
.gear-stock-row.tone-free {
  --tone-c: var(--d1, #7bc86c);
}
.gear-stock-row.tone-busy {
  --tone-c: var(--accent, #ffd23f);
}
.gear-stock-row[class*='tone-'] {
  border-color: color-mix(in srgb, var(--tone-c) 55%, var(--line));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone-c) 14%, transparent);
}
.gear-stock-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
/* ⚠️ COLLÉS EN BAS. Les tuiles d'une même rangée sont étirées à la même hauteur par la
   grille ; sans `margin-top: auto` la rangée de boutons suivait le texte, donc les icônes
   flottaient à 4 ou 5 hauteurs différentes selon le nombre de lignes au-dessus. MESURÉ. */
.gear-actions-row {
  display: flex;
  gap: 6px;
  margin-top: auto;
}
/* Le gap du flex suffit : le `margin-left` de `.d-rk` (utile après un nom) décalerait la
   pastille de 6 px et la désalignerait du nom juste au-dessus. */
.gear-meta .d-rk {
  margin-left: 0;
}
.gear-fx {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  line-height: 1.25;
}
/* Le porteur vit maintenant DANS la ligne de méta : `.d-pair-sub.warn` ne l'attrapait
   plus (il est enfant, pas la classe elle-même) et il aurait perdu sa couleur d'état. */
.gear-meta .warn {
  color: var(--d3, #ffb23f);
}
.gear-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 44px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2, #1d1913);
  color: var(--text);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.g-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 4px 0 10px;
}
.g-tab {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.g-tab.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
/* 🔎 Puces de filtre du vivier — mêmes teintes que le cadre des portraits (une catégorie,
   une couleur, partout). Elles DÉFILENT plutôt que de se replier : à 344 px, quatre puces
   sur deux rangs poussaient le vivier sous le pli. */
.adv-filter {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 8px;
  scrollbar-width: none;
}
.adv-filter::-webkit-scrollbar {
  display: none;
}
.af-chip {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.af-chip.tone-free {
  --tone-c: var(--d1, #7bc86c);
}
.af-chip.tone-busy {
  --tone-c: var(--accent, #ffd23f);
}
.af-chip.tone-hurt {
  --tone-c: var(--d4, #ff6a45);
}
.g-count-sub {
  color: var(--dim);
  font-size: 11px;
}
.af-chip.tone-benched {
  --tone-c: var(--d3, #ffb23f);
  border-style: dashed;
}
.af-chip.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--tone-c, var(--accent)) 65%, var(--line));
  background: color-mix(in srgb, var(--tone-c, var(--accent)) 14%, transparent);
}
.g-tab-n {
  display: inline-block;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--line);
  color: var(--text);
  font-size: 12px;
}
.gear-btn.equip {
  flex: 1.4;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  color: var(--text);
}
.gear-btn.active {
  border-color: var(--accent);
  color: var(--accent);
}
.gear-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
