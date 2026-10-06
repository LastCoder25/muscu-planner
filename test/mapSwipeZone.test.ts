// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inMapSwipeZone } from '@/lib/mapSlide';

// 👆 Demandé : « que ça ne bloque que quand je suis sur la carte ; sur les fenêtres qui
// s'ouvrent depuis la carte (l'organisation des expéditions) je peux glisser la page ».
document.body.innerHTML = `
  <div id="page">
    <div id="top">Ressources</div>
    <div id="map"><svg id="svg"></svg></div>
    <div id="tabs"><button id="tab">Expéditions</button></div>
    <div id="trips">Voyages</div>
    <div id="sheet"><button id="send">Envoyer</button></div>
  </div>
  <div id="dialog"><p id="dlg">Fenêtre</p></div>`;
const $ = (id: string) => document.getElementById(id)!;
const zone = (id: string) => inMapSwipeZone($(id), $('page'), $('tabs'));

describe('👆 où le glissé au doigt est bloqué', () => {
  it('sur la carte, au-dessus, et sur la rangée d’onglets', () => {
    expect(zone('svg')).toBe(true);
    expect(zone('top')).toBe(true);
    expect(zone('tab')).toBe(true);
  });
  it('pas dans ce qui s’ouvre sous les onglets (fiche du lieu, voyages)', () => {
    expect(zone('send')).toBe(false);
    expect(zone('trips')).toBe(false);
  });
  it('pas dans une fenêtre hors de la page (dialogue)', () => {
    expect(zone('dlg')).toBe(false);
  });
  it('pas quand la carte est cachée (vue d’une autre île)', () => {
    $('tabs').style.display = 'none';
    expect(zone('svg')).toBe(false);
    $('tabs').style.display = '';
  });
});
