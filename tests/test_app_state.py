from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app import AppState
from dcm_parser import DcmDocument, ValidationError


SAMPLE_TEXT = """KONSERVIERUNG_FORMAT 2.0

FESTWERT IDLE_SPEED_LIMIT
  LANGNAME "Idle speed limit"
  WERT 750
END
"""


class AppStateTests(unittest.TestCase):
    def test_load_document_text_marks_upload_mode(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "static"
            static.mkdir()
            state = AppState(root_dir=root, static_dir=static)

            payload = state.load_document_text("picked.dcm", SAMPLE_TEXT)

            self.assertEqual(payload["source_mode"], "upload")
            self.assertEqual(payload["path"], "picked.dcm")

    def test_save_as_writes_new_target_without_changing_source(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "static"
            static.mkdir()
            source_path = root / "source.dcm"
            output_path = root / "exports" / "copy.dcm"
            source_path.write_text(SAMPLE_TEXT, encoding="utf-8")

            state = AppState(root_dir=root, static_dir=static)
            document = DcmDocument.from_file(source_path)
            payloads = [parameter.to_payload() for parameter in document.parameters]
            payloads[0]["value"] = "800"

            result = state.save_document(
                requested_path=str(source_path),
                source_hash=document.to_payload()["source_hash"],
                parameters=payloads,
                output_path=str(output_path),
            )

            self.assertEqual(result["path"], str(output_path))
            self.assertIsNone(result["backup_path"])
            self.assertIn("WERT 750", source_path.read_text(encoding="utf-8"))
            self.assertIn("WERT 800", output_path.read_text(encoding="utf-8"))

    def test_save_as_backs_up_existing_target(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "static"
            static.mkdir()
            source_path = root / "source.dcm"
            output_path = root / "copy.dcm"
            source_path.write_text(SAMPLE_TEXT, encoding="utf-8")
            output_path.write_text("old target", encoding="utf-8")

            state = AppState(root_dir=root, static_dir=static)
            document = DcmDocument.from_file(source_path)
            payloads = [parameter.to_payload() for parameter in document.parameters]
            payloads[0]["value"] = "810"

            result = state.save_document(
                requested_path=str(source_path),
                source_hash=document.to_payload()["source_hash"],
                parameters=payloads,
                output_path=str(output_path),
            )

            self.assertIsNotNone(result["backup_path"])
            backup_path = Path(result["backup_path"])
            self.assertTrue(backup_path.exists())
            self.assertEqual(backup_path.read_text(encoding="utf-8"), "old target")
            self.assertIn("WERT 810", output_path.read_text(encoding="utf-8"))

    def test_save_document_text_requires_output_path(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "static"
            static.mkdir()
            state = AppState(root_dir=root, static_dir=static)
            document = DcmDocument.from_text(SAMPLE_TEXT, "picked.dcm")
            payloads = [parameter.to_payload() for parameter in document.parameters]

            with self.assertRaises(ValidationError):
                state.save_document_text("picked.dcm", SAMPLE_TEXT, payloads, "")

    def test_save_document_text_writes_selected_upload_to_target(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "static"
            static.mkdir()
            output_path = root / "saved" / "picked.dcm"
            state = AppState(root_dir=root, static_dir=static)
            document = DcmDocument.from_text(SAMPLE_TEXT, "picked.dcm")
            payloads = [parameter.to_payload() for parameter in document.parameters]
            payloads[0]["value"] = "820"

            result = state.save_document_text("picked.dcm", SAMPLE_TEXT, payloads, str(output_path))

            self.assertEqual(result["path"], str(output_path))
            self.assertIn("WERT 820", output_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
