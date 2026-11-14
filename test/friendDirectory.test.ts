import { describe, it, expect } from 'vitest';
import { buildDirectory, type DirectoryUser } from '@/lib/friendDirectory';

const u = (id: string, name: string, pseudo: string | null, at: string): DirectoryUser => ({
  user_id: id,
  name,
  pseudo,
  has_character: pseudo !== null,
  created_at: at,
});

describe('annuaire admin des amis', () => {
  it('affiche le pseudo de jeu, sinon le prénom, sinon « Joueur »', () => {
    const rows = buildDirectory(
      [
        u('a', 'Alice', 'Zaza', '2026-10-01'),
        u('b', 'Ombeline', null, '2026-10-02'),
        u('c', '  ', null, '2026-10-03'),
      ],
      [],
    );
    const label = (id: string) => rows.find((r) => r.userId === id)?.label;
    expect(label('a')).toBe('Zaza');
    expect(label('b')).toBe('Ombeline');
    expect(label('c')).toBe('Joueur');
  });

  it('dit où en est la relation avec chacun', () => {
    const rows = buildDirectory(
      [
        u('a', 'A', null, '2026-10-01'),
        u('b', 'B', null, '2026-10-02'),
        u('c', 'C', null, '2026-10-03'),
        u('d', 'D', null, '2026-10-04'),
        u('e', 'E', null, '2026-10-05'),
      ],
      [
        { userId: 'a', status: 'accepted', incoming: false },
        { userId: 'b', status: 'pending', incoming: false },
        { userId: 'c', status: 'pending', incoming: true },
        { userId: 'd', status: 'declined', incoming: false },
      ],
    );
    const st = (id: string) => rows.find((r) => r.userId === id)?.state;
    expect(st('a')).toBe('friend');
    expect(st('b')).toBe('sent');
    expect(st('c')).toBe('received');
    expect(st('d')).toBe('sent'); // une ligne existe : on ne peut pas redemander
    expect(st('e')).toBe('none');
  });

  it('met les ajoutables en premier, du plus récent au plus ancien', () => {
    const rows = buildDirectory(
      [
        u('old', 'Old', null, '2026-09-01'),
        u('friend', 'F', null, '2026-11-01'),
        u('new', 'New', null, '2026-10-20'),
      ],
      [{ userId: 'friend', status: 'accepted', incoming: false }],
    );
    expect(rows.map((r) => r.userId)).toEqual(['new', 'old', 'friend']);
  });

  it('retient l’absence de perso', () => {
    const [row] = buildDirectory([u('a', 'A', null, '2026-10-01')], []);
    expect(row?.hasCharacter).toBe(false);
  });
});
