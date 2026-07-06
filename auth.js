/* PostureFlex Authentication Controller (Fully Client-Side, No Backend Required) */
(function () {
    const AUTH_KEY = "pf_auth_session";

    const PF_Auth = {
        isAuthenticated: function () {
            const session = localStorage.getItem(AUTH_KEY);
            return session !== null;
        },

        getUser: function () {
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

        login: async function (username, password) {
            // Default local credentials (no backend/API involved)
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

            return { success: false, message: "Invalid credentials. Enter valid username & password" };
        },

        logout: function () {
            localStorage.removeItem(AUTH_KEY);
            return true;
        }
    };

    window.PF_Auth = PF_Auth;
})();
