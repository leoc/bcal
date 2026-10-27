{
  description = "bcal: keyboard-driven desktop calendar on top of a local vdir";

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
        electron = pkgs.electron;
      in
      {
        packages.default = pkgs.buildNpmPackage {
          pname = "bcal";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = pkgs.lib.cleanSource ./.;
          npmDepsHash = "sha256-HmXjd7Rd1NyQC4Jw3qe9XDwRYkoGkXQFLZuwRK/xVUc=";
          nodejs = pkgs.nodejs_22;

          # Electron comes from nixpkgs; the npm package only provides typings
          env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
          npmBuildScript = "build";

          nativeBuildInputs = [
            pkgs.makeWrapper
            pkgs.copyDesktopItems
          ];

          # electron-vite bundles every dependency, so no node_modules
          installPhase = ''
            runHook preInstall
            mkdir -p $out/share/bcal
            cp -r out package.json $out/share/bcal/
            makeWrapper ${pkgs.lib.getExe electron} $out/bin/bcal \
              --add-flags $out/share/bcal \
              --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto}}"
            install -Dm755 scripts/toggle $out/libexec/bcal/toggle
            makeWrapper $out/libexec/bcal/toggle $out/bin/bcal-toggle \
              --set BCAL_BIN $out/bin/bcal \
              --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.jq ]}
            runHook postInstall
          '';

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "bcal";
              desktopName = "bcal";
              genericName = "Calendar";
              comment = "Keyboard-driven calendar on a local vdir";
              exec = "bcal";
              icon = "x-office-calendar";
              categories = [
                "Office"
                "Calendar"
              ];
              startupWMClass = "bcal";
            })
          ];

          meta = {
            description = "Keyboard-driven desktop calendar on top of a local vdir (CalDAV via pimsync)";
            license = pkgs.lib.licenses.mit;
            mainProgram = "bcal";
            platforms = pkgs.lib.platforms.linux;
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            electron
          ];

          # The prebuilt Electron binary from npm does not run on NixOS. Use the
          # nixpkgs build instead; keep the npm `electron` version on the same
          # major so typings and runtime match.
          shellHook = ''
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export ELECTRON_OVERRIDE_DIST_PATH=${electron}/bin
            # electron-vite (dev/preview) looks for the binary on its own
            export ELECTRON_EXEC_PATH=${electron}/bin/electron
            # vdir root synced by pimsync (see ~/.nixos-config calendar.nix)
            export BCAL_VDIR=''${BCAL_VDIR:-$HOME/.calendar}
          '';
        };
      }
    );
}
