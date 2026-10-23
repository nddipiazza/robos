"""The only application privilege transition. Never execute an app as root."""
import ctypes
import os
import sys

libc = ctypes.CDLL(None, use_errno=True)
for cap in range(41):
    if libc.prctl(24, cap, 0, 0, 0) != 0:  # PR_CAPBSET_DROP
        raise OSError(ctypes.get_errno(), "Cannot drop capability bounding set")
if libc.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
    raise OSError(ctypes.get_errno(), "Cannot enforce no-new-privileges")
os.setgroups([])
os.setgid(10000)
os.setuid(10000)
os.chdir('/data')
os.execvpe(sys.argv[1], sys.argv[1:], {
    'HOME': '/data', 'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
    'XDG_CONFIG_HOME': '/data/config', 'XDG_CACHE_HOME': '/data/cache',
})
