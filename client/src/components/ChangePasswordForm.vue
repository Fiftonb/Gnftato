<template>
  <el-form 
    ref="passwordForm" 
    :model="passwordForm" 
    :rules="rules" 
    label-width="120px"
    @submit.native.prevent
  >
    <el-form-item label="当前密码" prop="currentPassword">
      <el-input 
        v-model="passwordForm.currentPassword" 
        type="password" 
        placeholder="请输入当前密码"
      ></el-input>
    </el-form-item>
    <el-form-item label="新密码" prop="newPassword">
      <el-input 
        v-model="passwordForm.newPassword" 
        type="password" 
        placeholder="请输入新密码"
      ></el-input>
    </el-form-item>
    <el-form-item label="确认新密码" prop="confirmPassword">
      <el-input 
        v-model="passwordForm.confirmPassword" 
        type="password" 
        placeholder="请再次输入新密码"
        @keyup.enter.native="handleSubmit"
      ></el-input>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="loading" @click="handleSubmit">修改密码</el-button>
      <el-button @click="resetForm">重置</el-button>
    </el-form-item>
  </el-form>
</template>

<script>
import axios from 'axios';

export default {
  name: 'ChangePasswordForm',
  data() {
    // 密码一致性验证
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== this.passwordForm.newPassword) {
        callback(new Error('两次输入的密码不一致'));
      } else {
        callback();
      }
    };
    
    return {
      passwordForm: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      rules: {
        currentPassword: [
          { required: true, message: '请输入当前密码', trigger: 'blur' }
        ],
        newPassword: [
          { required: true, message: '请输入新密码', trigger: 'blur' },
          { min: 6, message: '密码长度至少为6个字符', trigger: 'blur' }
        ],
        confirmPassword: [
          { required: true, message: '请再次输入新密码', trigger: 'blur' },
          { validator: validateConfirmPassword, trigger: 'blur' }
        ]
      },
      loading: false
    };
  },
  methods: {
    async handleSubmit() {
      try {
        // 表单验证
        await this.$refs.passwordForm.validate();
        
        this.loading = true;
        
        // 提交密码修改请求
        const response = await axios.put('/api/auth/update-password', {
          currentPassword: this.passwordForm.currentPassword,
          newPassword: this.passwordForm.newPassword
        });
        
        if (response.data.success) {
          this.$message.success('密码修改成功');
          this.resetForm();
          this.$emit('password-updated');
        }
      } catch (error) {
        if (error.response && error.response.data) {
          this.$message.error(error.response.data.message || '密码修改失败');
        } else if (!error.response) {
          // 如果是表单验证错误，不显示提示
        } else {
          this.$message.error('密码修改失败，请稍后重试');
        }
      } finally {
        this.loading = false;
      }
    },
    resetForm() {
      this.$refs.passwordForm.resetFields();
    }
  }
};
</script>

<style scoped>
.el-form {
  max-width: 500px;
}
</style> 