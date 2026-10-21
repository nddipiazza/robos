#!/usr/bin/env python3
"""
🐉 Quest: Warrior Dragon E2E Test Manager Desktop Application
A complete GUI for selecting Cucumber feature tests, running them in parallel with worker controls,
stopping/killing tests on demand, and viewing live reports with captured videos via an embedded WebKit browser.
"""

from __future__ import annotations

import argparse
import glob
import http.server
import os
import re
import select
import shutil
import signal
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser

import gi
gi.require_version("Gtk", "3.0")
try:
	gi.require_version("WebKit2", "4.1")
except ValueError:
	try:
		gi.require_version("WebKit2", "4.0")
	except ValueError:
		pass

from gi.repository import Gtk, Gdk, GLib, Pango
try:
	from gi.repository import WebKit2
except ImportError:
	WebKit2 = None

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEATURES_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "features")
PRIMARY_REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
PARALLEL_RUNNER = os.path.join(PROJECT_DIR, "tests", "e2e", "run_parallel_cucumber.py")

class ReportHTTPServer(threading.Thread):
	def __init__(self, directory: str, port: int = 8888):
		super().__init__(daemon=True)
		self.directory = directory
		self.port = port
		self.httpd = None

	def run(self):
		doc_dir = self.directory
		class CustomHandler(http.server.SimpleHTTPRequestHandler):
			def __init__(self, *args, **kwargs):
				super().__init__(*args, directory=doc_dir, **kwargs)

			def log_message(self, format, *args):
				pass # Silence request logs

		for try_port in range(self.port, self.port + 20):
			try:
				self.httpd = socketserver.TCPServer(("127.0.0.1", try_port), CustomHandler)
				self.port = try_port
				print(f"🌐 [ReportHTTPServer] Local report server running at http://127.0.0.1:{self.port}")
				self.httpd.serve_forever()
				break
			except OSError:
				continue

	def stop(self):
		if self.httpd:
			self.httpd.shutdown()

