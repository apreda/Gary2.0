import subprocess, numpy as np, sys
def diffs(path, fps=60, w=132, h=287):
    cmd=['ffmpeg','-v','error','-i',path,'-vf',f'fps={fps},scale={w}:{h},format=gray','-f','rawvideo','-']
    raw=subprocess.run(cmd,capture_output=True).stdout
    fr=np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.float32)
    d=np.abs(np.diff(fr,axis=0)).mean(axis=(1,2))
    return fr,d
path=sys.argv[1]
fr,d=diffs(path)
t=np.arange(len(d))/60
# print a coarse timeline: time, diff
for i in range(0,len(d),6):
    seg=d[i:i+6]; print(f"{t[i]:6.2f} {'#'*int(min(60,seg.max()*6))} {seg.max():.2f}")
