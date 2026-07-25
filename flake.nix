{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, bun2nix, ... }:
    let
      systems = import ./nix/systems.nix;

      packages = nixpkgs.lib.genAttrs systems (
        system:
        let
          askl = nixpkgs.legacyPackages.${system}.callPackage ./package.nix {
            bun2nix = bun2nix.packages.${system}.default;
          };
        in
        {
          inherit askl;
          default = askl;
        }
      );
    in
    {
      inherit packages;

      checks = nixpkgs.lib.genAttrs systems (system: {
        build = packages.${system}.askl;
      });

      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          # `with pkgs;` puts the list in nixd's "package scope", which is what
          # enables bare-identifier completion and version inlay hints
          default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              bun
              bun2nix.packages.${system}.default
              git
              git-wt
            ];

            shellHook = ''
              # Install when node_modules is missing or the lockfile is newer.
              if [ ! -f node_modules/.bun-install-stamp ] || [ bun.lock -nt node_modules/.bun-install-stamp ]; then
                echo "Installing dependencies..."
                bun install --frozen-lockfile && touch node_modules/.bun-install-stamp
              fi

              # Set up direnv and JS dependencies whenever `git wt` creates a new
              # worktree, so worktrees are usable without a manual step.
              git config --replace-all wt.hook "direnv allow || true; bun install --frozen-lockfile || true"

              # Move deleted worktree directories to the trash instead of `rm -rf`,
              # which is noticeably slower on large node_modules and target trees.
              git config --replace-all wt.remover "${pkgs.trash-cli}/bin/trash"

              # Free the worktree's direnv/nix state before it's deleted.
              git config --replace-all wt.deletehook "direnv revoke .envrc || true; ${pkgs.trash-cli}/bin/trash .direnv || true; nix store gc || true"
            '';
          };
        }
      );
    };
}
