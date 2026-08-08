// Boot auth — initialise la session avant le premier rendu, puis installe
// le garde de navigation : non connecté → /login ; connecté sans profil →
// /onboarding ; connecté avec profil → app.
import { defineBoot } from '#q-app';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { supabase } from '@/lib/supabase';

export default defineBoot(async ({ router, store }) => {
  const auth = useAuthStore(store);
  const profile = useProfileStore(store);

  // Lien de réinitialisation cliqué : Supabase ouvre une session de recovery et
  // émet PASSWORD_RECOVERY → on route vers l'écran de nouveau mot de passe.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') void router.push('/reset-password');
  });

  await auth.init();

  router.beforeEach(async (to) => {
    // Écran de nouveau mot de passe : toujours accessible (session de recovery).
    if (to.path === '/reset-password') return true;

    // Non connecté : seul /login est accessible.
    if (!auth.user) {
      profile.reset();
      return to.path === '/login' ? true : { path: '/login' };
    }

    // Connecté : pas besoin de revoir le login.
    if (to.path === '/login') return { path: '/' };

    // Pages réservées aux admins (la RLS Postgres fait aussi autorité).
    if ((to.path === '/backlog' || to.path === '/formulas') && !auth.isAdmin) return { path: '/' };

    // S'assure d'avoir tenté de charger le profil au moins une fois.
    if (!profile.loaded) {
      try {
        await profile.fetch(auth.user.id);
      } catch {
        // erreur réseau : on laisse passer, l'écran gérera l'état vide
      }
    }

    const hasProfile = !!profile.profile;
    if (!hasProfile && to.path !== '/onboarding') return { path: '/onboarding' };
    if (hasProfile && to.path === '/onboarding') return { path: '/' };
    return true;
  });
});
