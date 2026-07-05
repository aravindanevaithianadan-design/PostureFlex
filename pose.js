/* PostureFlex Geometry & Pose Analysis Module */
(function () {
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
    // ---------------------------------------------------------------------
    // Standing Posture Assessment (BPT2): Anterior / Posterior / Right & Left
    // Lateral views. MediaPipe Pose exposes 33 general body landmarks, not the
    // exact discrete clinical bony landmarks (acromion, ASIS/PSIS, C7 spinous
    // process, greater trochanter, femoral condyle/epicondyle). Each clinical
    // landmark below is therefore mapped to its nearest tracked MediaPipe
    // point as a software estimate -- clearly labelled as such in the report.
    // ---------------------------------------------------------------------
    const STATIC_STANDARDS = {
        shoulderTilt: { name: "Shoulder Level (Acromion L/R)", refRange: "0° - 2°", minNormal: 0, maxNormal: 2, warningThreshold: 5 },
        pelvicTiltFrontal: { name: "Pelvic Level (ASIS L/R)", refRange: "0° - 2°", minNormal: 0, maxNormal: 2, warningThreshold: 5 },
        pelvicTiltPosterior: { name: "Pelvic Level (PSIS L/R)", refRange: "0° - 2°", minNormal: 0, maxNormal: 2, warningThreshold: 5 },
        kneeAlignmentFrontal: { name: "Knee Alignment (Patellae)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, warningThreshold: 6 },
        kneeAlignmentPosterior: { name: "Knee Alignment (Midpoint)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, warningThreshold: 6 },
        spinalAlignment: { name: "Spinal Alignment (C7 to PSIS Midpoint)", refRange: "0° - 2°", minNormal: 0, maxNormal: 2, warningThreshold: 5 },
        trunkSagittal: { name: "Trunk-Pelvis Sagittal Alignment (Acromion-Trochanter)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 10 },
        thighSagittal: { name: "Pelvis-Knee Sagittal Alignment (Trochanter-Condyle)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 10 },
        sagittalCurvature: { name: "Overall Sagittal Curvature", refRange: "0° - 6°", minNormal: 0, maxNormal: 6, warningThreshold: 12 }
    };

    function midpoint(A, B) {
        if (!A || !B) return null;
        return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    }
    function offsetDown(P, dy) {
        if (!P) return null;
        return { x: P.x, y: P.y + dy };
    }
    // Angle of line L-R relative to horizontal (0 = perfectly level)
    function calculateTiltFromHorizontal(L, R) {
        if (!L || !R) return 0;
        const dx = R.x - L.x;
        const dy = R.y - L.y;
        const angleRad = Math.atan2(Math.abs(dy), Math.abs(dx) || 0.0001);
        return parseFloat((angleRad * 180 / Math.PI).toFixed(1));
    }
    function checkFrameConfidence(landmarks, indices) {
        if (!landmarks || landmarks.length < 33) return { confidence: 0, outOfFrame: true };
        let sum = 0, low = 0;
        indices.forEach(i => {
            const vis = landmarks[i]?.visibility || 0;
            sum += vis;
            if (vis < 0.5) low++;
        });
        const avg = sum / indices.length;
        return { confidence: avg, outOfFrame: (low >= Math.ceil(indices.length / 2) || avg < 0.4) };
    }

    // Anterior (front-facing) view
    function analyzeAnteriorView(landmarks) {
        const check = checkFrameConfidence(landmarks, [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]);
        if (check.outOfFrame) return { view: "Anterior", outOfFrame: true, confidence: check.confidence };

        const lShoulder = landmarks[LM.L_SHOULDER], rShoulder = landmarks[LM.R_SHOULDER];
        const lHip = landmarks[LM.L_HIP], rHip = landmarks[LM.R_HIP];
        const lKnee = landmarks[LM.L_KNEE], rKnee = landmarks[LM.R_KNEE];

        return {
            view: "Anterior",
            outOfFrame: false,
            confidence: check.confidence,
            points: {
                acromionL: lShoulder, acromionR: rShoulder,
                sternum: offsetDown(midpoint(lShoulder, rShoulder), 0.08),
                umbilicus: midpoint(lHip, rHip),
                asisL: lHip, asisR: rHip,
                patellaeCenter: midpoint(lKnee, rKnee),
                kneeL: lKnee, kneeR: rKnee
            },
            metrics: {
                shoulderTilt: calculateTiltFromHorizontal(lShoulder, rShoulder),
                pelvicTiltFrontal: calculateTiltFromHorizontal(lHip, rHip),
                kneeAlignmentFrontal: calculateTiltFromHorizontal(lKnee, rKnee)
            }
        };
    }

    // Posterior (back-facing) view
    function analyzePosteriorView(landmarks) {
        const check = checkFrameConfidence(landmarks, [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]);
        if (check.outOfFrame) return { view: "Posterior", outOfFrame: true, confidence: check.confidence };

        const lShoulder = landmarks[LM.L_SHOULDER], rShoulder = landmarks[LM.R_SHOULDER];
        const lHip = landmarks[LM.L_HIP], rHip = landmarks[LM.R_HIP];
        const lKnee = landmarks[LM.L_KNEE], rKnee = landmarks[LM.R_KNEE];
        const shoulderMid = midpoint(lShoulder, rShoulder);
        const hipMid = midpoint(lHip, rHip);
        // C7 spinous process approximated slightly above the shoulder midpoint
        const c7Approx = shoulderMid ? { x: shoulderMid.x, y: shoulderMid.y - 0.03 } : null;

        return {
            view: "Posterior",
            outOfFrame: false,
            confidence: check.confidence,
            points: {
                c7: c7Approx,
                scapulaInferiorL: offsetDown(lShoulder, 0.12), scapulaInferiorR: offsetDown(rShoulder, 0.12), // approximated
                acromionL: lShoulder, acromionR: rShoulder,
                psisL: lHip, psisR: rHip,
                kneeL: lKnee, kneeR: rKnee,
                kneeMidpoint: midpoint(lKnee, rKnee)
            },
            metrics: {
                shoulderTilt: calculateTiltFromHorizontal(lShoulder, rShoulder),
                pelvicTiltPosterior: calculateTiltFromHorizontal(lHip, rHip),
                kneeAlignmentPosterior: calculateTiltFromHorizontal(lKnee, rKnee),
                spinalAlignment: c7Approx ? calculateAngleFromVertical(c7Approx, hipMid) : 0
            }
        };
    }

    // Right Lateral (sagittal) view
    function analyzeRightLateralView(landmarks) {
        const check = checkFrameConfidence(landmarks, [LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE]);
        if (check.outOfFrame) return { view: "Right Lateral", outOfFrame: true, confidence: check.confidence };

        const acromion = landmarks[LM.R_SHOULDER];
        const trochanter = landmarks[LM.R_HIP]; // greater trochanter approximation
        const condyle = landmarks[LM.R_KNEE]; // lateral femoral condyle approximation

        const straightLineAngle = calculateAngle(acromion, trochanter, condyle);

        return {
            view: "Right Lateral",
            outOfFrame: false,
            confidence: check.confidence,
            points: { acromion, trochanter, condyle },
            metrics: {
                trunkSagittal: calculateAngleFromVertical(acromion, trochanter),
                thighSagittal: calculateAngleFromVertical(trochanter, condyle),
                sagittalCurvature: parseFloat(Math.abs(180 - straightLineAngle).toFixed(1))
            }
        };
    }

    // Left Lateral (sagittal) view
    function analyzeLeftLateralView(landmarks) {
        const check = checkFrameConfidence(landmarks, [LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE]);
        if (check.outOfFrame) return { view: "Left Lateral", outOfFrame: true, confidence: check.confidence };

        const acromion = landmarks[LM.L_SHOULDER];
        const trochanter = landmarks[LM.L_HIP]; // greater trochanter approximation
        const epicondyle = landmarks[LM.L_KNEE]; // lateral femoral epicondyle approximation

        const straightLineAngle = calculateAngle(acromion, trochanter, epicondyle);

        return {
            view: "Left Lateral",
            outOfFrame: false,
            confidence: check.confidence,
            points: { acromion, trochanter, epicondyle },
            metrics: {
                trunkSagittal: calculateAngleFromVertical(acromion, trochanter),
                thighSagittal: calculateAngleFromVertical(trochanter, epicondyle),
                sagittalCurvature: parseFloat(Math.abs(180 - straightLineAngle).toFixed(1))
            }
        };
    }

    // Combine all 4 views into one clinical deviation table + overall status
    function evaluateFullBodyPosture(views) {
        let devCount = 0, sigDevCount = 0;
        const measurements = [];

        const checkOne = (viewLabel, metricKey, val, side) => {
            const standards = STATIC_STANDARDS[metricKey];
            if (!standards || val === undefined || val === null) return;
            let status = "Normal";
            let diff = 0;
            if (val > standards.maxNormal) {
                diff = val - standards.maxNormal;
                status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
            }
            if (status !== "Normal") {
                devCount++;
                if (status === "Significant Deviation") sigDevCount++;
            }
            measurements.push({
                joint: `${viewLabel} – ${standards.name}`,
                side: side || "Compare",
                angle: val,
                reference: standards.refRange,
                deviation: parseFloat(diff.toFixed(1)),
                status: status
            });
        };

        if (views.anterior && !views.anterior.outOfFrame) {
            const m = views.anterior.metrics;
            checkOne("Anterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("Anterior", "pelvicTiltFrontal", m.pelvicTiltFrontal, "L-R");
            checkOne("Anterior", "kneeAlignmentFrontal", m.kneeAlignmentFrontal, "L-R");
        }
        if (views.posterior && !views.posterior.outOfFrame) {
            const m = views.posterior.metrics;
            checkOne("Posterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("Posterior", "pelvicTiltPosterior", m.pelvicTiltPosterior, "L-R");
            checkOne("Posterior", "kneeAlignmentPosterior", m.kneeAlignmentPosterior, "L-R");
            checkOne("Posterior", "spinalAlignment", m.spinalAlignment, "Center");
        }
        if (views.rightLateral && !views.rightLateral.outOfFrame) {
            const m = views.rightLateral.metrics;
            checkOne("Right Lateral", "trunkSagittal", m.trunkSagittal, "Right");
            checkOne("Right Lateral", "thighSagittal", m.thighSagittal, "Right");
            checkOne("Right Lateral", "sagittalCurvature", m.sagittalCurvature, "Right");
        }
        if (views.leftLateral && !views.leftLateral.outOfFrame) {
            const m = views.leftLateral.metrics;
            checkOne("Left Lateral", "trunkSagittal", m.trunkSagittal, "Left");
            checkOne("Left Lateral", "thighSagittal", m.thighSagittal, "Left");
            checkOne("Left Lateral", "sagittalCurvature", m.sagittalCurvature, "Left");
        }

        let overallStatus = "Normal";
        if (sigDevCount > 0) overallStatus = "Significant Deviation";
        else if (devCount > 0) overallStatus = "Mild Deviation";

        return { overallStatus, measurements };
    }

    function generatePostureInterpretation(evaluation) {
        const { overallStatus, measurements } = evaluation;
        const deviations = measurements.filter(m => m.status !== "Normal");
        let remarks = [];

        if (deviations.length === 0) {
            remarks.push("Full-body postural screening across anterior, posterior, and bilateral lateral views shows all assessed landmarks within normal alignment tolerances, indicating balanced muscular and skeletal support of static posture.");
        } else {
            remarks.push(`Full-body postural screening reveals a ${overallStatus.toLowerCase()} across one or more assessed planes.`);

            const shoulderDev = deviations.find(d => d.joint.includes("Shoulder Level"));
            const pelvicDev = deviations.find(d => d.joint.includes("Pelvic Level"));
            const spinalDev = deviations.find(d => d.joint.includes("Spinal Alignment"));
            const kneeDev = deviations.find(d => d.joint.includes("Knee Alignment"));
            const sagittalDev = deviations.find(d => d.joint.includes("Sagittal"));

            if (shoulderDev) remarks.push(`Shoulder height asymmetry (${shoulderDev.angle}°) was observed, which may reflect unilateral muscular tightness (e.g. upper trapezius) or scapular positioning imbalance.`);
            if (pelvicDev) remarks.push(`Pelvic obliquity (${pelvicDev.angle}°) was detected, suggesting possible leg-length discrepancy, hip abductor weakness, or lateral pelvic tilt.`);
            if (spinalDev) remarks.push(`Lateral spinal deviation of ${spinalDev.angle}° between the cervicothoracic junction and pelvis was noted, warranting screening for scoliosis or postural asymmetry.`);
            if (kneeDev) remarks.push(`Frontal-plane knee alignment deviates by ${kneeDev.angle}°, consistent with possible genu valgum/varum or rotational compensation.`);
            if (sagittalDev) remarks.push(`Sagittal plane plumb-line deviation (${sagittalDev.angle}°) was identified between shoulder, hip, and knee reference points, suggesting anterior/posterior postural compensation (e.g. forward trunk lean, pelvic tilt, or knee hyperextension).`);
        }

        if (overallStatus === "Significant Deviation") {
            remarks.push("Clinical interpretation: Multi-planar postural assessment indicates notable structural asymmetries. A comprehensive physiotherapy evaluation is recommended to address underlying muscular imbalances and prevent compensatory injury patterns.");
        } else if (overallStatus === "Mild Deviation") {
            remarks.push("Clinical interpretation: Mild postural deviations detected. Targeted corrective exercises and periodic re-assessment are recommended.");
        } else {
            remarks.push("Clinical interpretation: Overall static postural alignment is within acceptable clinical range. Continue routine conditioning and periodic reassessment.");
        }

        return remarks.join(" ");
    }

    function generatePostureRecommendations(evaluation) {
        const deviations = evaluation.measurements.filter(m => m.status !== "Normal");
        const recs = [];

        if (deviations.length === 0) {
            recs.push("Maintain general postural awareness and continue regular full-body mobility and strength training.");
            recs.push("Repeat 4-view postural screening periodically to monitor for developing asymmetries.");
            return recs;
        }

        const joints = deviations.map(d => d.joint);
        if (joints.some(j => j.includes("Shoulder Level"))) {
            recs.push("Unilateral scapular stabilization drills (band pull-aparts, wall slides) to correct shoulder height asymmetry.");
        }
        if (joints.some(j => j.includes("Pelvic Level"))) {
            recs.push("Hip abductor/adductor strengthening (side-lying leg raises, clamshells) and assess for leg-length discrepancy.");
        }
        if (joints.some(j => j.includes("Spinal Alignment"))) {
            recs.push("Referral for formal scoliosis/spinal screening if lateral spinal deviation persists on repeat assessment.");
        }
        if (joints.some(j => j.includes("Knee Alignment"))) {
            recs.push("Hip and knee stabilization exercises (glute medius strengthening, single-leg squats with alignment cueing) to correct frontal-plane knee tracking.");
        }
        if (joints.some(j => j.includes("Sagittal"))) {
            recs.push("Postural retraining (chin tucks, thoracic extension, hip flexor stretching) to correct sagittal-plane trunk/pelvis alignment.");
        }
        recs.push("Re-assess all four views after 4-6 weeks of corrective intervention to track progress objectively.");

        return recs.slice(0, 5);
    }

    const PF_Pose = {
        // Calculate all necessary joint angles
        analyzeLandmarks: function (landmarks) {
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
        evaluatePosture: function (analysis) {
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
        generateInterpretation: function (postureAssessment, squatState) {
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
        generateRecommendations: function (postureAssessment) {
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
        },

        // --- BPT2: 4-view standing posture assessment ---
        analyzeAnteriorView: analyzeAnteriorView,
        analyzePosteriorView: analyzePosteriorView,
        analyzeRightLateralView: analyzeRightLateralView,
        analyzeLeftLateralView: analyzeLeftLateralView,
        evaluateFullBodyPosture: evaluateFullBodyPosture,
        generatePostureInterpretation: generatePostureInterpretation,
        generatePostureRecommendations: generatePostureRecommendations
    };

    window.PF_Pose = PF_Pose;
})();
