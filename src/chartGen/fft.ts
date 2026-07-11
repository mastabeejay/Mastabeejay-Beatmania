/** In-place iterative radix-2 Cooley-Tukey FFT. `real`/`imag` length must be a power of two. */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tempReal = real[i];
      real[i] = real[j];
      real[j] = tempReal;
      const tempImag = imag[i];
      imag[i] = imag[j];
      imag[j] = tempImag;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      const half = len / 2;
      for (let j = 0; j < half; j++) {
        const ur = real[i + j];
        const ui = imag[i + j];
        const vr = real[i + j + half] * curWr - imag[i + j + half] * curWi;
        const vi = real[i + j + half] * curWi + imag[i + j + half] * curWr;
        real[i + j] = ur + vr;
        imag[i + j] = ui + vi;
        real[i + j + half] = ur - vr;
        imag[i + j + half] = ui - vi;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}
