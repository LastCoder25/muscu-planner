import { describe, expect, it } from 'vitest';
import { controlReturnNote } from '@/lib/poiFacts';
import { formatDurationMin } from '@/lib/duration';

describe('controlReturnNote — qui rentre d’un assaut sur un point fixe', () => {
  it('annonce la durée du retour, égale à l’aller', () => {
    expect(controlReturnNote(95, false, 2, 3)).toContain(`Retour en ${formatDurationMin(95)}`);
  });
  it('après une défaite, tout le monde rentre', () => {
    expect(controlReturnNote(60, false, 1, 3)).toContain("tout le monde si l'assaut échoue");
  });
  it('pris sans surplus ni héros : tous restent', () => {
    expect(controlReturnNote(60, false, 3, 3)).toContain('pris, tous y restent');
  });
  it('le héros rentre toujours après une prise', () => {
    expect(controlReturnNote(60, true, 1, 3)).toMatch(/pris, le héros rentre$/);
  });
  it('les champions au-delà des places rentrent', () => {
    expect(controlReturnNote(60, false, 5, 3)).toContain('pris, 2 champions en trop rentrent');
    expect(controlReturnNote(60, false, 4, 3)).toMatch(/pris, 1 champion en trop rentre$/);
  });
  it('héros et surplus ensemble', () => {
    expect(controlReturnNote(60, true, 4, 3)).toContain('le héros et 1 champion en trop rentrent');
  });
});
