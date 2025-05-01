<template>
  <div id="app">
    <el-header class="header" v-if="isAuthenticated">
      <div class="header-left">
        <h1>Gnftato 防火墙管理系统</h1>
      </div>
      <div class="header-right">
        <el-dropdown trigger="click" @command="handleCommand">
          <span class="user-dropdown">
            {{ currentUser.username }} <i class="el-icon-arrow-down el-icon--right"></i>
          </span>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="profile">个人资料</el-dropdown-item>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>
    </el-header>
    <router-view />
  </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex';
import axios from 'axios';

export default {
  name: 'App',
  computed: {
    ...mapGetters(['isAuthenticated', 'currentUser'])
  },
  methods: {
    ...mapActions(['logout', 'getCurrentUser']),
    
    handleCommand(command) {
      if (command === 'logout') {
        this.handleLogout();
      } else if (command === 'profile') {
        this.$router.push('/profile');
      }
    },
    
    handleLogout() {
      this.logout();
      this.$router.push('/login');
      this.$message.success('已退出登录');
    }
  },
  created() {
    // 页面加载时设置认证头
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // 获取当前用户信息
      this.getCurrentUser();
    }
  }
}
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  height: 100%;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #409EFF;
  color: white;
  padding: 0 20px;
}

.header-left h1 {
  margin: 0;
  font-size: 18px;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-dropdown {
  color: white;
  cursor: pointer;
}

.logout-btn {
  color: white !important;
  font-weight: bold;
  border: 1px solid white;
  border-radius: 4px;
  padding: 5px 10px;
}

.logout-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

/* 确保全局对话框居中 */
.el-dialog {
  margin: 0 auto !important;
  max-width: 90%;
}

.el-dialog__wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

/* 适配服务器对话框 */
.server-dialog .el-dialog {
  margin: 15vh auto !important;
}

/* 特定处理ip列表对话框 */
.ip-lists-dialog .el-dialog {
  margin: 5vh auto !important;
}

@media screen and (max-width: 768px) {
  .el-dialog {
    margin: 10px auto !important;
    width: 90% !important;
  }
  
  .ip-lists-dialog .el-dialog {
    width: 95% !important;
    margin: 2vh auto !important;
  }
}
</style> 