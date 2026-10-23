"""Fail closed before launching anything. Linux/Docker only.

Root may contact exactly one VPN endpoint over the underlay. App UID 10000
can use tun0, loopback 127.0.0.1 and replies to the local Web UI only.
No generic ESTABLISHED output rule: that would authorize stale direct flows.
"""
import ipaddress
import base64
import configparser
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

APP_UID = 10000
RUN = Path('/run/vpn')
APPS = {
    'qbittorrent': ['/usr/bin/qbittorrent-nox', '--confirm-legal-notice', '--webui-port=8080'],
    'transmission': ['/usr/bin/transmission-daemon', '--foreground', '--port', '8080',
                     '--config-dir', '/data/config/transmission'],
}


def event(state, **fields):
    print(json.dumps({'level': 30, 'time': int(time.time() * 1000),
                      'state': state, **fields}), flush=True)


def command(argv, **kwargs):
    return subprocess.run(argv, check=True, timeout=5, **kwargs)


def firewall(endpoint, port, protocol):
    ipaddress.IPv4Address(endpoint)
    if protocol not in ('udp', 'tcp') or not 1 <= int(port) <= 65535:
        raise ValueError('Invalid VPN endpoint')
    # Policies become DROP before flushing or adding any allow rule.
    for binary in ('iptables', 'ip6tables'):
        for chain in ('INPUT', 'OUTPUT', 'FORWARD'):
            command([binary, '-w', '-P', chain, 'DROP'])
        command([binary, '-w', '-F'])
    rules = [
        ['INPUT', '-i', 'lo', '-s', '127.0.0.1', '-d', '127.0.0.1', '-j', 'ACCEPT'],
        ['OUTPUT', '-o', 'lo', '-s', '127.0.0.1', '-d', '127.0.0.1', '-j', 'ACCEPT'],
        ['OUTPUT', '-o', 'tun0', '-j', 'ACCEPT'],
        ['INPUT', '-i', 'tun0', '-j', 'ACCEPT'],
        ['OUTPUT', '-m', 'owner', '--uid-owner', '0', '-d', endpoint,
         '-p', protocol, '--dport', str(port), '-j', 'ACCEPT'],
        ['INPUT', '-s', endpoint, '-p', protocol, '--sport', str(port),
         '-m', 'conntrack', '--ctstate', 'ESTABLISHED', '-j', 'ACCEPT'],
        ['INPUT', '-i', 'eth0', '-p', 'tcp', '--dport', '8080', '-j', 'ACCEPT'],
        ['OUTPUT', '-o', 'eth0', '-p', 'tcp', '--sport', '8080',
         '-m', 'conntrack', '--ctstate', 'ESTABLISHED', '--ctdir', 'REPLY', '-j', 'ACCEPT'],
    ]
    for rule in rules:
        command(['iptables', '-w', '-A', *rule])


def validate_bootstrap(data):
    ipaddress.IPv4Address(data['endpoint'])
    if data['app'] not in APPS or data['protocol'] not in ('udp', 'tcp'):
        raise ValueError('Unsupported application or protocol')
    if not isinstance(data['port'], int) or not 1 <= data['port'] <= 65535:
        raise ValueError('Invalid port')
    for key in ('username', 'password'):
        if not isinstance(data[key], str) or not data[key] or any(c in data[key] for c in '\r\n\0'):
            raise ValueError('Credentials must be nonempty single lines')
    if not isinstance(data.get('webPassword'), str) or not 16 <= len(data['webPassword']) <= 128 or not data['webPassword'].isalnum() and any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in data['webPassword']):
        raise ValueError('A generated Web UI password is required')
    if '-----BEGIN CERTIFICATE-----' not in data['ca']:
        raise ValueError('CA certificate is required')
    if data.get('cipher', 'AES-256-CBC') not in ('AES-256-CBC', 'AES-256-GCM', 'AES-128-GCM'):
        raise ValueError('Unsupported cipher')
    if data.get('auth', 'SHA256') not in ('SHA1', 'SHA256', 'SHA512'):
        raise ValueError('Unsupported auth digest')
    return data


def write_config(data):
    (RUN / 'ca.crt').write_text(data['ca'])
    (RUN / 'auth').write_text(data['username'] + '\n' + data['password'] + '\n')
    (RUN / 'auth').chmod(0o600)
    # Never execute a supplied .ovpn file. Every option below is generated.
    config = [
        'client', 'dev tun0', f"proto {data['protocol']}",
        f"remote {data['endpoint']} {data['port']}",
        'nobind', 'auth-nocache', 'remote-cert-tls server',
        'ca /run/vpn/ca.crt', 'auth-user-pass /run/vpn/auth',
        'script-security 1', 'route-nopull', 'redirect-gateway def1',
        'pull-filter ignore "redirect-gateway"', 'pull-filter ignore "route-ipv6"',
        'pull-filter ignore "ifconfig-ipv6"', 'allow-compression no',
        'data-ciphers AES-256-GCM:AES-128-GCM:AES-256-CBC',
        f"data-ciphers-fallback {data.get('cipher', 'AES-256-CBC')}",
        f"auth {data.get('auth', 'SHA256')}", 'verb 1',
    ]
    if data.get('tlsAuth'):
        (RUN / 'ta.key').write_text(data['tlsAuth'])
        config += ['tls-auth /run/vpn/ta.key 1']
    (RUN / 'client.ovpn').write_text('\n'.join(config) + '\n')


