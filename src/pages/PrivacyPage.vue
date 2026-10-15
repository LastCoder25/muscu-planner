<template>
  <q-page class="privacy-page">
    <div class="pv-head">
      <q-btn flat round icon="arrow_back" aria-label="Retour" @click="backOr(router, '/')" />
      <h1 class="font-display">Confidentialité</h1>
    </div>

    <section class="pv-block">
      <h2>Responsable du traitement</h2>
      <p>{{ legal.controller }}</p>
      <p class="dim">Contact : {{ legal.contact }}</p>
    </section>

    <section class="pv-block">
      <h2>Ce que l’app enregistre, et pourquoi</h2>
      <div v-for="d in DATA_ITEMS" :key="d.what" class="pv-item">
        <div class="pv-what">{{ d.what }}</div>
        <div class="pv-why">{{ d.why }}</div>
        <div class="pv-basis">Base légale : {{ d.basis }}</div>
      </div>
    </section>

    <section class="pv-block">
      <h2>Combien de temps</h2>
      <ul>
        <li v-for="l in retention" :key="l">{{ l }}</li>
      </ul>
    </section>

    <section class="pv-block">
      <h2>Prestataires</h2>
      <div v-for="p in PROCESSORS" :key="p.name" class="pv-item">
        <div class="pv-what">{{ p.name }}</div>
        <div class="pv-why">{{ p.role }}</div>
      </div>
    </section>

    <section class="pv-block">
      <h2>Cookies et stockage</h2>
      <p>
        Aucun cookie publicitaire ni outil de mesure d’audience. L’app garde ta session de connexion
        et tes préférences d’affichage dans ton navigateur.
      </p>
    </section>

    <section class="pv-block">
      <h2>Tes droits</h2>
      <p>
        Tu peux consulter, rectifier, exporter et supprimer tes données. Depuis
        <b>Paramètres → Mes données</b> : « Télécharger mes données » (fichier JSON) et « Supprimer
        mon compte » (mot de passe redemandé, tout est effacé). Tes infos de profil se modifient
        dans Réglages.
      </p>
      <p>
        Tu peux aussi écrire au contact ci-dessus, ou adresser une réclamation à la
        <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">CNIL</a>.
      </p>
    </section>

    <p class="dim pv-version">Version {{ PRIVACY_VERSION }}</p>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { backOr } from '@/lib/nav';
import { DATA_ITEMS, PROCESSORS, PRIVACY_VERSION, legalInfo, retentionLines } from '@/lib/privacy';

const router = useRouter();
const legal = legalInfo(import.meta.env);
const retention = retentionLines();
</script>

<style scoped lang="scss">
.privacy-page {
  background: var(--bg);
  color: var(--text);
  padding: 16px 16px 48px;
  max-width: 640px;
  margin: 0 auto;
}
.pv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  h1 {
    font-size: 24px;
    margin: 0;
  }
}
.pv-block {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 12px;
  h2 {
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 8px;
    line-height: 1.3;
  }
  p,
  li {
    font-size: 13.5px;
    line-height: 1.45;
    margin: 0 0 6px;
  }
  ul {
    padding-left: 18px;
    margin: 0;
  }
  a {
    color: var(--accent);
  }
}
.pv-item {
  padding: 6px 0;
  border-top: 1px solid var(--line);
  &:first-of-type {
    border-top: 0;
  }
}
.pv-what {
  font-weight: 600;
  font-size: 13.5px;
}
.pv-why,
.pv-basis {
  font-size: 12.5px;
  color: var(--dim);
}
.dim {
  color: var(--dim);
}
.pv-version {
  font-size: 12px;
  margin-top: 12px;
  text-align: center;
}
</style>
