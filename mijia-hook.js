// === 工具函数（无需修改） ===

const { exec } = require('child_process')

function makeColorUint(r, g, b) {
  const ri = Math.round(r * 255)
  const gi = Math.round(g * 255)
  const bi = Math.round(b * 255)
  return (ri << 16) | (gi << 8) | bi
}

function runMijiaCli(args) {
  return new Promise((resolve, reject) => {
    exec(`mijiaAPI ${args}`, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

let _cs = {}

async function applyState(deviceId, ...pairs) {
  if (!deviceId) return
  if (!_cs[deviceId]) _cs[deviceId] = {}
  const cs = _cs[deviceId]
  for (const [k, v] of pairs) {
    const val = typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)
    if (cs[k] === val) continue
    await runMijiaCli(`set --did ${deviceId} --prop_name ${k} --value ${val}`)
    cs[k] = val
  }
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
  // 示例：红色灯光
  // const DEVICE_ID = ""
  // const color = makeColorUint(1.0, 0.0, 0.0)
  // await applyState(DEVICE_ID, ["color", color], ["brightness", 50], ["on", true])
}

// 进程退出时调用
async function on_exit() {
  // 示例：关灯
  // const DEVICE_ID = ""
  // await applyState(DEVICE_ID, ["on", false])
}

// === 插件入口（无需修改） ===

export const MijiaHookPlugin = async () => {
  await on_start()
  process.on('beforeExit', async () => { await on_exit() })

  return {
    event: async ({ event }) => {
      if (event.type === "session.status") {
        const t = event.properties?.status?.type
        if (t === "busy") await on_busy()
        if (t === "idle") await on_idle()
      }
      if (event.type === "question.asked") await on_question()
    },
  }
}
