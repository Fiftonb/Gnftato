# GiPtato API 接口文档

## 基础信息
- **基础URL**: `http://localhost:3000/api`
- **内容类型**: 所有请求和响应都使用 JSON 格式
- **请求头**: Content-Type: application/json

## 1. 服务器管理接口

### 1.1 获取所有服务器
- **URL**: `/servers`
- **方法**: GET
- **描述**: 获取所有已配置的服务器列表
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "uuid字符串",
        "name": "服务器名称",
        "host": "服务器主机名/IP",
        "port": 22,
        "username": "用户名",
        "authType": "password",
        "status": "offline",
        "lastConnection": null,
        "createdAt": "2023-01-01T00:00:00.000Z",
        "updatedAt": "2023-01-01T00:00:00.000Z"
      }
    ]
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "获取服务器列表失败",
    "error": "错误详情"
  }
  ```
- **说明**: 响应中不包含敏感信息（密码、私钥）

### 1.2 创建新服务器
- **URL**: `/servers`
- **方法**: POST
- **描述**: 添加新的服务器配置
- **请求体**:
  ```json
  {
    "name": "服务器名称",
    "host": "服务器主机名/IP",
    "port": 22,
    "username": "用户名",
    "authType": "password/privateKey",
    "password": "密码（authType为password时必填）",
    "privateKey": "私钥内容（authType为privateKey时必填）"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "生成的UUID",
      "name": "服务器名称",
      "host": "服务器主机名/IP",
      "port": 22,
      "username": "用户名",
      "authType": "password/privateKey",
      "status": "offline",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    },
    "message": "服务器添加成功"
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "添加服务器失败",
    "error": "错误详情"
  }
  ```

### 1.3 获取单个服务器
- **URL**: `/servers/:id`
- **方法**: GET
- **描述**: 获取指定ID的服务器信息
- **URL参数**: 
  - `id`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "uuid字符串",
      "name": "服务器名称",
      "host": "服务器主机名/IP",
      "port": 22,
      "username": "用户名",
      "authType": "password/privateKey",
      "status": "online/offline",
      "lastConnection": "2023-01-01T00:00:00.000Z",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/获取服务器信息失败",
    "error": "错误详情"
  }
  ```

### 1.4 更新服务器
- **URL**: `/servers/:id`
- **方法**: PUT
- **描述**: 更新指定服务器的配置
- **URL参数**: 
  - `id`: 服务器UUID
- **请求体**: (仅包含需要更新的字段)
  ```json
  {
    "name": "新的服务器名称",
    "host": "新的主机名/IP",
    "port": 新端口号,
    "username": "新用户名",
    "password": "新密码",
    "privateKey": "新私钥内容"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "uuid字符串",
      "name": "服务器名称",
      "host": "服务器主机名/IP",
      "port": 22,
      "username": "用户名",
      "authType": "password/privateKey",
      "status": "online/offline",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    },
    "message": "服务器信息更新成功"
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/更新服务器信息失败",
    "error": "错误详情"
  }
  ```
- **说明**: 如果不更新密码或私钥，请不要在请求中包含这些字段

### 1.5 删除服务器
- **URL**: `/servers/:id`
- **方法**: DELETE
- **描述**: 删除指定的服务器
- **URL参数**: 
  - `id`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "服务器已删除"
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/删除服务器失败",
    "error": "错误详情"
  }
  ```
- **说明**: 如果服务器正在连接状态，会先断开连接再删除

### 1.6 连接服务器
- **URL**: `/servers/:id/connect`
- **方法**: POST
- **描述**: 连接到指定服务器
- **URL参数**: 
  - `id`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "服务器连接成功"
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/连接服务器失败",
    "error": "错误详情"
  }
  ```
- **说明**: 如果服务器已连接且连接有效，将返回已连接消息

### 1.7 断开服务器连接
- **URL**: `/servers/:id/disconnect`
- **方法**: POST
- **描述**: 断开与指定服务器的连接
- **URL参数**: 
  - `id`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "服务器连接已断开"
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "断开服务器连接失败",
    "error": "错误详情"
  }
  ```

### 1.8 执行命令
- **URL**: `/servers/:id/execute`
- **方法**: POST
- **描述**: 在指定服务器上执行命令
- **URL参数**: 
  - `id`: 服务器UUID
- **请求体**:
  ```json
  {
    "command": "要执行的命令"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "stdout": "命令标准输出",
      "stderr": "命令标准错误输出",
      "code": 0 // 退出码
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "命令不能为空/服务器未找到/服务器未连接，请先连接服务器",
    "error": "错误详情"
  }
  ```
- **说明**: 
  - 如果服务器未连接，API会尝试先连接再执行
  - 如果连接无效，需要重新连接

### 1.9 检查服务器状态
- **URL**: `/servers/:id/status`
- **方法**: GET
- **描述**: 检查服务器连接状态
- **URL参数**: 
  - `id`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "status": "online/offline"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/检查服务器状态失败",
    "error": "错误详情"
  }
  ```
