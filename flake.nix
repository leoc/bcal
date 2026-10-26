{
  description = "bcal dev shell: Node.js 22, Electron from nixpkgs";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            pkgs.electron
          ];

          # The prebuilt Electron binary from npm does not run on NixOS. Use the
          # nixpkgs build instead; keep the npm `electron` version on the same
          # major so typings and runtime match.
          shellHook = ''
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export ELECTRON_OVERRIDE_DIST_PATH=${pkgs.electron}/bin
            # electron-vite (dev/preview) looks for the binary on its own
            export ELECTRON_EXEC_PATH=${pkgs.electron}/bin/electron
            # vdir root synced by pimsync (see ~/.nixos-config calendar.nix)
            export BCAL_VDIR=''${BCAL_VDIR:-$HOME/.calendar}
          '';
        };
      }
    );
}
