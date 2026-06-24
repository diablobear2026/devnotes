import { Channel, invoke } from '@tauri-apps/api/core'

const MAX_BUFFER_CHARS = 200_000

interface TerminalSession {
  sessionId: string
  channel: Channel<string>
  buffer: string[]
  listener: ((chunk: string) => void) | null
}

const sessions = new Map<string, TerminalSession>()

function pushBuffered(session: TerminalSession, chunk: string) {
  session.buffer.push(chunk)
  let total = session.buffer.reduce((n, c) => n + c.length, 0)
  while (total > MAX_BUFFER_CHARS && session.buffer.length > 1) {
    total -= session.buffer[0].length
    session.buffer.shift()
  }
}

export async function ensureSession(projectId: string, cwd: string): Promise<TerminalSession> {
  const existing = sessions.get(projectId)
  if (existing) return existing

  const channel = new Channel<string>()
  const session: TerminalSession = { sessionId: '', channel, buffer: [], listener: null }
  channel.onmessage = chunk => {
    if (session.listener) session.listener(chunk)
    else pushBuffered(session, chunk)
  }

  sessions.set(projectId, session)
  try {
    const sessionId = await invoke<string>('pty_spawn', { cwd, onData: channel })
    session.sessionId = sessionId
    return session
  } catch (err) {
    sessions.delete(projectId)
    throw err
  }
}

export function attach(projectId: string, listener: (chunk: string) => void): void {
  const session = sessions.get(projectId)
  if (!session) return
  if (session.buffer.length) {
    listener(session.buffer.join(''))
    session.buffer = []
  }
  session.listener = listener
}

export function detach(projectId: string): void {
  const session = sessions.get(projectId)
  if (session) session.listener = null
}

export function hasSession(projectId: string): boolean {
  return sessions.has(projectId)
}

export function writeToSession(projectId: string, data: string): void {
  const session = sessions.get(projectId)
  if (session?.sessionId) {
    invoke('pty_write', { sessionId: session.sessionId, data })
  }
}

export function resizeSession(projectId: string, cols: number, rows: number): void {
  const session = sessions.get(projectId)
  if (session?.sessionId) {
    invoke('pty_resize', { sessionId: session.sessionId, cols, rows })
  }
}

export function killSession(projectId: string): void {
  const session = sessions.get(projectId)
  if (!session) return
  sessions.delete(projectId)
  if (session.sessionId) {
    invoke('pty_kill', { sessionId: session.sessionId })
  }
}
