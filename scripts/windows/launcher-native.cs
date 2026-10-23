using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// Per-user launcher integration. Key data is never stored or transmitted.
class LauncherNative {
  delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
  delegate bool WindowProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int type, HookProc callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowProc callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string command, out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  static IntPtr hook;
  static HookProc callback = HandleKey;
  static int parentPid;
  static Chord chord = new Chord();

  class Chord {
    bool leftWin, rightWin, leftShift, rightShift, armed, other;
    HashSet<int> pressed = new HashSet<int>();
    public bool Key(int key, bool down) {
      bool wasChord = (leftWin || rightWin) && (leftShift || rightShift);
      if (key == 0x5b) leftWin = down;
      else if (key == 0x5c) rightWin = down;
      else if (key == 0xa0 || key == 0x10) leftShift = down;
      else if (key == 0xa1) rightShift = down;
      else { if (down) pressed.Add(key); else pressed.Remove(key); if (armed && down) other = true; return false; }
      bool isChord = (leftWin || rightWin) && (leftShift || rightShift);
      if (!wasChord && isChord) { armed = true; other = pressed.Count > 0; }
      if (armed && !isChord) { armed = false; return !other; }
      return false;
    }
  }
  static IntPtr HandleKey(int code, IntPtr message, IntPtr data) {
    if (code >= 0 && (Marshal.ReadInt32(data, 8) & 0x10) == 0) {
      int msg = message.ToInt32();
      if (msg == 0x100 || msg == 0x104 || msg == 0x101 || msg == 0x105) {
        int key = Marshal.ReadInt32(data);
        if (chord.Key(key, msg == 0x100 || msg == 0x104)) {
          // Consume an otherwise empty Windows-key gesture without leaving any
          // modifier held. Other Win+Shift+key shortcuts pass through untouched.
          keybd_event(0xe8, 0, 0, UIntPtr.Zero); keybd_event(0xe8, 0, 2, UIntPtr.Zero);
          AllowSetForegroundWindow(parentPid);
          ThreadPool.QueueUserWorkItem(delegate { try { Console.WriteLine("TOGGLE"); } catch {} });
          if ((key == 0x5b || key == 0x5c) && (msg == 0x101 || msg == 0x105)) {
            // Keep the mask before Win-up in Windows' input queue, so releasing
            // Win first cannot also open Start. The injected up still releases Win.
            keybd_event((byte)key, 0, 2, UIntPtr.Zero);
            return new IntPtr(1);
          }
        }
      }
    }
    return CallNextHookEx(hook, code, message, data);
  }
  static bool HasArgument(string command, string argument) {
    int count; IntPtr argv = CommandLineToArgvW(command, out count);
    if (argv == IntPtr.Zero) return false;
    try { for (int i=0; i<count; i++) if (Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv, i * IntPtr.Size)) == argument) return true; }
    finally { LocalFree(argv); }
    return false;
  }
  static int FocusApp(string executable, string id, string home, bool close) {
    executable = Path.GetFullPath(executable);
    string owner = "--robos-owner=" + home;
    bool legacy = String.Equals(Path.GetFullPath(home), Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), StringComparison.OrdinalIgnoreCase);
    using (var query = new ManagementObjectSearcher("SELECT ProcessId,ExecutablePath,CommandLine,SessionId FROM Win32_Process")) {
      foreach (ManagementObject row in query.Get()) {
        string command = row["CommandLine"] as string ?? "";
        if (!String.Equals(row["ExecutablePath"] as string, executable, StringComparison.OrdinalIgnoreCase) ||
            Convert.ToInt32(row["SessionId"]) != Process.GetCurrentProcess().SessionId ||
            !HasArgument(command, "--app=" + id) ||
            (!HasArgument(command, owner) && !(legacy && command.IndexOf("--robos-owner=", StringComparison.Ordinal) < 0))) continue;
        uint target = Convert.ToUInt32(row["ProcessId"]); IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr unused) {
          uint pid; GetWindowThreadProcessId(window, out pid);
          if (pid != target) return true;
          var title = new StringBuilder(512); GetWindowText(window, title, title.Capacity);
          if (title.Length == 0) return true;
          found = window; return false;
        }, IntPtr.Zero);
        if (found != IntPtr.Zero) {
          if (close) { PostMessage(found, 0x10, IntPtr.Zero, IntPtr.Zero); Console.WriteLine(target); return 0; }
          ShowWindow(found, 9); SetForegroundWindow(found);
          if (IsWindowVisible(found)) { Console.WriteLine(target); return 0; }
        }
      }
    }
    return 2;
  }
  static int SelfTest() {
    var c = new Chord(); int fires = 0;
    int[] keys = {0x5b,0xa0,0xa0,0x5b,0xa1,0x5c,0x5c,0xa1};
    bool[] down = {true,true,false,false,true,true,false,false};
    for(int i=0;i<keys.Length;i++) if(c.Key(keys[i],down[i])) fires++;
    if(fires != 2) return 1;
    c.Key(0x5b,true); c.Key(0xa0,true); c.Key(0x53,true); c.Key(0x53,false);
    if(c.Key(0xa0,false) || c.Key(0x5b,false)) return 1;
    c.Key(0xa0,true); c.Key(0xa0,false);
    c.Key(0x5b,true); if(c.Key(0x5b,false)) return 1;
    c.Key(0xa2,true); c.Key(0x5b,true); c.Key(0xa0,true);
    if(c.Key(0xa0,false) || c.Key(0x5b,false)) return 1;
    c.Key(0xa2,false);
    Console.WriteLine("PASS modifier-only chord, either key order, and Win+Shift+S passthrough"); return 0;
  }
  [STAThread] static int Main(string[] args) {
    try {
      if(args.Length == 1 && args[0] == "--self-test") return SelfTest();
      if(args.Length == 4 && (args[0] == "--focus-app" || args[0] == "--close-app")) return FocusApp(args[1],args[2],args[3],args[0] == "--close-app");
      if(args.Length != 2 || args[0] != "--hotkey") return 2;
      parentPid = Int32.Parse(args[1]);
      using(var process = Process.GetCurrentProcess()) using(var module = process.MainModule)
        hook = SetWindowsHookEx(13, callback, GetModuleHandle(module.ModuleName), 0);
      if(hook == IntPtr.Zero) throw new Exception("Windows could not register the Win + Shift listener.");
      var timer = new System.Windows.Forms.Timer(); timer.Interval = 1000;
      timer.Tick += delegate { try { if(Process.GetProcessById(parentPid).HasExited) Application.Exit(); } catch { Application.Exit(); } };
      timer.Start(); Console.WriteLine("READY");
      try { Application.Run(); } finally { timer.Dispose(); UnhookWindowsHookEx(hook); }
      return 0;
    } catch(Exception error) { Console.Error.WriteLine(error.Message); return 1; }
  }
}
