"""
Validación independiente del núcleo físico del simulador.

Compara los resultados que produce el código JavaScript (exportar.mjs) con
soluciones analíticas y con integradores de referencia de SciPy/NumPy.
Genera una tabla resumen (resumen.md), un JSON con las métricas y figuras PNG.

Uso:
    node validacion/exportar.mjs
    python3 validacion/validar.py
"""
import json
import pathlib

import numpy as np
from scipy.integrate import solve_ivp
from scipy.special import ellipe, ellipk
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = pathlib.Path(__file__).parent
FIG = BASE / "figuras"
FIG.mkdir(exist_ok=True)
js = json.loads((BASE / "resultados_js.json").read_text())

K = 8.9875517923e9
MU0 = 1.25663706212e-6
plt.rcParams.update({"figure.dpi": 150, "font.size": 10, "axes.grid": True, "grid.alpha": 0.3})
resumen = []


def registrar(prueba, metrica, valor, umbral, unidad=""):
    ok = valor <= umbral
    resumen.append({"prueba": prueba, "metrica": metrica, "valor": float(valor), "umbral": umbral, "aprobado": bool(ok), "unidad": unidad})
    print(f"[{'OK ' if ok else 'FALLA'}] {prueba}: {metrica} = {valor:.3e} (umbral {umbral:g})")


# ---------------------------------------------------------------- 1. Coulomb
e = js["electro"]
q = np.array([[c["x"], c["y"], c["z"], c["q"]] for c in e["charges"]])
P = np.array(e["points"])
d = P[:, None, :] - q[None, :, :3]
r = np.linalg.norm(d, axis=2)
V_np = (K * q[None, :, 3] / r).sum(axis=1)
E_np = (K * q[None, :, 3, None] * d / r[..., None] ** 3).sum(axis=1)
errV = np.max(np.abs(np.array(e["V"]) - V_np) / np.abs(V_np).max())
errE = np.max(np.linalg.norm(np.array(e["E"]) - E_np, axis=1) / np.linalg.norm(E_np, axis=1))
registrar("Potencial de 4 cargas (200 puntos)", "error relativo máx.", errV, 1e-7)
registrar("Campo eléctrico de 4 cargas (200 puntos)", "error relativo máx.", errE, 1e-6)

# ------------------------------------------------- 2. Trayectoria (dispersión)
s = js["scattering"]
qq, m, Q = s["q"], s["m"], s["Q"]


def f_scat(t, y):
    rr = np.hypot(y[0], y[1])
    a = K * Q * qq / m / rr**3
    return [y[2], y[3], a * y[0], a * y[1]]


t_js = np.array(s["t"])
y_js = np.array(s["y"])
ref = solve_ivp(f_scat, (0, t_js[-1]), s["y0"], method="DOP853", rtol=1e-12, atol=1e-12, t_eval=t_js)
dif = np.max(np.hypot(y_js[:, 0] - ref.y[0], y_js[:, 1] - ref.y[1]))
registrar("Dispersión por carga fija: RK4 (JS) vs DOP853 (SciPy)", "desviación máx. de posición", dif, 1e-4, "m")
Ek = 0.5 * m * (y_js[:, 2] ** 2 + y_js[:, 3] ** 2)
U = K * Q * qq / np.hypot(y_js[:, 0], y_js[:, 1])
dE = np.max(np.abs((Ek + U) - (Ek[0] + U[0]))) / (Ek[0] + U[0])
registrar("Dispersión por carga fija", "variación relativa de energía", dE, 1e-6)

fig, ax = plt.subplots(1, 2, figsize=(10, 4))
ax[0].plot(ref.y[0], ref.y[1], "k-", lw=3, alpha=0.3, label="SciPy DOP853 (referencia)")
ax[0].plot(y_js[:, 0], y_js[:, 1], "C0--", lw=1.5, label="Simulador (RK4, JS)")
ax[0].plot(0, 0, "ro", ms=10, label="carga fija +5 µC")
ax[0].set_xlabel("x (m)"); ax[0].set_ylabel("y (m)"); ax[0].set_aspect("equal"); ax[0].legend(fontsize=8)
ax[0].set_title("Trayectoria de dispersión")
ax[1].plot(t_js, Ek, label="K"); ax[1].plot(t_js, U, label="U = kqQ/r"); ax[1].plot(t_js, Ek + U, "k", label="K + U")
ax[1].set_xlabel("t (s)"); ax[1].set_ylabel("Energía (J)"); ax[1].legend(); ax[1].set_title("Conservación de la energía")
fig.tight_layout(); fig.savefig(FIG / "fig_dispersion.png"); plt.close(fig)

