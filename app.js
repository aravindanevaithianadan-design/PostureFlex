/* PostureFlex Main React Application */
const {
    useState,
    useEffect,
    useRef
} = React;

// Maps internal module codes (BPT1/BPT2) to their user-facing display labels.
// Internal code values are left unchanged everywhere else (routing, storage,
// conditional logic) -- only the text shown to the user is affected.
function getModuleDisplayName(moduleCode) {
    if (moduleCode === "BPT2") return "Posture Analysis";
    return "Squat Analysis"; // default / BPT1
}
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

    // Mobile off-canvas sidebar toggle state
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
        isMobileOpen: mobileSidebarOpen,
        onNavigate: route => {
            // Clean up camera if moving away from bpt1
            setCurrentRoute(route);
            setMobileSidebarOpen(false);
        },
        onStartModule: moduleName => {
            handleStartAssessment(moduleName);
            setMobileSidebarOpen(false);
        },
        onLogout: handleLogout
    }), currentRoute !== "login" && mobileSidebarOpen && /*#__PURE__*/React.createElement("div", {
        className: "sidebar-overlay",
        onClick: () => setMobileSidebarOpen(false)
    }), /*#__PURE__*/React.createElement("div", {
        className: "main-content",
        style: {
            marginLeft: currentRoute === "login" ? "0" : "260px"
        }
    }, currentRoute !== "login" && /*#__PURE__*/React.createElement(TopHeader, {
        user: userSession,
        dbState: dbState,
        onSettings: () => setCurrentRoute("settings"),
        onToggleSidebar: () => setMobileSidebarOpen(prev => !prev)
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
    onLogout,
    isMobileOpen,
    onStartModule
}) {
    return /*#__PURE__*/React.createElement("aside", {
        className: "sidebar" + (isMobileOpen ? " sidebar-open" : "")
    }, /*#__PURE__*/React.createElement("div", {
        className: "sidebar-logo"
    }, /*#__PURE__*/React.createElement("div", {
        className: "logo-icon"
    }, /*#__PURE__*/React.createElement("img", {
        src: "https://github.com/aravindanevaithianadan-design/PostureFlex/blob/main/physio%20login%20logo1.png?raw=true",
        alt: "PostureFlex logo",
        width: 48,
        height: 48,
        decoding: "async"
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
        onClick: () => onStartModule("bpt1")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    })), "SQUAT ANALYSIS (Live Camera)"), /*#__PURE__*/React.createElement("li", {
        className: `menu-item ${currentRoute === "bpt2" ? "active" : ""}`,
        onClick: () => onStartModule("bpt2")
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    })), "POSTURE ANALYSIS (4-View Posture Scan)"), /*#__PURE__*/React.createElement("li", {
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
    onSettings,
    onToggleSidebar
}) {
    return /*#__PURE__*/React.createElement("header", {
        className: "top-header"
    }, /*#__PURE__*/React.createElement("div", {
        className: "header-title"
    }, /*#__PURE__*/React.createElement("button", {
        type: "button",
        className: "hamburger-btn",
        "aria-label": "Toggle navigation menu",
        onClick: onToggleSidebar
    }, /*#__PURE__*/React.createElement("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M4 6h16M4 12h16M4 18h16"
    }))), /*#__PURE__*/React.createElement("img", {
        src: "https://github.com/aravindanevaithianadan-design/PostureFlex/blob/main/IMG_20240503_090818-removebg-preview.png?raw=true",
        alt: "Sri Manakula Vinayagar Engineering College logo",
        className: "header-logo",
        width: 74,
        height: 74,
        decoding: "async"
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
    const [showPassword, setShowPassword] = useState(false);
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
        src: "https://github.com/aravindanevaithianadan-design/PostureFlex/blob/main/physio%20login%20logo1.png?raw=true",
        alt: "PostureFlex logo",
        width: 96,
        height: 96,
        decoding: "async"
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
        onChange: e => setUsername(e.target.value),
        required: true,
        placeholder: "Enter User ID"
    })), /*#__PURE__*/React.createElement("div", {
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Password"), /*#__PURE__*/React.createElement("div", {
        className: "password-field-wrap"
    }, /*#__PURE__*/React.createElement("input", {
        type: showPassword ? "text" : "password",
        className: "form-control",
        onChange: e => setPassword(e.target.value),
        required: true,
        placeholder: "Enter Password"
    }), /*#__PURE__*/React.createElement("button", {
        type: "button",
        className: "password-toggle-btn",
        onClick: () => setShowPassword(prev => !prev),
        "aria-label": showPassword ? "Hide password" : "Show password",
        tabIndex: -1
    }, showPassword ? /*#__PURE__*/React.createElement("svg", {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
        d: "M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.29 20.29 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"
    }), /*#__PURE__*/React.createElement("line", {
        x1: 1,
        y1: 1,
        x2: 23,
        y2: 23
    })) : /*#__PURE__*/React.createElement("svg", {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
        d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
    }), /*#__PURE__*/React.createElement("circle", {
        cx: 12,
        cy: 12,
        r: 3
    }))))), /*#__PURE__*/React.createElement("button", {
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
    const [notes, setNotes] = useState("");
    // Generate a sequential patient ID on mount: DD (day) + MM (month) + NN (patient count for that day, resets daily)
    useEffect(() => {
        (async () => {
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, "0");
            const mm = String(now.getMonth() + 1).padStart(2, "0");
            const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD, used to detect the current day
            let seq = 1;
            try {
                const existingPatients = await window.PF_DB.getPatients();
                const todaysPatients = (existingPatients || []).filter(p => {
                    if (!p.created_at) return false;
                    return p.created_at.split("T")[0] === todayStr;
                });
                seq = todaysPatients.length + 1;
            } catch (e) {
                seq = 1;
            }
            setPatientId(`${dd}${mm}${String(seq).padStart(2, "0")}`);
        })();
    }, []);
    const handleSubmit = e => {
        e.preventDefault();
        onSubmit({
            name,
            age: parseInt(age),
            gender,
            patient_id: patientId,
            session_type: sessionType,
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
        className: "form-group"
    }, /*#__PURE__*/React.createElement("label", null, "Patient ID (Auto-generated, editable)"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        className: "form-control",
        value: patientId,
        onChange: e => setPatientId(e.target.value)
    })), /*#__PURE__*/React.createElement("div", {
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
    }, getModuleDisplayName(log.module_type))), /*#__PURE__*/React.createElement("td", null, log.session_type), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
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
// Corrects a captured frame before it's frozen into a report image. The live
// overlay <canvas> always bakes a horizontal mirror into its raw pixels (the
// video is drawn selfie-style via a ctx-level flip, and overlay points are
// manually mirrored to match -- see drawBPT1ViewOverlay/drawBPT2ViewOverlay
// below). That ctx-level bake happens unconditionally, on every camera --
// front or rear -- so the on-screen ".mirrored" CSS class (transform:
// scaleX(-1)) that cancels it back out must ALSO be applied unconditionally,
// and the "CORRECT POSTURE" badge text is pre-mirrored specifically to
// cancel out that same CSS flip (see the note above drawCorrectPostureBadge).
// Bug history: this class used to be applied only when isFrontCamera was
// true. On laptops the browser always hands back a front-facing webcam, so
// that happened to always be true and everything cancelled out correctly.
// On phones this app asks for (and usually gets) the rear camera for
// clinical shots, so isFrontCamera was false there -- the unconditional
// pixel-level bake was never cancelled back out, and the live video,
// skeleton overlay, and badge text all displayed mirrored/backwards on
// mobile even though the underlying analysis (and the PDF, which re-corrects
// the image independently below) was correct the whole time. A still image
// never gets that CSS applied, so a raw canvasElement.toDataURL() snapshot
// came out with the person mirrored and the badge text backwards. Re-flipping
// the snapshot once more here (only for the saved/report image, never the
// live view) undoes the baked-in mirror: the photo ends up in its true,
// non-mirrored orientation and the badge text reads correctly in the
// on-screen preview and exported PDF.
function captureCorrectedFrame(sourceCanvas) {
    if (!sourceCanvas) return null;
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    octx.translate(w, 0);
    octx.scale(-1, 1);
    octx.drawImage(sourceCanvas, 0, 0, w, h);
    return offscreen.toDataURL('image/png');
}
// BPT1 Module View (Webcam live capture)
// 4-side static capture config for Module 1 squat visual documentation (Anterior view
// reuses the live-tracked freeze frame; Posterior/Lateral views are additional static
// captures added to the report images, same pattern as BPT2's 4-view scan).
const BPT1_VIEW_CONFIG = [
    { key: "anterior", label: "Anterior View (Squat Depth)", instructions: "Face the camera directly at the lowest point of the squat." },
    { key: "posterior", label: "Posterior View (Squat Depth)", analyzeFn: "analyzePosteriorView", instructions: "Turn so your back faces the camera and repeat the squat to the same depth." },
    { key: "rightLateral", label: "Right Lateral View (Squat Depth)", analyzeFn: "analyzeRightLateralView", instructions: "Show your right side profile to the camera and repeat the squat to the same depth." },
    { key: "leftLateral", label: "Left Lateral View (Squat Depth)", analyzeFn: "analyzeLeftLateralView", instructions: "Show your left side profile to the camera and repeat the squat to the same depth." }
];
function BPT1Module({
    assessment,
    onSaveAssessment,
    onCancel
}) {
    const [step, setStep] = useState(2); // 1 intake (completed), 2 live capture, 3 additional-views capture, 4 preview report
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
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    const [multiViewIndex, setMultiViewIndex] = useState(0); // index into BPT1_VIEW_CONFIG for step 3 (starts at 1: posterior)
    const [multiViewMetrics, setMultiViewMetrics] = useState(null); // live neck/shoulder/knee metrics for the active step-3 view
    const [capturedViews, setCapturedViews] = useState({}); // { anterior: base64, posterior: {image,analysis,label}, rightLateral: {...}, leftLateral: {...} }
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const poseRef = useRef(null);
    const cameraRef = useRef(null);
    const frozenFrameRef = useRef(null); // stores captured image data URL
    const finalRecordRef = useRef(null); // holds finalAssessment/interpretation/recommendations from the anterior capture
    const multiViewIndexRef = useRef(0); // mirrors multiViewIndex for use inside the pose onResults closure
    const multiViewAnalysisRef = useRef(null); // holds the latest live analysis result for the active step-3 view
    const latestLandmarksRef = useRef(null); // holds the most recent raw pose landmarks from the Module 1 squat feed, used to compute Anterior alignment metrics at freeze time
    // Throttles React state updates (UI numbers/text) driven by the pose
    // onResults callback to ~8/sec instead of the full camera frame rate.
    // The canvas skeleton/grid overlay itself is still redrawn every frame
    // below (so the on-screen animation stays perfectly smooth) -- only the
    // comparatively expensive React re-renders and evaluatePosture() calls,
    // which don't need to run faster than a human can read the numbers, are
    // throttled. This is the single biggest CPU/battery saving on mobile.
    const lastUIUpdateRef = useRef(0);
    const UI_UPDATE_INTERVAL_MS = 120;
    useEffect(() => {
        multiViewIndexRef.current = multiViewIndex;
    }, [multiViewIndex]);
    // Start video on mount
    useEffect(() => {
        if (step === 2) {
            startCamera();
        } else if (step === 3) {
            startMultiViewCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [step]);
    // The decorative aurora background is fully hidden behind the camera view
    // during live capture anyway -- pausing its animation there frees up GPU
    // compositing work for the pose overlay without any visible change.
    useEffect(() => {
        const active = step === 2 || step === 3;
        document.body.classList.toggle("camera-active", active);
        return () => document.body.classList.remove("camera-active");
    }, [step]);
    // Live camera feed for the additional-view captures (step 3): runs the same
    // view-specific biomechanical analysis used by BPT2 (Posterior / Right Lateral /
    // Left Lateral), drawing the joint/angle overlay ("grid view") and analyzing
    // neck, shoulder, and knee alignment for each view -- not just the Anterior view.
    const startMultiViewCamera = async () => {
        setVideoActive(true);
        setOutOfFrame(true);
        setTimeout(async () => {
            const videoElement = videoRef.current;
            const canvasElement = canvasRef.current;
            if (!videoElement || !canvasElement) return;
            const canvasCtx = canvasElement.getContext('2d', { alpha: false });

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

                const activeConfig = BPT1_VIEW_CONFIG[multiViewIndexRef.current];
                if (results.poseLandmarks && activeConfig && activeConfig.analyzeFn) {
                    const result = window.PF_Pose[activeConfig.analyzeFn](results.poseLandmarks);
                    if (!result.outOfFrame) {
                        multiViewAnalysisRef.current = result;
                        // Module 1 (BPT1)-specific overlay: Posterior view draws a
                        // trunk-alignment line (parallel to the spine) with a neck
                        // point instead of the head/ear line. Module 2 (BPT2) is
                        // untouched and still uses drawBPT2ViewOverlay below.
                        // Redrawn every frame (not throttled) for smooth animation.
                        drawBPT1ViewOverlay(canvasCtx, activeConfig.key, result.points);
                    } else {
                        multiViewAnalysisRef.current = null;
                    }
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setTrackingConfidence(result.confidence || 0);
                        setOutOfFrame(!!result.outOfFrame);
                        setMultiViewMetrics(result.outOfFrame ? null : result.metrics);
                    }
                } else {
                    multiViewAnalysisRef.current = null;
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setOutOfFrame(true);
                        setMultiViewMetrics(null);
                    }
                }
            });
            poseRef.current = poseInstance;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 640,
                        height: 480,
                        facingMode: { ideal: "environment" }
                    }
                });
                const [videoTrack] = stream.getVideoTracks();
                const actualFacingMode = videoTrack && videoTrack.getSettings ? videoTrack.getSettings().facingMode : undefined;
                setIsFrontCamera(actualFacingMode !== "environment");
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
    const startCamera = async () => {
        setVideoActive(true);

        // Wait for elements to render
        setTimeout(async () => {
            const videoElement = videoRef.current;
            const canvasElement = canvasRef.current;
            if (!videoElement || !canvasElement) return;
            const canvasCtx = canvasElement.getContext('2d', { alpha: false });

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
                    // Keep the most recent raw landmarks around so the freeze
                    // snapshot can compute Anterior alignment metrics (Neck,
                    // Shoulder, Trunk, Hip, Knee, Ankle) the same way the
                    // Posterior/Lateral static captures do.
                    latestLandmarksRef.current = results.poseLandmarks;
                    // Execute Biomechanics analysis
                    const analysis = window.PF_Pose.analyzeLandmarks(results.poseLandmarks);
                    if (!analysis.outOfFrame) {
                        // Draw skeleton overlays every frame (not throttled) so the
                        // on-screen grid/animation stays perfectly smooth.
                        drawPostureOverlays(canvasCtx, results.poseLandmarks, analysis);
                    }
                    // UI numbers (confidence, squat state, angles, assessment) only
                    // need to refresh a few times a second to be readable -- this
                    // also skips the fairly heavy evaluatePosture() computation on
                    // frames we're going to throttle anyway.
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setTrackingConfidence(analysis.confidence);
                        setOutOfFrame(analysis.outOfFrame);
                        if (!analysis.outOfFrame) {
                            setSquatState(analysis.squatState);
                            setLiveAngles(analysis.angles);

                            // Run active assessment
                            const assessmentData = window.PF_Pose.evaluatePosture(analysis);
                            setAssessmentRecord(assessmentData);
                        }
                    }
                } else {
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setOutOfFrame(true);
                    }
                }
            });
            poseRef.current = poseInstance;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 640,
                        height: 480,
                        facingMode: { ideal: "environment" }
                    }
                });
                // Determine which physical camera we actually got, so the mirror
                // effect only applies to front-facing cameras (rear camera feeds
                // should never be mirrored, especially for clinical L/R accuracy)
                const [videoTrack] = stream.getVideoTracks();
                const actualFacingMode = videoTrack && videoTrack.getSettings ? videoTrack.getSettings().facingMode : undefined;
                setIsFrontCamera(actualFacingMode !== "environment");
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
        // Clinical-style "measurement reticle": a crosshair + ring marker used on
        // the toe/foot-index landmarks to visually flag them as precision
        // measurement points (distinct from the plain joint-circle markers),
        // giving the foot-alignment readout a more professional instrument look.
        const drawMeasurementReticle = (lm, color) => {
            const x = 640 - lm.x * 640;
            const y = lm.y * 480;
            const r = 9;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - r - 6, y); ctx.lineTo(x - r + 3, y);
            ctx.moveTo(x + r - 3, y); ctx.lineTo(x + r + 6, y);
            ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - r + 3);
            ctx.moveTo(x, y + r - 3); ctx.lineTo(x, y + r + 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        };
        const lShoulder = landmarks[11];
        const rShoulder = landmarks[12];
        const lHip = landmarks[23];
        const rHip = landmarks[24];
        const lKnee = landmarks[25];
        const rKnee = landmarks[26];
        const lAnkle = landmarks[27];
        const rAnkle = landmarks[28];
        const lFoot = landmarks[31];
        const rFoot = landmarks[32];
        const angles = analysis.angles;
        const colorNormal = "#10b981"; // Emerald
        const colorDev = "#ef4444"; // Red
        // Single source of truth for Module 1's clinical bounds (from pose.js,
        // sourced directly from the clinical squat chart) -- avoids duplicating
        // magic numbers here that can silently drift out of sync.
        const STD = window.PF_Pose.standards;

        // --- Trunk Lean "default reference guide line" ---------------------
        // A fixed plumb-line + shaded wedge showing the chart's normal trunk
        // lean corridor (30deg-45deg from vertical), anchored at the hip. The
        // person's actual trunk line is compared against this default graph
        // line in real time so any deviation is immediately visible, and the
        // same avgTrunk value drives the PDF/report deviation numbers.
        const hipMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        const shoulderMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
        const trunkColor = analysis.depthPct > 40
            ? (angles.avgTrunk >= STD.trunk.minNormal && angles.avgTrunk <= STD.trunk.maxNormal ? colorNormal : colorDev)
            : "white";
        const drawTrunkLeanGuide = (hip, shoulder) => {
            const p0x = 640 - hip.x * 640, p0y = hip.y * 480;
            const p1x = 640 - shoulder.x * 640, p1y = shoulder.y * 480;
            const L = Math.hypot(p1x - p0x, p1y - p0y) || 1;
            const leanDir = (p1x - p0x) >= 0 ? 1 : -1; // which side the shoulder leans toward on screen
            const boundaryPoint = angleDeg => {
                const rad = angleDeg * Math.PI / 180;
                return { x: p0x + leanDir * L * Math.sin(rad), y: p0y - L * Math.cos(rad) };
            };
            const minB = boundaryPoint(STD.trunk.minNormal); // 30°
            const maxB = boundaryPoint(STD.trunk.maxNormal); // 45°

            // Shaded normal-zone wedge between the 30° and 45° boundary lines
            ctx.beginPath();
            ctx.moveTo(p0x, p0y);
            ctx.lineTo(minB.x, minB.y);
            ctx.lineTo(maxB.x, maxB.y);
            ctx.closePath();
            ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
            ctx.fill();

            ctx.save();
            ctx.setLineDash([6, 5]);
            // Dashed true-vertical plumb line (0° reference)
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p0x, p0y);
            ctx.lineTo(p0x, p0y - L);
            ctx.stroke();
            // Dashed 30°/45° boundary lines (the chart's normal-zone edges)
            ctx.strokeStyle = "rgba(16, 185, 129, 0.7)";
            ctx.beginPath();
            ctx.moveTo(p0x, p0y); ctx.lineTo(minB.x, minB.y);
            ctx.moveTo(p0x, p0y); ctx.lineTo(maxB.x, maxB.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        };
        drawTrunkLeanGuide(hipMid, shoulderMid);

        // Squat-depth reference guide (hip/knee level) + "CORRECT POSTURE"
        // badge -- present on Posterior/Lateral views and the BPT2 4-view
        // scan, but previously missing here on the Anterior live-squat feed
        // since this view uses its own overlay function.
        drawSquatDepthGuide(ctx, hipMid.y * 480, (lKnee.y + rKnee.y) / 2 * 480);

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

        // Actual trunk-alignment line (hip midpoint -> shoulder midpoint), drawn
        // thick and colored against the guide above so deviation from the
        // default reference line reads instantly: green = within 30°-45°, red = deviated.
        drawBoneLine(hipMid, shoulderMid, trunkColor, 4);

        // 2. Draw joint circle markers
        drawJointCircle(lShoulder, "white");
        drawJointCircle(rShoulder, "white");

        // Dynamic color for knee based on the clinical chart's flexion target
        const lKneeColor = angles.leftKnee >= STD.knee.minNormal && angles.leftKnee <= STD.knee.maxNormal ? colorNormal : analysis.depthPct > 40 ? colorDev : "#6366f1";
        const rKneeColor = angles.rightKnee >= STD.knee.minNormal && angles.rightKnee <= STD.knee.maxNormal ? colorNormal : analysis.depthPct > 40 ? colorDev : "#6366f1";
        drawJointCircle(lKnee, lKneeColor);
        drawJointCircle(rKnee, rKneeColor);

        // Dynamic color for hip based on the clinical chart's flexion target
        const lHipColor = angles.leftHip >= STD.hip.minNormal && angles.leftHip <= STD.hip.maxNormal ? colorNormal : analysis.depthPct > 40 ? colorDev : "white";
        const rHipColor = angles.rightHip >= STD.hip.minNormal && angles.rightHip <= STD.hip.maxNormal ? colorNormal : analysis.depthPct > 40 ? colorDev : "white";
        drawJointCircle(lHip, lHipColor);
        drawJointCircle(rHip, rHipColor);

        // Shared grid-alignment palette (kept consistent with the Module 1
        // static-view overlays for Posterior/Right Lateral/Left Lateral)
        const ANKLE_COLOR = "#facc15"; // yellow
        const HAND_COLOR = "#a78bfa";  // violet

        // 2a. Ankle grid-alignment: reticle marker (instead of a plain dot) so
        // the ankle reads as a precision measurement point like the toe below.
        drawMeasurementReticle(lAnkle, ANKLE_COLOR);
        drawMeasurementReticle(rAnkle, ANKLE_COLOR);

        // 2b. Foot/toe alignment grid: ankle -> toe segment, color-coded against
        // the clinical chart's Ankle Dorsiflexion range, with a
        // measurement-reticle marker at each toe landmark.
        const lAnkleColor = angles.leftAnkle >= STD.ankle.minNormal && angles.leftAnkle <= STD.ankle.maxNormal ? colorNormal : colorDev;
        const rAnkleColor = angles.rightAnkle >= STD.ankle.minNormal && angles.rightAnkle <= STD.ankle.maxNormal ? colorNormal : colorDev;
        if (lFoot) {
            drawBoneLine(lAnkle, lFoot, lAnkleColor, 2.5);
            drawMeasurementReticle(lFoot, lAnkleColor);
        }
        if (rFoot) {
            drawBoneLine(rAnkle, rFoot, rAnkleColor, 2.5);
            drawMeasurementReticle(rFoot, rAnkleColor);
        }

        // 2c. Hand/wrist joint grid-alignment: shoulder -> wrist reference line
        // with a reticle marker at each wrist.
        const lWrist = landmarks[15];
        const rWrist = landmarks[16];
        if (lWrist) {
            drawBoneLine(lShoulder, lWrist, HAND_COLOR, 2.5);
            drawMeasurementReticle(lWrist, HAND_COLOR);
        }
        if (rWrist) {
            drawBoneLine(rShoulder, rWrist, HAND_COLOR, 2.5);
            drawMeasurementReticle(rWrist, HAND_COLOR);
        }
        // 3. Draw text overlays
        drawAngleLabel(lKnee, `${Math.round(angles.leftKnee)}°`, lKneeColor);
        drawAngleLabel(rKnee, `${Math.round(angles.rightKnee)}°`, rKneeColor);
        drawAngleLabel(lHip, `${Math.round(angles.leftHip)}°`, lHipColor);
        drawAngleLabel(rHip, `${Math.round(angles.rightHip)}°`, rHipColor);
        if (lFoot) drawAngleLabel(lFoot, `${Math.round(angles.leftAnkle)}°`, lAnkleColor);
        if (rFoot) drawAngleLabel(rFoot, `${Math.round(angles.rightAnkle)}°`, rAnkleColor);

        // Trunk Angle label next to shoulders, colored against the default
        // reference guide line above (green = within the chart's 30°-45° zone)
        drawAngleLabel(lShoulder, `Trunk: ${Math.round(angles.avgTrunk)}°`, trunkColor);
    };
    const handleFreezeSnapshot = () => {
        const canvasElement = canvasRef.current;
        if (!canvasElement) return;

        // Extract snapshot as DataURL (un-mirrored so the saved/report image
        // shows true orientation and the CORRECT POSTURE badge, if visible,
        // reads correctly instead of backwards)
        const dataUrl = captureCorrectedFrame(canvasElement);
        frozenFrameRef.current = dataUrl;

        // Stop Camera feed
        stopCamera();

        // Set up final clinical records (measurements come from this anterior,
        // live-tracked capture -- the additional views captured next are for
        // visual documentation only and don't change these values)
        const finalAssessment = assessmentRecord || {
            overallStatus: "Normal",
            measurements: [],
            symmetryScore: 100
        };
        const interpretationText = window.PF_Pose.generateInterpretation(finalAssessment, squatState);
        const recommendationsText = window.PF_Pose.generateRecommendations(finalAssessment);
        // Anterior alignment metrics (Neck, Shoulder, Trunk, Hip, Knee, Ankle),
        // computed from the same freeze-frame landmarks, so the Anterior View
        // report section uses the same parameter set as Posterior/Lateral.
        const anteriorAnalysis = latestLandmarksRef.current
            ? window.PF_Pose.analyzeAnteriorView(latestLandmarksRef.current)
            : { view: "Anterior", outOfFrame: true };
        finalRecordRef.current = { finalAssessment, interpretationText, recommendationsText, anteriorAnalysis };
        setCapturedViews({ anterior: dataUrl });
        setMultiViewIndex(1); // move on to Posterior (index 1) for the next capture
        setStep(3); // Go to additional-views capture
    };
    const handleCaptureAdditionalView = () => {
        const canvasElement = canvasRef.current;
        const activeConfig = BPT1_VIEW_CONFIG[multiViewIndex];
        if (!canvasElement || !activeConfig) return;
        if (outOfFrame || !multiViewAnalysisRef.current) {
            alert("Patient not clearly detected. Please ensure the full body is visible before capturing this view.");
            return;
        }
        const dataUrl = captureCorrectedFrame(canvasElement);
        const updated = {
            ...capturedViews,
            [activeConfig.key]: { image: dataUrl, analysis: multiViewAnalysisRef.current, label: activeConfig.label }
        };
        setCapturedViews(updated);

        if (multiViewIndex < BPT1_VIEW_CONFIG.length - 1) {
            multiViewAnalysisRef.current = null;
            setMultiViewMetrics(null);
            setOutOfFrame(true);
            setMultiViewIndex(multiViewIndex + 1);
        } else {
            finalizeMultiViewReport(updated);
        }
    };
    const handleSkipAdditionalViews = () => {
        finalizeMultiViewReport(capturedViews);
    };
    const finalizeMultiViewReport = allViews => {
        stopCamera();
        const { finalAssessment, interpretationText, recommendationsText, anteriorAnalysis } = finalRecordRef.current || {
            finalAssessment: assessmentRecord || { overallStatus: "Normal", measurements: [], symmetryScore: 100 },
            interpretationText: window.PF_Pose.generateInterpretation(assessmentRecord, squatState),
            recommendationsText: window.PF_Pose.generateRecommendations(assessmentRecord),
            anteriorAnalysis: null
        };

        // Analyze the Anterior/Posterior/Right Lateral/Left Lateral captures
        // (neck, shoulder, trunk, hip, knee, and ankle/malleolar alignment)
        // using the Module 1-specific evaluator, so Anterior and Posterior
        // share the exact same parameter set (Neck/Head, Shoulder, Trunk,
        // Hip, Knee, Ankle) and only differ in which side of the body was
        // measured. The squat-depth flexion measurements captured live
        // (finalAssessment.measurements) are kept separately for the
        // interpretation/recommendation text and the on-screen live check,
        // but no longer double as the Anterior View report rows.
        const staticEval = window.PF_Pose.evaluateModule1StaticViews({
            anterior: anteriorAnalysis,
            posterior: allViews.posterior?.analysis,
            rightLateral: allViews.rightLateral?.analysis,
            leftLateral: allViews.leftLateral?.analysis
        });

        const combinedMeasurements = [...(finalAssessment.measurements || []), ...staticEval.measurements];
        // Overall risk is the average of every individual measurement's status
        // (Normal=0, Mild=1, Significant=2), not "any single Significant flag
        // wins" -- so a handful of significant deviations amid many normal/mild
        // ones no longer forces the whole report to read as Significant.
        const PF_STATUS_SCORE = { "Normal": 0, "Mild Deviation": 1, "Significant Deviation": 2 };
        const combinedStatusScores = combinedMeasurements.map(m => PF_STATUS_SCORE[m.status] ?? 0);
        const combinedAvgScore = combinedStatusScores.length > 0
            ? combinedStatusScores.reduce((sum, s) => sum + s, 0) / combinedStatusScores.length
            : 0;
        const combinedStatus = combinedAvgScore >= 1.5 ? "Significant Deviation" : combinedAvgScore >= 0.5 ? "Mild Deviation" : "Normal";

        // 4 separate view sections for the report, in the requested order:
        // Anterior, Posterior, Lateral (Left), Lateral (Right). Anterior and
        // Posterior now both come from the static-view evaluator's grouped
        // output, so their parameter lists line up 1-for-1.
        const viewSections = [
            { label: "Anterior View", rows: staticEval.viewSections?.anterior || [] },
            { label: "Posterior View", rows: staticEval.viewSections?.posterior || [] },
            { label: "Lateral View (Left)", rows: staticEval.viewSections?.leftLateral || [] },
            { label: "Lateral View (Right)", rows: staticEval.viewSections?.rightLateral || [] }
        ];

        const combinedInterpretation = staticEval.measurements.length > 0
            ? `${interpretationText} ${window.PF_Pose.generatePostureInterpretation(staticEval)}`
            : interpretationText;

        // Merge recommendation lists, de-duplicated, capped to a reasonable length
        const mergedRecs = [...recommendationsText, ...(staticEval.measurements.length > 0 ? window.PF_Pose.generatePostureRecommendations(staticEval) : [])];
        const combinedRecommendations = [...new Set(mergedRecs)].slice(0, 6);

        const imageOf = v => (typeof v === "string" ? v : v?.image) || null;

        setReportPreviewData({
            patient: {
                id: assessment.patient.id,
                patient_id: assessment.patient.patient_id,
                name: assessment.patient.name,
                age: assessment.patient.age,
                gender: assessment.patient.gender,
                session_type: assessment.session_type
            },
            session: {
                date: new Date().toLocaleDateString(),
                module: "BPT1",
                risk_level: combinedStatus,
                notes: assessment.notes
            },
            measurements: combinedMeasurements,
            viewSections: viewSections,
            image_base64: imageOf(allViews.anterior) || frozenFrameRef.current,
            images: BPT1_VIEW_CONFIG.map(v => ({
                label: v.label,
                base64: imageOf(allViews[v.key])
            })).filter(i => i.base64),
            interpretation: combinedInterpretation,
            recommendations: combinedRecommendations
        });
        setStep(4); // Go to preview
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
        className: `step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "2"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, "Analysis")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 3 ? "active" : step > 3 ? "completed" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "3"), /*#__PURE__*/React.createElement("div", {
        className: "step-label"
    }, step === 3 ? `View ${multiViewIndex + 1} of 4` : "4-Side Views")), /*#__PURE__*/React.createElement("div", {
        className: `step ${step === 4 ? "active" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
        className: "step-num"
    }, "4"), /*#__PURE__*/React.createElement("div", {
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
        className: "video-element mirrored",
        muted: true,
        style: {
            display: "none"
        }
    }), /*#__PURE__*/React.createElement("canvas", {
        ref: canvasRef,
        className: "canvas-element mirrored",
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
    }, "Left Knee Flexion (Ref: 30° - 50°)")), /*#__PURE__*/React.createElement("div", {
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
        refRange: "30° - 50°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Knee Flexion" && m.side === "Left")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Right Knee Flexion",
        val: liveAngles.rightKnee,
        refRange: "30° - 50°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Knee Flexion" && m.side === "Right")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Left Hip Flexion",
        val: liveAngles.leftHip,
        refRange: "55° - 70°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Hip Flexion" && m.side === "Left")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Right Hip Flexion",
        val: liveAngles.rightHip,
        refRange: "55° - 70°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Hip Flexion" && m.side === "Right")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Trunk Alignment",
        val: liveAngles.avgTrunk,
        refRange: "30° - 45°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Trunk Lean")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Left Ankle",
        val: liveAngles.leftAnkle,
        refRange: "50° - 55°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Ankle Alignment" && m.side === "Left")?.status || "Normal"
    }), /*#__PURE__*/React.createElement(AngleRow, {
        label: "Right Ankle",
        val: liveAngles.rightAnkle,
        refRange: "50° - 55°",
        status: assessmentRecord?.measurements?.find(m => m.joint === "Ankle Alignment" && m.side === "Right")?.status || "Normal"
    }))))), step === 3 && /*#__PURE__*/React.createElement("div", {
        className: "analysis-layout"
    }, /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: 16 }
    }, /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: { padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
        style: { margin: 0 }
    }, BPT1_VIEW_CONFIG[multiViewIndex].label), /*#__PURE__*/React.createElement("p", {
        style: { margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }
    }, BPT1_VIEW_CONFIG[multiViewIndex].instructions)), /*#__PURE__*/React.createElement("div", {
        className: "view-progress-dots"
    }, BPT1_VIEW_CONFIG.map((v, idx) => /*#__PURE__*/React.createElement("div", {
        key: v.key,
        className: `view-progress-dot ${capturedViews[v.key] ? "done" : idx === multiViewIndex ? "active" : ""}`,
        title: v.label
    })))), /*#__PURE__*/React.createElement("div", {
        className: "camera-panel"
    }, /*#__PURE__*/React.createElement("video", {
        ref: videoRef,
        className: "video-element mirrored",
        muted: true,
        style: { display: "none" }
    }), /*#__PURE__*/React.createElement("canvas", {
        ref: canvasRef,
        className: "canvas-element mirrored",
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
    }, BPT1_VIEW_CONFIG[multiViewIndex].instructions))), /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between" }
    }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-secondary",
        onClick: handleSkipAdditionalViews
    }, "Skip Remaining Views"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: handleCaptureAdditionalView,
        disabled: outOfFrame
    }, multiViewIndex < BPT1_VIEW_CONFIG.length - 1 ? `Capture & Continue to ${BPT1_VIEW_CONFIG[multiViewIndex + 1].label}` : "Capture & Finish"))), /*#__PURE__*/React.createElement("div", {
        className: "side-panel"
    }, /*#__PURE__*/React.createElement("div", {
        className: "glass",
        style: { padding: 20 }
    }, /*#__PURE__*/React.createElement("div", {
        className: "dashboard-card-header"
    }, /*#__PURE__*/React.createElement("h3", null, "Patient: ", assessment.patient.name), /*#__PURE__*/React.createElement("span", {
        className: "badge badge-success",
        style: { background: "rgba(139, 92, 246, 0.15)", color: "var(--text-purple)" }
    }, "Module Used : Squat Analysis")), /*#__PURE__*/React.createElement("p", {
        style: { color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }
    }, "Tracking Confidence: ", Math.round(trackingConfidence * 100), "%"), (multiViewMetrics ? Object.entries(multiViewMetrics) : []).length > 0 ? /*#__PURE__*/React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }
    }, Object.entries(multiViewMetrics).map(([key, val]) => /*#__PURE__*/React.createElement(AngleRow, {
        key: key,
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
        val: val,
        refRange: "≤ 2°-8°",
        status: val > 8 ? "Significant Deviation" : val > 2 ? "Mild Deviation" : "Normal"
    }))) : /*#__PURE__*/React.createElement("p", {
        style: { color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }
    }, "Align the patient in frame to begin live neck, shoulder, and knee tracking for this view."), /*#__PURE__*/React.createElement("p", {
        style: { color: "var(--text-muted)", fontSize: 13 }
    }, "Anterior-view squat measurements are already captured. Each additional view is live-tracked and analyzed (neck, shoulder, knee alignment) and added to the report -- use \"Skip Remaining Views\" at any point to finish with fewer than 4 images.")))), step === 4 && reportPreviewData && /*#__PURE__*/React.createElement("div", {
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
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const poseRef = useRef(null);
    const cameraRef = useRef(null);
    const viewIndexRef = useRef(0);
    const liveAnalysisRef = useRef(null);
    const lastUIUpdateRef = useRef(0);
    const UI_UPDATE_INTERVAL_MS = 120;


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
    // Pause the decorative aurora background during live capture (Module 2) --
    // it's fully covered by the camera view at that point, so pausing it is
    // invisible to the user but frees up GPU compositing work.
    useEffect(() => {
        const active = step === 2;
        document.body.classList.toggle("camera-active", active);
        return () => document.body.classList.remove("camera-active");
    }, [step]);

    const startCamera = async () => {
        setTimeout(async () => {
            const videoElement = videoRef.current;
            const canvasElement = canvasRef.current;
            if (!videoElement || !canvasElement) return;
            const canvasCtx = canvasElement.getContext('2d', { alpha: false });

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
                    if (!result.outOfFrame) {
                        liveAnalysisRef.current = result;
                        // Redrawn every frame (not throttled) for smooth animation.
                        drawBPT2ViewOverlay(canvasCtx, activeConfig.key, result.points);
                    } else {
                        liveAnalysisRef.current = null;
                    }
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setTrackingConfidence(result.confidence || 0);
                        setOutOfFrame(!!result.outOfFrame);
                        setLiveMetrics(result.outOfFrame ? null : result.metrics);
                    }
                } else {
                    liveAnalysisRef.current = null;
                    const now = performance.now();
                    if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
                        lastUIUpdateRef.current = now;
                        setOutOfFrame(true);
                    }
                }
            });
            poseRef.current = poseInstance;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: { ideal: "environment" } }
                });
                const [videoTrack] = stream.getVideoTracks();
                const actualFacingMode = videoTrack && videoTrack.getSettings ? videoTrack.getSettings().facingMode : undefined;
                setIsFrontCamera(actualFacingMode !== "environment");
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
        const dataUrl = captureCorrectedFrame(canvasElement);
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

        // 4 separate view sections for the report, in the requested order:
        // Anterior, Posterior, Lateral (Left), Lateral (Right). Same rows as
        // evaluation.measurements (no measurement values changed) -- just
        // grouped by view, same as Module 1's report layout, using the
        // clinical parameter names now returned in each row's "joint" field.
        const viewSections = [
            { label: "Anterior View", rows: evaluation.viewSections?.anterior || [] },
            { label: "Posterior View", rows: evaluation.viewSections?.posterior || [] },
            { label: "Lateral View (Left)", rows: evaluation.viewSections?.leftLateral || [] },
            { label: "Lateral View (Right)", rows: evaluation.viewSections?.rightLateral || [] }
        ];

        setReportPreviewData({
            patient: {
                id: assessment.patient.id,
                patient_id: assessment.patient.patient_id,
                name: assessment.patient.name,
                age: assessment.patient.age,
                gender: assessment.patient.gender,
                session_type: assessment.session_type
            },
            session: {
                date: new Date().toLocaleDateString(),
                module: "BPT2",
                risk_level: evaluation.overallStatus,
                notes: assessment.notes
            },
            measurements: evaluation.measurements,
            viewSections: viewSections,
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
        className: "video-element mirrored",
        muted: true,
        style: { display: "none" }
    }), /*#__PURE__*/React.createElement("canvas", {
        ref: canvasRef,
        className: "canvas-element mirrored",
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
    }, "Module Used : Posture Analysis")), /*#__PURE__*/React.createElement("p", {
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
// Draws simplified reference points/lines relevant to the currently active view,
// for Module 1 (BPT1) ONLY. This intentionally diverges from drawBPT2ViewOverlay
// (used by Module 2 / BPT2, which is left completely unchanged) for the Posterior
// view: instead of an ear-to-ear "head" line/dots, it draws a trunk-alignment line
// (shoulder midpoint -> hip midpoint) parallel to the spine, and keeps the C7 point
// as the "neck" reference instead of the ears.
// --- Squat-depth reference guide + "Correct Posture" notification -----------
// Draws a horizontal green guide line at the hip/knee level (like the
// clinical "Reference Line: Butt-Knee Level" chart) so the patient can
// visually align their hips with their knees on camera, in EVERY view
// (Anterior/Posterior/Right Lateral/Left Lateral). hipY/kneeY are each the
// on-screen (canvas-space) y-coordinate of that view's hip and knee
// reference -- a single point for the lateral views, the L/R average for the
// front/back views. When the two are level (within a small on-screen
// tolerance), a green "CORRECT POSTURE" badge appears at the top of the
// frame. Purely a visual aid layered on top of the existing overlay -- it
// never changes any tracked landmark, angle, or measurement.
//
// Shared by both drawBPT1ViewOverlay and drawBPT2ViewOverlay so the guide
// line/badge behaves identically (and stays in sync) across the live squat
// camera (Module 1) and the 4-view posture scan (Module 2).
//
// Note: the <canvas> this draws onto gets `transform: scaleX(-1)` applied
// via the `.mirrored` CSS class for the selfie-view mirror effect. That flip
// happens AFTER this code runs, so anything drawn here in normal
// left-to-right text orientation ends up displayed backwards/inverted on
// screen. The badge text is drawn inside a local horizontal-flip transform
// (mirrored around its own box center) so it cancels out the outer CSS flip
// and reads correctly to the patient.
const ALIGN_TOLERANCE_PX = 16; // ~3% of the 480px-tall capture frame -- shared, exact measurement used by both Module 1 and Module 2 guides below
// Shared "CORRECT POSTURE" badge, extracted out of the old inline version so
// both the Module 1 squat-depth guide and the Module 2 spinal-alignment guide
// render an identical badge. Counter-flips its own text (see note above) so
// it isn't mirrored/backwards once the canvas's CSS scaleX(-1) is applied.
function drawCorrectPostureBadge(ctx, boxY = 16) {
    const label = "\u2713 CORRECT POSTURE";
    ctx.save();
    ctx.font = "bold 16px 'Outfit', sans-serif";
    const textWidth = ctx.measureText(label).width;
    const padX = 14;
    const boxW = textWidth + padX * 2;
    const boxH = 30;
    const boxX = (640 - boxW) / 2;
    ctx.fillStyle = "rgba(34, 197, 94, 0.92)";
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
    } else {
        ctx.fillRect(boxX, boxY, boxW, boxH);
    }
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    const boxCenterX = boxX + boxW / 2;
    ctx.translate(boxCenterX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-boxCenterX, 0);
    ctx.fillText(label, boxX + padX, boxY + boxH / 2);
    ctx.restore();
}
function drawSquatDepthGuide(ctx, hipY, kneeY) {
    if (hipY === undefined || kneeY === undefined) return;
    const guideY = (hipY + kneeY) / 2;
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, guideY);
    ctx.lineTo(640, guideY);
    ctx.stroke();
    ctx.restore();

    if (Math.abs(hipY - kneeY) <= ALIGN_TOLERANCE_PX) {
        drawCorrectPostureBadge(ctx);
    }
}

