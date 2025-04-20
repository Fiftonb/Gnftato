<template>
  <div class="home">
    <div class="dashboard">
      <el-card class="welcome-card">
        <div slot="header">
          <h2>欢迎使用iPtato防火墙管理面板</h2>
        </div>
        <div class="dashboard-content">
          <p>通过这个面板，您可以轻松管理多台服务器的iptables防火墙规则。</p>
          <ul>
            <li>封禁/解封BT、PT协议</li>
            <li>封禁/解封垃圾邮件端口</li>
            <li>自定义封禁/解封端口和关键词</li>
            <li>管理入网端口白名单</li>
            <li>管理入网IP白名单</li>
          </ul>
          <el-button type="primary" @click="$router.push('/servers')">开始管理服务器</el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script>
export default {
  name: 'HomeView'
}
</script>

<style scoped>
.home {
  padding: 20px;
}

.dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

.welcome-card {
  margin-bottom: 20px;
}

.dashboard-content {
  padding: 20px;
  text-align: center;
}

ul {
  display: inline-block;
  text-align: left;
  margin: 20px 0;
}

li {
  margin: 10px 0;
}
</style> 