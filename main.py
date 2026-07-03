import os
import sqlite3
import uuid
import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, status, Response, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .pdf_generator import generate_pdf_report
app = FastAPI(title="PostureFlex API", description="Backend APIs for PostureFlex physiotherapy assessment app")
# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "postureflex.db")
# Initialize SQLite database schema
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        patient_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        gender TEXT NOT NULL,
        notes TEXT,
        assessor_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        patient_uuid TEXT NOT NULL,
        date TEXT NOT NULL,
        session_type TEXT NOT NULL,
        module_type TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_uuid) REFERENCES patients (id) ON DELETE CASCADE
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS measurements (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        joint_name TEXT NOT NULL,
        measured_angle REAL NOT NULL,
        reference_range TEXT NOT NULL,
        deviation REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        pdf_url TEXT,
        interpretation TEXT NOT NULL,
        recommendations TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()
init_db()
# Models
class LoginRequest(BaseModel):
    username: str
    password: str
class PatientCreate(BaseModel):
    patient_id: str
    name: str
    age: int
    gender: str
    notes: Optional[str] = ""
    assessor_name: str
class MeasurementItem(BaseModel):
    joint: str
    side: str
    angle: float
    reference: str
    deviation: float
    status: str
class SessionCreate(BaseModel):
    patient_uuid: str
    session_type: str
    module_type: str
    risk_level: str
    notes: Optional[str] = ""
    measurements: List[MeasurementItem]
    interpretation: str
    recommendations: List[str]
class PDFReportRequest(BaseModel):
    patient: dict
    session: dict
    measurements: List[dict]
    image_base64: Optional[str] = None
    interpretation: str
    recommendations: List[str]
# API endpoints
@app.post("/api/auth/login")
def login(req: LoginRequest):
    if req.username == "postureflex" and req.password == "bptpf01":
        return {
            "authenticated": True,
            "token": "pf_token_" + str(uuid.uuid4())[:8],
            "user": {
                "username": "postureflex",
                "role": "assessor"
            }
        }
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials. Please check User ID and Password."
    )
@app.get("/api/patients")
def get_patients():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients ORDER BY created_at DESC")
    patients = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return patients
@app.post("/api/patients")
def create_patient(patient: PatientCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        pid = str(uuid.uuid4())
        created_at = datetime.datetime.now().isoformat()
        cursor.execute(
            "INSERT INTO patients (id, patient_id, name, age, gender, notes, assessor_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, patient.patient_id, patient.name, patient.age, patient.gender, patient.notes, patient.assessor_name, created_at)
        )
        conn.commit()
        return {"id": pid, "patient_id": patient.patient_id, "name": patient.name}
    except sqlite3.IntegrityError:
        cursor.execute("SELECT id, name FROM patients WHERE patient_id = ?", (patient.patient_id,))
        row = cursor.fetchone()
        if row:
            return {"id": row[0], "patient_id": patient.patient_id, "name": row[1], "exists": True}
        raise HTTPException(status_code=400, detail="Patient ID already exists.")
    finally:
        conn.close()
@app.post("/api/sessions")
def create_session(session: SessionCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        sid = str(uuid.uuid4())
        now = datetime.datetime.now().isoformat()
        today = datetime.date.today().isoformat()
        
        # Save session
        cursor.execute(
            "INSERT INTO sessions (id, patient_uuid, date, session_type, module_type, risk_level, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (sid, session.patient_uuid, today, session.session_type, session.module_type, session.risk_level, session.notes, now)
        )
        
        # Save measurements
        for m in session.measurements:
            mid = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO measurements (id, session_id, joint_name, measured_angle, reference_range, deviation, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (mid, sid, f"{m.side} {m.joint}".strip(), m.angle, m.reference, m.deviation, m.status, now)
            )
            
        # Save report details
        rid = str(uuid.uuid4())
        recs = "\n".join(session.recommendations)
        cursor.execute(
            "INSERT INTO reports (id, session_id, pdf_url, interpretation, recommendations, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (rid, sid, None, session.interpretation, recs, now)
        )
        
        conn.commit()
        return {"session_id": sid, "status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
@app.get("/api/history")
def get_history():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Join sessions, patients, and reports
    cursor.execute("""
        SELECT 
            s.id as session_id,
            s.date,
            s.session_type,
            s.module_type,
            s.risk_level,
            s.notes as session_notes,
            p.patient_id,
            p.name as patient_name,
            p.age as patient_age,
            p.gender as patient_gender,
            p.assessor_name,
            r.interpretation,
            r.recommendations
        FROM sessions s
        JOIN patients p ON s.patient_uuid = p.id
        LEFT JOIN reports r ON r.session_id = s.id
        ORDER BY s.created_at DESC
    """)
    rows = cursor.fetchall()
    
    history = []
    for row in rows:
        h_dict = dict(row)
        sid = h_dict["session_id"]
        
        # Fetch measurements for this session
        cursor.execute("SELECT joint_name, measured_angle, reference_range, deviation, status FROM measurements WHERE session_id = ?", (sid,))
        meas_rows = cursor.fetchall()
        measurements = []
        for mr in meas_rows:
            # Parse joint name back to side and joint
            full_name = mr[0]
            side = "Center"
            joint = full_name
            if full_name.startswith("Left "):
                side = "Left"
                joint = full_name[5:]
            elif full_name.startswith("Right "):
                side = "Right"
                joint = full_name[6:]
                
            measurements.append({
                "joint": joint,
                "side": side,
                "angle": mr[1],
                "reference": mr[2],
                "deviation": mr[3],
                "status": mr[4]
            })
            
        h_dict["measurements"] = measurements
        if h_dict["recommendations"]:
            h_dict["recommendations"] = h_dict["recommendations"].split("\n")
        else:
            h_dict["recommendations"] = []
            
        history.append(h_dict)
        
    conn.close()
    return history
@app.post("/api/reports/pdf")
def export_pdf(req: PDFReportRequest):
    try:
        pdf_bytes = generate_pdf_report(req.dict())
        filename = f"postureflex_report_{req.patient.get('id', 'patient')}_{datetime.date.today().isoformat()}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")
# Serve Frontend static assets
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_path):
    app.mount("/frontend", StaticFiles(directory=frontend_path), name="frontend")
@app.get("/")
def serve_index():
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h2>PostureFlex Frontend Not Found. Please place files in frontend directory.</h2>")
# Catch-all route to serve index.html for SPA page refresh routing support
@app.get("/{catchall:path}")
def serve_spa(catchall: str):
    # Exclude API routes
    if catchall.startswith("api/") or catchall.startswith("frontend/"):
        raise HTTPException(status_code=404, detail="API route not found")
    
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return FileResponse(os.path.join(frontend_path, "index.html"))
