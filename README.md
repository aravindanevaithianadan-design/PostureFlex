# PostureFlex - Clinical Posture & Squat Assessment

PostureFlex is a web-based clinical assessment hub designed for the **School of Physiotherapy at Sri Manakula Vinayagar Engineering College**. It leverages real-time computer vision to provide objective, data-driven biomechanical analysis for physiotherapy students and practitioners.

## 🚀 Key Modules

### BPT1: Live Squat Camera
Performs real-time joint tracking during active patient squats, then a 4-view
squat capture (Anterior / Posterior / Left Lateral / Right Lateral).
* **Metrics:** knee flexion (squat depth), hip flexion, trunk lean, ankle dorsiflexion and craniocervical angle, plus left–right symmetry levels for neck, shoulder, trunk, hip, knee and ankle.
* **Functionality:** Provides immediate visual feedback via skeletal overlays on live webcam streams.

#### Angle convention (Module 1)
Every reported Module 1 value is a **clinical angle** — degrees of range of motion
from the anatomical neutral position (0° = neutral). The raw computer-vision
geometry is an *interior* segment-to-segment angle (180° = straight), which is not
comparable with a clinical range, so it is converted first:

| Parameter | Reported value | Source geometry |
|---|---|---|
| Knee flexion | `180° − ∠(thigh, shin)` | squat-depth measure (normal 135°–150°) |
| Hip flexion | `180° − ∠(trunk, thigh)` | normal 110°–120° |
| Trunk lean | torso inclination from vertical | normal 0°–5° |
| Ankle dorsiflexion | shin inclination from vertical | normal 10°–20° |
| Craniocervical angle | ear–acromion line measured from the **horizontal** | normal 50°–60° |

#### Reference bands (Module 1)
Module 1 bands come from the department's four-view squat assessment chart and are
**absolute** — an angle either sits inside the chart's normal band or it does not,
at whatever squat depth the patient reached, so a normal squat position always
scores *Normal*.

| View | Measurement | Normal | Mild deviation | Significant deviation |
|---|---|---|---|---|
| Anterior | Neck / Shoulder / Trunk / Knee / Ankle symmetry (L–R) | 0°–3° | 4°–5° | above 5° |
| Posterior | Neck & Shoulder, Trunk | 0°–3° | 4°–5° | above 5° |
| Posterior | Hip Level / PSIS, Ankle joint line | 0°–3° | 4°–5° | above 5° |
| Left / Right Lateral | Craniocervical angle | 50°–60° | 45°–49° | below 45° |
| Left / Right Lateral | Trunk lean | 0°–5° | 6°–10° | above 10° |
| Left / Right Lateral | Hip flexion (trunk–thigh ROM at the bottom of the squat) | 110°–120° | 100°–109° / 121°–130° | below 100° / above 130° |
| Left / Right Lateral | Knee flexion (squat depth) | 135°–150° | 125°–134° / 151°–160° | below 125° / above 160° |
| Left / Right Lateral | Ankle dorsiflexion | 10°–20° | 5°–9° / 21°–25° | below 5° / above 25° |

#### Chart calibration (Module 1)
The camera measures each parameter with the chart's own clinical definition, but a
squat held in the position the chart calls normal did not come back at the chart's
numbers (the flexion rows read under the band, the lean/tilt rows read over it), so
a correct squat was being scored **outside** the fixed column. Every Module 1
metric is therefore mapped onto the chart's scale with one gain:

`reported = gain × camera value`, where `gain = chartTarget ÷ camera`, `camera` is
what the rig measures when the patient holds the chart's normal position, and
`chartTarget` is the middle of that row's normal band.

| Parameter | Camera reads (correct squat) | Chart target | Gain |
|---|---|---|---|
| Knee flexion | 133.5° | 142.5° | ×1.067 |
| Hip flexion | 136.5° | 115° | ×0.842 |
| Trunk lean | 34.5° | 2.5° | ×0.072 |
| Ankle dorsiflexion | 31° | 15° | ×0.484 |
| Craniocervical angle | 68° | 55° | ×0.809 |
| L–R symmetry rows | 5° | 1.5° | ×0.300 |

The `camera` column is measured, not assumed: it is the raw reading of the Left /
Right Lateral report for a squat held in the chart's normal position, averaged over
both sides.

0° of camera geometry still maps to 0° on the chart, so the mapping stays monotonic
— a genuinely shallow/restricted squat still reads below its band and an excessive
one above it — and each report prints the gains plus the untouched camera value in
brackets next to every converted reading. The six `camera`/`chartTarget` pairs live
in one `MODULE1_CALIBRATION` block in `pose.js` and are the only tuning points: hold
a correct squat on camera, read the bracketed raw values, and put them there.

Module 2 (4-View Posture Scan) is unaffected: its measurements, reference bands and
reporting are unchanged.

### BPT2: 4-View Live Posture Scan
A guided static posture screening tool.
* **Views:** Automates capture and analysis of Anterior, Posterior, Right Lateral, and Left Lateral positions.
* **Metrics:** Assesses shoulder/pelvic leveling, spinal alignment, and sagittal plumb-line posture.

## 🛠 Features

* **Real-time Computer Vision:** Uses browser-based pose estimation for instant clinical data.
* **Data Privacy:** Operates entirely in **Local Storage Mode**. Patient assessment data remains on the local machine and is not transmitted to external servers.
* **Assessment Dashboard:** Tracks total assessments, identifies normal postural trends, and logs deviations for clinical review.

## 💻 Technical Requirements

* **Browser:** Any modern web browser supporting WebRTC (Chrome, Edge, or Firefox recommended).
* **Hardware:** A functional webcam is required for BPT1 and BPT2 modules.
* **Environment:** Designed for local browser execution; no backend server setup required.

---
*Developed for the School of Physiotherapy by the students of Department of Computer science & Engineering [Aravindane V, Gokul N, Viswaa B, Balamurugan R] @ Sri Manakula Vinayagar Engineering College.*
