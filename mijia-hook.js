// === 工具函数 ===

const { spawn } = require('child_process')
const path = require('path')

function makeColorUint(r, g, b) {
  const ri = Math.round(r * 255)
  const gi = Math.round(g * 255)
  const bi = Math.round(b * 255)
  return (ri << 16) | (gi << 8) | bi
}

let _proc = null
let _reqId = 0
let _pending = {}
let _buf = ''

function getProc() {
  if (_proc) return _proc
  const script = path.join(__dirname, 'mijia_api_helper.py')
  _proc = spawn('python', [script], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  _proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const l of lines) {
      try { console.error('[mijia]', JSON.parse(l).error) } catch (_) {}
    }
  })
  _proc.stdout.on('data', (data) => {
    _buf += data.toString()
    while (true) {
      const idx = _buf.indexOf('\n')
      if (idx === -1) break
      const line = _buf.slice(0, idx)
      _buf = _buf.slice(idx + 1)
      try {
        const resp = JSON.parse(line)
        if (resp.id != null && _pending[resp.id]) {
          const p = _pending[resp.id]
          delete _pending[resp.id]
          if (resp.error) p.reject(new Error(resp.error))
          else p.resolve()
        }
      } catch (_) {}
    }
  })
  _proc.on('exit', () => { _proc = null })
  return _proc
}

function send(req) {
  return new Promise((resolve, reject) => {
    const id = ++_reqId
    req.id = id
    _pending[id] = { resolve, reject }
    getProc().stdin.write(JSON.stringify(req) + '\n')
  })
}

let _cs = {}

async function applyState(deviceId, ...pairs) {
  if (!deviceId) return
  if (!_cs[deviceId]) _cs[deviceId] = {}
  const cs = _cs[deviceId]
  const props = []
  for (const [k, v] of pairs) {
    const val = typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)
    if (cs[k] === val) continue
    props.push([k, v])
    cs[k] = val
  }
  if (props.length === 0) return
  await send({ method: 'set', did: deviceId, props })
}

// === 生命周期（安装时由 agent 实现） ===

// 插件启动时调用
async function on_start() {
  // 示例：关灯
  // const DEVICE_ID = ""  // 填入设备 did，通过 mijiaAPI -l 获取
  // await applyState(DEVICE_ID, ["on", false])
}

// AI 处理中 (session.status {busy})
async function on_busy() {
  // 示例：白色灯光
  // const DEVICE_ID = ""
  // const color = makeColorUint(1.0, 1.0, 1.0)       // RGB: 0~1
  // await applyState(DEVICE_ID, ["color", color], ["brightness", 30], ["on", true])
}

// AI 向用户提问 (question.asked)
async function on_question() {
  // 示例：橙色灯光
  // const DEVICE_ID = ""
  // const color = makeColorUint(1.0, 0.65, 0.0)
  // await applyState(DEVICE_ID, ["color", color], ["brightness", 80], ["on", true])
}

// AI 空闲 (session.status {idle})
async function on_idle() {
  // 示例：绿色灯光
  // const DEVICE_ID = ""
  // const color = makeColorUint(0.0, 1.0, 0.0)
  // await applyState(DEVICE_ID, ["color", color], ["brightness", 50], ["on", true])
}

// 进程退出时调用
async function on_exit() {
  // 示例：关灯
  // const DEVICE_ID = ""
  // await applyState(DEVICE_ID, ["on", false])
}

// === 插件入口（无需修改） ===

const SUB_SESSIONS = new Set()

export const MijiaHookPlugin = async () => {
  await on_start()
  process.on('beforeExit', async () => { await on_exit() })

  return {
    event: async ({ event }) => {
      const props = event.properties

      if (event.type === "session.created") {
        if (props?.info?.parentID) {
          SUB_SESSIONS.add(props.sessionID)
        }
        return
      }

      if (event.type === "session.deleted") {
        SUB_SESSIONS.delete(props?.sessionID)
        return
      }

      if (SUB_SESSIONS.has(props?.sessionID)) return

      if (event.type === "session.status") {
        const t = props?.status?.type
        if (t === "busy") await on_busy()
        if (t === "idle") await on_idle()
      }
      if (event.type === "question.asked") await on_question()
    },
  }
}
