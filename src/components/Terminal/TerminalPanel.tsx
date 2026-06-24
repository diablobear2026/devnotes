interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ projectId, localPath }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
      终端面板（项目 {projectId}，目录 {localPath}）
    </div>
  )
}
