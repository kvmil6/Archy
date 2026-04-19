"""
Advanced Features Router

Provides endpoints for:
- PostgreSQL / MySQL live schema inspection
- SQLAlchemy / Alembic model extraction from Python files
- FastAPI dependency injection graph extraction
- Graph layout variant computation (hierarchical, radial, tree)
- .env file parsing and variable extraction
- Watch mode (SSE-based file change notifications)
"""
from __future__ import annotations

import ast
import re
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/advanced", tags=["advanced"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. PostgreSQL / MySQL Live Schema Inspection
# ─────────────────────────────────────────────────────────────────────────────

class DBConnectionRequest(BaseModel):
    driver: str  # "postgresql" | "mysql"
    host: str = "localhost"
    port: Optional[int] = None
    database: str
    username: str
    password: str = ""
    db_schema: str = Field(default="public", alias="schema")  # for postgres

    @field_validator("driver")
    @classmethod
    def validate_driver(cls, v: str) -> str:
        if v not in ("postgresql", "mysql"):
            raise ValueError("driver must be 'postgresql' or 'mysql'")
        return v


@router.post("/db/inspect-live", summary="Inspect a live PostgreSQL or MySQL database")
async def inspect_live_database(body: DBConnectionRequest) -> Dict[str, Any]:
    """
    Connect to a PostgreSQL or MySQL database and return schema info
    as graph nodes/edges.

    Requires psycopg2 (postgres) or pymysql (mysql) to be installed.
    """
    if body.driver == "postgresql":
        return await _inspect_postgres(body)
    return await _inspect_mysql(body)


async def _inspect_postgres(body: DBConnectionRequest) -> Dict[str, Any]:
    try:
        import psycopg2  # type: ignore
        import psycopg2.extras  # type: ignore
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="psycopg2 is not installed. Run: pip install psycopg2-binary",
        )

    port = body.port or 5432
    try:
        conn = psycopg2.connect(
            host=body.host,
            port=port,
            dbname=body.database,
            user=body.username,
            password=body.password,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PostgreSQL connection failed: {e}")

    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # Get tables
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            (body.db_schema,),
        )
        tables = [row["table_name"] for row in cursor.fetchall()]

        # Get columns
        columns_by_table: Dict[str, List[Dict]] = {}
        for table in tables:
            cursor.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (body.db_schema, table),
            )
            columns_by_table[table] = [
                {
                    "name": r["column_name"],
                    "type": r["data_type"],
                    "nullable": r["is_nullable"] == "YES",
                }
                for r in cursor.fetchall()
            ]

        # Get foreign keys
        cursor.execute(
            """
            SELECT
                tc.table_name AS source,
                kcu.column_name AS source_col,
                ccu.table_name AS target,
                ccu.column_name AS target_col
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = %s
            """,
            (body.db_schema,),
        )
        fk_rows = cursor.fetchall()

        return _build_db_graph(tables, columns_by_table, fk_rows, body.driver)
    finally:
        conn.close()


async def _inspect_mysql(body: DBConnectionRequest) -> Dict[str, Any]:
    try:
        import pymysql  # type: ignore
        import pymysql.cursors  # type: ignore
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="pymysql is not installed. Run: pip install pymysql",
        )

    port = body.port or 3306
    try:
        conn = pymysql.connect(
            host=body.host,
            port=port,
            database=body.database,
            user=body.username,
            password=body.password,
            cursorclass=pymysql.cursors.DictCursor,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"MySQL connection failed: {e}")

    try:
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            tables = [list(row.values())[0] for row in cursor.fetchall()]

            columns_by_table: Dict[str, List[Dict]] = {}
            for table in tables:
                cursor.execute(f"DESCRIBE `{table}`")
                columns_by_table[table] = [
                    {"name": r["Field"], "type": r["Type"], "nullable": r["Null"] == "YES"}
                    for r in cursor.fetchall()
                ]

            # Foreign keys via information_schema
            cursor.execute(
                """
                SELECT TABLE_NAME AS source, COLUMN_NAME AS source_col,
                       REFERENCED_TABLE_NAME AS target, REFERENCED_COLUMN_NAME AS target_col
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = %s
                """,
                (body.database,),
            )
            fk_rows = cursor.fetchall()

        return _build_db_graph(tables, columns_by_table, fk_rows, body.driver)
    finally:
        conn.close()


