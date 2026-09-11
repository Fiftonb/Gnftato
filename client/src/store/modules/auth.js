import axios from 'axios';

// 初始状态
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  loading: false
};

// Getters
const getters = {
  isAuthenticated: state => !!state.token,
  currentUser: state => state.user,
  isLoading: state => state.loading
};

// Actions
const actions = {
  // 登录
  async login({ commit }, credentials) {
    commit('SET_LOADING', true);
    try {
      const response = await axios.post('/api/auth/login', credentials);
      const { token, user } = response.data.data;
      
      // 存储令牌到本地存储和状态
      localStorage.setItem('token', token);
      commit('SET_TOKEN', token);
      commit('SET_USER', user);
      
      // 设置全局认证头
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return response;
    } catch (error) {
      commit('SET_TOKEN', null);
      commit('SET_USER', null);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common.Authorization;
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },
  
  // Administrator-only account creation must not replace the current session.
  async register({ commit }, credentials) {
    commit('SET_LOADING', true);
    try {
      return await axios.post('/api/auth/register', credentials);
    } finally {
      commit('SET_LOADING', false);
    }
  },

  setSession({ commit }, { token, user }) {
    localStorage.setItem('token', token);
    commit('SET_TOKEN', token);
    commit('SET_USER', user);
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  },

  // 获取当前用户信息
  async getCurrentUser({ commit, state }) {
    if (!state.token) return;
    
    commit('SET_LOADING', true);
    try {
      const response = await axios.get('/api/auth/me');
      commit('SET_USER', response.data.data.user);
      return response;
    } catch (error) {
      // 如果令牌无效或过期，清除认证状态
      if (error.response && error.response.status === 401) {
        commit('SET_TOKEN', null);
        commit('SET_USER', null);
        localStorage.removeItem('token');
      }
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },
  
  // 登出
  logout({ commit }) {
    commit('SET_TOKEN', null);
    commit('SET_USER', null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }
};

// Mutations
const mutations = {
  SET_TOKEN(state, token) {
    state.token = token;
  },
  SET_USER(state, user) {
    state.user = user;
  },
  SET_LOADING(state, isLoading) {
    state.loading = isLoading;
  }
};

export default {
  state,
  getters,
  actions,
  mutations
}; 