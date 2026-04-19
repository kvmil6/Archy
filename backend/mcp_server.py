#!/usr/bin/env python3
"""
Archy MCP Server — exposes architecture graph tools over the MCP protocol.

Start:  python backend/mcp_server.py
Reads:  .archy_cache/graph.json (written after every successful parse)
"""
import json
import sys
import os
import logging
from pathlib import Path
from typing import Any

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("archy-mcp")

CACHE_FILE = Path(".archy_cache") / "graph.json"


# ── Graph data loading ───────────────────────────────────────────────

def _load_graph() -> dict[str, Any]:
    """Load the latest graph from cache. Returns empty structure if missing."""
    try:
        if CACHE_FILE.exists():
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Failed to read graph cache", exc_info=True)
    return {
        "project_path": "",
        "framework": "unknown",
        "parsed_at": "",
        "nodes": [],
        "edges": [],
        "insights": {},
        "health_score": 100,
    }


def _nodes_by_type(graph: dict, node_type: str) -> list[dict]:
    return [n for n in graph.get("nodes", []) if n.get("type") == node_type]


def _find_node(graph: dict, query: str) -> dict | None:
    """Find a node by exact id or fuzzy name match."""
    nodes = graph.get("nodes", [])
    # Exact id match
    for n in nodes:
        if n.get("id") == query:
            return n
    # Fuzzy label match
    q = query.lower()
    for n in nodes:
        label = (n.get("data", {}).get("label") or "").lower()
        if q in label or label in q:
            return n
    return None


def _trace_flow(graph: dict, start_id: str, direction: str = "downstream") -> list[str]:
    """Trace data flow from a node. Returns list of node ids."""
    edges = graph.get("edges", [])
    visited: set[str] = set()
    queue = [start_id]
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        for e in edges:
            if direction == "downstream" and e.get("source") == current:
                queue.append(e.get("target", ""))
            elif direction == "upstream" and e.get("target") == current:
                queue.append(e.get("source", ""))
            elif direction == "both":
                if e.get("source") == current:
                    queue.append(e.get("target", ""))
                if e.get("target") == current:
                    queue.append(e.get("source", ""))
    return list(visited)


# ── MCP Server ───────────────────────────────────────────────────────

app = Server("archy")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_architecture_summary",
            description="Project name, framework, node/edge count, health score, top 5 complex files",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="list_models",
            description="All model/schema nodes with fields, relationships, defining files",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="list_routes",
            description="All route nodes with HTTP method, path, handler, connected models",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="get_node_details",
            description="Full node data by node_id or fuzzy name match",
            inputSchema={
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Node ID or name to search for"}},
                "required": ["query"],
            },
        ),
        Tool(
            name="trace_data_flow",
            description="Upstream/downstream flow chain from a start node",
            inputSchema={
                "type": "object",
                "properties": {
                    "start_node": {"type": "string", "description": "Node ID or name"},
                    "direction": {"type": "string", "enum": ["downstream", "upstream", "both"], "default": "downstream"},
                },
                "required": ["start_node"],
            },
        ),
        Tool(
            name="find_circular_dependencies",
            description="All circular dependency pairs with file paths",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="get_file_content",
            description="Source content by file path or node name",
            inputSchema={
                "type": "object",
                "properties": {"path_or_name": {"type": "string", "description": "File path or node name"}},
                "required": ["path_or_name"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    graph = _load_graph()

    if name == "get_architecture_summary":
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        insights = graph.get("insights", {})
        hotspots = insights.get("high_complexity_files", [])[:5]
        summary = {
            "project_path": graph.get("project_path", ""),
            "framework": graph.get("framework", "unknown"),
            "parsed_at": graph.get("parsed_at", ""),
            "node_count": len(nodes),
            "edge_count": len(edges),
            "health_score": graph.get("health_score", 100),
            "top_complex_files": hotspots,
        }
        return [TextContent(type="text", text=json.dumps(summary, indent=2))]

    elif name == "list_models":
        model_nodes = _nodes_by_type(graph, "model") + _nodes_by_type(graph, "schema")
        result = []
        for n in model_nodes:
            data = n.get("data", {})
            result.append({
                "id": n.get("id"),
                "type": n.get("type"),
                "label": data.get("label"),
                "filepath": data.get("filepath"),
                "fields": data.get("fields", []),
                "methods": data.get("methods", []),
            })
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "list_routes":
        route_nodes = _nodes_by_type(graph, "route")
        edges = graph.get("edges", [])
        result = []
        for n in route_nodes:
            data = n.get("data", {})
            connected = [e.get("target") for e in edges if e.get("source") == n.get("id")]
            result.append({
                "id": n.get("id"),
                "label": data.get("label"),
                "method": data.get("method", "GET"),
                "path": data.get("path", data.get("label")),
                "handler": data.get("handler"),
                "filepath": data.get("filepath"),
                "connected_nodes": connected,
            })
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "get_node_details":
        query = arguments.get("query", "")
        node = _find_node(graph, query)
        if node:
            return [TextContent(type="text", text=json.dumps(node, indent=2))]
        return [TextContent(type="text", text=f"Node not found: {query}")]

    elif name == "trace_data_flow":
        start = arguments.get("start_node", "")
        direction = arguments.get("direction", "downstream")
        # Resolve start node
        node = _find_node(graph, start)
        start_id = node.get("id") if node else start
        chain = _trace_flow(graph, start_id, direction)
        # Get labels
        node_map = {n.get("id"): n.get("data", {}).get("label", n.get("id")) for n in graph.get("nodes", [])}
        result = [{"id": nid, "label": node_map.get(nid, nid)} for nid in chain]
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "find_circular_dependencies":
        insights = graph.get("insights", {})
        circulars = insights.get("circular_dependencies", [])
        return [TextContent(type="text", text=json.dumps(circulars, indent=2))]

    elif name == "get_file_content":
        path_or_name = arguments.get("path_or_name", "")
        # Try as direct file path first
        fp = Path(path_or_name)
        if not fp.exists():
            # Try resolving via node
            node = _find_node(graph, path_or_name)
            if node:
                fp = Path(node.get("data", {}).get("filepath", ""))
        if fp.exists() and fp.is_file():
            try:
                content = fp.read_text(encoding="utf-8")
                return [TextContent(type="text", text=content)]
            except Exception as e:
                return [TextContent(type="text", text=f"Error reading file: {e}")]
        return [TextContent(type="text", text=f"File not found: {path_or_name}")]

    return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def main():
    logger.info("Starting Archy MCP server (stdio)")
    if CACHE_FILE.exists():
        graph = _load_graph()
        logger.info(
            "Loaded graph cache: %d nodes, %d edges, framework=%s",
            len(graph.get("nodes", [])),
            len(graph.get("edges", [])),
            graph.get("framework", "unknown"),
        )
    else:
        logger.warning("No graph cache found at %s — tools will return empty data until a project is parsed", CACHE_FILE)

    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
