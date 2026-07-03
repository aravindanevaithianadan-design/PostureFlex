/* PostureFlex Geometry & Pose Analysis Module */
(function() {
    // MediaPipe landmark map
    const LM = {
        NOSE: 0,
        L_SHOULDER: 11, R_SHOULDER: 12,
        L_ELBOW: 13, R_ELBOW: 14,
        L_WRIST: 15, R_WRIST: 16,
        L_HIP: 23, R_HIP: 24,
        L_KNEE: 25, R_KNEE: 26,
        L_ANKLE: 27, R_ANKLE: 28,
        L_HEEL: 29, R_HEEL: 30,
        L_FOOT: 31, R_FOOT: 32
    };
    // Reference physiological values (squat assessment)
    const REFERENCE_STANDARDS = {
        knee: { name: "Knee Flexion", refRange: "80° - 110°", minNormal: 80, maxNormal: 110, warningThreshold: 15 },
        hip: { name: "Hip Flexion", refRange: "80° - 105°", minNormal: 80, maxNormal: 105, warningThreshold: 15 },
        trunk: { name: "Trunk Lean", refRange: "10° - 30°", minNormal: 10, maxNormal: 30, warningThreshold: 10 },
        ankle: { name: "Ankle Alignment", refRange: "70° - 85°", minNormal: 70, maxNormal: 85, warningThreshold: 8 }
    };
    // Calculate angle ABC in degrees where B is vertex
    function calculateAngle(A, B, C) {
        if (!A || !B || !C) return 0;
        
        // Use vector math
        const BA = { x: A.x - B.x, y: A.y - B.y };
        const BC = { x: C.x - B.x, y: C.y - B.y };
        
        const dotProduct = BA.x * BC.x + BA.y * BC.y;
        const magBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y);
        const magBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
        
        if (magBA === 0 || magBC === 0) return 0;
        
        let cosTheta = dotProduct / (magBA * magBC);
        // Bound checks to prevent NaN from rounding errors
        cosTheta = Math.max(-1.0, Math.min(1.0, cosTheta));
        
        const angleRad = Math.acos(cosTheta);
        const angleDeg = (angleRad * 180.0) / Math.PI;
        
        return parseFloat(angleDeg.toFixed(1));
    }
    // Calculate angle of line AB relative to vertical line passing through B
    function calculateAngleFromVertical(A, B) {
        if (!A || !B) return 0;
        // B is vertex. A vertical point directly above B would have A_vert.x = B.x, A_vert.y = B.y - 100
        const vert = { x: B.x, y: B.y - 1 };
        return calculateAngle(A, B, vert);
    }
    const PF_Pose = {
        // Calculate all necessary joint angles
        analyzeLandmarks: function(landmarks) {
            if (!landmarks || landmarks.length < 33) {
                return { confidence: 0, outOfFrame: true };
            }
            
            // Check visibility confidence of key posture landmarks
            const jointsToCheck = [
                LM.L_SHOULDER, LM.R_SHOULDER,
                LM.L_HIP, LM.R_HIP,
                LM.L_KNEE, LM.R_KNEE,
                LM.L_ANKLE, LM.R_ANKLE
            ];
            
            let confidenceSum = 0;
            let lowConfidenceCount = 0;
            
            jointsToCheck.forEach(idx => {
                const vis = landmarks[idx]?.visibility || 0;
                confidenceSum += vis;
                if (vis < 0.5) {
                    lowConfidenceCount++;
                }
            });
            
            const averageConfidence = confidenceSum / jointsToCheck.length;
            
            // If more than 3 key joints are missing / low confidence, patient is out of frame or obscured
            if (lowConfidenceCount >= 3 || averageConfidence < 0.45) {
                return { confidence: averageConfidence, outOfFrame: true };
            }
            
            // Get coordinates
            const lShoulder = landmarks[LM.L_SHOULDER];
            const rShoulder = landmarks[LM.R_SHOULDER];
            const lHip = landmarks[LM.L_HIP];
            const rHip = landmarks[LM.R_HIP];
            const lKnee = landmarks[LM.L_KNEE];
            const rKnee = landmarks[LM.R_KNEE];
            const lAnkle = landmarks[LM.L_ANKLE];
            const rAnkle = landmarks[LM.R_ANKLE];
            const lFoot = landmarks[LM.L_FOOT];
            const rFoot = landmarks[LM.R_FOOT];
            // 1. Calculate Knee Flexion Angles
            const lKneeAngle = calculateAngle(lHip, lKnee, lAnkle);
            const rKneeAngle = calculateAngle(rHip, rKnee, rAnkle);
            
            // 2. Calculate Hip Flexion Angles
            const lHipAngle = calculateAngle(lShoulder, lHip, lKnee);
            const rHipAngle = calculateAngle(rShoulder, rHip, rKnee);
            
            // 3. Calculate Trunk Tilt (Back lean from vertical)
            const lTrunkAngle = calculateAngleFromVertical(lShoulder, lHip);
            const rTrunkAngle = calculateAngleFromVertical(rShoulder, rHip);
            const avgTrunkAngle = parseFloat(((lTrunkAngle + rTrunkAngle) / 2).toFixed(1));
            
            // 4. Calculate Ankle Dorsiflexion (Knee-Ankle-Foot)
            // Note: If foot index is unavailable, we estimate relative to floor vertical
            const lAnkleAngle = calculateAngle(lKnee, lAnkle, lFoot);
            const rAnkleAngle = calculateAngle(rKnee, rAnkle, rFoot);
            // Left/Right Symmetry Check
            const kneeSymmetryDev = Math.abs(lKneeAngle - rKneeAngle);
            const hipSymmetryDev = Math.abs(lHipAngle - rHipAngle);
            const symmetryScore = Math.max(0, 100 - (kneeSymmetryDev * 2.5 + hipSymmetryDev * 2));
            
            // Squat depth evaluation (hip relative to knee)
            // Normal standing: hip is much higher than knee (y_hip < y_knee in image coordinates where 0,0 is top-left)
            // Full squat: hip height is near knee height (y_hip ~= y_knee)
            const avgHipY = (lHip.y + rHip.y) / 2;
            const avgKneeY = (lKnee.y + rKnee.y) / 2;
            const avgAnkleY = (lAnkle.y + rAnkle.y) / 2;
            
            const maxTravel = avgAnkleY - avgKneeY;
            const currentPosition = avgKneeY - avgHipY;
            
            // Depth estimate: 0% is standing (hip high), 100% is parallel (hip level with knee)
            let depthPct = 0;
            if (maxTravel > 0) {
                depthPct = (1 - (currentPosition / maxTravel)) * 100;
                depthPct = Math.max(0, Math.min(120, parseFloat(depthPct.toFixed(1))));
            }
            
            let squatState = "Standing";
            if (depthPct > 80) {
                squatState = "Deep Squat";
            } else if (depthPct > 40) {
                squatState = "Squatting";
            } else if (depthPct > 15) {
                squatState = "Partial squat";
            }
            return {
                confidence: averageConfidence,
                outOfFrame: false,
                angles: {
                    leftKnee: lKneeAngle,
                    rightKnee: rKneeAngle,
                    leftHip: lHipAngle,
                    rightHip: rHipAngle,
                    leftTrunk: lTrunkAngle,
                    rightTrunk: rTrunkAngle,
                    avgTrunk: avgTrunkAngle,
                    leftAnkle: lAnkleAngle,
                    rightAnkle: rAnkleAngle,
                },
                symmetry: {
                    kneeDev: parseFloat(kneeSymmetryDev.toFixed(1)),
                    hipDev: parseFloat(hipSymmetryDev.toFixed(1)),
                    score: Math.round(symmetryScore)
                },
                depthPct: depthPct,
                squatState: squatState
            };
        },
        
        // Evaluate deviations during active squat (compares input against target benchmarks)
        evaluatePosture: function(analysis) {
            if (!analysis || analysis.outOfFrame) {
                return { overallStatus: "Indeterminate", deviations: [] };
            }
            
            const angles = analysis.angles;
            const sym = analysis.symmetry;
            const state = analysis.squatState;
            
            let devCount = 0;
            let sigDevCount = 0;
            const detailedDevs = [];
            
            // Only perform full deviation assessment when user is in a squatting state (depth > 40%)
            // Otherwise, we assess their standing posture
            const isSquatting = analysis.depthPct > 40;
            
            const checkDeviation = (name, side, val, standards) => {
                let status = "Normal";
                let diff = 0;
                
                if (val < standards.minNormal) {
                    diff = standards.minNormal - val;
                    status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
                } else if (val > standards.maxNormal) {
                    diff = val - standards.maxNormal;
                    status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
                }
                
                if (status !== "Normal") {
                    devCount++;
                    if (status === "Significant Deviation") sigDevCount++;
                }
                
                return {
                    joint: name,
                    side: side,
                    angle: val,
                    reference: standards.refRange,
                    deviation: parseFloat(diff.toFixed(1)),
                    status: status
                };
            };
            
            if (isSquatting) {
                // Assessment standards during SQUAT
                detailedDevs.push(checkDeviation("Knee Flexion", "Left", angles.leftKnee, REFERENCE_STANDARDS.knee));
                detailedDevs.push(checkDeviation("Knee Flexion", "Right", angles.rightKnee, REFERENCE_STANDARDS.knee));
                detailedDevs.push(checkDeviation("Hip Flexion", "Left", angles.leftHip, REFERENCE_STANDARDS.hip));
                detailedDevs.push(checkDeviation("Hip Flexion", "Right", angles.rightHip, REFERENCE_STANDARDS.hip));
                detailedDevs.push(checkDeviation("Trunk Lean", "Center", angles.avgTrunk, REFERENCE_STANDARDS.trunk));
                
                // Ankle flexion is optional but good
                if (angles.leftAnkle > 0) {
                    detailedDevs.push(checkDeviation("Ankle Alignment", "Left", angles.leftAnkle, REFERENCE_STANDARDS.ankle));
                    detailedDevs.push(checkDeviation("Ankle Alignment", "Right", angles.rightAnkle, REFERENCE_STANDARDS.ankle));
                }
            } else {
                // Assessment standards during STANDING posture (different reference angles)
                const standKneeStd = { name: "Knee Standing", refRange: "170° - 180°", minNormal: 170, maxNormal: 180, warningThreshold: 8 };
                const standTrunkStd = { name: "Trunk Standing", refRange: "0° - 8°", minNormal: 0, maxNormal: 8, warningThreshold: 8 };
                
                detailedDevs.push(checkDeviation("Knee Flexion", "Left", angles.leftKnee, standKneeStd));
                detailedDevs.push(checkDeviation("Knee Flexion", "Right", angles.rightKnee, standKneeStd));
                detailedDevs.push(checkDeviation("Trunk Lean", "Center", angles.avgTrunk, standTrunkStd));
            }
            
            // Check Symmetry
            if (sym.kneeDev > 12 || sym.hipDev > 12) {
                devCount++;
                let level = (sym.kneeDev > 20 || sym.hipDev > 20) ? "Significant Deviation" : "Mild Deviation";
                if (level === "Significant Deviation") sigDevCount++;
                detailedDevs.push({
                    joint: "Bilateral Symmetry",
                    side: "Compare",
                    angle: sym.kneeDev,
                    reference: "< 8° diff",
                    deviation: sym.kneeDev,
                    status: level
                });
            }
            
            // Compute Overall Risk Category
            let overallStatus = "Normal";
            if (sigDevCount > 0) {
                overallStatus = "Significant Deviation";
            } else if (devCount > 0) {
                overallStatus = "Mild Deviation";
            }
            
            return {
                overallStatus: overallStatus,
                measurements: detailedDevs,
                symmetryScore: sym.score,
                isSquatting: isSquatting
            };
        },
        
        // Professional clinical interpretation text builder
        generateInterpretation: function(postureAssessment, squatState) {
            const { overallStatus, measurements } = postureAssessment;
            
            if (overallStatus === "Indeterminate") {
                return "Insufficient pose tracking confidence to synthesize assessment details. Ensure camera view captures full body profile (shoulders to ankles) and lighting is balanced.";
            }
            
            let remarks = [];
            
            // Filter deviations
            const deviations = measurements.filter(m => m.status !== "Normal");
            
            if (deviations.length === 0) {
                remarks.push(`The patient demonstrates a highly controlled squat pattern (${squatState}). Joint angles for knee flexion, hip flexion, and trunk lean reside within normal biomechanical parameters, indicating proper quadriceps and gluteal engagement with adequate posterior chain flexibility.`);
            } else {
                remarks.push(`Biomechanics reveal a ${overallStatus.toLowerCase()} in squat alignment during the active ${squatState.toLowerCase()} phase.`);
                
                // Add specific observations
                const kneeDev = deviations.find(d => d.joint === "Knee Flexion");
                const trunkDev = deviations.find(d => d.joint === "Trunk Lean");
                const symDev = deviations.find(d => d.joint === "Bilateral Symmetry");
                
                if (kneeDev) {
                    if (kneeDev.angle > 110) {
                        remarks.push("Knee flexion is reduced (squat depth is too shallow), which may indicate quadriceps tightness, ankle mobility restriction (limited dorsiflexion), or fear of movement.");
                    } else if (kneeDev.angle < 75) {
                        remarks.push("Knee flexion is excessive (squatting past normal range of control), leading to increased compression stresses on patellofemoral joints.");
                    }
                }
                
                if (trunkDev) {
                    remarks.push(`Trunk alignment is outside the reference range, displaying an average forward lean of ${trunkDev.angle}°. This suggests posterior chain compensation, gluteus maximus weakness, or a lack of core stabilization during squat ascent/descent.`);
                }
                
                if (symDev) {
                    remarks.push(`Significant bilateral asymmetry (${symDev.angle}° differential) is observed between left and right lower limbs. This indicates unilateral load-bearing preference, muscle strength imbalance, or joint structural compensation.`);
                }
            }
            
            // Dynamic risk advice
            if (overallStatus === "Significant Deviation") {
                remarks.push("Clinical interpretation: Overall posture indicates moderate to severe alignment corrections are required. Guided physiotherapy sessions focusing on mobility, core stability, and lifting mechanics are highly recommended to prevent load-induced injury.");
            } else if (overallStatus === "Mild Deviation") {
                remarks.push("Clinical interpretation: Mild mechanical deviations detected. Target adjustments in squat stance, pelvic stabilization, and ankle flexibility are recommended.");
            } else {
                remarks.push("Clinical interpretation: Physiological alignment is within acceptable range. Maintain current conditioning.");
            }
            
            return remarks.join(" ");
        },
        
        // Generate clinical exercise recommendations
        generateRecommendations: function(postureAssessment) {
            const { measurements } = postureAssessment;
            const recs = [];
            
            const deviations = measurements.filter(m => m.status !== "Normal");
            
            if (deviations.length === 0) {
                recs.push("Continue standard functional strength training to maintain muscle balance.");
                recs.push("Introduce progressive load squats (goblet, barbell) with careful alignment monitoring.");
                return recs;
            }
            
            // Map deviations to exercises
            const joints = deviations.map(d => d.joint);
            
            if (joints.includes("Knee Flexion")) {
                recs.push("Wall slides or eccentric leg presses to build controlled knee flexion range.");
                recs.push("Ankle mobility drills (weight-bearing lunge stretches) to improve ankle dorsiflexion.");
            }
            if (joints.includes("Trunk Lean")) {
                recs.push("Goblet squats (holding weight at chest) to automatically correct excessive forward lean and encourage upright posture.");
                recs.push("Core stabilization exercises (planks, deadbugs) and hip extension strengthening (bridges, hip thrusts).");
            }
            if (joints.includes("Bilateral Symmetry")) {
                recs.push("Unilateral leg work: Single-leg glute bridges, Bulgarian split squats, and step-downs to isolate and balance muscle discrepancies.");
                recs.push("Weight-distribution feedback training using scale boards or visual mirror targets.");
            }
            
            // General safety tip
            recs.push("Focus on tempo control (3-second eccentric phase, 1-second pause at bottom) during training.");
            
            return recs.slice(0, 4); // return max 4
        }
    };
    
    window.PF_Pose = PF_Pose;
})();
