/* PostureFlex Client-Side PDF Report Generator */
(function () {

    // Generates and downloads PDF directly in the browser
    async function downloadClientPDF(data) {
        const jspdfLib = window.jspdf;
        if (!jspdfLib || !jspdfLib.jsPDF) {
            console.error("jsPDF library failed to load (check internet connection / CDN access).");
            alert("Could not generate PDF: the jsPDF library failed to load. Please check your internet connection and try again.");
            return;
        }
        const { jsPDF } = jspdfLib;

        // Create document (A4 size, units: pt)
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'pt',
            format: 'a4'
        });

        if (typeof doc.autoTable !== "function") {
            console.error("jsPDF-AutoTable plugin failed to load (check internet connection / CDN access).");
            alert("Could not generate PDF: the table plugin failed to load. Please check your internet connection and try again.");
            return;
        }

        try {
            await buildReportPdf(doc, data);
            triggerDownload(doc, data);
        } catch (err) {
            console.error("PDF generation failed:", err);
            alert("Something went wrong while generating the PDF:\n" + (err && err.message ? err.message : err) + "\n\nCheck the browser console for full details.");
        }
    }

    // Reliably triggers a file download across browsers/hosting environments
    // (works both locally via file://, when deployed e.g. on GitHub Pages, and
    // inside sandboxed preview iframes that may block programmatic downloads).
    function triggerDownload(doc, data) {
        const patient = data.patient || {};
        const filename = `postureflex_report_${patient.patient_id || 'patient'}_${new Date().toISOString().split('T')[0]}.pdf`;

        // Attempt 1: Blob + temporary <a download> link (best UX, real filename)
        try {
            const blob = doc.output('blob');
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            return;
        } catch (err) {
            console.warn("Blob-link download failed, trying doc.save():", err);
        }

        // Attempt 2: jsPDF's built-in save (same mechanism internally, but
        // occasionally succeeds where a manually constructed link does not)
        try {
            doc.save(filename);
            return;
        } catch (err) {
            console.warn("doc.save() failed, trying to open PDF in a new tab:", err);
        }

        // Attempt 3: some sandboxed preview iframes (e.g. webcontainer-based
        // dev previews) block programmatic downloads entirely but still allow
        // opening a new tab/window. This lets the user save it manually from there.
        try {
            const blobUrl = doc.output('bloburl');
            const opened = window.open(blobUrl, '_blank');
            if (!opened) {
                throw new Error("Popup blocked");
            }
        } catch (err) {
            console.error("All download methods failed:", err);
            throw new Error("The browser/preview blocked the file download. Try opening this app in a full browser tab (not an embedded preview) and try again.");
        }
    }

    // Builds the actual PDF content (separated so the outer function can catch any failures)
    async function buildReportPdf(doc, data) {
        const patient = data.patient || {};
        const session = data.session || {};
        const measurements = data.measurements || [];
        const imageBase64 = data.image_base64;
        const images = data.images || null; // [{label, base64}, ...] for multi-view reports (BPT2)
        const interpretation = data.interpretation || "";
        const recommendations = data.recommendations || [];

        // ---- A4 layout constants (all positions derive from these so the report
        // stays correctly aligned/centered on an A4 page: 595.28 x 841.89 pt) ----
        const PAGE_W = doc.internal.pageSize.getWidth();
        const PAGE_H = doc.internal.pageSize.getHeight();
        const MARGIN = 40;
        const CONTENT_W = PAGE_W - MARGIN * 2;
        const RIGHT_EDGE = PAGE_W - MARGIN;
        const COL2_X = MARGIN + CONTENT_W * 0.53;   // second column label start
        const COL2_VAL_X = COL2_X + 100;             // second column value start
        const BOTTOM_LIMIT = PAGE_H - 100;           // safe area before footer/margin

        let currentY = 40;

        // 1. Header Banner
        doc.setFillColor(109, 40, 217); // Purple Primary #6d28d9
        doc.rect(MARGIN, currentY, CONTENT_W, 5, 'F');
        currentY += 15;

        // Logo and Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(109, 40, 217);
        doc.text("PostureFlex", MARGIN, currentY + 15);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text("CLINICAL POSTURE ASSESSMENT REPORT", RIGHT_EDGE, currentY + 10, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("Educational Physiotherapy Assessment Tool", RIGHT_EDGE, currentY + 20, { align: "right" });
        currentY += 35;

        // Divider line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(1);
        doc.line(MARGIN, currentY, RIGHT_EDGE, currentY);
        currentY += 15;

        // 2. Patient Demographics & Session Meta
        doc.setFillColor(249, 250, 251); // Light background gray
        doc.rect(MARGIN, currentY, CONTENT_W, 85, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.rect(MARGIN, currentY, CONTENT_W, 85, 'S');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);

        // Column 1
        doc.text("Patient Name:", MARGIN + 15, currentY + 20);
        doc.text("Patient ID:", MARGIN + 15, currentY + 38);
        doc.text("Age / Gender:", MARGIN + 15, currentY + 56);
        doc.text("Assessor:", MARGIN + 15, currentY + 74);

        // Column 2
        doc.text("Assessment Date:", COL2_X, currentY + 20);
        doc.text("Session Type:", COL2_X, currentY + 38);
        doc.text("Module Used:", COL2_X, currentY + 56);
        doc.text("Overall Risk:", COL2_X, currentY + 74);

        // Values
        doc.setFont("helvetica", "normal");
        doc.setTextColor(31, 41, 55);

        doc.text(patient.name || "N/A", MARGIN + 105, currentY + 20);
        doc.text(patient.patient_id || "N/A", MARGIN + 105, currentY + 38);
        doc.text(`${patient.age || "N/A"} yrs / ${patient.gender || "N/A"}`, MARGIN + 105, currentY + 56);
        doc.text(patient.assessor || "N/A", MARGIN + 105, currentY + 74);

        doc.text(session.date || new Date().toLocaleDateString(), COL2_VAL_X, currentY + 20);
        doc.text(patient.session_type || "Initial", COL2_VAL_X, currentY + 38);
        doc.text(session.module || "BPT1", COL2_VAL_X, currentY + 56);

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
        doc.text(risk, COL2_VAL_X, currentY + 74);

        currentY += 105;

        // 3. Visual Capture Image(s) (If available)
        if (images && images.length > 0) {
            try {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(79, 70, 229);
                doc.text("Visual Analysis Captures (4-View Posture Screening)", MARGIN, currentY);
                currentY += 10;

                const gap = 12;
                const cellW = (CONTENT_W - gap) / 2;
                const cellH = 150;
                images.slice(0, 4).forEach((img, idx) => {
                    const col = idx % 2;
                    const row = Math.floor(idx / 2);
                    const x = MARGIN + col * (cellW + gap);
                    const y = currentY + row * (cellH + 24);
                    if (img.base64) {
                        doc.addImage(img.base64, 'PNG', x, y, cellW, cellH);
                    }
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(8.5);
                    doc.setTextColor(75, 85, 99);
                    doc.text(img.label || `View ${idx + 1}`, x + cellW / 2, y + cellH + 12, { align: "center" });
                });
                const rows = Math.ceil(Math.min(images.length, 4) / 2);
                currentY += rows * (cellH + 24) + 6;
            } catch (e) {
                console.error("Error adding images to jsPDF:", e);
            }
        } else if (imageBase64) {
            try {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(79, 70, 229);
                doc.text("Visual Analysis Capture", MARGIN, currentY);
                currentY += 8;

                const imgW = 300;
                const imgH = 225;
                const imgX = (PAGE_W - imgW) / 2; // horizontally centered on the page
                doc.addImage(imageBase64, 'PNG', imgX, currentY, imgW, imgH);
                currentY += imgH + 10;
            } catch (e) {
                console.error("Error adding image to jsPDF:", e);
            }
        }

        // 4. Biomechanical Measurements -- rendered as 4 separate per-view
        // tables (Anterior / Posterior / Lateral Left / Lateral Right) when
        // viewSections is supplied (Module 1 / BPT1). Falls back to a single
        // combined table when it isn't (Module 2 / BPT2, unchanged).
        const viewSections = (data.viewSections || []).filter(s => s.rows && s.rows.length > 0);

        const drawMeasurementsTable = (rows, heading) => {
            if (currentY > PAGE_H - 150) {
                doc.addPage();
                currentY = 40;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(79, 70, 229);
            doc.text(heading, MARGIN, currentY);

            const tableBody = rows.map(m => [
                m.joint,
                m.side,
                `${m.fixed || m.reference}`,
                `${m.angle}°`,
                `${m.deviation}°`,
                m.status
            ]);

            doc.autoTable({
                startY: currentY + 8,
                head: [['Joint Parameter', 'Side', 'Fixed / Normal Angle', 'Measured Angle', 'Deviation', 'Status']],
                body: tableBody,
                theme: 'striped',
                styles: { cellPadding: 5, fontSize: 8.5, textColor: [31, 41, 55] },
                headStyles: { fillColor: [109, 40, 217], fontSize: 9, fontStyle: 'bold', textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [249, 250, 251] },
                margin: { left: MARGIN, right: MARGIN },
                tableWidth: CONTENT_W,
                didParseCell: function (cellData) {
                    if (cellData.section === 'body' && cellData.column.index === 5) {
                        const status = cellData.cell.raw || "";
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
        };

        if (viewSections.length > 0) {
            viewSections.forEach(section => drawMeasurementsTable(section.rows, section.label));
        } else {
            drawMeasurementsTable(measurements, "Biomechanical Measurements");
        }

        // If Y is too close to bottom, add a new page
        if (currentY > BOTTOM_LIMIT) {
            doc.addPage();
            currentY = 40;
        }

        // 5. Clinical Remarks
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text("Clinical Remarks & Interpretation", MARGIN, currentY);
        currentY += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);

        // Wrap text to fit page width
        const splitInterpretation = doc.splitTextToSize(interpretation, CONTENT_W);
        doc.text(splitInterpretation, MARGIN, currentY);
        currentY += (splitInterpretation.length * 13) + 15;

        // Session notes if present
        if (session.notes) {
            if (currentY > BOTTOM_LIMIT + 20) { doc.addPage(); currentY = 40; }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(31, 41, 55);
            doc.text("Session Intake Notes:", MARGIN, currentY);
            currentY += 12;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            const splitNotes = doc.splitTextToSize(session.notes, CONTENT_W);
            doc.text(splitNotes, MARGIN, currentY);
            currentY += (splitNotes.length * 13) + 15;
        }

        // 6. Corrective Interventions
        if (currentY > BOTTOM_LIMIT) {
            doc.addPage();
            currentY = 40;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text("Corrective Interventions & Recommendations", MARGIN, currentY);
        currentY += 12;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);

        recommendations.forEach(r => {
            if (currentY > PAGE_H - 60) { doc.addPage(); currentY = 40; }
            const splitRec = doc.splitTextToSize(`•  ${r}`, CONTENT_W - 20);
            doc.text(splitRec, MARGIN + 10, currentY);
            currentY += (splitRec.length * 13) + 4;
        });

        currentY += 25;

        // 7. Footer
        if (currentY > PAGE_H - 90) {
            doc.addPage();
            currentY = 40;
        }
        const footerY = PAGE_H - 107;
        const footerTextY = PAGE_H - 94;

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(1);
        doc.line(MARGIN, footerY, RIGHT_EDGE, footerY);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("Generated by: PostureFlex Automated System", MARGIN, footerTextY);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(31, 41, 55);
        doc.text("Assessor Signature: _______________________", RIGHT_EDGE, footerTextY, { align: "right" });
    }

    window.PF_Reports = {
        downloadClientPDF
    };
})();
