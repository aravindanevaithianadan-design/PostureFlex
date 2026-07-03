/* PostureFlex Client-Side PDF Report Generator */
(function() {
    
    // Generates and downloads PDF directly in the browser
    async function downloadClientPDF(data) {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            console.error("jsPDF library not loaded.");
            alert("Error: PDF library not available.");
            return;
        }
        
        // Create document (Letter size, units: pt)
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'pt',
            format: 'letter'
        });
        
        const patient = data.patient || {};
        const session = data.session || {};
        const measurements = data.measurements || [];
        const imageBase64 = data.image_base64;
        const interpretation = data.interpretation || "";
        const recommendations = data.recommendations || [];
        
        let currentY = 40;
        
        // 1. Header Banner
        doc.setFillColor(109, 40, 217); // Purple Primary #6d28d9
        doc.rect(40, currentY, 532, 5, 'F');
        currentY += 15;
        
        // Logo and Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(109, 40, 217);
        doc.text("PostureFlex", 40, currentY + 15);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text("CLINICAL POSTURE ASSESSMENT REPORT", 572, currentY + 10, { align: "right" });
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("Educational Physiotherapy Assessment Tool", 572, currentY + 20, { align: "right" });
        currentY += 35;
        
        // Divider line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(1);
        doc.line(40, currentY, 572, currentY);
        currentY += 15;
        
        // 2. Patient Demographics & Session Meta
        doc.setFillColor(249, 250, 251); // Light background gray
        doc.rect(40, currentY, 532, 85, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.rect(40, currentY, 532, 85, 'S');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        
        // Column 1
        doc.text("Patient Name:", 55, currentY + 20);
        doc.text("Patient ID:", 55, currentY + 38);
        doc.text("Age / Gender:", 55, currentY + 56);
        doc.text("Assessor:", 55, currentY + 74);
        
        // Column 2
        doc.text("Assessment Date:", 310, currentY + 20);
        doc.text("Session Type:", 310, currentY + 38);
        doc.text("Module Used:", 310, currentY + 56);
        doc.text("Overall Risk:", 310, currentY + 74);
        
        // Values
        doc.setFont("helvetica", "normal");
        doc.setTextColor(31, 41, 55);
        
        doc.text(patient.name || "N/A", 145, currentY + 20);
        doc.text(patient.patient_id || "N/A", 145, currentY + 38);
        doc.text(`${patient.age || "N/A"} yrs / ${patient.gender || "N/A"}`, 145, currentY + 56);
        doc.text(patient.assessor || "N/A", 145, currentY + 74);
        
        doc.text(session.date || new Date().toLocaleDateString(), 420, currentY + 20);
        doc.text(patient.session_type || "Initial", 420, currentY + 38);
        doc.text(session.module || "BPT1", 420, currentY + 56);
        
        // Risk Status with color coding
        const risk = session.risk_level || "Normal";
        doc.setFont("helvetica", "bold");
        if (risk.includes("Significant")) {
            doc.setTextColor(220, 38, 38); // Red
        } else if (risk.includes("Mild")) {
            doc.setTextColor(217, 119, 6); // Amber
        } else {
            doc.setTextColor(5, 150, 105); // Emerald
        }
        doc.text(risk, 420, currentY + 74);
        
        currentY += 105;
        
        // 3. Visual Capture Image (If available)
        let imageAdded = false;
        if (imageBase64) {
            try {
                // Resize base64 to fit neatly on page
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(79, 70, 229);
                doc.text("Visual Analysis Capture", 40, currentY);
                currentY += 8;
                
                doc.addImage(imageBase64, 'PNG', 156, currentY, 300, 225);
                currentY += 235;
                imageAdded = true;
            } catch (e) {
                console.error("Error adding image to jsPDF:", e);
            }
        }
        
        // 4. Biomechanical Measurements Table
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text("Biomechanical Measurements", 40, currentY);
        
        const tableBody = measurements.map(m => [
            m.joint,
            m.side,
            `${m.angle}°`,
            `${m.reference}`,
            `${m.deviation}°`,
            m.status
        ]);
        
        doc.autoTable({
            startY: currentY + 8,
            head: [['Joint Parameter', 'Side', 'Measured Angle', 'Reference Range', 'Deviation', 'Status']],
            body: tableBody,
            headStyles: { fillColor: [109, 40, 217], fontSize: 9, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8.5, textColor: [31, 41, 55] },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 40, right: 40 },
            padding: 5,
            didParseCell: function(cellData) {
                if (cellData.section === 'body' && cellData.column.index === 5) {
                    const status = cellData.cell.raw;
                    if (status.includes('Significant')) {
                        cellData.cell.styles.textColor = [220, 38, 38];
                        cellData.cell.styles.fontStyle = 'bold';
                    } else if (status.includes('Mild')) {
                        cellData.cell.styles.textColor = [217, 119, 6];
                        cellData.cell.styles.fontStyle = 'bold';
                    } else {
                        cellData.cell.styles.textColor = [5, 150, 105];
                        cellData.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });
        
        currentY = doc.lastAutoTable.finalY + 20;
        
        // If Y is too close to bottom, add a new page
        if (currentY > 680) {
            doc.addPage();
            currentY = 40;
        }
        
        // 5. Clinical Remarks
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text("Clinical Remarks & Interpretation", 40, currentY);
        currentY += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);
        
        // Wrap text to fit page width
        const splitInterpretation = doc.splitTextToSize(interpretation, 532);
        doc.text(splitInterpretation, 40, currentY);
        currentY += (splitInterpretation.length * 13) + 15;
        
        // Session notes if present
        if (session.notes) {
            if (currentY > 720) { doc.addPage(); currentY = 40; }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(31, 41, 55);
            doc.text("Session Intake Notes:", 40, currentY);
            currentY += 12;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            const splitNotes = doc.splitTextToSize(session.notes, 532);
            doc.text(splitNotes, 40, currentY);
            currentY += (splitNotes.length * 13) + 15;
        }
        
        // 6. Corrective Interventions
        if (currentY > 700) {
            doc.addPage();
            currentY = 40;
        }
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text("Corrective Interventions & Recommendations", 40, currentY);
        currentY += 12;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);
        
        recommendations.forEach(r => {
            const splitRec = doc.splitTextToSize(`•  ${r}`, 510);
            doc.text(splitRec, 50, currentY);
            currentY += (splitRec.length * 13) + 4;
        });
        
        currentY += 25;
        
        // 7. Footer
        if (currentY > 740) {
            doc.addPage();
            currentY = 40;
        }
        
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(1);
        doc.line(40, 735, 572, 735);
        
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("Generated by: PostureFlex Automated System", 40, 748);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(31, 41, 55);
        doc.text("Assessor Signature: _______________________", 360, 748);
        
        // Save file
        const filename = `postureflex_report_${patient.patient_id || 'patient'}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
    }
    
    // Exports via Python backend PDF endpoint (triggers attachment download)
    async function downloadBackendPDF(data) {
        try {
            const response = await fetch('/api/reports/pdf', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `postureflex_report_${data.patient.id || 'patient'}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                return true;
            } else {
                const err = await response.json();
                console.error("Backend PDF failed:", err);
                return false;
            }
        } catch (e) {
            console.error("Backend PDF call failed:", e);
            return false;
        }
    }
    
    window.PF_Reports = {
        downloadClientPDF,
        downloadBackendPDF
    };
})();
