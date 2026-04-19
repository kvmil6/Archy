from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Optional


class SQLiteInspector:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def inspect(self, include_row_counts: bool = True) -> Dict[str, Any]:
        if not os.path.isfile(self.db_path):
            raise FileNotFoundError(f"Database file not found: {self.db_path}")

        uri = f"file:{self.db_path}?mode=ro"
        try:
            conn = sqlite3.connect(uri, uri=True, timeout=5.0)
        except sqlite3.OperationalError as e:
            raise RuntimeError(f"Could not open database: {e}") from e

        conn.row_factory = sqlite3.Row
        try:
            tables = self._list_tables(conn)
            table_info: List[Dict[str, Any]] = []
            all_fks: List[Dict[str, str]] = []
            all_indexes: Dict[str, int] = {}

            for tbl in tables:
                columns = self._columns(conn, tbl)
                fks = self._foreign_keys(conn, tbl)
                indexes = self._indexes(conn, tbl)
                all_indexes[tbl] = len(indexes)
                row_count: Optional[int] = None
                if include_row_counts:
                    try:
                        row_count = conn.execute(
                            f"SELECT COUNT(*) FROM {self._quote(tbl)}"
                        ).fetchone()[0]
                    except sqlite3.Error:
                        row_count = None
                is_django_internal = tbl.startswith('django_') or tbl.startswith('auth_permission')
                is_many_to_many = self._looks_like_m2m(tbl, columns, fks)

                table_info.append({
                    'name': tbl,
                    'columns': columns,
                    'foreign_keys': fks,
                    'index_count': len(indexes),
                    'row_count': row_count,
                    'is_django_internal': is_django_internal,
                    'is_many_to_many': is_many_to_many,
                })
                for fk in fks:
                    all_fks.append({
                        'from_table': tbl,
                        'from_column': fk['from_column'],
                        'to_table': fk['to_table'],
                        'to_column': fk['to_column'],
                        'on_delete': fk.get('on_delete') or 'NO ACTION',
                    })

            try:
                sqlite_version = conn.execute('SELECT sqlite_version()').fetchone()[0]
            except sqlite3.Error:
                sqlite_version = 'unknown'
            file_size = os.path.getsize(self.db_path)

            return {
                'path': self.db_path,
                'sqlite_version': sqlite_version,
                'file_size_bytes': file_size,
                'table_count': len(tables),
                'tables': table_info,
                'foreign_keys': all_fks,
            }
        finally:
            conn.close()


    def _list_tables(self, conn: sqlite3.Connection) -> List[str]:
        rows = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        ).fetchall()
        return [r[0] for r in rows]

    def _columns(self, conn: sqlite3.Connection, table: str) -> List[Dict[str, Any]]:
        rows = conn.execute(f'PRAGMA table_info({self._quote(table)})').fetchall()
        return [
            {
                'name': r[1],
                'type': r[2],
                'not_null': bool(r[3]),
                'default': r[4],
                'primary_key': bool(r[5]),
            }
            for r in rows
        ]

    def _foreign_keys(self, conn: sqlite3.Connection, table: str) -> List[Dict[str, str]]:
        rows = conn.execute(f'PRAGMA foreign_key_list({self._quote(table)})').fetchall()
        return [
            {
                'from_column': r[3],
                'to_table': r[2],
                'to_column': r[4],
                'on_update': r[5],
                'on_delete': r[6],
            }
            for r in rows
        ]

    def _indexes(self, conn: sqlite3.Connection, table: str) -> List[str]:
        rows = conn.execute(f'PRAGMA index_list({self._quote(table)})').fetchall()
        return [r[1] for r in rows]

    def _quote(self, name: str) -> str:
        return '"' + name.replace('"', '""') + '"'

    def _looks_like_m2m(
        self, table: str, columns: List[Dict[str, Any]], fks: List[Dict[str, str]]
    ) -> bool:
        if len(fks) == 2 and len(columns) in (2, 3):
            return True
        return False


def build_db_graph_fragment(
    inspection: Dict[str, Any],
    existing_class_labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    tables = [t for t in inspection['tables'] if not t['is_django_internal']]

    for t in tables:
        pk_count = sum(1 for c in t['columns'] if c['primary_key'])
        nodes.append({
            'id': f"table:{t['name']}",
            'type': 'model',
            'data': {
                'label': t['name'],
                'filepath': f"sqlite://{inspection['path']}#{t['name']}",
                'description': (
                    f"{len(t['columns'])} cols · "
                    f"{t['index_count']} idx"
                    + (f" · {t['row_count']:,} rows" if t['row_count'] is not None else '')
                ),
                'methodCount': len(t['columns']),
                'complexity': pk_count + len(t['foreign_keys']),
                'category': 'data',
                'sourceType': 'database',
                'isMany2Many': t['is_many_to_many'],
                'columns': [c['name'] for c in t['columns'][:10]],
                'rowCount': t['row_count'],
            },
        })

    for fk in inspection['foreign_keys']:
        src = f"table:{fk['from_table']}"
        tgt = f"table:{fk['to_table']}"
        label = f"FK: {fk['from_column']}"
        edges.append({
            'id': f"db-fk-{fk['from_table']}-{fk['to_table']}-{fk['from_column']}",
            'source': src,
            'target': tgt,
            'type': 'smoothstep',
            'animated': True,
            'label': label,
            'data': {'kind': 'db-fk'},
            'style': {'stroke': '#22d3ee', 'strokeWidth': 1.5, 'strokeDasharray': '4 2'},
            'labelStyle': {'fill': '#22d3ee', 'fontSize': 10, 'fontWeight': 600},
        })

    if existing_class_labels:
        class_set = {c.lower() for c in existing_class_labels}
        for t in tables:
            name_parts = t['name'].split('_')
            last = name_parts[-1] if name_parts else t['name']
            if last in class_set:
                edges.append({
                    'id': f"db-class-{t['name']}",
                    'source': f"class-by-label:{last}",
                    'target': f"table:{t['name']}",
                    'type': 'smoothstep',
                    'animated': False,
                    'label': 'stored in',
                    'data': {'kind': 'class-table'},
                    'style': {'stroke': '#4ade80', 'strokeWidth': 1, 'strokeDasharray': '2 2'},
                })

    return {
        'nodes': nodes,
        'edges': edges,
        'metadata': {
            'path': inspection['path'],
            'table_count': len(tables),
            'sqlite_version': inspection['sqlite_version'],
            'file_size_bytes': inspection['file_size_bytes'],
        },
    }
