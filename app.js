/* PostureFlex Main React Application */
const {
    useState,
    useEffect,
    useRef
} = React;
function App() {
    // Session Routing State
    const [currentRoute, setCurrentRoute] = useState("dashboard"); // login, dashboard, bpt1, bpt2, reports, settings
    const [userSession, setUserSession] = useState(null);
    const [dbState, setDbState] = useState({
        isConnected: false
    });

    // Intake Form & Active Patient State
    const [showIntakeModal, setShowIntakeModal] = useState(false);
    const [intakeTarget, setIntakeTarget] = useState(null); // 'bpt1' or 'bpt2'
    const [currentPatient, setCurrentPatient] = useState(null);

    // Assessment Session State
    const [activeAssessment, setActiveAssessment] = useState(null);
    const [history, setHistory] = useState([]);

    // UI state
    const [stats, setStats] = useState({
        total: 0,
        normal: 0,
        deviations: 0
    });
    const [activeReportPreview, setActiveReportPreview] = useState(null);
    // Initial load
    useEffect(() => {
        const authenticated = window.PF_Auth.isAuthenticated();
        if (authenticated) {
            setUserSession(window.PF_Auth.getUser());
            setCurrentRoute("dashboard");
        } else {
            setCurrentRoute("login");
        }

        // Check DB config status
        setDbState({
            isConnected: window.PF_DB.isSupabaseConnected()
        });
        loadHistory();
    }, []);
    // Reload history
    const loadHistory = async () => {
        const hist = await window.PF_DB.getHistory();
        setHistory(hist);

        // Calculate stats
        const total = hist.length;
        const normal = hist.filter(h => h.risk_level === "Normal").length;
        const devs = total - normal;
        setStats({
            total,
            normal,
            deviations: devs
        });
    };
    const handleLoginSuccess = () => {
        setUserSession(window.PF_Auth.getUser());
        setCurrentRoute("dashboard");
        loadHistory();
    };
    const handleLogout = () => {
        window.PF_Auth.logout();
        setUserSession(null);
        setCurrentRoute("login");
    };
    const handleStartAssessment = moduleName => {
        setIntakeTarget(moduleName);
        setShowIntakeModal(true);
    };
    const handleIntakeSubmit = async patientData => {
        // Save patient details
        const result = await window.PF_DB.savePatient(patientData);
        if (result.success) {
            setCurrentPatient(result.data);
            setShowIntakeModal(false);

            // Set up active assessment structure
            setActiveAssessment({
                patient: result.data,
                module: intakeTarget === 'bpt1' ? 'BPT1' : 'BPT2',
                session_type: patientData.session_type,
                notes: patientData.notes || "",
                status: "ready",
                // ready -> analyzing -> completed
                measurements: [],
                interpretation: "",
                recommendations: [],
                snapshot: null
            });
            setCurrentRoute(intakeTarget);
        } else {
            alert("Failed to register patient details. Please check inputs.");
        }
    };
    // Render appropriate pages based on route
    return /*#__PURE__*/React.createElement("div", {
        className: "app-container"
    }, currentRoute !== "login" && /*#__PURE__*/React.createElement(Sidebar, {
        currentRoute: currentRoute,
        onNavigate: route => {
            // Clean up camera if moving away from bpt1
            setCurrentRoute(route);
        },
        onLogout: handleLogout
    }), /*#__PURE__*/React.createElement("div", {
        className: "main-content",
        style: {
            marginLeft: currentRoute === "login" ? "0" : "260px"
        }
    }, currentRoute !== "login" && /*#__PURE__*/React.createElement(TopHeader, {
        user: userSession,
        dbState: dbState,
        onSettings: () => setCurrentRoute("settings")
    }), currentRoute === "login" && /*#__PURE__*/React.createElement(LoginPage, {
        onLoginSuccess: handleLoginSuccess
    }), currentRoute === "dashboard" && /*#__PURE__*/React.createElement(DashboardView, {
        stats: stats,
        history: history,
        onStartBPT1: () => handleStartAssessment('bpt1'),
        onStartBPT2: () => handleStartAssessment('bpt2'),
        onViewReport: report => {
            setActiveReportPreview(report);
            setCurrentRoute("reports");
        }
    }), currentRoute === "bpt1" && activeAssessment && /*#__PURE__*/React.createElement(BPT1Module, {
        assessment: activeAssessment,
        onSaveAssessment: async completedData => {
            // Save to database
            const saveResult = await window.PF_DB.saveSession(completedData);
            if (saveResult.success) {
                loadHistory();
                setCurrentRoute("dashboard");
            } else {
                alert("Failed to save session. Check database connection.");
            }
        },
        onCancel: () => {
            setCurrentRoute("dashboard");
            setActiveAssessment(null);
        }
    }), currentRoute === "bpt2" && activeAssessment && /*#__PURE__*/React.createElement(BPT2Module, {
        assessment: activeAssessment,
        onSaveAssessment: async completedData => {
            const saveResult = await window.PF_DB.saveSession(completedData);
            if (saveResult.success) {
                loadHistory();
                setCurrentRoute("dashboard");
            } else {
                alert("Failed to save session.");
            }
        },
        onCancel: () => {
            setCurrentRoute("dashboard");
            setActiveAssessment(null);
        }
    }), currentRoute === "reports" && /*#__PURE__*/React.createElement(ReportsView, {
        history: history,
        activeReportPreview: activeReportPreview,
        setActiveReportPreview: setActiveReportPreview,
        onClosePreview: () => setActiveReportPreview(null)
    }), currentRoute === "settings" && /*#__PURE__*/React.createElement(SettingsView, {
        dbState: dbState,
        setDbState: setDbState,
        onBack: () => setCurrentRoute("dashboard")
    })), showIntakeModal && /*#__PURE__*/React.createElement(IntakeModal, {
        moduleTarget: intakeTarget,
        onClose: () => setShowIntakeModal(false),
        onSubmit: handleIntakeSubmit
    }));
}
/* =========================================================================
   COMPONENTS
   ========================================================================= */
