/* PostureFlex Geometry & Pose Analysis Module */
(function () {
    // MediaPipe landmark map
    const LM = {
        NOSE: 0,
        L_EAR: 7, R_EAR: 8,
        L_SHOULDER: 11, R_SHOULDER: 12,
        L_ELBOW: 13, R_ELBOW: 14,
        L_WRIST: 15, R_WRIST: 16,
        L_HIP: 23, R_HIP: 24,
        L_KNEE: 25, R_KNEE: 26,
        L_ANKLE: 27, R_ANKLE: 28,
        L_HEEL: 29, R_HEEL: 30,
        L_FOOT: 31, R_FOOT: 32
    };
    // Reference physiological values (squat assessment) -- MODULE 1 ONLY.
    // Sourced directly from the user-provided clinical chart "DEEP SQUAT
    // ASSESSMENT - NORMAL vs ABNORMAL" (Trunk Lean 30-45deg / Hip Flexion
    // 110-125deg / Knee Flexion 130-150deg / Ankle Dorsiflexion 35-40deg,
    // each with its stated abnormal cutoff). Module 2's reference standards
    // (below) are untouched.
    // pose.js measures raw interior joint angles (180deg = straight, shrinks with flexion),
    // while the chart's flexion values grow from neutral (0deg = straight), so
    // they were converted: knee/hip -> 180 - flexion; ankle -> 90 - dorsiflexion.
    // NOTE (Module 1 sensitivity tuning): warningThreshold controls how far
    // outside the normal range a reading must fall before it flips from
    // "Mild Deviation" to "Significant Deviation". These were widened
    // (roughly doubled) from the original chart-derived values because
    // trivial overshoots were being flagged as "Significant" -- now a
    // reading has to miss the normal range by a clearly larger margin
    // before it escalates. The minNormal/maxNormal band itself (what counts
    // as "Normal" vs "Mild") was also widened slightly for the same reason.
    // Module 2 (STATIC_STANDARDS below) is untouched.
    const REFERENCE_STANDARDS = {
        // Chart: Knee Flexion 130-150deg normal, abnormal <130deg -> interior 30-50deg
        knee: { name: "Knee Flexion", refRange: "25° - 55°", minNormal: 25, maxNormal: 55, warningThreshold: 20 },
        // Chart: Hip Flexion 110-125deg normal, abnormal <100deg -> interior 55-70deg
        hip: { name: "Hip Flexion", refRange: "50° - 75°", minNormal: 50, maxNormal: 75, warningThreshold: 20 },
        // Chart: Trunk Lean 30-45deg normal, abnormal >45-50deg or <20-25deg
        // (same convention, no conversion needed)
        trunk: { name: "Trunk Lean", refRange: "25° - 50°", minNormal: 25, maxNormal: 50, warningThreshold: 10 },
        // Chart: Ankle Dorsiflexion 35-40deg normal, abnormal <30deg -> interior 50-55deg
        ankle: { name: "Ankle Alignment", refRange: "47° - 58°", minNormal: 47, maxNormal: 58, warningThreshold: 10 }
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
    // Calculate forward/backward trunk lean using the SAGITTAL (depth) plane
    // instead of the frontal (left-right/x) plane. This is specifically for
    // Module 1 (BPT1 Live Squat Camera), where the patient faces the camera
    // head-on. A forward trunk lean during a squat happens toward/away from
    // the camera -- along the depth axis -- not side to side. MediaPipe Pose
    // exposes this as landmark.z (roughly hip-centered, same scale as x;
    // more negative = closer to the camera). The previous implementation
    // reused calculateAngleFromVertical(shoulder, hip), which compares the
    // vertical (y) axis against the LATERAL (x) axis. From a front-facing
    // camera, real forward lean barely moves x at all, so that formula was
    // effectively measuring noise/foreshortening instead of lean, which is
    // why a true ~40-50deg forward lean was reading out as ~110deg. This
    // function instead compares vertical (y) against DEPTH (z), which is
    // the axis a front-facing camera actually captures forward lean on.
    function calculateForwardLeanAngle(shoulder, hip) {
        if (!shoulder || !hip) return 0;
        const dz = (shoulder.z || 0) - (hip.z || 0); // depth offset of shoulder from hip
        const dy = hip.y - shoulder.y;               // vertical rise of shoulder above hip (positive when upright)
        const angleRad = Math.atan2(Math.abs(dz), Math.abs(dy) || 0.0001);
        return parseFloat(((angleRad * 180) / Math.PI).toFixed(1));
    }
    // ---------------------------------------------------------------------
    // Standing Posture Assessment (BPT2): Anterior / Posterior / Right & Left
    // Lateral views. MediaPipe Pose exposes 33 general body landmarks, not the
    // exact discrete clinical bony landmarks (acromion, ASIS/PSIS, C7 spinous
    // process, greater trochanter, femoral condyle/epicondyle). Each clinical
    // landmark below is therefore mapped to its nearest tracked MediaPipe
    // point as a software estimate -- clearly labelled as such in the report.
    // ---------------------------------------------------------------------
    // NOTE (Module 2 sensitivity tuning, matching the Module 1 widening
    // rationale above): warningThreshold values roughly doubled, and the
    // minNormal/maxNormal band widened, so a moderate ("medium") overshoot
    // reads as "Mild Deviation" instead of escalating straight to
    // "Significant Deviation". Values are aligned with MODULE1_STATIC_STANDARDS
    // wherever the two share the same underlying metric (e.g. shoulderTilt,
    // pelvicTilt*, kneeAlignment*, trunkSagittal/hipSagittal).
    const STATIC_STANDARDS = {
        shoulderTilt: { name: "Shoulder Level (Acromion L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        pelvicTiltFrontal: { name: "Pelvic Level (ASIS L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        pelvicTiltPosterior: { name: "Pelvic Level (PSIS L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        kneeAlignmentFrontal: { name: "Knee Alignment (Patellae)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        kneeAlignmentPosterior: { name: "Knee Alignment (Midpoint)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        ankleAlignmentFrontal: { name: "Ankle/Malleolar Symmetry (Malleoli L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        ankleAlignmentPosterior: { name: "Ankle/Malleolar Symmetry (Malleoli L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        spinalAlignment: { name: "Spinal Alignment (C7 to PSIS Midpoint)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        trunkSymmetryFrontal: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        trunkSymmetryPosterior: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        trunkSagittal: { name: "Trunk-Pelvis Sagittal Alignment (Acromion-Trochanter)", refRange: "0° - 7°", minNormal: 0, maxNormal: 7, warningThreshold: 12 },
        thighSagittal: { name: "Pelvis-Knee Sagittal Alignment (Trochanter-Condyle)", refRange: "0° - 7°", minNormal: 0, maxNormal: 7, warningThreshold: 12 },
        sagittalCurvature: { name: "Overall Sagittal Curvature", refRange: "0° - 9°", minNormal: 0, maxNormal: 9, warningThreshold: 20 },
        headPositionTilt: { name: "Head Position (Ear Level L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        headPositionForward: { name: "Head Position (Forward Head Posture)", refRange: "0° - 12°", minNormal: 0, maxNormal: 12, warningThreshold: 25 },
        scapularSymmetry: { name: "Scapular Symmetry (Inferior Angle L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 }
    };

    // Module 1 (BPT1) ONLY -- widened-tolerance clone of the static standing
    // standards above, used exclusively by evaluateModule1StaticViews so that
    // Module 2 (BPT2, which still uses STATIC_STANDARDS unchanged) is never
    // affected. warningThreshold values are roughly doubled and the
    // minNormal/maxNormal band is widened slightly, per Module 1 sensitivity
    // tuning request: small deviations should stay "Normal"/"Mild" instead of
    // escalating straight to "Significant Deviation".
    const MODULE1_STATIC_STANDARDS = {
        headPositionTilt: { name: "Head/Neck Tilt (Ear Level L/R)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, warningThreshold: 8 },
        shoulderTilt: { name: "Shoulder Level (Acromion L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        trunkSymmetryFrontal: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, warningThreshold: 8 },
        trunkSymmetryPosterior: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 8 },
        pelvicTiltFrontal: { name: "Hip Level (ASIS L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 14 },
        pelvicTiltPosterior: { name: "Hip Level (PSIS L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 6 },
        kneeAlignmentFrontal: { name: "Knee Alignment (Patellae)", refRange: "2° - 5°", minNormal: 2, maxNormal: 5, warningThreshold: 12 },
        kneeAlignmentPosterior: { name: "Knee Alignment (Popliteal Crease)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        ankleAlignmentFrontal: { name: "Ankle Alignment (Malleoli L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        ankleAlignmentPosterior: { name: "Ankle Alignment (Malleoli L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        heelAlignmentPosterior: { name: "Heel Alignment (Calcaneus/Achilles L/R)", refRange: "4° - 15°", minNormal: 4, maxNormal: 15, warningThreshold: 10 },
        trunkSagittal: { name: "Trunk Lean (Sagittal)", refRange: "10° - 30°", minNormal: 10, maxNormal: 30, warningThreshold: 18 },
        hipSagittal: { name: "Hip Alignment (Sagittal)", refRange: "95° - 105°", minNormal: 95, maxNormal: 105, warningThreshold: 18 },
        kneeSagittal: { name: "Knee Alignment (Sagittal Flexion)", refRange: "50° - 70°", minNormal: 50, maxNormal: 70, warningThreshold: 20 },
        ankleSagittal: { name: "Ankle Dorsiflexion (Sagittal)", refRange: "70° - 110°", minNormal: 70, maxNormal: 110, warningThreshold: 20 }
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
    // Resolves an ear landmark for head-position checks; falls back to the
    // nose landmark if the ear itself has low tracking confidence (common at
    // certain camera angles), so the head-position metric degrades gracefully
    // instead of disappearing entirely.
    function resolveHeadRefPoint(landmarks, earIdx) {
        const ear = landmarks[earIdx];
        if (ear && (ear.visibility === undefined || ear.visibility >= 0.3)) return ear;
        const nose = landmarks[LM.NOSE];
        return (nose && (nose.visibility === undefined || nose.visibility >= 0.3)) ? nose : null;
    }

    // Anterior (front-facing) view
    function analyzeAnteriorView(landmarks) {
        const check = checkFrameConfidence(landmarks, [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]);
        if (check.outOfFrame) return { view: "Anterior", outOfFrame: true, confidence: check.confidence };

        const lShoulder = landmarks[LM.L_SHOULDER], rShoulder = landmarks[LM.R_SHOULDER];
        const lHip = landmarks[LM.L_HIP], rHip = landmarks[LM.R_HIP];
        const lKnee = landmarks[LM.L_KNEE], rKnee = landmarks[LM.R_KNEE];
        const lAnkle = landmarks[LM.L_ANKLE], rAnkle = landmarks[LM.R_ANKLE];
        const anklesVisible = (lAnkle?.visibility || 0) >= 0.3 && (rAnkle?.visibility || 0) >= 0.3;
        const lEar = landmarks[LM.L_EAR], rEar = landmarks[LM.R_EAR];
        const earsVisible = (lEar?.visibility || 0) >= 0.3 && (rEar?.visibility || 0) >= 0.3;
        const shoulderMid = midpoint(lShoulder, rShoulder);
        const hipMid = midpoint(lHip, rHip);

        return {
            view: "Anterior",
            outOfFrame: false,
            confidence: check.confidence,
            points: {
                earL: lEar, earR: rEar,
                acromionL: lShoulder, acromionR: rShoulder,
                sternum: offsetDown(shoulderMid, 0.08),
                umbilicus: hipMid,
                asisL: lHip, asisR: rHip,
                patellaeCenter: midpoint(lKnee, rKnee),
                kneeL: lKnee, kneeR: rKnee,
                ankleL: lAnkle, ankleR: rAnkle
            },
            metrics: {
                ...(earsVisible ? { headPositionTilt: calculateTiltFromHorizontal(lEar, rEar) } : {}),
                shoulderTilt: calculateTiltFromHorizontal(lShoulder, rShoulder),
                // Module 1 (BPT1) 4-view report addition: lateral shift of the
                // trunk (shoulder midpoint vs hip midpoint) from vertical --
                // the frontal-view counterpart of Module 2's trunkSymmetryPosterior.
                trunkSymmetryFrontal: (shoulderMid && hipMid) ? calculateAngleFromVertical(shoulderMid, hipMid) : 0,
                pelvicTiltFrontal: calculateTiltFromHorizontal(lHip, rHip),
                kneeAlignmentFrontal: calculateTiltFromHorizontal(lKnee, rKnee),
                // Module 1 (BPT1) 4-view report addition: L-R ankle/malleolar level from the front.
                ...(anklesVisible ? { ankleAlignmentFrontal: calculateTiltFromHorizontal(lAnkle, rAnkle) } : {})
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
        const lAnkle = landmarks[LM.L_ANKLE], rAnkle = landmarks[LM.R_ANKLE];
        const anklesVisible = (lAnkle?.visibility || 0) >= 0.3 && (rAnkle?.visibility || 0) >= 0.3;
        const lHeel = landmarks[LM.L_HEEL], rHeel = landmarks[LM.R_HEEL];
        const heelsVisible = (lHeel?.visibility || 0) >= 0.3 && (rHeel?.visibility || 0) >= 0.3;
        const lFoot = landmarks[LM.L_FOOT], rFoot = landmarks[LM.R_FOOT];
        const lWrist = landmarks[LM.L_WRIST], rWrist = landmarks[LM.R_WRIST];
        const lEar = landmarks[LM.L_EAR], rEar = landmarks[LM.R_EAR];
        const earsVisible = (lEar?.visibility || 0) >= 0.3 && (rEar?.visibility || 0) >= 0.3;
        const shoulderMid = midpoint(lShoulder, rShoulder);
        const hipMid = midpoint(lHip, rHip);
        // C7 spinous process approximated slightly above the shoulder midpoint
        const c7Approx = shoulderMid ? { x: shoulderMid.x, y: shoulderMid.y - 0.03 } : null;
        const scapulaInferiorL = offsetDown(lShoulder, 0.12); // approximated
        const scapulaInferiorR = offsetDown(rShoulder, 0.12); // approximated

        return {
            view: "Posterior",
            outOfFrame: false,
            confidence: check.confidence,
            points: {
                earL: lEar, earR: rEar,
                c7: c7Approx,
                shoulderMid, hipMid,
                scapulaInferiorL, scapulaInferiorR,
                acromionL: lShoulder, acromionR: rShoulder,
                psisL: lHip, psisR: rHip,
                kneeL: lKnee, kneeR: rKnee,
                kneeMidpoint: midpoint(lKnee, rKnee),
                ankleL: lAnkle, ankleR: rAnkle,
                heelL: lHeel, heelR: rHeel,
                footL: lFoot, footR: rFoot,
                handL: lWrist, handR: rWrist
            },
            metrics: {
                ...(earsVisible ? { headPositionTilt: calculateTiltFromHorizontal(lEar, rEar) } : {}),
                shoulderTilt: calculateTiltFromHorizontal(lShoulder, rShoulder),
                trunkSymmetryPosterior: (shoulderMid && hipMid) ? calculateAngleFromVertical(shoulderMid, hipMid) : 0,
                pelvicTiltPosterior: calculateTiltFromHorizontal(lHip, rHip),
                kneeAlignmentPosterior: calculateTiltFromHorizontal(lKnee, rKnee),
                ...(anklesVisible ? { ankleAlignmentPosterior: calculateTiltFromHorizontal(lAnkle, rAnkle) } : {}),
                // Module 1 (BPT1) 4-view report addition: calcaneus (heel) L-R
                // level from behind -- approximates the "Achilles vertical /
                // calcaneal valgus-varus" check from the clinical reference chart.
                ...(heelsVisible ? { heelAlignmentPosterior: calculateTiltFromHorizontal(lHeel, rHeel) } : {}),
                spinalAlignment: c7Approx ? calculateAngleFromVertical(c7Approx, hipMid) : 0,
                scapularSymmetry: calculateTiltFromHorizontal(scapulaInferiorL, scapulaInferiorR)
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
        const ankle = landmarks[LM.R_ANKLE];
        const foot = landmarks[LM.R_FOOT];
        const hand = landmarks[LM.R_WRIST];
        const headRef = resolveHeadRefPoint(landmarks, LM.R_EAR); // ear, falls back to nose

        const straightLineAngle = calculateAngle(acromion, trochanter, condyle);
        // Module 1 (BPT1) 4-view report additions: true knee flexion angle
        // (vertex at the knee itself, hip-knee-ankle) and ankle dorsiflexion
        // angle (vertex at the ankle, knee-ankle-foot) for standing posture --
        // distinct from thighSagittal (vertex at the hip) already used above.
        const kneeSagittal = (trochanter && condyle && ankle) ? calculateAngle(trochanter, condyle, ankle) : 0;
        const ankleSagittal = (condyle && ankle && foot) ? calculateAngle(condyle, ankle, foot) : 0;

        return {
            view: "Right Lateral",
            outOfFrame: false,
            confidence: check.confidence,
            points: { acromion, trochanter, condyle, ankle, foot, hand, headRef },
            metrics: {
                ...(headRef ? { headPositionForward: calculateAngleFromVertical(headRef, acromion) } : {}),
                trunkSagittal: calculateAngleFromVertical(acromion, trochanter),
                thighSagittal: calculateAngleFromVertical(trochanter, condyle),
                hipSagittal: calculateAngleFromVertical(trochanter, condyle),
                ...(kneeSagittal ? { kneeSagittal } : {}),
                ...(ankleSagittal ? { ankleSagittal } : {}),
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
        const ankle = landmarks[LM.L_ANKLE];
        const foot = landmarks[LM.L_FOOT];
        const hand = landmarks[LM.L_WRIST];
        const headRef = resolveHeadRefPoint(landmarks, LM.L_EAR); // ear, falls back to nose

        const straightLineAngle = calculateAngle(acromion, trochanter, epicondyle);
        const kneeSagittal = (trochanter && epicondyle && ankle) ? calculateAngle(trochanter, epicondyle, ankle) : 0;
        const ankleSagittal = (epicondyle && ankle && foot) ? calculateAngle(epicondyle, ankle, foot) : 0;

        return {
            view: "Left Lateral",
            outOfFrame: false,
            confidence: check.confidence,
            points: { acromion, trochanter, epicondyle, ankle, foot, hand, headRef },
            metrics: {
                ...(headRef ? { headPositionForward: calculateAngleFromVertical(headRef, acromion) } : {}),
                trunkSagittal: calculateAngleFromVertical(acromion, trochanter),
                thighSagittal: calculateAngleFromVertical(trochanter, epicondyle),
                hipSagittal: calculateAngleFromVertical(trochanter, epicondyle),
                ...(kneeSagittal ? { kneeSagittal } : {}),
                ...(ankleSagittal ? { ankleSagittal } : {}),
                sagittalCurvature: parseFloat(Math.abs(180 - straightLineAngle).toFixed(1))
            }
        };
    }

    // Module 2 (BPT2) REPORT-LABEL-ONLY map: translates each existing metric
    // key to the clinical landmark/parameter name from the provided Anterior
    // View Assessment / Posterior View Assessment / Lateral View Assessment /
    // Right & Left Lateral View Landmarks charts. This ONLY changes what the
    // report prints in the "Parameter" column -- it does not touch how any
    // value is calculated, thresholded, or scored (that all still comes from
    // STATIC_STANDARDS + checkOne below, completely unchanged). Right and
    // Left Lateral share the same clinical landmark set (Right & Left Lateral
    // View Landmarks table), so the two sides reuse the same label map.
    const MODULE2_CLINICAL_LABELS = {
        anterior: {
            headPositionTilt: "Head",
            shoulderTilt: "Right & Left Acromion Process",
            trunkSymmetryFrontal: "Sternum",
            pelvicTiltFrontal: "Right & Left ASIS",
            kneeAlignmentFrontal: "Patellae",
            ankleAlignmentFrontal: "Medial Malleoli"
        },
        posterior: {
            headPositionTilt: "Occiput",
            shoulderTilt: "Right & Left Acromion",
            scapularSymmetry: "Inferior Angle of Scapula",
            spinalAlignment: "Vertebral Spinous Process",
            pelvicTiltPosterior: "Right & Left PSIS",
            kneeAlignmentPosterior: "Popliteal Crease"
        },
        rightLateral: {
            headPositionForward: "External Auditory Meatus (Craniovertebral Angle)",
            trunkSagittal: "Shoulder (Acromion Process)",
            thighSagittal: "Greater Trochanter",
            sagittalCurvature: "Thoracic Spine"
        },
        leftLateral: {
            headPositionForward: "External Auditory Meatus (Craniovertebral Angle)",
            trunkSagittal: "Shoulder (Acromion Process)",
            thighSagittal: "Greater Trochanter",
            sagittalCurvature: "Thoracic Spine"
        }
    };

    // Combine all 4 views into one clinical deviation table + overall status.
    // Also groups the exact same rows by view (viewSections) so the report
    // can render 4 separate tables -- Anterior / Posterior / Lateral (Left) /
    // Lateral (Right) -- matching Module 1's report layout. No calculation,
    // threshold, or measurement value is changed here; only the "joint"
    // display label (now sourced from MODULE2_CLINICAL_LABELS) and the added
    // grouping are new.
    function evaluateFullBodyPosture(views) {
        let devCount = 0, sigDevCount = 0;
        const measurements = [];
        const viewSections = { anterior: [], posterior: [], rightLateral: [], leftLateral: [] };

        const checkOne = (sectionKey, viewLabel, metricKey, val, side) => {
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
            // Prefer the clinical landmark name for this view/metric; fall
            // back to the original generic label if no mapping exists (so
            // nothing silently disappears from the report).
            const clinicalLabel = MODULE2_CLINICAL_LABELS[sectionKey]?.[metricKey];
            const row = {
                joint: clinicalLabel ? clinicalLabel : `${viewLabel} – ${standards.name}`,
                side: side || "Compare",
                angle: val,
                fixed: standards.refRange,
                reference: standards.refRange,
                deviation: parseFloat(diff.toFixed(1)),
                status: status
            };
            measurements.push(row);
            if (viewSections[sectionKey]) viewSections[sectionKey].push(row);
        };

        if (views.anterior && !views.anterior.outOfFrame) {
            const m = views.anterior.metrics;
            // Mirrors the Posterior view's parameter set below, one-for-one,
            // using the frontal equivalent of each metric. Scapular Symmetry
            // and Spinal Alignment (C7-to-PSIS) are landmarks that are only
            // visible from behind, so their frontal-view counterparts are
            // Trunk Symmetry (Shoulder-Hip) and Ankle/Malleolar Symmetry --
            // both already tracked from the front -- keeping the same
            // 6-parameter, Head/Shoulder/Trunk/Hip/Knee/Ankle structure as Posterior.
            checkOne("anterior", "Anterior", "headPositionTilt", m.headPositionTilt, "L-R");
            checkOne("anterior", "Anterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("anterior", "Anterior", "trunkSymmetryFrontal", m.trunkSymmetryFrontal, "L-R");
            checkOne("anterior", "Anterior", "pelvicTiltFrontal", m.pelvicTiltFrontal, "L-R");
            checkOne("anterior", "Anterior", "kneeAlignmentFrontal", m.kneeAlignmentFrontal, "L-R");
            checkOne("anterior", "Anterior", "ankleAlignmentFrontal", m.ankleAlignmentFrontal, "L-R");
        }
        if (views.posterior && !views.posterior.outOfFrame) {
            const m = views.posterior.metrics;
            // Ordered per requested report sequence: Head/Neck, Shoulder, Trunk, Hip, Knee
            checkOne("posterior", "Posterior", "headPositionTilt", m.headPositionTilt, "L-R");
            checkOne("posterior", "Posterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("posterior", "Posterior", "scapularSymmetry", m.scapularSymmetry, "L-R");
            checkOne("posterior", "Posterior", "spinalAlignment", m.spinalAlignment, "Center");
            checkOne("posterior", "Posterior", "pelvicTiltPosterior", m.pelvicTiltPosterior, "L-R");
            checkOne("posterior", "Posterior", "kneeAlignmentPosterior", m.kneeAlignmentPosterior, "L-R");
        }
        if (views.rightLateral && !views.rightLateral.outOfFrame) {
            const m = views.rightLateral.metrics;
            checkOne("rightLateral", "Right Lateral", "headPositionForward", m.headPositionForward, "Right");
            checkOne("rightLateral", "Right Lateral", "trunkSagittal", m.trunkSagittal, "Right");
            checkOne("rightLateral", "Right Lateral", "thighSagittal", m.thighSagittal, "Right");
            checkOne("rightLateral", "Right Lateral", "sagittalCurvature", m.sagittalCurvature, "Right");
        }
        if (views.leftLateral && !views.leftLateral.outOfFrame) {
            const m = views.leftLateral.metrics;
            checkOne("leftLateral", "Left Lateral", "headPositionForward", m.headPositionForward, "Left");
            checkOne("leftLateral", "Left Lateral", "trunkSagittal", m.trunkSagittal, "Left");
            checkOne("leftLateral", "Left Lateral", "thighSagittal", m.thighSagittal, "Left");
            checkOne("leftLateral", "Left Lateral", "sagittalCurvature", m.sagittalCurvature, "Left");
        }

        // Compute Overall Risk Category by averaging every individual
        // measurement's status (Normal=0, Mild=1, Significant=2) instead of
        // letting a single flagged joint escalate the entire result to
        // "Significant Deviation". The overall label reflects the balance
        // of all joints checked across all captured views.
        let overallStatus = "Normal";
        {
            const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
            const statusScores = measurements.map(m => PF_STATUS_SCORE[m.status] ?? 0);
            const avgStatusScore = statusScores.length > 0
                ? statusScores.reduce((sum, s) => sum + s, 0) / statusScores.length
                : 0;
            if (avgStatusScore >= 1.5) overallStatus = "Significant Deviation";
            else if (avgStatusScore >= 0.5) overallStatus = "Mild Deviation";
        }

        return { overallStatus, measurements, viewSections };
    }

    // --- Module 1 (BPT1): evaluates the Posterior / Right Lateral / Left Lateral
    // static captures only (Anterior in Module 1 is the live squat-depth capture,
    // evaluated separately by evaluatePosture). Views are ordered Right Lateral,
    // Left Lateral, then Posterior (Anterior/squat is prepended by the caller),
    // and within each view, joints are ordered Neck, Shoulder, Trunk, Hip, Knee,
    // Ankle to match the requested clinical report sequence.
    function evaluateModule1StaticViews(views) {
        let devCount = 0, sigDevCount = 0;
        const measurements = [];
        // Grouped-by-view output for the Module 1 4-section report (Anterior is
        // added separately by the caller from the live squat capture, since it
        // uses different metrics/standards -- see evaluatePosture above).
        const viewSections = { anterior: [], posterior: [], rightLateral: [], leftLateral: [] };

        // Builds one row. "category" is the clinical category label used to
        // order/group rows in the report (Neck/Head, Shoulder, Trunk Symmetry,
        // Trunk Lean, Hip, Knee, Ankle, Heel); "joint" stays as the detailed
        // metric name for interpretation/recommendation text lookups.
        const checkOne = (sectionKey, category, viewLabel, metricKey, val, side) => {
            const standards = MODULE1_STATIC_STANDARDS[metricKey];
            if (!standards || val === undefined || val === null) return;
            let status = "Normal";
            let diff = 0;
            if (val > standards.maxNormal) {
                diff = val - standards.maxNormal;
                status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
            } else if (val < standards.minNormal) {
                diff = standards.minNormal - val;
                status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
            }
            if (status !== "Normal") {
                devCount++;
                if (status === "Significant Deviation") sigDevCount++;
            }
            const row = {
                category: category,
                joint: `${viewLabel} – ${standards.name}`,
                side: side || "Compare",
                angle: val,               // currently measured angle
                fixed: standards.refRange, // fixed/normal reference angle range
                reference: standards.refRange,
                deviation: parseFloat(diff.toFixed(1)),
                status: status
            };
            measurements.push(row);
            if (viewSections[sectionKey]) viewSections[sectionKey].push(row);
        };

        // Requested clinical report sequence, applied per view (a category is
        // simply skipped for a view if it isn't measurable from that angle --
        // e.g. Trunk Lean is a sagittal-plane measure so it only applies to
        // the Lateral views, not Posterior).
        // Anterior uses the same parameter set (category order: Neck/Head,
        // Shoulder, Trunk Symmetry, Hip, Knee, Ankle) as Posterior below --
        // just measured from the front-facing metrics instead of the
        // back-facing ones, so the two sections of the report line up
        // parameter-for-parameter and only differ in which side of the body
        // supplied the measurement.
        if (views.anterior && !views.anterior.outOfFrame) {
            const m = views.anterior.metrics;
            checkOne("anterior", "Neck / Head", "Anterior", "headPositionTilt", m.headPositionTilt, "L-R");
            checkOne("anterior", "Shoulder", "Anterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("anterior", "Trunk Symmetry", "Anterior", "trunkSymmetryFrontal", m.trunkSymmetryFrontal, "L-R");
            checkOne("anterior", "Hip", "Anterior", "pelvicTiltFrontal", m.pelvicTiltFrontal, "L-R");
            checkOne("anterior", "Knee", "Anterior", "kneeAlignmentFrontal", m.kneeAlignmentFrontal, "L-R");
            checkOne("anterior", "Ankle", "Anterior", "ankleAlignmentFrontal", m.ankleAlignmentFrontal, "L-R");
        }
        if (views.posterior && !views.posterior.outOfFrame) {
            const m = views.posterior.metrics;
            checkOne("posterior", "Neck / Head", "Posterior", "headPositionTilt", m.headPositionTilt, "L-R");
            checkOne("posterior", "Shoulder", "Posterior", "shoulderTilt", m.shoulderTilt, "L-R");
            checkOne("posterior", "Trunk Symmetry", "Posterior", "trunkSymmetryPosterior", m.trunkSymmetryPosterior, "L-R");
            checkOne("posterior", "Hip", "Posterior", "pelvicTiltPosterior", m.pelvicTiltPosterior, "L-R");
            checkOne("posterior", "Knee", "Posterior", "kneeAlignmentPosterior", m.kneeAlignmentPosterior, "L-R");
            checkOne("posterior", "Ankle", "Posterior", "ankleAlignmentPosterior", m.ankleAlignmentPosterior, "L-R");
            checkOne("posterior", "Heel", "Posterior", "heelAlignmentPosterior", m.heelAlignmentPosterior, "L-R");
        }

        [["leftLateral", "Left Lateral", views.leftLateral, "Left"], ["rightLateral", "Right Lateral", views.rightLateral, "Right"]].forEach(([sectionKey, label, v, side]) => {
            if (!v || v.outOfFrame) return;
            const m = v.metrics;
            checkOne(sectionKey, "Neck / Head", label, "headPositionForward", m.headPositionForward, side);
            checkOne(sectionKey, "Trunk Lean", label, "trunkSagittal", m.trunkSagittal, side);
            checkOne(sectionKey, "Hip", label, "hipSagittal", m.hipSagittal, side);
            checkOne(sectionKey, "Knee", label, "kneeSagittal", m.kneeSagittal, side);
            checkOne(sectionKey, "Ankle", label, "ankleSagittal", m.ankleSagittal, side);
        });

        // Compute Overall Risk Category by averaging every individual
        // measurement's status (Normal=0, Mild=1, Significant=2) instead of
        // letting a single flagged joint escalate the entire result to
        // "Significant Deviation". The overall label reflects the balance
        // of all joints checked across all captured views.
        let overallStatus = "Normal";
        {
            const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
            const statusScores = measurements.map(m => PF_STATUS_SCORE[m.status] ?? 0);
            const avgStatusScore = statusScores.length > 0
                ? statusScores.reduce((sum, s) => sum + s, 0) / statusScores.length
                : 0;
            if (avgStatusScore >= 1.5) overallStatus = "Significant Deviation";
            else if (avgStatusScore >= 0.5) overallStatus = "Mild Deviation";
        }

        return { overallStatus, measurements, viewSections };
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
            const ankleDev = deviations.find(d => d.joint.includes("Ankle/Malleolar"));
            const trunkSymDev = deviations.find(d => d.joint.includes("Trunk Symmetry"));
            const sagittalDev = deviations.find(d => d.joint.includes("Sagittal") && !d.joint.includes("Head Position"));
            const headTiltDev = deviations.find(d => d.joint.includes("Head Position (Ear Level"));
            const headForwardDev = deviations.find(d => d.joint.includes("Head Position (Forward Head"));
            const scapularDev = deviations.find(d => d.joint.includes("Scapular Symmetry"));

            if (headTiltDev) remarks.push(`Lateral head tilt of ${headTiltDev.angle}° was observed between ear reference points, which may indicate cervical muscular imbalance (e.g. unilateral upper trapezius/levator scapulae tightness).`);
            if (headForwardDev) remarks.push(`Forward head posture of ${headForwardDev.angle}° was measured relative to the shoulder, a common finding associated with prolonged desk/screen posture and upper cervical strain.`);
            if (shoulderDev) remarks.push(`Shoulder height asymmetry (${shoulderDev.angle}°) was observed, which may reflect unilateral muscular tightness (e.g. upper trapezius) or scapular positioning imbalance.`);
            if (scapularDev) remarks.push(`Scapular asymmetry of ${scapularDev.angle}° was noted between the left and right inferior angles, suggesting possible scapular winging, dyskinesis, or unilateral periscapular weakness.`);
            if (trunkSymDev) remarks.push(`Trunk symmetry deviates by ${trunkSymDev.angle}° between the shoulder and hip midline reference points, suggesting a lateral trunk lean or compensatory postural shift.`);
            if (pelvicDev) remarks.push(`Pelvic obliquity (${pelvicDev.angle}°) was detected, suggesting possible leg-length discrepancy, hip abductor weakness, or lateral pelvic tilt.`);
            if (spinalDev) remarks.push(`Lateral spinal deviation of ${spinalDev.angle}° between the cervicothoracic junction and pelvis was noted, warranting screening for scoliosis or postural asymmetry.`);
            if (kneeDev) remarks.push(`Frontal-plane knee alignment deviates by ${kneeDev.angle}°, consistent with possible genu valgum/varum or rotational compensation.`);
            if (ankleDev) remarks.push(`Ankle/malleolar asymmetry of ${ankleDev.angle}° was observed between left and right malleolar reference points, which may indicate subtalar joint compensation, unilateral foot pronation/supination, or a lower-limb length discrepancy.`);
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
        if (joints.some(j => j.includes("Head Position (Ear Level") || j.includes("Head Position (Forward Head"))) {
            recs.push("Cervical postural retraining (chin tucks, deep neck flexor strengthening) and ergonomic screen-height review to correct head tilt/forward head posture.");
        }
        if (joints.some(j => j.includes("Shoulder Level"))) {
            recs.push("Unilateral scapular stabilization drills (band pull-aparts, wall slides) to correct shoulder height asymmetry.");
        }
        if (joints.some(j => j.includes("Scapular Symmetry"))) {
            recs.push("Periscapular strengthening (serratus anterior punches, rows, wall slides) to address scapular asymmetry/winging.");
        }
        if (joints.some(j => j.includes("Trunk Symmetry"))) {
            recs.push("Lateral core stabilization (side planks, oblique work) and postural mirror feedback to correct trunk lean/lateral shift.");
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
        if (joints.some(j => j.includes("Ankle/Malleolar"))) {
            recs.push("Foot/ankle alignment drills (short-foot exercises, single-leg balance work) and orthotic/footwear assessment for asymmetric pronation or leg-length discrepancy.");
        }
        if (joints.some(j => j.includes("Sagittal"))) {
            recs.push("Postural retraining (chin tucks, thoracic extension, hip flexor stretching) to correct sagittal-plane trunk/pelvis alignment.");
        }
        recs.push("Re-assess all four views after 4-6 weeks of corrective intervention to track progress objectively.");

        return recs.slice(0, 7);
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

            // 3. Calculate Trunk Tilt (forward lean from vertical, measured in
            // the depth plane since the patient faces the camera -- see
            // calculateForwardLeanAngle above for why x/y was wrong here)
            const lTrunkAngle = calculateForwardLeanAngle(lShoulder, lHip);
            const rTrunkAngle = calculateForwardLeanAngle(rShoulder, rHip);
            const avgTrunkAngle = parseFloat(((lTrunkAngle + rTrunkAngle) / 2).toFixed(1));

            // 4. Calculate Ankle Dorsiflexion (Knee-Ankle-Foot)
            // Note: If foot index is unavailable, we estimate relative to floor vertical
            const lAnkleAngle = calculateAngle(lKnee, lAnkle, lFoot);
            const rAnkleAngle = calculateAngle(rKnee, rAnkle, rFoot);
            // Left/Right Symmetry Check
            const kneeSymmetryDev = Math.abs(lKneeAngle - rKneeAngle);
            const hipSymmetryDev = Math.abs(lHipAngle - rHipAngle);
            const symmetryScore = Math.max(0, 100 - (kneeSymmetryDev * 2.5 + hipSymmetryDev * 2));

            // Squat depth evaluation -- driven directly by knee flexion angle
            // rather than raw hip/knee/ankle screen-space (y) positions. The
            // previous y-position heuristic assumed hip-to-knee and
            // knee-to-ankle image distances were comparable, but that ratio
            // shifts with camera distance/angle and body proportions, so it
            // frequently read as "Squatting" even while the patient was just
            // standing still, which meant angle checks matched the target
            // range on stance alone instead of on an actual squat. Knee angle
            // (hip-knee-ankle) is camera-framing independent: ~170-180°
            // standing, ~90° at a parallel squat, so depth now tracks the
            // live angle itself instead of a proxy for it.
            const avgKneeAngleForDepth = (lKneeAngle + rKneeAngle) / 2;
            const STAND_KNEE_ANGLE = 175; // fully extended standing knee
            const SQUAT_KNEE_ANGLE = 90;  // parallel-squat reference knee angle

            let depthPct = ((STAND_KNEE_ANGLE - avgKneeAngleForDepth) / (STAND_KNEE_ANGLE - SQUAT_KNEE_ANGLE)) * 100;
            depthPct = Math.max(0, Math.min(120, parseFloat(depthPct.toFixed(1))));

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

            const checkDeviation = (name, side, val, standards, category) => {
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
                    category: category || name,
                    joint: name,
                    side: side,
                    angle: val,               // currently measured angle
                    fixed: standards.refRange, // fixed/normal reference angle range
                    reference: standards.refRange,
                    deviation: parseFloat(diff.toFixed(1)),
                    status: status
                };
            };

            if (isSquatting) {
                // Assessment standards during SQUAT
                // Ordered per requested report sequence: Head/Neck, Shoulder, Trunk, Hip, Knee, Ankle, Heel
                // (Head/Neck, Shoulder, Heel are not computed in this module, so only Trunk/Hip/Knee/Ankle appear)
                detailedDevs.push(checkDeviation("Trunk Lean", "Center", angles.avgTrunk, REFERENCE_STANDARDS.trunk, "Trunk Lean"));
                detailedDevs.push(checkDeviation("Hip Flexion", "Left", angles.leftHip, REFERENCE_STANDARDS.hip, "Hip"));
                detailedDevs.push(checkDeviation("Hip Flexion", "Right", angles.rightHip, REFERENCE_STANDARDS.hip, "Hip"));
                detailedDevs.push(checkDeviation("Knee Flexion", "Left", angles.leftKnee, REFERENCE_STANDARDS.knee, "Knee"));
                detailedDevs.push(checkDeviation("Knee Flexion", "Right", angles.rightKnee, REFERENCE_STANDARDS.knee, "Knee"));

                // Ankle flexion is optional but good
                if (angles.leftAnkle > 0) {
                    detailedDevs.push(checkDeviation("Ankle Alignment", "Left", angles.leftAnkle, REFERENCE_STANDARDS.ankle, "Ankle"));
                    detailedDevs.push(checkDeviation("Ankle Alignment", "Right", angles.rightAnkle, REFERENCE_STANDARDS.ankle, "Ankle"));
                }
            } else {
                // Assessment standards during STANDING posture (different reference angles;
                // widened warningThreshold for the same Module 1 sensitivity tuning as above)
                const standKneeStd = { name: "Knee Standing", refRange: "165° - 180°", minNormal: 165, maxNormal: 180, warningThreshold: 16 };
                const standTrunkStd = { name: "Trunk Standing", refRange: "0° - 10°", minNormal: 0, maxNormal: 10, warningThreshold: 16 };

                // Ordered per requested report sequence: Trunk before Knee
                detailedDevs.push(checkDeviation("Trunk Lean", "Center", angles.avgTrunk, standTrunkStd, "Trunk Lean"));
                detailedDevs.push(checkDeviation("Knee Flexion", "Left", angles.leftKnee, standKneeStd, "Knee"));
                detailedDevs.push(checkDeviation("Knee Flexion", "Right", angles.rightKnee, standKneeStd, "Knee"));
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

            // Compute Overall Risk Category (Module 1 only)
            // Instead of letting a single flagged joint escalate the entire
            // result to "Significant Deviation", we average the status of
            // every individual measurement (Normal=0, Mild=1, Significant=2)
            // so the overall label reflects the balance of all joints checked.
            const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
            const statusScores = detailedDevs.map(d => PF_STATUS_SCORE[d.status] ?? 0);
            const avgStatusScore = statusScores.length > 0
                ? statusScores.reduce((sum, s) => sum + s, 0) / statusScores.length
                : 0;

            let overallStatus = "Normal";
            if (avgStatusScore >= 1.5) {
                overallStatus = "Significant Deviation";
            } else if (avgStatusScore >= 0.5) {
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
                    // Thresholds pulled live from REFERENCE_STANDARDS.knee (Module 1)
                    // instead of hardcoded numbers, so this stays correct if the
                    // clinical range is ever retuned.
                    if (kneeDev.angle > REFERENCE_STANDARDS.knee.maxNormal) {
                        remarks.push("Knee flexion is reduced (squat depth is too shallow), which may indicate quadriceps tightness, ankle mobility restriction (limited dorsiflexion), or fear of movement.");
                    } else if (kneeDev.angle < REFERENCE_STANDARDS.knee.minNormal) {
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
        // --- BPT1 (Module 1): Posterior/Right Lateral/Left Lateral static evaluator ---
        evaluateModule1StaticViews: evaluateModule1StaticViews,
        generatePostureInterpretation: generatePostureInterpretation,
        generatePostureRecommendations: generatePostureRecommendations,
        // Exposed so the UI (app.js) can read the exact clinical bounds directly
        // for overlay color-coding/labels instead of duplicating the numbers --
        // this is the single source of truth for Module 1's squat standards.
        standards: REFERENCE_STANDARDS,
        // Module 1's widened static-posture standards (Posterior/Lateral views).
        module1StaticStandards: MODULE1_STATIC_STANDARDS
    };

    window.PF_Pose = PF_Pose;
})();
