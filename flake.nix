{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
          ];

          # Show bun version each time direnv enters the shell
          shellHook = ''
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
