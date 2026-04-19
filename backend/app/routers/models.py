from fastapi import APIRouter
from ..config import settings

router = APIRouter()

@router.get("/models")
async def get_available_models():
    """Return list of available AI models + allow custom via frontend"""
    preset_models = [
        {"id": m, "name": m.split("/")[-1].replace(":free", ""), "provider": m.split("/")[0], "is_free": ":free" in m}
        for m in settings.available_models_list
    ]
    
    return {
        "preset_models": preset_models,
        "allow_custom": True,  # Frontend can add any OpenRouter-compatible model
        "note": "Users can add custom models in format: provider/model-name"
    }