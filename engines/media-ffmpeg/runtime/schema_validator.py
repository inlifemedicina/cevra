from __future__ import annotations

import re
import math
from typing import Any


class SchemaValidationError(ValueError):
    pass


def validate(instance: Any, schema: dict[str, Any]) -> None:
    _validate(instance, schema, schema, "$")


def _resolve(root: dict[str, Any], reference: str) -> dict[str, Any]:
    if not reference.startswith("#/"):
        raise SchemaValidationError(f"unsupported schema reference: {reference}")
    value: Any = root
    for part in reference[2:].split("/"):
        if not isinstance(value, dict) or part not in value:
            raise SchemaValidationError(f"unresolved schema reference: {reference}")
        value = value[part]
    if not isinstance(value, dict):
        raise SchemaValidationError(f"schema reference is not an object: {reference}")
    return value


def _validate(instance: Any, schema: dict[str, Any], root: dict[str, Any], location: str) -> None:
    if "$ref" in schema:
        _validate(instance, _resolve(root, schema["$ref"]), root, location)
        return
    if "const" in schema and instance != schema["const"]:
        raise SchemaValidationError(f"{location} does not match schema const")
    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaValidationError(f"{location} is outside the schema enum")

    expected = schema.get("type")
    matches = {
        "object": isinstance(instance, dict),
        "array": isinstance(instance, list),
        "string": isinstance(instance, str),
        "integer": isinstance(instance, int) and not isinstance(instance, bool),
        "number": isinstance(instance, (int, float)) and not isinstance(instance, bool),
        "boolean": isinstance(instance, bool),
    }
    if expected is not None and not matches.get(expected, False):
        raise SchemaValidationError(f"{location} must be {expected}")

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            raise SchemaValidationError(f"{location} is shorter than minLength")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            raise SchemaValidationError(f"{location} is longer than maxLength")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, instance) is None:
            raise SchemaValidationError(f"{location} does not match schema pattern")

    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            raise SchemaValidationError(f"{location} has fewer than minItems")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            raise SchemaValidationError(f"{location} has more than maxItems")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(instance):
                _validate(item, item_schema, root, f"{location}[{index}]")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if not math.isfinite(instance):
            raise SchemaValidationError(f"{location} must be finite")
        if "minimum" in schema and instance < schema["minimum"]:
            raise SchemaValidationError(f"{location} is below minimum")
        if "exclusiveMinimum" in schema and instance <= schema["exclusiveMinimum"]:
            raise SchemaValidationError(f"{location} is at or below exclusiveMinimum")
        if "maximum" in schema and instance > schema["maximum"]:
            raise SchemaValidationError(f"{location} exceeds maximum")
        if "exclusiveMaximum" in schema and instance >= schema["exclusiveMaximum"]:
            raise SchemaValidationError(f"{location} is at or above exclusiveMaximum")

    if isinstance(instance, dict):
        required = schema.get("required", [])
        if not isinstance(required, list) or any(not isinstance(key, str) for key in required):
            raise SchemaValidationError(f"invalid required declaration at {location}")
        missing = [key for key in required if key not in instance]
        if missing:
            raise SchemaValidationError(f"{location} is missing required fields: {', '.join(missing)}")
        properties = schema.get("properties", {})
        if not isinstance(properties, dict):
            raise SchemaValidationError(f"invalid properties declaration at {location}")
        if schema.get("additionalProperties") is False:
            extras = sorted(set(instance) - set(properties))
            if extras:
                raise SchemaValidationError(f"{location} contains unexpected fields: {', '.join(extras)}")
        for key, child_schema in properties.items():
            if key in instance:
                if not isinstance(child_schema, dict):
                    raise SchemaValidationError(f"invalid child schema at {location}.{key}")
                _validate(instance[key], child_schema, root, f"{location}.{key}")
