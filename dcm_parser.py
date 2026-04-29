from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any


SUPPORTED_KEYWORDS = {
    "FESTWERT": "scalar",
    "TEXTSTRING": "scalar",
    "FESTWERTEBLOCK": "list",
    "STUETZSTELLENVERTEILUNG": "axis",
    "KENNLINIE": "curve",
    "FESTKENNLINIE": "curve",
    "GRUPPENKENNLINIE": "curve",
    "KENNFELD": "map",
    "FESTKENNFELD": "map",
    "GRUPPENKENNFELD": "map",
}


@dataclass
class BodyItem:
    kind: str
    text: str = ""
    indent: str = ""
    prefix: str = ""
    spacing: str = " "
    token_count: int = 0


class ParseError(ValueError):
    pass


class ValidationError(ValueError):
    pass


@dataclass
class ParameterBlock:
    keyword: str
    kind: str
    name: str
    start_line: int
    end_line: int
    header_line: str
    footer_line: str
    body_items: list[BodyItem]
    header_suffix: str = ""
    scalar_value: str | None = None
    values: list[str] | None = None
    x_axis: list[str] | None = None
    y_axis: list[str] | None = None
    map_values: list[list[str]] | None = None

    @classmethod
    def from_lines(cls, lines: list[str], start_line: int) -> "ParameterBlock":
        header = lines[0].strip()
        footer = lines[-1].strip()
        header_keyword, _, header_remainder = _split_line_parts(lines[0])
        if not header_remainder:
            raise ParseError(f"Unsupported parameter header: {header!r}")
        name_parts = header_remainder.split(maxsplit=1)
        name = name_parts[0]
        header_suffix = name_parts[1] if len(name_parts) > 1 else ""
        keyword = header_keyword
        if footer != "END":
            raise ParseError(f"Parameter {name!r} is missing END")
        kind = SUPPORTED_KEYWORDS.get(keyword)
        if kind is None:
            raise ParseError(f"Unsupported parameter keyword: {keyword}")

        body_items: list[BodyItem] = []
        scalar_value: str | None = None
        values: list[str] = []
        x_axis: list[str] = []
        y_axis: list[str] = []
        map_values: list[list[str]] = []

        for raw_line in lines[1:-1]:
            stripped = raw_line.strip()
            indent = raw_line[: len(raw_line) - len(raw_line.lstrip())]
            if not stripped:
                body_items.append(BodyItem(kind="raw", text=raw_line))
                continue

            prefix, spacing, remainder = _split_line_parts(raw_line)
            tokens = remainder.split()

            if kind == "scalar" and prefix == "WERT":
                scalar_value = " ".join(tokens)
                body_items.append(
                    BodyItem(
                        kind="scalar",
                        indent=indent,
                        prefix=prefix,
                        spacing=spacing,
                        token_count=max(1, len(tokens)),
                    )
                )
                continue

            if kind in {"list", "curve"} and prefix == "WERT":
                values.extend(tokens)
                body_items.append(
                    BodyItem(kind="values", indent=indent, prefix=prefix, spacing=spacing, token_count=len(tokens))
                )
                continue

            if kind == "axis" and prefix == "ST/X":
                x_axis.extend(tokens)
                body_items.append(
                    BodyItem(kind="x_axis", indent=indent, prefix=prefix, spacing=spacing, token_count=len(tokens))
                )
                continue

            if kind in {"curve", "map"} and prefix == "ST/X":
                x_axis.extend(tokens)
                body_items.append(
                    BodyItem(kind="x_axis", indent=indent, prefix=prefix, spacing=spacing, token_count=len(tokens))
                )
                continue

            if kind == "map" and prefix == "ST/Y":
                y_axis.extend(tokens)
                body_items.append(
                    BodyItem(kind="y_axis", indent=indent, prefix=prefix, spacing=spacing, token_count=len(tokens))
                )
                continue

            if kind == "map" and prefix == "WERT":
                map_values.append(tokens)
                body_items.append(
                    BodyItem(kind="map_row", indent=indent, prefix=prefix, spacing=spacing, token_count=len(tokens))
                )
                continue

            if _is_structured_metadata_prefix(prefix):
                body_items.append(BodyItem(kind="metadata", indent=indent, prefix=prefix, spacing=spacing, text=remainder))
                continue

            body_items.append(BodyItem(kind="raw", text=raw_line))

        return cls(
            keyword=keyword,
            kind=kind,
            name=name,
            header_suffix=header_suffix,
            start_line=start_line,
            end_line=start_line + len(lines) - 1,
            header_line=lines[0],
            footer_line=lines[-1],
            body_items=body_items,
            scalar_value=scalar_value,
            values=values or None,
            x_axis=x_axis or None,
            y_axis=y_axis or None,
            map_values=map_values or None,
        )

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "keyword": self.keyword,
            "kind": self.kind,
            "header_suffix": self.header_suffix,
            "metadata": [
                {"key": item.prefix, "value": item.text}
                for item in self.body_items
                if item.kind == "metadata"
            ],
            "raw_lines": [item.text for item in self.body_items if item.kind == "raw" and item.text.strip()],
            "line_range": {"start": self.start_line + 1, "end": self.end_line + 1},
        }
        if self.kind == "scalar":
            payload["value"] = self.scalar_value or ""
        if self.kind in {"list", "curve"}:
            payload["values"] = list(self.values or [])
        if self.kind in {"axis", "curve", "map"}:
            payload["x_axis"] = list(self.x_axis or [])
        if self.kind == "map":
            payload["y_axis"] = list(self.y_axis or [])
            payload["map_values"] = [list(row) for row in (self.map_values or [])]
        return payload

    def apply_payload(self, payload: dict[str, Any]) -> None:
        if payload.get("name") != self.name:
            raise ValidationError(f"Parameter name mismatch for {self.name}")
        if payload.get("kind") != self.kind:
            raise ValidationError(f"Parameter kind mismatch for {self.name}")
        self._apply_metadata(payload.get("metadata"))

        if self.kind == "scalar":
            next_value = str(payload.get("value", ""))
            self._validate_token_type(next_value, self.scalar_value, f"{self.name}.value")
            self.scalar_value = next_value
            return

        if self.kind == "list":
            self.values = self._validate_vector(payload.get("values"), self.values or [], "values")
            return

        if self.kind == "axis":
            self.x_axis = self._validate_vector(payload.get("x_axis"), self.x_axis or [], "x_axis")
            return

        if self.kind == "curve":
            self.x_axis = self._validate_vector(payload.get("x_axis"), self.x_axis or [], "x_axis")
            self.values = self._validate_vector(payload.get("values"), self.values or [], "values")
            if len(self.x_axis) != len(self.values):
                raise ValidationError(f"Curve {self.name} must keep x-axis and values aligned")
            return

        if self.kind == "map":
            self.x_axis = self._validate_vector(payload.get("x_axis"), self.x_axis or [], "x_axis")
            self.y_axis = self._validate_vector(payload.get("y_axis"), self.y_axis or [], "y_axis")
            original_rows = self.map_values or []
            incoming_rows = payload.get("map_values")
            if not isinstance(incoming_rows, list) or len(incoming_rows) != len(original_rows):
                raise ValidationError(f"Map {self.name} must preserve row count")
            normalized_rows: list[list[str]] = []
            for index, (incoming_row, original_row) in enumerate(zip(incoming_rows, original_rows, strict=True)):
                if not isinstance(incoming_row, list) or len(incoming_row) != len(original_row):
                    raise ValidationError(f"Map {self.name} row {index} must preserve column count")
                normalized_rows.append([str(item) for item in incoming_row])
            if any(len(row) != len(self.x_axis) for row in normalized_rows):
                raise ValidationError(f"Map {self.name} column count must match x-axis size")
            if len(normalized_rows) != len(self.y_axis):
                raise ValidationError(f"Map {self.name} row count must match y-axis size")
            self.map_values = normalized_rows
            return

        raise ValidationError(f"Unsupported parameter kind: {self.kind}")

    @staticmethod
    def _validate_vector(incoming: Any, original: list[str], field_name: str) -> list[str]:
        if not isinstance(incoming, list) or len(incoming) != len(original):
            raise ValidationError(f"{field_name} must preserve its original length")
        normalized = [str(item) for item in incoming]
        for index, (next_value, original_value) in enumerate(zip(normalized, original, strict=True)):
            ParameterBlock._validate_token_type(next_value, original_value, f"{field_name}[{index}]")
        return normalized

    @staticmethod
    def _validate_token_type(next_value: str, original_value: str | None, field_name: str) -> None:
        if original_value is None:
            return
        if _is_numeric_token(original_value) and not _is_numeric_token(next_value):
            raise ValidationError(f"{field_name} must stay numeric")

    def _apply_metadata(self, incoming_metadata: Any) -> None:
        metadata_items = [item for item in self.body_items if item.kind == "metadata"]
        if incoming_metadata is None:
            return
        if not isinstance(incoming_metadata, list) or len(incoming_metadata) != len(metadata_items):
            raise ValidationError(f"{self.name}.metadata must preserve its original structure")

        for index, (incoming_item, body_item) in enumerate(zip(incoming_metadata, metadata_items, strict=True)):
            if not isinstance(incoming_item, dict):
                raise ValidationError(f"{self.name}.metadata[{index}] must be an object")
            if incoming_item.get("key") != body_item.prefix:
                raise ValidationError(f"{self.name}.metadata[{index}] key must stay {body_item.prefix}")
            body_item.text = str(incoming_item.get("value", ""))

    def render_lines(self) -> list[str]:
        rendered = [self.header_line]
        values_cursor = 0
        x_cursor = 0
        y_cursor = 0
        row_cursor = 0

        values = list(self.values or [])
        x_axis = list(self.x_axis or [])
        y_axis = list(self.y_axis or [])
        rows = [list(row) for row in (self.map_values or [])]

        for item in self.body_items:
            if item.kind == "raw":
                rendered.append(item.text)
                continue

            if item.kind == "scalar":
                rendered.append(_format_line(item.indent, item.prefix, [self.scalar_value or ""], item.spacing))
                continue

            if item.kind == "values":
                chunk = values[values_cursor : values_cursor + item.token_count]
                values_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk, item.spacing))
                continue

            if item.kind == "x_axis":
                chunk = x_axis[x_cursor : x_cursor + item.token_count]
                x_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk, item.spacing))
                continue

            if item.kind == "y_axis":
                chunk = y_axis[y_cursor : y_cursor + item.token_count]
                y_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk, item.spacing))
                continue

            if item.kind == "map_row":
                chunk = rows[row_cursor] if row_cursor < len(rows) else []
                row_cursor += 1
                rendered.append(_format_line(item.indent, item.prefix, chunk, item.spacing))
                continue

            if item.kind == "metadata":
                rendered.append(_format_metadata_line(item.indent, item.prefix, item.text, item.spacing))
                continue

        rendered.append(self.footer_line)
        return rendered


