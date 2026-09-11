'use strict';

const fs = require('node:fs');
const { pipeline } = require('node:stream');

class FileTransferService {
  constructor(connectionManager) { this.connectionManager = connectionManager; }

  upload(serverId, localPath, remotePath) {
    const connection = this.connectionManager.getConnection(serverId);
    if (!connection) return Promise.reject(new Error('无有效连接，请先连接服务器'));
    return new Promise((resolve, reject) => {
      connection.sftp((error, sftp) => {
        if (error) return reject(error);
        let readStream;
        let writeStream;
        let settled = false;
        const finish = failure => {
          if (settled) return;
          settled = true;
          if (failure) { readStream?.destroy(); writeStream?.destroy(); }
          try { sftp.end(); } catch (closeError) { failure ||= closeError; }
          if (failure) reject(failure);
          else resolve({ success: true, message: '文件上传成功' });
        };
        sftp.on('error', finish);
        try {
          writeStream = sftp.createWriteStream(remotePath, { mode: 0o600 });
          readStream = fs.createReadStream(localPath);
          pipeline(readStream, writeStream, finish);
        } catch (failure) { finish(failure); }
      });
    });
  }

  download(serverId, remotePath, localPath) {
    const connection = this.connectionManager.getConnection(serverId);
    if (!connection) return Promise.reject(new Error('无有效连接，请先连接服务器'));
    return new Promise((resolve, reject) => {
      connection.sftp((error, sftp) => {
        if (error) return reject(error);
        const readStream = sftp.createReadStream(remotePath);
        const writeStream = fs.createWriteStream(localPath);
        let settled = false;
        const finish = failure => {
          if (settled) return;
          settled = true;
          try { sftp.end(); } catch (closeError) { failure ||= closeError; }
          if (failure) reject(failure);
          else resolve({ success: true, message: '文件下载成功' });
        };
        readStream.once('error', finish);
        writeStream.once('error', finish);
        writeStream.once('close', () => finish());
        readStream.pipe(writeStream);
      });
    });
  }
}

module.exports = { FileTransferService };
