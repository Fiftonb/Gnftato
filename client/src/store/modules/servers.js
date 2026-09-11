import { serverApi } from '@/features/servers/serverApi';
import { errorMessage, statusPatchFromResponse } from '@/features/servers/serverStatus';

const state = {
  servers: [],
  pendingRequests: 0,
  loading: false,
  error: null
};

const getters = {
  getAllServers: currentState => currentState.servers,
  getServerById: currentState => id => currentState.servers.find(server => server._id === id),
  getLoading: currentState => currentState.loading,
  getError: currentState => currentState.error
};

async function withRequestState(commit, request) {
  commit('requestStarted');
  commit('setError', null);
  try {
    return await request();
  } catch (error) {
    commit('setError', errorMessage(error));
    throw error;
  } finally {
    commit('requestFinished');
  }
}

function applyStatusResponse(commit, id, responseData, fallback) {
  commit('patchServer', {
    id,
    patch: statusPatchFromResponse(responseData, fallback)
  });
}

const actions = {
  async getAllServers({ commit }) {
    return withRequestState(commit, async () => {
      const response = await serverApi.list();
      commit('setServers', Array.isArray(response.data?.data) ? response.data.data : []);
      return response.data;
    });
  },

  async getServer({ commit }, id) {
    return withRequestState(commit, async () => {
      const response = await serverApi.get(id);
      if (response.data?.data) commit('upsertServer', response.data.data);
      return response.data;
    });
  },

  async createServer({ commit, dispatch }, serverData) {
    return withRequestState(commit, async () => {
      const response = await serverApi.create(serverData);
      await dispatch('getAllServers');
      return response.data;
    });
  },

  async updateServer({ commit, dispatch }, { id, data }) {
    return withRequestState(commit, async () => {
      const response = await serverApi.update(id, data);
      await dispatch('getAllServers');
      return response.data;
    });
  },

  async deleteServer({ commit, dispatch }, id) {
    return withRequestState(commit, async () => {
      const response = await serverApi.remove(id);
      commit('removeServer', id);
      await dispatch('getAllServers');
      return response.data;
    });
  },

  async connectServer({ commit }, id) {
    return withRequestState(commit, async () => {
      commit('patchServer', { id, patch: { status: 'connecting' } });
      try {
        const response = await serverApi.connect(id);
        applyStatusResponse(commit, id, response.data, 'online');
        return response.data;
      } catch (error) {
        commit('patchServer', { id, patch: { status: 'error', lastChecked: new Date().toISOString() } });
        throw error;
      }
    });
  },

  async disconnectServer({ commit }, id) {
    return withRequestState(commit, async () => {
      commit('patchServer', { id, patch: { status: 'disconnecting' } });
      try {
        const response = await serverApi.disconnect(id);
        applyStatusResponse(commit, id, response.data, 'offline');
        return response.data;
      } catch (error) {
        commit('patchServer', { id, patch: { status: 'error', lastChecked: new Date().toISOString() } });
        throw error;
      }
    });
  },

  async checkStatus({ commit, getters: moduleGetters }, id) {
    commit('setError', null);
    try {
      const response = await serverApi.status(id);
      const fallback = moduleGetters.getServerById(id)?.status || 'offline';
      applyStatusResponse(commit, id, response.data, fallback);
      return response.data;
    } catch (error) {
      commit('setError', errorMessage(error));
      throw error;
    }
  },

  async testConnection({ commit }, serverData) {
    return withRequestState(commit, async () => (await serverApi.testConnection(serverData)).data);
  },

  async executeCommand({ commit }, { serverId, command }) {
    return withRequestState(commit, async () => (await serverApi.execute(serverId, command)).data);
  },

  async deployIptato({ commit }, id) {
    return withRequestState(commit, async () => (await serverApi.deploy(id)).data);
  },

  async getServerLogs({ commit }, id) {
    commit('setError', null);
    try {
      return (await serverApi.logs(id)).data;
    } catch (error) {
      commit('setError', errorMessage(error));
      throw error;
    }
  },

  async checkScriptExists({ commit }, id) {
    commit('setError', null);
    try {
      return (await serverApi.checkScript(id)).data;
    } catch (error) {
      commit('setError', errorMessage(error));
      throw error;
    }
  },

  async deployIptatoWithWebSocket({ commit }, id) {
    return withRequestState(commit, async () => (await serverApi.deploy(id, { useWebSocket: true })).data);
  }
};

const mutations = {
  setServers(currentState, servers) {
    currentState.servers = servers;
  },
  upsertServer(currentState, server) {
    const index = currentState.servers.findIndex(item => item._id === server._id);
    if (index === -1) currentState.servers.push(server);
    else currentState.servers.splice(index, 1, { ...currentState.servers[index], ...server });
  },
  removeServer(currentState, id) {
    currentState.servers = currentState.servers.filter(server => server._id !== id);
  },
  patchServer(currentState, { id, patch }) {
    const server = currentState.servers.find(item => item._id === id);
    if (server) Object.assign(server, patch);
  },
  updateServerStatus(currentState, { id, status, lastCheck, lastChecked, backendConnected, backendConnectionValid }) {
    mutations.patchServer(currentState, {
      id,
      patch: {
        status,
        lastChecked: lastChecked || lastCheck,
        backendConnected,
        backendConnectionValid
      }
    });
  },
  requestStarted(currentState) {
    currentState.pendingRequests += 1;
    currentState.loading = true;
  },
  requestFinished(currentState) {
    currentState.pendingRequests = Math.max(0, currentState.pendingRequests - 1);
    currentState.loading = currentState.pendingRequests > 0;
  },
  setLoading(currentState, loading) {
    currentState.loading = loading;
  },
  setError(currentState, error) {
    currentState.error = error;
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
