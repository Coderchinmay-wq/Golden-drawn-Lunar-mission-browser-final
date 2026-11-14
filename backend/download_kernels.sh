#!/usr/bin/env bash
set -euo pipefail

# Downloads official NAIF SPICE kernels required for high-precision lunar south pole ephemeris
# using the Mean Earth / Polar Axis (MOON_ME) body-fixed reference frame.

KERNEL_DIR="$(cd "$(dirname "$0")" && pwd)/spice_kernels"
mkdir -p "$KERNEL_DIR"

echo "Downloading NAIF SPICE kernels into $KERNEL_DIR ..."

curl -fL "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls" -o "$KERNEL_DIR/naif0012.tls"
curl -fL "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp" -o "$KERNEL_DIR/de440s.bsp"
curl -fL "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc" -o "$KERNEL_DIR/pck00011.tpc"
curl -fL "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc" -o "$KERNEL_DIR/moon_pa_de440_200625.bpc"
curl -fL "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf" -o "$KERNEL_DIR/moon_de440_250416.tf"

echo "All SPICE kernels downloaded successfully."
ls -lh "$KERNEL_DIR"
