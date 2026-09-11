export const STATUS_TEXT = Object.freeze({
  online: '在线',
  offline: '离线',
  error: '错误',
  connecting: '连接中',
  disconnecting: '断开中',
  restarting: '重启中'
});

export function statusTagType(status) {
  if (status === 'online') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'connecting') return 'info';
  if (status === 'disconnecting') return 'warning';
  return 'primary';
}

export function onlineCount(servers) {
  return servers.filter(server => server.status === 'online').length;
}

export function offlineCount(servers) {
  return servers.filter(server => server.status === 'offline' || server.status === 'error').length;
}

export function formatStatusTime(timestamp, now = Date.now()) {
  if (!timestamp) return '';

  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return '';
  const diff = Math.max(0, Math.floor((now - time.getTime()) / 1000));
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
}

export function connectionErrorMessage(error) {
  const message = typeof error === 'string'
    ? error
    : (error?.response?.data?.message || error?.response?.data?.error || error?.message || '未知错误');
  if (/timeout|超时|timed out/i.test(message)) return '连接超时，请检查网络或服务器SSH服务状态';
  if (/refused|拒绝/i.test(message)) return '连接被拒绝，请检查服务器是否启动或端口是否正确';
  if (/authentication|认证/i.test(message)) return '认证失败，请检查用户名和密码';
  if (/not found|找不到/i.test(message)) return '找不到服务器，请检查主机地址是否正确';
  if (/handshake/i.test(message)) return 'SSH握手失败，可能是网络问题或SSH服务配置错误';
  if (/took too long/i.test(message)) return '连接操作耗时过长，已自动中断';
  return `连接错误: ${message}`;
}
