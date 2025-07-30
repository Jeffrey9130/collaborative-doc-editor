import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, FileText, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Document {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  version: number
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents`)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data)
      } else {
        toast({
          title: "错误",
          description: "无法加载文档列表",
          variant: "destructive",
        })
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

  const createDocument = async () => {
    if (!newDocTitle.trim()) {
      toast({
        title: "错误",
        description: "请输入文档标题",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch(`${API_URL}/documents?title=${encodeURIComponent(newDocTitle)}`, {
        method: 'POST',
      })
      
      if (response.ok) {
        const newDoc = await response.json()
        setDocuments([newDoc, ...documents])
        setNewDocTitle('')
        setIsCreateDialogOpen(false)
        toast({
          title: "成功",
          description: "文档创建成功",
        })
        navigate(`/document/${newDoc.id}`)
      } else {
        toast({
          title: "错误",
          description: "创建文档失败",
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">我的文档</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新建文档
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>创建新文档</DialogTitle>
              <DialogDescription>
                为您的新文档输入一个标题
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="title" className="text-right">
                  标题
                </Label>
                <Input
                  id="title"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="col-span-3"
                  placeholder="输入文档标题..."
                  onKeyPress={(e) => e.key === 'Enter' && createDocument()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createDocument}>创建文档</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">暂无文档</h3>
          <p className="mt-1 text-sm text-gray-500">开始创建您的第一个协作文档</p>
          <div className="mt-6">
            <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新建文档
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card 
              key={doc.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/document/${doc.id}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {doc.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  更新于 {formatDate(doc.updated_at)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 line-clamp-3">
                  {doc.content || '空文档'}
                </p>
                <div className="mt-2 text-xs text-gray-500">
                  版本 {doc.version}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