- **说明**: 如果服务器数据库状态与实际连接状态不符，会自动更新数据库

### 1.10 部署iPtato
- **URL**: `/servers/:id/deploy`
- **方法**: POST
- **描述**: 在指定服务器上部署iPtato脚本
- **URL参数**: 
  - `id`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "iPtato部署成功",
    "data": {
      "stdout": "部署过程输出",
      "stderr": "部署过程错误输出",
      "code": 0 // 退出码
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "服务器未找到/服务器未连接，请先连接服务器/部署iPtato失败",
    "error": "错误详情"
  }
  ```

## 2. 规则管理接口

### 2.1 获取封禁列表
- **URL**: `/rules/:serverId/blocklist`
- **方法**: GET
- **描述**: 获取服务器的封禁规则列表
- **URL参数**: 
  - `serverId`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "btPtBlocked": true,
      "spamBlocked": false,
      "customPorts": [1234, 5678],
      "customKeywords": ["torrent", "tracker"]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "获取封禁列表失败",
    "error": "错误详情"
  }
  ```

### 2.2 封禁BT/PT
- **URL**: `/rules/:serverId/block/bt-pt`
- **方法**: POST
- **描述**: 封禁BT/PT流量
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "BT/PT流量已成功封禁",
      "blockedPorts": [6881, 6882, 6883, 6884, 6885, 6886, 6887, 6888, 6889]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "封禁BT/PT协议失败",
    "error": "错误详情"
  }
  ```

### 2.3 封禁垃圾邮件
- **URL**: `/rules/:serverId/block/spam`
- **方法**: POST
- **描述**: 封禁垃圾邮件流量
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "垃圾邮件流量已成功封禁",
      "blockedPorts": [25, 587, 465, 2525]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "封禁垃圾邮件端口失败",
    "error": "错误详情"
  }
  ```

### 2.4 封禁所有
- **URL**: `/rules/:serverId/block/all`
- **方法**: POST
- **描述**: 同时封禁BT/PT和垃圾邮件流量
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "BT/PT和垃圾邮件流量已成功封禁",
      "blockedPorts": [6881, 6882, 6883, 6884, 6885, 6886, 6887, 6888, 6889, 25, 587, 465, 2525]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "封禁BT/PT和垃圾邮件失败",
    "error": "错误详情"
  }
  ```

### 2.5 封禁自定义端口
- **URL**: `/rules/:serverId/block/ports`
- **方法**: POST
- **描述**: 封禁指定端口
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ports": "1234,5678-5680" // 单个端口或端口范围，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "自定义端口已成功封禁",
      "blockedPorts": [1234, 5678, 5679, 5680]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "端口不能为空/封禁自定义端口失败",
    "error": "错误详情"
  }
  ```

### 2.6 封禁自定义关键词
- **URL**: `/rules/:serverId/block/keyword`
- **方法**: POST
- **描述**: 封禁包含指定关键词的流量
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "keyword": "要封禁的关键词"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "自定义关键词已成功封禁",
      "keyword": "torrent"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "关键词不能为空/封禁自定义关键词失败",
    "error": "错误详情"
  }
  ```

### 2.7 解除BT/PT封禁
- **URL**: `/rules/:serverId/unblock/bt-pt`
- **方法**: POST
- **描述**: 解除BT/PT封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "BT/PT流量封禁已解除"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除BT/PT协议封禁失败",
    "error": "错误详情"
  }
  ```

### 2.8 解除垃圾邮件封禁
- **URL**: `/rules/:serverId/unblock/spam`
- **方法**: POST
- **描述**: 解除垃圾邮件封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "垃圾邮件流量封禁已解除"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除垃圾邮件端口封禁失败",
    "error": "错误详情"
  }
  ```

### 2.9 解除所有封禁
- **URL**: `/rules/:serverId/unblock/all`
- **方法**: POST
- **描述**: 解除所有封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "所有流量封禁已解除"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除所有封禁失败",
    "error": "错误详情"
  }
  ```

### 2.10 解除端口封禁
- **URL**: `/rules/:serverId/unblock/ports`
- **方法**: POST
- **描述**: 解除指定端口封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ports": "1234,5678-5680" // 单个端口或端口范围，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "指定端口封禁已解除",
      "unblocked_ports": [1234, 5678, 5679, 5680]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除端口封禁失败",
    "error": "错误详情"
  }
  ```

### 2.11 解除关键词封禁
- **URL**: `/rules/:serverId/unblock/keyword`
- **方法**: POST
- **描述**: 解除指定关键词封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "keyword": "要解除封禁的关键词"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "指定关键词封禁已解除",
      "keyword": "torrent"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除关键词封禁失败",
    "error": "错误详情"
  }
  ```

