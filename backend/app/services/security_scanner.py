"""
Part 8 — Graph-Aware Security Scanner.

OWASP-informed rules that leverage the architecture graph to detect
vulnerabilities that file-level scanners miss.
"""
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Severity levels
CRITICAL = "CRITICAL"
HIGH = "HIGH"
MEDIUM = "MEDIUM"


def scan_graph(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    file_contents: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Run all graph-aware security rules. Returns list of issues."""
    issues: list[dict[str, Any]] = []
    file_contents = file_contents or {}

    node_map = {n.get("id", ""): n for n in nodes}
    edge_sources: dict[str, list[str]] = {}
    edge_targets: dict[str, list[str]] = {}
    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        edge_sources.setdefault(src, []).append(tgt)
        edge_targets.setdefault(tgt, []).append(src)

    # RULE 001 — Unprotected routes
    issues.extend(_rule_001_unprotected_routes(nodes, edge_targets, node_map))
    # RULE 002 — Direct SQL in views
    issues.extend(_rule_002_direct_sql(nodes, file_contents))
    # RULE 003 — Exposed admin without auth
    issues.extend(_rule_003_exposed_admin(nodes, edges, file_contents))
    # RULE 004 — Hardcoded secrets
    issues.extend(_rule_004_hardcoded_secrets(nodes, file_contents))
    # RULE 005 — eval/exec usage
    issues.extend(_rule_005_eval_exec(nodes, file_contents))
    # RULE 006 — Missing CSRF
    issues.extend(_rule_006_missing_csrf(nodes, file_contents))
    # RULE 007 — Debug mode
    issues.extend(_rule_007_debug_mode(nodes, file_contents))

    return issues


# ── Rule implementations ─────────────────────────────────────────────

def _rule_001_unprotected_routes(
    nodes: list[dict], edge_targets: dict, node_map: dict
) -> list[dict]:
    """RULE 001 (HIGH) — Route with no edge to auth middleware."""
    PUBLIC_PATTERNS = {"health", "ping", "status", "favicon", "robots", "sitemap", "docs", "openapi", "redoc"}
    issues = []
    route_nodes = [n for n in nodes if n.get("type") in ("route", "view", "endpoint")]
    auth_ids = {
        n.get("id") for n in nodes
        if any(kw in (n.get("data", {}).get("label", "") or "").lower()
               for kw in ("auth", "permission", "login_required", "jwt", "token"))
    }

    for rn in route_nodes:
        rid = rn.get("id", "")
        label = (rn.get("data", {}).get("label", "") or "").lower()
        if any(pub in label for pub in PUBLIC_PATTERNS):
            continue
        upstream = set(edge_targets.get(rid, []))
        if not upstream & auth_ids:
            issues.append({
                "rule": "001",
                "severity": HIGH,
                "title": "Unprotected route",
                "description": f"Route '{rn.get('data', {}).get('label', rid)}' has no connection to auth middleware",
                "node_id": rid,
                "filepath": rn.get("data", {}).get("filepath", ""),
                "line": rn.get("data", {}).get("line_number"),
            })
    return issues


def _rule_002_direct_sql(nodes: list[dict], file_contents: dict) -> list[dict]:
    """RULE 002 (HIGH) — Controller/view importing raw SQL patterns."""
    SQL_PATTERNS = [
        re.compile(r"execute\s*\(\s*['\"]", re.IGNORECASE),
        re.compile(r"raw\s*\(\s*['\"].*(?:SELECT|INSERT|UPDATE|DELETE)", re.IGNORECASE),
        re.compile(r"cursor\(\)", re.IGNORECASE),
    ]
    issues = []
    view_nodes = [n for n in nodes if n.get("type") in ("view", "controller", "route")]
    for vn in view_nodes:
        fp = vn.get("data", {}).get("filepath", "")
        content = file_contents.get(fp, "")
        if not content:
            continue
        for pat in SQL_PATTERNS:
            m = pat.search(content)
            if m:
                issues.append({
                    "rule": "002",
                    "severity": HIGH,
                    "title": "Direct SQL in view/controller",
                    "description": f"File contains raw SQL pattern in a controller: '{m.group()[:50]}'",
                    "node_id": vn.get("id", ""),
                    "filepath": fp,
                    "line": content[:m.start()].count("\n") + 1,
                })
                break
    return issues


def _rule_003_exposed_admin(
    nodes: list[dict], edges: list[dict], file_contents: dict
) -> list[dict]:
    """RULE 003 (MEDIUM) — Admin registered without auth checks."""
    issues = []
    admin_nodes = [
        n for n in nodes
        if "admin" in (n.get("data", {}).get("label", "") or "").lower()
        and n.get("type") in ("class", "view", "admin")
    ]
    for an in admin_nodes:
        fp = an.get("data", {}).get("filepath", "")
        content = file_contents.get(fp, "")
        if content and "admin.site.register" in content:
            if not any(kw in content for kw in ("permission_required", "login_required", "has_permission")):
                issues.append({
                    "rule": "003",
                    "severity": MEDIUM,
                    "title": "Exposed admin without auth",
                    "description": f"Admin registration in '{fp}' without explicit permission checks",
                    "node_id": an.get("id", ""),
                    "filepath": fp,
                })
    return issues


def _rule_004_hardcoded_secrets(nodes: list[dict], file_contents: dict) -> list[dict]:
    """RULE 004 (CRITICAL) — Hardcoded secrets."""
    SECRET_PAT = re.compile(
        r"(SECRET_KEY|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL)\s*=\s*['\"][^'\"]{5,}['\"]",
        re.IGNORECASE,
    )
    ENV_PAT = re.compile(r"os\.environ|os\.getenv|settings\.|config\.", re.IGNORECASE)
    issues = []
    seen_files: set[str] = set()
    for n in nodes:
        fp = n.get("data", {}).get("filepath", "")
        if not fp or fp in seen_files:
            continue
        seen_files.add(fp)
        content = file_contents.get(fp, "")
        if not content:
            continue
        for m in SECRET_PAT.finditer(content):
            # Check if line also has env reference
            line_start = content.rfind("\n", 0, m.start()) + 1
            line_end = content.find("\n", m.end())
            line = content[line_start:line_end if line_end > 0 else len(content)]
            if ENV_PAT.search(line):
                continue
            if line.lstrip().startswith("#"):
                continue
            issues.append({
                "rule": "004",
                "severity": CRITICAL,
                "title": "Hardcoded secret",
                "description": f"Possible hardcoded secret: '{m.group()[:40]}...'",
                "node_id": n.get("id", ""),
                "filepath": fp,
                "line": content[:m.start()].count("\n") + 1,
            })
    return issues


def _rule_005_eval_exec(nodes: list[dict], file_contents: dict) -> list[dict]:
    """RULE 005 (HIGH) — eval() or exec() usage."""
    EVAL_PAT = re.compile(r"\b(eval|exec)\s*\(")
    issues = []
    seen_files: set[str] = set()
    for n in nodes:
        fp = n.get("data", {}).get("filepath", "")
        if not fp or fp in seen_files:
            continue
        seen_files.add(fp)
        content = file_contents.get(fp, "")
        if not content:
            continue
        for m in EVAL_PAT.finditer(content):
            line_start = content.rfind("\n", 0, m.start()) + 1
            line = content[line_start:content.find("\n", m.end())]
            if line.lstrip().startswith("#"):
                continue
            issues.append({
                "rule": "005",
                "severity": HIGH,
                "title": f"Dangerous {m.group(1)}() usage",
                "description": f"Usage of {m.group(1)}() detected — potential code injection",
                "node_id": n.get("id", ""),
                "filepath": fp,
                "line": content[:m.start()].count("\n") + 1,
            })
    return issues


def _rule_006_missing_csrf(nodes: list[dict], file_contents: dict) -> list[dict]:
    """RULE 006 (MEDIUM) — POST routes in Django without CSRF protection."""
    issues = []
    for n in nodes:
        data = n.get("data", {})
        method = (data.get("method") or "").upper()
        if method != "POST":
            continue
        fp = data.get("filepath", "")
        content = file_contents.get(fp, "")
        if not content:
            continue
        # Only relevant for Django
        if "django" not in content.lower() and "csrf" not in content.lower():
            continue
        if "csrf_exempt" in content:
            continue
        if "CsrfViewMiddleware" not in content and "CSRFMiddleware" not in content:
            issues.append({
                "rule": "006",
                "severity": MEDIUM,
                "title": "Missing CSRF protection",
                "description": f"POST route '{data.get('label', '')}' may lack CSRF protection",
                "node_id": n.get("id", ""),
                "filepath": fp,
            })
    return issues


def _rule_007_debug_mode(nodes: list[dict], file_contents: dict) -> list[dict]:
    """RULE 007 (MEDIUM) — DEBUG = True in settings/config."""
    DEBUG_PAT = re.compile(r"DEBUG\s*=\s*True")
    issues = []
    seen_files: set[str] = set()
    for n in nodes:
        fp = n.get("data", {}).get("filepath", "")
        if not fp or fp in seen_files:
            continue
        seen_files.add(fp)
        fname = fp.split("/")[-1].lower() if "/" in fp else fp.split("\\")[-1].lower()
        if fname not in ("settings.py", "config.py", ".env", "base.py", "local.py", "development.py"):
            continue
        content = file_contents.get(fp, "")
        if not content:
            continue
        m = DEBUG_PAT.search(content)
        if m:
            line_start = content.rfind("\n", 0, m.start()) + 1
            line = content[line_start:content.find("\n", m.end())]
            if line.lstrip().startswith("#"):
                continue
            issues.append({
                "rule": "007",
                "severity": MEDIUM,
                "title": "Debug mode enabled",
                "description": f"DEBUG = True found in {fname}",
                "node_id": n.get("id", ""),
                "filepath": fp,
                "line": content[:m.start()].count("\n") + 1,
            })
    return issues
