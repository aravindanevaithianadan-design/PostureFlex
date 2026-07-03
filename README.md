# PostureFlex

A professional-grade physiotherapy assessment web application built for students and faculty.

## Getting Started

1. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Run the Backend API and Web Server:
   ```bash
   python -m uvicorn backend.main:app --port 8000
   ```
3. Access the app:
   Navigate to `http://localhost:8000` in your web browser.

## Default Credentials
- **User ID:** postureflex
- **Password:** bptpf01

## Features
- **BPT1 Module:** Live camera pose analysis using MediaPipe Pose to analyze squat angles.
- **BPT2 Module:** Photo analysis module for static posture.
- **Reporting:** Client-side PDF reports generation with professional layouts.
- **UI:** A modern dark-themed glassmorphic UI with violet/purple gradients.
