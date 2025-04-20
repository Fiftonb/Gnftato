import Vue from 'vue';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import App from './App.vue';
import router from './router';
import store from './store';
import axios from 'axios';

// 设置axios默认配置
axios.defaults.baseURL = process.env.VUE_APP_API_URL || '';

// 添加响应拦截器处理认证错误
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // 如果接收到401错误，清除认证状态并重定向到登录页
      store.dispatch('logout');
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

// 如果已经有令牌，设置默认请求头
const token = localStorage.getItem('token');
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

Vue.prototype.$http = axios;
Vue.use(ElementUI);
Vue.config.productionTip = false;

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app'); 