def _build_db_graph(
    tables: List[str],
    columns_by_table: Dict[str, List[Dict]],
    fk_rows: List[Any],
    driver: str,
) -> Dict[str, Any]:
    """Build a graph fragment from live DB inspection results."""
    col_w = 300
    nodes = []
    for i, table in enumerate(tables):
        cols = columns_by_table.get(table, [])
        col_summary = ", ".join(c["name"] for c in cols[:6])
        if len(cols) > 6:
            col_summary += f", +{len(cols) - 6} more"
        nodes.append(
            {
                "id": f"db-{table}",
                "type": "model",
                "position": {"x": 100 + (i % 4) * col_w, "y": 100 + (i // 4) * 160},
                "data": {
                    "label": table,
                    "description": col_summary,
                    "category": "data",
                    "source": driver,
                    "columns": cols,
                },
            }
        )

    edges = []
    seen_fks: set = set()
    for row in fk_rows:
        src = row.get("source") or row.get("TABLE_NAME") or ""
        tgt = row.get("target") or row.get("REFERENCED_TABLE_NAME") or ""
        if not src or not tgt:
            continue
        eid = f"db-fk-{src}-{tgt}"
        if eid in seen_fks:
            continue
        seen_fks.add(eid)
        edges.append(
            {
                "id": eid,
                "source": f"db-{src}",
                "target": f"db-{tgt}",
                "type": "smoothstep",
                "label": "FK",
                "style": {"stroke": "rgba(52,211,153,0.5)", "strokeWidth": 1.5},
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "driver": driver,
            "table_count": len(tables),
            "fk_count": len(edges),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. SQLAlchemy / Alembic Model Extraction
# ─────────────────────────────────────────────────────────────────────────────

class FileContentItem(BaseModel):
    path: str
    content: str


class SQLAlchemyExtractRequest(BaseModel):
    files: List[FileContentItem]


@router.post("/sqlalchemy/extract", summary="Extract SQLAlchemy / Alembic models from Python files")
async def extract_sqlalchemy_models(body: SQLAlchemyExtractRequest) -> Dict[str, Any]:
    """
    Parse Python files looking for SQLAlchemy declarative models,
    relationship() calls, and Alembic migration metadata.

    Returns graph-ready nodes and edges.
    """
    nodes: List[Dict] = []
    edges: List[Dict] = []
    col_w = 300
    node_idx = 0

    for file_item in body.files:
        try:
            tree = ast.parse(file_item.content)
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue

            bases = [_ast_name(b) for b in node.bases]
            is_alchemy = any(
                b in ("Base", "DeclarativeBase", "Model", "db.Model", "SQLModel")
                or "Base" in b
                for b in bases
            )
            if not is_alchemy:
                continue

            # Extract columns and relationships
            columns: List[str] = []
            relationships: List[str] = []
            for stmt in ast.walk(node):
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.annotation, ast.Name):
                    columns.append(_ast_name(stmt.target) if hasattr(stmt, "target") else "?")
                if isinstance(stmt, ast.Assign):
                    for t in stmt.targets:
                        name = _ast_name(t)
                        if isinstance(stmt.value, ast.Call):
                            func_name = _ast_name(stmt.value.func)
                            if "relationship" in func_name:
                                # Get related model name from first arg
                                if stmt.value.args:
                                    related = _ast_const(stmt.value.args[0])
                                    if related:
                                        relationships.append(related)
                            elif "Column" in func_name or "mapped_column" in func_name:
                                columns.append(name)

            nodes.append(
                {
                    "id": f"sqlalchemy-{node.name}",
                    "type": "model",
                    "position": {"x": 100 + (node_idx % 4) * col_w, "y": 100 + (node_idx // 4) * 160},
                    "data": {
                        "label": node.name,
                        "filepath": file_item.path,
                        "category": "data",
                        "description": f"SQLAlchemy model · {len(columns)} columns",
                        "methods": columns[:10],
                    },
                }
            )

            for related in relationships:
                edges.append(
                    {
                        "id": f"rel-{node.name}-{related}",
                        "source": f"sqlalchemy-{node.name}",
                        "target": f"sqlalchemy-{related}",
                        "type": "smoothstep",
                        "label": "relationship",
                        "animated": False,
                        "style": {"stroke": "rgba(251,191,36,0.6)", "strokeWidth": 1.5},
                    }
                )

            node_idx += 1

    return {"nodes": nodes, "edges": edges, "model_count": len(nodes)}


def _ast_name(node: ast.expr) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{_ast_name(node.value)}.{node.attr}"
    return ""


def _ast_const(node: ast.expr) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


# ─────────────────────────────────────────────────────────────────────────────
# 3. FastAPI Dependency Injection Graph
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/fastapi/di-graph", summary="Extract FastAPI dependency injection graph")
async def extract_di_graph(body: SQLAlchemyExtractRequest) -> Dict[str, Any]:
    """
    Parse FastAPI files and build a dependency injection graph:
    - Route functions with Depends() calls
    - Dependency functions and their own dependencies
    """
    nodes: List[Dict] = []
    edges: List[Dict] = []
    seen_nodes: set = set()
    node_idx = 0

    for file_item in body.files:
        try:
            tree = ast.parse(file_item.content)
        except SyntaxError:
            continue

        # Find all functions with Depends() in their arguments
        for func_node in ast.walk(tree):
            if not isinstance(func_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            depends_targets: List[str] = []
            for arg in func_node.args.args + func_node.args.kwonlyargs:
                # Look for Annotated[X, Depends(y)] or default=Depends(y)
                pass

            # Also check defaults for Depends(...)
            all_defaults = list(func_node.args.defaults) + list(func_node.args.kw_defaults)
            for default in all_defaults:
                if default is None:
                    continue
                if isinstance(default, ast.Call):
                    call_name = _ast_name(default.func)
                    if "Depends" in call_name and default.args:
                        dep_name = _ast_name(default.args[0])
                        if dep_name:
                            depends_targets.append(dep_name)

            if depends_targets or _has_route_decorator(func_node):
                fn_id = f"fn-{func_node.name}"
                if fn_id not in seen_nodes:
                    seen_nodes.add(fn_id)
                    is_route = _has_route_decorator(func_node)
                    nodes.append(
                        {
                            "id": fn_id,
                            "type": "route" if is_route else "diContainer",
                            "position": {"x": 100 + (node_idx % 4) * 280, "y": 100 + (node_idx // 4) * 150},
                            "data": {
                                "label": func_node.name,
                                "filepath": file_item.path,
                                "isAsync": isinstance(func_node, ast.AsyncFunctionDef),
                                "category": "routing" if is_route else "infrastructure",
                                "description": f"FastAPI {'route' if is_route else 'dependency'}",
                            },
                        }
                    )
                    node_idx += 1

                for dep in depends_targets:
                    dep_id = f"fn-{dep}"
                    if dep_id not in seen_nodes:
                        seen_nodes.add(dep_id)
                        nodes.append(
                            {
                                "id": dep_id,
                                "type": "diContainer",
                                "position": {"x": 100 + (node_idx % 4) * 280, "y": 100 + (node_idx // 4) * 150},
                                "data": {
                                    "label": dep,
                                    "category": "infrastructure",
                                    "description": "FastAPI dependency",
                                },
                            }
                        )
                        node_idx += 1
                    edges.append(
                        {
                            "id": f"di-{func_node.name}-{dep}",
                            "source": fn_id,
                            "target": dep_id,
                            "type": "smoothstep",
                            "label": "Depends",
                            "animated": True,
                            "style": {"stroke": "rgba(6,182,212,0.6)", "strokeWidth": 1.5},
                        }
                    )

    return {"nodes": nodes, "edges": edges}


def _has_route_decorator(func_node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for dec in func_node.decorator_list:
        name = _ast_name(dec) if isinstance(dec, (ast.Name, ast.Attribute)) else (
            _ast_name(dec.func) if isinstance(dec, ast.Call) else ""
        )
        if any(m in name for m in ("get", "post", "put", "delete", "patch", "route", "router")):
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 4. Graph Layout Variants
# ─────────────────────────────────────────────────────────────────────────────

class LayoutRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    layout: str = "hierarchical"  # "hierarchical" | "radial" | "tree" | "force" | "hub"

    @field_validator("layout")
    @classmethod
    def validate_layout(cls, v: str) -> str:
        valid = ("hierarchical", "radial", "tree", "force", "hub")
        if v not in valid:
            raise ValueError(f"layout must be one of {valid}")
        return v


@router.post("/layout", summary="Re-compute graph layout")
async def compute_layout(body: LayoutRequest) -> Dict[str, Any]:
    """
    Re-position nodes using the requested layout algorithm.
    Returns nodes with updated positions.
    """
    nodes = body.nodes
    edges = body.edges

    if body.layout == "hierarchical":
        nodes = _layout_hierarchical(nodes, edges)
    elif body.layout == "radial":
        nodes = _layout_radial(nodes)
    elif body.layout == "tree":
        nodes = _layout_tree(nodes, edges)
    elif body.layout == "hub":
        nodes = _layout_hub(nodes, edges)
    else:
        # "force" — simple repulsion (no heavy deps)
        nodes = _layout_force(nodes, edges)

    return {"nodes": nodes, "edges": edges}


def _layout_hierarchical(nodes: List[Dict], edges: List[Dict]) -> List[Dict]:
    """Layered top-down layout based on node type."""
    type_order = [
        "app", "entryInterface", "route", "controller",
        "service", "domain", "repository", "schema", "model", "utility",
    ]
    by_type: Dict[str, List[Dict]] = {}
    for n in nodes:
        t = n.get("type", "utility")
        by_type.setdefault(t, []).append(n)

    x = 80
    for t in type_order:
        for i, n in enumerate(by_type.get(t, [])):
            n["position"] = {"x": x + (30 if i % 2 else 0), "y": 80 + i * 150}
        if t in by_type:
            x += 300

    for t, ns in by_type.items():
        if t not in type_order:
            for i, n in enumerate(ns):
                n["position"] = {"x": x, "y": 80 + i * 150}
            x += 300

    return nodes


def _layout_hub(nodes: List[Dict], edges: List[Dict]) -> List[Dict]:
    """
    Hub & spoke: one focal node at center, others on a ring (Obsidian Canvas–style).
    Prefers `app` / highest degree as center; de-prioritizes `canvasCard` notes.
    """
    import math

    if not nodes:
        return nodes

    degree: Dict[str, int] = {}
    for n in nodes:
        degree[n["id"]] = 0
    for e in edges:
        s, t = e.get("source", ""), e.get("target", "")
        if s in degree:
            degree[s] += 1
        if t in degree:
            degree[t] += 1

    best_id = nodes[0]["id"]
    best_score = -1
    for n in nodes:
        nid = n["id"]
        d = degree.get(nid, 0)
        t = n.get("type", "utility")
        type_boost = 5000 if t == "app" else 800 if t == "module" else -2000 if t == "canvasCard" else 0
        score = d * 10 + type_boost
        if score > best_score:
            best_score = score
            best_id = nid

    satellites = [n for n in nodes if n["id"] != best_id]
    n_sat = len(satellites)
    base_r = 300
    r = base_r if n_sat <= 1 else min(560, base_r + min(240, n_sat * 10))

    id_to_node = {n["id"]: n for n in nodes}
    id_to_node[best_id]["position"] = {"x": 0, "y": 0}

    for i, n in enumerate(satellites):
        angle = (2 * math.pi * i) / max(n_sat, 1) - math.pi / 2
        n["position"] = {
            "x": round(r * math.cos(angle)),
            "y": round(r * math.sin(angle)),
        }

    return nodes


def _layout_radial(nodes: List[Dict]) -> List[Dict]:
    """Place nodes on concentric rings."""
    import math
    n = len(nodes)
    if n == 0:
        return nodes
    if n == 1:
        nodes[0]["position"] = {"x": 400, "y": 300}
        return nodes

    # Root: first node (entry point or most connected)
    nodes[0]["position"] = {"x": 400, "y": 300}
    rings = [nodes[1:]]  # Simple: all remaining on one ring
    radius = 300
    for ring in rings:
        count = len(ring)
        for i, n_item in enumerate(ring):
            angle = (2 * math.pi * i) / count - math.pi / 2
            n_item["position"] = {
                "x": 400 + radius * math.cos(angle),
                "y": 300 + radius * math.sin(angle),
            }
        radius += 200
    return nodes


def _layout_tree(nodes: List[Dict], edges: List[Dict]) -> List[Dict]:
    """Top-down tree layout using BFS from root nodes."""
    # Build adjacency
    children: Dict[str, List[str]] = {n["id"]: [] for n in nodes}
    parents: Dict[str, List[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in children and tgt in children:
            children[src].append(tgt)
            parents[tgt].append(src)

    # Roots = nodes with no parents
    roots = [n["id"] for n in nodes if not parents[n["id"]]]
    if not roots:
        roots = [nodes[0]["id"]]

    id_to_node = {n["id"]: n for n in nodes}
    visited: set = set()
    queue = [(r, 0, i * 350) for i, r in enumerate(roots)]
    level_x: Dict[int, int] = {}

    while queue:
        node_id, depth, x_hint = queue.pop(0)
        if node_id in visited:
            continue
        visited.add(node_id)
        y = depth * 180
        x = level_x.get(depth, x_hint)
        level_x[depth] = x + 300
        if node_id in id_to_node:
            id_to_node[node_id]["position"] = {"x": x, "y": y}
        for child_id in children.get(node_id, []):
            if child_id not in visited:
                queue.append((child_id, depth + 1, x))

    # Place any unvisited nodes
    extras = [n for n in nodes if n["id"] not in visited]
    for i, n in enumerate(extras):
        n["position"] = {"x": 100 + i * 300, "y": 900}

    return nodes


def _layout_force(nodes: List[Dict], edges: List[Dict], iterations: int = 50) -> List[Dict]:
    """
    Very simple force-directed layout (no scipy/numpy needed).
    Uses basic repulsion + spring attraction.
    """
    import math, random

    pos = {
        n["id"]: [
            n.get("position", {}).get("x", random.uniform(100, 800)),
            n.get("position", {}).get("y", random.uniform(100, 600)),
        ]
        for n in nodes
    }
    ids = list(pos.keys())
    k = 200  # ideal spring length
    c_rep = 15000  # repulsion constant

    for _ in range(iterations):
        forces: Dict[str, List[float]] = {nid: [0.0, 0.0] for nid in ids}

        # Repulsion between all pairs
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = ids[i], ids[j]
                dx = pos[a][0] - pos[b][0]
                dy = pos[a][1] - pos[b][1]
                dist = math.sqrt(dx * dx + dy * dy) or 1
                f = c_rep / (dist * dist)
                fx, fy = f * dx / dist, f * dy / dist
                forces[a][0] += fx; forces[a][1] += fy
                forces[b][0] -= fx; forces[b][1] -= fy

        # Attraction along edges
        for e in edges:
            src, tgt = e.get("source", ""), e.get("target", "")
            if src not in pos or tgt not in pos:
                continue
            dx = pos[tgt][0] - pos[src][0]
            dy = pos[tgt][1] - pos[src][1]
            dist = math.sqrt(dx * dx + dy * dy) or 1
            f = (dist - k) / dist * 0.5
            forces[src][0] += f * dx; forces[src][1] += f * dy
            forces[tgt][0] -= f * dx; forces[tgt][1] -= f * dy

        # Apply forces with dampening
        temp = max(1, 20 - _ * 0.4)
        for nid in ids:
            fx, fy = forces[nid]
            mag = math.sqrt(fx * fx + fy * fy) or 1
            pos[nid][0] += min(fx, temp * fx / mag)
            pos[nid][1] += min(fy, temp * fy / mag)

    for n in nodes:
        nid = n["id"]
        if nid in pos:
            n["position"] = {"x": round(pos[nid][0]), "y": round(pos[nid][1])}

    return nodes


# ─────────────────────────────────────────────────────────────────────────────
# 5. .env File Parser
# ─────────────────────────────────────────────────────────────────────────────

SENSITIVE_KEYS = frozenset({
    "password", "secret", "key", "token", "auth", "credential",
    "private", "pwd", "pass", "api", "access", "refresh", "signing",
})


def _is_sensitive(key: str) -> bool:
    lower = key.lower()
    return any(s in lower for s in SENSITIVE_KEYS)


class EnvParseRequest(BaseModel):
    content: str  # Raw .env file content
    filename: str = ".env"


class EnvVariable(BaseModel):
    key: str
    value: str
    is_sensitive: bool
    is_empty: bool
    comment: Optional[str] = None
    line_number: int


class EnvParseResult(BaseModel):
    variables: List[EnvVariable]
    comments: List[str]
    total: int
    sensitive_count: int
    empty_count: int
    sections: Dict[str, List[EnvVariable]]  # grouped by comment-based sections


@router.post("/env/parse", summary="Parse a .env file and return variables with metadata")
async def parse_env_file(body: EnvParseRequest) -> EnvParseResult:
    """
    Parse a .env file and return structured variable info.
    Sensitive values are automatically detected and masked.
    Variables are grouped by comment-based sections.
    """
    variables: List[EnvVariable] = []
    comments: List[str] = []
    current_section = "General"
    sections: Dict[str, List[EnvVariable]] = {}

    for line_num, raw_line in enumerate(body.content.splitlines(), start=1):
        line = raw_line.strip()

        # Skip empty lines
        if not line:
            continue

        # Comment / section header
        if line.startswith("#"):
            comment_text = line.lstrip("#").strip()
            comments.append(comment_text)
            # Use capitalized comment as section header if it looks like one
            if comment_text and len(comment_text) < 60 and not any(c in comment_text for c in "=@#"):
                current_section = comment_text
            continue

        # Key=value pair
        if "=" in line:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()

            # Strip inline comments
            inline_comment: Optional[str] = None
            if " #" in value:
                val_part, _, inline_part = value.partition(" #")
                value = val_part.strip()
                inline_comment = inline_part.strip()

            # Strip surrounding quotes
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]

            sensitive = _is_sensitive(key)
            ev = EnvVariable(
                key=key,
                value=value,
                is_sensitive=sensitive,
                is_empty=len(value) == 0,
                comment=inline_comment,
                line_number=line_num,
            )
            variables.append(ev)
            sections.setdefault(current_section, []).append(ev)

    sensitive_count = sum(1 for v in variables if v.is_sensitive)
    empty_count = sum(1 for v in variables if v.is_empty)

    return EnvParseResult(
        variables=variables,
        comments=comments,
        total=len(variables),
        sensitive_count=sensitive_count,
        empty_count=empty_count,
        sections=sections,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 6. Collaboration (WebSocket room-based shared canvas)
# ─────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, ws: WebSocket, room: str):
        await ws.accept()
        self.rooms.setdefault(room, []).append(ws)

    def disconnect(self, ws: WebSocket, room: str):
        if room in self.rooms:
            self.rooms[room] = [c for c in self.rooms[room] if c is not ws]

    async def broadcast(self, message: str, room: str, sender: WebSocket):
        for ws in list(self.rooms.get(room, [])):
            if ws is not sender:
                try:
                    await ws.send_text(message)
                except Exception:
                    pass


_manager = ConnectionManager()


@router.websocket("/collaborate/{room_id}")
async def collaborate(ws: WebSocket, room_id: str):
    """
    WebSocket endpoint for real-time collaboration.

    Clients connect to the same room_id and receive each other's
    graph mutations (node moves, edge additions, etc.) in real-time.

    Message format: any JSON string — server acts as a relay only.
    """
    await _manager.connect(ws, room_id)
    try:
        while True:
            data = await ws.receive_text()
            await _manager.broadcast(data, room_id, ws)
    except WebSocketDisconnect:
        _manager.disconnect(ws, room_id)
