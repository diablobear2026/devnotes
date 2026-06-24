import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke, Channel } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ localPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({ convertEol: true, fontSize: 13 })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const channel = new Channel<string>()
    channel.onmessage = chunk => term.write(chunk)

    let disposed = false
    invoke<string>('pty_spawn', { cwd: localPath, onData: channel }).then(sessionId => {
      if (disposed) return
      sessionIdRef.current = sessionId
    })

    const dataListener = term.onData(data => {
      if (sessionIdRef.current) {
        invoke('pty_write', { sessionId: sessionIdRef.current, data })
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (sessionIdRef.current) {
        invoke('pty_resize', { sessionId: sessionIdRef.current, cols: term.cols, rows: term.rows })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      dataListener.dispose()
      term.dispose()
      if (sessionIdRef.current) {
        invoke('pty_kill', { sessionId: sessionIdRef.current })
      }
    }
  }, [localPath])

  return <div ref={containerRef} className="flex-1 min-h-0" />
}
