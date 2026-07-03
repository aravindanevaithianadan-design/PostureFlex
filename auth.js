/* PostureFlex Authentication Controller */
(function() {
    const AUTH_KEY = "pf_auth_session";
    
    const PF_Auth = {
        isAuthenticated: function() {
            const session = localStorage.getItem(AUTH_KEY);
            return session !== null;
        },
        
        getUser: function() {
            const session = localStorage.getItem(AUTH_KEY);
            if (session) {
                try {
                    return JSON.parse(session);
                } catch (e) {
                    return null;
                }
            }
            return null;
        },
        
        login: async function(username, password) {
            // A. Try API Login
            try {
                const response = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const sessionData = {
                        token: data.token,
                        username: data.user.username,
                        role: data.user.role,
                        loginTime: new Date().toISOString()
                    };
                    localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
                    return { success: true };
                } else {
                    const err = await response.json();
                    return { success: false, message: err.detail || "Authentication failed." };
                }
            } catch (e) {
                console.warn("Backend auth API not reachable. Checking local default credentials.");
            }
            
            // B. Local Default Credentials Fallback
            if (username === "postureflex" && password === "bptpf01") {
                const sessionData = {
                    token: "pf_local_mock_token_" + Math.random().toString(36).substr(2, 5),
                    username: "postureflex",
                    role: "assessor",
                    loginTime: new Date().toISOString(),
                    isLocalMock: true
                };
                localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
                return { success: true };
            }
            
            return { success: false, message: "Invalid credentials. Use default User ID: postureflex / pwd: bptpf01" };
        },
        
        logout: function() {
            localStorage.removeItem(AUTH_KEY);
            return true;
        }
    };
    
    window.PF_Auth = PF_Auth;
})();
