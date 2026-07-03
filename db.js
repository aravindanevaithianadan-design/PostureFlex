/* PostureFlex Database & Sync Client */
(function() {
    const API_BASE = ""; // Relative to server
    
    // Check if Supabase keys are available in localStorage (user configured)
    let supabaseClient = null;
    const localUrl = localStorage.getItem("SUPABASE_URL");
    const localKey = localStorage.getItem("SUPABASE_KEY");
    
    if (localUrl && localKey && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(localUrl, localKey);
            console.log("Supabase Client initialized from browser settings.");
        } catch (e) {
            console.error("Failed to initialize Supabase client in browser:", e);
        }
    }
    const PF_DB = {
        isSupabaseConnected: function() {
            return supabaseClient !== null;
        },
        
        setupSupabase: function(url, key) {
            if (!url || !key) {
                supabaseClient = null;
                localStorage.removeItem("SUPABASE_URL");
                localStorage.removeItem("SUPABASE_KEY");
                return false;
            }
            try {
                supabaseClient = window.supabase.createClient(url, key);
                localStorage.setItem("SUPABASE_URL", url);
                localStorage.setItem("SUPABASE_KEY", key);
                return true;
            } catch (e) {
                console.error("Error setting up Supabase:", e);
                return false;
            }
        },
        // 1. Save Patient
        savePatient: async function(patientData) {
            // A. If Supabase is connected directly in frontend
            if (supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('patients')
                        .upsert([{
                            patient_id: patientData.patient_id,
                            name: patientData.name,
                            age: parseInt(patientData.age),
                            gender: patientData.gender,
                            notes: patientData.notes || "",
                            assessor_name: patientData.assessor_name
                        }], { onConflict: 'patient_id' })
                        .select();
                    
                    if (error) throw error;
                    return { success: true, data: data[0] };
                } catch (err) {
                    console.warn("Supabase patient insert failed, trying local fallback:", err);
                }
            }
            
            // B. Try Backend API
            try {
                const response = await fetch(`${API_BASE}/api/patients`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patientData)
                });
                if (response.ok) {
                    const data = await response.json();
                    return { success: true, data };
                }
            } catch (e) {
                console.warn("Backend API not reachable for patient saving. Using LocalStorage.");
            }
            
            // C. LocalStorage Fallback
            let localPatients = JSON.parse(localStorage.getItem("pf_patients") || "[]");
            let existingIndex = localPatients.findIndex(p => p.patient_id === patientData.patient_id);
            const uuidVal = "local_" + Math.random().toString(36).substr(2, 9);
            
            const newPatient = {
                id: uuidVal,
                ...patientData,
                created_at: new Date().toISOString()
            };
            
            if (existingIndex >= 0) {
                localPatients[existingIndex] = { ...localPatients[existingIndex], ...patientData };
                localStorage.setItem("pf_patients", JSON.stringify(localPatients));
                return { success: true, data: localPatients[existingIndex] };
            } else {
                localPatients.push(newPatient);
                localStorage.setItem("pf_patients", JSON.stringify(localPatients));
                return { success: true, data: newPatient };
            }
        },
        // 2. Get Patients
        getPatients: async function() {
            if (supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('patients')
                        .select('*')
                        .order('created_at', { ascending: false });
                    if (!error) return data;
                } catch (e) {
                    console.warn("Supabase fetch patients failed:", e);
                }
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/patients`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (e) {
                console.warn("Backend API fetch patients failed.");
            }
            
            return JSON.parse(localStorage.getItem("pf_patients") || "[]");
        },
        // 3. Save Session
        saveSession: async function(sessionData) {
            // sessionData includes: patient_uuid, session_type, module_type, risk_level, notes, measurements, interpretation, recommendations
            
            if (supabaseClient) {
                try {
                    // Save Session
                    const { data: sData, error: sErr } = await supabaseClient
                        .from('sessions')
                        .insert([{
                            patient_uuid: sessionData.patient_uuid,
                            session_type: sessionData.session_type,
                            module_type: sessionData.module_type,
                            risk_level: sessionData.risk_level,
                            notes: sessionData.notes || ""
                        }])
                        .select();
                        
                    if (sErr) throw sErr;
                    const sessionUuid = sData[0].id;
                    
                    // Save Measurements
                    const measToInsert = sessionData.measurements.map(m => ({
                        session_id: sessionUuid,
                        joint_name: `${m.side} ${m.joint}`.trim(),
                        measured_angle: parseFloat(m.angle),
                        reference_range: m.reference,
                        deviation: parseFloat(m.deviation),
                        status: m.status
                    }));
                    
                    const { error: mErr } = await supabaseClient
                        .from('measurements')
                        .insert(measToInsert);
                        
                    if (mErr) throw mErr;
                    
                    // Save Report
                    const { error: rErr } = await supabaseClient
                        .from('reports')
                        .insert([{
                            session_id: sessionUuid,
                            interpretation: sessionData.interpretation,
                            recommendations: sessionData.recommendations.join("\n")
                        }]);
                        
                    if (rErr) throw rErr;
                    
                    return { success: true, session_id: sessionUuid };
                } catch (err) {
                    console.warn("Supabase session insert failed, trying backend:", err);
                }
            }
            
            // Backend API
            try {
                const response = await fetch(`${API_BASE}/api/sessions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(sessionData)
                });
                if (response.ok) {
                    return { success: true, ...await response.json() };
                }
            } catch (e) {
                console.warn("Backend API session insert failed. Storing in local storage.");
            }
            
            // LocalStorage fallback
            let localSessions = JSON.parse(localStorage.getItem("pf_sessions") || "[]");
            const sid = "session_" + Math.random().toString(36).substr(2, 9);
            
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
        getHistory: async function() {
            if (supabaseClient) {
                try {
                    // Fetch join sessions and patients (note: supabase handles nested queries)
                    const { data, error } = await supabaseClient
                        .from('sessions')
                        .select(`
                            id, date, session_type, module_type, risk_level, notes,
                            patients ( patient_id, name, age, gender, assessor_name ),
                            reports ( interpretation, recommendations ),
                            measurements ( joint_name, measured_angle, reference_range, deviation, status )
                        `)
                        .order('created_at', { ascending: false });
                        
                    if (!error) {
                        return data.map(item => {
                            const patient = item.patients || {};
                            const report = (item.reports && item.reports[0]) || {};
                            const measurements = (item.measurements || []).map(m => {
                                let side = "Center";
                                let joint = m.joint_name;
                                if (m.joint_name.startsWith("Left ")) {
                                    side = "Left";
                                    joint = m.joint_name.substring(5);
                                } else if (m.joint_name.startsWith("Right ")) {
                                    side = "Right";
                                    joint = m.joint_name.substring(6);
                                }
                                return {
                                    joint: joint,
                                    side: side,
                                    angle: m.measured_angle,
                                    reference: m.reference_range,
                                    deviation: m.deviation,
                                    status: m.status
                                };
                            });
                            
                            return {
                                session_id: item.id,
                                date: item.date,
                                session_type: item.session_type,
                                module_type: item.module_type,
                                risk_level: item.risk_level,
                                session_notes: item.notes,
                                patient_id: patient.patient_id,
                                patient_name: patient.name,
                                patient_age: patient.age,
                                patient_gender: patient.gender,
                                assessor_name: patient.assessor_name,
                                interpretation: report.interpretation || "",
                                recommendations: report.recommendations ? report.recommendations.split("\n") : [],
                                measurements: measurements
                            };
                        });
                    }
                } catch (e) {
                    console.warn("Supabase fetch history failed:", e);
                }
            }
            
            // Backend API
            try {
                const response = await fetch(`${API_BASE}/api/history`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (e) {
                console.warn("Backend API fetch history failed. Reading local storage.");
            }
            
            // LocalStorage fallback
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
                    measurements: s.measurements || []
                };
            }).reverse();
        }
    };
    
    window.PF_DB = PF_DB;
})();
