# The winged lioness (round 13): the winged lion's girl, her own sculpt on the winged lion's skeleton
# (game/models/wingedlionf.json, which the game uses for a girl winged lion, see SEX_LOOK in 00_core.js). She is the
# lioness (lionf.py, as it is: no mane, the lighter build and finer head, the even tawny coat) with the winged lion's
# golden eagle wings (wingedlion.py's graft(): the feathered wing arm on its root out of the shoulder blades, the coat
# running into small feathers, and the same feather atlas). Made at the lion's size; the game scales her to 0.88.
# Her cub is the lion cub (lionf.py's) with the same small downy wing buds.
# Make it with: python3 tools/blender/export_rig.py wingedlion tools/blender/work/wingedlionf-rig.json, then
# VOXEL=0.0092 TRIS=4600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py wingedlionf sculpt export
import panthera as PT
import wingedlion as WL
import lionf as LF

KS = LF.KS
C = WL.graft(LF.C, 'wingedlionf')
PT.install(globals(), C, KS)
ID = 'wingedlionf'
FEATHER_ATLAS = WL.FEATHER_ATLAS
WL.make_extra(globals())
