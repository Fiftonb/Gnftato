import { createStore } from 'vuex';
import servers from './modules/servers';
import rules from './modules/rules';
import auth from './modules/auth';


export default createStore({
  modules: {
    servers,
    rules,
    auth
  }
}); 