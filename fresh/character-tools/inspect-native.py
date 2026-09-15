"""CPU projection of actual derived vertices/UVs, for fitting diagnostics only.

This is not a Three.js/WebGL capture, a reference comparison, or a claim about
the game's lighting. It catches geometric/fitting defects before CI capture.
Requires numpy and Pillow. Run from the repository root.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'character-assets'
DATA = json.loads((ROOT / 'native-data.js').read_text().split('export default ', 1)[1].rstrip(';\n'))
OUT = Path('.pilot-inspection')
OUT.mkdir(exist_ok=True)
TEXTURES = {name: np.asarray(Image.open(ROOT / 'textures' / file).convert('RGBA')) / 255 for name, file in
            [('head', 'young-asian-male.png'), ('eyes', 'brown-eye.png'), ('hair', 'short-hair.png'), ('brows','eyebrows.png')]}


def render(parts, name, target, angle=0, span=.38, pitch=0):
    width, height = 720, 720
    view = np.array([np.sin(angle)*np.cos(pitch), np.sin(pitch), -np.cos(angle)*np.cos(pitch)])
    right = np.cross(-view, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, -view)
    camera = np.array(target) + view * 2
    buf = np.ones((height, width, 3)) * [.22, .25, .27]
    depth = np.ones((height, width)) * np.inf
    light = np.array([-.5, .8, -1]); light /= np.linalg.norm(light)
    for data, texture_name, color in parts:
        vertices = np.array(data['position']).reshape(-1, 3)
        normals = np.array(data['normal']).reshape(-1, 3)
        uv = np.array(data['uv']).reshape(-1, 2)
        triangles = np.array(data['index']).reshape(-1, 3)
        rel = vertices - camera
        screen = np.stack([rel @ right / span * width + width/2,
                           -rel @ up / span * height + height/2,
                           rel @ -view], axis=1)
        texture = TEXTURES.get(texture_name)
        for ids in triangles:
            p = screen[ids]
            face = np.cross(vertices[ids[1]]-vertices[ids[0]], vertices[ids[2]]-vertices[ids[0]])
            if texture_name not in ['hair','brows'] and not data.get('twoSided') and face @ view <= 0:
                continue
            xmin, ymin = np.maximum(np.floor(p[:, :2].min(0)), 0).astype(int)
            xmax, ymax = np.minimum(np.ceil(p[:, :2].max(0)), [width-1, height-1]).astype(int)
            if xmin > xmax or ymin > ymax:
                continue
            xx, yy = np.meshgrid(np.arange(xmin, xmax+1)+.5, np.arange(ymin, ymax+1)+.5)
            a, b, c = p
            den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den) < 1e-10:
                continue
            w0 = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1])) / den
            w1 = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1])) / den
            bary = np.stack([w0, w1, 1-w0-w1], axis=-1)
            z = bary @ p[:, 2]
            region = depth[ymin:ymax+1, xmin:xmax+1]
            valid = (bary.min(-1) >= -1e-6) & (z < region)
            if not valid.any():
                continue
            normal = bary @ normals[ids]
            normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-10)
            if (texture_name in ['hair','brows'] or data.get('twoSided')) and face @ view < 0:
                normal *= -1
            shade = .46 + .64*np.maximum(0, normal @ light)
            if texture is not None:
                sample_uv = np.clip(bary @ uv[ids], 0, 1)
                tx = np.rint(sample_uv[..., 0]*(texture.shape[1]-1)).astype(int)
                ty = np.rint((1-sample_uv[..., 1])*(texture.shape[0]-1)).astype(int)
                sample = texture[ty, tx]
                valid &= sample[..., 3] >= .42
                rgb = sample[..., :3]
                if 'color' in data:
                    rgb = rgb*(bary @ np.array(data['color']).reshape(-1,3)[ids])
            else:
                rgb = np.ones((*z.shape, 3)) * color
            region[valid] = z[valid]
            buf[ymin:ymax+1, xmin:xmax+1][valid] = np.clip(rgb * shade[..., None], 0, 1)[valid]
    Image.fromarray(np.rint(buf*255).astype('uint8')).save(OUT / f'{name}.png')


def cylinder(center, radius=.032, height=.17):
    p, n, uv, ix = [], [], [], []
    for row in range(2):
        for i in range(49):
            theta=i/48*np.pi*2
            p.extend([center[0]+np.cos(theta)*radius, center[1]+(row-.5)*height, center[2]+np.sin(theta)*radius])
            n.extend([np.cos(theta), 0, np.sin(theta)]); uv.extend([i/48, row])
    for i in range(48):
        ix.extend([i, i+49, i+1, i+1, i+49, i+50])
    return {'position':p, 'normal':n, 'uv':uv, 'index':ix}


if '--rig' in sys.argv:
    suffix=sys.argv[sys.argv.index('--rig')+1] if sys.argv.index('--rig')+1<len(sys.argv) else ''
    rig=json.loads((OUT/f'production-rig{suffix}.json').read_text())
    render(rig['parts'], 'production-full'+suffix, rig['center'], angle=.60, span=2.1)
    render(rig['parts'], 'production-back'+suffix, rig['center'], angle=np.pi+.15, span=2.1)
    detailed=rig.get('detailed',rig.get('study','idle' if not suffix else 'motion')=='idle')
    if detailed:
        render(rig['parts'], 'production-head-shoulders'+suffix, rig['head'], angle=.50, span=.68)
        render(rig['parts'], 'production-hand'+suffix, rig['hand'], angle=.50, span=.55)
    print(f'Wrote {4 if detailed else 2} CPU production-pose diagnostics (not WebGL)')
    raise SystemExit()

figure = DATA['figures']['player']
parts = [(figure[name], name, None) for name in ['head', 'eyes', 'hair','brows']]
render(parts, 'head-front', [0, .13, -.035])
render(parts, 'head-threequarter', [0, .13, -.035], angle=.65)
render(parts, 'head-profile', [0, .13, -.035], angle=1.52)
hand = DATA['hands']['right']
parts = [(hand['geometry'], 'head', None), (cylinder(hand['gripOffset']), None, [.16, .14, .11])]
render(parts, 'hand-back', [-.060, -.007, .025], span=.23)
render(parts, 'hand-front', [-.060, -.007, .025], span=.23, angle=np.pi)
render(parts, 'hand-end', [-.060, -.007, .025], span=.23, angle=.65, pitch=.6)
print(f'Wrote six CPU geometry/UV diagnostics to {OUT}')
