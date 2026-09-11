<template>
  <div>
    <el-alert
      title="服务器当前处于离线状态"
      type="warning"
      :description="description"
      show-icon
      :closable="false"
      style="margin-bottom: 15px;"
    />

    <div class="server-offline">
      <el-icon class="el-icon-connection"><Connection /></el-icon>
      <h3>服务器未连接</h3>
      <p>{{ description }}</p>
    </div>

    <div class="offline-actions">
      <el-button type="primary" :loading="connecting" :icon="$icons.Refresh" @click="$emit('connect')">
        连接服务器
      </el-button>
      <el-button :icon="$icons.Back" @click="$emit('back')">返回服务器列表</el-button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirewallOfflineState',
  props: {
    connecting: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      default: '当前无法管理防火墙规则，请先连接服务器'
    }
  },
  emits: ['back', 'connect']
};
</script>
