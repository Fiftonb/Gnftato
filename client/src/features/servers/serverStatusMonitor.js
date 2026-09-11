export function createServerStatusMonitor({
  refresh,
  interval = 30000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
}) {
  let timer = null;
  let refreshPromise = null;

  async function refreshOnce() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = Promise.resolve()
      .then(refresh)
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  function start() {
    if (timer !== null) return;
    timer = setIntervalFn(refreshOnce, interval);
  }

  function stop() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  return {
    refreshOnce,
    start,
    stop,
    isRunning: () => timer !== null
  };
}

