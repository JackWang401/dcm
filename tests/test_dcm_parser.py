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


if __name__ == "__main__":
    unittest.main()