def _format_line(indent: str, prefix: str, tokens: list[str], spacing: str = " ") -> str:
    if tokens:
        return f"{indent}{prefix}{spacing}{' '.join(tokens)}"
    return f"{indent}{prefix}"


def _format_metadata_line(indent: str, prefix: str, value: str, spacing: str = " ") -> str:
    if value:
        return f"{indent}{prefix}{spacing}{value}"
    return f"{indent}{prefix}"


def _split_line_parts(raw_line: str) -> tuple[str, str, str]:
    stripped_left = raw_line.lstrip()
    match = re.match(r"^(\S+)(\s*)(.*)$", stripped_left)
    if not match:
        return stripped_left, " ", ""
    prefix, spacing, remainder = match.groups()
    return prefix, spacing or " ", remainder


def _is_structured_metadata_prefix(prefix: str) -> bool:
    return bool(re.fullmatch(r"[A-Z][A-Z0-9_/-]*", prefix))


@dataclass
class DcmDocument:
    path: Path
    lines: list[str]
    trailing_newline: bool
    parameters: list[ParameterBlock]

    @classmethod
    def from_text(cls, text: str, path: str | Path = "<memory>") -> "DcmDocument":
        trailing_newline = text.endswith("\n")
        lines = text.splitlines()
        parameters: list[ParameterBlock] = []
        index = 0

        while index < len(lines):
            stripped = lines[index].strip()
            parts = stripped.split(maxsplit=1)
            keyword = parts[0] if parts else ""
            if keyword not in SUPPORTED_KEYWORDS or len(parts) < 2:
                index += 1
                continue

            end_index = index + 1
            while end_index < len(lines) and lines[end_index].strip() != "END":
                end_index += 1

            if end_index >= len(lines):
                raise ParseError(f"Parameter starting at line {index + 1} is missing END")

            block_lines = lines[index : end_index + 1]
            parameters.append(ParameterBlock.from_lines(block_lines, index))
            index = end_index + 1

        return cls(path=Path(path), lines=lines, trailing_newline=trailing_newline, parameters=parameters)

    @classmethod
    def from_file(cls, path: str | Path) -> "DcmDocument":
        file_path = Path(path)
        return cls.from_text(file_path.read_text(encoding="utf-8"), file_path)

    def to_payload(self) -> dict[str, Any]:
        text = self.render_text()
        return {
            "path": str(self.path),
            "source_hash": sha256(text.encode("utf-8")).hexdigest(),
            "parameters": [parameter.to_payload() for parameter in self.parameters],
            "validation_issues": self.collect_validation_issues(),
        }

    def apply_payloads(self, payloads: list[dict[str, Any]]) -> None:
        payload_by_name = {payload.get("name"): payload for payload in payloads}
        for parameter in self.parameters:
            payload = payload_by_name.get(parameter.name)
            if payload is not None:
                parameter.apply_payload(payload)

    def render_text(self) -> str:
        rendered_lines: list[str] = []
        cursor = 0
        for parameter in self.parameters:
            rendered_lines.extend(self.lines[cursor : parameter.start_line])
            rendered_lines.extend(parameter.render_lines())
            cursor = parameter.end_line + 1
        rendered_lines.extend(self.lines[cursor:])
        text = "\n".join(rendered_lines)
        if self.trailing_newline:
            text += "\n"
        return text

    def collect_validation_issues(self) -> list[dict[str, str]]:
        issues: list[dict[str, str]] = []
        for parameter in self.parameters:
            if parameter.kind == "scalar" and parameter.scalar_value is None:
                issues.append({"parameter": parameter.name, "message": "Missing WERT value"})
            if parameter.kind == "list" and not parameter.values:
                issues.append({"parameter": parameter.name, "message": "Missing WERT values"})
            if parameter.kind == "axis":
                if not parameter.x_axis:
                    issues.append({"parameter": parameter.name, "message": "Missing ST/X axis"})
            if parameter.kind == "curve":
                if not parameter.x_axis:
                    issues.append({"parameter": parameter.name, "message": "Missing ST/X axis"})
                if not parameter.values:
                    issues.append({"parameter": parameter.name, "message": "Missing WERT values"})
                if parameter.x_axis and parameter.values and len(parameter.x_axis) != len(parameter.values):
                    issues.append({"parameter": parameter.name, "message": "ST/X and WERT lengths do not match"})
            if parameter.kind == "map":
                if not parameter.x_axis:
                    issues.append({"parameter": parameter.name, "message": "Missing ST/X axis"})
                if not parameter.y_axis:
                    issues.append({"parameter": parameter.name, "message": "Missing ST/Y axis"})
                if not parameter.map_values:
                    issues.append({"parameter": parameter.name, "message": "Missing WERT rows"})
                if parameter.map_values and parameter.y_axis and len(parameter.map_values) != len(parameter.y_axis):
                    issues.append({"parameter": parameter.name, "message": "ST/Y length and WERT row count do not match"})
                if parameter.map_values and parameter.x_axis:
                    for row_index, row in enumerate(parameter.map_values):
                        if len(row) != len(parameter.x_axis):
                            issues.append(
                                {
                                    "parameter": parameter.name,
                                    "message": f"WERT row {row_index} length does not match ST/X length",
                                }
                            )
        return issues

    def compare_to(self, baseline: "DcmDocument") -> dict[str, Any]:
        current_by_name = {parameter.name: parameter for parameter in self.parameters}
        baseline_by_name = {parameter.name: parameter for parameter in baseline.parameters}

        names = sorted(set(current_by_name) | set(baseline_by_name))
        diffs: list[dict[str, Any]] = []
        changed = 0
        added = 0
        removed = 0
        unchanged = 0

        for name in names:
            current = current_by_name.get(name)
            other = baseline_by_name.get(name)
            if current is None:
                removed += 1
                diffs.append({"name": name, "status": "missing_in_current", "kind": other.kind if other else "unknown"})
                continue
            if other is None:
                added += 1
                diffs.append({"name": name, "status": "missing_in_compare", "kind": current.kind})
                continue
            if current.kind != other.kind:
                changed += 1
                diffs.append(
                    {
                        "name": name,
                        "status": "kind_changed",
                        "kind": current.kind,
                        "compare_kind": other.kind,
                        "changed_cells": 1,
                    }
                )
                continue

            changed_cells = _count_parameter_changes(current, other)
            if changed_cells:
                changed += 1
                diffs.append({"name": name, "status": "changed", "kind": current.kind, "changed_cells": changed_cells})
            else:
                unchanged += 1
                diffs.append({"name": name, "status": "unchanged", "kind": current.kind, "changed_cells": 0})

        return {
            "summary": {
                "changed": changed,
                "added": added,
                "removed": removed,
                "unchanged": unchanged,
                "total_compared": len(names),
            },
            "diffs": diffs,
        }


