<template>
  <!-- Légende des paliers du Défi 360 : la COULEUR des cases dit le palier (remplace les
       pastilles Sec./Principal/Max de chaque exercice). Une seule légende par écran. -->
  <div class="ctl" aria-label="Légende des paliers">
    <span class="ctl-i"><span class="ctl-sw z-secondary" />Secondaire (80 %)</span>
    <span class="ctl-i"><span class="ctl-sw z-principal" />Objectif</span>
    <span class="ctl-i"><span class="ctl-sw z-max" />Bonus (jusqu’à 120 %)</span>
  </div>
</template>

<style scoped lang="scss">
.ctl {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--dim);
  margin: 4px 0 10px;
}
.ctl-i {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.ctl-sw {
  width: 14px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
/* Mêmes teintes que les cases faites (cf. .seg.z-* dans les deux écrans du 360). */
.ctl-sw.z-secondary {
  background: color-mix(in srgb, var(--accent) 55%, var(--surface));
}
.ctl-sw.z-principal {
  background: var(--accent);
}
.ctl-sw.z-max {
  background: var(--d1);
}
</style>
