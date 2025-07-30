import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import DocumentList from './components/DocumentList'
import DocumentEditor from './components/DocumentEditor'
import { Toaster } from '@/components/ui/toaster'
import './App.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <h1 className="text-2xl font-bold text-gray-900">协作文档编辑器</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<DocumentList />} />
            <Route path="/document/:id" element={<DocumentEditor />} />
          </Routes>
        </main>
        
        <Toaster />
      </div>
    </Router>
  )
}

export default App