# ------------------------------------------------------ 3. Orden de RK4/Euler
cv = js["convergence"]
h = np.array([c["h"] for c in cv]); e4 = np.array([c["rk4"] for c in cv]); e1 = np.array([c["euler"] for c in cv])
orden4 = np.polyfit(np.log(h), np.log(e4), 1)[0]
# Euler solo alcanza su régimen asintótico con pasos pequeños: se ajusta con los 4 menores
orden1 = np.polyfit(np.log(h[-4:]), np.log(e1[-4:]), 1)[0]
registrar("Orden de convergencia de RK4", "|orden − 4|", abs(orden4 - 4), 0.15)
registrar("Orden de convergencia de Euler", "|orden − 1|", abs(orden1 - 1), 0.15)
fig, ax = plt.subplots(figsize=(5.5, 4))
ax.loglog(h, e1, "o-", label=f"Euler (pendiente {orden1:.2f})")
ax.loglog(h, e4, "s-", label=f"RK4 (pendiente {orden4:.2f})")
ax.set_xlabel("paso h"); ax.set_ylabel("error global en t = 10")
ax.set_title("Convergencia: oscilador armónico"); ax.legend()
fig.tight_layout(); fig.savefig(FIG / "fig_convergencia.png"); plt.close(fig)

# ---------------------------------------------------- 4. Cicloide E × B (Boris)
L = js["lorentz"]
qm, E0, B0 = L["qm"], L["E"][1], L["B"][2]
w = qm * B0
t = np.array(L["t"]); pos = np.array(L["pos"])
xa = (E0 / B0) * (t - np.sin(w * t) / w)
ya = (E0 / (B0 * w)) * (1 - np.cos(w * t))
escala = E0 / (B0 * w)
errC = np.max(np.hypot(pos[:, 0] - xa, pos[:, 1] - ya)) / escala
registrar("Cicloide E×B: Boris vs solución analítica", "error máx. / radio", errC, 5e-3)
fig, ax = plt.subplots(figsize=(7, 3))
ax.plot(xa, ya, "k-", lw=3, alpha=0.3, label="analítica")
ax.plot(pos[:, 0], pos[:, 1], "C3--", label="Boris (JS)")
ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)"); ax.set_title("Protón en E ⊥ B: deriva E×B (cicloide)"); ax.legend()
fig.tight_layout(); fig.savefig(FIG / "fig_cicloide.png"); plt.close(fig)

# Energía en B puro: Boris (JS) vs RK4 (NumPy) con el mismo paso
be = np.array(js["borisEnergy"])
registrar("Boris en B puro (10⁵ pasos)", "deriva relativa de |v|²", np.max(np.abs(be[:, 1])), 1e-10)
qm2 = -1.602176634e-19 / 9.1093837015e-31; Bz = 1e-4
Te = 2 * np.pi / (abs(qm2) * Bz); dt = Te / 100
def acc(v):
    return qm2 * np.array([v[1] * Bz, -v[0] * Bz, 0.0])
v = np.array([2e6, 0, 5e5]); v0 = v @ v; rk = []
for i in range(100001):
    if i % 1000 == 0:
        rk.append([i, v @ v / v0 - 1])
    k1 = acc(v); k2 = acc(v + dt / 2 * k1); k3 = acc(v + dt / 2 * k2); k4 = acc(v + dt * k3)
    v = v + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
