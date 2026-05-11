import os
from unittest import TestCase

os.environ.setdefault("SECRET_KEY", "test-secret")


class SecurityUtilityTests(TestCase):
    def test_sanitize_text_strips_html_and_control_characters(self):
        from backend.utils.security import sanitize_text

        dirty = "<script>alert(1)</script>\x00 Hello\n\n<strong>local</strong>   shop"

        self.assertEqual(sanitize_text(dirty, max_length=40), "alert(1) Hello local shop")

    def test_normalize_text_list_sanitizes_deduplicates_and_caps(self):
        from backend.utils.security import normalize_text_list

        values = ["  Coffee  ", "<b>coffee</b>", "Brunch", "Late night", "Ignored"]

        self.assertEqual(
            normalize_text_list(values, limit=3, max_item_length=20),
            ["Coffee", "Brunch", "Late night"],
        )

    def test_normalize_url_rejects_private_or_script_urls(self):
        from backend.utils.security import normalize_url

        with self.assertRaises(ValueError):
            normalize_url("javascript:alert(1)")
        with self.assertRaises(ValueError):
            normalize_url("http://127.0.0.1/admin")

    def test_photo_proxy_rejects_private_fetch_targets(self):
        from backend.services.photo_proxy import _validate_public_fetch_url

        with self.assertRaises(ValueError):
            _validate_public_fetch_url("http://10.0.0.2/image.jpg")
