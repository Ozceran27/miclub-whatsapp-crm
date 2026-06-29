import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { apiUrl } from './api';
export default function LoginScreen({ onAuthenticated }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const response = await fetch(apiUrl('/auth/login'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.authenticated) {
                setError(payload?.message ?? 'No se pudo iniciar sesión. Revisá tus credenciales.');
                return;
            }
            onAuthenticated(payload.username ?? null);
        }
        catch {
            setError('No se pudo conectar con el servidor local.');
        }
        finally {
            setIsLoading(false);
        }
    };
    return (_jsx("main", { className: "login-page", children: _jsxs("section", { className: "login-card", "aria-labelledby": "login-title", children: [_jsxs("div", { className: "login-brand", children: [_jsx("img", { src: "/logo/miClub - Logo trans.png", alt: "miClub", className: "login-logo" }), _jsx("p", { className: "eyebrow", children: "Acceso seguro" }), _jsx("h1", { id: "login-title", children: "miClub Gesti\u00F3n" }), _jsx("p", { children: "Acceso al panel operativo del club" })] }), _jsxs("form", { className: "login-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Usuario", _jsx("input", { autoComplete: "username", value: username, onChange: (event) => setUsername(event.target.value), disabled: isLoading, required: true })] }), _jsxs("label", { children: ["Contrase\u00F1a", _jsx("input", { type: "password", autoComplete: "current-password", value: password, onChange: (event) => setPassword(event.target.value), disabled: isLoading, required: true })] }), error && _jsx("p", { className: "login-error", role: "alert", children: error }), _jsx("button", { className: "login-submit", type: "submit", disabled: isLoading, children: isLoading ? 'Ingresando…' : 'Ingresar' })] })] }) }));
}
