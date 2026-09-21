<template>
  <q-dialog :model-value="open" position="bottom" @update:model-value="emit('close')">
    <q-card class="guild-card">
      <div class="g-head">
        <!-- 🗂️ DEUX FEUILLES, UN COMPOSANT (v0.991, demandé : une tuile Équipements à part).
             Le stock d'équipement et le vivier partagent leurs sous-feuilles (fiche d'un
             champion, sélecteurs) : on sépare l'ENTRÉE, pas le code. -->
        <template v-if="section === 'gear'">
          <span class="g-title font-display">🗡️ Équipements</span>
          <span class="g-count">{{ char.advGearStock.length }}</span>
        </template>
        <template v-else>
          <span class="g-title font-display">🏅 Mes champions</span>
          <!-- 🗿 LA COLLECTION D'ABORD, le plafond ensuite : depuis la v0.958 il n'y a plus
               de banc — tout champion est utilisable, et le Panthéon ne borne que combien on
               en engage À LA FOIS. Opposer les deux (« 5/3 ») laisserait croire l'inverse. -->
          <span class="g-count">{{ roster.length }}</span>
          <span class="g-count g-count-sub">· {{ maxRoster }} engagés à la fois</span>
        </template>
      </div>

      <p v-if="!pantheonLevel" class="g-empty">
        Construis le <b>Panthéon</b> dans ta cour pour invoquer tes champions.
      </p>

      <template v-else>
        <!-- 🗂️ DEUX ONGLETS (v0.881, demandé) : le vivier, et le STOCK d'équipement où l'on
             voit ses pièces et les confie. Le stock vivait replié sous le vivier, hors écran
             dès quelques aventuriers. -->
        <div v-if="section !== 'gear'" class="g-tabs" role="tablist">
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
            :class="{ on: guildTab === 'collection' }"
            :aria-selected="guildTab === 'collection'"
            @click="guildTab = 'collection'"
          >
            📖 Collection <span class="g-tab-n">{{ collectionOwned }}/{{ CHAMPIONS.length }}</span>
          </button>
        </div>

        <template v-if="guildTab === 'roster'">
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
          <!-- ✨ CONFIER AU MIEUX, EN TÊTE (demandé) : les pièces d'équipement de chacun,
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
                  ><template v-else>🗡️ équipement du vivier</template
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
             Toucher le portrait ouvre sa FICHE. -->
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
          <!-- 🗂️ RANGÉ PAR LETTRE (S puis A) ; dans chacune, rang puis étoiles
               décroissants (`groupByGrade`). -->
          <section
            v-for="g in rosterGroups"
            :key="g.grade"
            class="adv-rgroup"
            :style="{ '--c': GRADE_COLOR[g.grade] }"
          >
            <div class="adv-rhead">
              <span class="adv-rname font-display">{{ g.grade }}</span>
              <span class="adv-rn">{{ g.advs.length }}</span>
            </div>
            <div class="adv-grid">
              <AdventurerPortrait
                v-for="a in g.advs"
                :key="a.id"
                :adv="a"
                :look="lookOf(a)"
                :power="powerOf(a)"
                :state="stateOf(a)"
                :tone="statusOf(a)"
                :disabled="busy"
                :gear="gearCellsOf(a)"
                @gear="(slot) => (gearPick = { advId: a.id, slot })"
                @open="detailAdv = a"
              />
            </div>
          </section>
        </template>

        <!-- ── 🗡️ LE STOCK D'ÉQUIPEMENT (onglet) ─────────────────────────────────────
             ⚠️ Ce n'est PAS le sac du héros : ces pièces sont propres à chaque classe de
             base (`canWearAdvGear`) — elles ne viennent QUE du tirage gacha (v0.1012),
             jamais du butin du héros ni d'un drop.
             « Équiper » ouvre la liste des aventuriers qui peuvent la porter.
             🔒 / 🪙 comme le sac, désactivés si portée. -->
        <template v-else-if="guildTab === 'stock'">
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
                  <span class="d-pair-emo"
                    ><AdvGearArt :model="advGearModelOf(g)">{{ g.emoji }}</AdvGearArt></span
                  >
                  <!-- 🏅 Rang + étoiles, le badge du coin des portraits de champion. -->
                  <RankStarBadge class="gear-rsb" v-bind="advGearRankStar(g)" />
                  <span class="d-pair-main">
                    <span class="d-pair-name">
                      <b :style="{ color: advGearBadge(g).color }">{{ g.name }}</b>
                      <!-- ⭐ Les ÉTOILES de son rang, comme un champion (v0.1015) : elles montent en
                           combattant avec son porteur. Le niveau reste caché. -->
                      <span v-if="g.awaken" class="d-train awk">✨{{ g.awaken }}</span>
                    </span>
                    <!-- 🎰 La LETTRE (B / A / S), comme les champions — plus le rang +
                         étoiles du héros (demandé). -->
                    <!-- ⚠️ Deux éléments FLEX plutôt qu'un « · » entre deux textes : en
                         colonne étroite la lignée passe à la ligne et le séparateur restait
                         orphelin en bout de ligne précédente. -->
                    <span class="d-pair-sub gear-meta">
                      <span class="d-rk" :style="{ '--rk': advGearBadge(g).color }">{{
                        advGearBadge(g).label
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
                  <!-- ⬆️ Ascension : proposée seulement quand la pièce BUTE sur son ★5 ; la
                       raison d'un refus est dans le titre, et redite avant de payer. -->
                  <!-- ✨ Éveil : sur la pièce GARDÉE seulement (la plus avancée du modèle) ;
                       le nombre dit combien de doublons libres attendent. -->
                  <button
                    v-if="awakenOf(g)"
                    type="button"
                    class="gear-btn ascend"
                    :disabled="busy"
                    :title="`Éveiller en fondant un doublon (${awakenOf(g)!.spare} libre${awakenOf(g)!.spare > 1 ? 's' : ''})`"
                    :aria-label="`Éveiller (${awakenOf(g)!.spare})`"
                    @click="doAwaken(g)"
                  >
                    ✨{{ awakenOf(g)!.spare }}
                  </button>
                  <button
                    v-if="gearAscent(g)"
                    type="button"
                    class="gear-btn ascend"
                    :disabled="busy || !!gearAscent(g)!.block"
                    :title="gearAscent(g)!.title"
                    :aria-label="gearAscent(g)!.title"
                    @click="doAscendGear(g)"
                  >
                    ⬆️
                  </button>
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
        <!-- 📖 LA COLLECTION (demandé : « voir ce qu'on a ou pas et leur rareté »). La même
           galerie que le Codex (un seul composant) : elle vit AUSSI ici parce que c'est
           au Panthéon qu'on invoque, donc là qu'on veut voir ce qui manque. -->
        <ChampionCollection v-else-if="guildTab === 'collection'" :advs="roster" />
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
        <!-- ✨ L'ÉVEIL : jusqu'à +48 % de stats, et il pouvait monter une signature — mais
             il ne se lisait qu'au tirage et dans le Codex, jamais sur la fiche du champion
             qu'on envoie au combat. Sur `/max` ici : la fiche a la place de dire ce qu'il
             reste à réveiller, la tuile non. -->
        <template v-if="awkOf(detailAdv)">
          ·
          <button type="button" class="d-awk" @click="showAwakenInfo(detailAdv)">
            ✨ Éveil {{ awkOf(detailAdv) }}/{{ AWAKEN.max }} ⓘ
          </button>
        </template>
      </div>

      <!-- ⚔️ La puissance, et ce que l'ÉQUIPEMENT y ajoute : sans l’écart, on ne sait pas si
           les pièces confiées servent à quelque chose. -->
      <div class="d-pow">
        <span class="d-pow-val font-display">⚔️ {{ fmtPow(powerOf(detailAdv)) }}</span>
        <span v-if="pairBonusOf(detailAdv) > 0" class="d-pow-gain">
          dont +{{ fmtPow(pairBonusOf(detailAdv)) }} grâce à son équipement
        </span>
        <span v-else class="d-pow-gain">sans équipement qui compte</span>
      </div>

      <!-- Les STATS, qui n'étaient lisibles nulle part une fois la promotion faite. -->
      <div class="d-stats">
        <span class="d-stat">💪 {{ statsOf(detailAdv).puissance }}</span>
        <span class="d-stat">❤️ {{ statsOf(detailAdv).endurance }}</span>
        <span class="d-stat">⚡ {{ statsOf(detailAdv).agilite }}</span>
      </div>

      <!-- 🗡️ SES 4 EMPLACEMENTS D'ÉQUIPEMENT — une pièce par métier, jamais deux fois
           la même stat qu'un objet du héros : elles viennent du tirage, et le sélecteur filtre par lignée et
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
          <span class="dg-emo"
            ><AdvGearArt :model="s.model">{{ s.emoji }}</AdvGearArt></span
          >
          <span class="dg-name" :style="s.color ? { color: s.color } : {}">{{ s.name }}</span>
          <!-- Rang (même lecture que familiers et talents) et stat principale : on voit
               ce qu'il porte d'un coup d'œil, sans ouvrir le sélecteur (v0.865). -->
          <span v-if="s.rank" class="dg-rk" :style="{ color: s.color }">{{ s.rank }}</span>
          <RankStarBadge v-if="s.piece" class="dg-rsb" v-bind="advGearRankStar(s.piece)" />
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

      <!-- ⬆️ L'ASCENSION (v0.1014) : à ★★★★★ la fin de son rang bloque son XP ; ouvrir le
           suivant coûte de l'or et des sceaux DE CE RANG (gardiens de faille). ⚠️ La raison
           d'un refus vient de `ascensionBlocker`, la règle du store — jamais un bouton
           grisé en silence. -->
      <div v-if="ascentOf(detailAdv)" class="d-ascent">
        <div class="d-ascent-t">
          ⬆️ Ascension vers {{ ascentOf(detailAdv)!.rank.emoji }}
          <b :style="{ color: ascentOf(detailAdv)!.rank.color }">{{
            ascentOf(detailAdv)!.rank.name
          }}</b>
        </div>
        <div class="d-ascent-cost">
          <span :class="{ short: ascentOf(detailAdv)!.have < ascentOf(detailAdv)!.cost.seals }"
            >🔱 {{ ascentOf(detailAdv)!.have }}/{{ ascentOf(detailAdv)!.cost.seals }} sceau{{
              ascentOf(detailAdv)!.cost.seals > 1 ? 'x' : ''
            }}
            {{ ascentOf(detailAdv)!.rank.name }}</span
          >
          <span :class="{ short: char.row!.gold < ascentOf(detailAdv)!.cost.gold }"
            >🪙 {{ ascentOf(detailAdv)!.cost.gold.toLocaleString('fr-FR') }}</span
          >
        </div>
        <p v-if="ascentOf(detailAdv)!.block" class="d-ascent-why">
          {{ ASCENSION_BLOCK_LABEL[ascentOf(detailAdv)!.block!] }}
        </p>
        <q-btn
          unelevated
          no-caps
          class="d-ascent-btn"
          color="primary"
          text-color="dark"
          label="Faire l’ascension"
          :disable="!!ascentOf(detailAdv)!.block || busy"
          @click="doAscend(detailAdv)"
        />
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

      <div class="g-actions">
        <q-btn flat no-caps label="Fermer" @click="detailAdv = null" />
      </div>
    </q-card>
  </q-dialog>

  <!-- ── À QUI CONFIER CETTE PIÈCE ? (depuis le stock) ─────────────────────
       ⚠️ Seuls ceux qui PEUVENT la porter sont proposés (`canWearAdvGear` : son métier,
       rang de sa classe) — les autres sont comptés, par raison. -->
  <q-dialog :model-value="!!stockEquip" position="bottom" @update:model-value="stockEquip = null">
    <q-card v-if="stockEquip && stockEquipRows" class="guild-card">
      <div class="g-head">
        <div class="g-title font-display">
          <AdvGearArt :model="advGearModelOf(stockEquip)">{{ stockEquip.emoji }}</AdvGearArt>
          <span :style="{ color: advGearBadge(stockEquip).color }">{{ stockEquip.name }}</span>
        </div>
        <button class="iconbtn" aria-label="Fermer" @click="stockEquip = null">✕</button>
      </div>
      <p class="g-note">
        {{ lineageLabel(stockEquip.lineage) }} · {{ advGearBadge(stockEquip).label }} ·
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
        <span class="d-pair-emo"
          ><AdvGearArt :model="advGearModelOf(r.g)">{{ r.g.emoji }}</AdvGearArt></span
        >
        <RankStarBadge class="gear-rsb" v-bind="advGearRankStar(r.g)" />
        <span class="d-pair-main">
          <span class="d-pair-name">
            <b :style="{ color: r.color }">{{ r.g.name }}</b>
            <span v-if="r.g.awaken" class="d-train awk">✨{{ r.g.awaken }}</span>
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
import { showAwakenInfo } from '@/composables/useAwakenInfo';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import {
  ADV_STARS,
  advGradeBadge,
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
  groupByGrade,
  advShapeLabel,
  ADV_ROLE_LABEL,
  ADV_SIGNATURE_LABEL,
  type Adventurer,
} from '@/lib/adventurers';
import { CHARACTER_RANKS, characterRank, rankStarStr } from '@/lib/characterRank';
import {
  advGearAscensionBlocker,
  advGearAscensionCost,
  GEAR_ASCENSION_BLOCK_LABEL,
  ASCENSION_BLOCK_LABEL,
  ascensionBlocker,
  ascensionCost,
  emptySeals,
  sealCount,
} from '@/lib/ascension';
import {
  AWAKEN,
  advAscensionCap,
  advAwaken,
  advNextAscension,
  advSubtitle,
  engageCap,
} from '@/lib/adventurers';
import { GRADE_COLOR } from '@/data/champions';
import { adventurerPowers, adventurerGearPower, autoAdvGear } from '@/lib/raid';
import { fmtPow, fmtDelta } from '@/lib/combat';
import AdventurerPortrait from '@/components/AdventurerPortrait.vue';
import AdvGearArt from '@/components/AdvGearArt.vue';
import RankStarBadge from '@/components/RankStarBadge.vue';
import ChampionCollection from '@/components/ChampionCollection.vue';
import { CHAMPIONS } from '@/data/champions';
import { type EscortKit } from '@/lib/caravan';
import {
  ADV_GEAR_SLOTS,
  advGearBadge,
  advGearRankStar,
  compareAdvGear,
  advGearCells,
  advGearModelOf,
  advGearEffectTexts,
  advGearOptions,
  advGearSellValue,
  advLooks,
  canWearAdvGear,
  pendingAdvGear,
  lineageOf,
  wornGear,
  advGearAwakenPlan,
  advGearLevelBand,
  advGearNextRank,
  advGearRankCap,
  type AdvGear,
  type AdvGearCell,
  type AdvGearSlot,
  type AdvLook,
  type Lineage,
} from '@/lib/advGear';

const props = defineProps<{
  open: boolean;
  /** Quelle feuille : le vivier (+ collection) ou le stock d'équipement. Défaut : vivier. */
  section?: 'champions' | 'gear';
}>();
const emit = defineEmits<{ close: [] }>();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

// ── 🗡️ CE QU'UN CHAMPION PORTE : son équipement, et rien d'autre ─────────────────
// ⚠️ Plus de compagnon ni de talent (v0.996, décision de l'utilisateur : « on les garde
// pour le héros uniquement »). Ce qu'ils apportaient est rendu dans sa base de stats.
/** Le contexte d'équipement. ⚠️ UN seul objet pour la puissance ET l'aperçu : deux
 *  copies finiraient par ne pas retenir les mêmes pièces. */
const compCtx = computed<EscortKit>(() => ({ advGear: char.row?.adv_gear?.stock ?? [] }));
/** ⚔️ Puissances calculées par la LIB (`combatPower`, celle du héros) — jamais ici. La
 *  version NUE sert à dire ce que l'équipement ajoute. */
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
/** L'avertissement des sélecteurs. ⚠️ Écrit UNE fois : deux copies mot pour mot se
 *  reformulent séparément, et l'une des deux finit par mentir. */
const GAIN_NOTE = 'Les gains listés sont ce que le champion en tire.';
/** ⚠️ Le store REFUSE ce qui est impossible : on affiche son message plutôt que d’en
 *  réécrire un second qui pourrait diverger. */
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
/** Ce que « Confier au mieux » ferait, AVANT de toucher : le MÊME plan que le store
 *  (`autoAdvGear`) sur le même contexte, et le gain de puissance du vivier. ⚠️ Un plan,
 *  jamais deux calculs : si l'aperçu recalculait à sa façon, il pourrait finir par
 *  annoncer autre chose que ce que le bouton fait. */
const autoPreview = computed(() => {
  const advs = char.advList;
  const ctx = compCtx.value;
  const gearPlan = autoAdvGear(advs, ctx);
  let changes = 0;
  const after = advs.map((a) => {
    const g = gearPlan.get(a.id) ?? {};
    if (ADV_GEAR_SLOTS.some((s) => (g[s] ?? null) !== (a.gear?.[s] ?? null))) changes++;
    return { ...a, gear: g };
  });
  const sum = (m: Map<string, number>) => [...m.values()].reduce((x, v) => x + v, 0);
  const gain = sum(adventurerPowers(after, ctx)) - sum(powers.value);
  // ⚠️ CE QUI MANQUAIT : « il y a du monde à ARMER ». Le gain seul ne le dit pas — une
  // pièce peut attendre pendant que le gain reste modeste, et un emplacement vide se lisait
  // alors comme une panne de l'auto-équipement.
  const pending = [...gearPending.value.values()].reduce((n, slots) => n + slots.length, 0);
  return { changes, gain, pending };
});
/** Puissance totale du vivier — la somme de ce que chaque portrait affiche. */
const rosterPower = () =>
  [...adventurerPowers(char.advList, compCtx.value).values()].reduce((s, p) => s + p, 0);
function autoPair() {
  void pair(async (uid) => {
    const before = rosterPower();
    const r = await char.autoAssignGear(uid);
    if (!r) return;
    const after = rosterPower();
    $q.notify({
      type: 'positive',
      message: `✨ ${r.gear} pièce(s) confiée(s) · puissance du vivier ${fmtPow(before)} → ${fmtPow(after)}`,
    });
  });
}

// ── 🗡️ SON ÉQUIPEMENT : 4 emplacements (arme/armure/accessoire/relique), propres à SON métier ──
// ⚠️ Distinct du compagnon et du talent : ces pièces vivent dans un STOCK séparé
// (`char.advGearStock`), pas dans le sac du héros, et sont plafonnées par la RARETÉ DE
// SA CLASSE (`canWearAdvGear`) — même règle que les deux autres, appliquée par le store.
const gearPick = ref<{ advId: string; slot: AdvGearSlot } | null>(null);
const gearPickAdv = computed(() =>
  gearPick.value ? char.advList.find((a) => a.id === gearPick.value!.advId) : undefined,
);
/** Le contexte du sélecteur : celui du panneau. Il ne dépend plus de l'horloge (plus de
 *  fatigue de compagnon), donc le tick ne recalcule pas les lignes. */
const gearPickCtx = compCtx;
/** Qui porte quoi, RÈGLES APPLIQUÉES (`wornGear`, identique à ce que le combat lit) —
 *  pour la fiche, où une pièce devenue invalide (rang dépassé, prise par un autre) doit
 *  se lire comme un emplacement VIDE, pas comme portée. */
const gearWorn = computed(() => wornGear(char.advList, char.advGearStock));
/** 🖼️ L'apparence de TOUT le vivier, équipement porté compris (`advLooks`, v0.865) — un
 *  seul calcul au niveau du panneau, qui ne dépend ni de `now` ni du rendu d'un portrait. */
const looks = computed(() => advLooks(char.advList, char.advGearStock));
function lookOf(a: Adventurer): AdvLook {
  // Le portrait itère sur `rosterGroups`, dérivé de `char.advList` : l'entrée existe toujours.
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
    // Même ordre que le stock (`compareAdvGear`) : rareté, rang, étoiles, éveil.
    rows: [...c.options].sort(compareAdvGear).map((g) => ({
      g,
      color: advGearBadge(g).color,
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
const guildTab = ref<'roster' | 'stock' | 'collection'>(
  props.section === 'gear' ? 'stock' : 'roster',
);
// ⚠️ La feuille d'équipement ne montre QUE le stock ; celle des champions ne le montre
// plus (il a sa tuile). Suivi à chaque ouverture : le composant reste monté.
watch(
  () => [props.section, props.open] as const,
  ([sec]) => {
    if (sec === 'gear') guildTab.value = 'stock';
    else if (guildTab.value === 'stock') guildTab.value = 'roster';
  },
);
/** Champions DISTINCTS possédés — même définition que la galerie (`championId` unique). */
const collectionOwned = computed(
  () => new Set(roster.value.map((a) => a.championId).filter(Boolean)).size,
);

// ── 🗡️ LE STOCK — équiper / vendre / verrouiller une pièce d'aventurier ──
// ⚠️ Même politique que le sac du héros : 🔒 protège des deux, une pièce PORTÉE
// (`Adventurer.gear`, BRUT — même lecture que `dropAdvGear` côté store) ne se cède pas.
/** Le stock, par LETTRE (S, A, B), puis du rang le plus haut au plus bas, puis par
 *  emplacement. */
const stockSorted = computed(() => [...char.advGearStock].sort(compareAdvGear));
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
/** Qui peut la porter, avec ce qu'il y gagnerait (même arbitre que le sélecteur par case,
 *  même contexte). */
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

// ── 🔎 FILTRE PAR ÉTAT (demandé) : qui peut partir, qui est sur la route, qui se soigne ──
// ⚠️ `null` = tous. Le filtre ne RANGE rien de lui-même : il lit `statusOf`, donc la même
// règle que le cadre coloré et que la ligne d'état — les trois ne peuvent pas se contredire.
const rosterFilter = ref<AdvStatus | null>(null);
/** Combien dans chaque catégorie — affiché sur chaque puce, et c'est ce qui permet de ne
 *  proposer QUE les catégories peuplées (une puce « 0 » n'apprend rien et prend la place). */
const rosterCounts = computed(() => {
  const m = new Map<AdvStatus, number>();
  for (const a of roster.value) m.set(statusOf(a), (m.get(statusOf(a)) ?? 0) + 1);
  return m;
});
const rosterChips = computed(() => ADV_STATUSES.filter((s) => rosterCounts.value.get(s)));
const rosterShown = computed(() =>
  rosterFilter.value === null
    ? roster.value
    : roster.value.filter((a) => statusOf(a) === rosterFilter.value),
);
/** Ce qu'on affiche, rangé par lettre puis rang/étoiles (`groupByGrade`) — le filtre
 *  d'état s'applique AVANT le rangement. La lib COPIE : `advList` garde l'ordre du
 *  vivier, dont dépendent d'autres règles. */
const rosterGroups = computed(() => groupByGrade(rosterShown.value, powerOf));
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
const nomOf = (a: Adventurer) => advGradeBadge(a).label;
const nomColor = (a: Adventurer) => advGradeBadge(a).color;
const titleOf = (a: Adventurer) => advTitle(a);
/** Son rang d'Éveil — 0 pour un legacy, qui n'a pas de doublons. */
const awkOf = (a: Adventurer) => advAwaken(a);
/** Sa classe, ou rien quand elle répète son nom — la règle vit en lib, parce que le
 *  portrait du vivier pose exactement la même question. */
const subOf = (a: Adventurer) => advSubtitle(a);
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
// ── Fiche d'un aventurier ──
const detailAdv = ref<Adventurer | null>(null);
/** ⬆️ L'ascension à proposer — seulement quand son XP BUTE sur la fin de son rang (★★★★★),
 *  sinon le bloc serait une promesse lointaine qui encombre la fiche. */
function ascentOf(a: Adventurer) {
  const next = advNextAscension(a);
  if (next == null || a.level < advAscensionCap(a)) return null;
  const cost = ascensionCost(next);
  const seals = char.row?.seals ?? emptySeals();
  return {
    rank: CHARACTER_RANKS[next]!,
    cost,
    have: sealCount(seals, 'champion', next),
    block: ascensionBlocker(a, {
      pantheonLevel: pantheonLevel.value,
      seals,
      gold: char.row?.gold ?? 0,
    }),
  };
}
/** ⬆️ L'ascension d'une PIÈCE — même patron que celle d'un champion. `null` tant qu'elle
 *  n'est pas à ★5 : un bouton qui promettrait une échéance lointaine encombrerait la tuile. */
function gearAscent(g: AdvGear) {
  const next = advGearNextRank(g);
  if (next == null || g.level < advGearLevelBand(g.rarity).max) return null;
  const cost = advGearAscensionCost(next);
  const seals = char.row?.seals ?? emptySeals();
  const block = advGearAscensionBlocker(g, {
    rankCap: advGearRankCap(g, char.advList, char.advGearStock),
    seals,
    gold: char.row?.gold ?? 0,
  });
  const rank = CHARACTER_RANKS[next]!;
  const price = `⚜️ ${sealCount(seals, 'gear', next)}/${cost.seals} · 🪙 ${cost.gold.toLocaleString('fr-FR')}`;
  return {
    rank,
    cost,
    block,
    title: block
      ? `Ascension vers ${rank.name} — ${GEAR_ASCENSION_BLOCK_LABEL[block]} (${price})`
      : `Ascension vers ${rank.name} (${price})`,
  };
}
/** ✨ Le plan d'éveil — affiché seulement sur la pièce GARDÉE, sinon chaque exemplaire du
 *  modèle porterait le même bouton et on ne saurait pas lequel monte. */
function awakenOf(g: AdvGear) {
  const plan = advGearAwakenPlan(g, char.advGearStock, char.advList);
  return plan && plan.keep.id === g.id ? plan : null;
}
function doAwaken(g: AdvGear) {
  const plan = awakenOf(g);
  if (!plan) return;
  const aw = Math.max(g.awaken ?? 0, plan.consume.awaken ?? 0) + 1;
  $q.dialog({
    title: `✨ Éveiller ${g.name}`,
    message: `Un doublon (${rankStarStr(characterRank(plan.consume.level).star)}) est fondu. ${g.name} passe à l’éveil ${aw} : +${Math.round(AWAKEN.perStep * 100)} % sur ses stats.`,
    cancel: true,
  }).onOk(() => {
    void pair(async (uid) => {
      const err = await char.awakenGear(uid, g.id);
      if (err) throw new Error(err);
    });
  });
}
function doAscendGear(g: AdvGear) {
  const s = gearAscent(g);
  if (!s || s.block) return;
  $q.dialog({
    title: `⬆️ ${g.name} → ${s.rank.emoji} ${s.rank.name}`,
    message: `Coût : ${s.cost.seals} sceau(x) d’objet ${s.rank.name} et ${s.cost.gold.toLocaleString('fr-FR')} 🪙. Son éveil est conservé.`,
    cancel: true,
  }).onOk(() => {
    void pair(async (uid) => {
      const err = await char.ascendGear(uid, g.id);
      if (err) throw new Error(err);
      $q.notify({ type: 'positive', message: `⬆️ ${g.name} passe au rang ${s.rank.name}.` });
    });
  });
}
function doAscend(a: Adventurer) {
  void pair(async (uid) => {
    const err = await char.ascendChampion(uid, a.id);
    if (err) throw new Error(err);
    // La fiche montre l'aventurier À JOUR (nouveau rang, XP reversée).
    detailAdv.value = char.advList.find((x) => x.id === a.id) ?? null;
    $q.notify({ type: 'positive', message: `⬆️ ${a.name} passe au rang supérieur.` });
  });
}
/** CE QUE CHAQUE PIÈCE PORTÉE APPORTE, en puissance — l'arbitre de tout le jeu.
 *
 *  ⚠️ La case n'affichait que la stat brute (« +1,1 % de vie »), signalée par l'utilisateur
 *  comme illisible : un pourcentage ne dit rien tant qu'on ne connaît pas son assiette, et
 *  il ne se compare pas d'une pièce à l'autre (des dégâts contre de la réduction). Mesuré,
 *  une pièce de rang Bronze vaut ~0,5 % de la puissance de son porteur — le chiffre honnête
 *  est donc l'écart, pas la stat.
 *
 *  ⚠️ Même contexte que le panneau (`compCtx`), qui ne dépend pas de l'horloge. */
const detailCtx = compCtx;
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
</script>

<style scoped lang="scss">
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
/* ✨ Même teinte que la pastille du Codex : une seule couleur pour l’Éveil. */
.d-awk {
  color: var(--accent);
  font-weight: 700;
  /* Un bouton : on le touche pour savoir ce que veut dire « Éveil ». Cible élargie par
     le padding, compensée par la marge — la ligne ne bouge pas. */
  background: none;
  border: 0;
  font: inherit;
  padding: 6px 4px;
  margin: -6px 0;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
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
.d-ascent {
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.d-ascent-t {
  font-size: 14px;
  margin-bottom: 6px;
}
.d-ascent-cost {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 13px;
}
.d-ascent-cost .short {
  color: var(--d4);
}
.d-ascent-why {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.d-ascent-btn {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
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
.adv-rgroup {
  margin-top: 14px;
}
.adv-rhead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
}
.adv-rname {
  color: var(--c);
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.adv-rn {
  margin-left: auto;
  color: var(--dim);
  font-size: 12px;
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
/* 🏅 Le badge rang + étoiles, rangé en haut À DROITE comme sur un portrait de champion. */
.gear-rsb {
  order: 3;
  flex: none;
  width: 34px;
  margin-left: auto;
}
.dg-rsb {
  width: 28px;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 4px 0 10px;
}
.g-tab {
  min-height: 44px;
  padding: 4px 6px;
  line-height: 1.2;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-weight: 700;
  font-size: 13px;
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
.gear-btn.ascend:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
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
