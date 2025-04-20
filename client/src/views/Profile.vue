<template>
  <div class="profile-container">
    <div class="page-header">
      <div class="header-content">
        <h1>个人资料</h1>
        <el-button icon="el-icon-back" @click="goBack">返回</el-button>
      </div>
    </div>
    
    <el-card class="profile-card">
      <div slot="header" class="clearfix">
        <span>账号信息</span>
      </div>
      <div class="profile-info">
        <p><strong>用户名:</strong> {{ currentUser.username }}</p>
        <p><strong>创建时间:</strong> {{ formatDate(currentUser.createdAt) }}</p>
      </div>
    </el-card>
    
    <el-card class="password-card">
      <div slot="header" class="clearfix">
        <span>修改密码</span>
      </div>
      <change-password-form @password-updated="onPasswordUpdated"></change-password-form>
    </el-card>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import ChangePasswordForm from '@/components/ChangePasswordForm.vue';

export default {
  name: 'Profile',
  components: {
    ChangePasswordForm
  },
  computed: {
    ...mapGetters(['currentUser'])
  },
  methods: {
    formatDate(dateString) {
      if (!dateString) return '未知';
      const date = new Date(dateString);
      return date.toLocaleString();
    },
    onPasswordUpdated() {
      this.$message.success('密码已成功更新');
    },
    goBack() {
      this.$router.go(-1);
    }
  }
};
</script>

<style scoped>
.profile-container {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.profile-card,
.password-card {
  margin-bottom: 20px;
}

.profile-info {
  line-height: 1.8;
}
</style> 