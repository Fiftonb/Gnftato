import Vue from 'vue';
import VueRouter from 'vue-router';
import Home from '../views/Home.vue';
import Servers from '../views/Servers.vue';
import Rules from '../views/Rules.vue';
import Login from '../views/Login.vue';
import Profile from '../views/Profile.vue';
import store from '../store';

Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
    meta: { requiresAuth: true }
  },
  {
    path: '/servers',
    name: 'servers',
    component: Servers,
    meta: { requiresAuth: true }
  },
  {
    path: '/rules/:serverId',
    name: 'rules',
    component: Rules,
    props: true,
    meta: { requiresAuth: true }
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

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
});

// 全局前置守卫
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const isAuthenticated = store.getters.isAuthenticated;
  
  if (requiresAuth && !isAuthenticated) {
    next('/login');
  } else {
    next();
  }
});

export default router; 