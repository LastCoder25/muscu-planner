<template>
  <!-- ⚠️ Une erreur a cassé l'écran : on la DIT au lieu de laisser du noir, et on propose de
       l'envoyer (signalé : « Aventure, écran noir » sur téléphone, introuvable au banc). -->
  <div v-if="crash.current.value" class="crash" role="alert">
    <div class="crash-head">
      <!-- Seule une erreur de l'AFFICHAGE casse l'écran ; une erreur d'arrière-plan
           (sauvegarde, requête) le laisse souvent intact : ne pas crier au plantage. -->
      <b>{{
        crash.current.value.screen ? '⚠️ Cet écran a planté' : '⚠️ Une erreur est survenue'
      }}</b>
      <button type="button" class="crash-x" aria-label="Fermer" @click="crash.dismiss">✕</button>
    </div>
    <p v-if="!crash.current.value.screen" class="crash-hint">
      L’écran peut continuer à marcher ; ferme ce message, et envoie-le s’il revient.
    </p>
    <p class="crash-msg">{{ crash.current.value.message }}</p>
    <details class="crash-more">
      <summary>Détail</summary>
      <pre>{{ crash.current.value.detail }}</pre>
    </details>
    <div class="crash-actions">
      <button type="button" class="crash-b main" :disabled="sending || sent" @click="send">
        {{ sent ? '✅ Envoyé' : sending ? 'Envoi…' : '📤 Envoyer au développeur' }}
      </button>
      <button type="button" class="crash-b" @click="copy">{{ copied ? '✅' : '📋 Copier' }}</button>
      <button type="button" class="crash-b" @click="reload">🔄 Recharger</button>
    </div>
    <p v-if="failed" class="crash-fail">
      Envoi impossible : {{ failed }}. Copie le texte et colle-le-moi.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCrash } from '@/composables/useCrash';
import { crashReportText } from '@/lib/crashReport';
import { supabase } from '@/lib/supabase';

const crash = useCrash();
const route = useRoute();
const sending = ref(false);
const sent = ref(false);
const copied = ref(false);
const failed = ref('');
watch(crash.current, () => {
  sent.value = false;
  copied.value = false;
  failed.value = '';
});

const text = () =>
  crash.current.value ? crashReportText(crash.current.value, route.fullPath, __APP_VERSION__) : '';

/** Dépose un signalement « bug » (même table que l'ancien formulaire) : son auteur, l'écran,
 *  la version et l'erreur, rien d'autre. */
async function send() {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) {
    failed.value = 'pas connecté';
    return;
  }
  sending.value = true;
  const res = await supabase.from('feedback').insert({
    user_id: uid,
    kind: 'bug',
    message: text(),
    page: route.fullPath,
    app_version: __APP_VERSION__,
  });
  sending.value = false;
  if (res.error) failed.value = res.error.message;
  else sent.value = true;
}
async function copy() {
  try {
    await navigator.clipboard.writeText(text());
    copied.value = true;
  } catch {
    failed.value = 'copie refusée par le navigateur';
  }
}
function reload() {
  window.location.reload();
}
</script>

<style scoped>
.crash {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: calc(28px + env(safe-area-inset-bottom));
  z-index: 9600;
  max-width: 560px;
  margin: 0 auto;
  padding: 12px;
  border: 1.5px solid #ff6a45;
  border-radius: 12px;
  background: var(--surface, #211c16);
  color: var(--text, #f3eee6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.crash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.crash-x {
  min-width: 44px;
  min-height: 44px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 18px;
}
.crash-hint {
  margin: 4px 0 0;
  font-size: 12px;
  opacity: 0.8;
}
.crash-msg {
  margin: 4px 0 6px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.crash-more pre {
  max-height: 140px;
  overflow: auto;
  font-size: 10.5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.crash-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.crash-b {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line, #3a332a);
  background: transparent;
  color: inherit;
  font-size: 13px;
}
.crash-b.main {
  border-color: var(--accent, #ffd23f);
  color: var(--accent, #ffd23f);
  flex: 1 1 100%;
}
.crash-fail {
  margin: 6px 0 0;
  font-size: 12px;
  color: #ff6a45;
}
</style>
