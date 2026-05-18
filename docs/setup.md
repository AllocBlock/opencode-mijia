# 安装指南

> **本项目不是开箱即用的。** 你需要根据用户的实际设备和需求，定制 `mijia-hook.js` 中的参数和生命周期函数。
>
> **编码要求**：Python 默认使用系统编码输出（Windows 下常见 GBK），mijiaAPI 的中文输出会变成乱码。本指南中所有 `mijiaAPI` 命令执行前，必须先设置 UTF-8 环境变量。不同 Shell 的写法参见 [cli.md](cli.md#编码问题)。`mijia-hook.js` 插件已内置此配置，无需额外操作。

## 步骤 1：安装 mijiaAPI

```bash
pip install mijiaAPI
```

验证：

```bash
mijiaAPI --help
```

## 步骤 2：安装插件文件

将 `mijia-hook.js` 复制到 OpenCode 的全局插件目录（`~/.config/opencode/plugins/`）。

```
~/.config/opencode/plugins/
└── mijia-hook.js
```

## 步骤 3：登录米家账号

注意，米家账号登录是一个复杂过程，涉及到阻塞和Agent通信，请按照如下步骤实现登录：

### Step 1: 创建监控子任务
因为登录过程是阻塞的，你需要启动一个新的异步子Agent用来登录，并监控它的输出：
- 子Agent命令：`mijiaAPI -l`
- 该子Agent内部逻辑：
  1. mijiaAPI -l会触发登录
  2. 如果未登录，终端会使用字符绘制二维码，并且打印备用的URL，用户可使用URL在网页浏览器查看二维码
  3. 主Agent需要读取该二维码信息发给用户，引导用户使用米家App扫码登录，子Agent进程会阻塞直到用户完成登录或超时
  4. 如果此前已登录，命令会直接返回设备列表

### Step 2: 主Agent等待并引导
主Agent在派发子任务后，等待子Agent输出二维码信息，你需要将二维码发给用户，引导用户用米家 APP 扫描登录，然后等待子Agent运行完毕，获取登录状态。

如果上述流程无法实现，则将命令提供给用户，引导用户自己在终端实现登录

## 步骤 4：列设备并选择

```bash
mijiaAPI -l
```

将设备列表展示给用户，询问要操控哪台设备。记录用户选择的设备 did。

## 步骤 5：设备规格缓存（首次必做）

mijiaAPI 需要从 [米家规格平台](https://home.miot-spec.com/) 获取设备属性定义，结果会缓存到本地。如果自动获取失败（网站格式变更），需手动生成缓存。

### 自动获取

```bash
mijiaAPI --get_device_info <model>
```

如果成功，无需手动操作。

### 手动生成（自动获取失败时）

如遇到以下错误：

```
json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
File ".../mijiaAPI/devices.py", line 295, in get_device_info
```

说明网站 HTML 格式已变更（2026-05-18），mijiaAPI 库无法自动解析。此时需手动提取并生成缓存：

1. 获取设备 model（从步骤 4 的设备列表中获取，如 `yeelink.light.bslamp2`）
2. 拼接规格页面地址：`https://home.miot-spec.com/spec/<model>`
3. 获取页面内容，找到 `<script data-page="app" type="application/json">` 标签
4. 提取该标签内的 JSON 内容（从 `>` 到 `</script>` 之间），将 `&quot;` 替换为 `"`
5. 将 JSON 解析后转换为缓存格式，具体格式为：

```json
{
  "name": "<设备名称>",
  "model": "<model>",
  "properties": [
    {
      "name": "on",
      "description": "...",
      "type": "bool",
      "rw": "rw",
      "unit": null,
      "range": null,
      "value-list": null,
      "method": { "siid": 2, "piid": 1 }
    }
  ],
  "actions": [
    {
      "name": "toggle",
      "description": "...",
      "method": { "siid": 2, "aiid": 1 }
    }
  ]
}
```

数据来源于 JSON 中的 `props.tree.services` 数组：
- 每个 service 对象的 `iid` → `siid`
- `properties[].iid` → `piid`，`type` → `name`，`format` 归一化为 `bool`/`int`/`uint`/`float`/`string`，`access` → `rw`
- `actions[].iid` → `aiid`，`type` → `name`

6. 保存为 `{auth_data_path.parent}/{model}.json`（默认 `~/.config/mijia-api/<model>.json`）

## 步骤 6：确认操作需求

询问用户希望在不同事件下执行什么操作。以下以米家智能灯具为例展示模板代码，agent 可参考此模板，根据用户实际设备和需求编写代码。

参数和逻辑全部内嵌在生命周期函数中，无需顶部全局变量。`applyState(deviceId, [prop, value], ...)` 第一个参数为设备 did，支持多设备控制。

### 生命周期函数

```js
// 插件启动时调用
async function on_start() {
  const DEVICE_ID = "<填入设备 did>"
  await applyState(DEVICE_ID, ["on", false])
}

// AI 处理中 (session.status {busy})
async function on_busy() {
  const DEVICE_ID = "<填入设备 did>"
  const color = makeColorUint(1.0, 1.0, 1.0)       // 白色 (RGB: 0~1)
  await applyState(DEVICE_ID, ["color", color], ["brightness", 30], ["on", true])
}

// AI 向用户提问 (question.asked)
async function on_question() {
  const DEVICE_ID = "<填入设备 did>"
  const color = makeColorUint(1.0, 0.65, 0.0)       // 橙色
  await applyState(DEVICE_ID, ["color", color], ["brightness", 80], ["on", true])
}

// AI 空闲 (session.status {idle})
async function on_idle() {
  const DEVICE_ID = "<填入设备 did>"
  const color = makeColorUint(1.0, 0.0, 0.0)        // 红色
  await applyState(DEVICE_ID, ["color", color], ["brightness", 50], ["on", true])
}

// 进程退出时调用
async function on_exit() {
  const DEVICE_ID = "<填入设备 did>"
  await applyState(DEVICE_ID, ["on", false])
}
```

`makeColorUint(r, g, b)` 将 RGB（0~1 范围）转为设备所需的整数。函数实现直接替换 `mijia-hook.js` 中对应桩函数的注释，工具函数和插件入口无需修改。

## 步骤 7：测试（可选）

询问用户是否需要测试。如确认，用 `mijiaAPI set` 验证设备可用：

```bash
mijiaAPI set --did <id> --prop_name on --value True
```

## 步骤 8：重启 OpenCode

**提醒用户自行重启。** 重启后插件生效。
