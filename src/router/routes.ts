import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // Écrans plein écran (sans layout app)
  { path: '/login', component: () => import('@/pages/LoginPage.vue') },
  { path: '/onboarding', component: () => import('@/pages/OnboardingPage.vue') },

  // App authentifiée
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/HomePage.vue') }],
  },

  // 404 (laisser en dernier)
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
