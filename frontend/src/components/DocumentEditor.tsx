import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Users, MessageSquare, History } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Document {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  version: number
}

interface DocumentVersion {
  id: string
  document_id: string
  content: string
  version: number
  created_at: string
  author: string
}

interface Comment {
  id: string
  document_id: string
  content: string
  author: string
  position: number
  created_at: string
}

interface User {
  id: string
  name: string
  color: string
}

interface CursorPosition {
  user_id: string
  position: number
  selection_start?: number
  selection_end?: number
}

interface DocumentOperation {
  type: string
  position: number
  content?: string
  length?: number
  user_id: string
  timestamp: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  
  const [document, setDocument] = useState<Document | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [cursors, setCursors] = useState<CursorPosition[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commentPosition] = useState(0)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!id) return
    
    fetchDocument()
    fetchVersions()
    fetchComments()
    createUser()
    connectWebSocket()
    
    return () => {
      if (ws) {
        ws.close()
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [id])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`${API_URL}/documents/${id}`)
      if (response.ok) {
        const data = await response.json()
        setDocument(data)
      } else {
        toast({
          title: "错误",
          description: "无法加载文档",
          variant: "destructive",
        })
        navigate('/')
      }
    } catch (error) {
      toast({
        title: "错误",
        description: "网络连接失败",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await fetch(`${API_URL}/documents/${id}/versions`)
      if (response.ok) {
        const data = await response.json()
        setVersions(data)
      }
    } catch (error) {
      console.error('Failed to fetch versions:', error)
    }
  }

  const fetchComments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents/${id}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(data)
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    }
  }

  const createUser = async () => {
    try {
      const userName = `用户${Math.floor(Math.random() * 1000)}`
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${encodeURIComponent(userName)}`
      })
      if (response.ok) {
        const user = await response.json()
        setCurrentUser(user)
      }
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  const connectWebSocket = () => {
    const wsUrl = API_URL.replace('http://', 'ws://').replace('https://', 'wss://') + `/ws/${id}`
    const websocket = new WebSocket(wsUrl)
    
    websocket.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
      setWs(websocket)
      
      if (currentUser) {
        websocket.send(JSON.stringify({
          type: 'user_join',
          data: currentUser
        }))
      }
    }
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      switch (message.type) {
        case 'operation':
          handleRemoteOperation(message.data)
          break
        case 'cursor':
          handleRemoteCursor(message.data)
          break
        case 'user_join':
          handleUserJoin(message.data)
          break
        case 'user_leave':
          handleUserLeave(message.data)
          break
        case 'comment_added':
          setComments(prev => [...prev, message.comment])
          break
      }
    }
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
      setTimeout(() => connectWebSocket(), 3000)
    }
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsConnected(false)
    }
  }

  const handleRemoteOperation = (operation: DocumentOperation) => {
    if (!document || operation.user_id === currentUser?.id) return
    
    setDocument(prev => {
      if (!prev) return prev
      
      let newContent = prev.content
      
      if (operation.type === 'insert' && operation.content) {
        newContent = newContent.slice(0, operation.position) + 
                    operation.content + 
                    newContent.slice(operation.position)
      } else if (operation.type === 'delete' && operation.length) {
        newContent = newContent.slice(0, operation.position) + 
                    newContent.slice(operation.position + operation.length)
      }
      
      return { ...prev, content: newContent }
    })
  }

  const handleRemoteCursor = (cursor: CursorPosition) => {
    console.log('Received cursor data:', cursor)
    setCursors(prev => {
      const filtered = prev.filter(c => c.user_id !== cursor.user_id)
      const newCursors = [...filtered, cursor]
      console.log('Updated cursors:', newCursors)
      return newCursors
    })
  }

  const handleUserJoin = (user: User) => {
    setUsers(prev => {
      const exists = prev.find(u => u.id === user.id)
      if (exists) return prev
      return [...prev, user]
    })
  }

  const handleUserLeave = (userData: { user_id: string }) => {
    setUsers(prev => prev.filter(u => u.id !== userData.user_id))
    setCursors(prev => prev.filter(c => c.user_id !== userData.user_id))
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const cursorPosition = e.target.selectionStart
    
    if (!document || !currentUser || !ws || ws.readyState !== WebSocket.OPEN) return
    
    const oldContent = document.content
    const operation = calculateOperation(oldContent, newContent, cursorPosition)
    
    if (operation) {
      ws.send(JSON.stringify({
        type: 'operation',
        data: {
          ...operation,
          user_id: currentUser.id,
          timestamp: new Date().toISOString()
        }
      }))
    }
    
    setDocument(prev => prev ? { ...prev, content: newContent } : null)
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(newContent)
    }, 2000)
  }

  const calculateOperation = (oldContent: string, newContent: string, cursorPos: number): Partial<DocumentOperation> | null => {
    if (oldContent === newContent) return null
    
    if (newContent.length > oldContent.length) {
      const insertedText = newContent.slice(cursorPos - (newContent.length - oldContent.length), cursorPos)
      return {
        type: 'insert',
        position: cursorPos - insertedText.length,
        content: insertedText
      }
    } else {
      const deletedLength = oldContent.length - newContent.length
      return {
        type: 'delete',
        position: cursorPos,
        length: deletedLength
      }
    }
  }

  const handleCursorChange = () => {
    if (!textareaRef.current || !currentUser || !ws || ws.readyState !== WebSocket.OPEN) return
    
    const position = textareaRef.current.selectionStart
    const selectionEnd = textareaRef.current.selectionEnd
    
    ws.send(JSON.stringify({
      type: 'cursor',
      data: {
        user_id: currentUser.id,
        position,
        selection_start: position !== selectionEnd ? position : undefined,
        selection_end: position !== selectionEnd ? selectionEnd : undefined
      }
    }))
  }

  const saveDocument = async (content?: string) => {
    if (!document) return
    
    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `content=${encodeURIComponent(content || document.content)}`
      })
      
      if (response.ok) {
        const updatedDoc = await response.json()
        setDocument(updatedDoc)
        fetchVersions()
        toast({
          title: "已保存",
          description: "文档已自动保存",
        })
      } else if (response.status === 404) {
        toast({
          title: "错误",
          description: "文档不存在，正在返回文档列表",
          variant: "destructive",
        })
        navigate('/')
      } else {
        toast({
          title: "保存失败",
          description: "无法保存文档",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "保存失败",
        description: "网络连接失败",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const addComment = async () => {
    if (!newComment.trim() || !currentUser) return
    
    try {
      const response = await fetch(`${API_URL}/documents/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `content=${encodeURIComponent(newComment)}&author=${encodeURIComponent(currentUser.name)}&position=${commentPosition}`
      })
      
      if (response.ok) {
        const comment = await response.json()
        setComments(prev => [...prev, comment])
        setNewComment('')
        setIsCommentDialogOpen(false)
        toast({
          title: "评论已添加",
          description: "您的评论已成功添加",
        })
      }
    } catch (error) {
      toast({
        title: "错误",
        description: "无法添加评论",
        variant: "destructive",
      })
    }
  }

  const restoreVersion = async (version: DocumentVersion) => {
    try {
      const response = await fetch(`${API_URL}/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `content=${encodeURIComponent(version.content)}`
      })
      
      if (response.ok) {
        const updatedDoc = await response.json()
        setDocument(updatedDoc)
        setIsVersionDialogOpen(false)
        toast({
          title: "版本已恢复",
          description: `已恢复到版本 ${version.version}`,
        })
      } else if (response.status === 404) {
        toast({
          title: "错误",
          description: "文档不存在，正在返回文档列表",
          variant: "destructive",
        })
        navigate('/')
      } else {
        toast({
          title: "错误",
          description: "无法恢复版本",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "错误",
        description: "网络连接失败",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">加载中...</div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">文档未找到</h3>
        <Button onClick={() => navigate('/')} className="mt-4">
          返回文档列表
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? '已连接' : '连接中...'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary">版本 {document.version}</Badge>
          {saving && <Badge variant="outline">保存中...</Badge>}
          
          <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-2" />
                评论 ({comments.length})
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加评论</DialogTitle>
                <DialogDescription>
                  在当前光标位置添加评论
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="comment">评论内容</Label>
                  <Textarea
                    id="comment"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="输入您的评论..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addComment}>添加评论</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                版本历史
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>版本历史</DialogTitle>
                <DialogDescription>
                  查看和恢复文档的历史版本
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {versions.map((version) => (
                  <Card key={version.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">版本 {version.version}</div>
                        <div className="text-sm text-gray-600">
                          {new Date(version.created_at).toLocaleString('zh-CN')} - {version.author}
                        </div>
                        <div className="text-sm text-gray-500 mt-2 line-clamp-3">
                          {version.content || '空内容'}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreVersion(version)}
                      >
                        恢复
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            在线用户 ({users.length + 1})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-6">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={document.content}
                  onChange={handleContentChange}
                  onSelect={handleCursorChange}
                  onKeyUp={handleCursorChange}
                  onClick={handleCursorChange}
                  placeholder="开始输入您的文档内容..."
                  className="min-h-[500px] resize-none border-0 focus:ring-0 text-base leading-relaxed"
                />
                
                {cursors.map((cursor) => {
                  const user = users.find(u => u.id === cursor.user_id)
                  if (!user) return null
                  
                  return (
                    <div
                      key={cursor.user_id}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${cursor.position * 0.6}ch`,
                        top: `${Math.floor(cursor.position / 100) * 1.5}em`,
                        borderLeft: `2px solid ${user.color}`,
                        height: '1.2em',
                        zIndex: 10
                      }}
                    >
                      <div
                        className="absolute -top-6 left-0 px-2 py-1 text-xs text-white rounded"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.name}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">在线用户</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentUser && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentUser.color }}
                  />
                  <span className="text-sm">{currentUser.name} (您)</span>
                </div>
              )}
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="text-sm">{user.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">评论</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-gray-500">暂无评论</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="border-l-2 border-blue-200 pl-3">
                    <div className="text-sm font-medium">{comment.author}</div>
                    <div className="text-sm text-gray-600">{comment.content}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(comment.created_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
