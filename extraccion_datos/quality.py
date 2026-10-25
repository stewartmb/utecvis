"""Contratos y controles de integridad antes de publicar datos."""

from jsonschema import Draft202012Validator

NODE_SCHEMA = {
    "type": "object",
    "required": [
        "id",
        "name",
        "image_url",
        "department",
        "email",
        "research_groups",
        "research_areas",
        "citations",
        "source_url",
        "retrieved_at",
    ],
    "properties": {
        "id": {"type": "integer", "minimum": 0, "maximum": 4503599627370495},
        "name": {"type": "string", "minLength": 1},
        "image_url": {"type": ["string", "null"]},
        "department": {"type": ["string", "null"]},
        "email": {"type": ["string", "null"]},
        "research_groups": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
        "research_areas": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
        "citations": {"type": ["integer", "null"], "minimum": 0},
        "source_url": {"type": "string", "pattern": "^https://cris\\.utec\\.edu\\.pe/es/persons/"},
        "retrieved_at": {"type": "string", "minLength": 1},
    },
}


def validate_nodes(nodes):
    if not nodes:
        raise ValueError("Conjunto vacío: no se publica como extracción exitosa.")
    validator = Draft202012Validator(NODE_SCHEMA)
    seen = set()
    urls = set()
    for node in nodes:
        validator.validate(node)
        if node["id"] in seen or node["source_url"] in urls:
            raise ValueError(f"Profesor duplicado: {node['id']}")
        seen.add(node["id"])
        urls.add(node["source_url"])
        if node["citations"] is not None and not (
            node.get("citation_source") and node.get("citation_retrieved_at")
        ):
            raise ValueError("Las citas requieren proveedor y fecha de consulta.")
    return {
        "node_count": len(nodes),
        "missing_department": sum(not n["department"] for n in nodes),
        "missing_research_groups": sum(not n["research_groups"] for n in nodes),
        "missing_research_areas": sum(not n["research_areas"] for n in nodes),
        "missing_citations": sum(n["citations"] is None for n in nodes),
    }


def validate_network(network):
    report = validate_nodes(network["nodes"])
    ids = {node["id"] for node in network["nodes"]}
    seen = set()
    for edge in network["edges"]:
        a, b = edge["source"], edge["target"]
        if a not in ids or b not in ids:
            raise ValueError("Arista con nodo inexistente.")
        if a == b:
            raise ValueError("No se permiten autoenlaces.")
        pair = tuple(sorted((a, b)))
        if pair in seen:
            raise ValueError("Arista duplicada.")
        seen.add(pair)
        if not edge.get("relation") or not edge.get("evidence"):
            raise ValueError("Toda arista requiere tipo y evidencia.")
    report["edge_count"] = len(network["edges"])
    return report


def example_compatible(nodes):
    """Exporta exactamente los ocho campos del ejemplo; no inventa datos ausentes."""
    validate_nodes(nodes)
    return {
        "nodes": [
            {
                "image_url": n["image_url"] or "",
                "department": n["department"] or "Unknown Department",
                "email": n["email"] or "",
                "research_groups": "; ".join(n["research_groups"]),
                "research_areas": "; ".join(n["research_areas"]),
                "citations": n["citations"],
                "id": n["id"],
                "name": n["name"],
            }
            for n in nodes
        ]
    }
