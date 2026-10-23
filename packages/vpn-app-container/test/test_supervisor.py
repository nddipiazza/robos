import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('supervisor', Path(__file__).parents[1] / 'container/supervisor.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class ProtectionTests(unittest.TestCase):
    def test_no_vpn_never_launches_app(self):
        vpn, launch = Mock(pid=51), Mock()
        vpn.poll.return_value = 1
        with patch.object(s, 'kill_group') as kill:
            with self.assertRaisesRegex(RuntimeError, 'never launched'):
                s.supervise(vpn, launch)
        launch.assert_not_called()
        kill.assert_any_call(vpn)

    def test_kills_immediately_when_link_disappears(self):
        vpn, child = Mock(pid=51), Mock(pid=52)
        vpn.poll.return_value = child.poll.return_value = None
        health = Mock(side_effect=[True, False])
        with patch.object(s, 'kill_group') as kill:
            with self.assertRaisesRegex(RuntimeError, 'tunnel lost'):
                s.supervise(vpn, lambda: child, healthy=health, connectivity=lambda: True)
        self.assertEqual(kill.call_args_list[0].args, (child,))

    def test_kills_on_connectivity_failure_even_with_existing_tunnel(self):
        vpn, child = Mock(pid=51), Mock(pid=52)
        vpn.poll.return_value = child.poll.return_value = None
        clock = Mock(side_effect=[0, 0, 0, 3])
        probe = Mock(side_effect=[True, False])
        with patch.object(s, 'kill_group') as kill:
            with self.assertRaisesRegex(RuntimeError, 'connectivity check failed'):
                s.supervise(vpn, lambda: child, healthy=lambda: True, connectivity=probe, now=clock)
        self.assertEqual(kill.call_args_list[0].args, (child,))

    def test_probe_exception_also_kills_app_and_vpn(self):
        vpn, child = Mock(pid=51), Mock(pid=52)
        vpn.poll.return_value = child.poll.return_value = None
        health = Mock(side_effect=[True, OSError('probe crashed')])
        with patch.object(s, 'kill_group') as kill:
            with self.assertRaises(OSError):
                s.supervise(vpn, lambda: child, healthy=health, connectivity=lambda: True)
        self.assertEqual(kill.call_count, 2)

    def test_kills_whole_process_group_with_sigkill(self):
        process = Mock(pid=75)
        with patch.object(s.os, 'killpg', create=True) as kill:
            with patch.object(s.signal, 'SIGKILL', 9, create=True):
                s.kill_group(process)
        kill.assert_called_once_with(75, 9)

    def test_firewall_has_no_app_exception_for_vpn_endpoint_or_dns(self):
        calls = []
        with patch.object(s, 'command', side_effect=lambda argv: calls.append(argv)):
            s.firewall('203.0.113.1', 1194, 'udp')
        for family in ('iptables', 'ip6tables'):
            for chain in ('INPUT', 'OUTPUT', 'FORWARD'):
                self.assertIn([family, '-w', '-P', chain, 'DROP'], calls)
        accepts = [row for row in calls if '-A' in row and row[3] == 'OUTPUT']
        endpoint_rule = next(row for row in accepts if '203.0.113.1' in row)
        self.assertIn('--uid-owner', endpoint_rule)
        self.assertIn('0', endpoint_rule)
        self.assertFalse(any('53' in row for row in accepts))
        for row in accepts:
            if 'ESTABLISHED' in row:
                self.assertIn('REPLY', row)
                self.assertIn('8080', row)

    def test_any_firewall_install_failure_aborts_setup(self):
        with patch.object(s, 'command', side_effect=subprocess.CalledProcessError(1, 'iptables')):
            with self.assertRaises(subprocess.CalledProcessError):
                s.firewall('203.0.113.1', 1194, 'udp')

    def test_generated_openvpn_config_cannot_run_user_scripts(self):
        data = {'endpoint': '203.0.113.1', 'port': 1194, 'protocol': 'udp',
                'username': 'alice', 'password': 'test-secret', 'ca': 'certificate'}
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(s, 'RUN', Path(temporary)):
                s.write_config(data)
            config = (Path(temporary) / 'client.ovpn').read_text()
            self.assertIn('script-security 1', config)
            self.assertIn('remote-cert-tls server', config)
            self.assertIn('route-nopull', config)
            self.assertNotIn('test-secret', config)
            self.assertEqual((Path(temporary) / 'auth').read_text(), 'alice\ntest-secret\n')

    def test_timeout_during_connectivity_probe_is_failure(self):
        with patch.object(s, 'command', side_effect=subprocess.TimeoutExpired('curl', 2)):
            self.assertFalse(s.probe())


if __name__ == '__main__':
    unittest.main()
