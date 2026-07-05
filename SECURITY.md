# Security Policy

## Supported Versions

We are committed to maintaining the security of **PostureFlex**. Because this application operates entirely client-side within the browser (with no external server dependencies), security updates are rolled out directly via repository commits and production branch deployments.

## Our Security Architecture

PostureFlex is protected under the **Apache License 2.0** (Copyright © 2026 Aravindane V, Balamurugan R, Gokul N, Vishwaa B). 

Given that this system is engineered for **Bachelor of Physiotherapy (BPT) students and faculty** to conduct clinical biomechanical screenings, it handles sensitive clinical evaluations and mock patient data. To maximize privacy, the platform adheres to a zero-server architecture:

* **Zero Server Dependency:** Patient records, posture joint metrics, assessment histories, and clinical reports are stored strictly in your browser’s local tracking repository (`localStorage`). 
* **Local Processing:** Computer vision tracking (via MediaPipe) is executed entirely on the local user machine. No webcam footage, snapshot frames, or biometric patterns are ever uploaded over the network.
* **Durability Note:** Because data is tied local to a browser profile, clearing site cookies/cache will erase records. Ensure students download backup JSON reports regularly for external preservation.

## Reporting a Vulnerability

If you discover a security vulnerability or data leaks inside local storage rendering blocks, please do not open a public issue. Instead, report it directly to the maintainers.
* **Lead Maintainer:** Aravindane V (`@aravindanevaithianadan-design`)[cite: 15]
* **Contributors:** GOKUL N (`@Gokuln01`)[cite: 15]
* **Contributors:** GOKUL N (`@Balamurugan-asa`)[cite: 15]
* **Contributors:** GOKUL N (`@VishwaaB-sudo`)[cite: 15]
  
### Process
1. Email your findings to the repository maintainer or open a secure draft security advisory on GitHub.
2. Include a detailed description of the flaw, clear steps to reproduce the issue (PoC), and any relevant code snippets.
3. We will acknowledge your report within 48 hours and work with you to patch the repository under a coordinated disclosure timeline.

Thank you for keeping PostureFlex secure for our physiotherapy student community and faculty researchers!