class E2ETestApp(Gtk.Window):
	def __init__(self, parent_pid: int | None = None):
		super().__init__(title="🐉 Quest: Warrior Dragon E2E Test Manager")
		self.parent_pid = parent_pid
		self.runner_proc: subprocess.Popen | None = None
		self.output_thread: threading.Thread | None = None
		self.is_running = False

		os.makedirs(PRIMARY_REPORTS_DIR, exist_ok=True)
		self.server = ReportHTTPServer(PRIMARY_REPORTS_DIR)
		self.server.start()
		time.sleep(0.2)

		self.set_default_size(1150, 750)
		self.set_position(Gtk.WindowPosition.CENTER)

		# Apply CSS Dark Theme styling for live console & toolbar
		css_provider = Gtk.CssProvider()
		css_data = b"""
		.console-view {
			font-family: Monospace, Courier, monospace;
			background-color: #1e1e1e;
			color: #d4d4d4;
			font-size: 13px;
		}
		.btn-kill {
			background: #e53935;
			color: white;
			font-weight: bold;
		}
		.btn-run {
			background: #43a047;
			color: white;
			font-weight: bold;
		}
		"""
		css_provider.load_from_data(css_data)
		Gtk.StyleContext.add_provider_for_screen(
			Gdk.Screen.get_default(),
			css_provider,
			Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
		)

		self._build_ui()
		self.load_features()
		self.connect("destroy", self._on_window_destroy)

	def _build_ui(self):
		# Header Bar
		header = Gtk.HeaderBar()
		header.set_show_close_button(True)
		header.set_title("🐉 Quest: Warrior Dragon E2E Test Manager")
		header.set_subtitle("Feature Selection, Parallel Execution & Live HTML Reports")
		self.set_titlebar(header)

		self.btn_run = Gtk.Button(label="🚀 Run Selected Tests")
		self.btn_run.get_style_context().add_class("btn-run")
		self.btn_run.connect("clicked", self.on_run_clicked)
		header.pack_start(self.btn_run)

		self.btn_kill = Gtk.Button(label="🛑 Kill Running Tests")
		self.btn_kill.get_style_context().add_class("btn-kill")
		self.btn_kill.set_sensitive(True)
		self.btn_kill.connect("clicked", self.on_kill_clicked)
		header.pack_start(self.btn_kill)

		btn_refresh = Gtk.Button(label="🔄 Refresh Report")
		btn_refresh.connect("clicked", lambda b: self.refresh_report())
		header.pack_end(btn_refresh)

		# Main Notebook (Tabs)
		self.notebook = Gtk.Notebook()
		self.add(self.notebook)

		# Tab 1: Feature Selector & Console Output
		tab1_vbox = Gtk.VBox(spacing=6)
		tab1_vbox.set_border_width(8)

		# Paned layout (Left: Features List, Right: Options & Live Logs)
		paned = Gtk.Paned(orientation=Gtk.Orientation.HORIZONTAL)
		paned.set_position(460)
		tab1_vbox.pack_start(paned, True, True, 0)

		# Left Panel: Features List
		left_vbox = Gtk.VBox(spacing=6)

		# Feature Filter entry
		filter_hbox = Gtk.HBox(spacing=6)
		lbl_search = Gtk.Label(label="🔍 Search:")
		self.entry_search = Gtk.SearchEntry()
		self.entry_search.set_placeholder_text("Search features or scenario titles...")
		self.entry_search.connect("search-changed", self.on_search_changed)
		filter_hbox.pack_start(lbl_search, False, False, 0)
		filter_hbox.pack_start(self.entry_search, True, True, 0)
		left_vbox.pack_start(filter_hbox, False, False, 0)

		# Quick selection & expand buttons
		sel_hbox = Gtk.HBox(spacing=4)
		btn_select_all = Gtk.Button(label="Select All")
		btn_select_all.connect("clicked", lambda b: self.set_all_selected(True))
		btn_deselect_all = Gtk.Button(label="Clear")
		btn_deselect_all.connect("clicked", lambda b: self.set_all_selected(False))
		btn_expand_all = Gtk.Button(label="Expand")
		btn_expand_all.connect("clicked", lambda b: self.treeview.expand_all())
		btn_collapse_all = Gtk.Button(label="Collapse")
		btn_collapse_all.connect("clicked", lambda b: self.treeview.collapse_all())
		sel_hbox.pack_start(btn_select_all, True, True, 0)
		sel_hbox.pack_start(btn_deselect_all, True, True, 0)
		sel_hbox.pack_start(btn_expand_all, True, True, 0)
		sel_hbox.pack_start(btn_collapse_all, True, True, 0)
		left_vbox.pack_start(sel_hbox, False, False, 0)

		# TreeView for features and scenarios
		# Model: [enabled (bool), item_label (str), title (str), scenario_count_str (str), target_path (str), is_feature (bool)]
		self.feature_model = Gtk.TreeStore(bool, str, str, str, str, bool)
		self.feature_filter = self.feature_model.filter_new()
		self.feature_filter.set_visible_func(self.filter_features_func)

		self.treeview = Gtk.TreeView(model=self.feature_filter)
		self.treeview.set_headers_visible(True)

		renderer_toggle = Gtk.CellRendererToggle()
		renderer_toggle.connect("toggled", self.on_feature_toggled)
		col_toggle = Gtk.TreeViewColumn("Run", renderer_toggle, active=0)
		self.treeview.append_column(col_toggle)

		renderer_file = Gtk.CellRendererText()
		col_file = Gtk.TreeViewColumn("Feature / Line", renderer_file, text=1)
		col_file.set_resizable(True)
		self.treeview.append_column(col_file)

		renderer_title = Gtk.CellRendererText()
		col_title = Gtk.TreeViewColumn("Feature / Scenario Title", renderer_title, text=2)
		col_title.set_resizable(True)
		self.treeview.append_column(col_title)

		renderer_scenarios = Gtk.CellRendererText()
		col_scenarios = Gtk.TreeViewColumn("Scenarios", renderer_scenarios, text=3)
		self.treeview.append_column(col_scenarios)

		scroll_features = Gtk.ScrolledWindow()
		scroll_features.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
		scroll_features.add(self.treeview)
		left_vbox.pack_start(scroll_features, True, True, 0)

		paned.pack1(left_vbox, False, False)

		# Right Panel: Runner Options & Live Terminal Console
		right_vbox = Gtk.VBox(spacing=8)
		right_vbox.set_border_width(4)

		# Options frame
		frame_opts = Gtk.Frame(label="⚙️ Execution Configuration")
		opts_grid = Gtk.Grid()
		opts_grid.set_column_spacing(12)
		opts_grid.set_row_spacing(8)
		opts_grid.set_border_width(8)

		# Parallel Workers
		lbl_workers = Gtk.Label(label="Parallel Workers:")
		lbl_workers.set_halign(Gtk.Align.END)
		self.spin_workers = Gtk.SpinButton.new_with_range(1, 16, 1)
		self.spin_workers.set_value(5)
		opts_grid.attach(lbl_workers, 0, 0, 1, 1)
		opts_grid.attach(self.spin_workers, 1, 0, 1, 1)

		# Mode Switch (Headed vs Headless)
		lbl_mode = Gtk.Label(label="Mode:")
		lbl_mode.set_halign(Gtk.Align.END)
		self.switch_headed = Gtk.Switch()
		self.switch_headed.set_active(False)
		lbl_mode_desc = Gtk.Label(label="Headless (Xvfb) ↔ Headed Desktop")
		lbl_mode_desc.set_halign(Gtk.Align.START)
		opts_grid.attach(lbl_mode, 2, 0, 1, 1)
		opts_grid.attach(self.switch_headed, 3, 0, 1, 1)
		opts_grid.attach(lbl_mode_desc, 4, 0, 1, 1)

		# Base Port
		lbl_port = Gtk.Label(label="Base REST Port:")
		lbl_port.set_halign(Gtk.Align.END)
		self.entry_port = Gtk.Entry()
		self.entry_port.set_text("8080")
		self.entry_port.set_width_chars(6)
		opts_grid.attach(lbl_port, 0, 1, 1, 1)
		opts_grid.attach(self.entry_port, 1, 1, 1, 1)

		frame_opts.add(opts_grid)
		right_vbox.pack_start(frame_opts, False, False, 0)

		# Terminal Console Frame
		frame_console = Gtk.Frame(label="🖥️ Execution Log Output")
		console_vbox = Gtk.VBox(spacing=4)
		console_vbox.set_border_width(4)

		self.text_buffer = Gtk.TextBuffer()
		self.text_view = Gtk.TextView.new_with_buffer(self.text_buffer)
		self.text_view.set_editable(False)
		self.text_view.set_cursor_visible(False)
		self.text_view.get_style_context().add_class("console-view")

		self.scroll_console = Gtk.ScrolledWindow()
		self.scroll_console.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
		self.scroll_console.add(self.text_view)
		console_vbox.pack_start(self.scroll_console, True, True, 0)

		frame_console.add(console_vbox)
		right_vbox.pack_start(frame_console, True, True, 0)

		# Status Bar
		self.statusbar = Gtk.Statusbar()
		self.status_context = self.statusbar.get_context_id("Status")
		self.statusbar.push(self.status_context, "Ready. Select feature tests and click 'Run Selected Tests'.")
		tab1_vbox.pack_start(self.statusbar, False, False, 0)

		paned.pack2(right_vbox, True, False)

		self.notebook.append_page(tab1_vbox, Gtk.Label(label="📋 Features & Execution"))

		# Tab 2: Embedded Report Browser
		tab2_vbox = Gtk.VBox(spacing=4)

		nav_hbox = Gtk.HBox(spacing=6)
		nav_hbox.set_border_width(4)

		btn_back = Gtk.Button(label="◀ Back")
		btn_back.connect("clicked", lambda b: self.webview.go_back() if WebKit2 and self.webview else None)
		btn_forward = Gtk.Button(label="▶ Forward")
		btn_forward.connect("clicked", lambda b: self.webview.go_forward() if WebKit2 and self.webview else None)
		btn_open_browser = Gtk.Button(label="🌐 Open in External Browser")
		btn_open_browser.connect("clicked", lambda b: webbrowser.open(f"http://127.0.0.1:{self.server.port}/index.html"))

		nav_hbox.pack_start(btn_back, False, False, 0)
		nav_hbox.pack_start(btn_forward, False, False, 0)
		nav_hbox.pack_end(btn_open_browser, False, False, 0)

		tab2_vbox.pack_start(nav_hbox, False, False, 0)

		if WebKit2:
			self.webview = WebKit2.WebView()
			report_url = f"http://127.0.0.1:{self.server.port}/index.html"
			self.webview.load_uri(report_url)
			tab2_vbox.pack_start(self.webview, True, True, 0)
		else:
			lbl_fallback = Gtk.Label()
			lbl_fallback.set_markup("<b>WebKit2 is not available.</b>\nClick 'Open in External Browser' above to view the HTML report.")
			tab2_vbox.pack_start(lbl_fallback, True, True, 0)
			self.webview = None

		self.notebook.append_page(tab2_vbox, Gtk.Label(label="📊 Test Report & Videos"))

	def load_features(self):
		self.feature_model.clear()
		if not os.path.exists(FEATURES_DIR):
			return

		found_files = sorted(glob.glob(os.path.join(FEATURES_DIR, "*.feature")))
		for filepath in found_files:
			fname = os.path.basename(filepath)
			feature_title = fname
			scenarios = [] # list of (line_number, scenario_title)
			try:
				with open(filepath, "r", encoding="utf-8") as f:
					for line_idx, line in enumerate(f, start=1):
						line_str = line.strip()
						if line_str.startswith("Feature:"):
							feature_title = line_str.replace("Feature:", "").strip()
						elif line_str.startswith("Scenario:") or line_str.startswith("Scenario Outline:"):
							sc_title = re.sub(r"^(Scenario|Scenario Outline):\s*", "", line_str)
							scenarios.append((line_idx, sc_title))
			except Exception:
				pass

			parent_iter = self.feature_model.append(
				None,
				[True, fname, feature_title, f"{len(scenarios)} scenario(s)", filepath, True]
			)

			for line_num, sc_title in scenarios:
				sc_target = f"{filepath}:{line_num}"
				self.feature_model.append(
					parent_iter,
					[True, f"Line {line_num}", sc_title, "", sc_target, False]
				)

		GLib.idle_add(self.treeview.expand_all)

	def filter_features_func(self, model, iter, data):
		query = self.entry_search.get_text().lower().strip()
		if not query:
			return True

		is_feature = model.get_value(iter, 5)
		name = (model.get_value(iter, 1) or "").lower()
		title = (model.get_value(iter, 2) or "").lower()

		if is_feature:
			if query in name or query in title:
				return True
			# Check child scenarios
			child_iter = model.iter_children(iter)
			while child_iter:
				c_name = (model.get_value(child_iter, 1) or "").lower()
				c_title = (model.get_value(child_iter, 2) or "").lower()
				if query in c_name or query in c_title:
					return True
				child_iter = model.iter_next(child_iter)
			return False
		else:
			if query in name or query in title:
				return True
			parent_iter = model.iter_parent(iter)
			if parent_iter:
				p_name = (model.get_value(parent_iter, 1) or "").lower()
				p_title = (model.get_value(parent_iter, 2) or "").lower()
				if query in p_name or query in p_title:
					return True
			return False

	def on_search_changed(self, entry):
		self.feature_filter.refilter()
		query = entry.get_text().strip()
		if query:
			self.treeview.expand_all()

	def on_feature_toggled(self, widget, path):
		child_path = self.feature_filter.convert_path_to_child_path(Gtk.TreePath.new_from_string(path))
		if not child_path:
			return

		iter = self.feature_model.get_iter(child_path)
		val = not self.feature_model.get_value(iter, 0)
		self.feature_model.set_value(iter, 0, val)

		is_feature = self.feature_model.get_value(iter, 5)
		if is_feature:
			c_iter = self.feature_model.iter_children(iter)
			while c_iter:
				self.feature_model.set_value(c_iter, 0, val)
				c_iter = self.feature_model.iter_next(c_iter)
		else:
			parent_iter = self.feature_model.iter_parent(iter)
			if parent_iter:
				any_checked = False
				c_iter = self.feature_model.iter_children(parent_iter)
				while c_iter:
					if self.feature_model.get_value(c_iter, 0):
						any_checked = True
						break
					c_iter = self.feature_model.iter_next(c_iter)
				self.feature_model.set_value(parent_iter, 0, any_checked)

	def set_all_selected(self, selected: bool):
		p_iter = self.feature_model.get_iter_first()
		while p_iter:
			self.feature_model.set_value(p_iter, 0, selected)
			c_iter = self.feature_model.iter_children(p_iter)
			while c_iter:
				self.feature_model.set_value(c_iter, 0, selected)
				c_iter = self.feature_model.iter_next(c_iter)
			p_iter = self.feature_model.iter_next(p_iter)

	def get_selected_features(self) -> list[str]:
		selected_targets = []
		p_iter = self.feature_model.get_iter_first()
		while p_iter:
			feature_target = self.feature_model.get_value(p_iter, 4)
			c_iter = self.feature_model.iter_children(p_iter)

			total_children = 0
			checked_children = 0
			checked_scenario_targets = []

			while c_iter:
				total_children += 1
				if self.feature_model.get_value(c_iter, 0):
					checked_children += 1
					checked_scenario_targets.append(self.feature_model.get_value(c_iter, 4))
				c_iter = self.feature_model.iter_next(c_iter)

			if total_children > 0 and checked_children == total_children:
				selected_targets.append(feature_target)
			elif checked_children > 0:
				selected_targets.extend(checked_scenario_targets)
			elif total_children == 0 and self.feature_model.get_value(p_iter, 0):
				selected_targets.append(feature_target)

			p_iter = self.feature_model.iter_next(p_iter)

		return selected_targets

	def log_text(self, text: str):
		def _append():
			end_iter = self.text_buffer.get_end_iter()
			self.text_buffer.insert(end_iter, text)
			adj = self.scroll_console.get_vadjustment()
			adj.set_value(adj.get_upper() - adj.get_page_size())
			return False
		GLib.idle_add(_append)

	def update_status(self, message: str):
		GLib.idle_add(lambda: self.statusbar.push(self.status_context, message))

	def on_run_clicked(self, button):
		selected = self.get_selected_features()
		if not selected:
			self.update_status("⚠️ No feature files selected! Please select at least one feature to run.")
			return

		self.is_running = True
		self.btn_run.set_sensitive(False)
		self.btn_kill.set_sensitive(True)
		self.text_buffer.set_text("") # Clear console

		workers = int(self.spin_workers.get_value())
		is_headed = self.switch_headed.get_active()
		base_port = self.entry_port.get_text().strip() or "8080"

		cmd = [
			sys.executable,
			PARALLEL_RUNNER,
			"-j", str(workers),
			"--base-port", base_port,
		]
		if is_headed:
			cmd.append("--headed")
		cmd.extend(selected)

		self.log_text(f"🚀 Launching Parallel E2E Test Suite ({len(selected)} feature(s), {workers} worker(s))...\n")
		self.log_text(f"Command: {' '.join(cmd)}\n" + "=" * 60 + "\n\n")

		try:
			env = os.environ.copy()
			if is_headed:
				env["HEADLESS"] = "0"
				env["USE_XVFB"] = "0"
			else:
				env["HEADLESS"] = "1"
				env["USE_XVFB"] = "1"

			self.runner_proc = subprocess.Popen(
				cmd,
				stdout=subprocess.PIPE,
				stderr=subprocess.STDOUT,
				text=True,
				bufsize=1,
				cwd=PROJECT_DIR,
				env=env,
				start_new_session=True,
			)

			self.update_status(f"Running tests... (Runner PID: {self.runner_proc.pid})")
			self.output_thread = threading.Thread(target=self._monitor_runner_output, daemon=True)
			self.output_thread.start()
		except Exception as e:
			self.log_text(f"❌ Failed to start test runner: {e}\n")
			self.on_run_finished(returncode=1)

	def _monitor_runner_output(self):
		if not self.runner_proc or not self.runner_proc.stdout:
			return

		for line in iter(self.runner_proc.stdout.readline, ''):
			if line:
				self.log_text(line)

		self.runner_proc.wait()
		rc = self.runner_proc.returncode
		GLib.idle_add(lambda: self.on_run_finished(rc))

	def on_run_finished(self, returncode: int):
		self.is_running = False
		self.btn_run.set_sensitive(True)
		self.btn_kill.set_sensitive(True)
		self.runner_proc = None

		if returncode == 0:
			self.update_status("✅ Test suite execution PASSED successfully!")
			self.log_text("\n✅ Execution Finished: All tests passed.\n")
		else:
			self.update_status("❌ Test suite execution completed with failures/errors.")
			self.log_text(f"\n❌ Execution Finished: Exit code {returncode}.\n")

		# Refresh report browser view
		self.refresh_report()

	def on_kill_clicked(self, button):
		self.log_text("\n🛑 [Kill Request] Terminating running test suite and child Godot/behave processes...\n")
		self.update_status("🛑 Terminating test suite...")

		if self.runner_proc:
			try:
				pgid = os.getpgid(self.runner_proc.pid)
				os.killpg(pgid, signal.SIGKILL)
			except Exception:
				try:
					self.runner_proc.kill()
				except Exception:
					pass

		if self.parent_pid:
			try:
				os.kill(self.parent_pid, signal.SIGKILL)
			except Exception:
				pass

		# Clean up any lingering Godot/behave processes system-wide
		try:
			subprocess.run(["pkill", "-9", "-f", "run_parallel_cucumber"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
			subprocess.run(["pkill", "-9", "-f", "behave"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
			subprocess.run(["pkill", "-9", "-f", "godot"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
			subprocess.run(["pkill", "-9", "-f", "ffmpeg"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
		except Exception:
			pass

		self.log_text("🛑 Test execution terminated.\n")
		if self.is_running:
			self.on_run_finished(returncode=137)
		else:
			self.update_status("🛑 Killed running Godot and behave processes.")

	def refresh_report(self):
		if WebKit2 and self.webview:
			report_url = f"http://127.0.0.1:{self.server.port}/index.html?t={int(time.time())}"
			self.webview.load_uri(report_url)

	def _on_window_destroy(self, widget):
		if self.is_running:
			self.on_kill_clicked(None)
		self.server.stop()
		Gtk.main_quit()

def main():
	parser = argparse.ArgumentParser(description="Quest: Warrior Dragon E2E Test Manager GUI App")
	parser.add_argument("--parent-pid", type=int, default=None, help="Parent test runner PID to kill when requested")
	args = parser.parse_args()

	app = E2ETestApp(parent_pid=args.parent_pid)
	app.show_all()
	Gtk.main()

if __name__ == "__main__":
	main()
