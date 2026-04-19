from fastapi import APIRouter, HTTPException
from ..schemas.graph import GraphSchema
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/generate", tags=["generation"])

@router.post("", summary="Generate boilerplate backend code")
async def generate_code(graph_data: GraphSchema):
    try:
        return {
            "message": "Code generation successfully parsed",
            "received_nodes": len(graph_data.nodes),
            "target": graph_data.framework
        }
    except Exception as e:
        logger.error(f"Generation Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Code Generation pipeline encountered an error.")
