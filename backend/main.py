from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pathlib import Path
import io, zipfile, subprocess, tempfile, shutil, os
import fitz  # PyMuPDF

app = FastAPI(title="FileFlow API", version="0.1.0")
# Development-friendly. Restrict this to your real frontend origin in production.
allowed_origins = [
    origin.strip() for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8080,http://localhost:8080"
    ).split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["*"],
)
MAX_BYTES = 30 * 1024 * 1024

async def read_upload(upload: UploadFile, allowed_exts: set[str]) -> tuple[bytes, str]:
    filename = Path(upload.filename or "upload").name
    ext = Path(filename).suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(400, f"Unsupported file type. Allowed: {', '.join(sorted(allowed_exts))}")
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is too large. Maximum upload size is 30 MB.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    return data, filename

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "FileFlow API"}

@app.post("/api/pdf-to-jpg")
async def pdf_to_jpg(file: UploadFile = File(...)):
    data, filename = await read_upload(file, {".pdf"})
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count > 100:
            doc.close()
            raise HTTPException(413, "This starter version supports up to 100 PDF pages per conversion.")
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for i, page in enumerate(doc, start=1):
                pix = page.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), alpha=False)
                archive.writestr(f"page-{i:03d}.jpg", pix.tobytes("jpeg", jpg_quality=88))
        doc.close()
        output.seek(0)
        stem = Path(filename).stem
        return StreamingResponse(output, media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{stem}-jpg-pages.zip"'})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, "Could not read this PDF. It may be damaged or password-protected.") from exc

@app.post("/api/ppt-to-pdf")
async def ppt_to_pdf(file: UploadFile = File(...)):
    data, filename = await read_upload(file, {".ppt", ".pptx"})
    office = shutil.which("libreoffice") or shutil.which("soffice")
    if not office:
        raise HTTPException(503, "LibreOffice is not installed on the backend. Install it and restart the API.")
    try:
        with tempfile.TemporaryDirectory(prefix="fileflow-") as tmp:
            tmpdir = Path(tmp)
            source = tmpdir / Path(filename).name
            source.write_bytes(data)
            result = subprocess.run(
                [office, "--headless", "--convert-to", "pdf", "--outdir", str(tmpdir), str(source)],
                capture_output=True, text=True, timeout=90, check=False
            )
            target = tmpdir / (source.stem + ".pdf")
            if result.returncode != 0 or not target.exists():
                raise HTTPException(422, "PowerPoint conversion failed. Check that the presentation is valid.")
            pdf_data = target.read_bytes()
        return StreamingResponse(io.BytesIO(pdf_data), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{Path(filename).stem}.pdf"'})
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "Conversion timed out. Try a smaller presentation.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, "Conversion failed unexpectedly.") from exc
