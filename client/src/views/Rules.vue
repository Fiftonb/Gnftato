<template>
  <div class="rules-container">
    <div class="page-header">
      <h1>防火墙规则管理</h1>
      <div>
        <el-button type="primary" @click="$router.push('/servers')">返回服务器列表</el-button>
        <el-button v-if="isServerOnline && !scriptExists" type="success" @click="deployScript"
          :loading="deploying">部署脚本</el-button>
        <el-button v-if="isServerOnline && scriptExists" type="danger" @click="confirmClearRules">清空所有规则</el-button>
        <el-button v-if="!isServerOnline && server" type="warning" @click="tryConnectServer"
          :loading="connecting">连接服务器</el-button>
      </div>
    </div>

    <div v-if="server" class="server-info">
      <h2>{{ server.name }} <el-tag :type="server.status === 'online' ? 'success' : 'danger'">{{ server.status ===
        'online' ? '在线' : '离线' }}</el-tag></h2>
      <p>{{ server.host }}:{{ server.port }} ({{ server.username }})</p>
    </div>

    <!-- 添加脚本部署状态检测区域 -->
    <div v-if="!scriptCheckLoading && !scriptExists && isServerOnline" class="script-deploy-needed">
      <el-alert title="脚本未部署" type="warning" description="检测到服务器上没有部署Nftato脚本，需要先部署脚本才能使用防火墙功能" show-icon
        :closable="false" style="margin-bottom: 15px;">
      </el-alert>

      <div class="deploy-container">
        <div class="deploy-intro">
          <i class="el-icon-warning"></i>
          <h3>需要部署Nftato脚本</h3>
          <p>Nftato脚本是防火墙规则管理的核心组件，使用此脚本可以更方便地管理nftables规则。</p>
          <p>点击"开始部署"按钮开始部署过程。</p>
        </div>

        <el-button type="success" size="large" @click="deployScript" :loading="deploying">
          <i class="el-icon-upload"></i> 开始部署
        </el-button>
      </div>
    </div>

    <!-- 脚本部署终端输出 -->
    <div v-if="deploying && deployLogs.length > 0" class="deploy-terminal">
      <div class="terminal-header">
        <span>脚本部署进度</span>
        <el-button v-if="deployComplete" size="mini" type="success" @click="deployLogs = []">关闭</el-button>
      </div>
      <div class="terminal-body" ref="terminalBody">
        <div v-for="(log, index) in deployLogs" :key="index"
          :class="{ 'log-line': true, 'error-line': log.type === 'error', 'success-line': log.type === 'success' }">
          <pre>{{ log.message }}</pre>
        </div>
        <div v-if="deploying && !deployComplete" class="terminal-cursor"></div>
      </div>
      <div class="terminal-footer" v-if="deployComplete">
        <el-button v-if="deploySuccess" type="success" @click="refreshAllData">部署成功，加载规则数据</el-button>
        <el-button v-else type="danger" @click="retryDeploy">部署失败，重试</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" type="card" v-if="scriptExists || !isServerOnline">
      <el-tab-pane label="入网控制" name="inbound">
        <template v-if="!isServerOnline">
          <el-alert title="服务器当前处于离线状态" type="warning" description="服务器离线时无法管理防火墙规则，请先连接服务器" show-icon :closable="false"
            style="margin-bottom: 15px;">
          </el-alert>

          <div class="server-offline">
            <i class="el-icon-connection"></i>
            <h3>服务器未连接</h3>
            <p>当前无法管理防火墙规则，请先连接服务器</p>
          </div>

          <div class="offline-actions">
            <el-button type="primary" @click="tryConnectServer" :loading="connecting"
              icon="el-icon-refresh">连接服务器</el-button>
            <el-button @click="$router.push('/servers')" icon="el-icon-back">返回服务器列表</el-button>
          </div>
        </template>

        <div v-else>
          <el-card>
            <div slot="header">
              <span>SSH端口状态</span>
              <el-button style="float: right; padding: 3px 0" type="text" @click="refreshSSHPort">刷新</el-button>
            </div>

            <pre v-if="sshPortStatus" class="output">{{ sshPortStatus }}</pre>
            <div v-else>加载中...</div>
          </el-card>

          <el-card style="margin-top: 20px;">
            <div slot="header">
              <span>入网端口管理</span>
              <el-button style="float: right; padding: 3px 0" type="text" @click="refreshInboundPorts"
                :loading="loadingPorts">刷新</el-button>
            </div>

            <el-table v-loading="loadingPorts" :data="formattedPorts" style="width: 100%">
              <el-table-column prop="port" label="端口" width="180"></el-table-column>
              <el-table-column prop="protocol" label="协议" width="100"></el-table-column>
              <el-table-column label="操作">
                <template slot-scope="scope">
                  <el-tooltip v-if="isSshPort(scope.row.port)" content="不能取消SSH端口放行，这可能导致无法连接服务器" placement="top">
                    <el-button type="danger" size="mini" disabled>取消放行</el-button>
                  </el-tooltip>
                  <el-button v-else type="danger" size="mini" @click="disallowPort(scope.row.port)"
                    :loading="loadingPorts" :disabled="!isServerOnline">取消放行</el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-divider></el-divider>

            <el-form :inline="true" @submit.native.prevent="allowPort">
              <el-form-item label="放行端口">
                <el-input v-model="portToAllow" placeholder="如: 80,443" :disabled="!isServerOnline"></el-input>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="allowPort" :loading="loadingPorts"
                  :disabled="!isServerOnline">添加</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card style="margin-top: 20px;">
            <div slot="header">
              <span>入网IP管理</span>
              <el-button style="float: right; padding: 3px 0" type="text" @click="refreshInboundIPs"
                :loading="loadingIPs">刷新</el-button>
            </div>

            <el-table v-loading="loadingIPs" :data="inboundIPs" style="width: 100%">
              <el-table-column prop="ip" label="IP地址" width="180"></el-table-column>
              <el-table-column label="操作">
                <template slot-scope="scope">
                  <el-button type="danger" size="mini" @click="disallowIP(scope.row.ip || scope.row)"
                    :loading="loadingIPs" :disabled="!isServerOnline">取消放行</el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-divider></el-divider>

            <el-form :inline="true" @submit.native.prevent="allowIP">
              <el-form-item label="放行IP">
                <el-input v-model="ipToAllow" placeholder="如: 192.168.1.1" :disabled="!isServerOnline"></el-input>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="allowIP" :loading="loadingIPs"
                  :disabled="!isServerOnline">添加</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="出网控制" name="outbound">
        <template v-if="!isServerOnline">
          <el-alert title="服务器当前处于离线状态" type="warning" description="服务器离线时无法管理防火墙规则，请先连接服务器" show-icon :closable="false"
            style="margin-bottom: 15px;">
          </el-alert>

          <div class="server-offline">
            <i class="el-icon-connection"></i>
            <h3>服务器未连接</h3>
            <p>当前无法管理防火墙规则，请先连接服务器</p>
          </div>

          <div class="offline-actions">
            <el-button type="primary" @click="tryConnectServer" :loading="connecting"
              icon="el-icon-refresh">连接服务器</el-button>
            <el-button @click="$router.push('/servers')" icon="el-icon-back">返回服务器列表</el-button>
          </div>
        </template>

        <div v-else>
          <el-card>
            <div slot="header">
              <span>当前封禁列表</span>
              <el-button style="float: right; padding: 3px 0" type="text" @click="refreshBlockList"
                :loading="loadingBlockList">刷新</el-button>
            </div>

            <pre v-if="blockList" class="output">{{ blockList }}</pre>
            <div v-else>加载中...</div>
          </el-card>

          <el-card style="margin-top: 20px;">
            <div slot="header">
              <span>封禁管理</span>
            </div>
            <el-button-group>
              <el-button type="primary" @click="blockSPAM" :loading="loading"
                :disabled="!isServerOnline">封禁SPAM</el-button>
            </el-button-group>

            <el-divider></el-divider>

            <el-form :inline="true" @submit.native.prevent="blockCustomPorts">
              <el-form-item label="自定义端口">
                <el-input v-model="customPorts" placeholder="如: 6881,6882-6889" :disabled="!isServerOnline"></el-input>
              </el-form-item>
              <el-form-item>
                <el-button type="warning" @click="blockCustomPorts" :loading="loading"
                  :disabled="!isServerOnline">封禁</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card style="margin-top: 20px;">
            <div slot="header">
              <span>解封管理</span>
            </div>
            <el-button-group>
              <el-button type="success" @click="unblockSPAM" :loading="loading"
                :disabled="!isServerOnline">解封SPAM</el-button>
            </el-button-group>

            <el-divider></el-divider>

            <el-form :inline="true" @submit.native.prevent="unblockCustomPorts">
              <el-form-item label="自定义端口">
                <el-input v-model="customUnblockPorts" placeholder="如: 6881,6882-6889"
                  :disabled="!isServerOnline"></el-input>
              </el-form-item>
              <el-form-item>
                <el-button type="success" @click="unblockCustomPorts" :loading="loading"
                  :disabled="!isServerOnline">解封</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="DDoS防御" name="ddos">
        <template v-if="!isServerOnline">
          <el-alert title="服务器当前处于离线状态" type="warning" description="服务器离线时无法管理DDoS防御，请先连接服务器" show-icon
            :closable="false" style="margin-bottom: 15px;">
          </el-alert>

          <div class="server-offline">
            <i class="el-icon-connection"></i>
            <h3>服务器未连接</h3>
            <p>当前无法管理DDoS防御，请先连接服务器</p>
          </div>

          <div class="offline-actions">
            <el-button type="primary" @click="tryConnectServer" :loading="connecting"
              icon="el-icon-refresh">连接服务器</el-button>
            <el-button @click="$router.push('/servers')" icon="el-icon-back">返回服务器列表</el-button>
          </div>
        </template>

        <div v-else>
          <el-card>
            <div slot="header">
              <span>当前防御状态</span>
              <el-button style="float: right; padding: 3px 0" type="text" @click="refreshDefenseStatus"
                :loading="loadingDefenseStatus">刷新</el-button>
            </div>

            <pre v-if="defenseStatus" class="output">{{ defenseStatus }}</pre>
            <div v-else>加载中...</div>
          </el-card>

          <el-card style="margin-top: 20px;">
            <div slot="header">
              <span>DDoS防御配置</span>
            </div>
            <el-button-group>
              <el-button type="primary" @click="setupDdosProtectionAction" :loading="loading"
                :disabled="!isServerOnline">配置DDoS防御规则</el-button>
              <el-button type="primary" @click="showIpListsDialog" :loading="loading"
                :disabled="!isServerOnline">管理IP黑白名单</el-button>
            </el-button-group>

            <el-divider></el-divider>

            <h4>自定义端口DDoS防御</h4>
            <el-form label-width="140px" @submit.native.prevent="setupCustomPortProtectionAction"
              :label-position="isMobile ? 'top' : 'right'" class="ddos-form">
              <el-form-item label="端口号">
                <el-input v-model="customDdosPort" placeholder="如: 8080" :disabled="!isServerOnline"
                  style="width: 100%"></el-input>
              </el-form-item>

              <el-form-item label="协议类型">
                <el-select v-model="customDdosProtoType" placeholder="请选择" :disabled="!isServerOnline"
                  style="width: 100%">
                  <el-option label="TCP" :value="1"></el-option>
                  <el-option label="UDP" :value="2"></el-option>
                  <el-option label="TCP+UDP" :value="3"></el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="每IP最大连接数">
                <el-input-number v-model="customDdosMaxConn" :min="100" :max="1000" :step="50"
                  :disabled="!isServerOnline" :style="isMobile ? 'width: 100%' : ''"></el-input-number>
              </el-form-item>

              <el-form-item label="每分钟最大新连接">
                <el-input-number v-model="customDdosMaxRateMin" :min="100" :max="1000" :step="50"
                  :disabled="!isServerOnline" :style="isMobile ? 'width: 100%' : ''"></el-input-number>
              </el-form-item>

              <el-form-item label="每秒最大新连接">
                <el-input-number v-model="customDdosMaxRateSec" :min="50" :max="500" :step="25"
                  :disabled="!isServerOnline" :style="isMobile ? 'width: 100%' : ''"></el-input-number>
              </el-form-item>

              <el-form-item label="违规IP封禁时长">
                <div class="ban-duration-container">
                  <el-input-number v-model="customDdosBanHours" :min="1" :max="72" :step="1" :disabled="!isServerOnline"
                    :style="isMobile ? 'width: 70%' : ''"></el-input-number>
                  <span class="form-item-tip" :style="isMobile ? 'margin-left: 10px;' : ''">小时</span>
                </div>
              </el-form-item>

              <el-form-item>
                <el-button type="primary" @click="setupCustomPortProtectionAction" :loading="loading"
                  :disabled="!isServerOnline" :class="{ 'full-width-btn': isMobile }">配置</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- IP黑白名单管理对话框 -->
    <el-dialog title="IP黑白名单管理" :visible.sync="ipListsDialogVisible" :fullscreen="isMobile"
      :width="isMobile ? '100%' : '450px'" :close-on-click-modal="false" center class="ip-lists-dialog"
      :top="isMobile ? '0' : '10vh'" :append-to-body="true">
      <!-- 标签导航 -->
      <div class="ip-tab-nav" :class="{ 'mobile-tab-nav': isMobile }">
        <div v-for="(tab, index) in ipTabs" :key="index"
          :class="['ip-tab-item', { 'active': ipListsActiveTab === tab.value }]" @click="ipListsActiveTab = tab.value">
          {{ tab.label }}
        </div>
      </div>

      <!-- 表单区域 -->
      <div class="ip-form-wrapper">
        <!-- 添加IP白名单表单 -->
        <template v-if="ipListsActiveTab === 'addWhite'">
          <div class="form-group">
            <label>IP地址</label>
            <el-input v-model="ipToManage" placeholder="如: 192.168.1.1"></el-input>
          </div>

          <div class="form-group">
            <label>有效期(天)</label>
            <div class="input-with-tip">
              <el-input-number v-model="ipDuration" :min="0" :max="365" :step="1" class="full-width" controls-position="right"></el-input-number>
              <div class="form-tip">0表示永久</div>
            </div>
          </div>

          <el-button type="primary" @click="addToWhitelist" :loading="loading" class="action-button">添加到白名单</el-button>
        </template>

        <!-- 添加IP黑名单表单 -->
        <template v-if="ipListsActiveTab === 'addBlack'">
          <div class="form-group">
            <label>IP地址</label>
            <el-input v-model="ipToManage" placeholder="如: 192.168.1.1"></el-input>
          </div>

          <div class="form-group">
            <label>有效期(小时)</label>
            <div class="input-with-tip">
              <el-input-number v-model="ipDuration" :min="0" :max="720" :step="1" class="full-width" controls-position="right"></el-input-number>
              <div class="form-tip">0表示永久</div>
            </div>
          </div>

          <el-button type="danger" @click="addToBlacklist" :loading="loading" class="action-button">添加到黑名单</el-button>
        </template>

        <!-- 从白名单移除表单 -->
        <template v-if="ipListsActiveTab === 'removeWhite'">
          <div class="form-group">
            <label>IP地址</label>
            <el-input v-model="ipToManage" placeholder="如: 192.168.1.1"></el-input>
          </div>

          <el-button type="warning" @click="removeFromWhitelist" :loading="loading"
            class="action-button">从白名单移除</el-button>
        </template>

        <!-- 从黑名单移除表单 -->
        <template v-if="ipListsActiveTab === 'removeBlack'">
          <div class="form-group">
            <label>IP地址</label>
            <el-input v-model="ipToManage" placeholder="如: 192.168.1.1"></el-input>
          </div>

          <el-button type="warning" @click="removeFromBlacklist" :loading="loading"
            class="action-button">从黑名单移除</el-button>
        </template>
      </div>

      <div v-if="ipManageResult" class="ip-manage-result">
        <pre>{{ ipManageResult }}</pre>
      </div>

      <div slot="footer" class="dialog-footer">
        <el-button @click="ipListsDialogVisible = false" size="small">关闭</el-button>
        <el-button type="primary" @click="ipListsDialogVisible = false" size="small">完成</el-button>
      </div>
    </el-dialog>

    <!-- 服务器在线但脚本检查仍在加载 -->
    <div v-if="scriptCheckLoading && isServerOnline" class="loading-container">
      <el-card>
        <div class="loading-content">
          <i class="el-icon-loading"></i>
          <p>正在检查服务器脚本状态...</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script>
