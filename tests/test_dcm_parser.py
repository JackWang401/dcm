from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from dcm_parser import DcmDocument


SAMPLE_TEXT = """KONSERVIERUNG_FORMAT 2.0

FESTWERT IDLE_SPEED_LIMIT
  LANGNAME "Idle speed limit"
  WERT 750
END

KENNLINIE TORQUE_REQUEST_CURVE
  ST/X 0 50 100
  WERT 0 150 300
END

KENNFELD BOOST_TARGET_MAP
  ST/X 1000 2000
  ST/Y 10 30
  WERT 1100 1200
  WERT 1250 1350
END
"""

VARIANT_TEXT = """KONSERVIERUNG_FORMAT 2.0

STUETZSTELLENVERTEILUNG SPEED_AXIS 5
  LANGNAME "Speed axis"
  ST/X 0 20 40 60 80
END

FESTKENNLINIE TORQUE_LIMIT 5
  LANGNAME "Torque limit"
  ST/X 1000 2000 3000 4000 5000
  WERT 50 80 110 140 170
END

FESTKENNFELD BOOST_LIMIT 2 3
  LANGNAME "Boost limit"
  ST/X 1000 2000 3000
  ST/Y 20 60
  WERT 1000 1100 1200
  WERT 1080 1180 1280
END
"""


class DcmParserTests(unittest.TestCase):
    def test_parse_supported_blocks(self) -> None:
        document = DcmDocument.from_text(SAMPLE_TEXT)

        self.assertEqual(len(document.parameters), 3)
        self.assertEqual(document.parameters[0].kind, "scalar")
        self.assertEqual(document.parameters[1].x_axis, ["0", "50", "100"])
        self.assertEqual(document.parameters[2].map_values, [["1100", "1200"], ["1250", "1350"]])

    def test_render_after_edit(self) -> None:
        document = DcmDocument.from_text(SAMPLE_TEXT)
        payloads = [parameter.to_payload() for parameter in document.parameters]
        payloads[0]["value"] = "800"
        payloads[1]["values"][2] = "320"
        payloads[2]["map_values"][1][0] = "1285"

        document.apply_payloads(payloads)
        rendered = document.render_text()

        self.assertIn("WERT 800", rendered)
        self.assertIn("WERT 0 150 320", rendered)
        self.assertIn("WERT 1285 1350", rendered)

    def test_round_trip_file_io(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "sample.dcm"
            path.write_text(SAMPLE_TEXT, encoding="utf-8")
            document = DcmDocument.from_file(path)

            payloads = [parameter.to_payload() for parameter in document.parameters]
            payloads[2]["y_axis"][1] = "35"
            document.apply_payloads(payloads)
            path.write_text(document.render_text(), encoding="utf-8")

            reloaded = DcmDocument.from_file(path)
            self.assertEqual(reloaded.parameters[2].y_axis[1], "35")

    def test_metadata_is_structured_and_editable(self) -> None:
        document = DcmDocument.from_text(SAMPLE_TEXT)
        payloads = [parameter.to_payload() for parameter in document.parameters]

        self.assertEqual(payloads[0]["metadata"][0]["key"], "LANGNAME")
        payloads[0]["metadata"][0]["value"] = '"Updated idle speed"'
        document.apply_payloads(payloads)

        rendered = document.render_text()
        self.assertIn('LANGNAME "Updated idle speed"', rendered)

    def test_numeric_fields_can_be_saved_as_text(self) -> None:
        document = DcmDocument.from_text(SAMPLE_TEXT)
        payloads = [parameter.to_payload() for parameter in document.parameters]
        payloads[0]["value"] = "fast"

        document.apply_payloads(payloads)

        self.assertIn("WERT fast", document.render_text())

    def test_compare_to_other_document(self) -> None:
        current = DcmDocument.from_text(SAMPLE_TEXT)
        baseline = DcmDocument.from_text(
            SAMPLE_TEXT.replace("750", "700", 1).replace("WERT 1250 1350", "WERT 1260 1350", 1)
        )

        comparison = current.compare_to(baseline)

        self.assertEqual(comparison["summary"]["changed"], 2)
        self.assertEqual(comparison["summary"]["total_compared"], 3)
        diff_by_name = {item["name"]: item for item in comparison["diffs"]}
        self.assertEqual(diff_by_name["IDLE_SPEED_LIMIT"]["changed_cells"], 1)
        self.assertEqual(diff_by_name["BOOST_TARGET_MAP"]["changed_cells"], 1)

    def test_variant_keywords_and_header_suffixes_are_supported(self) -> None:
        document = DcmDocument.from_text(VARIANT_TEXT)

        self.assertEqual([parameter.kind for parameter in document.parameters], ["axis", "curve", "map"])
        self.assertEqual(document.parameters[0].name, "SPEED_AXIS")
        self.assertEqual(document.parameters[0].header_suffix, "5")
        self.assertEqual(document.parameters[0].x_axis, ["0", "20", "40", "60", "80"])
        self.assertEqual(document.parameters[1].keyword, "FESTKENNLINIE")
        self.assertEqual(document.parameters[2].keyword, "FESTKENNFELD")

    def test_axis_variant_round_trip_edit(self) -> None:
        document = DcmDocument.from_text(VARIANT_TEXT)
        payloads = [parameter.to_payload() for parameter in document.parameters]
        payloads[0]["x_axis"][2] = "45"

        document.apply_payloads(payloads)
        rendered = document.render_text()

        self.assertIn("STUETZSTELLENVERTEILUNG SPEED_AXIS 5", rendered)
        self.assertIn("ST/X 0 20 45 60 80", rendered)


if __name__ == "__main__":
    unittest.main()
