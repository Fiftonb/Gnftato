export const SERVER_STATUSES = Object.freeze([
  'online',
  'offline',
  'error',
  'connecting',
  'disconnecting',
  'restarting'
]);

const SERVER_STATUS_SET = new Set(SERVER_STATUSES);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstDefined(...values) {
  return values.find(value => value !== undefined);
}

function validStatus(value) {
  return SERVER_STATUS_SET.has(value) ? value : undefined;
}

/**
 * Normalize the response shapes used by the status, connect and legacy logs APIs.
 * Explicit connection validity wins over the persisted database status.
 */
export function normalizeServerStatus(payload, fallback = 'offline') {
  const root = isObject(payload) ? payload : {};
  const details = isObject(root.data) ? root.data : {};
  const connectionStatus = isObject(root.connectionStatus)
    ? root.connectionStatus
    : (isObject(details.connectionStatus) ? details.connectionStatus : {});

  const status = firstDefined(
    validStatus(root.serverStatus),
    validStatus(details.status),
    validStatus(root.status)
  );
  const connectionValid = firstDefined(
    details.backendConnectionValid,
    root.backendConnectionValid,
    details.valid,
    root.valid,
    connectionStatus.connectionValid
  );
  const backendConnected = firstDefined(
    details.backendConnected,
    root.backendConnected,
    details.connected,
    root.connected,
    connectionStatus.actualConnected
  );

  if (connectionValid === true) return 'online';
  if (connectionValid === false) return status === 'error' ? 'error' : 'offline';

  if (status) return status;

  // Compatibility for older status responses which only exposed connection
  // object presence. New responses should include backendConnectionValid.
  if (backendConnected === true) return 'online';
  if (backendConnected === false) return 'offline';

  return validStatus(fallback) || 'offline';
}

export function statusPatchFromResponse(payload, fallback = 'offline', checkedAt = new Date().toISOString()) {
  const root = isObject(payload) ? payload : {};
  const details = isObject(root.data) ? root.data : {};
  const connectionStatus = isObject(root.connectionStatus)
    ? root.connectionStatus
    : (isObject(details.connectionStatus) ? details.connectionStatus : {});

  const status = normalizeServerStatus(root, fallback);
  const backendConnected = firstDefined(
    details.backendConnected,
    root.backendConnected,
    details.connected,
    root.connected,
    connectionStatus.actualConnected
  );
  const backendConnectionValid = firstDefined(
    details.backendConnectionValid,
    root.backendConnectionValid,
    details.valid,
    root.valid,
    connectionStatus.connectionValid
  );

  return {
    status,
    backendConnected: backendConnected === undefined ? status === 'online' : Boolean(backendConnected),
    backendConnectionValid: backendConnectionValid === undefined
      ? status === 'online'
      : Boolean(backendConnectionValid),
    lastChecked: checkedAt
  };
}

export function errorMessage(error, fallback = '请求失败') {
  const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
  return error?.response?.data?.outcomeUnknown === true
    ? `${message}（操作结果未知，请先刷新状态，避免重复执行）`
    : message;
}
