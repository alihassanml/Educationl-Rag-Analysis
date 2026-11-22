"""Print a Mermaid erDiagram of every table, read from the SQLAlchemy models.
Usage (from backend/): .venv/bin/python -m app.scripts.generate_erd > ../docs/erd.mmd
"""

import app.models  # noqa: F401  (registers every table)
from app.db.base import Base


def mermaid() -> str:
    lines = ["erDiagram"]
    for table in sorted(Base.metadata.tables.values(), key=lambda t: t.name):
        lines.append(f"    {table.name} {{")
        fks = {c.name for c in table.columns if c.foreign_keys}
        for col in table.columns:
            kind = str(col.type).split("(")[0].replace(" ", "_") or "unknown"
            tag = " PK" if col.primary_key else (" FK" if col.name in fks else "")
            lines.append(f"        {kind} {col.name}{tag}")
        lines.append("    }")
    seen = set()
    for table in Base.metadata.tables.values():
        for col in table.columns:
            for fk in col.foreign_keys:
                edge = (fk.column.table.name, table.name, col.name)
                if edge not in seen:
                    seen.add(edge)
                    lines.append(f'    {edge[0]} ||--o{{ {edge[1]} : "{col.name}"')
    return "\n".join(lines)


if __name__ == "__main__":
    print(mermaid())
