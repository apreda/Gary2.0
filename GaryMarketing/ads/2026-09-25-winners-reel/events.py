import subprocess, numpy as np, sys
path=sys.argv[1]; fps=60; w=132; h=287
raw=subprocess.run(['ffmpeg','-v','error','-i',path,'-vf',f'fps={fps},scale={w}:{h},format=gray','-f','rawvideo','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.float32)
d=np.abs(np.diff(fr,axis=0)).mean(axis=(1,2))
# onsets: diff rises above thr after being below for >=0.15s
thr=float(sys.argv[2]) if len(sys.argv)>2 else 0.5
quiet=0; ons=[]
for i,v in enumerate(d):
    if v>thr and quiet>=int(0.15*fps): ons.append((i+1)/fps)
    quiet = quiet+1 if v<=thr else 0
print(' '.join(f'{x:.3f}' for x in ons))
print('intervals', ' '.join(f'{b-a:.3f}' for a,b in zip(ons,ons[1:])))