rk = np.array(rk)
fig, ax = plt.subplots(figsize=(6, 3.6))
ax.plot(rk[:, 0], rk[:, 1], label="RK4 (mismo paso)")
ax.plot(be[:, 0], be[:, 1], label="Boris (simulador)")
ax.set_xlabel("número de pasos"); ax.set_ylabel("ΔK / K₀"); ax.set_title("Energía de un electrón en B uniforme"); ax.legend()
fig.tight_layout(); fig.savefig(FIG / "fig_energia_boris.png"); plt.close(fig)
deriva_rk4 = abs(rk[-1, 1])

# ------------------------------------------------------------- 5. Circuito
c = js["circuit"]
R1, R2, R3, R4, Vs = 100, 220, 150, 180, 12
A = np.array([[R1 + R2, -R2], [-R2, R2 + R3 + R4]])
i1, i2 = np.linalg.solve(A, [Vs, 0])
v2 = Vs - R1 * i1; v3 = R4 * i2
errN = max(abs(c["nodes"]["2"] - v2) / v2, abs(c["nodes"]["3"] - v3) / v3)
registrar("Circuito mixto: MNA (JS) vs análisis de mallas (NumPy)", "error relativo de voltajes", errN, 1e-9)

# -------------------------------------------- 6. Biot-Savart: espira fuera del eje
lp = js["loop"]
I, a = lp["I"], lp["R"]
x, y, z = lp["point"]
rho = np.hypot(x, y)
al2 = a**2 + rho**2 + z**2 - 2 * a * rho
be2 = a**2 + rho**2 + z**2 + 2 * a * rho
k2 = 1 - al2 / be2
Cc = MU0 * I / np.pi
Brho = Cc * z / (2 * al2 * np.sqrt(be2) * rho) * ((a**2 + rho**2 + z**2) * ellipe(k2) - al2 * ellipk(k2))
Bz = Cc / (2 * al2 * np.sqrt(be2)) * ((a**2 - rho**2 - z**2) * ellipe(k2) + al2 * ellipk(k2))
Bex = np.array([Brho * x / rho, Brho * y / rho, Bz])
ns = np.array([f["n"] for f in lp["field"]])
errs = np.array([np.linalg.norm(np.array(f["B"]) - Bex) / np.linalg.norm(Bex) for f in lp["field"]])
ordenBS = -np.polyfit(np.log(ns), np.log(errs), 1)[0]
registrar("Biot-Savart: espira (72 seg. del simulador ≈ 64) vs integrales elípticas", "error relativo con 64 segmentos", errs[list(ns).index(64)], 1e-3)
fig, ax = plt.subplots(figsize=(5.5, 4))
ax.loglog(ns, errs, "o-", label=f"pendiente ≈ −{ordenBS:.2f}")
ax.set_xlabel("número de segmentos de la espira"); ax.set_ylabel("error relativo de B")
ax.set_title("Biot-Savart vs solución exacta\n(punto fuera del eje)"); ax.legend()
fig.tight_layout(); fig.savefig(FIG / "fig_biot_savart.png"); plt.close(fig)

# ----------------------------------------------------------------- resumen
md = ["| # | Prueba | Métrica | Resultado | Umbral | Estado |", "|---|---|---|---|---|---|"]
for i, rr in enumerate(resumen, 1):
    md.append(f"| {i} | {rr['prueba']} | {rr['metrica']} | {rr['valor']:.2e} {rr['unidad']} | {rr['umbral']:g} | {'✔ aprobado' if rr['aprobado'] else '✘ falla'} |")
md.append("")
md.append(f"Orden observado: RK4 = {orden4:.2f}, Euler = {orden1:.2f}, Biot-Savart ≈ {ordenBS:.2f}. "
          f"Deriva de energía tras 10⁵ pasos: Boris {np.max(np.abs(be[:, 1])):.1e}, RK4 {deriva_rk4:.1e}.")
(BASE / "resumen.md").write_text("\n".join(md), encoding="utf-8")
(BASE / "resultados_validacion.json").write_text(json.dumps({"pruebas": resumen, "orden_rk4": orden4, "orden_euler": orden1, "orden_biot_savart": ordenBS, "deriva_boris": float(np.max(np.abs(be[:, 1]))), "deriva_rk4": float(deriva_rk4)}, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\n{sum(r['aprobado'] for r in resumen)}/{len(resumen)} pruebas aprobadas")
