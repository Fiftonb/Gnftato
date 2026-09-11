<template>
  <div class="servers-container">
    <div class="page-header">
      <h1>服务器管理</h1>
      <el-button type="primary" @click="showAddServerDialog">添加服务器</el-button>
    </div>

    <el-alert
      v-if="connectionStateResynced"
      type="warning"
      :closable="true"
      show-icon
      class="status-alert"
    >
      <template #title><strong>连接状态已重新同步</strong></template>
      <div>
        后端连接检查发现部分原在线连接已断开，列表已更新为当前状态。
        <el-button
          size="small"
          type="primary"
          class="reconnect-all-button"
          :disabled="!hasOfflineServers"
          @click="batchConnect"
        >重新连接所有服务器</el-button>
      </div>
    </el-alert>

    <ServerList
      :servers="servers"
      :loading="loading"
      :mobile="isMobile"
      :checking="checkingServers"
      :connecting="connectingServers"
      :disconnecting="disconnectingServers"
      :errors="errorReasons"
      @add="showAddServerDialog"
      @edit="handleEdit"
      @delete="handleDelete"
      @connect="handleConnect"
      @disconnect="handleDisconnect"
      @manage="handleManageRules"
      @check="checkServerStatus"
      @retry="handleConnectionRetry"
      @reconnect="handleReconnect"
      @batch-connect="batchConnect"
      @batch-disconnect="batchDisconnect"
      @check-all="checkAllServersStatus"
    />

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑服务器' : '添加服务器'"
      :width="isMobile ? '90%' : '50%'"
      class="server-dialog"
      destroy-on-close
    >
      <ServerForm
        ref="serverForm"
        :is-edit="isEdit"
        :server-data="currentServer"
        @submit="handleFormSubmit"
      />
      <template #footer>
        <div class="dialog-footer" :class="{ 'mobile-footer': isMobile }">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button
            v-if="!isEdit"
            type="primary"
            :loading="testingConnection"
            @click="handleTestConnection"
          >测试连接</el-button>
          <el-button type="primary" @click="serverForm.submitForm()">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import ServerForm from '@/components/ServerForm.vue';
import ServerList from '@/components/servers/ServerList.vue';
import { useServerConnections } from '@/features/servers/useServerConnections';
import { useServerCrud } from '@/features/servers/useServerCrud';

const store = useStore();
const router = useRouter();
const isMobile = ref(window.innerWidth < 768);

const {
  batchConnect,
  batchDisconnect,
  checkAllServersStatus,
  checkServerStatus,
  checkingServers,
  cleanup,
  connectingServers,
  connectionStateResynced,
  disconnectingServers,
  errorReasons,
  handleConnect,
  handleConnectionRetry,
  handleDisconnect,
  handleManageRules,
  handleReconnect,
  hasOfflineServers,
  initialize,
  loading,
  servers
} = useServerConnections(store, router);

const {
  currentServer,
  dialogVisible,
  handleDelete,
  handleEdit,
  handleFormSubmit,
  handleTestConnection,
  isEdit,
  serverForm,
  showAddServerDialog,
  testingConnection
} = useServerCrud(store);

function updateMobileLayout() {
  isMobile.value = window.innerWidth < 768;
}

onMounted(() => {
  window.addEventListener('resize', updateMobileLayout);
  initialize();
});

onBeforeUnmount(() => {
  cleanup();
  window.removeEventListener('resize', updateMobileLayout);
});
</script>

<style scoped>
.servers-container { padding: 20px; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.status-alert { margin-bottom: 15px; }
.reconnect-all-button { margin-left: 10px; }
.dialog-footer { display: flex; justify-content: flex-end; }
.mobile-footer { flex-direction: column; gap: 10px; }
.mobile-footer .el-button { margin: 5px 0 0 !important; }

@media screen and (max-width: 768px) {
  .servers-container { padding: 10px; }
  .page-header { flex-direction: column; align-items: flex-start; gap: 10px; }
  .page-header h1 { margin-bottom: 10px; }
  :deep(.server-dialog .el-dialog__body) { padding: 15px 10px; }
  :deep(.server-dialog .el-dialog) { margin: 5vh auto !important; }
  :deep(.server-dialog .el-form-item) { margin-bottom: 15px; }
  :deep(.server-dialog .dialog-footer) { display: flex; flex-direction: column; gap: 10px; }
  :deep(.server-dialog .el-button) { width: 100%; margin: 5px 0 0 !important; }
}
</style>
