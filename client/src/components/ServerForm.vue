<template>
  <div class="server-form">
    <el-form :model="form" :rules="rules" ref="serverForm" label-width="100px">
      <el-form-item label="服务器名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入服务器名称"></el-input>
      </el-form-item>

      <el-form-item label="主机地址" prop="host">
        <el-input v-model="form.host" placeholder="请输入主机IP或域名"></el-input>
      </el-form-item>

      <el-form-item label="SSH端口" prop="port">
        <el-input-number v-model="form.port" :min="1" :max="65535" :step="1"></el-input-number>
      </el-form-item>

      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="请输入用户名"></el-input>
      </el-form-item>

      <el-form-item label="认证方式" prop="authType">
        <el-radio-group v-model="form.authType">
          <el-radio label="password">密码</el-radio>
          <el-radio label="privateKey">密钥</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.authType === 'password'" label="密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="请输入密码"></el-input>
      </el-form-item>

      <el-form-item v-if="form.authType === 'privateKey'" label="私钥" prop="privateKey">
        <el-input v-model="form.privateKey" type="textarea" :rows="8" placeholder="请输入私钥内容"></el-input>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="submitForm">{{ isEdit ? '更新' : '添加' }}</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script>
export default {
  name: 'ServerForm',
  props: {
    isEdit: {
      type: Boolean,
      default: false
    },
    serverData: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      form: {
        name: '',
        host: '',
        port: 22,
        username: '',
        authType: 'password',
        password: '',
        privateKey: ''
      },
      rules: {
        name: [
          { required: true, message: '请输入服务器名称', trigger: 'blur' },
          { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
        ],
        host: [
          { required: true, message: '请输入主机地址', trigger: 'blur' }
        ],
        port: [
          { required: true, message: '请输入SSH端口', trigger: 'blur' },
          { type: 'number', message: '端口必须为数字值', trigger: 'blur' }
        ],
        username: [
          { required: true, message: '请输入用户名', trigger: 'blur' }
        ],
        password: [
          { required: true, message: '请输入密码', trigger: 'blur' }
        ],
        privateKey: [
          { required: true, message: '请输入私钥', trigger: 'blur' }
        ]
      }
    }
  },
  created() {
    if (this.isEdit && this.serverData) {
      this.form = { ...this.form, ...this.serverData };
    }
  },
  methods: {
    submitForm() {
      this.$refs.serverForm.validate((valid) => {
        if (valid) {
          this.$emit('submit', this.form);
        } else {
          return false;
        }
      });
    },
    resetForm() {
      this.$refs.serverForm.resetFields();
    }
  }
}
</script>

<style scoped>
.server-form {
  max-width: 600px;
  margin: 0 auto;
}
</style> 