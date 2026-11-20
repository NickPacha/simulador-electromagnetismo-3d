// Algoritmo "marching squares": extrae curvas de nivel (equipotenciales)
// de un campo escalar muestreado en una malla regular.

/**
 * values: Float64Array de nx*ny (fila j, columna i => values[j*nx+i])
 * Devuelve una lista de segmentos [[x1,y1,x2,y2], ...] en coordenadas de malla.
 */
export function marchingSquares(values, nx, ny, level) {
  const segs = [];
  const interp = (a, b, va, vb) => (va === vb ? 0.5 : (level - va) / (vb - va));
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = values[j * nx + i];           // abajo-izq
      const v1 = values[j * nx + i + 1];       // abajo-der
      const v2 = values[(j + 1) * nx + i + 1]; // arriba-der
      const v3 = values[(j + 1) * nx + i];     // arriba-izq
      let idx = 0;
      if (v0 > level) idx |= 1;
      if (v1 > level) idx |= 2;
      if (v2 > level) idx |= 4;
      if (v3 > level) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      // puntos de cruce en cada arista
      const e = [
        [i + interp(0, 1, v0, v1), j],         // arista inferior
        [i + 1, j + interp(0, 1, v1, v2)],     // arista derecha
        [i + 1 - interp(0, 1, v2, v3), j + 1], // arista superior
        [i, j + 1 - interp(0, 1, v3, v0)],     // arista izquierda
      ];
      const add = (a, b) => segs.push([e[a][0], e[a][1], e[b][0], e[b][1]]);
      switch (idx) {
        case 1: case 14: add(3, 0); break;
        case 2: case 13: add(0, 1); break;
        case 3: case 12: add(3, 1); break;
        case 4: case 11: add(1, 2); break;
        case 5: add(3, 2); add(0, 1); break; // casos ambiguos (silla)
        case 6: case 9: add(0, 2); break;
        case 7: case 8: add(3, 2); break;
        case 10: add(3, 0); add(1, 2); break;
      }
    }
  }
  return segs;
}
