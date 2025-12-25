final: prev: let
  version = "2.3.10"; # bump when needed
  system = prev.stdenv.hostPlatform.system;

  # Binary name mapping for each platform
  binaryNames = {
    x86_64-linux = "biome-linux-x64";
    aarch64-linux = "biome-linux-arm64";
    x86_64-darwin = "biome-darwin-x64";
    aarch64-darwin = "biome-darwin-arm64";
  };

  # SRI hashes for each platform (from GitHub release asset digests)
  # After first attempt with fakeHash, paste the real sha256-... here
  hashes = {
    aarch64-darwin = "sha256-rcERVbVFV7qrlJg3ZHLnNxrFynmKFccTQhLR7RxKEQI=";
    # x86_64-darwin = "sha256-...";  # Add when needed
    # x86_64-linux = "sha256-...";   # Add when needed
    # aarch64-linux = "sha256-...";  # Add when needed
  };

  binaryName = binaryNames.${system} or (throw "Unsupported system: ${system}");
in {
  biome = prev.stdenv.mkDerivation {
    pname = "biome";
    inherit version;

    src = prev.fetchurl {
      url = "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%40${version}/${binaryName}";
      hash = hashes.${system} or prev.lib.fakeHash;
    };

    # No build needed - it's a pre-built binary
    dontUnpack = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall
      install -D -m755 $src $out/bin/biome
      runHook postInstall
    '';

    meta = {
      description = "Toolchain of the web";
      homepage = "https://biomejs.dev/";
      changelog = "https://github.com/biomejs/biome/blob/@biomejs/biome@${version}/CHANGELOG.md";
      license = prev.lib.licenses.mit;
      mainProgram = "biome";
      # Only claim support for the current host to avoid needing hashes for all platforms.
      platforms = [system];
    };
  };
}