import RulesScript from './RulesScript.js';

export default RulesScript;
</script>

<style scoped>
.rules-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.server-info {
  background-color: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.server-offline {
  text-align: center;
  margin: 30px 0;
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.server-offline i {
  font-size: 48px;
  color: #e6a23c;
  margin-bottom: 15px;
}

.offline-actions {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  gap: 10px;
}

.output {
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
  overflow-x: auto;
}

.ip-manage-result {
  max-height: 200px;
  overflow-y: auto;
  background-color: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}

.ip-manage-result pre {
  white-space: pre-wrap;
  font-family: monospace;
  margin: 0;
}

.form-item-tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}

.script-deploy-needed {
  margin: 20px 0;
}

.deploy-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f5f7fa;
  padding: 20px;
  border-radius: 4px;
}

.deploy-intro {
  max-width: 70%;
}

.deploy-intro i {
  font-size: 24px;
  color: #e6a23c;
  margin-bottom: 10px;
}

.loading-container {
  margin: 30px 0;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
}

.loading-content i {
  font-size: 32px;
  color: #409EFF;
}

.ip-lists-dialog {
  width: 600px;
}

.ip-tabs {
  margin-top: 20px;
}

.full-width-btn {
  width: 100%;
}

.mobile-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px;
}

.ddos-form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.ban-duration-container {
  display: flex;
  align-items: center;
}