def app_config(data):
    """Preserve app preferences/downloads, rotate local Web UI credentials."""
    if data['app'] == 'qbittorrent':
        directory = Path('/data/config/qBittorrent')
        safe_directory(directory)
        target = directory / 'qBittorrent.conf'
        if target.is_symlink():
            raise ValueError('App configuration cannot be a symlink')
        config = configparser.RawConfigParser(interpolation=None, strict=False)
        config.optionxform = str
        if target.exists():
            config.read(target)
        if not config.has_section('Preferences'):
            config.add_section('Preferences')
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac('sha512', data['webPassword'].encode(), salt, 100000)
        password = base64.b64encode(salt).decode() + ':' + base64.b64encode(digest).decode()
        for key, value in {
            'WebUI\\Username': 'admin', 'WebUI\\Password_PBKDF2': f'"@ByteArray({password})"',
            'WebUI\\LocalHostAuth': 'true', 'WebUI\\AuthSubnetWhitelistEnabled': 'false',
            'WebUI\\Address': '*', 'WebUI\\Port': '8080',
            'Downloads\\SavePath': '/data/downloads/',
        }.items():
            config.set('Preferences', key, value)
        with target.open('w') as stream:
            config.write(stream, space_around_delimiters=False)
    else:
        directory = Path('/data/config/transmission')
        safe_directory(directory)
        target = directory / 'settings.json'
        if target.is_symlink():
            raise ValueError('App configuration cannot be a symlink')
        config = json.loads(target.read_text()) if target.exists() else {}
        config.update({'rpc-enabled': True, 'rpc-bind-address': '0.0.0.0', 'rpc-port': 8080,
                       'rpc-authentication-required': True, 'rpc-username': 'admin',
                       'rpc-password': data['webPassword'], 'rpc-whitelist-enabled': False,
                       'download-dir': '/data/downloads'})
        target.write_text(json.dumps(config))
    # App-owned preferences only; VPN files stay root-owned in /run/vpn.
    os.chown(directory, APP_UID, APP_UID)
    os.chown(target, APP_UID, APP_UID)


def safe_directory(directory):
    # A retained app volume is untrusted. Never follow its links as root.
    current = Path('/data')
    for component in Path(directory).relative_to('/data').parts:
        current = current / component
        if current.is_symlink():
            raise ValueError('App directories cannot be symlinks')
        current.mkdir(exist_ok=True)


def tunnel_exists():
    try:
        result = subprocess.run(['ip', '-j', 'addr', 'show', 'dev', 'tun0'],
                                check=True, timeout=0.2, capture_output=True)
        links = json.loads(result.stdout)
        return any(a.get('family') == 'inet' for link in links for a in link.get('addr_info', []))
    except (subprocess.SubprocessError, ValueError):
        return False


def probe():
    # Fixed TLS endpoint; no host/Docker DNS resolver or proxy can satisfy this.
    try:
        command(['curl', '--fail', '--silent', '--noproxy', '*', '--interface', 'tun0',
                 '--connect-timeout', '1', '--max-time', '2',
                 'https://1.1.1.1/cdn-cgi/trace'], capture_output=True)
        return True
    except subprocess.SubprocessError:
        return False


def kill_group(process):
    if process is not None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


def supervise(vpn, launch, healthy=tunnel_exists, connectivity=probe,
              sleep=time.sleep, now=time.monotonic, startup_timeout=60):
    child = None
    deadline = now() + startup_timeout
    try:
        while vpn.poll() is None and now() < deadline:
            if healthy() and connectivity():
                child = launch()
                event('running', appPid=child.pid)
                break
            sleep(0.25)
        if child is None:
            raise RuntimeError('VPN did not become healthy; app never launched')
        next_probe = now() + 2
        while child.poll() is None:
            if vpn.poll() is not None or not healthy():
                raise RuntimeError('VPN process or tunnel lost')
            if now() >= next_probe:
                if not connectivity():
                    raise RuntimeError('VPN connectivity check failed')
                next_probe = now() + 2
            sleep(0.25)
    finally:
        # No grace period or restart after a failure. Kill descendants too.
        kill_group(child)
        kill_group(vpn)


def main():
    os.umask(0o077)
    RUN.mkdir(mode=0o700, exist_ok=True)
    event('waiting', message='Waiting for credentials through stdin injection')
    deadline = time.monotonic() + 90
    while not (RUN / 'bootstrap.json').exists():
        if time.monotonic() >= deadline:
            raise RuntimeError('Credentials were not supplied')
        time.sleep(0.1)
    data = validate_bootstrap(json.loads((RUN / 'bootstrap.json').read_text()))
    (RUN / 'bootstrap.json').unlink()
    firewall(data['endpoint'], data['port'], data['protocol'])
    event('locked', message='IPv4 default deny; IPv6 denied; app can use tun0 only')
    write_config(data)
    safe_directory(Path('/data/config'))
    for directory in ('/data', '/data/config'):
        os.chown(directory, APP_UID, APP_UID)
    app_config(data)
    vpn = subprocess.Popen(['openvpn', '--config', '/run/vpn/client.ovpn'],
                           start_new_session=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL)
    def launch():
        return subprocess.Popen(['python3', '/opt/robos/run-app.py', *APPS[data['app']]],
                                start_new_session=True)
    event('connecting')
    supervise(vpn, launch)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        event('stopped', message=str(error))
        raise SystemExit(1)
