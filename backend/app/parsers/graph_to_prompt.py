def build_prompt_from_graph(graph: dict) -> str:
    """
    Translates the React Flow graph structure into a text prompt for architectural analysis.
    """
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    
    prompt = "You are an expert backend architect. Analyze this application structure:\n\n"
    
    # List Nodes with their metadata
    prompt += "### Components\n"
    for node in nodes:
        node_type = node.get("type", "unknown").upper()
        label = node.get("label", "unnamed")
        method = node.get("method", "")
        db = node.get("db", "")
        
        info = f"- {node_type}: {label}"
        if method: info += f" (Method: {method})"
        if db: info += f" (DB: {db})"
        prompt += info + "\n"
    
    # List Relationships
    prompt += "\n### Architecture & Data Flow (Relationships)\n"
    for edge in edges:
        source_id = edge.get("source")
        target_id = edge.get("target")
        label = edge.get("label", "connects to")
        
        source = next((n for n in nodes if n['id'] == source_id), {})
        target = next((n for n in nodes if n['id'] == target_id), {})
        
        prompt += f"- {source.get('label', 'Unknown')} --[{label}]--> {target.get('label', 'Unknown')}\n"
    
    prompt += "\n### Requirements\n"
    prompt += "1. Identify potential security gaps or architectural bottlenecks.\n"
    prompt += "2. Suggest improvements for the current flow.\n"
    prompt += "3. Provide architectural suggestions for scalability."
    
    return prompt
