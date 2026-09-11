<template>
  <div v-if="servers.length === 0 && !loading" class="empty-state">
    <el-empty description="暂无服务器" :image-size="mobile ? 120 : 200">
      <el-button type="primary" @click="$emit('add')">添加您的第一台服务器</el-button>
    </el-empty>
  </div>

  <el-table
    v-else
    v-show="!mobile"
    v-loading="loading"
    :data="servers"
    :row-class-name="tableRowClassName"
    border
    style="width: 100%"
  >
    <el-table-column prop="name" label="服务器名称" width="180" />
    <el-table-column prop="host" label="主机地址" width="180" />
    <el-table-column prop="port" label="SSH端口" width="100" />
    <el-table-column prop="username" label="用户名" width="120" />
    <el-table-column prop="status" label="状态" width="160">
      <template #default="scope">
        <div class="status-container">
          <el-tag :type="statusTagType(scope.row.status)">
            {{ statusText[scope.row.status] || scope.row.status }}
          </el-tag>
          <el-button
            link
            type="primary"
            :icon="$icons.Refresh"
            circle
            size="small"
            :loading="checking[scope.row._id]"
            class="refresh-button"
            @click="$emit('check', scope.row)"
          />
          <el-popover
            v-if="errors[scope.row._id]"
            placement="top-start"
            title="错误详情"
            width="300"
            trigger="hover"
          >
            <div>
              <p><el-icon style="color: #e6a23c"><WarningFilled /></el-icon> {{ errors[scope.row._id] }}</p>
              <el-divider />
              <p>建议操作：</p>
              <el-button size="small" type="primary" @click="$emit('reconnect', scope.row)">尝试重连</el-button>
              <el-button size="small" @click="$emit('check', scope.row)">刷新状态</el-button>
              <el-button size="small" type="success" @click="$emit('retry', scope.row)">强制同步状态</el-button>
            </div>
            <template #reference><el-badge is-dot type="danger" /></template>
          </el-popover>
        </div>
        <div v-if="scope.row.lastChecked" class="status-time">
          上次检查: {{ formatStatusTime(scope.row.lastChecked) }}
        </div>
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="scope">
        <div class="operation-buttons">
          <el-button size="small" :icon="$icons.Edit" @click="$emit('edit', scope.row)">编辑</el-button>
          <el-button
            v-if="canConnect(scope.row)"
            size="small"
            type="success"
            :loading="connecting[scope.row._id]"
            :icon="$icons.Connection"
            @click="$emit('connect', scope.row)"
          >连接</el-button>
          <el-button
            v-else-if="scope.row.status === 'online'"
            size="small"
            type="warning"
            :loading="disconnecting[scope.row._id]"
            :icon="$icons.Close"
            @click="$emit('disconnect', scope.row)"
          >断开</el-button>
          <el-button v-else size="small" disabled>{{ statusText[scope.row.status] }}</el-button>
          <el-button
            v-if="scope.row.status === 'online'"
            size="small"
            type="primary"
            :icon="$icons.Setting"
            @click="$emit('manage', scope.row)"
          >管理规则</el-button>
          <el-button
            size="small"
            type="danger"
            :icon="$icons.Delete"
            @click="$emit('delete', scope.row)"
          >删除</el-button>
        </div>
      </template>
    </el-table-column>
  </el-table>

  <div v-if="mobile && !loading && servers.length" class="mobile-server-cards">
    <el-card v-for="server in servers" :key="server._id" class="mobile-server-card" shadow="hover">
      <template #header>
        <div class="mobile-card-header">
          <span class="server-name">{{ server.name }}</span>
          <el-tag :type="statusTagType(server.status)" size="small">
            {{ statusText[server.status] || server.status }}
          </el-tag>
          <el-button
            link
            type="primary"
            :icon="$icons.Refresh"
            circle
            size="small"
            :loading="checking[server._id]"
            class="refresh-button"
            @click="$emit('check', server)"
          />
        </div>
      </template>

      <div class="server-info">
        <p><strong>主机地址:</strong> {{ server.host }}</p>
        <p><strong>SSH端口:</strong> {{ server.port }}</p>
        <p><strong>用户名:</strong> {{ server.username }}</p>
        <p v-if="server.lastChecked" class="status-time">
          <strong>上次检查:</strong> {{ formatStatusTime(server.lastChecked) }}
        </p>
        <div v-if="errors[server._id]" class="mobile-error-reason">
          <el-icon style="color: #e6a23c"><WarningFilled /></el-icon> {{ errors[server._id] }}
        </div>
      </div>

      <div class="mobile-operation-buttons">
        <el-button size="small" :icon="$icons.Edit" circle @click="$emit('edit', server)" />
        <el-button
          v-if="canConnect(server)"
          size="small"
          type="success"
          :loading="connecting[server._id]"
          :icon="$icons.Connection"
          circle
          @click="$emit('connect', server)"
        />
        <el-button
          v-else-if="server.status === 'online'"
          size="small"
          type="warning"
          :loading="disconnecting[server._id]"
          :icon="$icons.Close"
          circle
          @click="$emit('disconnect', server)"
        />
        <el-button v-else size="small" disabled circle :icon="$icons.Loading" />
        <el-button
          v-if="server.status === 'online'"
          size="small"
          type="primary"
          :icon="$icons.Setting"
          circle
          @click="$emit('manage', server)"
        />
        <el-button
          size="small"
          type="danger"
          :icon="$icons.Delete"
          circle
          @click="$emit('delete', server)"
        />
      </div>
    </el-card>
  </div>

  <div v-if="servers.length" class="batch-actions">
    <el-card shadow="hover">
      <template #header>
        <span><el-icon><Operation /></el-icon> 批量操作</span>
      </template>
      <div class="batch-buttons" :class="{ 'mobile-batch-buttons': mobile }">
        <el-button
          size="small"
          type="success"
          :disabled="offlineTotal === 0"
          :icon="$icons.Connection"
          class="batch-button"
          @click="$emit('batch-connect')"
        >
          <span class="button-text">批量连接</span>
          <span v-if="offlineTotal" class="count-badge">({{ offlineTotal }})</span>
        </el-button>
        <el-button
          size="small"
          type="warning"
          :disabled="onlineTotal === 0"
          :icon="$icons.Close"
          class="batch-button"
          @click="$emit('batch-disconnect')"
        >
          <span class="button-text">批量断开</span>
          <span v-if="onlineTotal" class="count-badge">({{ onlineTotal }})</span>
        </el-button>
        <el-button
          size="small"
          type="info"
          :icon="$icons.Refresh"
          class="batch-button"
          @click="$emit('check-all')"
        >
          <span class="button-text">刷新所有状态</span>
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  STATUS_TEXT,
  formatStatusTime,
  offlineCount,
  onlineCount,
  statusTagType
} from '@/features/servers/serverPresentation';

