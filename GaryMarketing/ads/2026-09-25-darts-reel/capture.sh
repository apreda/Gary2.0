#!/bin/zsh
# Records the real Darts footage for the reel from a dedicated simulator.
# Usage: capture.sh <UDID>   (never Adam's 709A9235)
set -u
U=$1
D=${0:A:h}/capture
APP=/Volumes/KINGSTON/gary-dd/Build/Products/Debug-iphonesimulator/GaryApp.app
tour() { local C=$(xcrun simctl get_app_container $U ai.betwithgary.app data); printf "%s\n" "$1" > "$C/tmp/gary-tour.txt"; xcrun simctl spawn $U notifyutil -p com.gary.tour; }
rec() { # rec <name> <seconds> [tour command fired 1.2s in]
  xcrun simctl io $U recordVideo --codec=h264 --force "$D/$1.mp4" >/dev/null 2>&1 &
  local p=$!; sleep 1.2
  [[ -n "${3:-}" ]] && tour "$3"
  sleep $2; kill -INT $p; wait $p 2>/dev/null
}
shot() { xcrun simctl io $U screenshot "$D/$1.png" >/dev/null 2>&1; }
launch() {
  xcrun simctl terminate $U ai.betwithgary.app 2>/dev/null
  xcrun simctl launch $U ai.betwithgary.app -tour.noPrompts YES -hasEntered YES -hasSeenGaryIntro YES -selectedTab 2 >/dev/null
  sleep 9
}
xcrun simctl terminate $U ai.betwithgary.app 2>/dev/null
xcrun simctl install $U $APP
xcrun simctl status_bar $U override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi

# 1) today (Friday): the tape of Thursday's hits, then the home run darts thrown
launch; tour "darts day off"; launch
shot today_hr
rec tape 26
rec hr_throw 4 "darts throw"
shot today_hr_thrown

# 2) Thursday Night Football, replayed: every NFL board Gary threw on the game
tour "darts day 2026-09-24"; launch
tour "darts league NFL"; sleep 2
for k in td recyds passtd rushyds; do tour "darts kind $k"; sleep 1.5; shot "tnf_$k"; done
tour "darts kind td"; sleep 1.5
xcrun simctl io $U recordVideo --codec=h264 --force "$D/tnf_tabs.mp4" >/dev/null 2>&1 & p=$!
sleep 1.2
for k in recyds passtd rushyds td; do tour "darts kind $k"; sleep 1.0; done
sleep 0.6; kill -INT $p; wait $p 2>/dev/null
tour "darts day off"
ls -la $D
