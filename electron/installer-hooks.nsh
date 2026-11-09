# Upstream registers the association before this hook, leaving the executable unquoted.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Модель Arkita\shell\open\command" "" '"$appExe" "%1"'
  !insertmacro UPDATEFILEASSOC
!macroend
