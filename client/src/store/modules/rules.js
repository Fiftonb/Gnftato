import axios from 'axios';

const API_URL = '/api/rules';

const state = {
  loading: false,
  error: null
};

const getters = {
  getLoading: state => state.loading,
  getError: state => state.error
};

const actions = {
  // 获取服务器规则缓存
  async getServerCache({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/cache`);
      return response.data;
    } catch (error) {
      // 如果是404错误，说明缓存不存在，这不是错误
      if (error.response && error.response.status === 404) {
        return { success: false, error: '缓存不存在' };
      }
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 获取缓存最后更新时间
  async getCacheLastUpdate({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/cache/last-update`);
      return response.data;
    } catch (error) {
      // 如果是404错误，说明缓存不存在，这不是错误
      if (error.response && error.response.status === 404) {
        return { success: false, error: '缓存不存在' };
      }
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 清除服务器规则缓存
  async clearServerCache({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.delete(`${API_URL}/${serverId}/cache`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 更新服务器缓存项
  async updateCacheItem({ commit }, { serverId, key, value }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.put(`${API_URL}/${serverId}/cache/${key}`, { value });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 获取封禁列表
  async getBlockList({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/blocklist`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 封禁SPAM
  async blockSPAMAction({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/block/spam`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },

  
  // 封禁自定义端口
  async blockCustomPortsAction({ commit }, { serverId, ports }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/block/ports`, { ports });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  
  // 解封SPAM
  async unblockSPAMAction({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/unblock/spam`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 解封自定义端口
  async unblockCustomPortsAction({ commit }, { serverId, ports }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/unblock/ports`, { ports });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 获取当前放行的入网端口
  async getInboundPorts({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/inbound/ports`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 获取当前放行的入网IP
  async getInboundIPs({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/inbound/ips`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 放行入网端口
  async allowInboundPortsAction({ commit }, { serverId, ports }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/inbound/allow/ports`, { ports });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 取消放行入网端口
  async disallowInboundPortsAction({ commit }, { serverId, ports }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/inbound/disallow/ports`, { ports });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 放行入网IP
  async allowInboundIPsAction({ commit }, { serverId, ips }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/inbound/allow/ips`, { ips });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 取消放行入网IP
  async disallowInboundIPsAction({ commit }, { serverId, ips }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/inbound/disallow/ips`, { ips });
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 获取SSH端口
  async getSSHPort({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/ssh-port`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 清空所有规则
  async clearAllRulesAction({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/clear-all`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 配置DDoS防御规则
  async setupDdosProtection({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/ddos/protection`);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 配置自定义端口DDoS防御
  async setupCustomPortProtection({ commit }, { serverId, data }) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.post(`${API_URL}/${serverId}/ddos/custom-port`, data);
      return response.data;
    } catch (error) {
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 管理IP黑白名单
  async manageIpLists({ commit }, { serverId, data }) {
    commit('setLoading', true);
    commit('setError', null);
    
    console.log(`[Store调试] 开始manageIpLists请求: serverId=${serverId}`, data);
    
    try {
      const endpoint = `${API_URL}/${serverId}/ddos/ip-lists`;
      console.log(`[Store调试] 请求端点: ${endpoint}`);
      
      const response = await axios.post(endpoint, data);
      console.log(`[Store调试] 收到响应:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`[Store调试] 请求错误:`, error);
      commit('setError', error.response ? error.response.data.message : error.message);
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },
  
  // 查看当前防御状态
  async getDefenseStatus({ commit }, serverId) {
    commit('setLoading', true);
    commit('setError', null);
    
    try {
      const response = await axios.get(`${API_URL}/${serverId}/ddos/status`);
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