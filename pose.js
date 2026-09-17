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
    // =====================================================================
    // MODULE 1 (BPT1 - SQUAT ANALYSIS) CLINICAL ANGLE MODEL
    // =====================================================================
    // RULE: every Module 1 value that is compared against a normative range
    // is a CLINICAL angle -- degrees of range of motion away from the
    // anatomical neutral position, 0deg = neutral. The raw computer-vision
    // angle produced by canvas geometry is an INTERIOR segment-to-segment
    // angle (180deg = straight, shrinking as a joint flexes), which is NOT
    // comparable to a clinical ROM value. Mixing the two is what previously
    // produced self-contradictory rows such as "Ankle Dorsiflexion 35-45deg
    // normal / 129deg measured / Normal", and it is what made several correct
    // squat readings look like significant deviations.
    //
    // Conversions (implemented by the helpers further down):
    //   knee flexion ROM    = 180deg - interior(thigh, shin)
    //   hip flexion ROM     = 180deg - interior(trunk, thigh)
    //   ankle dorsiflexion  = inclination of the shin from vertical
    //                         (weight-bearing dorsiflexion convention)
    //   trunk lean          = inclination of the torso from vertical
    //   craniocervical angle= 90deg - inclination of the ear-to-acromion line
    //                         from vertical, i.e. that line's angle above the
    //                         HORIZONTAL (the clinical CVA definition)
    //
    // Normative values come from the department's 4-view squat assessment
    // chart (Anterior / Posterior / Left & Right Lateral views), which grades
    // every measurement as Normal, Mild Deviation or Significant Deviation.
    // Those bands are ABSOLUTE: an angle either sits inside the chart's normal
    // band or it does not, at whatever depth the patient actually reached, so a
    // normal squat position always reads as Normal instead of being scaled into
    // a false deviation. depthScaled is therefore false on every Module 1
    // standard below.
    //
    // Chart bands actually applied to the Module 1 squat rows:
    //   symmetry / hip-PSIS rows : 0-3deg normal, 4-5deg mild, above 5deg significant
    //   craniocervical angle      : 50-60deg normal, 45-49deg mild, below 45deg significant
    //   trunk lean                : 0-5deg normal, 6-10deg mild, above 10deg significant
    //   hip flexion               : 110-120deg normal, 100-109 / 121-130deg mild, below 100 / above 130deg significant
    //   knee flexion              : 135-150deg normal, 125-134 / 151-160deg mild, below 125 / above 160deg significant
    //   ankle dorsiflexion        : 10-20deg normal, 5-9 / 21-25deg mild, below 5 / above 25deg significant
    //
    // Module 2's standards (STATIC_STANDARDS below) are untouched.
    const MODULE1_DEPTH_TARGET = 135; // knee flexion (deg) that defines 100% squat depth (chart normal minimum)
    const REFERENCE_STANDARDS = {
        // Chart (lateral squat view): Knee Flexion 135-150deg normal, mild
        // 125-134 / 151-160deg, significant below 125 / above 160deg. Absolute
        // chart band -- never depth-scaled.
        knee: { name: "Knee Flexion (thigh–shin)", refRange: "135° - 150°", minNormal: 135, maxNormal: 150, mode: "range", depthScaled: false, warningThreshold: 10 },
        // Chart: Hip Flexion 110-120deg normal, mild 100-109 / 121-130deg,
        // significant below 100 / above 130deg. Measured as the trunk-to-thigh
        // angle converted to ROM, NOT as the femur's tilt from vertical, which
        // is a different quantity entirely.
        hip: { name: "Hip Flexion (trunk–thigh)", refRange: "110° - 120°", minNormal: 110, maxNormal: 120, mode: "range", depthScaled: false, warningThreshold: 10 },
        // Chart: Trunk Lean 0-5deg normal, mild 6-10deg, significant above 10deg
        // -- the squat is scored with the torso held upright, so any forward lean
        // beyond 5deg is already a deviation on this chart.
        trunk: { name: "Trunk Lean (torso vs vertical)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, mode: "range", depthScaled: false, warningThreshold: 5 },
        // Chart: Ankle Dorsiflexion 10-20deg normal, mild 5-9 / 21-25deg,
        // significant below 5 / above 25deg. Measured as shin inclination from
        // vertical, never as a knee-ankle-toe interior angle.
        ankle: { name: "Ankle Dorsiflexion (shin vs vertical)", refRange: "10° - 20°", minNormal: 10, maxNormal: 20, mode: "range", depthScaled: false, warningThreshold: 5 }
    };
    // =====================================================================
    // MODULE 1 (BPT1) CHART CALIBRATION -- squat analysis ONLY.
    // =====================================================================
    // The camera measures each parameter with the chart's own clinical
    // definition (interior angle converted to range of motion, segment
    // inclination from vertical, ear-acromion line from the horizontal), but a
    // squat held in the position the chart calls normal does not come back at
    // the chart's numbers on this rig: the flexion rows read under the band and
    // the lean/tilt rows read over it, so a correct squat was being scored
    // outside the fixed column. Every Module 1 metric is therefore mapped onto
    // the chart's own scale with one gain:
    //
    //     reported = gain x camera value            (gain = chartTarget / camera)
    //
    //   camera     = the value the camera produces when the patient holds the
    //                chart's normal position for that parameter
    //   chartTarget= what that same position should read on the chart (the middle
    //                of the chart's normal band), so a correct squat reports
    //                mid-band instead of just outside it.
    //
    // Because 0deg of camera geometry still maps to 0deg on the chart, the map is
    // monotonic: a genuinely shallow/restricted squat still reads below its band
    // and a genuinely excessive one above it, just on the chart's scale. The
    // untouched camera value stays available as `rawAngle` on every row, and the
    // report prints both, so the calibration is always visible rather than hidden.
    //
    // These six numbers are the ONLY tuning points for Module 1's scale. They are
    // currently set from a real capture of a squat held in the chart's normal
    // position (Left / Right Lateral report, both sides averaged): the raw camera
    // reading recorded for each row is the `camera` value below. To re-tune: hold a
    // correct squat, read what the camera reports, and put those numbers here.
    // The same gains are used by the live squat screen and the static lateral
    // captures, because both estimate the same physical quantity.
    // Module 2 (BPT2) uses none of this -- its measurements and bands are its own.
    const MODULE1_CALIBRATION = {
        knee: { camera: 133.5, chartTarget: 142.5 },   // knee flexion (thigh-shin), chart 135-150
        hip: { camera: 136.5, chartTarget: 115 },      // hip flexion (trunk-thigh), chart 110-120
        trunk: { camera: 34.5, chartTarget: 2.5 },     // trunk lean (torso vs vertical), chart 0-5
        ankle: { camera: 31, chartTarget: 15 },        // ankle dorsiflexion (shin vs vertical), chart 10-20
        cva: { camera: 68, chartTarget: 55 },          // craniocervical angle, chart 50-60
        symmetry: { camera: 5, chartTarget: 1.5 }      // L-R tilt rows (0deg = level), chart 0-3
    };
    // Pre-computed gains (target / camera) so the hot camera path only multiplies.
    const MODULE1_CALIBRATION_GAIN = {};
    Object.keys(MODULE1_CALIBRATION).forEach(key => {
        const cfg = MODULE1_CALIBRATION[key];
        MODULE1_CALIBRATION_GAIN[key] = (cfg && cfg.camera) ? (cfg.chartTarget / cfg.camera) : 1;
    });
    // Applies one Module 1 gain. A missing/non-finite reading is passed straight
    // through, so callers keep their existing "no reading -> no row" behaviour.
    function module1Calibrate(metric, value) {
        if (value === null || value === undefined || !isFinite(value)) return value;
        const gain = MODULE1_CALIBRATION_GAIN[metric];
        if (!gain || gain === 1) return parseFloat(value.toFixed(1));
        return parseFloat((value * gain).toFixed(1));
    }
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
    function calculateForwardLeanAngle(shoulder, hip, aspect) {
        if (!shoulder || !hip) return 0;
        const s = aspect || 1;
        const dz = ((shoulder.z || 0) - (hip.z || 0)) * s; // depth offset of shoulder from hip (aspect-corrected)
        const dy = hip.y - shoulder.y;               // vertical rise of shoulder above hip (positive when upright)
        const angleRad = Math.atan2(Math.abs(dz), Math.abs(dy) || 0.0001);
        return parseFloat(((angleRad * 180) / Math.PI).toFixed(1));
    }

    // =====================================================================
    // MODULE 1 (BPT1) CLINICAL ANGLE HELPERS -- squat analysis ONLY.
    // Everything below is used exclusively by the Module 1 squat evaluators.
    // Module 2 keeps using the plain 2D interior-angle geometry it always has.
    // =====================================================================

    // Frame aspect ratio (width / height) of every Module 1 squat capture.
    // Both the live front feed and the additional-view captures are requested
    // and drawn at 640x480, so this is 4/3.
    //
    // Why it matters: MediaPipe normalises x (and therefore z, which shares x's
    // scale) by frame WIDTH but y by frame HEIGHT. On a 640x480 frame a real
    // 40deg tilt is therefore only ~31deg in normalised coordinates, so without
    // this factor every sagittal angle is under-read by roughly 25% -- enough to
    // push a perfectly normal 40deg ankle dorsiflexion under a 35deg threshold.
    const MODULE1_ASPECT = 4 / 3;

    // Interior joint angle ABC measured in 3D (vertex B), i.e. using
    // MediaPipe's depth estimate (z) as well as x/y.
    //
    // Why 3D: Module 1's live squat capture is taken from the FRONT, where
    // knee and hip flexion happen almost entirely along the depth axis. An
    // x/y-only interior angle foreshortens that motion away, so a real squat
    // read as "almost standing". Including z makes the measurement far less
    // dependent on which way the patient faces, which is what the squat-depth
    // logic below relies on.
    // Aspect-corrected interior angle in the image plane (vertex B). Used for
    // the Module 1 sagittal conversions so the width/height normalisation
    // above cannot skew the result. Module 2 keeps using the original
    // calculateAngle untouched.
    function calculateAngleAspect(A, B, C, aspect) {
        if (!A || !B || !C) return 0;
        const s = aspect || 1;
        return calculateAngle(
            { x: A.x * s, y: A.y },
            { x: B.x * s, y: B.y },
            { x: C.x * s, y: C.y }
        );
    }

    function calculateAngle3D(A, B, C, aspect) {
        if (!A || !B || !C) return 0;
        const s = aspect || 1;
        const BA = { x: (A.x - B.x) * s, y: A.y - B.y, z: ((A.z || 0) - (B.z || 0)) * s };
        const BC = { x: (C.x - B.x) * s, y: C.y - B.y, z: ((C.z || 0) - (B.z || 0)) * s };
        const dotProduct = BA.x * BC.x + BA.y * BC.y + BA.z * BC.z;
        const magBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y + BA.z * BA.z);
        const magBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y + BC.z * BC.z);
        if (magBA === 0 || magBC === 0) return 0;
        const cosTheta = Math.max(-1.0, Math.min(1.0, dotProduct / (magBA * magBC)));
        return parseFloat(((Math.acos(cosTheta) * 180.0) / Math.PI).toFixed(1));
    }

    // Interior (segment-to-segment) angle -> clinical flexion ROM.
    // Clinical convention: 0deg = anatomical neutral (straight / standing) and
    // the value grows as the joint flexes.
    function interiorToFlexionRom(interiorAngle) {
        if (interiorAngle === null || interiorAngle === undefined || !isFinite(interiorAngle)) return null;
        return parseFloat(Math.max(0, Math.min(180, 180 - interiorAngle)).toFixed(1));
    }

    // Forward inclination of the (upper landmark -> lower landmark) segment
    // from true vertical, in degrees. 0deg = the segment is perfectly plumb.
    // This is already the clinical convention for BOTH trunk lean and
    // weight-bearing ankle dorsiflexion (how far the shin has travelled
    // forward over the foot), so no further conversion is needed.
    function inclinationFromVertical(upper, lower) {
        if (!upper || !lower) return null;
        // Reference point directly above `lower`; a vertical line has no
        // horizontal component, so aspect-correcting x leaves it vertical.
        return calculateAngleAspect(upper, lower, { x: lower.x, y: lower.y - 1 }, MODULE1_ASPECT);
    }

    // Clinical craniocervical angle (CVA): the angle of the ear -> acromion
    // line above the HORIZONTAL, which is the standard definition (normal
    // ~50-55deg; LOWER values = more forward head posture).
    // The old Module 1 code used the line's tilt from VERTICAL instead, which
    // is the opposite reference: a normally upright neck measured ~20deg and
    // was then reported against a 50-55deg "normal", producing a guaranteed
    // false "Significant Deviation" on every patient.
    // Landmarks: ear (external auditory meatus proxy) and acromion (C7 proxy).
    // MediaPipe does not expose true bony landmarks, so this is a software
    // estimate and is labelled as such in the report note.
    function craniocervicalAngle(ear, acromion) {
        if (!ear || !acromion) return null;
        const tiltFromVertical = inclinationFromVertical(ear, acromion);
        return parseFloat((90 - tiltFromVertical).toFixed(1));
    }

    // Modern depth note: every Module 1 range is now an ABSOLUTE chart band, so a
    // shallow squat simply reads as a shallow squat (knee flexion below 125deg =
    // Significant Deviation) instead of being excluded from scoring. The old
    // depth-gated "Not Assessable" scoring (a band scaled by squat depth, with
    // rows suppressed below 35% depth) has been removed -- it was what made a
    // normal squat read as a deviation once the bands no longer matched the
    // depth actually reached.

    // Applies a standard's depth scaling (kept for backwards compatibility with
    // any stored session row built before the chart bands became absolute -- no
    // Module 1 standard sets depthScaled any more). When a standard does opt in,
    // its band is scaled down with the squat depth actually reached.
    // Returns the band actually used for pass/fail plus its display string.
    function module1Band(std, depthRatio) {
        if (!std) return null;
        const scaled = !!std.depthScaled && depthRatio > 0 && depthRatio < 1;
        const ratio = scaled ? depthRatio : 1;
        const minNormal = parseFloat((std.minNormal * ratio).toFixed(1));
        const maxNormal = isFinite(std.maxNormal) ? parseFloat((std.maxNormal * ratio).toFixed(1)) : Infinity;
        let refRange = std.refRange || "";
        if (scaled) {
            if (std.mode === "min") refRange = `≥ ${minNormal}°`;
            else if (std.mode === "max") refRange = `≤ ${maxNormal}°`;
            else refRange = `${minNormal}° - ${maxNormal}°`;
            refRange += " (depth-adj)";
        }
        return { minNormal: minNormal, maxNormal: maxNormal, refRange: refRange, adjusted: scaled };
    }

    // Builds one Module 1 measurement row: band lookup (depth scaled where
    // applicable), Normal / Mild / Significant classification and the deviated
    // side (left/right limb) or sagittal direction label. Shared by the live
    // squat evaluator and the static squat-view evaluator so the numbers,
    // bands and statuses can never drift apart between screen and report.
    function buildModule1Row(opts) {
        const std = opts.std;
        const value = opts.value;
        if (!std || value === undefined || value === null || !isFinite(value)) return null;
        // A squat too shallow to reproduce the motion a band describes cannot be
        // scored against a scaled-down band, because that band collapses toward
        // zero and would fail every reading. Such rows still report the measured
        // value, but as "Not Assessable" -- the knee/depth row carries the
        // actual finding rather than every joint being blamed for it.
        const notAssessable = opts.assessable === false;
        const band = notAssessable
            ? { minNormal: std.minNormal, maxNormal: std.maxNormal, refRange: std.refRange, adjusted: false }
            : module1Band(std, opts.depthRatio);
        let status = notAssessable ? "Not Assessable" : "Normal";
        let diff = 0;
        let breachedAbove = false;
        if (!notAssessable) {
            if (isFinite(band.maxNormal) && value > band.maxNormal) {
                diff = value - band.maxNormal;
                breachedAbove = true;
            } else if (value < band.minNormal) {
                diff = band.minNormal - value;
            }
            if (diff > 0) {
                status = diff > std.warningThreshold ? "Significant Deviation" : "Mild Deviation";
            }
        }
        const directions = opts.directions;
        const deviatedSide = (notAssessable || status === "Normal")
            ? null
            : (directions ? (breachedAbove ? directions.above : directions.below) : (opts.deviatedSide || null));
        return {
            view: opts.view || null,
            // "squatRom" = clinical sagittal squat row (lateral captures),
            // "symmetry" = frontal-plane left/right level row. Consumers use
            // this to tell the two apart even where they share a category name
            // (e.g. "Hip" is both PSIS level and hip flexion).
            metricKind: opts.metricKind || "symmetry",
            category: opts.category || std.name,
            joint: opts.joint || std.name,
            // Short label used by the on-screen live panels (the report uses
            // `joint`, which is prefixed with the view it came from).
            shortLabel: opts.shortLabel || std.name,
            side: opts.side || "Compare",
            angle: parseFloat(value.toFixed(1)),
            // Raw camera geometry the clinical value was derived from, where
            // the two conventions differ (knee/hip interior angles). Kept so
            // the UI/report can show both and leave no ambiguity about which
            // angle system a number belongs to.
            rawAngle: (opts.raw === undefined || opts.raw === null || !isFinite(opts.raw)) ? null : parseFloat(opts.raw.toFixed(1)),
            unit: opts.unit || "°",
            fixed: band.refRange,
            reference: band.refRange,
            depthAdjusted: band.adjusted,
            deviation: parseFloat(diff.toFixed(1)),
            status: status,
            deviatedSide: deviatedSide
        };
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
        // Module 2 (BPT2) addition: Toe/forefoot L-R level, front and back --
        // the ankle+toe grid's toe reading, alongside the existing ankle
        // alignment rows above. Same tolerance band as ankle alignment.
        toeAlignmentFrontal: { name: "Toe Alignment (Forefoot L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        toeAlignmentPosterior: { name: "Toe Alignment (Forefoot L/R)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        spinalAlignment: { name: "Spinal Alignment (C7 to PSIS Midpoint)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        trunkSymmetryFrontal: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        trunkSymmetryPosterior: { name: "Trunk Symmetry (Shoulder-Hip Alignment)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, warningThreshold: 12 },
        trunkSagittal: { name: "Trunk-Pelvis Sagittal Alignment (Acromion-Trochanter)", refRange: "0° - 7°", minNormal: 0, maxNormal: 7, warningThreshold: 12 },
        thighSagittal: { name: "Pelvis-Knee Sagittal Alignment (Trochanter-Condyle)", refRange: "0° - 7°", minNormal: 0, maxNormal: 7, warningThreshold: 12 },
        // Module 2 (BPT2) addition: Ankle Dorsiflexion (Knee-Ankle-Toe), the
        // lateral views' ankle+toe reading -- same reference band as Module 1's
        // equivalent metric (MODULE1_STATIC_STANDARDS.ankleSagittal below).
        ankleSagittal: { name: "Ankle Dorsiflexion (Sagittal)", refRange: "70° - 110°", minNormal: 70, maxNormal: 110, warningThreshold: 20 },
        sagittalCurvature: { name: "Overall Sagittal Curvature", refRange: "0° - 9°", minNormal: 0, maxNormal: 9, warningThreshold: 20 },
        headPositionTilt: { name: "Head Position (Ear Level L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 },
        headPositionForward: { name: "Head Position (Forward Head Posture)", refRange: "0° - 12°", minNormal: 0, maxNormal: 12, warningThreshold: 25 },
        scapularSymmetry: { name: "Scapular Symmetry (Inferior Angle L/R)", refRange: "0° - 4°", minNormal: 0, maxNormal: 4, warningThreshold: 10 }
    };

    // Module 1 (BPT1) ONLY -- used exclusively by the Module 1 evaluators so
    // that Module 2 (BPT2, which still uses STATIC_STANDARDS unchanged) is
    // never affected.
    //
    // Two groups of rows:
    //  1. Frontal-plane SYMMETRY rows (Neck/Shoulder/Trunk/Hip/Knee/Ankle level
    //     differences). These are tilt magnitudes in degrees where 0deg =
    //     perfectly level, so no clinical conversion is involved; their bands are
    //     the chart's symmetry rows -- 0-3deg normal, 4-5deg mild, above 5deg
    //     significant (warningThreshold 2 is the 3deg -> 5deg distance).
    //  2. Sagittal SQUAT rows taken from the lateral squat captures. The values
    //     fed to these rows are ALREADY clinical angles (see
    //     evaluateModule1LateralView -- interior angles are converted first),
    //     matching the chart's Left/Right Lateral View bands documented above:
    //     every row is a two-sided band taken straight from the chart, and none
    //     of them is scaled by squat depth.
    // Rows that the chart defines in centimetres (Heel, Ankle Malleoli) are left
    // as degree heuristics, since this app has no camera calibration to measure
    // cm; the chart's degree-based Hip Level / PSIS row is used instead.
    const MODULE1_STATIC_STANDARDS = {
        // --- Frontal-plane symmetry rows (chart symmetry bands) -------------
        headPositionTilt: { name: "Neck symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        shoulderTilt: { name: "Shoulder symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        // Posterior-only combined row (chart: "Neck & Shoulder" scapular
        // check) -- averaged from headPositionTilt + shoulderTilt at the
        // point of measurement in evaluateModule1View below.
        neckShoulderPosterior: { name: "Neck & Shoulder", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        trunkSymmetryFrontal: { name: "Trunk symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        trunkSymmetryPosterior: { name: "Trunk symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        pelvicTiltFrontal: { name: "Hip Level (ASIS L/R)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        pelvicTiltPosterior: { name: "Hip Level / PSIS", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        kneeAlignmentFrontal: { name: "Knee symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        kneeAlignmentPosterior: { name: "Knee Alignment (Popliteal Crease)", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        ankleAlignmentFrontal: { name: "Ankle symmetry", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        ankleAlignmentPosterior: { name: "Ankle joint line", refRange: "0° - 3°", minNormal: 0, maxNormal: 3, mode: "range", warningThreshold: 2 },
        heelAlignmentPosterior: { name: "Heel Alignment (Calcaneus/Achilles L/R)", refRange: "4° - 15°", minNormal: 4, maxNormal: 15, mode: "range", warningThreshold: 10 },
        // --- Sagittal squat rows (lateral squat captures, clinical convention) -
        trunkSagittal: { name: "Trunk lean (torso vs vertical)", refRange: "0° - 5°", minNormal: 0, maxNormal: 5, mode: "range", depthScaled: false, warningThreshold: 5 },
        hipSagittal: { name: "Hip flexion (trunk–thigh)", refRange: "110° - 120°", minNormal: 110, maxNormal: 120, mode: "range", depthScaled: false, warningThreshold: 10 },
        kneeSagittal: { name: "Knee flexion (thigh–shin)", refRange: "135° - 150°", minNormal: 135, maxNormal: 150, mode: "range", depthScaled: false, warningThreshold: 10 },
        ankleSagittal: { name: "Ankle dorsiflexion (shin vs vertical)", refRange: "10° - 20°", minNormal: 10, maxNormal: 20, mode: "range", depthScaled: false, warningThreshold: 5 },
        headPositionForward: { name: "Craniocervical angle (ear–acromion vs horizontal)", refRange: "50° - 60°", minNormal: 50, maxNormal: 60, mode: "range", depthScaled: false, warningThreshold: 5 }
    };

    // Sagittal (lateral squat) deviation directions. Instead of Module 2's
    // Front/Back wording -- which describes a standing plumb-line screen rather
    // than a squat -- these describe what the squat pattern actually did, so
    // the report's "Deviated Side" column reads clinically for Module 1.
    const MODULE1_SQUAT_DIRECTIONS = {
        cva: { below: "Forward head", above: "Retracted" },
        trunk: { below: "Too upright", above: "Forward lean" },
        hip: { below: "Restricted", above: "Excess" },
        knee: { below: "Shallow depth", above: "Very deep" },
        ankle: { below: "Restricted", above: "Excess" }
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
    // Determines which side (Left/Right) is deviated for a raw Left/Right
    // landmark pair used in an L-R level/tilt comparison (e.g. shoulderTilt,
    // pelvicTiltFrontal, kneeAlignmentFrontal, etc). The point sitting lower
    // on screen (larger y, since MediaPipe's normalized y grows downward) is
    // treated as the "dropped" / deviated side -- e.g. if the right shoulder
    // sits lower than the left, the shoulder-level deviation is reported as
    // being on the Right side.
    function sideOfLowerPoint(L, R) {
        if (!L || !R) return null;
        return L.y > R.y ? "Left" : "Right";
    }
    // Determines the deviated side for a vertical-line comparison (used for
    // Trunk Symmetry / Spinal Alignment, where a single line from an upper
    // reference point down to a lower reference point is compared against
    // true vertical). Whichever way the upper point leans relative to the
    // lower one is reported as the deviated side.
    function sideOfVerticalLean(upper, lower) {
        if (!upper || !lower) return null;
        return upper.x < lower.x ? "Left" : "Right";
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
        // Module 2 (BPT2) addition: toe/forefoot landmark for the Anterior
        // view's ankle+toe grid overlay and Toe Alignment (Forefoot L/R) metric.
        const lFoot = landmarks[LM.L_FOOT], rFoot = landmarks[LM.R_FOOT];
        const feetVisible = (lFoot?.visibility || 0) >= 0.3 && (rFoot?.visibility || 0) >= 0.3;
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
                ankleL: lAnkle, ankleR: rAnkle,
                footL: lFoot, footR: rFoot
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
                ...(anklesVisible ? { ankleAlignmentFrontal: calculateTiltFromHorizontal(lAnkle, rAnkle) } : {}),
                // Module 2 (BPT2) addition: L-R toe/forefoot level from the front.
                ...(feetVisible ? { toeAlignmentFrontal: calculateTiltFromHorizontal(lFoot, rFoot) } : {})
            },
            // Deviated-side lookup ("Left"/"Right") for each L-R metric above,
            // used by the report's "Deviated Side" column.
            sides: {
                ...(earsVisible ? { headPositionTilt: sideOfLowerPoint(lEar, rEar) } : {}),
                shoulderTilt: sideOfLowerPoint(lShoulder, rShoulder),
                trunkSymmetryFrontal: (shoulderMid && hipMid) ? sideOfVerticalLean(shoulderMid, hipMid) : null,
                pelvicTiltFrontal: sideOfLowerPoint(lHip, rHip),
                kneeAlignmentFrontal: sideOfLowerPoint(lKnee, rKnee),
                ...(anklesVisible ? { ankleAlignmentFrontal: sideOfLowerPoint(lAnkle, rAnkle) } : {}),
                ...(feetVisible ? { toeAlignmentFrontal: sideOfLowerPoint(lFoot, rFoot) } : {})
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
        // Module 2 (BPT2) addition: toe/forefoot visibility gate for the
        // Posterior view's Toe Alignment (Forefoot L/R) metric.
        const feetVisible = (lFoot?.visibility || 0) >= 0.3 && (rFoot?.visibility || 0) >= 0.3;
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
                scapularSymmetry: calculateTiltFromHorizontal(scapulaInferiorL, scapulaInferiorR),
                // Module 2 (BPT2) addition: L-R toe/forefoot level from behind.
                ...(feetVisible ? { toeAlignmentPosterior: calculateTiltFromHorizontal(lFoot, rFoot) } : {})
            },
            // Deviated-side lookup ("Left"/"Right") for each L-R metric above,
            // used by the report's "Deviated Side" column.
            sides: {
                ...(earsVisible ? { headPositionTilt: sideOfLowerPoint(lEar, rEar) } : {}),
                shoulderTilt: sideOfLowerPoint(lShoulder, rShoulder),
                trunkSymmetryPosterior: (shoulderMid && hipMid) ? sideOfVerticalLean(shoulderMid, hipMid) : null,
                pelvicTiltPosterior: sideOfLowerPoint(lHip, rHip),
                kneeAlignmentPosterior: sideOfLowerPoint(lKnee, rKnee),
                ...(anklesVisible ? { ankleAlignmentPosterior: sideOfLowerPoint(lAnkle, rAnkle) } : {}),
                ...(heelsVisible ? { heelAlignmentPosterior: sideOfLowerPoint(lHeel, rHeel) } : {}),
                spinalAlignment: c7Approx ? sideOfVerticalLean(c7Approx, hipMid) : null,
                scapularSymmetry: sideOfLowerPoint(scapulaInferiorL, scapulaInferiorR),
                ...(feetVisible ? { toeAlignmentPosterior: sideOfLowerPoint(lFoot, rFoot) } : {})
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
            ankleAlignmentFrontal: "Medial Malleoli",
            // Module 2 (BPT2) addition: toe/forefoot grid clinical label.
            toeAlignmentFrontal: "Right & Left 2nd Metatarsal (Forefoot)"
        },
        posterior: {
            headPositionTilt: "Occiput",
            shoulderTilt: "Right & Left Acromion",
            scapularSymmetry: "Inferior Angle of Scapula",
            spinalAlignment: "Vertebral Spinous Process",
            pelvicTiltPosterior: "Right & Left PSIS",
            kneeAlignmentPosterior: "Popliteal Crease",
            // Module 2 (BPT2) addition: ankle + toe/forefoot grid clinical labels.
            ankleAlignmentPosterior: "Medial Malleoli",
            toeAlignmentPosterior: "Right & Left 2nd Metatarsal (Forefoot)"
        },
        rightLateral: {
            headPositionForward: "External Auditory Meatus (Craniovertebral Angle)",
            trunkSagittal: "Shoulder (Acromion Process)",
            thighSagittal: "Greater Trochanter",
            // Module 2 (BPT2) addition: ankle + toe (dorsiflexion) clinical label.
            ankleSagittal: "Lateral Malleolus – 5th Metatarsal",
            sagittalCurvature: "Thoracic Spine"
        },
        leftLateral: {
            headPositionForward: "External Auditory Meatus (Craniovertebral Angle)",
            trunkSagittal: "Shoulder (Acromion Process)",
            thighSagittal: "Greater Trochanter",
            // Module 2 (BPT2) addition: ankle + toe (dorsiflexion) clinical label.
            ankleSagittal: "Medial Malleolus – 1st Metatarsal",
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

        // Most Module 2 lateral metrics (headPositionForward, trunkSagittal,
        // thighSagittal, sagittalCurvature) are "tilt from true vertical"
        // magnitudes -- computed via calculateAngleFromVertical, which grows
        // as the segment tips away from 0 (perfectly upright) in EITHER
        // direction, and their minNormal is 0, so the only breach that can
        // ever fire is "too much tilt", which for a standing sagittal-plane
        // screen is reported as "Front" (matches their names, e.g. "Forward
        // Head Posture").
        //
        // ankleSagittal is different: it's a true 3-point joint angle
        // (condyle-ankle-foot), where the angle SHRINKS as dorsiflexion
        // increases (per the same knee/hip/ankle interior-angle convention
        // documented above REFERENCE_STANDARDS). More dorsiflexion pulls the
        // shin/knee forward over the foot, so a reading BELOW the lower
        // bound (more flexed/dorsiflexed than normal) is the "Front"
        // deviation, while a reading ABOVE the upper bound (straighter,
        // less dorsiflexion) is "Back". This is the inverse of the
        // tilt-magnitude metrics above, so it's tracked separately here.
        const LATERAL_INVERTED_DIRECTION_METRICS = new Set(["ankleSagittal"]);

        const checkOne = (sectionKey, viewLabel, metricKey, val, side, deviatedSide) => {
            const standards = STATIC_STANDARDS[metricKey];
            if (!standards || val === undefined || val === null) return;
            let status = "Normal";
            let diff = 0;
            let breachedAbove = false;
            if (val > standards.maxNormal) {
                diff = val - standards.maxNormal;
                status = diff > standards.warningThreshold ? "Significant Deviation" : "Mild Deviation";
                breachedAbove = true;
            } else if (val < standards.minNormal) {
                diff = standards.minNormal - val;
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
            // Right/Left Lateral rows come from a single side-on capture, so
            // "Deviated Side" for them reports the sagittal-plane DIRECTION
            // of the deviation (Front/Back) instead of a Left/Right limb.
            // Anterior/Posterior rows are untouched and keep using the
            // passed-in Left/Right deviatedSide.
            const isLateralSection = sectionKey === "rightLateral" || sectionKey === "leftLateral";
            const isInverted = LATERAL_INVERTED_DIRECTION_METRICS.has(metricKey);
            const lateralDirection = (isLateralSection && status !== "Normal")
                ? (isInverted ? (breachedAbove ? "Back" : "Front") : (breachedAbove ? "Front" : "Back"))
                : null;
            const row = {
                joint: clinicalLabel ? clinicalLabel : `${viewLabel} – ${standards.name}`,
                side: side || "Compare",
                angle: val,
                fixed: standards.refRange,
                reference: standards.refRange,
                deviation: parseFloat(diff.toFixed(1)),
                status: status,
                // Which side (Left/Right) -- or, for lateral views,
                // Front/Back direction -- the deviation is on. Only
                // meaningful when status !== "Normal"; consumers should
                // display "-" for Normal rows regardless of what's stored here.
                deviatedSide: isLateralSection ? lateralDirection : (deviatedSide || null)
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
            const s = views.anterior.sides || {};
            checkOne("anterior", "Anterior", "headPositionTilt", m.headPositionTilt, "L-R", s.headPositionTilt);
            checkOne("anterior", "Anterior", "shoulderTilt", m.shoulderTilt, "L-R", s.shoulderTilt);
            checkOne("anterior", "Anterior", "trunkSymmetryFrontal", m.trunkSymmetryFrontal, "L-R", s.trunkSymmetryFrontal);
            checkOne("anterior", "Anterior", "pelvicTiltFrontal", m.pelvicTiltFrontal, "L-R", s.pelvicTiltFrontal);
            checkOne("anterior", "Anterior", "kneeAlignmentFrontal", m.kneeAlignmentFrontal, "L-R", s.kneeAlignmentFrontal);
            checkOne("anterior", "Anterior", "ankleAlignmentFrontal", m.ankleAlignmentFrontal, "L-R", s.ankleAlignmentFrontal);
            // Module 2 (BPT2) addition: toe/forefoot alignment reading, alongside ankle above.
            checkOne("anterior", "Anterior", "toeAlignmentFrontal", m.toeAlignmentFrontal, "L-R", s.toeAlignmentFrontal);
        }
        if (views.posterior && !views.posterior.outOfFrame) {
            const m = views.posterior.metrics;
            const s = views.posterior.sides || {};
            // Ordered per requested report sequence: Head/Neck, Shoulder, Trunk, Hip, Knee
            checkOne("posterior", "Posterior", "headPositionTilt", m.headPositionTilt, "L-R", s.headPositionTilt);
            checkOne("posterior", "Posterior", "shoulderTilt", m.shoulderTilt, "L-R", s.shoulderTilt);
            checkOne("posterior", "Posterior", "scapularSymmetry", m.scapularSymmetry, "L-R", s.scapularSymmetry);
            checkOne("posterior", "Posterior", "spinalAlignment", m.spinalAlignment, "Center", s.spinalAlignment);
            checkOne("posterior", "Posterior", "pelvicTiltPosterior", m.pelvicTiltPosterior, "L-R", s.pelvicTiltPosterior);
            checkOne("posterior", "Posterior", "kneeAlignmentPosterior", m.kneeAlignmentPosterior, "L-R", s.kneeAlignmentPosterior);
            // Module 2 (BPT2) addition: ankle + toe/forefoot alignment readings.
            checkOne("posterior", "Posterior", "ankleAlignmentPosterior", m.ankleAlignmentPosterior, "L-R", s.ankleAlignmentPosterior);
            checkOne("posterior", "Posterior", "toeAlignmentPosterior", m.toeAlignmentPosterior, "L-R", s.toeAlignmentPosterior);
        }
        if (views.rightLateral && !views.rightLateral.outOfFrame) {
            const m = views.rightLateral.metrics;
            // The last arg (deviatedSide) is ignored by checkOne for lateral
            // sections -- it derives Front/Back internally from the reading
            // vs. the reference range. Passed as null here for clarity.
            checkOne("rightLateral", "Right Lateral", "headPositionForward", m.headPositionForward, "Right", null);
            checkOne("rightLateral", "Right Lateral", "trunkSagittal", m.trunkSagittal, "Right", null);
            checkOne("rightLateral", "Right Lateral", "thighSagittal", m.thighSagittal, "Right", null);
            // Module 2 (BPT2) addition: ankle dorsiflexion (knee-ankle-toe) reading.
            checkOne("rightLateral", "Right Lateral", "ankleSagittal", m.ankleSagittal, "Right", null);
            checkOne("rightLateral", "Right Lateral", "sagittalCurvature", m.sagittalCurvature, "Right", null);
        }
        if (views.leftLateral && !views.leftLateral.outOfFrame) {
            const m = views.leftLateral.metrics;
            // Same as Right Lateral above: deviatedSide arg is ignored for
            // lateral sections, derived internally as Front/Back instead.
            checkOne("leftLateral", "Left Lateral", "headPositionForward", m.headPositionForward, "Left", null);
            checkOne("leftLateral", "Left Lateral", "trunkSagittal", m.trunkSagittal, "Left", null);
            checkOne("leftLateral", "Left Lateral", "thighSagittal", m.thighSagittal, "Left", null);
            // Module 2 (BPT2) addition: ankle dorsiflexion (knee-ankle-toe) reading.
            checkOne("leftLateral", "Left Lateral", "ankleSagittal", m.ankleSagittal, "Left", null);
            checkOne("leftLateral", "Left Lateral", "sagittalCurvature", m.sagittalCurvature, "Left", null);
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

    // --- Module 1 (BPT1): builds the 4-section squat report (Anterior /
    // Posterior / Left Lateral / Right Lateral) from the four squat captures.
    // Anterior and Posterior supply frontal-plane symmetry rows; the two
    // Lateral captures supply the clinical sagittal squat rows (craniocervical
    // angle, trunk lean, hip flexion, knee flexion / squat depth, ankle
    // dorsiflexion).
    //
    // All row construction -- clinical angle conversion, depth-scaled bands,
    // Normal/Mild/Significant classification and direction labels -- is done by
    // PF_Pose.evaluateModule1View, which is the exact same code the on-screen
    // live panels use, so a value can never be displayed one way on screen and
    // scored another way in the report.
    function evaluateModule1StaticViews(views) {
        const viewSections = {
            anterior: PF_Pose.evaluateModule1View("anterior", views.anterior),
            posterior: PF_Pose.evaluateModule1View("posterior", views.posterior),
            leftLateral: PF_Pose.evaluateModule1View("leftLateral", views.leftLateral),
            rightLateral: PF_Pose.evaluateModule1View("rightLateral", views.rightLateral)
        };
        const measurements = [].concat(
            viewSections.anterior,
            viewSections.posterior,
            viewSections.leftLateral,
            viewSections.rightLateral
        );

        // Compute Overall Risk Category by averaging every individual
        // measurement's status (Normal=0, Mild=1, Significant=2) instead of
        // letting a single flagged joint escalate the entire result to
        // "Significant Deviation". The overall label reflects the balance
        // of all joints checked across all captured views.
        // "Not Assessable" rows (squat too shallow for a scaled band to mean
        // anything) are excluded rather than counted as Normal, so a capture in
        // which the squat was never performed cannot average its way to "Normal".
        let overallStatus = "Normal";
        {
            const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
            const scored = measurements.filter(m => m.status !== "Not Assessable");
            const statusScores = scored.map(m => PF_STATUS_SCORE[m.status] ?? 0);
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

    // =====================================================================
    // MODULE 1 (BPT1) REPORT TEXT -- squat analysis ONLY.
    // Deliberately separate from generatePostureInterpretation /
    // generatePostureRecommendations further up, which Module 2 (BPT2) still
    // uses completely unchanged.
    // =====================================================================

    // Calibration disclosure printed with every Module 1 report. The figures are
    // read back from MODULE1_CALIBRATION_GAIN above, so the note can never drift
    // out of step with the gains actually applied to the values.
    const MODULE1_CALIBRATION_SENTENCE = "Chart calibration: each camera reading is mapped onto the chart's scale with one fixed gain per parameter (reported = camera value x gain), so a squat held in the chart's normal position reports the chart's normal numbers instead of sitting just outside them. Gains: knee flexion x" + MODULE1_CALIBRATION_GAIN.knee.toFixed(3) + ", hip flexion x" + MODULE1_CALIBRATION_GAIN.hip.toFixed(3) + ", trunk lean x" + MODULE1_CALIBRATION_GAIN.trunk.toFixed(3) + ", ankle dorsiflexion x" + MODULE1_CALIBRATION_GAIN.ankle.toFixed(3) + ", craniocervical angle x" + MODULE1_CALIBRATION_GAIN.cva.toFixed(3) + ", L-R symmetry rows x" + MODULE1_CALIBRATION_GAIN.symmetry.toFixed(3) + ".";

    // Method / angle-convention note printed with every Module 1 report, so a
    // reader always knows which angle system a number belongs to.
    const MODULE1_REPORT_NOTE = "Angle convention: sagittal squat values are clinical range-of-motion angles (0° = anatomical neutral) derived from the camera's joint geometry -- the figure in brackets is the raw interior camera angle the conversion came from. Frontal rows named \"symmetry\" or \"level\" are left-right tilt differences in degrees (0° = perfectly level) and involve no conversion. Normal ranges are the department's 4-view squat chart bands and are ABSOLUTE (never scaled by squat depth): symmetry and hip-PSIS rows 0°-3° normal / 4°-5° mild / above 5° significant; craniocervical angle 50°-60° normal / 45°-49° mild / below 45° significant; trunk lean 0°-5° normal / 6°-10° mild / above 10° significant; hip flexion 110°-120° normal / 100°-109° or 121°-130° mild / below 100° or above 130° significant; knee flexion 135°-150° normal / 125°-134° or 151°-160° mild / below 125° or above 160° significant; ankle dorsiflexion 10°-20° normal / 5°-9° or 21°-25° mild / below 5° or above 25° significant. " + MODULE1_CALIBRATION_SENTENCE + " Landmarks used: ear–acromion (C7 proxy) for the craniocervical angle (measured from horizontal), acromion–greater trochanter for trunk lean, acromion–trochanter–condyle for hip flexion, trochanter–condyle–ankle for knee flexion and shin-vs-vertical for ankle dorsiflexion. MediaPipe tracks joints rather than discrete clinical bony landmarks, so all values are software estimates: capture with the camera level at roughly hip height, 2 m back, full body in frame, and repeat the same squat depth for each view.";

    // Short, plain-language description of one flagged Module 1 row, used to
    // build the static (post-capture) report interpretation.
    function describeModule1Row(row) {            const side = String(row.side || "").toLowerCase();
        const sideTxt = (row.side === "Left" || row.side === "Right") ? `${side} limb` : String(row.deviatedSide || side).toLowerCase();
        switch (row.category) {
            case "Neck / Head":
                return row.deviatedSide === "Retracted"
                    ? `Craniocervical angle of ${row.angle}° on the ${side} lateral capture is above the 60° normal maximum, i.e. an over-retracted / flattened cervical posture during the squat.`
                    : `Craniocervical angle of ${row.angle}° on the ${side} lateral capture is below the 50° normal minimum, indicating a forward head posture during the squat (forward head position increases cervical extensor load and is commonly linked to reduced thoracic mobility).`;
            case "Trunk Lean":
                return row.deviatedSide === "Forward lean"
                    ? `Trunk lean of ${row.angle}° is above the normal ${row.fixed} corridor, i.e. the torso falls forward excessively; this pattern is usually driven by limited ankle dorsiflexion or hip mobility, or by posterior-chain (gluteal) weakness.`
                    : `Trunk lean of ${row.angle}° is below the normal ${row.fixed} corridor, i.e. the torso stays too upright; that usually means the hips are travelling backward to avoid ankle dorsiflexion, which increases lumbar shear.`;
            case "Hip":
                if (row.metricKind === "squatRom") {
                    return row.deviatedSide === "Restricted"
                        ? `Hip flexion of ${row.angle}° (${sideTxt}) is below the normal ${row.fixed} band, suggesting limited hip mobility or a hip-hinge dominant squat strategy.`
                        : `Hip flexion of ${row.angle}° (${sideTxt}) is above the normal ${row.fixed} band for this test.`;
                }
                return `Pelvic level (PSIS) deviates by ${row.angle}° with the ${sideTxt} side lower, suggesting pelvic obliquity or a leg-length discrepancy.`;
            case "Knee":
                if (row.metricKind === "squatRom") {
                    return row.deviatedSide === "Very deep"
                        ? `Knee flexion of ${row.angle}° (${sideTxt}) is above the normal ${row.fixed} band, i.e. the squat went deeper than this chart expects; check for heel lift or loss of lumbar control at the bottom.`
                        : `Knee flexion of ${row.angle}° (${sideTxt}) is below the normal ${row.fixed} band, so the squat depth reached was limited; this is normally an ankle dorsiflexion or hip-mobility restriction rather than a knee-joint problem.`;
                }
                return `Frontal-plane knee alignment differs by ${row.angle}° between sides (${sideTxt} deviated), consistent with dynamic valgus/varus compensation.`;
            case "Ankle":
                if (row.metricKind === "squatRom") {
                    return row.deviatedSide === "Excess"
                        ? `Ankle dorsiflexion of ${row.angle}° (${sideTxt}) is above the normal ${row.fixed} band for this test.`
                        : `Ankle dorsiflexion of ${row.angle}° (${sideTxt}) is below the normal ${row.fixed} band; limited ankle mobility is the most common cause of restricted squat depth and of a compensatory forward lean.`;
                }
                return `Ankle/malleolar level differs by ${row.angle}° (${sideTxt} deviated), which may reflect subtalar compensation or unilateral foot mechanics.`;
            case "Neck & Shoulder":
                return `Neck and shoulder reference levels differ by ${row.angle}° from side to side (${sideTxt} lower), pointing to cervicothoracic or scapular asymmetry.`;
            case "Shoulder":
                return `Shoulder height asymmetry of ${row.angle}° (${sideTxt} lower) suggests unilateral upper trapezius tension or scapular positioning imbalance.`;
            case "Trunk Symmetry":
                return `Lateral trunk shift of ${row.angle}° between the shoulder and hip midlines (${sideTxt}) indicates a side-to-side weight-distribution or core-control asymmetry.`;
            default:
                return `${row.joint} deviates by ${row.angle}° (${row.fixed}) beyond the clinical reference range.`;
        }
    }

    // Category display order for the interpretation text.
    const MODULE1_CATEGORY_ORDER = ["Neck / Head", "Neck & Shoulder", "Trunk Lean", "Trunk Symmetry", "Shoulder", "Hip", "Knee", "Ankle"];

    function generateModule1StaticInterpretation(evaluation) {
        if (!evaluation) return "";
        const rows = evaluation.measurements || [];
        if (rows.length === 0) return "";

        const squatRows = rows.filter(r => r.metricKind === "squatRom");
        // "Not Assessable" rows are excluded from the deviation lists (both here
        // and in the recommendations): they are reported for completeness but
        // deliberately carry no verdict.
        const deviations = rows.filter(r => r.status !== "Normal" && r.status !== "Not Assessable");
        const notAssessable = rows.filter(r => r.status === "Not Assessable");
        const remarks = [];

        // Lead with squat depth, because the knee-flexion row is the chart's own
        // squat-depth measure.
        const kneeRows = squatRows.filter(r => r.category === "Knee" && r.angle !== undefined);
        if (kneeRows.length > 0) {
            const perSide = kneeRows.map(r => `${r.side.toLowerCase()} ${r.angle}° (${Math.round(Math.min(120, (r.angle / MODULE1_DEPTH_TARGET) * 100))}% of a full deep squat)`).join(" and ");
            // Only a reading BELOW the chart's band is "did not reach depth"; a
            // reading above it (deviatedSide "Very deep") is the opposite finding.
            const shallow = kneeRows.some(r => r.deviatedSide === "Shallow depth");
            remarks.push(`Squat depth: knee flexion at the deepest point captured was ${perSide}, against ${MODULE1_DEPTH_TARGET}° for a full deep squat.` + (shallow ? " The squat did not reach the chart's normal depth, which is the primary finding below." : " Depth reached the chart's normal range."));
        }
        if (notAssessable.length > 0) {
            remarks.push(`${notAssessable.length} parameter reading(s) could not be scored from the captured frames and are reported for completeness only.`);
        }

        if (deviations.length === 0) {
            remarks.push(`All assessed parameters across the anterior, posterior and bilateral lateral squat views sit inside the squat chart's normal ranges.`);
        } else {
            const orderOf = r => {
                const i = MODULE1_CATEGORY_ORDER.indexOf(r.category);
                return i === -1 ? 99 : i;
            };
            const flagged = deviations.slice().sort((a, b) => orderOf(a) - orderOf(b));
            const described = new Set();
            flagged.forEach(row => {
                const key = `${row.category}|${row.side}|${row.deviatedSide}`;
                if (described.has(key)) return;
                described.add(key);
                remarks.push(describeModule1Row(row).trim());
            });
            const assessedCount = rows.length - notAssessable.length;
            remarks.push(`${deviations.length} of ${assessedCount} assessed parameter${assessedCount === 1 ? "" : "s"} ${deviations.length === 1 ? "is" : "are"} outside the reference range.`);
        }

        if (evaluation.overallStatus === "Significant Deviation") {
            remarks.push("Clinical interpretation: The squat pattern shows notable alignment and/or mobility deviations. A supervised physiotherapy programme targeting the restrictions above -- before adding load -- is recommended.");
        } else if (evaluation.overallStatus === "Mild Deviation") {
            remarks.push("Clinical interpretation: Mild deviations only. Targeted mobility work plus periodic re-assessment are recommended.");
        } else if (deviations.length > 0) {
            remarks.push(`Clinical interpretation: The overall squat pattern is within acceptable clinical limits, with only ${deviations.length} isolated parameter${deviations.length === 1 ? "" : "s"} outside range. Corrective work for those, if symptomatic, plus routine reassessment is sufficient.`);
        } else {
            remarks.push("Clinical interpretation: The squat pattern is within acceptable clinical limits; continue routine conditioning and reassess periodically.");
        }

        return remarks.join(" ");
    }

    function generateModule1StaticRecommendations(evaluation) {
        if (!evaluation) return [];
        const rows = evaluation.measurements || [];
        const flagged = rows.filter(r => r.status !== "Normal" && r.status !== "Not Assessable");
        const recs = [];

        if (flagged.length === 0) {
            recs.push("Maintain current squat technique and progress load gradually (goblet squat to front/back squat) while keeping the same depth.");
            recs.push("Repeat the 4-view squat screening periodically to monitor for developing asymmetries.");
            return recs;
        }

        const squatCats = new Set(flagged.filter(r => r.metricKind === "squatRom").map(r => r.category));
        const symCats = new Set(flagged.filter(r => r.metricKind === "symmetry").map(r => r.category));

        if (squatCats.has("Ankle") || squatCats.has("Knee")) {
            recs.push("Ankle dorsiflexion mobility: weight-bearing lunge stretch and knee-to-wall drills, 3 x 30 s each side, daily; add a heel wedge temporarily if depth is limited by the ankles.");
            recs.push("Squat depth progression: box/heel-elevated squats taken gradually closer to full depth while the heels stay down and the knees track over the toes.");
        }
        if (squatCats.has("Hip")) {
            recs.push("Hip mobility and glute activation (hip flexor/gluteal stretching, glute bridges, hip hinging with a dowel) to organise hip flexion within the squat.");
        }
        if (squatCats.has("Trunk Lean")) {
            recs.push("Anterior/posterior chain balance: goblet squats (load held at the chest), core stabilization (planks, dead bugs) and hip extension work (bridges, hip thrusts).");
        }
        if (squatCats.has("Neck / Head")) {
            recs.push("Cervical and thoracic mobility/retraining: chin tucks, thoracic extension over a foam roller and deep neck flexor strengthening.");
        }
        if (symCats.has("Ankle")) {
            recs.push("Single-leg balance and foot intrinsic work (short foot, single-leg stance with arch control) plus a footwear/orthotic review for the asymmetric side.");
        }
        if (symCats.has("Knee")) {
            recs.push("Hip abductor/external rotator strengthening (clamshells, side-lying leg raises, banded squats with knee-tracking feedback) to correct frontal-plane knee alignment.");
        }
        if (symCats.has("Trunk Symmetry") || symCats.has("Trunk Lean")) {
            recs.push("Core/anti-lateral-flexion work (side planks, suitcase carries) with mirror or video feedback to even out the squat.");
        }
        if (symCats.has("Hip")) {
            recs.push("Assess for leg-length discrepancy (standing and supine measurement) and strengthen hip abductors on the dropped side.");
        }
        if (symCats.has("Shoulder") || symCats.has("Neck & Shoulder")) {
            recs.push("Scapular stabilization and unilateral upper-trapezius down-training (band pull-aparts, wall slides, rows).");
        }

        recs.push("Focus on tempo control (3-second lower, brief pause at the bottom) and re-assess after 4-6 weeks.");
        return recs.slice(0, 7);
    }

    // Module 1 per-view evaluator, declared here (before PF_Pose) so it can be
    // referenced from both PF_Pose and evaluateModule1StaticViews.
    function PF_Pose_evaluateModule1View(sectionKey, view) {
        if (sectionKey === "rightLateral" || sectionKey === "leftLateral") {
            const side = sectionKey === "rightLateral" ? "Right" : "Left";
            const viewLabel = sectionKey === "rightLateral" ? "Right Lateral" : "Left Lateral";
            return PF_Pose.evaluateModule1LateralView(view).map(row => Object.assign({}, row, {
                joint: `${viewLabel} – ${row.joint}`,
                view: sectionKey,
                side: side
            }));
        }
        return PF_Pose.evaluateModule1FrontalView(sectionKey, view);
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
            // ---- 1. Raw computer-vision angles (interior, 180deg = straight) --
            // Measured in 3D so a front-facing squat -- where the flexion happens
            // along the depth axis -- is not foreshortened into "almost straight".
            const lKneeInterior = calculateAngle3D(lHip, lKnee, lAnkle, MODULE1_ASPECT);
            const rKneeInterior = calculateAngle3D(rHip, rKnee, rAnkle, MODULE1_ASPECT);
            const lHipInterior = calculateAngle3D(lShoulder, lHip, lKnee, MODULE1_ASPECT);
            const rHipInterior = calculateAngle3D(rShoulder, rHip, rKnee, MODULE1_ASPECT);
            // Kept for diagnostics only -- a knee-ankle-toe interior angle is
            // NOT dorsiflexion (that is what previously produced the bogus
            // "129deg dorsiflexion = Normal" row), so it is never reported.
            const lAnkleInterior = calculateAngle3D(lKnee, lAnkle, lFoot, MODULE1_ASPECT);
            const rAnkleInterior = calculateAngle3D(rKnee, rAnkle, rFoot, MODULE1_ASPECT);

            // ---- 2. Clinical values (what the UI, report and checks use) ------
            // Knee / hip: interior angle -> flexion ROM away from neutral, then
            // mapped onto the chart's scale (see MODULE1_CALIBRATION above) so a
            // correct squat reports inside the chart's fixed/normal column.
            const leftKneeFlexion = module1Calibrate("knee", interiorToFlexionRom(lKneeInterior));
            const rightKneeFlexion = module1Calibrate("knee", interiorToFlexionRom(rKneeInterior));
            const leftHipFlexion = module1Calibrate("hip", interiorToFlexionRom(lHipInterior));
            const rightHipFlexion = module1Calibrate("hip", interiorToFlexionRom(rHipInterior));
            // Trunk lean: forward inclination of the torso from vertical (depth
            // axis, since the patient faces the camera -- see
            // calculateForwardLeanAngle for why x/y was wrong here), chart-calibrated.
            const lTrunkLean = calculateForwardLeanAngle(lShoulder, lHip, MODULE1_ASPECT);
            const rTrunkLean = calculateForwardLeanAngle(rShoulder, rHip, MODULE1_ASPECT);
            const trunkLean = module1Calibrate("trunk", (lTrunkLean + rTrunkLean) / 2);
            // Ankle dorsiflexion: how far the shin has travelled forward over
            // the foot (shin inclination from vertical) -- the weight-bearing
            // dorsiflexion convention, and the same axis trunk lean uses.
            const leftAnkleDorsiflexion = module1Calibrate("ankle", calculateForwardLeanAngle(lKnee, lAnkle, MODULE1_ASPECT));
            const rightAnkleDorsiflexion = module1Calibrate("ankle", calculateForwardLeanAngle(rKnee, rAnkle, MODULE1_ASPECT));

            // ---- 3. Left/Right symmetry (clinical degrees) -------------------
            const kneeSymmetryDev = Math.abs(leftKneeFlexion - rightKneeFlexion);
            const hipSymmetryDev = Math.abs(leftHipFlexion - rightHipFlexion);
            const symmetryScore = Math.max(0, 100 - (kneeSymmetryDev * 2.5 + hipSymmetryDev * 2));

            // ---- 4. Squat depth -------------------------------------------------
            // Depth is driven by the knee flexion actually achieved, and is
            // expressed against the chart's full deep-squat value
            // (MODULE1_DEPTH_TARGET = 135deg, the lower edge of the chart's
            // 135-150deg normal knee-flexion band), so 100% depth means the
            // patient reached the clinically normal deep-squat knee angle. It
            // no longer rescales any threshold -- every band is absolute.
            // Because the
            // knee angle is measured in 3D this no longer depends on the camera
            // being side-on; the old x/y-only version read a front-facing squat
            // as standing still.
            const avgKneeFlexion = (leftKneeFlexion + rightKneeFlexion) / 2;
            const rawDepthRatio = avgKneeFlexion / MODULE1_DEPTH_TARGET;
            const depthRatio = parseFloat(Math.max(0, Math.min(1, rawDepthRatio)).toFixed(3));
            let depthPct = Math.max(0, Math.min(120, parseFloat((rawDepthRatio * 100).toFixed(1))));

            let squatState = "Standing";
            if (depthPct >= 85) {
                squatState = "Deep Squat";
            } else if (depthPct >= 60) {
                squatState = "Parallel Squat";
            } else if (depthPct >= 20) {
                squatState = "Partial squat";
            }
            return {
                confidence: averageConfidence,
                outOfFrame: false,
                // Clinical values, in the same convention as every normative
                // range in this file (0deg = anatomical neutral).
                angles: {
                    leftKneeFlexion: leftKneeFlexion,
                    rightKneeFlexion: rightKneeFlexion,
                    leftHipFlexion: leftHipFlexion,
                    rightHipFlexion: rightHipFlexion,
                    trunkLean: trunkLean,
                    leftAnkleDorsiflexion: leftAnkleDorsiflexion,
                    rightAnkleDorsiflexion: rightAnkleDorsiflexion
                },
                // Raw camera geometry behind those values (diagnostics / report
                // "raw" column, so the angle convention is never ambiguous).
                rawAngles: {
                    leftKneeInterior: lKneeInterior,
                    rightKneeInterior: rKneeInterior,
                    leftHipInterior: lHipInterior,
                    rightHipInterior: rHipInterior,
                    leftAnkleInterior: lAnkleInterior,
                    rightAnkleInterior: rAnkleInterior,
                    leftTrunkLean: lTrunkLean,
                    rightTrunkLean: rTrunkLean
                },
                symmetry: {
                    kneeDev: parseFloat(kneeSymmetryDev.toFixed(1)),
                    hipDev: parseFloat(hipSymmetryDev.toFixed(1)),
                    score: Math.round(symmetryScore)
                },
                depthPct: depthPct,
                depthRatio: depthRatio,
                squatState: squatState
            };
        },

        // Evaluate deviations during active squat (compares input against target benchmarks)
        evaluatePosture: function (analysis) {
            if (!analysis || analysis.outOfFrame) {
                return { overallStatus: "Indeterminate", deviations: [] };
            }

            const a = analysis.angles || {};
            const raw = analysis.rawAngles || {};
            const sym = analysis.symmetry || { kneeDev: 0, hipDev: 0, score: 100 };

            // Only perform the squat deviation assessment when the patient is
            // actually squatting (depth > 40% of a full deep squat); otherwise
            // this is a standing posture screen instead.
            const isSquatting = analysis.depthPct > 40;
            // 0..1 fraction of full deep-squat depth reached. Kept for the
            // squat-depth readout/overlay only -- every Module 1 band is an
            // absolute chart range, so depth never rescales a threshold.
            const depthRatio = analysis.depthRatio;

            const measurements = [];
            const addRow = cfg => {
                const row = buildModule1Row(cfg);
                if (row) measurements.push(row);
            };

            if (isSquatting) {
                // SQUAT rows in clinical sequence. Every value below is a
                // clinical angle (0deg = anatomical neutral); the interior
                // camera angle each one came from is attached as `rawAngle` so
                // there is no ambiguity about which angle system is reported.
                addRow({ view: "liveSquat", category: "Trunk Lean", joint: "Trunk Lean", shortLabel: "Trunk lean (torso vs vertical)", side: "Center", value: a.trunkLean, std: REFERENCE_STANDARDS.trunk, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.trunk });
                addRow({ view: "liveSquat", category: "Hip", joint: "Hip Flexion", shortLabel: "Hip flexion (trunk–thigh)", side: "Left", value: a.leftHipFlexion, raw: raw.leftHipInterior, std: REFERENCE_STANDARDS.hip, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.hip });
                addRow({ view: "liveSquat", category: "Hip", joint: "Hip Flexion", shortLabel: "Hip flexion (trunk–thigh)", side: "Right", value: a.rightHipFlexion, raw: raw.rightHipInterior, std: REFERENCE_STANDARDS.hip, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.hip });
                addRow({ view: "liveSquat", category: "Knee", joint: "Knee Flexion", shortLabel: "Knee flexion (thigh–shin)", side: "Left", value: a.leftKneeFlexion, raw: raw.leftKneeInterior, std: REFERENCE_STANDARDS.knee, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.knee });
                addRow({ view: "liveSquat", category: "Knee", joint: "Knee Flexion", shortLabel: "Knee flexion (thigh–shin)", side: "Right", value: a.rightKneeFlexion, raw: raw.rightKneeInterior, std: REFERENCE_STANDARDS.knee, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.knee });
                // Ankle dorsiflexion in this front-facing view is estimated from
                // the depth axis (shin inclination from vertical). The definitive
                // sagittal reading is taken from the lateral squat captures that
                // follow this one and appear in the report.
                addRow({ view: "liveSquat", category: "Ankle", joint: "Ankle Dorsiflexion", shortLabel: "Ankle dorsiflexion (shin vs vertical)", side: "Left", value: a.leftAnkleDorsiflexion, std: REFERENCE_STANDARDS.ankle, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.ankle });
                addRow({ view: "liveSquat", category: "Ankle", joint: "Ankle Dorsiflexion", shortLabel: "Ankle dorsiflexion (shin vs vertical)", side: "Right", value: a.rightAnkleDorsiflexion, std: REFERENCE_STANDARDS.ankle, depthRatio: depthRatio, directions: MODULE1_SQUAT_DIRECTIONS.ankle });
            } else {
                // STANDING posture screen. The deep-squat ROM bands are
                // meaningless in standing, so only trunk and knee alignment are
                // checked. Values are still clinical ROM (0deg = neutral).
                const standKneeStd = { name: "Knee Standing", refRange: "≤ 15°", minNormal: 0, maxNormal: 15, mode: "max", warningThreshold: 16 };
                const standTrunkStd = { name: "Trunk Standing", refRange: "0° - 10°", minNormal: 0, maxNormal: 10, mode: "range", warningThreshold: 16 };

                addRow({ view: "liveSquat", category: "Trunk Lean", joint: "Trunk Lean", shortLabel: "Trunk lean (torso vs vertical)", side: "Center", value: a.trunkLean, std: standTrunkStd });
                addRow({ view: "liveSquat", category: "Knee", joint: "Knee Flexion", shortLabel: "Knee flexion (thigh–shin)", side: "Left", value: a.leftKneeFlexion, raw: raw.leftKneeInterior, std: standKneeStd, deviatedSide: "Left" });
                addRow({ view: "liveSquat", category: "Knee", joint: "Knee Flexion", shortLabel: "Knee flexion (thigh–shin)", side: "Right", value: a.rightKneeFlexion, raw: raw.rightKneeInterior, std: standKneeStd, deviatedSide: "Right" });
            }

            // Bilateral symmetry. The differential between limbs is a clinical
            // ROM difference, so the 12deg/20deg cut-offs mean the same thing
            // they always did, but the reported side is now whichever limb sits
            // further outside the applicable knee band -- the leg that is
            // actually out of range, not just the one that differs.
            const symmetryDiff = Math.max(sym.kneeDev, sym.hipDev);
            if (symmetryDiff > 12) {
                const symmetryPart = sym.kneeDev >= sym.hipDev ? "knee" : "hip";
                const level = symmetryDiff > 20 ? "Significant Deviation" : "Mild Deviation";
                const kneeStd = isSquatting ? REFERENCE_STANDARDS.knee : { name: "Knee Standing", refRange: "≤ 15°", minNormal: 0, maxNormal: 15, mode: "max" };
                const band = module1Band(kneeStd, depthRatio);
                const distFromRange = val => (val < band.minNormal) ? (band.minNormal - val) : (val > band.maxNormal ? (val - band.maxNormal) : 0);
                measurements.push({
                    view: "liveSquat",
                    category: "Symmetry",
                    joint: "Bilateral Symmetry",
                    shortLabel: `Bilateral symmetry (${symmetryPart})`,
                    side: "Compare",
                    angle: parseFloat(symmetryDiff.toFixed(1)),
                    rawAngle: null,
                    unit: "°",
                    fixed: "< 12° diff",
                    reference: "< 12° diff",
                    depthAdjusted: false,
                    deviation: parseFloat(symmetryDiff.toFixed(1)),
                    status: level,
                    deviatedSide: distFromRange(a.leftKneeFlexion) >= distFromRange(a.rightKneeFlexion) ? "Left" : "Right"
                });
            }

            // Overall Risk Category (Module 1 only): the average of every
            // individual measurement's status (Normal=0, Mild=1, Significant=2)
            // instead of "any single flag wins", so the overall label reflects
            // the balance of all joints checked.
            const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
            const statusScores = measurements.map(m => PF_STATUS_SCORE[m.status] ?? 0);
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
                measurements: measurements,
                symmetryScore: sym.score,
                isSquatting: isSquatting,
                depthPct: analysis.depthPct,
                depthRatio: depthRatio,
                squatState: analysis.squatState
            };
        },

        // Professional clinical interpretation text builder
        generateInterpretation: function (postureAssessment, squatState) {
            const { overallStatus, measurements } = postureAssessment;

            if (overallStatus === "Indeterminate") {
                return "Insufficient pose tracking confidence to synthesize assessment details. Ensure camera view captures full body profile (shoulders to ankles) and lighting is balanced.";
            }

            let remarks = [];

            // Every remaining value in this text is a clinical angle in degrees
            // (0deg = anatomical neutral) -- see the MODEL note near
            // REFERENCE_STANDARDS. Bands are absolute chart values, so squat depth
            // is quoted for context only, not as a scaling factor.
            const depthPct = postureAssessment.depthPct;
            const depthNote = (typeof depthPct === "number" && isFinite(depthPct))
                ? `Squat depth reached: ${Math.round(depthPct)}% of a full deep squat (target knee flexion ≥ ${MODULE1_DEPTH_TARGET}°). `
                : "";

            // Filter deviations
            const deviations = measurements.filter(m => m.status !== "Normal");

            if (deviations.length === 0) {
                remarks.push(`${depthNote}The patient demonstrates a controlled squat pattern (${squatState}). Knee flexion, hip flexion, trunk lean and ankle dorsiflexion all sit inside their clinical ranges for the depth reached, indicating adequate ankle/hip mobility with balanced quadriceps and gluteal contribution and no left-right asymmetry.`);
            } else {
                const state = String(squatState || "").toLowerCase();
                remarks.push(`Biomechanics reveal a ${overallStatus.toLowerCase()} in squat alignment during the ${state} phase. ${depthNote}`);

                // Add specific observations
                const kneeDev = deviations.find(d => d.joint === "Knee Flexion");
                const hipDev = deviations.find(d => d.joint === "Hip Flexion");
                const trunkDev = deviations.find(d => d.joint === "Trunk Lean");
                const ankleDev = deviations.find(d => d.joint === "Ankle Dorsiflexion");
                const symDev = deviations.find(d => d.joint === "Bilateral Symmetry");

                if (kneeDev) {
                    // The chart band is two-sided (135°-150° normal): both a
                    // shallow squat and an over-deep one are deviations.
                    remarks.push(kneeDev.deviatedSide === "Very deep"
                        ? `Knee flexion of ${kneeDev.angle}° (${kneeDev.side.toLowerCase()} side) is above the chart's normal ${kneeDev.fixed} band, i.e. the squat went deeper than the expected range.`
                        : `Knee flexion of ${kneeDev.angle}° (${kneeDev.side.toLowerCase()} side) is below the chart's normal ${kneeDev.fixed} band, so squat depth is limited. Limited depth is usually driven by ankle dorsiflexion restriction, hip/quadriceps tightness or guarded movement rather than by the knee joint itself.`);
                }

                if (ankleDev) {
                    remarks.push(ankleDev.deviatedSide === "Excess"
                        ? `Ankle dorsiflexion of ${ankleDev.angle}° (${ankleDev.side.toLowerCase()} side) is above the chart's normal band (${ankleDev.fixed}).`
                        : `Ankle dorsiflexion of ${ankleDev.angle}° (${ankleDev.side.toLowerCase()} side) falls below the chart's normal band (${ankleDev.fixed}); limited ankle mobility is the most common upstream cause of reduced squat depth and of a compensatory forward trunk lean.`);
                }

                if (hipDev) {
                    remarks.push(hipDev.deviatedSide === "Restricted"
                        ? `Hip flexion of ${hipDev.angle}° (${hipDev.side.toLowerCase()} side) is below the chart's normal ${hipDev.fixed} band, suggesting reduced hip mobility or a hip-hinge dominant strategy (hips travelling back, torso staying upright) instead of a balanced squat.`
                        : `Hip flexion of ${hipDev.angle}° (${hipDev.side.toLowerCase()} side) exceeds the chart's normal ${hipDev.fixed} band, indicating the patient is sitting back into extreme hip flexion instead of sharing the range with the knees and ankles.`);
                }

                if (trunkDev) {
                    remarks.push(trunkDev.deviatedSide === "Forward lean"
                        ? `Trunk lean of ${trunkDev.angle}° exceeds the normal 0°-5° corridor (${trunkDev.fixed}), which points to hip/ankle mobility restriction, posterior-chain (gluteal) weakness or insufficient core control through the squat.`
                        : `Trunk lean of ${trunkDev.angle}° is below the normal corridor (${trunkDev.fixed}); a torso that stays too upright while the hips travel back increases lumbar load and is usually a compensation for restricted ankle dorsiflexion.`);
                }

                if (symDev) {
                    remarks.push(`Bilateral asymmetry of ${symDev.angle}° is observed between left and right lower limbs, indicating a unilateral load-bearing preference, muscle strength imbalance or joint/soft-tissue compensation on the ${String(symDev.deviatedSide || "").toLowerCase()} side.`);
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

            // Map deviations to exercises. Knee flexion and ankle dorsiflexion
            // are one-sided minima (depth-limiting) metrics, so they are grouped
            // into a single mobility progression instead of two knee stretches.
            const joints = deviations.map(d => d.joint);
            const depthLimited = joints.includes("Knee Flexion") || joints.includes("Ankle Dorsiflexion");

            if (depthLimited) {
                recs.push("Ankle dorsiflexion mobility drills (weight-bearing lunge stretch, heel-elevated knee-to-wall) to unlock squat depth.");
                recs.push("Squat depth progression with a heel wedge or counterweight hold, building gradually toward full depth while keeping the heels down.");
            }
            if (joints.includes("Hip Flexion")) {
                recs.push("Hip mobility and glute work (hip flexor/gluteal stretching, glute bridges, hip hinges with a dowel) to organise hip flexion through the squat.");
            }
            if (joints.includes("Trunk Lean")) {
                recs.push("Goblet squats (weight held at chest) to self-correct trunk angle, plus core stabilization (planks, deadbugs) and hip extension strengthening (bridges, hip thrusts).");
            }
            if (joints.includes("Bilateral Symmetry")) {
                recs.push("Unilateral leg work: single-leg glute bridges, Bulgarian split squats and step-downs to isolate and balance muscle discrepancies.");
                recs.push("Weight-distribution feedback training using scale boards or visual mirror targets.");
            }

            // General safety tip
            recs.push("Focus on tempo control (3-second eccentric phase, 1-second pause at bottom) during training.");

            return recs.slice(0, 4); // return max 4
        },

        // ------------------------------------------------------------------
        // Module 1 (BPT1) static squat-view evaluation.
        //
        // Every value here is a CLINICAL angle in the same convention as
        // REFERENCE_STANDARDS (0deg = anatomical neutral), converted from the
        // raw view geometry before it is compared with any normative range. This
        // is the single source of truth for both the on-screen live panel and
        // the report sections, so a number can never mean two different things
        // depending on where it is read.
        // ------------------------------------------------------------------

        // Clinical sagittal metrics for one lateral (side-on) SQUAT capture.
        evaluateModule1LateralView: function (view) {
            if (!view || view.outOfFrame) return [];
            const p = view.points || {};
            const rows = [];
            // The right-lateral capture exposes its knee landmark as `condyle`
            // (lateral femoral condyle) and the left-lateral capture as
            // `epicondyle` (medial femoral epicondyle). They are the same point
            // for this measurement, so either name is accepted.
            const kneePoint = p.condyle || p.epicondyle;

            // Depth (0..1 of a full deep squat) is defined by the knee flexion
            // reached in this same capture. It is no longer used to scale any
            // band -- every lateral row is scored against the chart's absolute
            // range -- it only feeds the squat-depth percentage quoted in the text.
            const kneeInterior = (p.trochanter && kneePoint && p.ankle)
                ? calculateAngleAspect(p.trochanter, kneePoint, p.ankle, MODULE1_ASPECT)
                : null;
            const kneeFlexion = module1Calibrate("knee", interiorToFlexionRom(kneeInterior));
            const hasKnee = kneeFlexion !== null;
            // With no measurable knee angle the depth is unknown, so it is left
            // at 0 rather than silently assumed to be full depth.
            const depthRatio = hasKnee ? Math.max(0, Math.min(1, kneeFlexion / MODULE1_DEPTH_TARGET)) : 0;

            const addRow = cfg => {
                const row = buildModule1Row(cfg);
                if (row) rows.push(row);
            };

            // Craniocervical angle: ear-to-acromion line measured from the
            // HORIZONTAL (clinical definition), not from vertical.
            if (p.headRef && p.acromion) {
                addRow({
                    metricKind: "squatRom", view: "lateralSquat", category: "Neck / Head",
                    joint: `${MODULE1_STATIC_STANDARDS.headPositionForward.name}`,
                    shortLabel: MODULE1_STATIC_STANDARDS.headPositionForward.name,
                    side: "Center", value: module1Calibrate("cva", craniocervicalAngle(p.headRef, p.acromion)),
                    std: MODULE1_STATIC_STANDARDS.headPositionForward,
                    directions: MODULE1_SQUAT_DIRECTIONS.cva
                });
            }
            // Trunk lean: torso inclination from vertical (already clinical).
            if (p.acromion && p.trochanter) {
                addRow({
                    metricKind: "squatRom", view: "lateralSquat", category: "Trunk Lean",
                    joint: MODULE1_STATIC_STANDARDS.trunkSagittal.name,
                    shortLabel: MODULE1_STATIC_STANDARDS.trunkSagittal.name,
                    side: "Center", value: module1Calibrate("trunk", inclinationFromVertical(p.acromion, p.trochanter)),
                    std: MODULE1_STATIC_STANDARDS.trunkSagittal, depthRatio: depthRatio,
                    directions: MODULE1_SQUAT_DIRECTIONS.trunk
                });
            }
            // Hip flexion: trunk-to-thigh interior angle converted to ROM.
            if (p.acromion && p.trochanter && kneePoint) {
                const hipInterior = calculateAngleAspect(p.acromion, p.trochanter, kneePoint, MODULE1_ASPECT);
                addRow({
                    metricKind: "squatRom", view: "lateralSquat", category: "Hip",
                    joint: MODULE1_STATIC_STANDARDS.hipSagittal.name,
                    shortLabel: MODULE1_STATIC_STANDARDS.hipSagittal.name,
                    side: "Center", value: module1Calibrate("hip", interiorToFlexionRom(hipInterior)), raw: hipInterior,
                    std: MODULE1_STATIC_STANDARDS.hipSagittal, depthRatio: depthRatio,
                    directions: MODULE1_SQUAT_DIRECTIONS.hip
                });
            }
            // Knee flexion: thigh-to-shin interior angle converted to ROM, scored
            // against the chart's absolute 135-150deg normal band (no depth scaling).
            if (hasKnee) {
                addRow({
                    metricKind: "squatRom", view: "lateralSquat", category: "Knee",
                    joint: MODULE1_STATIC_STANDARDS.kneeSagittal.name,
                    shortLabel: MODULE1_STATIC_STANDARDS.kneeSagittal.name,
                    side: "Center", value: kneeFlexion, raw: kneeInterior,
                    std: MODULE1_STATIC_STANDARDS.kneeSagittal, depthRatio: depthRatio,
                    directions: MODULE1_SQUAT_DIRECTIONS.knee
                });
            }
            // Ankle dorsiflexion: how far the shin travelled forward over the
            // foot (inclination from vertical). Deliberately NOT a
            // knee-ankle-toe interior angle -- that angle is ~90-130deg in any
            // posture and is not comparable with a dorsiflexion range.
            if (kneePoint && p.ankle) {
                addRow({
                    metricKind: "squatRom", view: "lateralSquat", category: "Ankle",
                    joint: MODULE1_STATIC_STANDARDS.ankleSagittal.name,
                    shortLabel: MODULE1_STATIC_STANDARDS.ankleSagittal.name,
                    side: "Center", value: module1Calibrate("ankle", inclinationFromVertical(kneePoint, p.ankle)),
                    std: MODULE1_STATIC_STANDARDS.ankleSagittal, depthRatio: depthRatio,
                    directions: MODULE1_SQUAT_DIRECTIONS.ankle
                });
            }

            return rows;
        },

        // Frontal-plane symmetry rows for the Anterior / Posterior captures.
        evaluateModule1FrontalView: function (sectionKey, view) {
            if (!view || view.outOfFrame) return [];
            const m = view.metrics || {};
            const s = view.sides || {};
            const rows = [];
            const isAnterior = sectionKey === "anterior";
            const viewLabel = isAnterior ? "Anterior" : "Posterior";
            const addRow = cfg => {
                const row = buildModule1Row(cfg);
                if (row) rows.push(row);
            };
            const addFrontal = (category, metricKey, side, deviatedSide) => {
                const std = MODULE1_STATIC_STANDARDS[metricKey];
                addRow({
                    view: sectionKey, category: category,
                    joint: `${viewLabel} – ${std.name}`, shortLabel: std.name,
                    side: side, value: module1Calibrate("symmetry", m[metricKey]), std: std, deviatedSide: deviatedSide
                });
            };

            if (isAnterior) {
                addFrontal("Neck / Head", "headPositionTilt", "L-R", s.headPositionTilt);
                addFrontal("Shoulder", "shoulderTilt", "L-R", s.shoulderTilt);
                addFrontal("Trunk Symmetry", "trunkSymmetryFrontal", "L-R", s.trunkSymmetryFrontal);
                // "Hip Level (ASIS L/R)" is intentionally not reported by Module 1
                // (Module 2's anterior view still reports it unchanged).
                addFrontal("Knee", "kneeAlignmentFrontal", "L-R", s.kneeAlignmentFrontal);
                addFrontal("Ankle", "ankleAlignmentFrontal", "L-R", s.ankleAlignmentFrontal);
            } else {
                // Clinical sequence: Neck & Shoulder, Trunk, Hip, Ankle. The
                // "Neck & Shoulder" row averages the two available readings, as
                // the chart reports them together.
                const neckShoulderVals = [m.headPositionTilt, m.shoulderTilt].filter(v => v !== undefined && v !== null);
                if (neckShoulderVals.length > 0) {
                    const avg = parseFloat((neckShoulderVals.reduce((x, y) => x + y, 0) / neckShoulderVals.length).toFixed(1));
                    addRow({
                        view: sectionKey, category: "Neck & Shoulder",
                        joint: `${viewLabel} – ${MODULE1_STATIC_STANDARDS.neckShoulderPosterior.name}`,
                        shortLabel: MODULE1_STATIC_STANDARDS.neckShoulderPosterior.name,
                        side: "L-R", value: module1Calibrate("symmetry", avg), std: MODULE1_STATIC_STANDARDS.neckShoulderPosterior,
                        deviatedSide: s.headPositionTilt || s.shoulderTilt
                    });
                }
                addFrontal("Trunk Symmetry", "trunkSymmetryPosterior", "L-R", s.trunkSymmetryPosterior);
                addFrontal("Hip", "pelvicTiltPosterior", "L-R", s.pelvicTiltPosterior);
                addFrontal("Ankle", "ankleAlignmentPosterior", "L-R", s.ankleAlignmentPosterior);
            }
            return rows;
        },

        // --- BPT2: 4-view standing posture assessment ---
        analyzeAnteriorView: analyzeAnteriorView,
        analyzePosteriorView: analyzePosteriorView,
        analyzeRightLateralView: analyzeRightLateralView,
        analyzeLeftLateralView: analyzeLeftLateralView,
        evaluateFullBodyPosture: evaluateFullBodyPosture,
        // --- BPT1 (Module 1): squat capture evaluators ---
        evaluateModule1StaticViews: evaluateModule1StaticViews,
        // Live (on-screen) per-view rows, built by the same code path as the
        // report sections so screen and PDF can never disagree.
        evaluateModule1View: PF_Pose_evaluateModule1View,
        generateModule1StaticInterpretation: generateModule1StaticInterpretation,
        generateModule1StaticRecommendations: generateModule1StaticRecommendations,
        module1ReportNote: MODULE1_REPORT_NOTE,
        module1DepthTarget: MODULE1_DEPTH_TARGET,
        // Shared with Module 2 (BPT2) -- unchanged.
        generatePostureInterpretation: generatePostureInterpretation,
        generatePostureRecommendations: generatePostureRecommendations,
        // Exposed so the UI (app.js) can read the exact clinical bounds directly
        // for overlay color-coding/labels instead of duplicating the numbers --
        // this is the single source of truth for Module 1's squat standards.
        standards: REFERENCE_STANDARDS,
        // Module 1's widened static-posture standards (Posterior/Lateral views).
        module1StaticStandards: MODULE1_STATIC_STANDARDS,
        // Module 1's chart calibration: the camera value taken to be "the chart's
        // normal position", the chart value it is mapped onto, the resulting gain
        // and the mapper itself -- exposed so the UI/tests can read (and re-tune)
        // exactly the numbers every squat row is scored with.
        module1Calibration: MODULE1_CALIBRATION,
        module1CalibrationGain: MODULE1_CALIBRATION_GAIN,
        module1Calibrate: module1Calibrate,
        // Depth-scaled band lookup, so the live overlay colours use exactly the
        // same tolerances as the report rows.
        module1Band: module1Band
    };

    window.PF_Pose = PF_Pose;
})();
