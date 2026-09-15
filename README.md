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
| Knee flexion | `180° − ∠(thigh, shin)` | squat-depth measure (normal ≥ 130°) |
| Hip flexion | `180° − ∠(trunk, thigh)` | normal ≥ 110° |
| Trunk lean | torso inclination from vertical | normal 25°–50° |
| Ankle dorsiflexion | shin inclination from vertical | normal ≥ 35° |
| Craniocervical angle | ear–acromion line measured from the **horizontal** | normal ≥ 50° |

Trunk lean, hip flexion and ankle dorsiflexion ranges are **depth-adjusted**: their
band is scaled by the squat depth actually reached (knee flexion ÷ 130°), because a
partial squat legitimately produces proportionally smaller angles. If a capture is
too shallow to score (< 35 % of full depth) those rows are reported as *Not
Assessable* instead of being falsely flagged. Each report prints the convention,
the landmark definitions used, and the raw interior camera angle in brackets next
to each converted value.

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
