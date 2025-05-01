<template>
  <div class="servers-container">
    <div class="page-header">
      <h1>服务器管理</h1>
      <el-button type="primary" @click="showAddServerDialog">添加服务器</el-button>
    </div>

    <!-- 状态同步警告横幅 -->
    <el-alert
      v-if="isServerRestarted"
      title="检测到系统重启！"
      type="warning"
      :closable="true"
      show-icon
      style="margin-bottom: 15px;"
    >
      <template slot="title">
        <span style="font-weight: bold;">检测到系统重启！</span>
      </template>
      <div>
        服务器状态已重置，某些连接可能已断开。已自动同步所有状态为最新。
        <el-button size="mini" type="primary" @click="batchConnect" style="margin-left: 10px;" :disabled="!hasOfflineServers">重新连接所有服务器</el-button>
      </div>
    </el-alert>

    <!-- 空状态显示 -->
    <div v-if="servers.length === 0 && !loading" class="empty-state">
      <el-empty description="暂无服务器" :image-size="isMobile ? 120 : 200">
        <el-button type="primary" @click="showAddServerDialog">添加您的第一台服务器</el-button>
      </el-empty>
    </div>

    <el-table
      v-else
      v-loading="loading"
      :data="servers"
      border
      style="width: 100%"
      :class="{'mobile-table': isMobile}"
      v-show="!isMobile"
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
        width="160"
      >
        <template slot-scope="scope">
          <div class="status-container">
            <el-tag
              :type="getStatusTagType(scope.row.status)"
            >
              {{ statusText[scope.row.status] }}
            </el-tag>
            <el-button 
              type="text" 
              icon="el-icon-refresh" 
              circle 
              size="mini" 
              @click="checkServerStatus(scope.row)"
              :loading="checkingServers[scope.row._id]"
              class="refresh-button"
            ></el-button>
            <el-popover
              v-if="errorReasons[scope.row._id]"
              placement="top-start"
              title="错误详情"
              width="300"
              trigger="hover"
            >
              <div>
                <p><i class="el-icon-warning" style="color: #E6A23C;"></i> {{ errorReasons[scope.row._id] }}</p>
                <el-divider></el-divider>
                <p>建议操作：</p>
                <el-button size="mini" type="primary" @click="handleReconnect(scope.row)">尝试重连</el-button>
                <el-button size="mini" @click="checkServerStatus(scope.row)">刷新状态</el-button>
                <el-button size="mini" type="success" @click="handleConnectionRetry(scope.row)">强制同步状态</el-button>
              </div>
              <el-badge slot="reference" is-dot type="danger"></el-badge>
            </el-popover>
          </div>
          <div v-if="scope.row.lastChecked" class="status-time">
            上次检查: {{ formatTime(scope.row.lastChecked) }}
          </div>
          <!-- 状态不同步提示 -->
          <div v-if="scope.row.status === 'error' && errorReasons[scope.row._id] && errorReasons[scope.row._id].includes('检查服务器日志')" class="sync-warning">
            <el-link type="warning" @click="handleConnectionRetry(scope.row)">
              <i class="el-icon-warning-outline"></i> 前后端状态可能不同步，点击修复
            </el-link>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
      >
        <template slot-scope="scope">
          <div class="operation-buttons">
            <el-button
              size="mini"
              @click="handleEdit(scope.row)"
              icon="el-icon-edit"
            >编辑</el-button>
            <el-button
              v-if="scope.row.status !== 'online' && scope.row.status !== 'connecting' && scope.row.status !== 'disconnecting'"
              size="mini"
              type="success"
              @click="handleConnect(scope.row)"
              :loading="connectingServers[scope.row._id]"
              icon="el-icon-connection"
            >连接</el-button>
            <el-button
              v-else-if="scope.row.status === 'online'"
              size="mini"
              type="warning"
              @click="handleDisconnect(scope.row)"
              :loading="disconnectingServers[scope.row._id]"
              icon="el-icon-close"
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
              icon="el-icon-setting"
            >管理规则</el-button>
            <el-button
              size="mini"
              type="danger"
              @click="handleDelete(scope.row)"
              icon="el-icon-delete"
            >删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    
    <!-- 移动端卡片式布局 -->
    <div v-if="isMobile && !loading && servers.length > 0" class="mobile-server-cards">
      <el-card v-for="server in servers" :key="server._id" class="mobile-server-card" shadow="hover">
        <div slot="header" class="mobile-card-header">
          <span class="server-name">{{ server.name }}</span>
          <el-tag :type="getStatusTagType(server.status)" size="small">
            {{ statusText[server.status] }}
          </el-tag>
          <el-button 
            type="text" 
            icon="el-icon-refresh" 
            circle 
            size="mini" 
            @click="checkServerStatus(server)"
            :loading="checkingServers[server._id]"
            class="refresh-button"
          ></el-button>
        </div>
        
        <div class="server-info">
          <p><strong>主机地址:</strong> {{ server.host }}</p>
          <p><strong>SSH端口:</strong> {{ server.port }}</p>
          <p><strong>用户名:</strong> {{ server.username }}</p>
          <p v-if="server.lastChecked" class="status-time">
            <strong>上次检查:</strong> {{ formatTime(server.lastChecked) }}
          </p>
          
          <!-- 错误提示 -->
          <div v-if="errorReasons[server._id]" class="mobile-error-reason">
            <i class="el-icon-warning" style="color: #E6A23C;"></i> {{ errorReasons[server._id] }}
          </div>
        </div>
        
        <div class="mobile-operation-buttons">
          <el-button
            size="mini"
            @click="handleEdit(server)"
            icon="el-icon-edit"
            circle
          ></el-button>
          
          <el-button
            v-if="server.status !== 'online' && server.status !== 'connecting' && server.status !== 'disconnecting'"
            size="mini"
            type="success"
            @click="handleConnect(server)"
            :loading="connectingServers[server._id]"
            icon="el-icon-connection"
            circle
          ></el-button>
          
          <el-button
            v-else-if="server.status === 'online'"
            size="mini"
            type="warning"
            @click="handleDisconnect(server)"
            :loading="disconnectingServers[server._id]"
            icon="el-icon-close"
            circle
          ></el-button>
          
          <el-button
            v-else
            size="mini"
            disabled
            circle
            icon="el-icon-loading"
          ></el-button>
          
          <el-button
            v-if="server.status === 'online'"
            size="mini"
            type="primary"
            @click="handleManageRules(server)"
            icon="el-icon-setting"
            circle
          ></el-button>
          
          <el-button
            size="mini"
            type="danger"
            @click="handleDelete(server)"
            icon="el-icon-delete"
            circle
          ></el-button>
        </div>
      </el-card>
    </div>

    <!-- 批量操作工具栏 -->
    <div v-if="servers.length > 0" class="batch-actions">
      <el-card shadow="hover">
        <div slot="header" class="clearfix">
          <span><i class="el-icon-s-operation"></i> 批量操作</span>
        </div>
        <div class="batch-buttons" :class="{'mobile-batch-buttons': isMobile}">
          <el-button 
            size="small" 
            type="success" 
            @click="batchConnect" 
            :disabled="!hasOfflineServers" 
            icon="el-icon-connection"
            class="batch-button"
          >
            <span class="button-text">批量连接</span>
            <span v-if="hasOfflineServers" class="count-badge">({{ getOfflineCount() }})</span>
          </el-button>
          <el-button 
            size="small" 
            type="warning" 
            @click="batchDisconnect" 
            :disabled="!hasOnlineServers" 
            icon="el-icon-close"
            class="batch-button"
          >
            <span class="button-text">批量断开</span>
            <span v-if="hasOnlineServers" class="count-badge">({{ getOnlineCount() }})</span>
          </el-button>
          <el-button 
            size="small" 
            type="info" 
            @click="checkAllServersStatus" 
            icon="el-icon-refresh"
            class="batch-button"
          >
            <span class="button-text">刷新所有状态</span>
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 添加/编辑服务器对话框 -->
    <el-dialog
      :title="isEdit ? '编辑服务器' : '添加服务器'"
      :visible.sync="dialogVisible"
      :width="isMobile ? '90%' : '50%'"
      class="server-dialog"
    >
      <server-form
        :is-edit="isEdit"
        :server-data="currentServer"
        @submit="handleFormSubmit"
        ref="serverForm"
      ></server-form>
      <div slot="footer" class="dialog-footer" :class="{'mobile-footer': isMobile}">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="!isEdit" type="primary" @click="handleTestConnection" :loading="testingConnection">测试连接</el-button>
        <el-button type="primary" @click="$refs.serverForm.submitForm()">确定</el-button>
      </div>
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
        'disconnecting': '断开中',
        'restarting': '重启中'
      },
      disconnectingServers: {},
      connectingServers: {},
      checkingServers: {},
      statusCheckInterval: null,
      heartbeatIntervals: {},  // 存储各服务器心跳检测的定时器
      lastStateTime: {},
      errorReasons: {}, // 存储错误原因
      reconnectCounters: {}, // 记录重连次数
      sessionId: '', // 用于检测面板服务器重启
      isServerRestarted: false, // 标记面板是否重启过
      isRetrying: false, // 防止重复触发
      testingConnection: false, // 添加测试连接加载状态
      isMobile: false // 添加移动端判断
    };
  },
  computed: {
    hasOnlineServers() {
      return this.servers.some(server => server.status === 'online');
    },
    hasOfflineServers() {
      return this.servers.some(server => server.status === 'offline' || server.status === 'error');
    }
  },
  created() {
    // 检查面板服务器是否重启过
    this.checkPanelRestart();
    this.fetchServers();
    // 加载本地缓存的状态
    this.loadCachedStates();
    // 每30秒自动检查一次服务器状态
    this.statusCheckInterval = setInterval(() => {
      this.checkAllServersStatus();
    }, 30000);
  },
  mounted() {
    // 页面加载后检查面板是否重启，无论如何先检查一次所有服务器状态
    setTimeout(async () => {
      // 这里延迟执行是为了确保DOM已完全渲染，数据已加载
      if (!this.isServerRestarted) {
        // 如果未检测到服务器重启，也执行一次在线服务器状态验证
        await this.verifyOnlineServersStatus();
      }
      
      // 添加自动修复，修正服务器状态不一致问题
      this.autoFixInconsistentStatus();
    }, 1000);
    
    // 检测是否为移动设备
    this.checkMobileDevice();
    // 监听窗口大小变化
    window.addEventListener('resize', this.checkMobileDevice);
  },
  beforeDestroy() {
    // 组件销毁时清除定时器
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    
    // 清除所有心跳检测
    Object.keys(this.heartbeatIntervals).forEach(serverId => {
      clearInterval(this.heartbeatIntervals[serverId]);
    });
    
    // 移除窗口大小变化监听
    window.removeEventListener('resize', this.checkMobileDevice);
  },
  methods: {
    ...mapActions('servers', [
      'getAllServers',
      'createServer',
      'updateServer',
      'deleteServer',
      'connectServer',
      'disconnectServer',
      'checkStatus',
      'testConnection',
      'sendHeartbeat',
      'getPanelStatus',  // 新增获取面板状态API
      'getServerLogs'  // 新增获取服务器日志API
    ]),
    async fetchServers() {
      this.loading = true;
      try {
        const response = await this.getAllServers();
        this.servers = response.data;
        
        // 立即验证所有显示为在线的服务器状态
        await this.verifyOnlineServersStatus();
        
        // 保存状态到本地存储
        this.saveStatesToCache();
      } catch (error) {
        this.$message.error('获取服务器列表失败: ' + error.message);
        
        // 如果获取失败，可能是面板刚重启，清除所有本地状态
        localStorage.removeItem('serverStates');
      } finally {
        this.loading = false;
      }
    },
    // 验证所有显示为在线的服务器状态
    async verifyOnlineServersStatus() {
      const onlineServers = this.servers.filter(s => s.status === 'online');
      if (onlineServers.length === 0) return;
      
      // 显示验证中的加载状态
      this.loading = true;
      
      try {
        // 使用并行验证来加速处理
        const verifyPromises = onlineServers.map(async (server) => {
          try {
            const actualStatus = await this.verifyServerStatus(server);
            
            // 如果实际状态不是在线，但显示是在线，说明有状态不一致
            if (actualStatus !== 'online' && server.status === 'online') {
              this.isServerRestarted = true;
              
              // 立即更新界面上的状态
              const index = this.servers.findIndex(s => s._id === server._id);
              if (index !== -1) {
                // 使用过渡动画突出显示状态变化
                this.$set(this.servers[index], 'statusChanged', true);
                this.$set(this.servers[index], 'status', actualStatus);
                this.$set(this.servers[index], 'lastChecked', Date.now());
                
                // 2秒后移除高亮效果
                setTimeout(() => {
                  this.$set(this.servers[index], 'statusChanged', false);
                }, 2000);
              }
            }
          } catch (error) {
            console.error(`验证服务器 ${server.name} 状态失败:`, error);
            // 假设验证失败意味着连接有问题
            const index = this.servers.findIndex(s => s._id === server._id);
            if (index !== -1) {
              this.$set(this.servers[index], 'status', 'error');
              this.$set(this.servers[index], 'statusChanged', true);
              this.$set(this.errorReasons, server._id, '连接验证失败，可能因为服务重启');
              this.$set(this.servers[index], 'lastChecked', Date.now());
              
              // 2秒后移除高亮效果
              setTimeout(() => {
                this.$set(this.servers[index], 'statusChanged', false);
              }, 2000);
            }
          }
        });
        
        // 等待所有验证完成
        await Promise.all(verifyPromises);
      } finally {
        this.loading = false;
      }
      
      // 如果检测到服务器重启，显示通知
      if (this.isServerRestarted) {
        // 通知已经改为顶部横幅，这里不需要再显示
      }
    },
    // 检查面板服务器是否重启过
    async checkPanelRestart() {
      try {
        // 先获取本地存储的会话ID
        const storedSessionId = localStorage.getItem('panelSessionId');
        
        // 获取当前面板服务器的会话ID
        const response = await this.getPanelStatus();
        if (response && response.data && response.data.sessionId) {
          const currentSessionId = response.data.sessionId;
          this.sessionId = currentSessionId;
          
          // 保存新的会话ID
          localStorage.setItem('panelSessionId', currentSessionId);
          
          // 如果存在之前的会话ID且与当前不同，说明面板重启过
          if (storedSessionId && storedSessionId !== currentSessionId) {
            this.isServerRestarted = true;
            this.handlePanelRestart();
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error('检查面板状态失败:', error);
        // 如果无法获取面板状态，可能也是重启导致的
        this.isServerRestarted = true;
        this.handlePanelRestart();
        return true;
      }
    },
    
    // 处理面板重启后的状态恢复
    async handlePanelRestart() {
      // 显示面板重启通知
      this.$notify({
        title: '系统提示',
        message: '检测到管理面板已重启，正在恢复连接状态...',
        type: 'warning',
        duration: 0,
        showClose: true
      });
      
      // 清除本地缓存的状态
      localStorage.removeItem('serverStates');
      
      // 延迟执行，等待获取服务器列表完成
      setTimeout(async () => {
        // 检查所有在线服务器的实际状态
        const onlineServers = this.servers.filter(s => s.status === 'online');
        if (onlineServers.length > 0) {
          try {
            // 显示正在验证状态的加载
            this.loading = true;
            
            // 直接弹出确认对话框
            try {
              await this.$confirm(
                `检测到管理面板重启，共有 ${onlineServers.length} 台服务器可能需要重新连接。是否立即尝试重新连接？`, 
                '连接状态恢复', 
                {
                  confirmButtonText: '立即重连',
                  cancelButtonText: '稍后手动处理',
                  type: 'warning',
                  closeOnClickModal: false
                }
              );
              
              // 用户选择重连，逐个重连服务器
              for (const server of onlineServers) {
                try {
                  await this.handleReconnect(server);
                } catch (err) {
                  console.error('重连服务器失败:', err);
                }
              }
              
              this.$message.success('连接状态恢复完成');
            } catch (err) {
              // 用户选择不重连
              if (err === 'cancel') {
                this.$message.info('您可以稍后手动重连服务器');
                // 将所有"在线"服务器状态更新为"错误"
                onlineServers.forEach(server => {
                  const index = this.servers.findIndex(s => s._id === server._id);
                  if (index !== -1) {
                    this.$set(this.servers[index], 'status', 'error');
                    this.$set(this.errorReasons, server._id, '面板重启后连接状态未恢复');
                  }
                });
              }
            }
          } finally {
            this.loading = false;
          }
        }
      }, 500);
    },
    
    // 保存状态到本地缓存
    saveStatesToCache() {
      const states = {};
      this.servers.forEach(server => {
        states[server._id] = {
          status: server.status,
          timestamp: Date.now(),
          sessionId: this.sessionId // 保存当前会话ID
        };
      });
      localStorage.setItem('serverStates', JSON.stringify(states));
    },
    
    // 从本地缓存加载状态
    loadCachedStates() {
      // 首先检查localStorage是否有可用状态
      const cachedStates = localStorage.getItem('serverStates');
      if (!cachedStates) return;
      
      try {
        const states = JSON.parse(cachedStates);
        
        // 检查缓存中的会话ID是否与当前一致
        const firstServer = Object.values(states)[0];
        if (firstServer && firstServer.sessionId && firstServer.sessionId !== this.sessionId) {
          // 会话ID不一致，说明面板重启过，不加载缓存状态
          this.isServerRestarted = true;
          return;
        }
        
        // 检查缓存时间是否过期（超过10分钟视为过期）
        const now = Date.now();
        const isExpired = Object.values(states).some(state => {
          return (now - state.timestamp) > 10 * 60 * 1000; // 10分钟过期
        });
        
        if (isExpired) {
          console.log('缓存状态已过期，不加载');
          return;
        }
        
        this.lastStateTime = states;
      } catch (error) {
        console.error('解析缓存状态失败:', error);
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
    async handleTestConnection() {
      // 获取表单数据进行测试连接
      const formData = this.$refs.serverForm.getFormData();
      if (!formData) return;
      
      // 设置测试连接加载状态
      this.$set(this, 'testingConnection', true);
      
      // 显示加载提示
      let loadingMessage = null;
      let isCancelled = false;
      
      // 设置超时处理
      let timeoutId = null;
      let updateInterval = null;
      
      try {
        // 显示加载提示
        loadingMessage = this.$message({
          message: '正在测试连接，请稍候...',
          type: 'info',
          duration: 0,
          showClose: true,
          onClose: () => {
            // 用户手动关闭消息时，标记为已取消
            isCancelled = true;
            loadingMessage = null;
          }
        });
        
        // 设置超时处理（30秒）
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('连接测试超时，请检查网络或服务器配置'));
          }, 30000);
        });
        
        // 每3秒更新一次提示消息，显示不同的等待文本
        let count = 0;
        updateInterval = setInterval(() => {
          if (loadingMessage && !isCancelled) {
            count++;
            let message = '';
            
            switch (count % 4) {
              case 0:
                message = '正在测试连接，请稍候...';
                break;
              case 1:
                message = '正在尝试连接到服务器...';
                break;
              case 2:
                message = '等待服务器响应中...';
                break;
              case 3:
                message = '连接验证中，请耐心等待...';
                break;
            }
            
            // 更新消息内容
            loadingMessage.message = message;
          }
        }, 3000);
        
        // 使用Promise.race在超时和实际操作之间进行竞争
        await Promise.race([
          this.testConnection(formData),
          timeoutPromise
        ]);
        
        // 如果用户已关闭消息，则不再显示成功消息
        if (!isCancelled) {
          // 测试成功显示成功消息
          this.$message.success('连接测试成功');
        }
      } catch (error) {
        // 如果用户已关闭消息，则不再显示错误消息
        if (!isCancelled) {
          // 测试失败显示错误消息
          this.$message.error('连接测试失败: ' + error.message);
        }
      } finally {
        // 清除所有定时器
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (updateInterval) {
          clearInterval(updateInterval);
        }
        
        // 无论成功或失败，都确保关闭加载提示和重置状态
        if (loadingMessage) {
          loadingMessage.close();
        }
        
        // 重置测试连接加载状态
        this.$set(this, 'testingConnection', false);
      }
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
    async verifyServerStatus(server) {
      // 再次确认服务器状态，防止状态不一致
      try {
        this.$set(this.checkingServers, server._id, true);
        
        // 先获取日志信息判断实际连接状态
        let logBasedStatus = null;
        try {
          const logResponse = await this.getServerLogs(server._id);
          if (logResponse && logResponse.data) {
            const logs = logResponse.data;
            
            // 通过日志判断实际连接状态
            if (logs.includes('SSH连接建立成功') || 
                logs.includes('服务器已连接且连接有效') ||
                logs.includes('连接套接字正常')) {
              
              console.log('状态验证：日志显示服务器实际已连接');
              logBasedStatus = 'online';
            }
          }
        } catch (error) {
          console.error('获取日志失败:', error);
        }
        
        // 如果日志已确认在线状态，直接使用
        if (logBasedStatus === 'online') {
          // 更新服务器状态
          const index = this.servers.findIndex(s => s._id === server._id);
          if (index !== -1 && this.servers[index].status !== 'online') {
            this.$set(this.servers[index], 'status', 'online');
            this.$set(this.servers[index], 'lastChecked', Date.now());
            this.$delete(this.errorReasons, server._id);
          }
          
          return 'online';
        }
        
        // 如果日志未能确认状态，通过API再次确认
        const response = await this.checkStatus(server._id);
        const actualStatus = response.data.data.status;
        const backendConnected = response.data.data.backendConnected || false;
        
        // 如果API返回连接正常，使用正常状态
        if (actualStatus === 'online' || backendConnected) {
          // 更新服务器状态
          const index = this.servers.findIndex(s => s._id === server._id);
          if (index !== -1 && this.servers[index].status !== 'online') {
            this.$set(this.servers[index], 'status', 'online');
            this.$set(this.servers[index], 'lastChecked', Date.now());
            this.$delete(this.errorReasons, server._id);
          }
          
          return 'online';
        }
        
        // 如果API显示非在线状态，更新本地状态
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1 && this.servers[index].status !== actualStatus) {
          this.$set(this.servers[index], 'status', actualStatus);
          this.$message.warning(`服务器${server.name}状态已更新为${this.statusText[actualStatus]}`);
        }
        
        return actualStatus;
      } catch (error) {
        console.error('验证服务器状态失败:', error);
        return 'error';
      } finally {
        this.$set(this.checkingServers, server._id, false);
      }
    },
    async handleConnect(server) {
      try {
        // 设置连接中状态
        this.$set(this.connectingServers, server._id, true);
        
        // 先更新本地状态为"连接中"
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', 'connecting');
        }
        
        // 显示连接进度通知
        const connectNotification = this.$notify({
          title: '连接中',
          message: `正在连接到服务器 ${server.name}...`,
          duration: 0,
          type: 'info'
        });
        
        // 执行连接操作
        const connectResult = await this.connectServer(server._id);
        console.log('连接操作结果:', connectResult);
        
        // 清除通知
        connectNotification.close();
        
        // 检查连接结果，从返回中获取状态信息
        const serverStatus = connectResult?.serverStatus || 'unknown';
        
        if (serverStatus === 'online') {
          // 直接从API返回更新状态，避免额外请求
          if (index !== -1) {
            this.$set(this.servers[index], 'status', 'online');
            this.$set(this.servers[index], 'lastChecked', Date.now());
            this.$set(this.servers[index], 'statusChanged', true);
            this.$delete(this.errorReasons, server._id);
            
            // 2秒后移除高亮效果
            setTimeout(() => {
              this.$set(this.servers[index], 'statusChanged', false);
            }, 2000);
          }
          
          this.$message.success('服务器连接成功');
          
          // 启动心跳检测
          this.startHeartbeat(server);
        } else {
          // 状态不明确，进行二次检查
          console.log('连接状态不明确，进行二次检查...');
          
          // 延迟1秒，确保后端状态已更新
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 获取最新状态
          try {
            const statusResponse = await this.checkStatus(server._id);
            console.log('状态检查结果:', statusResponse);
            
            const actualStatus = statusResponse?.data?.data?.status || 'error';
            const backendConnected = statusResponse?.data?.data?.backendConnected || false;
            
            if (actualStatus === 'online' || backendConnected) {
              // 服务器已连接，更新UI
              if (index !== -1) {
                this.$set(this.servers[index], 'status', 'online');
                this.$set(this.servers[index], 'lastChecked', Date.now());
                this.$set(this.servers[index], 'statusChanged', true);
                this.$delete(this.errorReasons, server._id);
                
                // 2秒后移除高亮效果
                setTimeout(() => {
                  this.$set(this.servers[index], 'statusChanged', false);
                }, 2000);
              }
              
              this.$message.success('服务器连接成功');
              
              // 启动心跳检测
              this.startHeartbeat(server);
            } else {
              // 连接存在问题
              this.$message.error('服务器连接可能存在问题，请检查服务器状态');
              
              // 查看后端日志确定问题
              try {
                const logsResponse = await this.getServerLogs(server._id);
                console.log('服务器日志:', logsResponse);
                
                const logs = logsResponse?.data?.data || '';
                const connectionStatus = logsResponse?.data?.connectionStatus || {};
                
                // 判断连接状态
                if (logs.includes('服务器已连接且连接有效') || connectionStatus.connectionValid) {
                  // 实际已连接，前后端状态不一致
                  if (index !== -1) {
                    this.$set(this.servers[index], 'status', 'online');
                    this.$set(this.servers[index], 'lastChecked', Date.now());
                    this.$set(this.servers[index], 'statusChanged', true);
                    this.$delete(this.errorReasons, server._id);
                  }
                  
                  this.$message.success('服务器实际已连接成功，已修复状态显示');
                  
                  // 启动心跳检测
                  this.startHeartbeat(server);
                } else {
                  // 确实连接失败
                  if (index !== -1) {
                    this.$set(this.servers[index], 'status', 'error');
                    this.$set(this.errorReasons, server._id, '连接失败，请查看服务器日志');
                  }
                }
              } catch (logError) {
                console.error('获取服务器日志失败:', logError);
                
                // 无法获取日志，保守处理为错误
                if (index !== -1) {
                  this.$set(this.servers[index], 'status', 'error');
                  this.$set(this.errorReasons, server._id, '连接状态确认失败');
                }
              }
            }
          } catch (statusError) {
            console.error('获取状态失败:', statusError);
            
            // 无法获取状态，保守处理为错误
            if (index !== -1) {
              this.$set(this.servers[index], 'status', 'error');
              this.$set(this.errorReasons, server._id, '连接后状态确认失败');
            }
          }
        }
      } catch (error) {
        // 解析并记录错误原因
        const errorMsg = this.parseErrorMessage(error);
        this.$set(this.errorReasons, server._id, errorMsg);
        
        this.$message.error('连接服务器失败: ' + errorMsg);
        
        // 如果失败，更新状态为错误
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', 'error');
          this.$set(this.servers[index], 'lastChecked', Date.now());
        }
      } finally {
        this.$set(this.connectingServers, server._id, false);
        this.saveStatesToCache();
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
        
        // 停止心跳检测
        this.stopHeartbeat(server._id);
        
        // 显示断开连接进度通知
        const disconnectNotification = this.$notify({
          title: '断开连接中',
          message: `正在断开服务器 ${server.name} 的连接...`,
          duration: 0,
          type: 'warning'
        });
        
        // 执行断开操作
        await this.disconnectServer(server._id);
        disconnectNotification.close();
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
        this.saveStatesToCache();
      }
    },
    async handleManageRules(server) {
      // 首先检查UI状态，如果已经是在线状态直接跳转
      if (server.status === 'online') {
        this.$router.push({ name: 'rules', params: { serverId: server._id } });
        return;
      }
      
      // 连接前预检，确保服务器实际在线状态
      try {
        // 显示检查状态的加载提示
        this.$set(this.checkingServers, server._id, true);
        
        // 1. 先检查服务器日志，看实际连接状态
        let isActuallyConnected = false;
        try {
          const logResponse = await this.getServerLogs(server._id);
          if (logResponse && logResponse.data) {
            const logs = logResponse.data;
            
            // 通过日志判断实际连接状态
            if (logs.includes('SSH连接建立成功') || 
                logs.includes('服务器已连接且连接有效') ||
                logs.includes('连接套接字正常')) {
              
              console.log('管理规则前检查：日志显示服务器实际已连接');
              isActuallyConnected = true;
              
              // 自动修复状态不一致
              const index = this.servers.findIndex(s => s._id === server._id);
              if (index !== -1 && this.servers[index].status !== 'online') {
                this.$set(this.servers[index], 'status', 'online');
                this.$set(this.servers[index], 'lastChecked', Date.now());
                this.$delete(this.errorReasons, server._id);
                
                // 显示已自动修复状态的提示
                this.$message.info(`服务器 ${server.name} 实际已连接，状态已修复`);
                
                // 延迟跳转，给用户一点时间看到状态修复提示
                setTimeout(() => {
                  this.$router.push({ name: 'rules', params: { serverId: server._id } });
                }, 500);
                return;
              }
            }
          }
        } catch (error) {
          console.error('管理规则前获取日志失败:', error);
        }
        
        // 如果日志显示已连接，直接前往规则管理
        if (isActuallyConnected) {
          this.$router.push({ name: 'rules', params: { serverId: server._id } });
          return;
        }
        
        // 2. 再通过API检查当前状态
        const statusResponse = await this.checkStatus(server._id);
        const actualStatus = statusResponse?.data?.data?.status || 'error';
        const backendConnected = statusResponse?.data?.data?.backendConnected || false;
        
        // 如果API返回连接正常，更新状态并跳转
        if (actualStatus === 'online' || backendConnected) {
          // 更新服务器状态
          const index = this.servers.findIndex(s => s._id === server._id);
          if (index !== -1) {
            this.$set(this.servers[index], 'status', 'online');
            this.$set(this.servers[index], 'lastChecked', Date.now());
          }
          
          // 直接跳转到规则管理
          this.$router.push({ name: 'rules', params: { serverId: server._id } });
          return;
        }
        
        // 如果确实未连接，询问用户是否连接
        const errorReason = this.errorReasons[server._id] || '服务器当前不在线';
        
        this.$confirm(`${errorReason}，需要先连接服务器吗?`, '提示', {
          confirmButtonText: '连接并管理',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          this.handleConnect(server).then(() => {
            // 连接成功后跳转
            this.$router.push({ name: 'rules', params: { serverId: server._id } });
          });
        }).catch(() => {});
      } catch (error) {
        console.error('检查服务器状态失败:', error);
        
        // 出错时显示连接提示
        this.$confirm(`无法确认服务器状态，是否尝试连接后再管理?`, '提示', {
          confirmButtonText: '连接并管理',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          this.handleConnect(server).then(() => {
            this.$router.push({ name: 'rules', params: { serverId: server._id } });
          });
        }).catch(() => {});
      } finally {
        this.$set(this.checkingServers, server._id, false);
      }
    },
    async checkServerStatus(server) {
      try {
        this.$set(this.checkingServers, server._id, true);
        const response = await this.checkStatus(server._id);
        // 更新当前服务器状态
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          this.$set(this.servers[index], 'status', response.data.data.status);
          this.$set(this.servers[index], 'lastChecked', Date.now());
        }
        // 保存状态到本地
        this.saveStatesToCache();
      } catch (error) {
        console.error('检查服务器状态失败:', error);
      } finally {
        this.$set(this.checkingServers, server._id, false);
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
    },
    // 批量连接离线服务器
    async batchConnect() {
      const offlineServers = this.servers.filter(server => server.status === 'offline' || server.status === 'error');
      if (offlineServers.length === 0) return;
      
      try {
        await this.$confirm(`确定要连接全部${offlineServers.length}台离线服务器吗?`, '批量连接', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'info'
        });
        
        for (const server of offlineServers) {
          await this.handleConnect(server);
        }
        
        this.$message.success('批量连接操作已完成');
      } catch (error) {
        if (error !== 'cancel') {
          this.$message.error('批量连接失败: ' + error.message);
        }
      }
    },
    // 批量断开在线服务器
    async batchDisconnect() {
      const onlineServers = this.servers.filter(server => server.status === 'online');
      if (onlineServers.length === 0) return;
      
      try {
        await this.$confirm(`确定要断开全部${onlineServers.length}台在线服务器吗?`, '批量断开', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        for (const server of onlineServers) {
          await this.handleDisconnect(server);
        }
        
        this.$message.success('批量断开操作已完成');
      } catch (error) {
        if (error !== 'cancel') {
          this.$message.error('批量断开失败: ' + error.message);
        }
      }
    },
    // 启动心跳检测
    startHeartbeat(server) {
      if (this.heartbeatIntervals[server._id]) {
        clearInterval(this.heartbeatIntervals[server._id]);
      }
      
      // 初始状态检查 - 确保开始心跳前服务器已经正确连接
      setTimeout(async () => {
        try {
          // 先验证一次服务器状态
          const statusResult = await this.checkStatus(server._id);
          if (statusResult && statusResult.data && statusResult.data.status === 'error') {
            // 如果状态是错误，但有日志显示连接实际有效
            if (statusResult.logs && 
               (statusResult.logs.includes('连接套接字正常') || 
                statusResult.logs.includes('SSH连接已就绪') || 
                statusResult.logs.includes('SSH连接建立成功'))) {
              console.log('心跳初始检查：连接实际有效，修复状态');
              const index = this.servers.findIndex(s => s._id === server._id);
              if (index !== -1) {
                this.$set(this.servers[index], 'status', 'online');
              }
            }
          }
        } catch (error) {
          console.error('初始心跳检查失败:', error);
        }
      }, 2000);
      
      // 每10秒发送一次心跳
      this.heartbeatIntervals[server._id] = setInterval(async () => {
        if (!server || server.status !== 'online') {
          this.stopHeartbeat(server._id);
          return;
        }
        
        try {
          const response = await this.sendHeartbeat(server._id);
          if (response && response.data && response.data.status === 'success') {
            // 心跳正常，重置错误计数
            if (this.reconnectCounters[server._id]) {
              this.reconnectCounters[server._id] = 0;
            }
          } else {
            // 心跳异常，可能是服务器重启
            await this.handleHeartbeatFailure(server);
          }
        } catch (error) {
          // 心跳发送失败，但尝试验证连接是否仍然有效
          try {
            const statusResponse = await this.checkStatus(server._id);
            // 如果状态检查返回在线或连接有效，则不标记为失败
            if (statusResponse && statusResponse.data && 
                (statusResponse.data.status === 'online' || 
                 statusResponse.data.backendConnected)) {
              console.log('心跳失败但状态检查显示连接有效，跳过失败处理');
              return;
            }
          } catch (checkError) {
            console.error('心跳失败后状态检查失败:', checkError);
          }
          
          // 状态检查也失败，处理心跳失败
          await this.handleHeartbeatFailure(server);
        }
      }, 10000);
    },
    
    // 停止心跳检测
    stopHeartbeat(serverId) {
      if (this.heartbeatIntervals[serverId]) {
        clearInterval(this.heartbeatIntervals[serverId]);
        delete this.heartbeatIntervals[serverId];
      }
    },
    
    // 处理心跳失败
    async handleHeartbeatFailure(server) {
      const index = this.servers.findIndex(s => s._id === server._id);
      if (index === -1) return;
      
      // 获取服务器日志检查真实连接状态
      try {
        const logResponse = await this.getServerLogs(server._id);
        
        // 如果日志表明连接实际是有效的，则不改变状态
        if (logResponse && logResponse.data) {
          const logs = logResponse.data;
          
          if (logs.includes('SSH连接建立成功') || 
              logs.includes('服务器已连接且连接有效') ||
              logs.includes('连接套接字正常')) {
                
            console.log('日志显示连接实际有效，保持在线状态');
            
            // 如果当前状态不是在线，则更新为在线
            if (this.servers[index].status !== 'online') {
              this.$set(this.servers[index], 'status', 'online');
              this.$set(this.servers[index], 'lastChecked', Date.now());
              this.$delete(this.errorReasons, server._id);
              
              // 显示状态修复通知
              this.$message.info(`服务器 ${server.name} 状态已自动修复为在线`);
            }
            
            // 心跳失败但连接有效，可能是临时网络抖动，不进行处理
            return;
          }
        }
      } catch (error) {
        console.error('获取服务器日志失败:', error);
      }
      
      // 如果无法确认实际状态或确实无效，则执行原有逻辑
      if (this.servers[index].status === 'online') {
        // 更新服务器状态为错误
        this.$set(this.servers[index], 'status', 'error');
        this.$set(this.errorReasons, server._id, '心跳检测失败，可能是服务器重启或网络问题');
        
        // 提示用户
        const errorMsg = `服务器 ${server.name} 连接异常，心跳检测失败`;
        this.$notify({
          title: '连接异常',
          message: errorMsg,
          type: 'error',
          duration: 0,
          onClick: () => {
            this.showReconnectDialog(server);
          }
        });
        
        // 记录重试次数
        if (!this.reconnectCounters[server._id]) {
          this.reconnectCounters[server._id] = 0;
        }
        
        // 如果是第一次检测到错误，询问是否自动重连
        if (this.reconnectCounters[server._id] === 0) {
          this.showReconnectDialog(server);
        }
        
        this.reconnectCounters[server._id]++;
      }
      
      // 验证实际状态
      await this.verifyServerStatus(server);
    },
    
    // 显示重连对话框
    showReconnectDialog(server) {
      this.$confirm(`服务器 ${server.name} 连接异常，可能是服务器已重启或网络问题。是否尝试重新连接？`, '连接异常', {
        confirmButtonText: '重新连接',
        cancelButtonText: '忽略',
        type: 'warning',
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: false
      }).then(() => {
        // 用户选择重连
        this.handleReconnect(server);
      }).catch(() => {
        // 用户选择忽略
        this.$message({
          type: 'info',
          message: `已忽略服务器 ${server.name} 的连接异常`
        });
      });
    },
    
    // 处理重连
    async handleReconnect(server) {
      try {
        // 先尝试断开当前可能存在的连接
        try {
          await this.disconnectServer(server._id);
        } catch (error) {
          console.log('断开连接失败，可能已断开:', error);
        }
        
        // 短暂延迟后重新连接
        setTimeout(async () => {
          try {
            // 先更新本地状态为"连接中"
            const index = this.servers.findIndex(s => s._id === server._id);
            if (index !== -1) {
              this.$set(this.servers[index], 'status', 'connecting');
            }
            
            // 清除错误原因
            this.$set(this.errorReasons, server._id, null);
            
            // 设置连接中状态
            this.$set(this.connectingServers, server._id, true);
            
            // 执行连接操作
            await this.connectServer(server._id);
            this.$message.success(`服务器 ${server.name} 重新连接成功`);
            
            // 更新状态
            await this.fetchServers();
            
            // 重新启动心跳
            const updatedServer = this.servers.find(s => s._id === server._id);
            if (updatedServer && updatedServer.status === 'online') {
              this.startHeartbeat(updatedServer);
            }
          } catch (error) {
            this.$message.error(`重新连接失败: ${error.message}`);
            
            // 记录错误原因
            const errorMsg = this.parseErrorMessage(error);
            this.$set(this.errorReasons, server._id, errorMsg);
            
            // 更新服务器状态
            const index = this.servers.findIndex(s => s._id === server._id);
            if (index !== -1) {
              this.$set(this.servers[index], 'status', 'error');
            }
          } finally {
            this.$set(this.connectingServers, server._id, false);
          }
        }, 1000);
      } catch (error) {
        this.$message.error(`重连操作失败: ${error.message}`);
      }
    },
    
    // 显示超时帮助对话框
    showTimeoutHelpDialog(server) {
      this.$alert(`
        <strong>连接超时可能的原因：</strong>
        <ul>
          <li>网络连接问题或防火墙限制</li>
          <li>服务器SSH服务未启动或端口未开放</li>
          <li>主机地址或端口号填写错误</li>
          <li>服务器负载过高，响应缓慢</li>
        </ul>
        <strong>建议解决方案：</strong>
        <ul>
          <li>检查网络连接和防火墙设置</li>
          <li>确认SSH服务运行状态和端口开放情况</li>
          <li>验证服务器地址、端口和凭据信息</li>
          <li>可尝试增加连接超时时间</li>
        </ul>
        <p>您也可以检查服务器日志获取更多信息。</p>
      `, '连接超时帮助', {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '我知道了',
        callback: () => {}
      });
    },
    
    // 解析错误信息
    parseErrorMessage(error) {
      let errorMsg = '未知错误';
      
      if (typeof error === 'string') {
        errorMsg = error;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      // 分析错误信息并提供恢复建议
      if (errorMsg.includes('timeout') || errorMsg.includes('超时') || errorMsg.includes('timed out')) {
        return '连接超时，请检查网络或服务器SSH服务状态';
      } else if (errorMsg.includes('refused') || errorMsg.includes('拒绝')) {
        return '连接被拒绝，请检查服务器是否启动或端口是否正确';
      } else if (errorMsg.includes('authentication') || errorMsg.includes('认证')) {
        return '认证失败，请检查用户名和密码';
      } else if (errorMsg.includes('not found') || errorMsg.includes('找不到')) {
        return '找不到服务器，请检查主机地址是否正确';
      } else if (errorMsg.includes('handshake')) {
        return 'SSH握手失败，可能是网络问题或SSH服务配置错误';
      } else if (errorMsg.includes('took too long')) {
        return '连接操作耗时过长，已自动中断';
      }
      
      return `连接错误: ${errorMsg}`;
    },
    // 获取离线服务器数量
    getOfflineCount() {
      return this.servers.filter(server => server.status === 'offline' || server.status === 'error').length;
    },
    
    // 获取在线服务器数量
    getOnlineCount() {
      return this.servers.filter(server => server.status === 'online').length;
    },
    
    // 格式化时间为友好格式
    formatTime(timestamp) {
      if (!timestamp) return '';
      
      const now = new Date();
      const time = new Date(timestamp);
      const diff = Math.floor((now - time) / 1000); // 秒数差
      
      if (diff < 60) {
        return '刚刚';
      } else if (diff < 3600) {
        return `${Math.floor(diff / 60)}分钟前`;
      } else if (diff < 86400) {
        return `${Math.floor(diff / 3600)}小时前`;
      } else {
        return `${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}`;
      }
    },
    // 在连接按钮旁提供刷新重试功能
    async handleConnectionRetry(server) {
      try {
        // 防止重复触发
        if (this.isRetrying) return;
        this.isRetrying = true;
        
        // 尝试从后端再次确认连接状态
        this.$message.info(`正在重新获取服务器 ${server.name} 的连接状态...`);
        
        const actualStatus = await this.forceCheckServerStatus(server);
        
        // 根据实际状态建议后续操作
        if (actualStatus === 'online') {
          this.$message.success(`服务器 ${server.name} 实际上已经连接成功！界面已更新。`);
        } else if (actualStatus === 'offline') {
          this.$confirm(`服务器 ${server.name} 未连接，是否尝试重新连接？`, '连接确认', {
            confirmButtonText: '重新连接',
            cancelButtonText: '取消',
            type: 'info'
          }).then(() => {
            this.handleConnect(server);
          }).catch(() => {});
        } else {
          // 检查后台日志，是否有连接成功但状态未更新的情况
          this.checkServerLogs(server);
        }
      } catch (error) {
        this.$message.error(`重试失败: ${error.message}`);
      } finally {
        // 重置标志位
        setTimeout(() => {
          this.isRetrying = false;
        }, 1000);
      }
    },
    
    // 强制检查服务器状态并确保UI更新
    async forceCheckServerStatus(server) {
      try {
        this.$set(this.checkingServers, server._id, true);
        
        // 增加延迟，确保后端状态已更新
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 先获取日志信息以判断实际连接状态
        let logBasedStatus = null;
        try {
          const logResponse = await this.getServerLogs(server._id);
          if (logResponse && logResponse.data) {
            const logs = logResponse.data;
            
            if (logs.includes('SSH连接建立成功') || 
                logs.includes('服务器已连接且连接有效') ||
                logs.includes('连接套接字正常')) {
              logBasedStatus = 'online';
              console.log('日志显示连接实际有效');
            }
          }
        } catch (error) {
          console.error('获取服务器日志失败:', error);
        }
        
        // 如果日志已确认连接有效，直接使用
        if (logBasedStatus === 'online') {
          const index = this.servers.findIndex(s => s._id === server._id);
          if (index !== -1) {
            const oldStatus = this.servers[index].status;
            this.$set(this.servers[index], 'status', 'online');
            this.$set(this.servers[index], 'lastChecked', Date.now());
            
            if (oldStatus !== 'online') {
              this.$set(this.servers[index], 'statusChanged', true);
              this.$delete(this.errorReasons, server._id);
              
              // 启动心跳检测
              this.startHeartbeat(this.servers[index]);
              
              // 2秒后移除高亮效果
              setTimeout(() => {
                this.$set(this.servers[index], 'statusChanged', false);
              }, 2000);
              
              this.$message.success(`服务器 ${server.name} 实际连接正常，状态已更新为在线`);
            }
            
            this.saveStatesToCache();
            return 'online';
          }
        }
        
        // 至少尝试3次检查，确保获取到最新状态
        let actualStatus = 'error';
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const response = await this.checkStatus(server._id);
            if (response && response.data && response.data.data) {
              actualStatus = response.data.data.status;
              
              // 如果状态是error，但后端日志表明连接可能实际成功
              // 此时尝试强制修正状态
              if (actualStatus === 'error' && 
                 (response.data.data.backendConnected || logBasedStatus === 'online')) {
                console.log('后端连接实际有效，强制更新状态为在线');
                actualStatus = 'online';
                break;
              }
              
              // 如果已经确认是在线状态，立即跳出循环
              if (actualStatus === 'online') {
                break;
              }
            }
          } catch (error) {
            console.error(`状态检查重试 ${retryCount + 1}/${maxRetries} 失败:`, error);
          }
          
          retryCount++;
          if (retryCount < maxRetries) {
            // 在重试之间等待
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // 更新服务器状态
        const index = this.servers.findIndex(s => s._id === server._id);
        if (index !== -1) {
          const oldStatus = this.servers[index].status;
          this.$set(this.servers[index], 'status', actualStatus);
          this.$set(this.servers[index], 'lastChecked', Date.now());
          
          // 如果状态发生变化，添加高亮效果
          if (oldStatus !== actualStatus) {
            this.$set(this.servers[index], 'statusChanged', true);
            
            // 如果连接失败，更新错误原因
            if (actualStatus === 'error') {
              this.$set(this.errorReasons, server._id, '连接状态检查显示连接失败，请检查服务器日志');
            } else if (actualStatus === 'online') {
              // 如果为在线状态，清除错误
              this.$delete(this.errorReasons, server._id);
              
              // 启动心跳检测
              this.startHeartbeat(this.servers[index]);
            }
            
            // 2秒后移除高亮效果
            setTimeout(() => {
              this.$set(this.servers[index], 'statusChanged', false);
            }, 2000);
          }
          
          // 显示状态更新通知
          if (actualStatus === 'online') {
            this.$message.success(`服务器 ${server.name} 已成功连接`);
          } else if (actualStatus === 'error') {
            this.$message.error(`服务器 ${server.name} 连接存在问题，状态检查显示错误`);
          } else {
            this.$message.info(`服务器 ${server.name} 当前状态: ${this.statusText[actualStatus]}`);
          }
        }
        
        // 保存状态到本地缓存
        this.saveStatesToCache();
        
        return actualStatus;
      } catch (error) {
        console.error('强制检查服务器状态失败:', error);
        return 'error';
      } finally {
        this.$set(this.checkingServers, server._id, false);
      }
    },
    
    // 检查服务器后台日志，判断连接状态
    async checkServerLogs(server) {
      try {
        const logResponse = await this.getServerLogs(server._id);
        
        // 分析日志判断连接实际状态
        if (logResponse && logResponse.data) {
          const logs = logResponse.data;
          
          if (logs.includes('SSH连接建立成功') || 
              logs.includes('服务器已连接且连接有效')) {
            // 日志表明连接实际成功，但UI状态不一致
            this.$alert(`
              <p>检测到状态不一致:</p>
              <p>界面显示: <strong>错误</strong></p>
              <p>后台日志: <strong>连接成功</strong></p>
              <p>这通常是因为状态更新未正确同步。</p>
            `, '连接状态异常', {
              dangerouslyUseHTMLString: true,
              confirmButtonText: '立即修复',
              callback: () => {
                // 强制更新状态为在线
                const index = this.servers.findIndex(s => s._id === server._id);
                if (index !== -1) {
                  this.$set(this.servers[index], 'status', 'online');
                  this.$set(this.servers[index], 'lastChecked', Date.now());
                  this.$delete(this.errorReasons, server._id);
                  
                  // 启动心跳检测
                  this.startHeartbeat(this.servers[index]);
                  
                  this.$message.success('状态已修复为在线');
                  this.saveStatesToCache();
                }
              }
            });
          } else if (logs.includes('连接失败') || logs.includes('连接错误')) {
            // 确实是连接失败
            this.$confirm(`服务器连接确实失败，日志显示连接错误。是否尝试重新连接？`, '连接确认', {
              confirmButtonText: '重新连接',
              cancelButtonText: '取消',
              type: 'warning'
            }).then(() => {
              this.handleConnect(server);
            }).catch(() => {});
          } else {
            // 日志中无法确定状态
            this.$confirm(`无法从日志确定连接状态。是否尝试重新连接？`, '连接确认', {
              confirmButtonText: '重新连接',
              cancelButtonText: '取消',
              type: 'info',
              closeOnClickModal: true
            }).then(() => {
              this.handleConnect(server);
            }).catch(() => {});
          }
        } else {
          // 无法获取日志
          this.$confirm(`无法获取服务器日志。是否尝试重新连接？`, '连接确认', {
            confirmButtonText: '重新连接',
            cancelButtonText: '取消',
            type: 'info'
          }).then(() => {
            this.handleConnect(server);
          }).catch(() => {});
        }
      } catch (error) {
        console.error('获取服务器日志失败:', error);
        this.$message.error('获取服务器日志失败: ' + error.message);
      }
    },
    // 自动修复状态不一致问题
    async autoFixInconsistentStatus() {
      console.log('开始检查并自动修复状态不一致问题...');
      
      // 错误状态服务器优先检查
      const errorServers = this.servers.filter(s => s.status === 'error');
      for (const server of errorServers) {
        try {
          console.log(`检查错误状态服务器: ${server.name}`);
          
          // 获取服务器日志
          const logResponse = await this.getServerLogs(server._id);
          
          if (logResponse && logResponse.data) {
            const logs = logResponse.data;
            
            // 检查是否有连接实际成功的日志
            if (logs.includes('SSH连接建立成功') || 
                logs.includes('服务器已连接且连接有效') ||
                logs.includes('连接套接字正常')) {
              
              console.log(`服务器 ${server.name} 状态显示错误，但日志表明连接有效，自动修复`);
              
              // 更新状态为在线
              const index = this.servers.findIndex(s => s._id === server._id);
              if (index !== -1) {
                this.$set(this.servers[index], 'status', 'online');
                this.$set(this.servers[index], 'lastChecked', Date.now());
                this.$delete(this.errorReasons, server._id);
                
                // 启动心跳检测
                this.startHeartbeat(this.servers[index]);
                
                // 显示通知
                this.$message.success(`已自动修复服务器 ${server.name} 的状态为在线`);
              }
            }
          }
        } catch (error) {
          console.error(`自动修复 ${server.name} 状态失败:`, error);
        }
      }
      
      // 检查状态为离线但实际在线的服务器
      const offlineServers = this.servers.filter(s => s.status === 'offline');
      for (const server of offlineServers) {
        try {
          console.log(`检查离线状态服务器: ${server.name}`);
          
          // 检查实际状态
          const statusResponse = await this.checkStatus(server._id);
          
          if (statusResponse && statusResponse.data && 
              (statusResponse.data.status === 'online' || 
               statusResponse.data.backendConnected)) {
            
            console.log(`服务器 ${server.name} 状态显示离线，但实际连接有效，自动修复`);
            
            // 更新状态为在线
            const index = this.servers.findIndex(s => s._id === server._id);
            if (index !== -1) {
              this.$set(this.servers[index], 'status', 'online');
              this.$set(this.servers[index], 'lastChecked', Date.now());
              
              // 启动心跳检测
              this.startHeartbeat(this.servers[index]);
              
              // 显示通知
              this.$message.success(`已自动修复服务器 ${server.name} 的状态为在线`);
            }
          }
        } catch (error) {
          console.error(`检查 ${server.name} 实际状态失败:`, error);
        }
      }
      
      // 保存修复后的状态
      this.saveStatesToCache();
    },
    // 检测是否为移动设备
    checkMobileDevice() {
      this.isMobile = window.innerWidth < 768; // 假设小于768px为移动设备
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
.empty-state {
  margin: 40px 0;
  text-align: center;
}
.batch-actions {
  margin-top: 20px;
}
.status-container {
  display: flex;
  align-items: center;
}
.refresh-button {
  margin-left: 8px;
}
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.batch-buttons {
  display: flex;
  gap: 10px;
}
.status-time {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
.count-badge {
  font-size: 12px;
  margin-left: 3px;
}
@keyframes highlight-row {
  0% { background-color: transparent; }
  50% { background-color: rgba(255, 230, 0, 0.2); }
  100% { background-color: transparent; }
}
:deep(.el-table__row.status-changed) {
  animation: highlight-row 2s ease;
}
.sync-warning {
  margin-top: 5px;
  text-align: center;
}

/* 对话框底部按钮样式 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

.mobile-footer {
  flex-direction: column;
  gap: 10px;
}

.mobile-footer .el-button {
  margin-left: 0 !important;
  margin-top: 5px;
}

/* 移动端服务器卡片样式 */
.mobile-server-cards {
  margin: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.mobile-server-card {
  width: 100%;
  margin-bottom: 10px;
}

.mobile-card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.server-name {
  font-weight: bold;
  flex: 1;
}

.server-info {
  margin: 10px 0;
}

.server-info p {
  margin: 5px 0;
  line-height: 1.5;
}

.mobile-operation-buttons {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
}

.mobile-error-reason {
  margin: 10px 0;
  padding: 8px;
  background-color: #fef0f0;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 12px;
}

/* 批量操作样式 */
.batch-buttons {
  display: flex;
  gap: 10px;
}

.batch-button {
  display: flex;
  align-items: center;
}

.count-badge {
  font-size: 12px;
  margin-left: 5px;
  background-color: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 10px;
  display: inline-block;
}

/* 移动端批量操作样式 */
.mobile-batch-buttons {
  flex-direction: column;
  gap: 0;
}

.mobile-batch-buttons .el-button {
  margin-bottom: 10px !important;
  margin-left: 0 !important;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 15px;
  border-radius: 4px;
  height: auto;
  line-height: 1.5;
}

.mobile-batch-buttons .el-button:last-child {
  margin-bottom: 0 !important;
}

.mobile-batch-buttons .button-text {
  flex: 1;
  text-align: center;
  font-size: 14px;
}

.mobile-batch-buttons .el-button [class^="el-icon-"] {
  margin-right: 10px;
  font-size: 16px;
}

/* 移动端适配样式 */
@media screen and (max-width: 768px) {
  .servers-container {
    padding: 10px;
  }
  
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .page-header h1 {
    margin-bottom: 10px;
  }
  
  .operation-buttons {
    flex-direction: column;
    width: 100%;
  }
  
  .batch-actions {
    margin-top: 15px;
    margin-bottom: 15px;
  }
  
  /* 弹窗内部样式优化 */
  :deep(.server-dialog .el-dialog__body) {
    padding: 15px 10px;
  }
  
  :deep(.server-dialog .el-form-item) {
    margin-bottom: 15px;
  }
  
  :deep(.server-dialog .dialog-footer) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  :deep(.server-dialog .el-button) {
    width: 100%;
    margin-left: 0 !important;
    margin-top: 5px;
  }
}

/* 极小屏幕优化 */
@media screen and (max-width: 375px) {
  .mobile-operation-buttons {
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .mobile-operation-buttons .el-button {
    margin: 4px;
  }
  
  .mobile-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .mobile-card-header .el-tag {
    margin-top: 5px;
  }
}
</style> 