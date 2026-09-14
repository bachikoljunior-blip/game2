"""Inspect one existing game2 CI artifact; publish review blobs, never update refs."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = "bachikoljunior-blip/game2"
SOURCE = "5afdd48e56613adfdbd26f54e5b2c02a79b3ffc2"
RUN = 34823475645
ARTIFACT = 10338653945
ZIP_HASH = "0178c96768bf1f04807d1833fb3275cd1515174d4f96f067b8ad3ce1308e8674"
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXPANDED = 160 * 1024 * 1024
EXPECTED_PNGS = {"title.png", "encounter.png", "mission-victory.png", "mobile.png",
                 "mobile-mission-victory.png", "mobile-mission-victory-portrait.png"}
EXPECTED_VIDEOS = {"desktop-continuous.webm":"47d9a03628cd56cff98cb29e353fb0c3596ed5867b77c2176ff46b32d4a4a89e","touch-continuous.webm":"4571470255d0ce8a4a9334b10e438956e4ec066c53a4635a6a0c1e6f2d7e947d"}

class ValidationError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def api(path, value=None):
    assert os.environ["GITHUB_REPOSITORY"] == REPO
    request = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + path,
        data=None if value is None else json.dumps(value).encode(),
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"},
    )
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=40) as response:
        return json.load(response)

def download_archive(path):
    # Never forward the GitHub credential to the artifact storage redirect.
    request = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + "/actions/artifacts/" + str(ARTIFACT) + "/zip",
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github+json"},
    )
    try:
        urllib.request.build_opener(NoRedirect()).open(request, timeout=40)
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise
        location = error.headers["Location"]
    else:
        raise ValidationError("Expected artifact storage redirect")
    parsed = urllib.parse.urlparse(location)
    allowed = (".blob.core.windows.net", ".githubusercontent.com", ".amazonaws.com")
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(allowed):
        raise ValidationError("Unexpected artifact storage host")
    total = 0
    with urllib.request.urlopen(location, timeout=40) as response, path.open("wb") as out:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE:
                raise ValidationError("Artifact exceeds size limit")
            out.write(chunk)

def run_command(args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True, timeout=120).stdout

def publish(path, kind):
    data = path.read_bytes()
    if len(data) > 8 * 1024 * 1024:
        raise ValidationError("Review image exceeds size limit")
    blob = api("/git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})
    expected = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if blob["sha"] != expected:
        raise ValidationError("Returned image blob identity mismatch")
    item = {"file": path.name, "kind": kind, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "blobSha": blob["sha"]}
    print("GAME2_REVIEW_RAW_BLOB " + json.dumps(item, separators=(",", ":")), flush=True)
    # The repository connector reads UTF-8 only. A text envelope transports these
    # exact image bytes to independent review; binary blobs remain canonical.
    envelope = json.dumps({"mimeType": "image/png" if path.suffix == ".png" else "image/jpeg",
                           "sourceRevision": SOURCE, "sha256": item["sha256"],
                           "data": base64.b64encode(data).decode()}, separators=(",", ":"))
    transport = api("/git/blobs", {"content": envelope, "encoding": "utf-8"})
    encoded = envelope.encode("utf-8")
    expected_transport = hashlib.sha1(b"blob " + str(len(encoded)).encode() + b"\0" + encoded).hexdigest()
    if transport["sha"] != expected_transport:
        raise ValidationError("Returned transport blob identity mismatch")
    item["transportBlobSha"] = transport["sha"]
    return item

def main():
    run = api("/actions/runs/" + str(RUN))
    artifact = api("/actions/artifacts/" + str(ARTIFACT))
    if run["head_sha"] != SOURCE or run["conclusion"] != "success":
        raise ValidationError("Source CI identity or result mismatch")
    if artifact["workflow_run"]["id"] != RUN or artifact["workflow_run"]["head_sha"] != SOURCE:
        raise ValidationError("Artifact source mismatch")
    if artifact["digest"] != "sha256:" + ZIP_HASH or artifact["expired"]:
        raise ValidationError("Artifact digest or retention mismatch")
    receipt = {"sourceRevision": SOURCE, "sourceRun": RUN, "artifactId": ARTIFACT,
               "archiveSha256": ZIP_HASH, "images": [], "videos": [],
               "scope": "Existing CI evidence only. Original PNG bytes; five-second sampled contact sheets. No new gameplay, audio, performance or source-blind judgment. No branch/ref updates."}
    with tempfile.TemporaryDirectory(prefix="game2-review-") as directory:
        root = Path(directory)
        archive = root / "source.zip"
        download_archive(archive)
        if archive.stat().st_size != artifact["size_in_bytes"]:
            raise ValidationError("Archive length mismatch")
        if hashlib.sha256(archive.read_bytes()).hexdigest() != ZIP_HASH:
            raise ValidationError("Archive hash mismatch")
        extracted = root / "artifact"
        with zipfile.ZipFile(archive) as zipped:
            infos = zipped.infolist()
            if sum(item.file_size for item in infos) > MAX_EXPANDED:
                raise ValidationError("Expanded artifact exceeds limit")
            for item in infos:
                name = PurePosixPath(item.filename)
                if name.is_absolute() or ".." in name.parts or "\\" in item.filename:
                    raise ValidationError("Unsafe archive path")
                if stat.S_ISLNK(item.external_attr >> 16):
                    raise ValidationError("Archive symlink rejected")
            zipped.extractall(extracted)
        reports = list(extracted.rglob("browser-report.json"))
        if len(reports) != 1:
            raise ValidationError("Expected one browser report")
        report = json.loads(reports[0].read_text())
        if report["sourceRevision"] != SOURCE or report["result"] != "passed" or report["errors"]:
            raise ValidationError("Browser report identity/result mismatch")
        pngs = sorted(extracted.rglob("*.png"))
        if len(pngs) != len(EXPECTED_PNGS) or {x.name for x in pngs} != EXPECTED_PNGS:
            raise ValidationError("Missing, duplicate or unexpected PNG")
        prepared = []
        for png in pngs:
            run_command(["ffmpeg", "-v", "error", "-xerror", "-i", str(png), "-f", "null", "-"])
            prepared.append((png, "unchanged CI PNG"))
        for filename in ("desktop-continuous.webm", "touch-continuous.webm"):
            paths = list(extracted.rglob(filename))
            if len(paths) != 1:
                raise ValidationError("Expected one recording per apparatus")
            video = paths[0]
            if hashlib.sha256(video.read_bytes()).hexdigest() != EXPECTED_VIDEOS[filename]:
                raise ValidationError("Recording hash mismatch")
            probe = json.loads(run_command(["ffprobe", "-v", "error", "-show_streams",
                                           "-show_format", "-of", "json", str(video)]))
            stream = next(x for x in probe["streams"] if x["codec_type"] == "video")
            if float(probe["format"]["duration"]) > 120:
                raise ValidationError("Contact sheet layout expects at most120seconds")
            sheet = root / (video.stem + "-5s.jpg")
            run_command(["ffmpeg", "-v", "error", "-xerror", "-i", str(video),
                         "-vf", "fps=1/5,scale=320:-1,tile=4x6:padding=4:margin=4",
                         "-frames:v", "1", "-q:v", "3", str(sheet)])
            prepared.append((sheet, "5-second samples; approximate times, not full-motion review"))
            receipt["videos"].append({"file": filename, "bytes": video.stat().st_size,
                "sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
                "width": stream["width"], "height": stream["height"],
                "durationSeconds": float(probe["format"]["duration"]),
                "audioTracks": sum(x["codec_type"] == "audio" for x in probe["streams"])})
        # Validate and prepare every image/video before creating the first Git blob.
        for image, kind in prepared:
            item = publish(image, kind)
            receipt["images"].append(item)
            print("GAME2_REVIEW_IMAGE " + json.dumps(item, separators=(",", ":")), flush=True)
    print("GAME2_REVIEW_SNAPSHOT " + json.dumps(receipt, separators=(",", ":")))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Keep signed storage URLs, headers and credentials out of logs.
        detail = str(error) if isinstance(error, ValidationError) else "details omitted to avoid credential or signed-URL logging"
        print("GAME2_REVIEW_SNAPSHOT_ERROR " + type(error).__name__ + ": " + detail, flush=True)
        raise SystemExit(1)
