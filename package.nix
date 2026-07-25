{
  lib,
  stdenvNoCC,
  versionCheckHook,
  # Not in nixpkgs — pass bun2nix.packages.${system}.default from the flake.
  bun2nix,
}:
let
  packageJson = lib.importJSON ./package.json;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./bun.lock
      ./src
    ];
  };
in
stdenvNoCC.mkDerivation {
  pname = packageJson.name;
  inherit (packageJson) version;
  inherit src;

  nativeBuildInputs = [ bun2nix.hook ];

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./nix/bun.nix;
  };

  # Same as `bun run build`: compile a standalone, dependency-free binary
  # rather than shipping node_modules alongside a JS entry point.
  bunBuildFlags = [
    "src/cli/index.ts"
    "--compile"
    "--define"
    "import.meta.vitest=undefined"
    "--outfile"
    packageJson.name
  ];
  # Only "dependencies" are needed to compile the binary.
  bunInstallFlags = [
    "--linker=isolated"
    "--production"
  ]
  ++ lib.optionals stdenvNoCC.hostPlatform.isDarwin [ "--backend=symlink" ];
  # postinstall regenerates nix/bun.nix, which is pointless (and fails) in
  # the sandbox.
  dontRunLifecycleScripts = true;

  doInstallCheck = true;
  nativeInstallCheckInputs = [ versionCheckHook ];

  meta = {
    inherit (packageJson) description homepage;
    license = lib.getLicenseFromSpdxId packageJson.license;
    mainProgram = builtins.head (builtins.attrNames packageJson.bin);
    platforms = import ./nix/systems.nix;
  };
}
