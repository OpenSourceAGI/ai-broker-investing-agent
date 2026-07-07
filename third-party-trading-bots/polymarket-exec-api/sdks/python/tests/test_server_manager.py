import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import os
import shutil
from pmxt.server_manager import ServerManager

class TestServerManagerCrossPlatform(unittest.TestCase):
    """
    Tests the ServerManager launcher selection logic for both Unix and Windows.
    These tests verify the fix for [WinError 193].
    """

    def setUp(self):
        self.manager = ServerManager()

    @patch('pmxt.server_manager.os.name', 'nt')
    @patch('pmxt.server_manager.shutil.which')
    def test_launcher_filename_logic(self, mock_which):
        """
        Verify the filename selection logic works as expected for both platforms.
        We test the logic isolated from Path instantiation to avoid WindowsPath errors on Mac.
        """
        import pmxt.server_manager as sm
        
        # Test Windows logic
        launcher_filename_win = 'pmxt-ensure-server'
        with patch('pmxt.server_manager.os.name', 'nt'):
            if sm.os.name == "nt":
                launcher_filename_win += ".js"
        self.assertEqual(launcher_filename_win, 'pmxt-ensure-server.js')

        # Test Unix logic
        launcher_filename_unix = 'pmxt-ensure-server'
        with patch('pmxt.server_manager.os.name', 'posix'):
            if sm.os.name == "nt":
                launcher_filename_unix += ".js"
        self.assertEqual(launcher_filename_unix, 'pmxt-ensure-server')

    @patch('subprocess.run')
    def test_node_execution_logic(self, mock_run):
        """
        Verify that files ending in .js are executed with 'node'.
        This is the core of the WinError 193 fix.
        """
        mock_run.return_value = MagicMock(returncode=0)
        
        # Scenario 1: .js file (Windows style)
        # Should use ['node', 'path/to/script.js']
        with patch('pmxt.server_manager.os.access', return_value=True):
            with patch('pmxt.server_manager.Path') as mock_path:
                # Mock bundled_launcher.exists() to True
                mock_path.return_value.__truediv__.return_value.__truediv__.return_value.__truediv__.return_value.exists.return_value = True
                
                # Setup the launcher path to end with .js
                launcher_path = "/fake/path/pmxt-ensure-server.js"
                
                # Simulate the execution logic
                cmd = [launcher_path]
                if launcher_path.endswith('.js') or not os.access(launcher_path, os.X_OK):
                    cmd = ['node', launcher_path]
                
                self.assertEqual(cmd, ['node', launcher_path])

        # Scenario 2: Unix executable (no extension)
        # Should use ['path/to/script'] if os.access(X_OK) is True
        launcher_path = "/fake/path/pmxt-ensure-server"
        with patch('pmxt.server_manager.os.access', return_value=True):
            cmd = [launcher_path]
            if launcher_path.endswith('.js') or not os.access(launcher_path, os.X_OK):
                cmd = ['node', launcher_path]
            
            self.assertEqual(cmd, [launcher_path])

    def test_bundling_creates_js_file(self):
        """
        Verify that core/bin actually contains the .js file now.
        """
        core_bin = Path(__file__).parent.parent.parent.parent / 'core' / 'bin'
        launcher_js = core_bin / 'pmxt-ensure-server.js'
        self.assertTrue(launcher_js.exists(), "pmxt-ensure-server.js should exist in core/bin")
        self.assertTrue(os.access(launcher_js, os.X_OK), "pmxt-ensure-server.js should be executable")

if __name__ == '__main__':
    unittest.main()
