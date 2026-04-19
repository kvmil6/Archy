from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class Position(BaseModel):
    x: float
    y: float

class NodeData(BaseModel):
    label: str
    method: Optional[str] = None
    db: Optional[str] = None
    
    class Config:
        extra = "allow"

class GraphNode(BaseModel):
    id: str
    type: str
    position: Position
    data: NodeData

class GraphEdge(BaseModel):
    source: str
    target: str
    type: str = "default"

class GraphSchema(BaseModel):
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    framework: str = Field(default="fastapi", 
                           description="Target web framework, e.g. fastapi, flask, django")
    projectName: Optional[str] = Field(default="archy-project")
