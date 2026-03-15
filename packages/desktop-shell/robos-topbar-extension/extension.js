const Main = imports.ui.main;
const GLib = imports.gi.GLib;

let _activitiesHidden = false;
let _clockMoved = false;
let _wsMoved = false;
let _appMenuHidden = false;

function init() {}

function enable() {
    let activities = Main.panel.statusArea.activities;
    if (activities) {
        activities.container.hide();
        _activitiesHidden = true;
    }

    let appMenu = Main.panel.statusArea.appMenu;
    if (appMenu) {
        appMenu.container.hide();
        _appMenuHidden = true;
    }

    let dateMenu = Main.panel.statusArea.dateMenu;
    if (dateMenu && Main.panel._centerBox.contains(dateMenu.container)) {
        Main.panel._centerBox.remove_actor(dateMenu.container);
        Main.panel._rightBox.insert_child_at_index(dateMenu.container, 0);
        _clockMoved = true;
    }

    let wsIndicator = Main.panel.statusArea['workspace-indicator'];
    if (wsIndicator && Main.panel._rightBox.contains(wsIndicator.container)) {
        Main.panel._rightBox.remove_actor(wsIndicator.container);
        Main.panel._leftBox.add_actor(wsIndicator.container);
        _wsMoved = true;
    }

    // Workspace indicator moved to left panel
}

function disable() {
    let activities = Main.panel.statusArea.activities;
    if (_activitiesHidden && activities)
        activities.container.show();

    let appMenu = Main.panel.statusArea.appMenu;
    if (_appMenuHidden && appMenu)
        appMenu.container.show();

    let dateMenu = Main.panel.statusArea.dateMenu;
    if (_clockMoved && dateMenu && Main.panel._rightBox.contains(dateMenu.container)) {
        Main.panel._rightBox.remove_actor(dateMenu.container);
        Main.panel._centerBox.add_actor(dateMenu.container);
    }

    let wsIndicator = Main.panel.statusArea['workspace-indicator'];
    if (_wsMoved && wsIndicator && Main.panel._leftBox.contains(wsIndicator.container)) {
        Main.panel._leftBox.remove_actor(wsIndicator.container);
        Main.panel._rightBox.add_actor(wsIndicator.container);
    }

    _activitiesHidden = false;
    _appMenuHidden = false;
    _clockMoved = false;
    _wsMoved = false;
}
