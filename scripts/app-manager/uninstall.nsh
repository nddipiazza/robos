; electron-builder runs this both during upgrade and explicit uninstall.
; Keep downloaded apps during an upgrade; remove them with RobOS otherwise.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    RMDir /r "$LOCALAPPDATA\RobOS\app-manager"
    RMDir /r "$SMPROGRAMS\RobOS Apps"
  ${endIf}
!macroend
