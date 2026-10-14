/**
 * 🏷️ LES PASTILLES DU PRONOSTIC (2026-10-14, préférence de l'utilisateur : chips et tuiles
 * plutôt que blocs de texte). Traduit un `BattleForecast` (`defenseForecast.ts`) en lignes de
 * pastilles courtes, prêtes à afficher : le composant `ForecastChips.vue` ne décide de rien.
 * ⚠️ AUCUN calcul de combat ici — uniquement de la mise en mots et des seuils d'affichage.
 */
import type { BattleForecast, DefenseForecast, LossForecast } from './defenseForecast';
import { wearLabel, type EnemyWear } from './enemyWear';
import type { ControlState } from './expedition';

export type ChipTone = 'ok' | 'warn' | 'bad' | 'info';

export interface ForecastChip {
  key: string;
  text: string;
  tone: ChipTone;
  /** Ce que la pastille veut dire (infobulle). */
  title?: string;
}

export interface ForecastRow {
  key: string;
  /** « ✅ Si elle tient », « 💥 Si elle tombe »… */
  label: string;
  chips: ForecastChip[];
}

export interface ForecastView {
  /** Les pastilles de tête (la tenue, la part abattue). */
  head: ForecastChip[];
  rows: ForecastRow[];
}

/** En dessous, une probabilité ou une perte n'est pas annoncée (du bruit de simulation). */
const MIN_P = 0.02;
const MIN_MEAN = 0.05;

const pct = (x: number): string => `${Math.round(x * 100)} %`;
const mean = (x: number): string => {
  const r = Math.round(x * 10) / 10;
  return String(r).replace('.', ',');
};
const toneOfWin = (p: number): ChipTone => (p >= 0.8 ? 'ok' : p >= 0.5 ? 'warn' : 'bad');

/** Nos pertes sous forme de pastilles ; « aucune perte » quand il n'y en a pas. */
export function lossChips(l: LossForecast, key: string): ForecastChip[] {
  const out: ForecastChip[] = [];
  if (l.militia >= MIN_MEAN)
    out.push({
      key: `${key}-mil`,
      text: `🛡️ ~${mean(l.militia)} milicien${l.militia >= 1.5 ? 's' : ''} perdu${l.militia >= 1.5 ? 's' : ''}`,
      tone: 'warn',
      title: 'Les miliciens tombés ne reviennent pas',
    });
  if (l.pHurt >= MIN_P)
    out.push({
      key: `${key}-hurt`,
      text: `🤕 champion blessé ${pct(l.pHurt)}`,
      tone: 'bad',
      title: 'Au moins un champion part à l’infirmerie (blessure grave)',
    });
  if (l.pLight >= MIN_P)
    out.push({
      key: `${key}-light`,
      text: `🩹 blessé léger ${pct(l.pLight)}`,
      tone: 'warn',
      title: 'Victoire de justesse : convalescence courte',
    });
  if (l.heroHurt >= MIN_P)
    out.push({
      key: `${key}-hero`,
      text: `🧝 héros blessé ${pct(l.heroHurt)}`,
      tone: 'bad',
      title: 'Le héros rentre blessé s’il perd',
    });
  if (!out.length)
    out.push({
      key: `${key}-none`,
      text: '✨ aucune perte',
      tone: 'ok',
      title: 'Ni mort ni blessé',
    });
  return out;
}

/** La troupe ennemie usée d'une part `share` (0..1) : « troupe affaiblie de 45 % · se renforce
 *  en 6 vagues d’attaque ». ⚠️ Le libellé est celui de `wearLabel` (une seule phrase pour la fiche d'un
 *  lieu usé ET le pronostic) ; seule la pastille « intacte » est écrite ici. */
