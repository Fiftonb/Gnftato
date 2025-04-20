<template>
  <div class="servers-container">
    <div class="page-header">
      <h1>服务器管理</h1>
      <el-button type="primary" @click="showAddServerDialog">添加服务器</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="servers"
      border
      style="width: 100%"
    >
      <el-table-column
        prop="name"
        label="服务器名称"
        width="180"
      ></el-table-column>
      <el-table-column
        prop="host"
        label="主机地址"
        width="180"
      ></el-table-column>
      <el-table-column
        prop="port"
        label="SSH端口"
        width="100"
      ></el-table-column>
      <el-table-column
        prop="username"
        label="用户名"
        width="120"
      ></el-table-column>
      <el-table-column
        prop="status"
        label="状态"
        width="100"
      >
        <template slot-scope="scope">
          <el-tag
            :type="getStatusTagType(scope.row.status)"
          >
            {{ statusText[scope.row.status] }}
          </el-tag>
          <el-tooltip content="刷新状态" placement="top">
            <el-button 
              type="text" 
              icon="el-icon-refresh" 
              circle 
              size="mini" 
              @click="checkServerStatus(scope.row)"
            ></el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
      >
        <template slot-scope="scope">
          <el-button
            size="mini"
            @click="handleEdit(scope.row)"
          >编辑</el-button>
          <el-button
            v-if="scope.row.status !== 'online' && scope.row.status !== 'connecting' && scope.row.status !== 'disconnecting'"
            size="mini"
            type="success"
            @click="handleConnect(scope.row)"
          >连接</el-button>
          <el-button
            v-else-if="scope.row.status === 'online'"
            size="mini"
            type="warning"
            @click="handleDisconnect(scope.row)"
            :loading="disconnectingServers[scope.row._id]"
          >断开</el-button>
          <el-button
            v-else
            size="mini"
            disabled
          >{{ statusText[scope.row.status] }}</el-button>
          <el-button
            v-if="scope.row.status === 'online'"
            size="mini"
            type="primary"
            @click="handleManageRules(scope.row)"
          >管理规则</el-button>
          <el-button
            size="mini"
            type="danger"
            @click="handleDelete(scope.row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑服务器对话框 -->
    <el-dialog
      :title="isEdit ? '编辑服务器' : '添加服务器'"
      :visible.sync="dialogVisible"
      width="50%"
    >
      <server-form
        :is-edit="isEdit"
        :server-data="currentServer"
        @submit="handleFormSubmit"
      ></server-form>
    </el-dialog>
  </div>
</template>

<script>
import ServerForm from '@/components/ServerForm.vue';
import { mapActions } from 'vuex';

export default {
  name: 'ServersView',
  components: {
    ServerForm
  },
  data() {
    return {
      loading: false,
      servers: [],
      dialogVisible: false,
      isEdit: false,
      currentServer: null,
      statusText: {
        'online': '在线',
        'offline': '离线',
        'error': '错误',
        'connecting': '连接中',
        'disconnecting': '断开中'
      },
      disconnectingServers: {},
      statusCheckInterval: null
    };
  },
  created() {
    this.fetchServers();
    // 每30秒自动检查一次服务器状态
    this.statusCheckInterval = setInterval(() => {
      this.checkAllServersStatus();
    }, 30000);
  },
  beforeDestroy() {
    // 组件销毁时清除定时器
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
  },
  methods: {
    ...mapActions('servers', [
      'getAllServers',
      'createServer',
      'updateServer',
      'deleteServer',
      'connectServer',
      'disconnectServer',
      'checkStatus'
    ]),
    async fetchServers() {
      this.loading = true;
      try {
        const response = await this.getAllServers();
        this.servers = response.data;
      } catch (error) {
        this.$message.error('获取服务器列表失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },
    showAddServerDialog() {
      this.isEdit = false;
      this.currentServer = null;
      this.dialogVisible = true;
    },
    handleEdit(server) {
      this.isEdit = true;
      this.currentServer = { ...server };
      this.dialogVisible = true;
    },
    async handleFormSubmit(formData) {
      try {
        if (this.isEdit) {
          await this.updateServer({
            id: this.currentServer._id,
            data: formData
          });
          this.$message.success('服务器更新成功');
        } else {
          await this.createServer(formData);
          this.$message.success('服务器添加成功');
        }
        this.dialogVisible = false;
        this.fetchServers();
      } catch (error) {
        this.$message.error(error.message);
      }
    },
    async handleDelete(server) {
      try {
        await this.$confirm('此操作将永久删除该服务器, 是否继续?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await this.deleteServer(server._id);
        this.$message.success('服务器删除成功');
        this.fetchServers();
      } catch (error) {
        if (error !== 'cancel') {
          this.$message.error('删除服务器失败: ' + error.message);
        }
      }
    },
    async handleConnect(server) {
      try {
        this.loading = true;
        
        // 先更新本地状态为"连接中"
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', 'connecting');
        }
        
        // 执行连接操作
        await this.connectServer(server._id);
        this.$message.success('服务器连接成功');
        
        // 强制刷新所有服务器状态
        await this.fetchServers();
      } catch (error) {
        this.$message.error('连接服务器失败: ' + error.message);
        // 如果失败，再次获取当前状态
        await this.checkServerStatus(server);
      } finally {
        this.loading = false;
      }
    },
    async handleDisconnect(server) {
      try {
        // 设置断开中状态
        this.$set(this.disconnectingServers, server._id, true);
        
        // 先更新本地状态为"断开中"
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', 'disconnecting');
        }
        
        // 执行断开操作
        await this.disconnectServer(server._id);
        this.$message.success('服务器断开连接成功');
        
        // 立即更新本地状态
        if (index !== -1) {
          this.$set(this.servers[index], 'status', 'offline');
        }
        
        // 强制刷新所有服务器状态
        await this.fetchServers();
      } catch (error) {
        this.$message.error('断开服务器连接失败: ' + error.message);
        // 如果失败，再次获取当前状态
        await this.checkServerStatus(server);
      } finally {
        // 清除断开中状态
        this.$set(this.disconnectingServers, server._id, false);
      }
    },
    handleManageRules(server) {
      this.$router.push({ name: 'rules', params: { serverId: server._id } });
    },
    async checkServerStatus(server) {
      try {
        const response = await this.checkStatus(server._id);
        // 更新当前服务器状态
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', response.data.data.status);
        }
      } catch (error) {
        console.error('检查服务器状态失败:', error);
      }
    },
    async checkAllServersStatus() {
      for (const server of this.servers) {
        await this.checkServerStatus(server);
      }
    },
    getStatusTagType(status) {
      switch (status) {
        case 'online':
          return 'success';
        case 'error':
          return 'danger';
        case 'connecting':
          return 'info';
        case 'disconnecting':
          return 'warning';
        default:
          return '';
      }
    }
  }
};
</script>

<style scoped>
.servers-container {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
</style> 