def _is_numeric_token(value: str) -> bool:
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True


def _count_parameter_changes(current: ParameterBlock, baseline: ParameterBlock) -> int:
    if current.kind == "scalar":
        return int((current.scalar_value or "") != (baseline.scalar_value or ""))
    if current.kind == "list":
        return sum(1 for left, right in zip(current.values or [], baseline.values or [], strict=True) if left != right)
    if current.kind == "axis":
        return sum(1 for left, right in zip(current.x_axis or [], baseline.x_axis or [], strict=True) if left != right)
    if current.kind == "curve":
        x_changes = sum(1 for left, right in zip(current.x_axis or [], baseline.x_axis or [], strict=True) if left != right)
        value_changes = sum(1 for left, right in zip(current.values or [], baseline.values or [], strict=True) if left != right)
        return x_changes + value_changes
    if current.kind == "map":
        x_changes = sum(1 for left, right in zip(current.x_axis or [], baseline.x_axis or [], strict=True) if left != right)
        y_changes = sum(1 for left, right in zip(current.y_axis or [], baseline.y_axis or [], strict=True) if left != right)
        cell_changes = 0
        for current_row, baseline_row in zip(current.map_values or [], baseline.map_values or [], strict=True):
            cell_changes += sum(1 for left, right in zip(current_row, baseline_row, strict=True) if left != right)
        return x_changes + y_changes + cell_changes
    return 0
