import io
import os
import base64
import tempfile
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
def generate_pdf_report(data):
    """
    Generates a PDF report using ReportLab.
    'data' should contain:
    - patient: dict with name, age, gender, id, assessor, session_type
    - session: dict with date, module, risk_level, notes
    - measurements: list of dicts with joint, side, angle, reference, deviation, status
    - image_base64: optional base64 image data URL of the posture frame
    - interpretation: str
    - recommendations: list of str
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    # Primary: Deep Purple (#6d28d9), Secondary: Indigo (#4f46e5), Text: Dark Gray (#1f2937)
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        textColor=colors.HexColor('#6d28d9'),
        spaceAfter=15
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        textColor=colors.HexColor('#4f46e5'),
        spaceBefore=10,
        spaceAfter=6,
        borderColor=colors.HexColor('#e5e7eb'),
        borderWidth=0.5,
        borderPadding=4
    )
    
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#1f2937'),
        leading=14
    )
    
    bold_body_style = ParagraphStyle(
        'BoldBodyDark',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    
    meta_label_style = ParagraphStyle(
        'MetaLabel',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#4b5563')
    )
    
    status_normal = ParagraphStyle(
        'NormalStatus',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#059669') # Emerald
    )
    
    status_warning = ParagraphStyle(
        'WarningStatus',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#d97706') # Amber
    )
    
    status_danger = ParagraphStyle(
        'DangerStatus',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#dc2626') # Red
    )
    story = []
    
    # 1. Header Table (App Name & Doc Type)
    header_data = [
        [
            Paragraph("PostureFlex", ParagraphStyle('PFLogo', fontName='Helvetica-Bold', fontSize=26, textColor=colors.HexColor('#6d28d9'))),
            Paragraph("CLINICAL ASSESSMENT REPORT", ParagraphStyle('PFSub', fontName='Helvetica-Bold', fontSize=12, textColor=colors.HexColor('#4b5563'), alignment=2))
        ]
    ]
    header_table = Table(header_data, colWidths=[3.0 * inch, 4.2 * inch])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(header_table)
    
    # Divider line
    story.append(Table([[""]], colWidths=[7.2 * inch], rowHeights=[2], style=TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#6d28d9')),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ])))
    story.append(Spacer(1, 15))
    
    # 2. Patient Demographics & Assessment Meta
    patient = data.get('patient', {})
    session = data.get('session', {})
    
    meta_data = [
        [
            Paragraph("Patient Name:", meta_label_style), Paragraph(patient.get('name', 'N/A'), body_style),
            Paragraph("Assessment Date:", meta_label_style), Paragraph(session.get('date', 'N/A'), body_style)
        ],
        [
            Paragraph("Patient ID:", meta_label_style), Paragraph(patient.get('patient_id', 'N/A'), body_style),
            Paragraph("Session Type:", meta_label_style), Paragraph(patient.get('session_type', 'N/A'), body_style)
        ],
        [
            Paragraph("Age / Gender:", meta_label_style), Paragraph(f"{patient.get('age', 'N/A')} yrs / {patient.get('gender', 'N/A')}", body_style),
            Paragraph("Module Used:", meta_label_style), Paragraph(session.get('module', 'BPT1'), bold_body_style)
        ],
        [
            Paragraph("Assessor:", meta_label_style), Paragraph(patient.get('assessor', 'N/A'), body_style),
            Paragraph("Overall Risk:", meta_label_style), 
            Paragraph(
                session.get('risk_level', 'Normal'), 
                status_danger if 'Significant' in session.get('risk_level', '') else (status_warning if 'Mild' in session.get('risk_level', '') else status_normal)
            )
        ]
    ]
    
    meta_table = Table(meta_data, colWidths=[1.2*inch, 2.4*inch, 1.4*inch, 2.2*inch])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f9fafb')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#f3f4f6')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))
    
    # 3. Posture Frame Image (If base64 provided)
    image_file = None
    if data.get('image_base64'):
        try:
            # Strip data URL prefix if present
            base64_str = data['image_base64']
            if ',' in base64_str:
                base64_str = base64_str.split(',')[1]
            
            img_data = base64.b64decode(base64_str)
            
            # Use tempfile to write image temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_img:
                temp_img.write(img_data)
                image_file = temp_img.name
            
            # Resize image to fit nicely (e.g., width 4.5 inches, maintaining ratio if possible)
            # The canvas snapshot from video is usually 4:3 or 16:9
            posture_img = Image(image_file, width=4.0 * inch, height=3.0 * inch)
            
            img_container = Table([[posture_img]], colWidths=[7.2 * inch])
            img_container.setStyle(TableStyle([
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ]))
            
            # Keep image and its heading together
            story.append(Paragraph("Visual Analysis Capture", section_heading))
            story.append(img_container)
            story.append(Spacer(1, 10))
        except Exception as e:
            print("Error processing image in PDF generator:", e)
            if image_file and os.path.exists(image_file):
                os.remove(image_file)
                image_file = None
                
    # 4. Measurements & Deviations Table
    story.append(Paragraph("Biomechanical Measurements", section_heading))
    
    measurements = data.get('measurements', [])
    meas_table_data = [[
        Paragraph("<b>Joint/Parameter</b>", bold_body_style),
        Paragraph("<b>Side</b>", bold_body_style),
        Paragraph("<b>Measured Angle</b>", bold_body_style),
        Paragraph("<b>Normal Range</b>", bold_body_style),
        Paragraph("<b>Deviation</b>", bold_body_style),
        Paragraph("<b>Status</b>", bold_body_style)
    ]]
    
    for m in measurements:
        status_text = m.get('status', 'Normal')
        if 'Significant' in status_text:
            status_p = Paragraph(status_text, status_danger)
        elif 'Mild' in status_text:
            status_p = Paragraph(status_text, status_warning)
        else:
            status_p = Paragraph(status_text, status_normal)
            
        meas_table_data.append([
            Paragraph(m.get('joint', 'N/A'), body_style),
            Paragraph(m.get('side', 'Center'), body_style),
            Paragraph(f"{m.get('angle', 0.0)}°", body_style),
            Paragraph(f"{m.get('reference', 'N/A')}°", body_style),
            Paragraph(f"{m.get('deviation', 0.0)}°", body_style),
            status_p
        ])
        
    meas_table = Table(meas_table_data, colWidths=[2.0*inch, 0.8*inch, 1.1*inch, 1.1*inch, 1.0*inch, 1.2*inch])
    meas_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f3f4f6')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(meas_table)
    story.append(Spacer(1, 15))
    
    # 5. Clinical Remarks & Interpretation
    remarks_list = []
    remarks_list.append(Paragraph("Clinical Remarks & Interpretation", section_heading))
    remarks_list.append(Paragraph(data.get('interpretation', 'No interpretation provided.'), body_style))
    
    # Notes from patient
    if session.get('notes'):
        remarks_list.append(Spacer(1, 8))
        remarks_list.append(Paragraph("<b>Session Notes:</b>", bold_body_style))
        remarks_list.append(Paragraph(session.get('notes'), body_style))
        
    story.append(KeepTogether(remarks_list))
    story.append(Spacer(1, 15))
    
    # 6. Suggestions & Corrective Recommendations
    recs_list = []
    recs_list.append(Paragraph("Corrective Interventions & Recommendations", section_heading))
    
    recommendations = data.get('recommendations', [])
    if not recommendations:
        recommendations = ["No recommendations specified."]
        
    for r in recommendations:
        recs_list.append(Paragraph(f"• {r}", body_style))
        recs_list.append(Spacer(1, 4))
        
    story.append(KeepTogether(recs_list))
    story.append(Spacer(1, 20))
    
    # 7. Signature block
    sig_data = [
        [
            Paragraph("Generated by: PostureFlex Automated System", ParagraphStyle('PFSystem', fontName='Helvetica-Oblique', fontSize=8, textColor=colors.HexColor('#6b7280'))),
            Paragraph("Assessor Signature: _______________________", bold_body_style)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[4.0 * inch, 3.2 * inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
    ]))
    story.append(KeepTogether([sig_table]))
    
    # Build Document
    doc.build(story)
    
    # Clean up temp image file if we created one
    if image_file and os.path.exists(image_file):
        try:
            os.remove(image_file)
        except Exception as e:
            print("Failed to remove temp image file:", e)
            
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes