import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
export function HomeAlerts({ error, loading }) {
    return _jsxs(_Fragment, { children: [error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), loading && _jsx("p", { className: "section-note", children: "Cargando m\u00E9tricas del club..." })] });
}
