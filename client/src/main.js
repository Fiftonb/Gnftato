import { createApp, markRaw } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { ArrowDown, Back, Close, Connection, Delete, Edit, Loading, Refresh, Operation, Setting, Upload, WarningFilled, Warning } from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import store from './store';
import axios from 'axios';

// 设置axios默认配置
axios.defaults.baseURL = (import.meta.env.VITE_API_URL || import.meta.env.VUE_APP_API_URL) || '';

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

const app = createApp(App);
const icons = { ArrowDown, Back, Close, Connection, Delete, Edit, Loading, Refresh, Operation, Setting, Upload, WarningFilled, Warning };
for (const [name, component] of Object.entries(icons)) app.component(name, component);
app.config.globalProperties.$icons = markRaw(icons);
app.config.globalProperties.$http = axios;
app.use(ElementPlus, { locale: zhCn });
app.use(store);
app.use(router);
app.mount('#app');
