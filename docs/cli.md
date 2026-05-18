# CLI 参考

`mijiaAPI` 内置命令行工具，安装 `mijiaAPI` 后即可直接使用。

```
mijiaAPI <command> [options]
```

## 编码问题

Python 默认使用系统编码输出（Windows 下常见 GBK），会导致中文报错变成乱码不可读。运行 `mijiaAPI` 前需设置 UTF-8 编码：

**bash (Git Bash / WSL)**：
```bash
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1
```

**cmd**：
```cmd
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
```

**PowerShell**：
```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
```

也可在命令前临时指定：

```bash
# bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 mijiaAPI -l

# cmd
cmd /c "set PYTHONIOENCODING=utf-8 && set PYTHONUTF8=1 && mijiaAPI -l"
```

## 主命令

| 参数 | 说明 |
|------|------|
| `-l`, `--list_devices` | 列出所有米家设备 |
| `--get_device_info <model>` | 获取设备规格信息 |
| `-p`, `--auth_path <path>` | 认证文件路径（默认 `~/.config/mijia-api/auth.json`） |

## 子命令

### get — 获取设备属性

```
mijiaAPI get --did <did> --prop_name <name>
```

### set — 设置设备属性

```
mijiaAPI set --did <did> --prop_name <name> --value <value>
```

| 参数 | 说明 |
|------|------|
| `--did` | 设备 did（优先于 `--dev_name`） |
| `--dev_name` | 设备名称（米家 APP 中设定的名称） |
| `--prop_name` | 属性名称 |
| `--value` | 属性值 |

## 常用属性（米家床头灯）

| 属性 | 值类型 | 示例 |
|------|--------|------|
| `on` | `True` / `False` | `mijiaAPI set --did X --prop_name on --value True` |
| `brightness` | `1-100` | `mijiaAPI set --did X --prop_name brightness --value 80` |
| `color` | RGB 整数 | `mijiaAPI set --did X --prop_name color --value 16711680` |
| `color-temperature` | 色温值 | `mijiaAPI set --did X --prop_name color-temperature --value 4000` |
| `mode` | 模式值 | `mijiaAPI set --did X --prop_name mode --value 1` |

RGB 颜色整数计算公式：`(R << 16) | (G << 8) | B`

## 示例

```bash
# 帮助
mijiaAPI --help

# 列出所有设备
mijiaAPI -l

# 获取设备规格
mijiaAPI --get_device_info yeelink.light.bslamp2

# 读取开关状态
mijiaAPI get --did <did> --prop_name on

# 开灯
mijiaAPI set --did <did> --prop_name on --value True

# 关灯
mijiaAPI set --did <did> --prop_name on --value False

# 设置颜色（红色 = 0xFF0000 = 16711680）
mijiaAPI set --did <did> --prop_name color --value 16711680

# 设置亮度
mijiaAPI set --did <did> --prop_name brightness --value 50
```
