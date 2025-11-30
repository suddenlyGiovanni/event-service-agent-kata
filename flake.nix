{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = nixpkgs.lib.systems.flakeExposed;
      overlays = [
        (import ./nix/overlays_bun-1_3.nix)
        (import ./nix/overlays_biome.nix)
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (system:
          let
            pkgs = import nixpkgs { inherit system overlays; };
          in
          f pkgs
        );
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            biome
            deno
          ];

          # Show bun version each time direnv enters the shell
          shellHook = ''
            # Ensure local node_modules/.bin (root + packages/*) are on PATH
            add_to_path() {
              case ":$PATH:" in
                *":$1:") ;;
                *) PATH="$1:$PATH" ;;
              esac
            }

            # Root node_modules/.bin
            if [ -d "$PWD/node_modules/.bin" ]; then
              add_to_path "$PWD/node_modules/.bin"
            fi

            # Workspaces under packages/*
            for d in "$PWD"/packages/*/node_modules/.bin; do
              if [ -d "$d" ]; then
                add_to_path "$d"
              fi
            done
            export PATH

            if command -v bun >/dev/null 2>&1; then
              echo "bun version: $(bun -v)"
            else
              echo "bun not found in PATH"
            fi
          '';
        };
      });
    };
}