// --- Module 2 (BPT2): vertical "ideal spinal alignment" guide ---------------
// Matches the clinical reference mock (head -> shoulder/chest -> waist/hip ->
// knee[ -> ankle] plumb line with dot markers + a "CORRECT POSTURE" badge)
// for the Anterior and Posterior posture-scan views only -- intentionally
// NOT shown on Right Lateral / Left Lateral (removed on request). This is
// Module-2-only -- Module 1's drawBPT1ViewOverlay/drawSquatDepthGuide is
// untouched.
//
// The green line is LIVE-TRACKING, moving with the patient in real time --
// the same way Module 1's hip/knee guide line moves every frame as the
// squat progresses. It runs top-to-bottom through the patient's own tracked
// midline landmarks (head -> knee/ankle), extended in a straight line to
// both screen edges so it's always fully visible, and slides left/right on
// screen as the patient shifts, letting them visually adjust their own
// posture against it in real time. Dot markers sit at each tracked
// landmark. The "CORRECT POSTURE" badge only appears once every landmark on
// the chain lines up with the topmost one (i.e. the patient is standing
// perfectly straight) -- SPINAL_ALIGNMENT_TOLERANCE_PX is intentionally
// much tighter than Module 1's ALIGN_TOLERANCE_PX, so the slightest
// deviation keeps the badge hidden.
const SPINAL_ALIGNMENT_TOLERANCE_PX = 6; // near-perfect alignment only, Module 2 only
function drawSpinalAlignmentGuide(ctx, viewKey, points) {
    if (!points) return;
    const mx = p => 640 - p.x * 640;
    const my = p => p.y * 480;
    const mid = (p1, p2) => (p1 && p2) ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : null;

    let chain;
    if (viewKey === "anterior") {
        chain = [
            mid(points.earL, points.earR),
            mid(points.acromionL, points.acromionR),
            points.sternum,
            points.umbilicus,
            mid(points.asisL, points.asisR),
            mid(points.kneeL, points.kneeR)
        ];
    } else if (viewKey === "posterior") {
        chain = [
            mid(points.earL, points.earR),
            mid(points.acromionL, points.acromionR),
            points.c7,
            mid(points.scapulaInferiorL, points.scapulaInferiorR),
            mid(points.psisL, points.psisR),
            mid(points.kneeL, points.kneeR),
            mid(points.ankleL, points.ankleR)
        ];
    } else if (viewKey === "rightLateral" || viewKey === "leftLateral") {
        // Green spinal-alignment line intentionally not shown for the
        // Lateral views (Module 2 only) -- Anterior/Posterior keep it.
        return;
    } else {
        return;
    }
    chain = chain.filter(Boolean);
    if (chain.length < 2) return;

    // Live-tracking plumb line: follows the patient's own topmost (head)
    // and bottommost (knee/ankle) landmarks every frame, with straight
    // extensions up to y=0 and down to y=480 so it always spans the full
    // screen height no matter where the patient is standing.
    const topPoint = { x: mx(chain[0]), y: 0 };
    const bottomPoint = { x: mx(chain[chain.length - 1]), y: 480 };
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(topPoint.x, topPoint.y);
    chain.forEach(p => ctx.lineTo(mx(p), my(p)));
    ctx.lineTo(bottomPoint.x, bottomPoint.y);
    ctx.stroke();
    ctx.restore();

    // Dot marker at each tracked landmark along the line
    chain.forEach(p => {
        ctx.beginPath();
        ctx.arc(mx(p), my(p), 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#4ade80";
        ctx.fill();
    });

    // Alignment check: how far (in on-screen px) each landmark drifts
    // sideways from the topmost (head) point. Only pops the badge when the
    // patient is essentially perfectly straight -- the slightest deviation
    // keeps it hidden.
    const topX = mx(chain[0]);
    const maxDeviationPx = Math.max(...chain.map(p => Math.abs(mx(p) - topX)));
    if (maxDeviationPx <= SPINAL_ALIGNMENT_TOLERANCE_PX) {
        drawCorrectPostureBadge(ctx);
    }
}
function drawBPT1ViewOverlay(ctx, viewKey, points) {
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
    // Clinical-style "measurement reticle" (ring + crosshair ticks + center dot),
    // used to flag ankle/toe/hand joints as precision grid-alignment points --
    // matching the reticle used on the live squat-camera view.
    const reticle = (p, color) => {
        if (!p) return;
        const x = mx(p), y = my(p);
        const r = 9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - r - 6, y); ctx.lineTo(x - r + 3, y);
        ctx.moveTo(x + r - 3, y); ctx.lineTo(x + r + 6, y);
        ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - r + 3);
        ctx.moveTo(x, y + r - 3); ctx.lineTo(x, y + r + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    };
    // Shared grid-alignment palette
    const ANKLE_COLOR = "#facc15";  // yellow
    const TOE_COLOR = "#38bdf8";    // sky blue
    const HAND_COLOR = "#a78bfa";   // violet

    // --- Squat-depth reference guide + "Correct Posture" notification --------
    // Draws a horizontal green guide line at the hip/knee level (like the
    // clinical "Reference Line: Butt-Knee Level" chart) so the patient can
    // visually align their hips with their knees on camera, in EVERY view
    // (Anterior/Posterior/Right Lateral/Left Lateral). hipY/kneeY are each
    // the on-screen (canvas-space) y-coordinate of that view's hip and knee
    // reference -- a single point for the lateral views, the L/R average for
    // the front/back views. When the two are level (within a small on-screen
    // tolerance), a green "CORRECT POSTURE" badge appears at the top of the
    // frame. Purely a visual aid layered on top of the existing overlay --
    // it never changes any tracked landmark, angle, or measurement.
    const drawDepthGuide = (hipY, kneeY) => drawSquatDepthGuide(ctx, hipY, kneeY);

    if (viewKey === "anterior") {
        if (points.asisL && points.asisR && points.kneeL && points.kneeR) {
            const hipY = (my(points.asisL) + my(points.asisR)) / 2;
            const kneeY = (my(points.kneeL) + my(points.kneeR)) / 2;
            drawDepthGuide(hipY, kneeY);
        }
        line(points.earL, points.earR, "#fb923c");
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.asisL, points.asisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        dot(points.earL, "#fb923c"); dot(points.earR, "#fb923c");
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.asisL, "white"); dot(points.asisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.sternum, "#fbbf24"); dot(points.umbilicus, "#fbbf24"); dot(points.patellaeCenter, "#fbbf24");
    } else if (viewKey === "posterior") {
        // No head/ear line or dots here (Module 1 only) -- replaced with a
        // trunk-alignment line running parallel to the backbone (shoulder
        // midpoint to hip midpoint), plus the C7 "neck" reference point.
        if (points.psisL && points.psisR && points.kneeL && points.kneeR) {
            const hipY = (my(points.psisL) + my(points.psisR)) / 2;
            const kneeY = (my(points.kneeL) + my(points.kneeR)) / 2;
            drawDepthGuide(hipY, kneeY);
        }
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.scapulaInferiorL, points.scapulaInferiorR, "#60a5fa");
        line(points.shoulderMid, points.hipMid, "#f472b6");
        line(points.psisL, points.psisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        // Ankle grid-alignment (yellow) with reticle markers
        line(points.ankleL, points.ankleR, ANKLE_COLOR);
        reticle(points.ankleL, ANKLE_COLOR); reticle(points.ankleR, ANKLE_COLOR);
        // Toe alignment: ankle -> toe segment, with reticle markers at the toes
        line(points.ankleL, points.footL, TOE_COLOR);
        line(points.ankleR, points.footR, TOE_COLOR);
        reticle(points.footL, TOE_COLOR); reticle(points.footR, TOE_COLOR);
        // Hand/wrist joints: shoulder -> wrist reference, with reticle markers
        line(points.acromionL, points.handL, HAND_COLOR);
        line(points.acromionR, points.handR, HAND_COLOR);
        reticle(points.handL, HAND_COLOR); reticle(points.handR, HAND_COLOR);
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.psisL, "white"); dot(points.psisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.c7, "#fbbf24"); // neck point
        dot(points.scapulaInferiorL, "#60a5fa"); dot(points.scapulaInferiorR, "#60a5fa");
    } else if (viewKey === "rightLateral" || viewKey === "leftLateral") {
        const p2 = points.condyle || points.epicondyle;
        // --- Squat depth reference guide (lateral views) --------------------
        // Horizontal green guide line spanning the frame at the hip/knee
        // level, so the patient can visually align the butt joint (hip/
        // trochanter) with the knee joint while squatting on camera --
        // mirrors the clinical "Reference Line: Butt-Knee Level" chart.
        // Purely a visual aid drawn first (underneath the joint dots/lines);
        // it does not affect any tracked value or measurement.
        if (points.trochanter && p2) {
            drawDepthGuide(my(points.trochanter), my(p2));
        }
        line(points.headRef, points.acromion, "#fb923c");
        line(points.acromion, points.trochanter, "rgba(99,102,241,0.9)");
        line(points.trochanter, p2, "rgba(16,185,129,0.9)");
        dot(points.headRef, "#fb923c");
        dot(points.acromion, "white"); dot(points.trochanter, "white"); dot(p2, "white");
        // Ankle grid-alignment: knee -> ankle segment, with reticle marker
        line(p2, points.ankle, ANKLE_COLOR);
        reticle(points.ankle, ANKLE_COLOR);
        // Toe alignment: ankle -> toe segment, with reticle marker
        line(points.ankle, points.foot, TOE_COLOR);
        reticle(points.foot, TOE_COLOR);
        // Hand/wrist joint: shoulder -> wrist reference, with reticle marker
        line(points.acromion, points.hand, HAND_COLOR);
        reticle(points.hand, HAND_COLOR);
    }
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

    // Vertical "ideal spinal alignment" guide (green line + dot markers +
    // CORRECT POSTURE badge), matching the clinical reference mock, for all
    // 4 posture-scan views.
    drawSpinalAlignmentGuide(ctx, viewKey, points);

    if (viewKey === "anterior") {
        line(points.earL, points.earR, "#fb923c");
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.asisL, points.asisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        dot(points.earL, "#fb923c"); dot(points.earR, "#fb923c");
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.asisL, "white"); dot(points.asisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.sternum, "#fbbf24"); dot(points.umbilicus, "#fbbf24"); dot(points.patellaeCenter, "#fbbf24");
    } else if (viewKey === "posterior") {
        line(points.earL, points.earR, "#fb923c");
        line(points.acromionL, points.acromionR, "rgba(99,102,241,0.9)");
        line(points.scapulaInferiorL, points.scapulaInferiorR, "#60a5fa");
        line(points.psisL, points.psisR, "rgba(236,72,153,0.9)");
        line(points.kneeL, points.kneeR, "rgba(16,185,129,0.9)");
        line(points.ankleL, points.ankleR, "rgba(250,204,21,0.9)");
        dot(points.earL, "#fb923c"); dot(points.earR, "#fb923c");
        dot(points.acromionL, "white"); dot(points.acromionR, "white");
        dot(points.psisL, "white"); dot(points.psisR, "white");
        dot(points.kneeL, "white"); dot(points.kneeR, "white");
        dot(points.ankleL, "white"); dot(points.ankleR, "white");
        dot(points.c7, "#fbbf24");
        dot(points.scapulaInferiorL, "#60a5fa"); dot(points.scapulaInferiorR, "#60a5fa");
    } else if (viewKey === "rightLateral" || viewKey === "leftLateral") {
        const p2 = points.condyle || points.epicondyle;
        line(points.headRef, points.acromion, "#fb923c");
        line(points.acromion, points.trochanter, "rgba(99,102,241,0.9)");
        line(points.trochanter, p2, "rgba(16,185,129,0.9)");
        dot(points.headRef, "#fb923c");
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
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Patient Name"), /*#__PURE__*/React.createElement("th", null, "Patient ID"), /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Module"), /*#__PURE__*/React.createElement("th", null, "Overall Postural Profile"), /*#__PURE__*/React.createElement("th", null, "Action"))), /*#__PURE__*/React.createElement("tbody", null, history.map((log, idx) => /*#__PURE__*/React.createElement("tr", {
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
    }, log.patient_id), /*#__PURE__*/React.createElement("td", null, log.date), /*#__PURE__*/React.createElement("td", null, getModuleDisplayName(log.module_type)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
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
    const viewSections = (reportData.viewSections || []).filter(s => s.rows && s.rows.length > 0);
    const interpretation = reportData.interpretation || "";
    const recommendations = reportData.recommendations || [];
    const renderMeasurementTable = rows => /*#__PURE__*/React.createElement("table", {
        className: "report-table"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Parameter"), /*#__PURE__*/React.createElement("th", null, "Side"), /*#__PURE__*/React.createElement("th", null, "Fixed / Normal Angle"), /*#__PURE__*/React.createElement("th", null, "Measured Angle"), /*#__PURE__*/React.createElement("th", null, "Deviation"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((m, idx) => /*#__PURE__*/React.createElement("tr", {
        key: idx
    }, /*#__PURE__*/React.createElement("td", null, m.joint), /*#__PURE__*/React.createElement("td", null, m.side), /*#__PURE__*/React.createElement("td", null, m.fixed || m.reference), /*#__PURE__*/React.createElement("td", {
        style: { fontWeight: 600 }
    }, Math.round(m.angle), "°"), /*#__PURE__*/React.createElement("td", null, m.deviation, "°"), /*#__PURE__*/React.createElement("td", {
        className: m.status.includes("Significant") ? "text-danger" : m.status.includes("Mild") ? "text-warning" : "text-success"
    }, m.status)))));
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
    }, getModuleDisplayName(session.module))), /*#__PURE__*/React.createElement("div", {
        className: "report-meta-row"
    }, /*#__PURE__*/React.createElement("span", {
        className: "report-meta-label"
    }, "Overall Postural Profile:"), /*#__PURE__*/React.createElement("span", {
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
    }))), viewSections.length > 0 ? viewSections.map((section, sIdx) => /*#__PURE__*/React.createElement("div", {
        key: sIdx
    }, /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, section.label), renderMeasurementTable(section.rows))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "report-section-title"
    }, "Biomechanical Joints Summary"), renderMeasurementTable(measurements)), /*#__PURE__*/React.createElement("div", {
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
    }, /*#__PURE__*/React.createElement("span", null, "Generated by PostureFlex Station • "), /*#__PURE__*/React.createElement("span", null, "Assessor Signature: ____________________________"))));
}
// Mount the React Application
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
