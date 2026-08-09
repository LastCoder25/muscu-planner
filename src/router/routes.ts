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
    path: '/reset-password',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ResetPasswordPage.vue') }],
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
    path: '/import',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ImportPage.vue') }],
  },
  {
    path: '/exercise/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ExercisePage.vue') }],
  },
  {
    path: '/challenges/new',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ChallengeNewPage.vue') }],
  },
  {
    path: '/combo/new',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ComboNewPage.vue') }],
  },
  {
    path: '/combo/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/ComboDetailPage.vue') },
      { path: 'session', component: () => import('@/pages/ComboSessionPage.vue') },
    ],
  },
  {
    path: '/court/new',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/CourtNewPage.vue') }],
  },
  {
    path: '/court/bilan/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/CourtBilanPage.vue') }],
  },
  {
    path: '/court/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/CourtLivePage.vue') },
      { path: 'detail', component: () => import('@/pages/CourtSessionDetailPage.vue') },
    ],
  },
  {
    path: '/challenges/:id',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/ChallengeDetailPage.vue') }],
  },

  // App authentifiée
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/HomePage.vue') },
      { path: 'profile', component: () => import('@/pages/ProfilePage.vue') },
      { path: 'settings', component: () => import('@/pages/SettingsPage.vue') },
      { path: 'agenda', component: () => import('@/pages/AgendaPage.vue') },
      { path: 'muscu', component: () => import('@/pages/MuscuPage.vue') },
      { path: 'aventure', component: () => import('@/pages/AventurePage.vue') },
      { path: 'leaderboard', component: () => import('@/pages/LeaderboardPage.vue') },
      { path: 'program', component: () => import('@/pages/ProgramPage.vue') },
      { path: 'history', component: () => import('@/pages/HistoryPage.vue') },
      { path: 'stats', component: () => import('@/pages/StatsPage.vue') },
      { path: 'trophies', component: () => import('@/pages/TrophiesPage.vue') },
      { path: 'challenges', component: () => import('@/pages/ChallengesPage.vue') },
      { path: 'tennis', component: () => import('@/pages/TennisPage.vue') },
      { path: 'cardio', component: () => import('@/pages/CardioPage.vue') },
      { path: 'body', component: () => import('@/pages/BodyPage.vue') },
      { path: 'backlog', component: () => import('@/pages/BacklogPage.vue') },
      { path: 'formulas', component: () => import('@/pages/FormulasPage.vue') },
    ],
  },

  // 404 (laisser en dernier)
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
