import os

from django.test import SimpleTestCase


class TestClass(SimpleTestCase):

    def test_success(self):
        required_setting = os.getenv('REQUIRED_SETTING', None)
        self.assertIsNotNone(required_setting, 'Environment setting \"REQUIRED_SETTING\" was not found. '
                                               'Set REQUIRED_SETTING to any value for this test to pass.')

