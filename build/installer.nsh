!include LogicLib.nsh
!include nsDialogs.nsh

!macro customHeader
  LicenseForceSelection radiobuttons
!macroend

Var TasksDialog
Var CheckboxDesktop
Var CheckboxStartMenu

Function SelectTasksPageShow
  nsDialogs::Create 1018
  Pop $TasksDialog
  ${If} $TasksDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Select the additional tasks you would like Setup to perform while installing Interview Assistant, then click Next."
  Pop $0

  ${NSD_CreateLabel} 0 30u 100% 12u "Additional icons:"
  Pop $0

  ${NSD_CreateCheckbox} 15u 46u 100% 12u "Create a desktop icon"
  Pop $CheckboxDesktop
  ${NSD_SetState} $CheckboxDesktop ${BST_CHECKED}

  ${NSD_CreateCheckbox} 15u 64u 100% 12u "Create a Start Menu shortcut"
  Pop $CheckboxStartMenu
  ${NSD_SetState} $CheckboxStartMenu ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function SelectTasksPageLeave
FunctionEnd

!macro customPageAfterChangeDir
  Page custom SelectTasksPageShow SelectTasksPageLeave
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayIcon" "$INSTDIR\Interview Assistant.exe,0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayIcon" "$INSTDIR\Interview Assistant.exe,0"
  CreateShortCut "$DESKTOP\Interview Assistant.lnk" "$INSTDIR\Interview Assistant.exe" "" "$INSTDIR\Interview Assistant.exe" 0
  CreateShortCut "$SMPROGRAMS\Interview Assistant.lnk" "$INSTDIR\Interview Assistant.exe" "" "$INSTDIR\Interview Assistant.exe" 0
!macroend
