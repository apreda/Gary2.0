#!/bin/bash
# PHASE 2 APPLY (run the moment the founder says Xcode is CLOSED):
#   1. Move ProfileExperience.swift into the target folder
#   2. Register it in project.pbxproj (explicit-file-list project)
#   3. Insert ProfileFlowSection into ProfileView (after identityRow)
#   4. Build with KINGSTON derived data and report
set -euo pipefail
cd /Users/adam.preda/Desktop/Gary2.0

if pgrep -x Xcode >/dev/null; then
  echo "ABORT: Xcode is running — the clobber law. Close it first."
  exit 1
fi

mv ios/GaryApp/staged/ProfileExperience.swift ios/GaryApp/ProfileExperience.swift

python3 - <<'EOF'
import re, uuid
p = 'ios/GaryApp/GaryApp.xcodeproj/project.pbxproj'
s = open(p).read()
if 'ProfileExperience.swift' in s:
    print('pbxproj: already registered')
else:
    fid = uuid.uuid4().hex[:24].upper()
    bid = uuid.uuid4().hex[:24].upper()
    # Mirror UserBookView.swift's three registration sites.
    m = re.search(r'(\t\t)(\w{24}) /\* UserBookView\.swift \*/ = \{isa = PBXFileReference;[^\n]*\n', s)
    assert m, 'UserBookView file reference not found'
    s = s.replace(m.group(0), m.group(0) + f'\t\t{fid} /* ProfileExperience.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ProfileExperience.swift; sourceTree = "<group>"; }};\n')
    m2 = re.search(r'(\t\t)(\w{24}) /\* UserBookView\.swift in Sources \*/ = \{isa = PBXBuildFile; fileRef = (\w{24})[^\n]*\n', s)
    assert m2, 'UserBookView build file not found'
    s = s.replace(m2.group(0), m2.group(0) + f'\t\t{bid} /* ProfileExperience.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {fid} /* ProfileExperience.swift */; }};\n')
    s = re.sub(r'(\w{24} /\* UserBookView\.swift \*/,\n)', lambda mm: mm.group(1) + f'\t\t\t\t{fid} /* ProfileExperience.swift */,\n', s, count=1)
    s = re.sub(r'(\w{24} /\* UserBookView\.swift in Sources \*/,\n)', lambda mm: mm.group(1) + f'\t\t\t\t{bid} /* ProfileExperience.swift in Sources */,\n', s, count=1)
    open(p, 'w').write(s)
    print('pbxproj: registered')

p2 = 'ios/GaryApp/UserBookView.swift'
s2 = open(p2).read()
if 'ProfileFlowSection(' in s2:
    print('ProfileView: already inserted')
else:
    anchor = 'VStack(alignment: .leading, spacing: 22) {\n                    identityRow'
    assert anchor in s2, 'ProfileView identityRow anchor not found'
    s2 = s2.replace(anchor, anchor + '\n                    ProfileFlowSection(userId: AuthManager.shared.currentUser?.id)', 1)
    open(p2, 'w').write(s2)
    print('ProfileView: ProfileFlowSection inserted')
EOF

echo "── building ──"
xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Volumes/KINGSTON/gary-dd build 2>&1 | tail -5; echo BUILD_EXIT=$?
