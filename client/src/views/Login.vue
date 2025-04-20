<template>
  <div class="login-container">
    <el-card class="login-card">
      <div slot="header" class="clearfix">
        <h2>GiPtato 防火墙管理系统</h2>
      </div>
      <el-form 
        ref="loginForm" 
        :model="loginForm" 
        :rules="rules" 
        label-width="80px"
        @submit.native.prevent="handleLogin"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="loginForm.username" placeholder="请输入用户名"></el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input 
            v-model="loginForm.password" 
            type="password" 
            placeholder="请输入密码" 
            @keyup.enter.native="handleLogin"
          ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleLogin">登录</el-button>
        </el-form-item>
      </el-form>
      <div class="login-tip">
        <small>默认管理员账户：admin / admin123</small>
      </div>
    </el-card>
  </div>
</template>

<script>
import { mapActions } from 'vuex';

export default {
  name: 'Login',
  data() {
    return {
      loginForm: {
        username: '',
        password: ''
      },
      rules: {
        username: [
          { required: true, message: '请输入用户名', trigger: 'blur' }
        ],
        password: [
          { required: true, message: '请输入密码', trigger: 'blur' }
        ]
      },
      loading: false
    };
  },
  methods: {
    ...mapActions(['login']),
    
    async handleLogin() {
      try {
        // 表单验证
        await this.$refs.loginForm.validate();
        
        this.loading = true;
        
        // 登录操作
        await this.login({
          username: this.loginForm.username,
          password: this.loginForm.password
        });
        
        // 登录成功后重定向到首页
        this.$router.push('/');
        this.$message.success('登录成功');
      } catch (error) {
        if (error.response && error.response.data) {
          this.$message.error(error.response.data.message || '登录失败');
        } else if (!error.response) {
          // 如果是表单验证错误，不显示提示
        } else {
          this.$message.error('登录失败，请稍后重试');
        }
      } finally {
        this.loading = false;
      }
    }
  },
  // 阻止已登录用户访问登录页
  beforeRouteEnter(to, from, next) {
    const token = localStorage.getItem('token');
    if (token) {
      next('/');
    } else {
      next();
    }
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f5f7fa;
}

.login-card {
  width: 400px;
}

.login-card h2 {
  text-align: center;
  margin: 0;
  color: #409EFF;
}

.login-tip {
  text-align: center;
  margin-top: 10px;
  color: #909399;
}
</style> 