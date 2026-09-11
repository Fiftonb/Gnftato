import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

export function useServerCrud(store) {
  const dialogVisible = ref(false);
  const isEdit = ref(false);
  const currentServer = ref(null);
  const serverForm = ref(null);
  const testingConnection = ref(false);

  function showAddServerDialog() {
    isEdit.value = false;
    currentServer.value = null;
    dialogVisible.value = true;
  }

  function handleEdit(server) {
    isEdit.value = true;
    currentServer.value = { ...server };
    dialogVisible.value = true;
  }

  async function handleFormSubmit(formData) {
    try {
      if (isEdit.value) {
        await store.dispatch('servers/updateServer', { id: currentServer.value._id, data: formData });
        ElMessage.success('服务器更新成功');
      } else {
        await store.dispatch('servers/createServer', formData);
        ElMessage.success('服务器添加成功');
      }
      dialogVisible.value = false;
      return true;
    } catch (error) {
      ElMessage.error(error.message);
      return false;
    }
  }

  async function handleDelete(server) {
    try {
      await ElMessageBox.confirm('此操作将永久删除该服务器, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      });
      await store.dispatch('servers/deleteServer', server._id);
      ElMessage.success('服务器删除成功');
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(`删除服务器失败: ${error.message}`);
      }
    }
  }

  async function handleTestConnection() {
    const formData = await serverForm.value?.getFormData();
    if (!formData) return;

    testingConnection.value = true;
    let timeoutId;
    const loadingMessage = ElMessage({
      message: '正在测试连接，请稍候...',
      type: 'info',
      duration: 0,
      showClose: true
    });

    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('连接测试超时，请检查网络或服务器配置')), 30000);
      });
      await Promise.race([
        store.dispatch('servers/testConnection', formData),
        timeout
      ]);
      ElMessage.success('连接测试成功');
    } catch (error) {
      ElMessage.error(`连接测试失败: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
      loadingMessage.close();
      testingConnection.value = false;
    }
  }

  return {
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
  };
}
