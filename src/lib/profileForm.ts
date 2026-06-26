// profileForm.ts — modèle de formulaire profil + conversions Profile <-> form.
// Partagé par l'onboarding et l'écran Profil pour éviter toute divergence.
import type { Level, Objective, Equipment, EquipmentItem, SportPractice, Profile } from './types';
import { SCHEMA_VERSION } from './types';

export interface ProfileForm {
  name: string;
  sex: 'homme' | 'femme' | 'autre' | undefined;
  birth_year: number | undefined;
  height_cm: number | undefined;
  weight_kg: number | undefined;
  level: Level;
  training_months: number | undefined;
  objective: Objective;
  sessions_per_week: number;
  session_duration_min: number;
  preferred_days: string[];
  available_equipment: EquipmentItem[];
  sports: SportPractice[];
  injuries: string[];
  avoid_exercises: string[];
  priority_muscles: string[];
  units: 'kg' | 'lb';
}

export function emptyProfileForm(): ProfileForm {
  return {
    name: '',
    sex: undefined,
    birth_year: undefined,
    height_cm: undefined,
    weight_kg: undefined,
    level: 'debutant',
    training_months: undefined,
    objective: 'remise_en_forme',
    sessions_per_week: 3,
    session_duration_min: 60,
    preferred_days: [],
    available_equipment: [],
    sports: [],
    injuries: [],
    avoid_exercises: [],
    priority_muscles: [],
    units: 'kg',
  };
}

// Pré-remplit le formulaire depuis un Profile existant (édition).
export function profileToForm(p: Profile): ProfileForm {
  return {
    name: p.identity.name,
    sex: p.identity.sex,
    birth_year: p.identity.birth_year,
    height_cm: p.identity.height_cm,
    weight_kg: p.identity.weight_kg,
    level: p.experience.level,
    training_months: p.experience.training_months,
    objective: p.objective,
    sessions_per_week: p.availability.sessions_per_week,
    session_duration_min: p.availability.session_duration_min ?? 60,
    preferred_days: [...(p.availability.preferred_days ?? [])],
    available_equipment: [...(p.available_equipment ?? [])],
    sports: (p.sports ?? []).map((s) => ({ ...s })),
    injuries: [...(p.constraints?.injuries ?? [])],
    avoid_exercises: [...(p.constraints?.avoid_exercises ?? [])],
    priority_muscles: [...(p.preferences?.priority_muscles ?? [])],
    units: p.preferences?.units ?? 'kg',
  };
}

// Résumé grossier du matériel (rétro-compat avec le champ `equipment`).
export function deriveCoarseEquipment(items: EquipmentItem[]): Equipment {
  const has = (x: EquipmentItem) => items.includes(x);
  if (has('machine') && has('poulie') && has('barre')) return 'salle_complete';
  if (has('barre') || has('machine') || has('poulie')) return 'home_gym';
  if (has('halteres')) return 'halteres';
  return 'poids_du_corps';
}

// Construit l'objet Profile (contrat v1.0) depuis le formulaire.
export function formToProfile(form: ProfileForm): Profile {
  const identity: Profile['identity'] = { name: form.name.trim() };
  if (form.sex) identity.sex = form.sex;
  if (form.birth_year) identity.birth_year = form.birth_year;
  if (form.height_cm) identity.height_cm = form.height_cm;
  if (form.weight_kg) identity.weight_kg = form.weight_kg;

  const experience: Profile['experience'] = { level: form.level };
  if (form.training_months != null) experience.training_months = form.training_months;

  const availability: Profile['availability'] = { sessions_per_week: form.sessions_per_week };
  if (form.session_duration_min) availability.session_duration_min = form.session_duration_min;
  if (form.preferred_days.length) availability.preferred_days = [...form.preferred_days];

  const preferences: NonNullable<Profile['preferences']> = { units: form.units };
  if (form.priority_muscles.length) preferences.priority_muscles = [...form.priority_muscles];

  const profile: Profile = {
    schema_version: SCHEMA_VERSION,
    type: 'profile',
    identity,
    experience,
    objective: form.objective,
    availability,
    equipment: deriveCoarseEquipment(form.available_equipment),
    preferences,
  };

  if (form.available_equipment.length) profile.available_equipment = [...form.available_equipment];
  if (form.sports.length) profile.sports = form.sports.map((s) => ({ ...s }));

  const constraints: NonNullable<Profile['constraints']> = {};
  if (form.injuries.length) constraints.injuries = [...form.injuries];
  if (form.avoid_exercises.length) constraints.avoid_exercises = [...form.avoid_exercises];
  if (Object.keys(constraints).length) profile.constraints = constraints;

  return profile;
}
