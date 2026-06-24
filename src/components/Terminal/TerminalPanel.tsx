import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ensureSession, attach, detach, writeToSession, resizeSession, killSession } from '../../lib/terminalSessions'
import { useStore } from '../../store/useStore'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ projectId, localPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    setError(null)

    const term = new Terminal({ convertEol: true, fontSize: 13 })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    let disposed = false
    ensureSession(projectId, localPath)
      .then(() => {
        if (disposed) return
        attach(projectId, chunk => term.write(chunk))
      })
      .catch((err: unknown) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : String(err))
      })

    const dataListener = term.onData(data => writeToSession(projectId, data))

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      resizeSession(projectId, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      dataListener.dispose()
      detach(projectId)
      term.dispose()
    }
  }, [projectId, localPath])

  function handleClose() {
    killSession(projectId)
    setError(null)
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-red-300 p-4 text-center">
        <span>终端启动失败：{error}</span>
        <span className="text-gray-500 text-xs">请检查项目绑定的目录是否仍然存在</span>
        <button
          onClick={() => useStore.getState().setMainView('notes')}
          className="text-xs text-gray-400 hover:text-gray-200 underline mt-1"
        >
          返回笔记，重新绑定目录
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-end px-3 py-1 border-b border-glass-border">
        <button
          onClick={handleClose}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          关闭终端
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
