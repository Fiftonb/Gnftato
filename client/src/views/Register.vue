<template>
  <div class="register-container">
    <el-card class="register-card">
      <template #header><div class="clearfix">
        <h2>创建账号</h2>
      </div></template>
      <el-form 
        ref="registerForm" 
        :model="registerForm" 
        :rules="rules" 
        label-width="100px"
        @submit.prevent="handleRegister"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="registerForm.username" placeholder="请输入用户名"></el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input 
            v-model="registerForm.password" 
            type="password" 
            placeholder="请输入密码"
          ></el-input>
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input 
            v-model="registerForm.confirmPassword" 
            type="password" 
            placeholder="请再次输入密码" 
            @keyup.enter="handleRegister"
          ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleRegister">创建账号</el-button>
          <el-button @click="goToLogin">返回</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script>
import { mapActions } from 'vuex';

export default {
  name: 'Register',
  data() {
    const validateNewPassword = (rule, value, callback) => {
      if (value.trim().length < 12 || new TextEncoder().encode(value).length > 72) {
        callback(new Error('密码至少12个字符，且不超过72字节'));
      } else {
        callback();
      }
    };
    // 密码确认验证
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== this.registerForm.password) {
        callback(new Error('两次输入的密码不一致'));
      } else {
        callback();
      }
    };
    
    return {
      registerForm: {
        username: '',
        password: '',
        confirmPassword: ''
      },
      rules: {
        username: [
          { required: true, message: '请输入用户名', trigger: 'blur' },
          { min: 3, max: 20, message: '用户名长度应为3-20个字符', trigger: 'blur' }
        ],
        password: [
          { required: true, message: '请输入密码', trigger: 'blur' },
          { validator: validateNewPassword, trigger: 'blur' }
        ],
        confirmPassword: [
          { required: true, message: '请再次输入密码', trigger: 'blur' },
          { validator: validateConfirmPassword, trigger: 'blur' }
        ]
      },
      loading: false
    };
  },
  methods: {
    ...mapActions(['register']),
    
    async handleRegister() {
      if (this.loading) return;
      try {
        // 表单验证
        await this.$refs.registerForm.validate();
        
        this.loading = true;
        
        // 注册操作
        await this.register({
          username: this.registerForm.username,
          password: this.registerForm.password
        });
        
        // 注册成功后重定向到首页
        this.$message.success('账号已创建');
        this.$router.push('/profile');
      } catch (error) {
        if (error.response && error.response.data) {
          this.$message.error(error.response.data.message || '注册失败');
        } else if (!error.response) {
          // 如果是表单验证错误，不显示提示
        } else {
          this.$message.error('注册失败，请稍后重试');
        }
      } finally {
        this.loading = false;
      }
    },
    
    goToLogin() {
      this.$router.push('/profile');
    }
  },

};
</script>

<style scoped>
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f5f7fa;
}

.register-card {
  width: 400px;
}

.register-card h2 {
  text-align: center;
  margin: 0;
  color: #409EFF;
}
</style> 