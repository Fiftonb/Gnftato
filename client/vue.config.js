module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        logLevel: 'debug',
        pathRewrite: {
          '^/api': '/api'
        },
        onProxyReq(proxyReq, req, res) {
          console.log('代理请求:', req.method, req.url, '->',
            proxyReq.protocol + '//' + proxyReq.host + proxyReq.path);
        },
        onError(err, req, res) {
          console.error('代理错误:', err);
        }
      }
    },
    host: '0.0.0.0'
  },
  outputDir: '../server/public',
  publicPath: '/',
  lintOnSave: false,
  transpileDependencies: true
}; 