### 2.12 解除所有关键词封禁
- **URL**: `/rules/:serverId/unblock/all-keywords`
- **方法**: POST
- **描述**: 解除所有关键词封禁
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "所有关键词封禁已解除"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "解除所有关键词封禁失败",
    "error": "错误详情"
  }
  ```

### 2.13 获取入站端口
- **URL**: `/rules/:serverId/inbound/ports`
- **方法**: GET
- **描述**: 获取允许的入站端口列表
- **URL参数**: 
  - `serverId`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "allowedPorts": [22, 80, 443]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "获取入站端口列表失败",
    "error": "错误详情"
  }
  ```

### 2.14 获取入站IP
- **URL**: `/rules/:serverId/inbound/ips`
- **方法**: GET
- **描述**: 获取允许的入站IP列表
- **URL参数**: 
  - `serverId`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "allowedIPs": ["192.168.1.1", "10.0.0.1"]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "获取入站IP列表失败",
    "error": "错误详情"
  }
  ```

### 2.15 允许入站端口
- **URL**: `/rules/:serverId/inbound/allow/ports`
- **方法**: POST
- **描述**: 添加允许的入站端口
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ports": "80,443,8080-8090" // 单个端口或端口范围，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "入站端口已允许",
      "allowed_ports": [80, 443, 8080, 8081, 8082]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "添加允许入站端口失败",
    "error": "错误详情"
  }
  ```

### 2.16 禁止入站端口
- **URL**: `/rules/:serverId/inbound/disallow/ports`
- **方法**: POST
- **描述**: 禁止入站端口
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ports": "80,443" // 单个端口或端口范围，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "入站端口已禁止",
      "disallowed_ports": [80, 443]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "禁止入站端口失败",
    "error": "错误详情"
  }
  ```

### 2.17 允许入站IP
- **URL**: `/rules/:serverId/inbound/allow/ips`
- **方法**: POST
- **描述**: 添加允许的入站IP
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ips": "192.168.1.1,10.0.0.0/24" // 单个IP或CIDR格式，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "入站IP已允许",
      "allowed_ips": ["192.168.1.1", "10.0.0.0/24"]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "添加允许入站IP失败",
    "error": "错误详情"
  }
  ```

### 2.18 禁止入站IP
- **URL**: `/rules/:serverId/inbound/disallow/ips`
- **方法**: POST
- **描述**: 禁止入站IP
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**:
  ```json
  {
    "ips": "192.168.1.1,10.0.0.0/24" // 单个IP或CIDR格式，用逗号分隔
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "入站IP已禁止",
      "disallowed_ips": ["192.168.1.1", "10.0.0.0/24"]
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "禁止入站IP失败",
    "error": "错误详情"
  }
  ```

### 2.19 获取SSH端口
- **URL**: `/rules/:serverId/ssh-port`
- **方法**: GET
- **描述**: 获取SSH端口配置
- **URL参数**: 
  - `serverId`: 服务器UUID
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "sshPort": 22
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "获取SSH端口配置失败",
    "error": "错误详情"
  }
  ```

### 2.20 清除所有规则
- **URL**: `/rules/:serverId/clear-all`
- **方法**: POST
- **描述**: 清除所有防火墙规则
- **URL参数**: 
  - `serverId`: 服务器UUID
- **请求体**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "message": "所有防火墙规则已清除"
    }
  }
  ```
- **错误响应**:
  ```json
  {
    "success": false,
    "message": "清除所有规则失败",
    "error": "错误详情"
  }
  ```

## 3. 数据结构

### 3.1 服务器对象
```json
{
  "_id": "uuid字符串",
  "name": "服务器名称",
  "host": "服务器主机名/IP",
  "port": 22,
  "username": "用户名",
  "authType": "password/privateKey",
  "password": "密码(敏感字段，不会在响应中返回)",
  "privateKey": "私钥内容(敏感字段，不会在响应中返回)",
  "status": "online/offline",
  "lastConnection": "2023-01-01T00:00:00.000Z",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

## 4. 错误处理
所有接口在发生错误时会返回以下格式的响应：
```json
{
  "success": false,
  "message": "错误信息",
  "error": "详细错误信息"
}
```

## 5. 注意事项
1. 所有规则管理接口都需要指定服务器ID（`:serverId`）
2. 在使用规则管理接口前，需要确保服务器已连接
3. 修改防火墙规则可能需要管理员权限
4. 在生产环境中，错误响应中的详细错误信息可能会被隐藏 