; Decoy installer tweaks. Tauri includes this file before any page is declared, so the MUI_* defines below
; replace the stock texts of the Welcome and Finish pages. The strings are LangStrings keyed by Windows language id
; (1033 = English, 1049 = Russian); when you add a language to "languages" in tauri.conf.json, add its id here too.

!define MUI_WELCOMEPAGE_TITLE "$(decoyWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(decoyWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(decoyFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(decoyFinishText)"

; Project link at the bottom of the Finish page
!define MUI_FINISHPAGE_LINK "$(decoyProjectLink)"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/leon03131/Decoy"

LangString decoyProjectLink 1033 "Decoy on GitHub"
LangString decoyProjectLink 1049 "Decoy на GitHub"

LangString decoyWelcomeTitle 1033 "Welcome to Decoy"
LangString decoyWelcomeTitle 1049 "Добро пожаловать в Decoy"

LangString decoyWelcomeText 1033 "Decoy keeps a tiny stand-in process running under a game's executable name, so you never need the real game on your disk.$\r$\n$\r$\nThe installer needs no administrator rights and takes a few seconds.$\r$\n$\r$\nClick Next to continue."
LangString decoyWelcomeText 1049 "Decoy держит крошечный процесс-заглушку под именем exe-файла игры, так что настоящая игра на диске не нужна.$\r$\n$\r$\nУстановщику не нужны права администратора, установка займёт несколько секунд.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."

LangString decoyFinishTitle 1033 "Decoy is ready"
LangString decoyFinishTitle 1049 "Decoy установлен"

LangString decoyFinishText 1033 "Decoy has been installed.$\r$\n$\r$\nIt lives in the system tray, and decoys are created only while they run, so nothing is left on your disk."
LangString decoyFinishText 1049 "Decoy установлен.$\r$\n$\r$\nПриложение работает из системного трея, а заглушки создаются только на время работы, поэтому на диске ничего не остаётся."

; No extra install steps needed; the macros exist so the hook file is complete and easy to extend.
!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
