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

将以下两个文件复制到 OpenCode 的全局插件目录（`~/.config/opencode/plugins/`）。

```
~/.config/opencode/plugins/
├── mijia-hook.js
└── mijia_api_helper.py
```

`mijia-hook.js` 是插件入口，启动时 spawn `mijia_api_helper.py` 作为常驻子进程，通过 stdin/stdout JSON-line 协议通信，实现批量设备属性读写。

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

mijiaAPI 需要从 [米家规格平台](https://home.miot-spec.com/) 获取设备属性定义，结果缓存到 `~/.config/mijia-api/<model>.json`。

### 自动获取

```bash
mijiaAPI --get_device_info <model>
```

如果成功，无需手动操作。

### 手动生成（自动获取失败时）

如遇到 `JSONDecodeError`，说明网站 HTML 格式已变更。使用以下 Python 脚本生成缓存（将 `<model>` 替换为实际值）：

```python
import json, requests, os, re

model = "<model>"  # 例如: yeelink.light.bslamp2
cache_dir = os.path.expanduser("~/.config/mijia-api")
os.makedirs(cache_dir, exist_ok=True)

resp = requests.get(f"https://home.miot-spec.com/spec/{model}",
    headers={"User-Agent": "mijiaAPI/3.0"})
match = re.search(r'<script data-page="app" type="application/json">(.*?)</script>', resp.text)
if not match:
    raise Exception("未找到规格数据")

data = json.loads(match.group(1).replace("&quot;", '"'))
product = data["props"]["product"]
tree = data["props"]["tree"]

result = {"name": product["name"], "model": model, "properties": [], "actions": []}
prop_names = set()

for svc in tree["services"]:
    siid = svc["iid"]
    for prop in svc.get("properties", []):
        fmt = prop["format"]
        if fmt.startswith("int"):
            ft = "int"
        elif fmt.startswith("uint"):
            ft = "uint"
        else:
            ft = fmt
        rw = ("r" if "read" in prop.get("access", []) else "") + \
             ("w" if "write" in prop.get("access", []) else "")
        pname = prop["type"]
        if pname in prop_names:
            pname = svc["type"] + "-" + pname
        prop_names.add(pname)
        vl = prop.get("valueList")
        result["properties"].append({
            "name": pname,
            "description": prop.get("description", ""),
            "type": ft,
            "rw": rw,
            "unit": prop.get("unit"),
            "range": prop.get("valueRange"),
            "value-list": vl if vl else None,
            "method": {"siid": siid, "piid": prop["iid"]}
        })
    for act in svc.get("actions", []):
        result["actions"].append({
            "name": act["type"],
            "description": act.get("description", ""),
            "method": {"siid": siid, "aiid": act["iid"]}
        })

with open(os.path.join(cache_dir, f"{model}.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"缓存已生成: {len(result['properties'])} 属性, {len(result['actions'])} 动作")
```

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
  const color = makeColorUint(0.0, 1.0, 0.0)        // 绿色
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

询问用户是否需要测试。如确认，可直接用 Python helper 验证：

```bash
python mijia_api_helper.py <<< '{"id":1,"method":"set","did":"<did>","props":[["on","True"]]}'
```

或使用 CLI：

```bash
mijiaAPI set --did <id> --prop_name on --value True
```

## 步骤 8：重启 OpenCode

**提醒用户自行重启。** 重启后插件生效。
