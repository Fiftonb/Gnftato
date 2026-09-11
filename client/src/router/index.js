import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Servers from '../views/Servers.vue';
import Rules from '../views/Rules.vue';
import Login from '../views/Login.vue';
import Register from '../views/Register.vue';
import Profile from '../views/Profile.vue';
import store from '../store';


const routes = [
  { path: '/users/new', name: 'create-user', component: Register, meta: { requiresAuth: true, requiresAdmin: true } },
  {
    path: '/',
    name: 'home',
    component: Home,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/servers',
    name: 'servers',
    component: Servers,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/rules/:serverId',
    name: 'rules',
    component: Rules,
    props: true,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: Profile,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: Login
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

// Validate the session before rendering protected pages, including direct links.
router.beforeEach(async to => {
  if (!to.meta.requiresAuth) return true;
  if (!store.getters.isAuthenticated) return '/login';
  if (!store.getters.currentUser) {
    try {
      await store.dispatch('getCurrentUser');
    } catch {
      await store.dispatch('logout');
      return '/login';
    }
  }
  if (to.meta.requiresAdmin && !store.getters.currentUser?.isAdmin) return '/profile';
  return true;
});

export default router;