.form-item-tip {
  margin-left: 10px;
}

/* IP黑白名单对话框样式 */
.ip-lists-dialog {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  margin-top: 0 !important;
}

.ip-lists-dialog .el-dialog__body {
  padding: 15px 20px;
  overflow-y: auto;
}

.ip-lists-dialog .el-dialog__header {
  padding: 15px;
}

.ip-lists-dialog .el-dialog__footer {
  padding: 10px 20px 15px;
}

/* 自定义标签导航 */
.ip-tab-nav {
  display: flex;
  border-bottom: 2px solid #EBEEF5;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.ip-tab-item {
  padding: 0 15px;
  height: 40px;
  line-height: 40px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
  font-size: 14px;
  position: relative;
  white-space: nowrap;
}

.ip-tab-item.active {
  color: #409EFF;
  font-weight: bold;
}

.ip-tab-item.active:after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #409EFF;
}

/* 表单样式 */
.ip-form-wrapper {
  padding: 0 5px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
  color: #606266;
}

.input-with-tip {
  display: flex;
  align-items: center;
}

.form-tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}

.action-button {
  width: 100%;
  margin-top: 10px;
  height: 40px;
  font-size: 14px;
}

.full-width {
  width: 100%;
}

.ip-manage-result {
  margin-top: 15px;
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
}

