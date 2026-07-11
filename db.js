/* PostureFlex Data Client (Fully Client-Side, LocalStorage Only, No Backend Required) */
(function () {

    const PF_DB = {
        // Kept for compatibility with the UI; this build has no cloud/Supabase sync.
        isSupabaseConnected: function () {
            return false;
        },
        setupSupabase: function () {
            return false;
        },

        // 1. Save Patient
        savePatient: async function (patientData) {
            let localPatients = JSON.parse(localStorage.getItem("pf_patients") || "[]");
            let existingIndex = localPatients.findIndex(p => p.patient_id === patientData.patient_id);

            if (existingIndex >= 0) {
                localPatients[existingIndex] = { ...localPatients[existingIndex], ...patientData };
                localStorage.setItem("pf_patients", JSON.stringify(localPatients));
                return { success: true, data: localPatients[existingIndex] };
            } else {
                const uuidVal = "local_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 9);
                const newPatient = {
                    id: uuidVal,
                    ...patientData,
                    created_at: new Date().toISOString()
                };
                localPatients.push(newPatient);
                localStorage.setItem("pf_patients", JSON.stringify(localPatients));
                return { success: true, data: newPatient };
            }
        },

        // 2. Get Patients
        getPatients: async function () {
            return JSON.parse(localStorage.getItem("pf_patients") || "[]");
        },

        // 3. Save Session
        // sessionData includes: patient_uuid, session_type, module_type, risk_level, notes, measurements, interpretation, recommendations
        saveSession: async function (sessionData) {
            let localSessions = JSON.parse(localStorage.getItem("pf_sessions") || "[]");
            const sid = "session_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 9);

            const newSession = {
                session_id: sid,
                date: new Date().toISOString().split('T')[0],
                ...sessionData,
                created_at: new Date().toISOString()
            };

            localSessions.push(newSession);
            localStorage.setItem("pf_sessions", JSON.stringify(localSessions));
            return { success: true, session_id: sid };
        },

        // 4. Get Assessment History
        getHistory: async function () {
            let localSessions = JSON.parse(localStorage.getItem("pf_sessions") || "[]");
            let localPatients = JSON.parse(localStorage.getItem("pf_patients") || "[]");

            return localSessions.map(s => {
                const pat = localPatients.find(p => p.id === s.patient_uuid || p.patient_id === s.patient_uuid) || {};
                return {
                    session_id: s.session_id,
                    date: s.date,
                    session_type: s.session_type,
                    module_type: s.module_type,
                    risk_level: s.risk_level,
                    session_notes: s.notes,
                    patient_id: pat.patient_id || "Unknown",
                    patient_name: pat.name || "Unknown",
                    patient_age: pat.age || 0,
                    patient_gender: pat.gender || "Unknown",
                    assessor_name: pat.assessor_name || "Unknown",
                    interpretation: s.interpretation || "",
                    recommendations: s.recommendations || [],
                    measurements: s.measurements || [],
                    viewSections: s.viewSections || []
                };
            }).reverse();
        }
    };

    window.PF_DB = PF_DB;
})();
