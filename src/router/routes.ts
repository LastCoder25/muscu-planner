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
      { path: 'ready', component: () => import('@/pages/ReadinessPage.vue') },
    ],
  },
  {
    path: '/bilan/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/BilanPage.vue') }],
  },
  {
    path: '/free',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/FreeSessionPage.vue') }],
  },
  {
    path: '/exercise/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ExercisePage.vue') }],
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