.ip-manage-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 移动端适配样式 */
@media screen and (max-width: 768px) {
  /* 移动端对话框样式优化 */
  .mobile-tab-nav {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  
  .mobile-tab-nav .ip-tab-item {
    flex: 1;
    min-width: 45%;
    padding: 0 5px;
    font-size: 13px;
    margin-bottom: 5px;
  }

  .ip-lists-dialog.el-dialog {
    margin: 0 !important;
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ip-lists-dialog .el-dialog__body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 10px 15px;
  }

  .ip-lists-dialog .el-dialog__header {
    padding: 10px;
    border-bottom: 1px solid #EBEEF5;
  }

  .ip-lists-dialog .el-dialog__title {
    font-size: 16px;
  }

  .ip-lists-dialog .el-dialog__footer {
    padding: 10px;
    border-top: 1px solid #EBEEF5;
    display: flex;
    justify-content: flex-end;
  }
  
  .input-with-tip {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .form-tip {
    margin-left: 0;
    margin-top: 5px;
  }
  
  .action-button {
    height: 40px;
    font-size: 15px;
  }
  
  .form-group {
    margin-bottom: 15px;
  }
  
  .el-input-number.is-controls-right .el-input__inner {
    padding-left: 5px;
    padding-right: 40px;
  }
}
</style>