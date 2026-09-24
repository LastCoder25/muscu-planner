// @vitest-environment happy-dom
// 💀 La mort du boss entre amis se joue APRÈS les frappes, et se voit (v0.1140).
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import FriendBossStage from '@/components/FriendBossStage.vue';

describe('💀 FriendBossStage — animation de mort', () => {
  it('die() fait s’effondrer le boss, affiche « VAINCU », puis le laisse à terre', async () => {
    const stage = ref<{ die: () => Promise<void> } | null>(null);
    const el = document.createElement('div');
    const app = createApp({
      render: () =>
        h(FriendBossStage, {
          ref: stage,
          bossName: 'Pompes',
          bossEmoji: '🐉',
          familyEmoji: '💪',
          familyName: 'Poussée',
          hpTotal: 1000,
          hpLeft: 0,
          allies: [],
        }),
    });
    app.use(createPinia());
    app.mount(el);
    await nextTick();
    const done = stage.value!.die();
    await new Promise((r) => setTimeout(r, 700));
    await nextTick();
    expect(el.querySelector('.fbs-boss.dying')).not.toBeNull();
    expect(el.textContent).toContain('VAINCU');
    await done;
    await nextTick();
    expect(el.querySelector('.fbs-boss.dying')).toBeNull();
    expect(el.querySelector('.fbs-boss.dead')).not.toBeNull();
    app.unmount();
  });
});
