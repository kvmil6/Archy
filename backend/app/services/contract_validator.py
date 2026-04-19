"""
Feature 7 — API Contract Validation.

For route nodes, extract declared request/response schemas and cross-reference
with the actual implementation to detect mismatches.
"""
from __future__ import annotations

import ast
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Common Pydantic / DRF serializer base classes
SCHEMA_BASES = {
    "BaseModel", "Schema", "Serializer", "ModelSerializer",
    "HyperlinkedModelSerializer", "ListSerializer",
}


def validate_contracts(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    file_contents: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    For every route/controller node, check:
    1. Does it reference a schema/serializer?
    2. Does the implementation use fields not in the declared schema?
    3. Missing schema entirely (untyped endpoint)?
    """
    if not file_contents:
        file_contents = {}

    node_map = {n.get("id", ""): n for n in nodes}
    route_nodes = [
        n for n in nodes
        if n.get("type", n.get("data", {}).get("type", "")) in ("route", "controller", "entryInterface")
    ]

    issues: list[dict[str, Any]] = []

    for rn in route_nodes:
        data = rn.get("data", {})
        filepath = data.get("filepath", "")
        label = data.get("label", "")

        if not filepath or filepath not in file_contents:
            continue

        content = file_contents[filepath]

        # Find schema references in this file
        schema_refs = _find_schema_refs(content)
        has_schema = len(schema_refs) > 0

        if not has_schema:
            # Check if there are POST/PUT/PATCH handlers without schema
            if _has_write_handlers(content):
                issues.append({
                    "type": "missing_schema",
                    "severity": "HIGH",
                    "node_id": rn.get("id", ""),
                    "filepath": filepath,
                    "label": label,
                    "description": f"Write endpoint '{label}' has no request schema/serializer — accepts unvalidated input",
                    "suggestion": "Add a Pydantic BaseModel or DRF Serializer to validate request data",
                })
        else:
            # Check for raw request.data / request.POST access bypassing schema
            raw_access = _find_raw_request_access(content)
            if raw_access:
                issues.append({
                    "type": "schema_bypass",
                    "severity": "MEDIUM",
                    "node_id": rn.get("id", ""),
                    "filepath": filepath,
                    "label": label,
                    "description": f"'{label}' declares schema {schema_refs} but also accesses raw request data: {raw_access}",
                    "suggestion": "Route all input through the declared schema instead of accessing request.data directly",
                })

        # Check for response without schema
        if _has_dict_response(content) and not _has_response_model(content):
            issues.append({
                "type": "untyped_response",
                "severity": "LOW",
                "node_id": rn.get("id", ""),
                "filepath": filepath,
                "label": label,
                "description": f"'{label}' returns dict/JsonResponse without a declared response schema",
                "suggestion": "Add a response_model (FastAPI) or serializer to document and validate the response shape",
            })

    by_severity = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for i in issues:
        by_severity[i["severity"]] = by_severity.get(i["severity"], 0) + 1

    return {
        "issues": issues,
        "total_issues": len(issues),
        "routes_checked": len(route_nodes),
        "by_severity": by_severity,
    }


def _find_schema_refs(content: str) -> list[str]:
    """Find Pydantic/DRF schema class references."""
    refs = []
    # Pydantic: class Foo(BaseModel)
    for m in re.finditer(r"class\s+(\w+)\s*\([^)]*(?:BaseModel|Schema)[^)]*\)", content):
        refs.append(m.group(1))
    # DRF: class Foo(serializers.Serializer / ModelSerializer)
    for m in re.finditer(r"class\s+(\w+)\s*\([^)]*Serializer[^)]*\)", content):
        refs.append(m.group(1))
    # FastAPI: def handler(data: SomeModel)
    for m in re.finditer(r"def\s+\w+\s*\([^)]*:\s*(\w+)", content):
        name = m.group(1)
        if name[0].isupper() and name not in ("Request", "Response", "HTTPException"):
            refs.append(name)
    return list(set(refs))


def _has_write_handlers(content: str) -> bool:
    """Check if file has POST/PUT/PATCH handlers."""
    patterns = [
        r"@.*\.(post|put|patch)\b",
        r"methods\s*=\s*\[.*(?:POST|PUT|PATCH)",
        r"def\s+(?:post|put|patch|create|update)\s*\(",
        r"action\s*=\s*['\"](?:POST|PUT|PATCH)",
    ]
    return any(re.search(p, content, re.IGNORECASE) for p in patterns)


def _find_raw_request_access(content: str) -> list[str]:
    """Find direct request data access patterns."""
    patterns = [
        (r"request\.data\[", "request.data[]"),
        (r"request\.POST\[", "request.POST[]"),
        (r"request\.json\b", "request.json"),
        (r"request\.body\b", "request.body"),
        (r"request\.form\b", "request.form"),
    ]
    found = []
    for pat, label in patterns:
        if re.search(pat, content):
            found.append(label)
    return found


def _has_dict_response(content: str) -> bool:
    """Check if view returns raw dicts."""
    return bool(re.search(r"return\s+\{|JsonResponse\(|jsonify\(", content))


def _has_response_model(content: str) -> bool:
    """Check if endpoint declares a response model."""
    return bool(re.search(r"response_model\s*=|response_class\s*=", content))
