from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Set
import json
import uuid
from datetime import datetime
import asyncio

app = FastAPI(title="Collaborative Document Editor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Document(BaseModel):
    id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime
    version: int

class DocumentVersion(BaseModel):
    id: str
    document_id: str
    content: str
    version: int
    created_at: datetime
    author: str

class Comment(BaseModel):
    id: str
    document_id: str
    content: str
    author: str
    position: int
    created_at: datetime

class User(BaseModel):
    id: str
    name: str
    color: str

class CursorPosition(BaseModel):
    user_id: str
    position: int
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None

class DocumentOperation(BaseModel):
    type: str  # 'insert', 'delete', 'retain'
    position: int
    content: Optional[str] = None
    length: Optional[int] = None
    user_id: str
    timestamp: datetime

documents: Dict[str, Document] = {}
document_versions: Dict[str, List[DocumentVersion]] = {}
comments: Dict[str, List[Comment]] = {}
active_connections: Dict[str, Set[WebSocket]] = {}
user_cursors: Dict[str, Dict[str, CursorPosition]] = {}
users: Dict[str, User] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, document_id: str):
        await websocket.accept()
        if document_id not in self.active_connections:
            self.active_connections[document_id] = set()
        self.active_connections[document_id].add(websocket)

    def disconnect(self, websocket: WebSocket, document_id: str):
        if document_id in self.active_connections:
            self.active_connections[document_id].discard(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str, document_id: str, exclude_websocket: WebSocket = None):
        if document_id in self.active_connections:
            for connection in self.active_connections[document_id].copy():
                if connection != exclude_websocket:
                    try:
                        await connection.send_text(message)
                    except:
                        self.active_connections[document_id].discard(connection)

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"message": "Collaborative Document Editor API"}

@app.post("/documents")
async def create_document(title: str = "Untitled Document"):
    doc_id = str(uuid.uuid4())
    now = datetime.now()
    
    document = Document(
        id=doc_id,
        title=title,
        content="",
        created_at=now,
        updated_at=now,
        version=1
    )
    
    documents[doc_id] = document
    document_versions[doc_id] = []
    comments[doc_id] = []
    user_cursors[doc_id] = {}
    
    version = DocumentVersion(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        content="",
        version=1,
        created_at=now,
        author="system"
    )
    document_versions[doc_id].append(version)
    
    return document

@app.get("/documents")
async def list_documents():
    return list(documents.values())

@app.get("/documents/{document_id}")
async def get_document(document_id: str):
    if document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return documents[document_id]

@app.put("/documents/{document_id}")
async def update_document(document_id: str, title: Optional[str] = None, content: Optional[str] = None):
    if document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    
    document = documents[document_id]
    
    if title is not None:
        document.title = title
    
    if content is not None:
        document.content = content
        document.version += 1
        document.updated_at = datetime.now()
        
        version = DocumentVersion(
            id=str(uuid.uuid4()),
            document_id=document_id,
            content=content,
            version=document.version,
            created_at=datetime.now(),
            author="user"
        )
        document_versions[document_id].append(version)
    
    return document

@app.get("/documents/{document_id}/versions")
async def get_document_versions(document_id: str):
    if document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return document_versions.get(document_id, [])

@app.post("/documents/{document_id}/comments")
async def add_comment(document_id: str, content: str, author: str, position: int):
    if document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    
    comment = Comment(
        id=str(uuid.uuid4()),
        document_id=document_id,
        content=content,
        author=author,
        position=position,
        created_at=datetime.now()
    )
    
    comments[document_id].append(comment)
    
    await manager.broadcast(
        json.dumps({
            "type": "comment_added",
            "comment": comment.dict()
        }),
        document_id
    )
    
    return comment

@app.get("/documents/{document_id}/comments")
async def get_comments(document_id: str):
    if document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return comments.get(document_id, [])

@app.post("/users")
async def create_user(name: str = Form(...)):
    user_id = str(uuid.uuid4())
    colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"]
    color = colors[len(users) % len(colors)]
    
    user = User(id=user_id, name=name, color=color)
    users[user_id] = user
    return user

@app.websocket("/ws/{document_id}")
async def websocket_endpoint(websocket: WebSocket, document_id: str):
    await manager.connect(websocket, document_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "operation":
                operation = DocumentOperation(**message["data"])
                
                if document_id in documents:
                    document = documents[document_id]
                    
                    if operation.type == "insert" and operation.content is not None:
                        content = document.content
                        new_content = content[:operation.position] + operation.content + content[operation.position:]
                        document.content = new_content
                    elif operation.type == "delete" and operation.length is not None:
                        content = document.content
                        new_content = content[:operation.position] + content[operation.position + operation.length:]
                        document.content = new_content
                    
                    document.updated_at = datetime.now()
                    
                    await manager.broadcast(
                        json.dumps({
                            "type": "operation",
                            "data": operation.dict()
                        }),
                        document_id,
                        exclude_websocket=websocket
                    )
            
            elif message["type"] == "cursor":
                cursor_data = CursorPosition(**message["data"])
                
                if document_id not in user_cursors:
                    user_cursors[document_id] = {}
                
                user_cursors[document_id][cursor_data.user_id] = cursor_data
                
                await manager.broadcast(
                    json.dumps({
                        "type": "cursor",
                        "data": cursor_data.dict()
                    }),
                    document_id,
                    exclude_websocket=websocket
                )
            
            elif message["type"] == "user_join":
                user_data = message["data"]
                await manager.broadcast(
                    json.dumps({
                        "type": "user_join",
                        "data": user_data
                    }),
                    document_id,
                    exclude_websocket=websocket
                )
            
            elif message["type"] == "user_leave":
                user_data = message["data"]
                if document_id in user_cursors and user_data["user_id"] in user_cursors[document_id]:
                    del user_cursors[document_id][user_data["user_id"]]
                
                await manager.broadcast(
                    json.dumps({
                        "type": "user_leave",
                        "data": user_data
                    }),
                    document_id,
                    exclude_websocket=websocket
                )
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, document_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