// Navigation Sidebar
function Sidebar({
    currentRoute,
    onNavigate,
    onLogout
}) {
    return /*#__PURE__*/React.createElement("aside", {
        className: "sidebar"
    }, /*#__PURE__*/React.createElement("div", {
        className: "sidebar-logo"
    }, /*#__PURE__*/React.createElement("div", {
        className: "logo-icon"
    }, /*#__PURE__*/React.createElement("img", {
        src: "ps.jpeg",
        alt: "PostureFlex logo"
    })), /*#__PURE__*/React.createElement("div", {
        className: "logo-text"
    }, "PostureFlex")), /*#__PURE__*/React.createElement("ul", {
        className: "sidebar-menu"
    }, /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "dashboard" ? "active" : ""}`,
        onClick: () => onNavigate("dashboard")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
    })), "Dashboard"), /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "bpt1" ? "active" : ""}`,
        onClick: () => onNavigate("dashboard") /* Forces select intake form via dashboard button */
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    })), "BPT1 (Live Camera)"), /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "bpt2" ? "active" : ""}`,
        onClick: () => onNavigate("dashboard")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    })), "BPT2 (4-View Posture Scan)"), /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "reports" ? "active" : ""}`,
        onClick: () => onNavigate("reports")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    })), "Reports Archive"), /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "settings" ? "active" : ""}`,
        onClick: () => onNavigate("settings")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    }), /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    })), "Settings")), /*#__PURE__*/React.createElement("div", {
        className: "sidebar-footer"
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        style: {
            width: "100%"
        },
        onClick: onLogout
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2",
        style: {
            width: "16px"
        }
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    })), "Sign Out")));
}
// Top Header panel
function TopHeader({
    user,
    dbState,
    onSettings
}) {
    return /*#__PURE__*/React.createElement("header", {
        className: "top-header"
    }, /*#__PURE__*/React.createElement("div", {
        className: "header-title"
    }, /*#__PURE__*/React.createElement("img", {
        src: "https://github.com/aravindanevaithianadan-design/PostureFlex/blob/main/SMVEC.png?raw=true",
        alt: "Sri Manakula Vinayagar Engineering College logo",
        className: "header-logo"
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Sri Manakula Vinayagar Engineering College"), /*#__PURE__*/React.createElement("p", null, "School of Physiotherapy"))), /*#__PURE__*/React.createElement("div", {
        className: "header-actions"
    }, /*#__PURE__*/React.createElement("div", {
        className: "mode-banner demo-mode",
        onClick: onSettings,
        style: {
            cursor: "pointer"
        }
    }, /*#__PURE__*/React.createElement("span", {
        style: {
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#10b981"
        }
    }), "Local Storage Mode"), /*#__PURE__*/React.createElement("div", {
        className: "user-badge"
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2",
        style: {
            width: "16px"
        }
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    })), user?.username || "Assessor")));
}
// Login Screen View
function LoginPage({
    onLoginSuccess
}) {
    const [username, setUsername] = useState("postureflex");
    const [password, setPassword] = useState("bptpf01");
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const handleSubmit = async e => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg("");
        const result = await window.PF_Auth.login(username, password);
        setLoading(false);
        if (result.success) {
            onLoginSuccess();
        } else {
            setErrorMsg(result.message);
        }
    };
    return /*#__PURE__*/React.createElement("div", {
        className: "login-wrap animate-fade-in"
    }, /*#__PURE__*/React.createElement("div", {
        className: "login-card glass"
    }, /*#__PURE__*/React.createElement("div", {
        className: "login-header"
    }, /*#__PURE__*/React.createElement("div", {
        className: "login-logo"
    }, /*#__PURE__*/React.createElement("img", {
        src: "ps.jpeg",
        alt: "PostureFlex logo"
    })), /*#__PURE__*/React.createElement("h2", null, "PostureFlex"), /*#__PURE__*/React.createElement("p", null, "Clinical posture analysis & motion capture tool")), errorMsg && /*#__PURE__*/React.createElement("div", {
        style: {
            color: "var(--danger)",
            padding: 12,
            borderRadius: 10,
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            marginBottom: 20,
            fontSize: 13,
            textAlign: "center"
        }
    }, errorMsg), /*#__PURE__*/React.createElement("form", {
        onSubmit: handleSubmit
    }, /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "User ID"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        className: "form-control",
        value: username,
        onChange: e => setUsername(e.target.value),
        required: true,
        placeholder: "Enter User ID"
    })), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Password"), /*#__PURE__*/React.createElement("input", {
        type: "password",
        className: "form-control",
        value: password,
        onChange: e => setPassword(e.target.value),
        required: true,
        placeholder: "Enter Password"
    })), /*#__PURE__*/React.createElement("button", {
        type: "submit",
        className: "btn btn-primary",
        style: {
            width: "100%",
            marginTop: 10
        },
        disabled: loading
    }, loading ? "Verifying..." : "Access Station"))));
}
// Patient Intake Form Modal
function IntakeModal({
    onClose,
    onSubmit,
    moduleTarget
}) {
    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const [gender, setGender] = useState("Male");
    const [patientId, setPatientId] = useState("");
    const [sessionType, setSessionType] = useState("Initial Assessment");
    const [assessorName, setAssessorName] = useState("Faculty Dr. Nalla");
    const [notes, setNotes] = useState("");
    // Generate a default patient ID on mount
    useEffect(() => {
        setPatientId("PT-" + Math.floor(100000 + Math.random() * 900000));
    }, []);
    const handleSubmit = e => {
        e.preventDefault();
        onSubmit({
            name,
            age: parseInt(age),
            gender,
            patient_id: patientId,
            session_type: sessionType,
            assessor_name: assessorName,
            notes
        });
    };
    return /*#__PURE__*/React.createElement("div", {
        className: "modal-overlay"
    }, /*#__PURE__*/React.createElement("div", {
        className: "modal-content glass animate-fade-in"
    }, /*#__PURE__*/React.createElement("div", {
        className: "modal-header"
    }, /*#__PURE__*/React.createElement("h3", null, "New Patient Session"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary btn-icon",
        onClick: onClose,
        style: {
            borderRadius: "50%"
        }
    }, "X")), /*#__PURE__*/React.createElement("form", {
        onSubmit: handleSubmit
    }, /*#__PURE__*/React.createElement("div", {
        style: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Patient ID (Auto)"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        className: "form-control",
        value: patientId,
        readOnly: true
    })), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Assessor Name"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        className: "form-control",
        value: assessorName,
        onChange: e => setAssessorName(e.target.value),
        required: true
    }))), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Patient Full Name"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        className: "form-control",
        placeholder: "e.g. John Doe",
        value: name,
        onChange: e => setName(e.target.value),
        required: true
    })), /*#__PURE__*/React.createElement("div", {
        style: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Age"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        className: "form-control",
        placeholder: "Years",
        value: age,
        onChange: e => setAge(e.target.value),
        required: true,
        min: "1",
        max: "120"
    })), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Gender"), /*#__PURE__*/React.createElement("select", {
        className: "form-control",
        value: gender,
        onChange: e => setGender(e.target.value)
    }, /*#__PURE__*/React.createElement("option", null, "Male"), /*#__PURE__*/React.createElement("option", null, "Female"), /*#__PURE__*/React.createElement("option", null, "Other")))), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Session Type"), /*#__PURE__*/React.createElement("select", {
        className: "form-control",
        value: sessionType,
        onChange: e => setSessionType(e.target.value)
    }, /*#__PURE__*/React.createElement("option", null, "Initial Assessment"), /*#__PURE__*/React.createElement("option", null, "Progress Assessment"), /*#__PURE__*/React.createElement("option", null, "Post-operative Review"), /*#__PURE__*/React.createElement("option", null, "Discharge Assessment"))), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Clinical Notes / Remarks"), /*#__PURE__*/React.createElement("textarea", {
        className: "form-control",
        rows: "3",
        placeholder: "Symptom details, medical history...",
        value: notes,
        onChange: e => setNotes(e.target.value)
    })), /*#__PURE__*/React.createElement("button", {
        type: "submit",
        className: "btn btn-primary",
        style: {
            width: "100%",
            marginTop: 10
        }
    }, "Proceed to ", moduleTarget === 'bpt1' ? "Live Camera" : "4-View Posture Scan", " Analysis"))));
}
// Dashboard Page View
function DashboardView({
    stats,
    history,
    onStartBPT1,
    onStartBPT2,
    onViewReport
}) {
    return /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in"
    }, /*#__PURE__*/React.createElement("div", {
        className: "hero-card"
    }, /*#__PURE__*/React.createElement("h2", null, "Clinical Assessment Hub"), /*#__PURE__*/React.createElement("p", null, "Welcome to the PostureFlex assessment lab. Physiotherapy students can evaluate patient mechanics using live-camera squat analysis (BPT1) or a guided live-camera 4-view static posture screening -- Anterior, Posterior, Right Lateral, Left Lateral (BPT2) -- both powered by real-time computer vision joint tracking.")), /*#__PURE__*/React.createElement("div", {
        className: "stats-grid"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stat-card glass"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stat-icon"
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
    }))), /*#__PURE__*/React.createElement("div", {
        className: "stat-info"
    }, /*#__PURE__*/React.createElement("div", {
        className: "num"
    }, stats.total), /*#__PURE__*/React.createElement("div", {
        className: "label"
    }, "Total Assessments"))), /*#__PURE__*/React.createElement("div", {
        className: "stat-card glass"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stat-icon success"
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        d: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"
    }))), /*#__PURE__*/React.createElement("div", {
        className: "stat-info"
    }, /*#__PURE__*/React.createElement("div", {
        className: "num"
    }, stats.normal), /*#__PURE__*/React.createElement("div", {
        className: "label"
    }, "Normal Posture"))), /*#__PURE__*/React.createElement("div", {
        className: "stat-card glass"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stat-icon warning"
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"
    }))), /*#__PURE__*/React.createElement("div", {
        className: "stat-info"
    }, /*#__PURE__*/React.createElement("div", {
        className: "num"
    }, stats.deviations), /*#__PURE__*/React.createElement("div", {
        className: "label"
    }, "Deviations Logged")))), /*#__PURE__*/React.createElement("div", {
        className: "modules-grid"
    }, /*#__PURE__*/React.createElement("div", {
        className: "module-card glass glass-hover"
    }, /*#__PURE__*/React.createElement("div", {
        className: "module-tag"
    }, "MODULE 1"), /*#__PURE__*/React.createElement("h3", null, "BPT1 - Live Squat Camera"), /*#__PURE__*/React.createElement("p", null, "Execute real-time angle overlays, knee flexion deviations, ankle alignment checks, and pelvic tilt calculations continuously during active patient squats using a webcam."), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: onStartBPT1
    }, "Launch Camera Stream")), /*#__PURE__*/React.createElement("div", {
        className: "module-card glass glass-hover"
    }, /*#__PURE__*/React.createElement("div", {
        className: "module-tag"
    }, "MODULE 2"), /*#__PURE__*/React.createElement("h3", null, "BPT2 - 4-View Live Posture Scan"), /*#__PURE__*/React.createElement("p", null, "Guided live-camera capture of Anterior, Posterior, Right Lateral, and Left Lateral standing views, analyzing shoulder/pelvic level, spinal alignment, knee alignment, and sagittal plumb-line posture at each key anatomical landmark."), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: onStartBPT2
    }, "Launch 4-View Scan"))), /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: {
            padding: 24
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "dashboard-card-header"
    }, /*#__PURE__*/React.createElement("h3", null, "Recent Clinical Logs")), history.length === 0 ? /*#__PURE__*/React.createElement("p", {
        style: {
            color: "var(--text-muted)",
            textAlign: "center",
            padding: "24px 0"
        }
    }, "No sessions found. Start a new assessment to log patient records.") : /*#__PURE__*/React.createElement("div", {
        className: "table-container"
    }, /*#__PURE__*/React.createElement("table", {
        className: "custom-table"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Patient"), /*#__PURE__*/React.createElement("th", null, "ID"), /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Module"), /*#__PURE__*/React.createElement("th", null, "Session Type"), /*#__PURE__*/React.createElement("th", null, "Overall Risk"), /*#__PURE__*/React.createElement("th", null, "Action"))), /*#__PURE__*/React.createElement("tbody", null, history.slice(0, 5).map((log, i) => /*#__PURE__*/React.createElement("tr", {
        key: i
    }, /*#__PURE__*/React.createElement("td", {
        style: {
            fontWeight: 600
        }
    }, log.patient_name), /*#__PURE__*/React.createElement("td", {
        style: {
            color: "var(--text-purple)",
            fontFamily: "monospace"
        }
    }, log.patient_id), /*#__PURE__*/React.createElement("td", null, log.date), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
        className: "badge badge-success",
        style: {
            background: "rgba(139, 92, 246, 0.15)",
            color: "var(--text-purple)"
        }
    }, log.module_type)), /*#__PURE__*/React.createElement("td", null, log.session_type), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
        className: `badge ${log.risk_level.includes("Significant") ? "badge-danger" : log.risk_level.includes("Mild") ? "badge-warning" : "badge-success"}`
    }, log.risk_level)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        style: {
            padding: "6px 12px",
            fontSize: 12
        },
        onClick: () => onViewReport(log)
    }, "View Report")))))))));
}
// BPT1 Module View (Webcam live capture)
function BPT1Module({
    assessment,
    onSaveAssessment,
    onCancel
}) {
    const [step, setStep] = useState(2); // 1 is form (completed), 2 is capturing, 3 is preview report
    const [videoActive, setVideoActive] = useState(false);
    const [trackingConfidence, setTrackingConfidence] = useState(0);
    const [outOfFrame, setOutOfFrame] = useState(true);
    const [squatState, setSquatState] = useState("Standing");
    const [liveAngles, setLiveAngles] = useState({
        leftKnee: 180,
        rightKnee: 180,
        avgTrunk: 0,
        leftAnkle: 90
    });
    const [assessmentRecord, setAssessmentRecord] = useState(null);
    const [reportPreviewData, setReportPreviewData] = useState(null);
    const [saving, setSaving] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const poseRef = useRef(null);
    const cameraRef = useRef(null);
    const frozenFrameRef = useRef(null); // stores captured image data URL
    // Start video on mount
    useEffect(() => {
        if (step === 2) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [step]);
    const startCamera = async () => {
        setVideoActive(true);

        // Wait for elements to render
        setTimeout(async () => {
            const videoElement = videoRef.current;
            const canvasElement = canvasRef.current;
            if (!videoElement || !canvasElement) return;
            const canvasCtx = canvasElement.getContext('2d');

            // Initializing MediaPipe Pose
            const poseInstance = new window.Pose({
                locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });
            poseInstance.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.55,
                minTrackingConfidence: 0.55
            });
            poseInstance.onResults(results => {
                // Clear Canvas
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

                // Draw Camera Frame
                canvasCtx.save();
                canvasCtx.translate(canvasElement.width, 0);
                canvasCtx.scale(-1, 1);
                canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
                canvasCtx.restore();
                if (results.poseLandmarks) {
                    // Execute Biomechanics analysis
                    const analysis = window.PF_Pose.analyzeLandmarks(results.poseLandmarks);
                    setTrackingConfidence(analysis.confidence);
                    setOutOfFrame(analysis.outOfFrame);
                    if (!analysis.outOfFrame) {
                        setSquatState(analysis.squatState);
                        setLiveAngles(analysis.angles);

                        // Run active assessment
                        const assessmentData = window.PF_Pose.evaluatePosture(analysis);
                        setAssessmentRecord(assessmentData);

                        // Draw skeleton overlays
                        drawPostureOverlays(canvasCtx, results.poseLandmarks, analysis);
                    }
                } else {
                    setOutOfFrame(true);
                }
            });
            poseRef.current = poseInstance;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 640,
                        height: 480
                    }
                });
                videoElement.srcObject = stream;
                videoElement.play();

                // Set up requestAnimationFrame processing loop
                let active = true;
                const processFrame = async () => {
                    if (!active) return;
                    if (videoElement.readyState >= 2) {
                        await poseInstance.send({
                            image: videoElement
                        });
                    }
                    requestAnimationFrame(processFrame);
                };
                cameraRef.current = {
                    stop: () => {
                        active = false;
                        stream.getTracks().forEach(track => track.stop());
                    }
                };
                requestAnimationFrame(processFrame);
            } catch (err) {
                console.error("Camera access error:", err);
                alert("Camera access denied or device busy. Please ensure camera permissions are active.");
                onCancel();
            }
        }, 300);
    };
    const stopCamera = () => {
        setVideoActive(false);
        if (cameraRef.current) {
            cameraRef.current.stop();
            cameraRef.current = null;
        }
        if (poseRef.current) {
            poseRef.current.close();
            poseRef.current = null;
        }
    };
    // Draw customized biomechanics skeletons, boxes, and numbers on frame
    const drawPostureOverlays = (ctx, landmarks, analysis) => {
        const drawJointCircle = (lm, color) => {
            ctx.beginPath();
            ctx.arc(640 - lm.x * 640, lm.y * 480, 7, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
        };
        const drawBoneLine = (lm1, lm2, color, thickness = 3) => {
            ctx.beginPath();
            ctx.moveTo(640 - lm1.x * 640, lm1.y * 480);
            ctx.lineTo(640 - lm2.x * 640, lm2.y * 480);
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            ctx.stroke();
        };
        const drawAngleLabel = (lm, text, color) => {
            ctx.font = "bold 15px 'Outfit', sans-serif";
            ctx.fillStyle = "white";
            ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
            ctx.lineWidth = 4;
            const px = 640 - lm.x * 640 + 12;
            const py = lm.y * 480 - 4;
            ctx.strokeText(text, px, py);
            ctx.fillText(text, px, py);
        };
        const lShoulder = landmarks[11];
        const rShoulder = landmarks[12];
        const lHip = landmarks[23];
        const rHip = landmarks[24];
        const lKnee = landmarks[25];
        const rKnee = landmarks[26];
        const lAnkle = landmarks[27];
        const rAnkle = landmarks[28];
        const angles = analysis.angles;
        const colorNormal = "#10b981"; // Emerald
        const colorDev = "#ef4444"; // Red
        // 1. Draw Bones
        drawBoneLine(lShoulder, rShoulder, "rgba(255,255,255,0.5)");
        drawBoneLine(lHip, rHip, "rgba(255,255,255,0.5)");

        // Left limb bones (closer side in mirror usually)
        drawBoneLine(lShoulder, lHip, "rgba(99, 102, 241, 0.8)"); // Hip-shoulder
        drawBoneLine(lHip, lKnee, "rgba(99, 102, 241, 0.8)");
        drawBoneLine(lKnee, lAnkle, "rgba(99, 102, 241, 0.8)");

        // Right limb bones
        drawBoneLine(rShoulder, rHip, "rgba(236, 72, 153, 0.8)");
        drawBoneLine(rHip, rKnee, "rgba(236, 72, 153, 0.8)");
        drawBoneLine(rKnee, rAnkle, "rgba(236, 72, 153, 0.8)");
        // 2. Draw joint circle markers
        drawJointCircle(lShoulder, "white");
        drawJointCircle(rShoulder, "white");

        // Dynamic color for knee based on flexion target (80-110)
        const lKneeColor = angles.leftKnee >= 80 && angles.leftKnee <= 110 ? colorNormal : analysis.depthPct > 40 ? colorDev : "#6366f1";
        const rKneeColor = angles.rightKnee >= 80 && angles.rightKnee <= 110 ? colorNormal : analysis.depthPct > 40 ? colorDev : "#6366f1";
        drawJointCircle(lKnee, lKneeColor);
        drawJointCircle(rKnee, rKneeColor);
        drawJointCircle(lHip, "white");
        drawJointCircle(rHip, "white");
        drawJointCircle(lAnkle, "white");
        drawJointCircle(rAnkle, "white");
        // 3. Draw text overlays
        drawAngleLabel(lKnee, `${Math.round(angles.leftKnee)}°`, lKneeColor);
        drawAngleLabel(rKnee, `${Math.round(angles.rightKnee)}°`, rKneeColor);
        drawAngleLabel(lHip, `${Math.round(angles.leftHip)}°`, "white");
        drawAngleLabel(rHip, `${Math.round(angles.rightHip)}°`, "white");

        // Trunk Angle label next to shoulders
        drawAngleLabel(lShoulder, `Trunk: ${Math.round(angles.avgTrunk)}°`, "white");
    };
    const handleFreezeSnapshot = () => {
        const canvasElement = canvasRef.current;
        if (!canvasElement) return;

        // Extract snapshot as DataURL
        const dataUrl = canvasElement.toDataURL('image/png');
        frozenFrameRef.current = dataUrl;

        // Stop Camera feed
        stopCamera();

        // Set up final clinical records
        const finalAssessment = assessmentRecord || {
            overallStatus: "Normal",
            measurements: [],
            symmetryScore: 100
        };
        const interpretationText = window.PF_Pose.generateInterpretation(finalAssessment, squatState);
        const recommendationsText = window.PF_Pose.generateRecommendations(finalAssessment);
        setReportPreviewData({
            patient: {
                id: assessment.patient.id,
                patient_id: assessment.patient.patient_id,
                name: assessment.patient.name,
                age: assessment.patient.age,
                gender: assessment.patient.gender,
                assessor: assessment.patient.assessor_name,
                session_type: assessment.session_type
            },
            session: {
                date: new Date().toLocaleDateString(),
                module: "BPT1",
                risk_level: finalAssessment.overallStatus || "Normal",
                notes: assessment.notes
            },
            measurements: finalAssessment.measurements || [],
            image_base64: dataUrl,
            interpretation: interpretationText,
            recommendations: recommendationsText
        });
        setStep(3); // Go to preview
    };
    const handleFinalSave = async () => {
        setSaving(true);
        // Pack data matching API Schema
        const payload = {
            patient_uuid: assessment.patient.id,
            session_type: assessment.session_type,
            module_type: "BPT1",
            risk_level: reportPreviewData.session.risk_level,
            notes: assessment.notes,
            measurements: reportPreviewData.measurements,
            interpretation: reportPreviewData.interpretation,
            recommendations: reportPreviewData.recommendations
        };
        await onSaveAssessment(payload);
        // Automatically download the PDF report once the assessment is saved
        window.PF_Reports.downloadClientPDF(reportPreviewData);
        setSaving(false);
    };
    const handleTriggerDownload = () => {
        // Trigger Client PDF download
        window.PF_Reports.downloadClientPDF(reportPreviewData);
    };
    return /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stepper"
    }, /*#__PURE__*/React.createElement("div", {
        className: "step completed"
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "✓"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Intake")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 2 ? "active" : "completed"}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "2"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Analysis")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 3 ? "active" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "3"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Preview Report"))), step === 2 && /*#__PURE__*/React.createElement("div", {
        className: "analysis-layout"
    }, /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            flexDirection: "column",
            gap: 16
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "camera-panel"
    }, /*#__PURE__*/React.createElement("video", {
        ref: videoRef,
        className: "video-element",
        muted: true,
        style: {
            display: "none"
        }
    }), /*#__PURE__*/React.createElement("canvas", {
        ref: canvasRef,
        className: "canvas-element",
        width: "640",
        height: "480"
    }), outOfFrame && /*#__PURE__*/React.createElement("div", {
        className: "out-of-frame-overlay"
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "white",
        strokeWidth: "2",
        style: {
            width: 48,
            height: 48
        }
    }, /*#__PURE__*/React.createElement("path", {
        d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L1.34 16c-.77 1.333.192 3 1.732 3z"
    })), /*#__PURE__*/React.createElement("div", {
        className: "frame-alert-text"
    }, "Patient Not Detected in Frame"), /*#__PURE__*/React.createElement("p", {
        style: {
            color: "#d1d5db",
            fontSize: 13,
            textAlign: "center"
        }
    }, "Ensure the patient stands with full-body profile visible."))), /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
        }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: onCancel
    }, "Cancel Session"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: handleFreezeSnapshot,
        disabled: outOfFrame
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "white",
        strokeWidth: "2.5",
        style: {
            width: 16
        }
    }, /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "10"
    }), /*#__PURE__*/React.createElement("path", {
        d: "M12 8v8M8 12h8"
    })), "Freeze & Generate Report"))), /*#__PURE__*/React.createElement("div", {
        className: "side-panel"
    }, /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: {
            padding: 20
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "dashboard-card-header"
    }, /*#__PURE__*/React.createElement("h3", null, "Patient: ", assessment.patient.name), /*#__PURE__*/React.createElement("span", {
        className: "badge badge-success",
        style: {
            background: "rgba(139, 92, 246, 0.15)",
            color: "var(--text-purple)"
        }
    }, squatState)), /*#__PURE__*/React.createElement("div", {
        className: "score-display"
    }, /*#__PURE__*/React.createElement("div", {
        className: "score-num"
    }, Math.round(liveAngles.leftKnee), "°"), /*#__PURE__*/React.createElement("div", {
        style: {
            color: "var(--text-muted)",
            fontSize: 12,
            marginTop: 4
        }
    }, "Left Knee Flexion (Ref: 80° - 110°)")), /*#__PURE__*/React.createElement("div", {
        className: "risk-level-banner",
        style: {
            background: assessmentRecord?.overallStatus === "Significant Deviation" ? "var(--danger-bg)" : assessmentRecord?.overallStatus === "Mild Deviation" ? "var(--warning-bg)" : "var(--success-bg)",
            color: assessmentRecord?.overallStatus === "Significant Deviation" ? "var(--danger)" : assessmentRecord?.overallStatus === "Mild Deviation" ? "var(--warning)" : "var(--success)",
            border: `1px solid ${assessmentRecord?.overallStatus === "Significant Deviation" ? "rgba(239,68,68,0.3)" : assessmentRecord?.overallStatus === "Mild Deviation" ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`
        }
    }, "Overall: ", assessmentRecord?.overallStatus || "Scanning...")), /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: {
            padding: 20
        }
    }, /*#__PURE__*/React.createElement("h4", {
        style: {
            marginBottom: 12
        }
    }, "Angles Summary"), /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            flexDirection: "column",
            gap: 10
        }
    }, /*#__PURE__*/React.createElement(AngleRow, {
        label: "Left Knee Flexion",
        val: liveAngles.leftKnee,
        refRange: "80° - 110°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Knee Flexion" && m.side === "Left")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Right Knee Flexion",
        val: liveAngles.rightKnee,
        refRange: "80° - 110°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Knee Flexion" && m.side === "Right")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Trunk Alignment",
        val: liveAngles.avgTrunk,
        refRange: "10° - 30°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Trunk Lean")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Left Ankle",
        val: liveAngles.leftAnkle,
        refRange: "70° - 85°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Ankle Alignment" && m.side === "Left")?.status || "Normal"
    }))))), step === 3 && reportPreviewData && /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: 24
        }
    }, /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
        }
    }, /*#__PURE__*/React.createElement("h3", null, "Report Preview"), /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            gap: 12
        }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: () => setStep(2)
    }, "Retake Capture"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: handleTriggerDownload
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "white",
        strokeWidth: "2.5",
        style: {
            width: 16
        }
    }, /*#__PURE__*/React.createElement("path", {
        d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
    })), "Export PDF Report"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        style: {
            background: "var(--success)"
        },
        onClick: handleFinalSave,
        disabled: saving
    }, saving ? "Saving..." : "Save Assessment to DB"))), /*#__PURE__*/React.createElement(ReportCanvasPreview, {
        reportData: reportPreviewData
    })));
}
// BPT2 Module View (Live Camera 4-View Posture Screening)
const BPT2_VIEW_CONFIG = [
    { key: "anterior", label: "Anterior View", analyzeFn: "analyzeAnteriorView", instructions: "Face the camera directly. Stand naturally with arms relaxed at your sides, feet shoulder-width apart." },
    { key: "posterior", label: "Posterior View", analyzeFn: "analyzePosteriorView", instructions: "Turn around so your back faces the camera. Keep arms relaxed at your sides." },
    { key: "rightLateral", label: "Right Lateral View", analyzeFn: "analyzeRightLateralView", instructions: "Turn to show your right side profile to the camera, standing naturally." },
    { key: "leftLateral", label: "Left Lateral View", analyzeFn: "analyzeLeftLateralView", instructions: "Turn to show your left side profile to the camera, standing naturally." }
];
function BPT2Module({
    assessment,
    onSaveAssessment,
    onCancel
}) {
    const [step, setStep] = useState(2); // 2: 4-view live capture, 3: preview report
    const [viewIndex, setViewIndex] = useState(0);
    const [outOfFrame, setOutOfFrame] = useState(true);
    const [trackingConfidence, setTrackingConfidence] = useState(0);
    const [liveMetrics, setLiveMetrics] = useState(null);
    const [capturedViews, setCapturedViews] = useState({});
    const [reportPreviewData, setReportPreviewData] = useState(null);
    const [saving, setSaving] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const poseRef = useRef(null);
    const cameraRef = useRef(null);
    const viewIndexRef = useRef(0);
    const liveAnalysisRef = useRef(null);

    useEffect(() => {
        viewIndexRef.current = viewIndex;
    }, [viewIndex]);

    useEffect(() => {
        if (step === 2) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [step]);

    const startCamera = async () => {
        setTimeout(async () => {
            const videoElement = videoRef.current;
            const canvasElement = canvasRef.current;
            if (!videoElement || !canvasElement) return;
            const canvasCtx = canvasElement.getContext('2d');

            const poseInstance = new window.Pose({
                locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });
            poseInstance.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.55,
                minTrackingConfidence: 0.55
            });
            poseInstance.onResults(results => {
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                canvasCtx.save();
                canvasCtx.translate(canvasElement.width, 0);
                canvasCtx.scale(-1, 1);
                canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
                canvasCtx.restore();

                const activeConfig = BPT2_VIEW_CONFIG[viewIndexRef.current];
                if (results.poseLandmarks && activeConfig) {
                    const result = window.PF_Pose[activeConfig.analyzeFn](results.poseLandmarks);
                    setTrackingConfidence(result.confidence || 0);
                    setOutOfFrame(!!result.outOfFrame);
                    if (!result.outOfFrame) {
                        setLiveMetrics(result.metrics);
                        liveAnalysisRef.current = result;
                        drawBPT2ViewOverlay(canvasCtx, activeConfig.key, result.points);
                    } else {
                        liveAnalysisRef.current = null;
                    }
                } else {
                    setOutOfFrame(true);
                    liveAnalysisRef.current = null;
                }
            });
            poseRef.current = poseInstance;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480 }
                });
                videoElement.srcObject = stream;
                videoElement.play();

                let active = true;
                const processFrame = async () => {
                    if (!active) return;
                    if (videoElement.readyState >= 2) {
                        await poseInstance.send({ image: videoElement });
                    }
                    requestAnimationFrame(processFrame);
                };
                cameraRef.current = {
                    stop: () => {
                        active = false;
                        stream.getTracks().forEach(track => track.stop());
                    }
                };
                requestAnimationFrame(processFrame);
            } catch (err) {
                console.error("Camera access error:", err);
                alert("Camera access denied or device busy. Please ensure camera permissions are active.");
                onCancel();
            }
        }, 300);
    };

    const stopCamera = () => {
        if (cameraRef.current) {
            cameraRef.current.stop();
            cameraRef.current = null;
        }
        if (poseRef.current) {
            poseRef.current.close();
            poseRef.current = null;
        }
    };

    const handleCaptureView = () => {
        const canvasElement = canvasRef.current;
        const activeConfig = BPT2_VIEW_CONFIG[viewIndex];
        if (!canvasElement || !activeConfig) return;
        if (!liveAnalysisRef.current) {
            alert("Patient not clearly detected. Please ensure the full body is visible before capturing this view.");
            return;
        }
        const dataUrl = canvasElement.toDataURL('image/png');
        const capturedResult = liveAnalysisRef.current;
        const updated = {
            ...capturedViews,
            [activeConfig.key]: { analysis: capturedResult, image: dataUrl, label: activeConfig.label }
        };
        setCapturedViews(updated);

        if (viewIndex < BPT2_VIEW_CONFIG.length - 1) {
            liveAnalysisRef.current = null;
            setOutOfFrame(true);
            setViewIndex(viewIndex + 1);
        } else {
            finalizeReport(updated);
        }
    };

    const finalizeReport = allViews => {
        stopCamera();
        const evaluation = window.PF_Pose.evaluateFullBodyPosture({
            anterior: allViews.anterior?.analysis,
            posterior: allViews.posterior?.analysis,
            rightLateral: allViews.rightLateral?.analysis,
            leftLateral: allViews.leftLateral?.analysis
        });
        const interpretationText = window.PF_Pose.generatePostureInterpretation(evaluation);
        const recommendationsText = window.PF_Pose.generatePostureRecommendations(evaluation);

        setReportPreviewData({
            patient: {
                id: assessment.patient.id,
                patient_id: assessment.patient.patient_id,
                name: assessment.patient.name,
                age: assessment.patient.age,
                gender: assessment.patient.gender,
                assessor: assessment.patient.assessor_name,
                session_type: assessment.session_type
            },
            session: {
                date: new Date().toLocaleDateString(),
                module: "BPT2",
                risk_level: evaluation.overallStatus,
                notes: assessment.notes
            },
            measurements: evaluation.measurements,
            images: BPT2_VIEW_CONFIG.map(v => ({
                label: v.label,
                base64: allViews[v.key] ? allViews[v.key].image : null
            })).filter(i => i.base64),
            interpretation: interpretationText,
            recommendations: recommendationsText
        });
        setStep(3);
    };

    const handleRestartCapture = () => {
        setCapturedViews({});
        setViewIndex(0);
        liveAnalysisRef.current = null;
        setReportPreviewData(null);
        setStep(2);
    };

    const handleFinalSave = async () => {
        setSaving(true);
        const payload = {
            patient_uuid: assessment.patient.id,
            session_type: assessment.session_type,
            module_type: "BPT2",
            risk_level: reportPreviewData.session.risk_level,
            notes: assessment.notes,
            measurements: reportPreviewData.measurements,
            interpretation: reportPreviewData.interpretation,
            recommendations: reportPreviewData.recommendations
        };
        await onSaveAssessment(payload);
        window.PF_Reports.downloadClientPDF(reportPreviewData);
        setSaving(false);
    };

    const activeConfig = BPT2_VIEW_CONFIG[viewIndex];
    const metricEntries = liveMetrics ? Object.entries(liveMetrics) : [];

    return /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in"
    }, /*#__PURE__*/React.createElement("div", {
        className: "stepper"
    }, /*#__PURE__*/React.createElement("div", {
        className: "step completed"
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "✓"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Intake")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 2 ? "active" : "completed"}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "2"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, step === 2 ? `View ${viewIndex + 1} of 4` : "4-View Capture")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 3 ? "active" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "3"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Preview Report"))), step === 2 && /*#__PURE__*/React.createElement("div", {
        className: "analysis-layout"
    }, /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: 16 }
    }, /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: { padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
        style: { margin: 0 }
    }, activeConfig.label), /*#__PURE__*/React.createElement("p", {
        style: { margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }
    }, activeConfig.instructions)), /*#__PURE__*/React.createElement("div", {
        className: "view-progress-dots"
    }, BPT2_VIEW_CONFIG.map((v, idx) => /*#__PURE__*/React.createElement("div", {
        key: v.key,
        className: `view-progress-dot ${capturedViews[v.key] ? "done" : idx === viewIndex ? "active" : ""}`,
        title: v.label
    })))), /*#__PURE__*/React.createElement("div", {
        className: "camera-panel"
    }, /*#__PURE__*/React.createElement("video", {
        ref: videoRef,
        className: "video-element",
        muted: true,
        style: { display: "none" }
    }), /*#__PURE__*/React.createElement("canvas", {
        ref: canvasRef,
        className: "canvas-element",
        width: "640",
        height: "480"
    }), outOfFrame && /*#__PURE__*/React.createElement("div", {
        className: "out-of-frame-overlay"
    }, /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "white",
        strokeWidth: "2",
        style: { width: 48, height: 48 }
    }, /*#__PURE__*/React.createElement("path", {
        d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L1.34 16c-.77 1.333.192 3 1.732 3z"
    })), /*#__PURE__*/React.createElement("div", {
        className: "frame-alert-text"
    }, "Patient Not Detected in Frame"), /*#__PURE__*/React.createElement("p", {
        style: { color: "#d1d5db", fontSize: 13, textAlign: "center" }
    }, activeConfig.instructions))), /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between" }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: onCancel
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: handleCaptureView,
        disabled: outOfFrame
    }, viewIndex < BPT2_VIEW_CONFIG.length - 1 ? `Capture & Continue to ${BPT2_VIEW_CONFIG[viewIndex + 1].label}` : "Capture & Finish"))), /*#__PURE__*/React.createElement("div", {
        className: "side-panel"
    }, /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: { padding: 20 }
    }, /*#__PURE__*/React.createElement("div", {
        className: "dashboard-card-header"
    }, /*#__PURE__*/React.createElement("h3", null, "Patient: ", assessment.patient.name), /*#__PURE__*/React.createElement("span", {
        className: "badge badge-success",
        style: { background: "rgba(139, 92, 246, 0.15)", color: "var(--text-purple)" }
    }, "Module: BPT2")), /*#__PURE__*/React.createElement("p", {
        style: { color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }
    }, "Tracking Confidence: ", Math.round(trackingConfidence * 100), "%"), metricEntries.length > 0 ? /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: 8 }
    }, metricEntries.map(([key, val]) => /*#__PURE__*/React.createElement(AngleRow, {
        key: key,
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
        val: val,
        refRange: "≤ 2°-5°",
        status: val > 5 ? "Significant Deviation" : val > 2 ? "Mild Deviation" : "Normal"
    }))) : /*#__PURE__*/React.createElement("p", {
        style: { color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }
    }, "Align the patient in frame to begin live tracking."), Object.keys(capturedViews).length > 0 && /*#__PURE__*/React.createElement("div", {
        className: "view-thumb-strip"
    }, Object.values(capturedViews).map((v, idx) => /*#__PURE__*/React.createElement("img", {
        key: idx,
        src: v.image,
        title: v.label
    })))))), step === 3 && reportPreviewData && /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in",
        style: { display: "flex", flexDirection: "column", gap: 24 }
    }, /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
    }, /*#__PURE__*/React.createElement("h3", null, "Report Preview"), /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", gap: 12 }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: handleRestartCapture
    }, "Retake All Views"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: () => window.PF_Reports.downloadClientPDF(reportPreviewData)
    }, "Export PDF Report"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        style: { background: "var(--success)" },
        onClick: handleFinalSave,
        disabled: saving
    }, saving ? "Saving..." : "Save Assessment to DB"))), /*#__PURE__*/React.createElement(ReportCanvasPreview, {
        reportData: reportPreviewData
    })));
}
// Draws simplified reference points/lines relevant to the currently active BPT2 view
function drawBPT2ViewOverlay(ctx, viewKey, points) {
    if (!points) return;
    const mx = p => 640 - p.x * 640;
    const my = p => p.y * 480;
    const dot = (p, color) => {
        if (!p) return;
        ctx.beginPath();
        ctx.arc(mx(p), my(p), 7, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    };
    const line = (p1, p2, color) => {
        if (!p1 || !p2) return;
        ctx.beginPath();
        ctx.moveTo(mx(p1), my(p1));
        ctx.lineTo(mx(p2), my(p2));
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
    };

    if (viewKey === "anterior") {
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.asisL, points.asisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.asisL, "white"); dot(points.asisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.sternum, "#fbbf24"); dot(points.umbilicus, "#fbbf24"); dot(points.patellaeCenter, "#fbbf24");
    } else if (viewKey === "posterior") {
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.psisL, points.psisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.psisL, "white"); dot(points.psisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.c7, "#fbbf24");
        dot(points.scapulaInferiorL, "#60a5fa"); dot(points.scapulaInferiorR, "#60a5fa");
    } else if (viewKey === "rightLateral" || viewKey === "leftLateral") {
        const p2 = points.condyle || points.epicondyle;
        line(points.acromion, points.trochanter, "rgba(99,102,241,0.9)");
        line(points.trochanter, p2, "rgba(16,185,129,0.9)");
        dot(points.acromion, "white"); dot(points.trochanter, "white"); dot(p2, "white");
    }
}
// Reports View (List past reports and click preview)
// Maps a stored history/log record into the shape PF_Reports.downloadClientPDF expects
function buildReportDataFromLog(log) {
    return {
        patient: {
            patient_id: log.patient_id,
            name: log.patient_name,
            age: log.patient_age,
            gender: log.patient_gender,
            assessor: log.assessor_name,
            session_type: log.session_type
        },
        session: {
            date: log.date,
            module: log.module_type,
            risk_level: log.risk_level,
            notes: log.session_notes
        },
        measurements: log.measurements,
        interpretation: log.interpretation,
        recommendations: log.recommendations
    };
}
function ReportsView({
    history,
    activeReportPreview,
    setActiveReportPreview,
    onClosePreview
}) {
    const handleArchiveDownload = log => {
        // Open the preview AND immediately download the PDF from a single click
        setActiveReportPreview(log);
        window.PF_Reports.downloadClientPDF(buildReportDataFromLog(log));
    };
    return /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in"
    }, !activeReportPreview ? /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: {
            padding: 24
        }
    }, /*#__PURE__*/React.createElement("div", {
        className: "dashboard-card-header"
    }, /*#__PURE__*/React.createElement("h3", null, "Assessment Reports Archive")), history.length === 0 ? /*#__PURE__*/React.createElement("p", {
        style: {
            color: "var(--text-muted)",
            textAlign: "center",
            padding: "40px 0"
        }
    }, "No reports found.") : /*#__PURE__*/React.createElement("div", {
        className: "table-container"
    }, /*#__PURE__*/React.createElement("table", {
        className: "custom-table"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Patient Name"), /*#__PURE__*/React.createElement("th", null, "Patient ID"), /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Assessor"), /*#__PURE__*/React.createElement("th", null, "Module"), /*#__PURE__*/React.createElement("th", null, "Risk Level"), /*#__PURE__*/React.createElement("th", null, "Action"))), /*#__PURE__*/React.createElement("tbody", null, history.map((log, idx) => /*#__PURE__*/React.createElement("tr", {
        key: idx
    }, /*#__PURE__*/React.createElement("td", {
        style: {
            fontWeight: 600
        }
    }, log.patient_name), /*#__PURE__*/React.createElement("td", {
        style: {
            color: "var(--text-purple)",
            fontFamily: "monospace"
        }
    }, log.patient_id), /*#__PURE__*/React.createElement("td", null, log.date), /*#__PURE__*/React.createElement("td", null, log.assessor_name), /*#__PURE__*/React.createElement("td", null, log.module_type), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
        className: `badge ${log.risk_level.includes("Significant") ? "badge-danger" : log.risk_level.includes("Mild") ? "badge-warning" : "badge-success"}`
    }, log.risk_level)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        style: {
            padding: "6px 12px",
            fontSize: 12
        },
        onClick: () => handleArchiveDownload(log)
    }, "View & Download")))))))) : /*#__PURE__*/React.createElement("div", {
        className: "animate-fade-in",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: 20
        }
    }, /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
        }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: onClosePreview
    }, "Back to Archive"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: () => window.PF_Reports.downloadClientPDF(buildReportDataFromLog(activeReportPreview))
    }, "Download PDF")), /*#__PURE__*/React.createElement(ReportCanvasPreview, {
        reportData: buildReportDataFromLog(activeReportPreview)
    })));
}
// Settings View (Local Data Management, No Backend/Supabase)
function SettingsView({
    dbState,
    setDbState,
    onBack
}) {
    const [message, setMessage] = useState("");
    const handleExport = () => {
        const exportData = {
            pf_patients: JSON.parse(localStorage.getItem("pf_patients") || "[]"),
            pf_sessions: JSON.parse(localStorage.getItem("pf_sessions") || "[]"),
            exported_at: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json"
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `postureflex_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        setMessage("Backup file downloaded successfully!");
        setTimeout(() => setMessage(""), 3000);
    };
    const handleClear = () => {
        if (window.confirm("This will permanently delete all locally stored patients and assessment sessions from this browser. Continue?")) {
            localStorage.removeItem("pf_patients");
            localStorage.removeItem("pf_sessions");
            setMessage("All local assessment data has been cleared.");
            setTimeout(() => setMessage(""), 3000);
        }
    };
    return /*#__PURE__*/React.createElement("div", {
        className: "glass animate-fade-in",
        style: {
            padding: 32,
            maxWidth: 600,
            margin: "0 auto"
        }
    }, /*#__PURE__*/React.createElement("h3", {
        style: {
            marginBottom: 20
        }
    }, "Local Data Management"), message && /*#__PURE__*/React.createElement("div", {
        className: "badge badge-success",
        style: {
            display: "block",
            padding: 12,
            marginBottom: 20,
            textAlign: "center"
        }
    }, message), /*#__PURE__*/React.createElement("div", {
        style: {
            marginBottom: 24
        }
    }, /*#__PURE__*/React.createElement("p", {
        style: {
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.6
        }
    }, "PostureFlex runs entirely in your browser — no server or cloud database is required. All patients and assessment sessions are stored locally using your browser's storage. Use the options below to back up or reset that data.")), /*#__PURE__*/React.createElement("div", {
        style: {
            display: "flex",
            flexDirection: "column",
            gap: 12
        }
    }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        className: "btn btn-primary",
        onClick: handleExport
    }, "Download Backup (JSON)"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        className: "btn btn-secondary",
        style: {
            borderColor: "#dc2626",
            color: "#f87171"
        },
        onClick: handleClear
    }, "Clear All Local Data"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        className: "btn btn-secondary",
        onClick: onBack
    }, "Back to Station")), /*#__PURE__*/React.createElement("div", {
        style: {
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid var(--border-color)",
            fontSize: 13,
            color: "var(--text-muted)"
        }
    }, /*#__PURE__*/React.createElement("h4", {
        style: {
            color: "white",
            marginBottom: 10
        }
    }, "Storage Information"), /*#__PURE__*/React.createElement("p", null, "Data persists in this browser only, tied to this device and browser profile. Clearing browser site data, using a different browser, or using private/incognito mode will not preserve your records — use the backup option regularly if you need durability.")));
}
// Row component for Angle Summary
function AngleRow({
    label,
    val,
    refRange,
    status
}) {
    let statusClass = "text-success";
    if (status.includes("Significant")) statusClass = "text-danger"; else if (status.includes("Mild")) statusClass = "text-warning";
    return /*#__PURE__*/React.createElement("div", {
        className: "angle-row"
    }, /*#__PURE__*/React.createElement("div", {
        className: "angle-label"
    }, /*#__PURE__*/React.createElement("span", {
        className: "angle-name"
    }, label), /*#__PURE__*/React.createElement("span", {
        className: "angle-ref"
    }, "Ref: ", refRange)), /*#__PURE__*/React.createElement("div", {
        className: "angle-value-box"
    }, /*#__PURE__*/React.createElement("span", {
        className: "angle-val"
    }, Math.round(val), "°"), /*#__PURE__*/React.createElement("span", {
        className: `angle-name ${statusClass}`,
        style: {
            fontSize: 12
        }
    }, status)));
}
// Report Render Page Canvas Preview Component
function ReportCanvasPreview({
    reportData
}) {
    const patient = reportData.patient || {};
    const session = reportData.session || {};
    const measurements = reportData.measurements || [];
    const interpretation = reportData.interpretation || "";
    const recommendations = reportData.recommendations || [];
    return /*#__PURE__*/React.createElement("div", {
        className: "report-scroll-container"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-canvas"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-header"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-logo"
    }, "PostureFlex"), /*#__PURE__*/React.createElement("div", {
        className: "report-type"
    }, /*#__PURE__*/React.createElement("div", null, session.module === "BPT2" ? "CLINICAL POSTURE SCREENING REPORT" : "CLINICAL SQUAT ASSESSMENT REPORT"), /*#__PURE__*/React.createElement("div", {
        style: {
            fontSize: 9,
            fontWeight: 500,
            color: "#6b7280",
            marginTop: 2
        }
    }, "Generated: ", session.date))), /*#__PURE__*/React.createElement("div", {
        className: "report-grid-meta"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-meta-col"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Patient Name:"), /*#__PURE__*/React.createElement("span", {
        className: "report-meta-val"
    }, patient.name || "N/A")), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Patient ID:"), /*#__PURE__*/React.createElement("span", {
        className: "report-meta-val",
        style: {
            fontFamily: "monospace"
        }
    }, patient.patient_id || "N/A")), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Age / Gender:"), /*#__PURE__*/React.createElement("span", {
        className: "report-meta-val"
    }, patient.age, " yrs / ", patient.gender))), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-col"
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Session Type:"), /*#__PURE__*/React.createElement("span", {
        className: "report-meta-val"
    }, patient.session_type || "Initial")), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Module Used:"), /*#__PURE__*/React.createElement("span", {
        className: "report-meta-val",
        style: {
            fontWeight: 700
        }
    }, session.module || "BPT1")), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Overall Alignment:"), /*#__PURE__*/React.createElement("span", {
        className: `report-meta-val ${session.risk_level?.includes("Significant") ? "text-danger" : session.risk_level?.includes("Mild") ? "text-warning" : "text-success"}`,
        style: {
            fontWeight: 700
        }
    }, session.risk_level || "Normal")))), reportData.images && reportData.images.length > 0 ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Visual Analysis Captures (4-View Posture Screening)"), /*#__PURE__*/React.createElement("div", {
        className: "report-image-grid"
    }, reportData.images.map((img, idx) => /*#__PURE__*/React.createElement("div", {
        key: idx,
        className: "report-image-grid-item"
    }, /*#__PURE__*/React.createElement("img", {
        src: img.base64
    }), /*#__PURE__*/React.createElement("span", null, img.label))))) : reportData.image_base64 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Visual Landmark Frame"), /*#__PURE__*/React.createElement("div", {
        className: "report-image-container"
    }, /*#__PURE__*/React.createElement("img", {
        src: reportData.image_base64,
        className: "report-image"
    }))), /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Biomechanical Joints Summary"), /*#__PURE__*/React.createElement("table", {
        className: "report-table"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Parameter"), /*#__PURE__*/React.createElement("th", null, "Side"), /*#__PURE__*/React.createElement("th", null, "Measured Angle"), /*#__PURE__*/React.createElement("th", null, "Reference normal"), /*#__PURE__*/React.createElement("th", null, "Deviation"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, measurements.map((m, idx) => /*#__PURE__*/React.createElement("tr", {
        key: idx
    }, /*#__PURE__*/React.createElement("td", null, m.joint), /*#__PURE__*/React.createElement("td", null, m.side), /*#__PURE__*/React.createElement("td", {
        style: {
            fontWeight: 600
        }
    }, Math.round(m.angle), "°"), /*#__PURE__*/React.createElement("td", null, m.reference), /*#__PURE__*/React.createElement("td", null, m.deviation, "°"), /*#__PURE__*/React.createElement("td", {
        className: m.status.includes("Significant") ? "text-danger" : m.status.includes("Mild") ? "text-warning" : "text-success"
    }, m.status))))), /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Clinical Interpretation"), /*#__PURE__*/React.createElement("div", {
        className: "report-remarks"
    }, interpretation), /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Corrective Exercises Recommendations"), /*#__PURE__*/React.createElement("ul", {
        className: "report-recs"
    }, recommendations.map((r, idx) => /*#__PURE__*/React.createElement("li", {
        key: idx
    }, r))), /*#__PURE__*/React.createElement("div", {
        className: "report-footer"
    }, /*#__PURE__*/React.createElement("span", null, "Generated by PostureFlex Station • Faculty Dr. Nalla Assessed"), /*#__PURE__*/React.createElement("span", null, "Assessor Signature: ____________________________"))));
}
// Mount the React Application
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
