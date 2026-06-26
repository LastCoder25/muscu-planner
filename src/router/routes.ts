import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // Écrans plein écran : layout minimal (QLayout requis par QPage)
  {
    path: '/login',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/LoginPage.vue') }],
  },
  {
    path: '/onboarding',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/OnboardingPage.vue') }],
  },
  {
    path: '/session/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/SessionLivePage.vue') },
      { path: 'detail', component: () => import('@/pages/SessionDetailPage.vue') },
    ],
  },

  // App authentifiée
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/HomePage.vue') },
      { path: 'profile', component: () => import('@/pages/ProfilePage.vue') },
      { path: 'settings', component: () => import('@/pages/SettingsPage.vue') },
    ],
  },

  // 404 (laisser en dernier)
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
