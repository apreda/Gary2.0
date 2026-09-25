#!/bin/zsh
# Records the real Winners footage for the reel from a dedicated simulator.
# Usage: capture.sh <UDID>   (never Adam's 709A9235)
set -u
U=$1
D=${0:A:h}/capture
APP=/Volumes/KINGSTON/gary-dd/Build/Products/Debug-iphonesimulator/GaryApp.app
tour() { local C=$(xcrun simctl get_app_container $U ai.betwithgary.app data); printf "%s\n" "$1" > "$C/tmp/gary-tour.txt"; xcrun simctl spawn $U notifyutil -p com.gary.tour; }
rec() { # rec <name> <seconds> [tour command fired 1s in]
  xcrun simctl io $U recordVideo --codec=h264 --force "$D/$1.mp4" >/dev/null 2>&1 &
  local p=$!; sleep 1.2
  [[ -n "${3:-}" ]] && tour "$3"
  sleep $2; kill -INT $p; wait $p 2>/dev/null
}
xcrun simctl terminate $U ai.betwithgary.app 2>/dev/null
xcrun simctl install $U $APP
xcrun simctl status_bar $U override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi
xcrun simctl launch $U ai.betwithgary.app -tour.noPrompts YES -hasEntered YES -hasSeenGaryIntro YES -selectedTab 1 >/dev/null
sleep 3; tour "lab day 2026-09-24"; sleep 1
tour "lab reseal"; sleep 1
# relaunch so every module is built fresh for Thursday
xcrun simctl terminate $U ai.betwithgary.app
xcrun simctl launch $U ai.betwithgary.app -tour.noPrompts YES -hasEntered YES -hasSeenGaryIntro YES -selectedTab 1 >/dev/null
sleep 9
xcrun simctl io $U screenshot "$D/board_sealed.png" >/dev/null 2>&1
rec board_sealed 3
rec unveil 12.5 "lab unveil 463825"
tour "lab close"; sleep 1.5
tour "scroll -9000"; sleep 1
rec revealall 16 "lab reveal all"
sleep 1; tour "scroll -9000"; sleep 1
xcrun simctl io $U screenshot "$D/board_open.png" >/dev/null 2>&1
ls -la $D/*.mp4
