import Vue from 'vue';
import Vuex from 'vuex';
import servers from './modules/servers';
import rules from './modules/rules';
import auth from './modules/auth';

Vue.use(Vuex);

export default new Vuex.Store({
  modules: {
    servers,
    rules,
    auth
  }
}); 