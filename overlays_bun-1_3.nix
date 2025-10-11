final: prev:
let
  version = "1.3.0"; # bump when needed
  system = prev.stdenv.hostPlatform.system;

  urls = {
    x86_64-linux = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64.zip";
    aarch64-linux = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-aarch64.zip";
    aarch64-darwin = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-darwin-aarch64.zip";
  };

  # Fill the SRI hash (sha256-...) for your system after the first attempt.
  hashes = {
    # Example:
    aarch64-darwin = "sha256-hYSOP5ZIHvyr51pQD9O5S5u5VoaretCjiSl2x74VA2o=";
  };
in {
  bun = prev.bun.overrideAttrs (old: {
    inherit version;
    src = prev.fetchurl {
      url = urls.${system} or (throw "Unsupported system: ${system}");
      # Use fakeHash (SRI) so Nix tells you the real "sha256-..." to paste into `hashes` above.
      hash = hashes.${system} or prev.lib.fakeHash;
    };
    meta = old.meta // {
      changelog = "https://bun.sh/blog/bun-v${version}";
      # Only claim support for the current host to avoid needing hashes for all platforms.
      platforms = [ system ];
    };
  });
}