const props = defineProps({
  servers: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  mobile: { type: Boolean, default: false },
  checking: { type: Object, required: true },
  connecting: { type: Object, required: true },
  disconnecting: { type: Object, required: true },
  errors: { type: Object, required: true }
});

defineEmits([
  'add', 'edit', 'delete', 'connect', 'disconnect', 'manage', 'check',
  'retry', 'reconnect', 'batch-connect', 'batch-disconnect', 'check-all'
]);

const statusText = STATUS_TEXT;
const onlineTotal = computed(() => onlineCount(props.servers));
const offlineTotal = computed(() => offlineCount(props.servers));

function canConnect(server) {
  return !['online', 'connecting', 'disconnecting'].includes(server.status);
}

function tableRowClassName({ row }) {
  return row.statusChanged ? 'status-changed' : '';
}
</script>

<style scoped>
.empty-state { margin: 40px 0; text-align: center; }
.batch-actions { margin-top: 20px; }
.status-container { display: flex; align-items: center; }
.refresh-button { margin-left: 8px; }
.operation-buttons { display: flex; flex-wrap: wrap; gap: 5px; }
.status-time { font-size: 12px; color: #909399; margin-top: 5px; }
.mobile-server-cards { margin: 10px 0; display: flex; flex-direction: column; gap: 15px; }
.mobile-server-card { width: 100%; margin-bottom: 10px; }
.mobile-card-header { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.server-name { font-weight: bold; flex: 1; }
.server-info { margin: 10px 0; }
.server-info p { margin: 5px 0; line-height: 1.5; }
.mobile-operation-buttons {
  display: flex; justify-content: space-around; flex-wrap: wrap; gap: 8px;
  margin-top: 15px; padding-top: 10px; border-top: 1px solid #ebeef5;
}
.mobile-error-reason {
  margin: 10px 0; padding: 8px; background-color: #fef0f0;
  border-radius: 4px; color: #f56c6c; font-size: 12px;
}
.batch-buttons { display: flex; gap: 10px; }
.batch-button { display: flex; align-items: center; }
.count-badge {
  font-size: 12px; margin-left: 5px; background-color: rgb(255 255 255 / 20%);
  padding: 2px 6px; border-radius: 10px; display: inline-block;
}
.mobile-batch-buttons { flex-direction: column; gap: 0; }
.mobile-batch-buttons .el-button {
  margin: 0 0 10px !important; width: 100%; display: flex; align-items: center;
  justify-content: flex-start; padding: 12px 15px; border-radius: 4px; height: auto; line-height: 1.5;
}
.mobile-batch-buttons .el-button:last-child { margin-bottom: 0 !important; }
.mobile-batch-buttons .button-text { flex: 1; text-align: center; font-size: 14px; }
@keyframes highlight-row {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgb(255 230 0 / 20%); }
}
:deep(.el-table__row.status-changed) { animation: highlight-row 2s ease; }
@media screen and (max-width: 375px) {
  .mobile-operation-buttons { flex-wrap: wrap; justify-content: center; }
  .mobile-operation-buttons .el-button { margin: 4px; }
  .mobile-card-header { flex-direction: column; align-items: flex-start; }
  .mobile-card-header .el-tag { margin-top: 5px; }
}
</style>
