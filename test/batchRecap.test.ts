// @vitest-environment happy-dom
//
// 📋 Pendant une série (×5, ×10, ×25 de donjons ou de boss), le rangement des pièces de set et la
// vente des reliques en trop se font toujours — mais n'annoncent plus RIEN lancer par lancer :
// tout va au récap de fin. L'or s'ajoute ; par set et par emplacement, seule la DERNIÈRE pièce
// posée compte, comparée à celle d'avant la série.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp, h, nextTick } from 'vue';
import {
  batchTotalGold,
  newBatch,
  noteFiledPieces,
  noteRelicSale,
  type BatchSummary,
} from '@/lib/batchRun';
import type { Item } from '@/lib/items';
import type { FiledPiece } from '@/lib/setFiling';

const piece = (id: string, slot: string, power: number): Item =>
  ({ id, slot, emoji: '🗡️', name: id, rarity: 'rare', power }) as unknown as Item;
const score = (it: Item) => (it as unknown as { power: number }).power;
const setName = (i: number) => ['Brute', 'Rôdeur', 'Mage'][i] ?? '';
const upgraded = (setIndex: number, item: Item, displaced: Item): FiledPiece => ({
  item,
  setIndex,
  outcome: 'upgraded',
  displaced,
});

describe('noteFiledPieces — une ligne par set et par emplacement, la dernière pièce', () => {
  it('dix renforcements du même emplacement = UNE ligne, comparée à la pièce d’AVANT la série', () => {
    const b = newBatch('Boss', 'boss', 10);
    let held = piece('p0', 'weapon', 10);
    for (let k = 1; k <= 10; k++) {
      const next = piece('p' + k, 'weapon', 10 + k * 3);
      noteFiledPieces(b, [upgraded(0, next, held)], 0, score, setName);
      held = next;
    }
    expect(b.sets).toHaveLength(1);
    expect(b.sets[0]!.item.id).toBe('p10'); // la dernière
    expect(b.sets[0]!.from!.id).toBe('p0'); // l'originale, pas la précédente
    expect(b.sets[0]!.gain).toBe(30); // 40 - 10, pas 40 - 37
    expect(b.sets[0]!.setName).toBe('Brute');
  });
  it('des emplacements différents, ou des sets différents, restent des lignes distinctes', () => {
    const b = newBatch('Boss', 'boss', 5);
    noteFiledPieces(b, [upgraded(0, piece('a2', 'weapon', 20), piece('a1', 'weapon', 10))], 0, score, setName);
    noteFiledPieces(b, [upgraded(0, piece('h2', 'head', 15), piece('h1', 'head', 10))], 0, score, setName);
    noteFiledPieces(b, [upgraded(1, piece('b2', 'weapon', 18), piece('b1', 'weapon', 10))], 0, score, setName);
    expect(b.sets.map((n) => n.setIndex + ':' + n.slot).sort()).toEqual(['0:head', '0:weapon', '1:weapon']);
  });
  it('un emplacement libre : « ajoutée », sans gain ; une amélioration ensuite garde « libre »', () => {
    const b = newBatch('Boss', 'boss', 3);
    noteFiledPieces(b, [{ item: piece('n1', 'ring', 12), setIndex: 2, outcome: 'added' }], 0, score, setName);
    expect(b.sets[0]!.gain).toBeNull();
    expect(b.sets[0]!.from).toBeNull();
    noteFiledPieces(b, [upgraded(2, piece('n2', 'ring', 30), piece('n1', 'ring', 12))], 0, score, setName);
    expect(b.sets).toHaveLength(1);
    expect(b.sets[0]!.item.id).toBe('n2');
    expect(b.sets[0]!.gain).toBeNull(); // l'emplacement était libre AVANT la série
  });
  it('un doublon ne fait pas de ligne mais son or s’additionne', () => {
    const b = newBatch('Boss', 'boss', 3);
    noteFiledPieces(b, [{ item: piece('d', 'weapon', 1), setIndex: 0, outcome: 'spare' }], 40, score, setName);
    noteFiledPieces(b, [], 25, score, setName);
    expect(b.sets).toHaveLength(0);
    expect(b.spareGold).toBe(65);
  });
});

describe('l’or d’une série est une SOMME', () => {
  it('lancers + reliques vendues + doublons vendus', () => {
    const b = newBatch('Donjon', 'dungeon', 25);
    b.gold = 1000;
    noteRelicSale(b, 1, 70);
    noteRelicSale(b, 2, 130);
    noteFiledPieces(b, [], 55, score, setName);
    expect(b.relics).toBe(3);
    expect(b.relicGold).toBe(200);
    expect(batchTotalGold(b)).toBe(1255);
  });
  it('une série neuve n’a rien à raconter', () => {
    const b = newBatch('x', 'boss', 5);
    expect(b.sets).toEqual([]);
    expect(batchTotalGold(b)).toBe(0);
  });
});

describe('le récap affiche la somme, les ventes et les sets renforcés', () => {
  async function render(b: BatchSummary) {
    const { default: BatchRunReport } = await import('@/components/BatchRunReport.vue');
    const app = createApp({ render: () => h(BatchRunReport, { modelValue: true, summary: b }) });
    app.config.warnHandler = () => {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    return { host, unmount: () => app.unmount() };
  }
  it('or total, reliques, ventes et une ligne par set/emplacement', async () => {
    const b = newBatch('Boss du palier', 'boss', 25);
    b.runs = 25;
    b.cleared = 25;
    b.gold = 1000;
    noteRelicSale(b, 2, 200);
    noteFiledPieces(b, [upgraded(0, piece('Épée finale', 'weapon', 40), piece('Épée', 'weapon', 10))], 55, score, setName);
    const m = await render(b);
    const q = (t: string) => m.host.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    expect(q('br-gold')!.textContent).toContain('+1255');
    expect(q('br-relics')!.textContent).toContain('2 reliques vendues');
    expect(q('br-sales')!.textContent).toContain('255');
    expect(q('br-sets')!.textContent).toContain('Épée finale');
    expect(q('br-sets')!.textContent).toContain('Brute');
    expect(q('br-sets')!.textContent).toContain('+30');
    m.unmount();
  });
  it('rien à dire : ni ligne de ventes, ni section de sets', async () => {
    const b = newBatch('Donjon', 'dungeon', 5);
    b.runs = 5;
    b.cleared = 5;
    b.gold = 10;
    const m = await render(b);
    expect(m.host.querySelector('[data-test="br-sets"]')).toBeNull();
    expect(m.host.querySelector('[data-test="br-sales"]')).toBeNull();
    expect(m.host.querySelector('[data-test="br-relics"]')).toBeNull();
    m.unmount();
  });
});

describe('câblage : aucune annonce par lancer pendant une série', () => {
  const src = () => readFileSync('src/pages/AventurePage.vue', 'utf8');
  it('le rangement des pièces verse au récap pendant une série', () => {
    expect(src()).toMatch(/function announceFiled[\s\S]{0,400}if \(batchNotes\) \{\s*noteFiledPieces\(batchNotes/);
  });
  it('la vente des reliques verse au récap pendant une série', () => {
    expect(src()).toContain('if (r.relics && batchNotes) noteRelicSale(batchNotes, r.relics, r.gold);');
  });
  it('la série attend la fin du rangement et de la vente AVANT de fermer le récap', () => {
    const s = src();
    expect(s).toMatch(/await settleAutoOps\(\);\s*batchNotes = null;/);
    expect(s).toContain('batchNotes = b;');
  });
});
