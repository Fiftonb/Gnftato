<template>
  <el-dialog
    title="IP黑白名单管理"
    :model-value="visible"
    :fullscreen="isMobile"
    :width="isMobile ? '100%' : '450px'"
    :close-on-click-modal="false"
    center
    class="ip-lists-dialog"
    :top="isMobile ? '0' : '10vh'"
    :append-to-body="true"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="ip-tab-nav" :class="{ 'mobile-tab-nav': isMobile }">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['ip-tab-item', { active: activeTab === tab.value }]"
        @click="$emit('update:activeTab', tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <div class="ip-form-wrapper">
      <template v-if="activeTab === 'addWhite'">
        <div class="form-group">
          <label>IP地址</label>
          <el-input :model-value="ip" placeholder="如: 192.168.1.1" @update:model-value="$emit('update:ip', $event)" />
        </div>
        <div class="form-group">
          <label>有效期(天)</label>
          <div class="input-with-tip">
            <el-input-number
              :model-value="duration"
              :min="0"
              :max="365"
              :step="1"
              class="full-width"
              controls-position="right"
              @update:model-value="$emit('update:duration', $event)"
            />
            <div class="form-tip">0表示永久</div>
          </div>
        </div>
        <el-button type="primary" :loading="loading" class="action-button" @click="$emit('add-whitelist')">
          添加到白名单
        </el-button>
      </template>

      <template v-else-if="activeTab === 'addBlack'">
        <div class="form-group">
          <label>IP地址</label>
          <el-input :model-value="ip" placeholder="如: 192.168.1.1" @update:model-value="$emit('update:ip', $event)" />
        </div>
        <div class="form-group">
          <label>有效期(小时)</label>
          <div class="input-with-tip">
            <el-input-number
              :model-value="duration"
              :min="0"
              :max="720"
              :step="1"
              class="full-width"
              controls-position="right"
              @update:model-value="$emit('update:duration', $event)"
            />
            <div class="form-tip">0表示永久</div>
          </div>
        </div>
        <el-button type="danger" :loading="loading" class="action-button" @click="$emit('add-blacklist')">
          添加到黑名单
        </el-button>
      </template>

      <template v-else-if="activeTab === 'removeWhite'">
        <div class="form-group">
          <label>IP地址</label>
          <el-input :model-value="ip" placeholder="如: 192.168.1.1" @update:model-value="$emit('update:ip', $event)" />
        </div>
        <el-button type="warning" :loading="loading" class="action-button" @click="$emit('remove-whitelist')">
          从白名单移除
        </el-button>
      </template>

      <template v-else-if="activeTab === 'removeBlack'">
        <div class="form-group">
          <label>IP地址</label>
          <el-input :model-value="ip" placeholder="如: 192.168.1.1" @update:model-value="$emit('update:ip', $event)" />
        </div>
        <el-button type="warning" :loading="loading" class="action-button" @click="$emit('remove-blacklist')">
          从黑名单移除
        </el-button>
      </template>
    </div>

    <div v-if="result" class="ip-manage-result"><pre>{{ result }}</pre></div>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="small" @click="$emit('update:visible', false)">关闭</el-button>
        <el-button type="primary" size="small" @click="$emit('update:visible', false)">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script>
export default {
  name: 'FirewallIpListsDialog',
  props: {
    visible: Boolean,
    activeTab: {
      type: String,
      required: true
    },
    ip: {
      type: String,
      default: ''
    },
    duration: {
      type: Number,
      default: 0
    },
    tabs: {
      type: Array,
      required: true
    },
    result: {
      type: String,
      default: ''
    },
    loading: Boolean,
    isMobile: Boolean
  },
  emits: [
    'update:visible',
    'update:activeTab',
    'update:ip',
    'update:duration',
    'add-whitelist',
    'add-blacklist',
    'remove-whitelist',
    'remove-blacklist'
  ]
};
</script>
