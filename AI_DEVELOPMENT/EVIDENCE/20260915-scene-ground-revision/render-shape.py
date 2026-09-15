from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).parent
surfaces=json.loads((R/'candidate-surfaces.json').read_text())
def render(name,select,cam,target,scale):
 W,H=960,720;rgb=np.full((H,W,3),[182,180,168],dtype=np.float64);depth=np.full((H,W),np.inf)
 cam=np.array(cam,dtype=float);forward=np.array(target)-cam;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
 sun=np.array([-.55,.72,.40]);sun/=np.linalg.norm(sun)
 for s in surfaces:
  if not select(s['name']):continue
  xyz=np.asarray(s['positions']).reshape(-1,3);indices=np.array(s['indices']) if s['indices'] else np.arange(len(xyz));faces=indices.reshape(-1,3)
  n=np.asarray(s['normals']).reshape(-1,3);colors=np.asarray(s['colors']).reshape(-1,3)*np.asarray(s['color'])
  rel=xyz-cam;xy=np.column_stack([W/2+rel@right*scale,H*.53-rel@up*scale]);zz=rel@forward
  for f in faces:
   p=xy[f];x0=max(0,int(np.floor(p[:,0].min())));x1=min(W-1,int(np.ceil(p[:,0].max())));y0=max(0,int(np.floor(p[:,1].min())));y1=min(H-1,int(np.ceil(p[:,1].max())))
   if x1<x0 or y1<y0:continue
   normal=n[f].mean(axis=0);normal/=max(np.linalg.norm(normal),1e-9)
   if np.dot(normal,forward)>.01:continue
   a,b,c=p;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-6:continue
   yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
   w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1
   z=w0*zz[f[0]]+w1*zz[f[1]]+w2*zz[f[2]];mask=(w0>=0)&(w1>=0)&(w2>=0)&(z<depth[y0:y1+1,x0:x1+1])
   # Linear material color and directional shading, then display transfer.
   color=np.clip((colors[f].mean(axis=0)*(.42+.65*max(0,np.dot(normal,sun))))**(1/2.2)*255,0,255)
   depth[y0:y1+1,x0:x1+1][mask]=z[mask];rgb[y0:y1+1,x0:x1+1][mask]=color
 im=Image.fromarray(rgb.astype('uint8'));draw=ImageDraw.Draw(im);draw.rectangle((0,0,W,44),fill=(30,35,34));draw.text((16,15),name+' | actual generated triangles, CPU shape preview; no game textures/shadows',fill=(240,238,221));im.save(R/(name+'.png'))
render('ridge-shape',lambda n:n.startswith('route-rock-stratum'),[10,8,4],[0,1,-9.25],61)
