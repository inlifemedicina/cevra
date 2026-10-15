"""Experimental fixed H/SDR PNG pair; private files, supervised producers, no project edits."""
from __future__ import annotations
import hashlib,json,os,stat,struct,tempfile
from pathlib import Path
import cevra_bounded_preview as inspection
import cevra_job_control as jobs
import cevra_manual_sequence as sequence
import cevra_manual_title as title

MAX_PNG=2*1024*1024

def validate(a):
    sequence._closed(a,{"version","composition","base","base_content","canonical","preview","owned_workspace"},"title preview")
    if type(a["version"]) is not int or a["version"]!=1: raise ValueError("invalid title preview version")
    title.validate(a["composition"])
    if a["composition"]["title"]["aspect"]!="16:9": raise ValueError("title preview requires H")
    c=sequence._closed(a["base_content"],{"sha256","size_bytes"},"base content")
    if not isinstance(c["sha256"],str) or len(c["sha256"])!=64 or any(x not in "0123456789abcdef" for x in c["sha256"]):raise ValueError("invalid base hash")
    sequence._integer(c["size_bytes"],1,8*1024*1024,"base size")
    paths=[sequence._path(a[k]) for k in ("owned_workspace","base","canonical","preview")]
    if len(set(paths))!=4:raise ValueError("aliased title paths")
    return paths

def _png(p,dimensions):
    stamp=p.lstat()
    if not stat.S_ISREG(stamp.st_mode) or not 24<=stamp.st_size<=MAX_PNG:raise ValueError("invalid title PNG size")
    with p.open("rb") as f:header=f.read(24)
    if header[:16]!=b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' or struct.unpack('>II',header[16:24])!=dimensions:raise ValueError("invalid title PNG grid")
    return stamp,inspection._hash_stable(p,stamp,MAX_PNG)

def run(common,a):
    root,base,canonical,preview=validate(a);stamp=root.lstat()
    if root.resolve()!=root or not stat.S_ISDIR(stamp.st_mode) or stat.S_IMODE(stamp.st_mode)!=0o700:raise ValueError("title workspace must be canonical private0700")
    if any(p.parent!=root for p in (base,canonical,preview)) or any(p.exists() or p.is_symlink() for p in (canonical,preview)):raise ValueError("title outputs must be new children of issued workspace")
    base_stamp=base.lstat()
    if not stat.S_ISREG(base_stamp.st_mode) or base_stamp.st_size!=a['base_content']['size_bytes'] or inspection._hash_stable(base,base_stamp,8*1024*1024)!=a['base_content']['sha256']:raise ValueError("base bytes changed")
    component_identity=title.identity();colour=Path(__file__).resolve().parent.parent/'components/manual-title/preview-colour'
    if not colour.is_file() or colour.is_symlink():raise ValueError("native preview colour helper unavailable")
    colour_hash=hashlib.sha256(colour.read_bytes()).hexdigest()
    budget=sequence._LogicalBudget(root,stamp,sequence.OWNED_BYTES)
    directory=Path(tempfile.mkdtemp(prefix='title-',dir=root));directory_stamp=directory.lstat()
    raw,corrected,small=directory/'raw.png',directory/'corrected.png',directory/'small.png'
    published={};success=False
    try:
        title.rasterize(common,budget,a['composition'],raw)
        budget.reserve(corrected,MAX_PNG,names=2)
        budget.run_native(common,[str(colour),str(raw),str(base),str(corrected)],names=2)
        budget.reserve(small,MAX_PNG,names=2)
        budget.run_native(common,common.ffmpeg_base(overwrite=False)+['-threads','2','-filter_threads','2','-i',str(corrected),'-vf','scale=720:404:flags=lanczos,format=rgba','-frames:v','1','-update','1',str(small)],names=2)
        publications={};hashes={}
        for src,dst,name,dimensions in [(corrected,canonical,'canonical',(1920,1080)),(small,preview,'preview',(720,404))]:
            jobs.check_cancelled();sequence._root_current(root,stamp);sequence._root_current(directory,directory_stamp)
            metadata,digest=_png(src,dimensions);os.link(src,dst,follow_symlinks=False);published[dst]=metadata
            publications[name]={'version':1,'scheme':'posix-dev-inode','device':str(metadata.st_dev),'inode':str(metadata.st_ino)};hashes[name]=digest
        if title.identity()!=component_identity or hashlib.sha256(colour.read_bytes()).hexdigest()!=colour_hash:raise RuntimeError('title renderer identity changed')
        if inspection._hash_stable(base,base_stamp,8*1024*1024)!=a['base_content']['sha256']:raise RuntimeError('base changed during title render')
        sequence._admit_owned_disk(root,stamp);jobs.check_cancelled()
        value={'type':'manual-title-preview','canonicalUri':str(canonical),'previewUri':str(preview),'canonicalSha256':hashes['canonical'],'previewSha256':hashes['preview'],'colourProfile':'kCGColorSpaceCoreMedia709','publications':publications}
        success=True
        return {'structuredContent':value,'content':[{'type':'text','text':json.dumps(value)}]}
    finally:
        sequence._root_current(root,stamp);sequence._root_current(directory,directory_stamp)
        if not success:
            for p,expected in published.items():
                actual=p.lstat()
                if (actual.st_dev,actual.st_ino)!=(expected.st_dev,expected.st_ino):raise RuntimeError('title output identity changed during cleanup')
                p.unlink()
        for p in (small,corrected,raw):p.unlink(missing_ok=True)
        directory.rmdir()
