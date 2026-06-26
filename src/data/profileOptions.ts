// profileOptions.ts — listes d'options partagées par l'onboarding et le profil.
// Source unique pour rester synchrones (notamment SPORTS, dont les libellés
// sont mappés en muscles par le générateur, cf. programBuilder.ts).
import type { Level, Objective, EquipmentItem, SportPractice } from '@/lib/types';

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

export const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: 'force', label: 'Force' },
  { value: 'hypertrophie', label: 'Hypertrophie (prise de muscle)' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'remise_en_forme', label: 'Remise en forme' },
  { value: 'perte_de_gras', label: 'Perte de gras' },
];

export const EQUIPMENT_ITEMS: { value: EquipmentItem; label: string; desc: string }[] = [
  { value: 'barre', label: 'Barre + disques', desc: 'Squat, développé couché, soulevé de terre…' },
  { value: 'halteres', label: 'Haltères', desc: 'Développés, curls, fentes…' },
  { value: 'machine', label: 'Machines guidées', desc: 'Presse, leg curl, pec deck…' },
  { value: 'poulie', label: 'Poulie / câble', desc: 'Tirages, extensions, écartés…' },
  { value: 'poids_du_corps', label: 'Poids du corps', desc: 'Pompes, gainage, tractions… (toujours dispo)' },
];

export const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const PRIORITY_MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Fessiers', 'Abdos'];
export const SPORTS = ['Course', 'Vélo', 'Natation', 'Escalade', 'Football', 'Basket', 'Tennis', 'Boxe', 'Rugby', 'Yoga'];

export const INTENSITIES: { value: NonNullable<SportPractice['intensity']>; label: string }[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'moderee', label: 'Modérée' },
  { value: 'elevee', label: 'Élevée' },
];
