# PostureFlex - Clinical Posture & Squat Assessment

PostureFlex is a web-based clinical assessment hub designed for the **School of Physiotherapy at Sri Manakula Vinayagar Engineering College**. It leverages real-time computer vision to provide objective, data-driven biomechanical analysis for physiotherapy students and practitioners.

## 🚀 Key Modules

### BPT1: Live Squat Camera
Performs real-time joint tracking during active patient squats.
* **Metrics:** Calculates knee flexion angles, ankle alignment, and pelvic tilt deviations.
* **Functionality:** Provides immediate visual feedback via skeletal overlays on live webcam streams.

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
