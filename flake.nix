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
