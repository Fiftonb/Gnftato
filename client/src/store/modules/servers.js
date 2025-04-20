import axios from 'axios';

const API_URL = '/api/servers';

const state = {
  servers: [],
  loading: false,
  error: null
};

const getters = {
  getAllServers: state => state.servers,
  getServerById: state => id => state.servers.find(server => server._id === id),
  getLoading: state => state.loading,
  getError: state => state.error
};

const actions = {
  async getAllServers({ commit }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(API_URL);
      commit('setServers', response.data.data);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async getServer({ commit }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async createServer({ commit, dispatch }, serverData) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(API_URL, serverData);
      await dispatch('getAllServers');
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async updateServer({ commit, dispatch }, { id, data }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.put(`${API_URL}/${id}`, data);
      await dispatch('getAllServers');
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async deleteServer({ commit, dispatch }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.delete(`${API_URL}/${id}`);
      await dispatch('getAllServers');
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async connectServer({ commit, dispatch }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${id}/connect`);
      await dispatch('getAllServers');
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async disconnectServer({ commit, dispatch }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${id}/disconnect`);
      await dispatch('getAllServers');
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async checkStatus({ commit }, id) {
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${id}/status`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    }
  },
  
  async executeCommand({ commit }, { serverId, command }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/execute`, { command });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  async deployIptato({ commit, dispatch }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${id}/deploy`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  }
};

const mutations = {
  setServers(state, servers) {
    state.servers = servers;
  },
  setLoading(state, loading) {
    state.loading = loading;
  },
  setError(state, error) {
    state.error = error;
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
}; 