export function wearChips(share: number, key: string, who = 'troupe'): ForecastChip[] {
  const label = wearLabel({ share, from: 0 });
  if (!label) return [{ key: `${key}-w0`, text: `⚔️ ${who} intacte`, tone: 'bad' }];
  return [
    {
      key: `${key}-w`,
      text: `⚔️ ${who} ${label}`,
      tone: 'ok',
      title: 'Ce que ce combat lui retirera, même vainqueur ; elle se refait au fil de tes sorties',
    },
  ];
}

/** 🛡️ Défense d'un lieu tenu. */
export function defenseView(f: DefenseForecast): ForecastView {
  const head: ForecastChip[] = [
    {
      key: 'hold',
      text: `🛡️ Tient ${pct(f.hold)}`,
      tone: toneOfWin(f.hold),
      title: f.vsArmy
        ? 'Chance de repousser l’armée en approche'
        : 'Chance de repousser les assauts, contre l’ennemi le plus fort possible',
    },
  ];
  const rows: ForecastRow[] = [];
  if (f.samples === 0) return { head, rows };
  if (f.win > 0)
    rows.push({ key: 'won', label: '✅ Si elle tient', chips: lossChips(f.ifWon, 'won') });
  if (f.lostSamples > 0)
    rows.push({
      key: 'lost',
      label: '💥 Si elle tombe',
      chips: [...wearChips(f.wearIfLost, 'lost'), ...lossChips(f.ifLost, 'lost')],
    });
  return { head, rows };
}

/** ⚔️ Assaut du joueur sur un lieu ennemi : `wears` = le lieu garde l'usure d'un échec (un
 *  point de contrôle) ; sinon (camp) seule la perte est dite. */
export function attackView(f: BattleForecast, wears: boolean): ForecastView {
  const rows: ForecastRow[] = [];
  if (f.win > 0)
    rows.push({ key: 'won', label: '✅ Si tu gagnes', chips: lossChips(f.ifWon, 'won') });
  if (f.lostSamples > 0)
    rows.push({
      key: 'lost',
      label: '💥 Si l’assaut échoue',
      chips: [...(wears ? wearChips(f.wearIfLost, 'lost') : []), ...lossChips(f.ifLost, 'lost')],
    });
  return { head: [], rows };
}

/** 🗼 Interception d'une armée en campagne. */
export function interceptView(f: BattleForecast): ForecastView {
  const head: ForecastChip[] = [
    {
      key: 'part',
      text: `🗼 Armée abattue ~${pct(f.partAll)}`,
      tone: toneOfWin(f.partAll),
      title: 'La part de ses troupes que le choc abattra en moyenne (battue = 100 %)',
    },
  ];
  const rows: ForecastRow[] = [];
  if (f.win > 0)
    rows.push({ key: 'won', label: '✅ Si elle est battue', chips: lossChips(f.ifWon, 'won') });
  if (f.lostSamples > 0)
    rows.push({
      key: 'lost',
      label: '💥 Si l’assaut échoue',
      chips: [
        {
          key: 'lost-cut',
          text: `⚔️ armée amputée ~${pct(f.partIfLost)}`,
          tone: 'ok',
          title: 'Elle marche encore, mais avec ce qu’il lui reste',
        },
        ...lossChips(f.ifLost, 'lost'),
      ],
    });
  return { head, rows };
}

/** 🩸 La pastille d'un lieu ENNEMI usé : « affaiblie de 40 % · se renforce en 6 vagues d’attaque ».
 *  `null` si le lieu n'est pas ennemi ou pas usé. */
export function wornChip(
  control: Pick<ControlState, 'owner' | 'wear'> | undefined,
): ForecastChip | null {
  const w: EnemyWear | undefined = control?.owner === 'enemy' ? control.wear : undefined;
  const text = wearLabel(w);
  return text
    ? {
        key: 'worn',
        text: `🩸 Troupe ${text}`,
        tone: 'ok',
        title: 'Sa troupe porte les pertes de ses derniers combats : elle est plus facile à battre',
      }
    : null;
}
