// profileOptions.ts — listes d'options partagées par l'onboarding et le profil.
// Source unique pour rester synchrones (notamment SPORTS, dont les libellés
// sont mappés en muscles par le générateur, cf. programBuilder.ts).
import type { Level, EquipmentItem, SportPractice } from '@/lib/types';

// Objectifs guidés : source unique dans objectives.ts, ré-exportée ici.
export { OBJECTIVES, type ObjectiveOption } from './objectives';

export const SEXES: { value: 'homme' | 'femme' | 'autre'; label: string }[] = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
];

export const LEVELS: { value: Level; label: string; desc: string }[] = [
  { value: 'debutant', label: 'Débutant', desc: 'Progression linéaire guidée, programme généré, note d’effort simple.' },
  { value: 'intermediaire', label: 'Intermédiaire', desc: 'Double progression assistée, RIR optionnel, template éditable.' },
  { value: 'avance', label: 'Avancé', desc: 'Double progression + RIR, import/construction libre, UI dense.' },
];

export interface EquipmentOption { value: EquipmentItem; label: string; desc?: string }
export interface EquipmentGroup { group: string; items: EquipmentOption[] }

// Matériel détaillé groupé. Le poids du corps est toujours dispo (implicite).
export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  {
    group: 'Barres & racks',
    items: [
      { value: 'barbell', label: 'Barre + disques', desc: 'Squat, développé, soulevé de terre…' },
      { value: 'rack', label: 'Rack / cage à squat' },
      { value: 'bench', label: 'Banc', desc: 'Plat ou inclinable' },
    ],
  },
  {
    group: 'Charges libres',
    items: [
      { value: 'dumbbells', label: 'Haltères' },
      { value: 'kettlebell', label: 'Kettlebell' },
      { value: 'bands', label: 'Élastiques / bandes' },
    ],
  },
  {
    group: 'Machines & câbles',
    items: [
      { value: 'cable', label: 'Poulie / station à câbles' },
      { value: 'machine', label: 'Machines guidées', desc: 'Presse, leg curl, pec deck…' },
    ],
  },
  {
    group: 'Au poids du corps',
    items: [
      { value: 'pullup_bar', label: 'Barre de traction' },
      { value: 'dip_station', label: 'Barre à dips / station' },
    ],
  },
];

// Liste plate (toutes options confondues).
export const EQUIPMENT_ITEMS: EquipmentOption[] = EQUIPMENT_GROUPS.flatMap((g) => g.items);

export const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const PRIORITY_MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Fessiers', 'Abdos'];
export const SPORTS = ['Course', 'Vélo', 'Natation', 'Escalade', 'Football', 'Basket', 'Tennis', 'Boxe', 'Rugby', 'Yoga'];

export const INTENSITIES: { value: NonNullable<SportPractice['intensity']>; label: string }[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'moderee', label: 'Modérée' },
  { value: 'elevee', label: 'Élevée' },
];
