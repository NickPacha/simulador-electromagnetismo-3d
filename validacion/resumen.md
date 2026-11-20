| # | Prueba | Métrica | Resultado | Umbral | Estado |
|---|---|---|---|---|---|
| 1 | Potencial de 4 cargas (200 puntos) | error relativo máx. | 8.99e-08  | 1e-07 | ✔ aprobado |
| 2 | Campo eléctrico de 4 cargas (200 puntos) | error relativo máx. | 2.50e-07  | 1e-06 | ✔ aprobado |
| 3 | Dispersión por carga fija: RK4 (JS) vs DOP853 (SciPy) | desviación máx. de posición | 2.87e-08 m | 0.0001 | ✔ aprobado |
| 4 | Dispersión por carga fija | variación relativa de energía | 2.70e-09  | 1e-06 | ✔ aprobado |
| 5 | Orden de convergencia de RK4 | |orden − 4| | 8.01e-02  | 0.15 | ✔ aprobado |
| 6 | Orden de convergencia de Euler | |orden − 1| | 6.24e-02  | 0.15 | ✔ aprobado |
| 7 | Cicloide E×B: Boris vs solución analítica | error máx. / radio | 1.45e-03  | 0.005 | ✔ aprobado |
| 8 | Boris en B puro (10⁵ pasos) | deriva relativa de |v|² | 1.60e-14  | 1e-10 | ✔ aprobado |
| 9 | Circuito mixto: MNA (JS) vs análisis de mallas (NumPy) | error relativo de voltajes | 1.56e-12  | 1e-09 | ✔ aprobado |
| 10 | Biot-Savart: espira (72 seg. del simulador ≈ 64) vs integrales elípticas | error relativo con 64 segmentos | 7.90e-04  | 0.001 | ✔ aprobado |

Orden observado: RK4 = 3.92, Euler = 1.06, Biot-Savart ≈ 2.00. Deriva de energía tras 10⁵ pasos: Boris 1.6e-14, RK4 8.0e-05.