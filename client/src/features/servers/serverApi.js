import axios from 'axios';

const API_URL = '/api/servers';

export const serverApi = {
  list: () => axios.get(API_URL),
  get: id => axios.get(`${API_URL}/${id}`),
  create: data => axios.post(API_URL, data),
  update: (id, data) => axios.put(`${API_URL}/${id}`, data),
  remove: id => axios.delete(`${API_URL}/${id}`),
  connect: id => axios.post(`${API_URL}/${id}/connect`),
  disconnect: id => axios.post(`${API_URL}/${id}/disconnect`),
  status: id => axios.get(`${API_URL}/${id}/status`),
  testConnection: data => axios.post(`${API_URL}/test-connection`, data),
  execute: (id, command) => axios.post(`${API_URL}/${id}/execute`, { command }),
  deploy: (id, data) => axios.post(`${API_URL}/${id}/deploy`, data),
  logs: id => axios.get(`${API_URL}/${id}/logs`),
  checkScript: id => axios.get(`${API_URL}/${id}/checkScript`)
};

