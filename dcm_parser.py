from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any


SUPPORTED_KEYWORDS = {
    "FESTWERT": "scalar",
    "FESTWERTEBLOCK": "list",
    "KENNLINIE": "curve",
    "KENNFELD": "map",
}


@dataclass
class BodyItem:
    kind: str
    text: str = ""
    indent: str = ""
    prefix: str = ""
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
    scalar_value: str | None = None
    values: list[str] | None = None
    x_axis: list[str] | None = None
    y_axis: list[str] | None = None
    map_values: list[list[str]] | None = None

    @classmethod
    def from_lines(cls, lines: list[str], start_line: int) -> "ParameterBlock":
        header = lines[0].strip()
        footer = lines[-1].strip()
        header_parts = header.split(maxsplit=1)
        if len(header_parts) < 2:
            raise ParseError(f"Unsupported parameter header: {header!r}")
        keyword, name = header_parts
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

            parts = stripped.split()
            prefix = parts[0]
            tokens = parts[1:]

            if kind == "scalar" and prefix == "WERT":
                scalar_value = " ".join(tokens)
                body_items.append(
                    BodyItem(kind="scalar", indent=indent, prefix=prefix, token_count=max(1, len(tokens)))
                )
                continue

            if kind in {"list", "curve"} and prefix == "WERT":
                values.extend(tokens)
                body_items.append(BodyItem(kind="values", indent=indent, prefix=prefix, token_count=len(tokens)))
                continue

            if kind in {"curve", "map"} and prefix == "ST/X":
                x_axis.extend(tokens)
                body_items.append(BodyItem(kind="x_axis", indent=indent, prefix=prefix, token_count=len(tokens)))
                continue

            if kind == "map" and prefix == "ST/Y":
                y_axis.extend(tokens)
                body_items.append(BodyItem(kind="y_axis", indent=indent, prefix=prefix, token_count=len(tokens)))
                continue

            if kind == "map" and prefix == "WERT":
                map_values.append(tokens)
                body_items.append(BodyItem(kind="map_row", indent=indent, prefix=prefix, token_count=len(tokens)))
                continue

            body_items.append(BodyItem(kind="raw", text=raw_line))

        return cls(
            keyword=keyword,
            kind=kind,
            name=name,
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
            "metadata": [item.text for item in self.body_items if item.kind == "raw" and item.text.strip()],
            "line_range": {"start": self.start_line + 1, "end": self.end_line + 1},
        }
        if self.kind == "scalar":
            payload["value"] = self.scalar_value or ""
        if self.kind in {"list", "curve"}:
            payload["values"] = list(self.values or [])
        if self.kind in {"curve", "map"}:
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

        if self.kind == "scalar":
            self.scalar_value = str(payload.get("value", ""))
            return

        if self.kind == "list":
            self.values = self._validate_vector(payload.get("values"), self.values or [], "values")
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
        return [str(item) for item in incoming]

    def render_lines(self) -> list[str]:
        rendered = [f"{self.keyword} {self.name}"]
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
                rendered.append(_format_line(item.indent, item.prefix, [self.scalar_value or ""]))
                continue

            if item.kind == "values":
                chunk = values[values_cursor : values_cursor + item.token_count]
                values_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk))
                continue

            if item.kind == "x_axis":
                chunk = x_axis[x_cursor : x_cursor + item.token_count]
                x_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk))
                continue

            if item.kind == "y_axis":
                chunk = y_axis[y_cursor : y_cursor + item.token_count]
                y_cursor += item.token_count
                rendered.append(_format_line(item.indent, item.prefix, chunk))
                continue

            if item.kind == "map_row":
                chunk = rows[row_cursor] if row_cursor < len(rows) else []
                row_cursor += 1
                rendered.append(_format_line(item.indent, item.prefix, chunk))
                continue

        rendered.append(self.footer_line)
        return rendered


def _format_line(indent: str, prefix: str, tokens: list[str]) -> str:
    if tokens:
        return f"{indent}{prefix} {' '.join(tokens)}"
    return f"{indent}{prefix}"


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
