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
      if (response.data && response.data.serverStatus) {
        commit('updateServerStatus', {
          id,
          status: response.data.serverStatus,
          lastCheck: new Date().toISOString()
        });
      } else {
        await dispatch('getAllServers');
      }
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
      if (response.data && response.data.serverStatus) {
        commit('updateServerStatus', {
          id,
          status: response.data.serverStatus,
          lastCheck: new Date().toISOString()
        });
      } else {
        await dispatch('getAllServers');
      }
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
      
      // 处理连接套接字正常但状态未知的情况
      if (response.data && response.data.data) {
        // 检查日志信息
        if (response.data.logs && 
            (response.data.logs.includes('连接套接字正常') || 
             response.data.logs.includes('SSH连接已就绪') || 
             response.data.logs.includes('SSH连接建立成功'))) {
          // 覆盖状态为online
          response.data.data.status = 'online';
          response.data.data.backendConnected = true;
        }
        
        // 更新服务器状态
        if (response.data.data.status) {
          commit('updateServerStatus', {
            id,
            status: response.data.data.status,
            lastCheck: new Date().toISOString(),
            backendConnected: response.data.data.backendConnected || false
          });
        }
      }
      
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
  },
  
  async getServerLogs({ commit }, id) {
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${id}/logs`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    }
  },
  
  /**
   * 检查服务器上是否已部署Nftato脚本
   */
  async checkScriptExists({ commit }, id) {
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${id}/checkScript`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    }
  },

  /**
   * 使用WebSocket部署Nftato脚本
   */
  async deployIptatoWithWebSocket({ commit }, id) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      // 调用部署API，指示使用WebSocket
      const response = await axios.post(`${API_URL}/${id}/deploy`, { useWebSocket: true });
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
  },
  updateServerStatus(state, { id, status, lastCheck, backendConnected }) {
    const server = state.servers.find(s => s._id === id);
    if (server) {
      server.status = status;
      server.lastCheck = lastCheck;
      server.backendConnected = backendConnected;
    }
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
}; 